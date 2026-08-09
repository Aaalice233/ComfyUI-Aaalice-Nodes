"""Media proxy for Booru Gallery: shared connection pool, disk cache, dedup.

Thumbnail loading is the hottest Gallery path: every card image is proxied
from the upstream site through the ComfyUI server. Each proxied request used
to create a fresh aiohttp.ClientSession (full DNS + TCP + TLS handshake per
image) with no on-disk cache, so a 60-image first screen serialized ~10
rounds of ~2.5s under the browser's 6-connection per-origin limit. This
module owns the persistent session, the URL-keyed disk cache, and in-flight
deduplication so concurrent card requests for the same URL download once.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
from pathlib import Path
from typing import Callable
from urllib.parse import urljoin

import aiohttp

from .settings import get_gallery_settings_store

STATIC_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_MEDIA_BYTES = 256 * 1024 * 1024
# Larger media (e.g. original images) pass through without disk caching so
# they cannot crowd the shared cache budget.
MAX_CACHED_BYTES = 32 * 1024 * 1024
MAX_REDIRECTS = 6
# Grace period before closing a retired session so in-flight downloads finish.
SESSION_RETIRE_SECONDS = 60


class _MediaUpstreamError(RuntimeError):
    """Transient upstream failure (5xx) that may succeed on retry."""


class _LoopMediaState:
    """aiohttp objects bound to one event loop. ComfyUI serves the frontend
    on the server loop but runs async node execution on a separate execution
    loop; sharing a ClientSession, Semaphore or Task across them raises
    "Timeout context manager should be used inside a task" or loop-binding
    errors, so every loop gets its own session, semaphores and dedup table."""

    def __init__(self):
        self.session: aiohttp.ClientSession | None = None
        self.session_timeout: int | None = None
        self.host_semaphores: dict[str, asyncio.Semaphore] = {}
        self.inflight: dict[str, asyncio.Task] = {}


class MediaProxy:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self._states: dict[asyncio.AbstractEventLoop, _LoopMediaState] = {}

    def _state(self) -> _LoopMediaState:
        loop = asyncio.get_running_loop()
        state = self._states.get(loop)
        if state is None:
            state = _LoopMediaState()
            self._states[loop] = state
        return state

    def session(self) -> aiohttp.ClientSession:
        state = self._state()
        timeout = get_gallery_settings_store().load()["timeout"]
        current = state.session
        if current is None or state.session_timeout != timeout:
            connector = aiohttp.TCPConnector(ttl_dns_cache=300, keepalive_timeout=45)
            state.session = aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=timeout), trust_env=True)
            state.session_timeout = timeout
            if current is not None:
                asyncio.get_running_loop().create_task(self._retire(current))
        return state.session

    async def _retire(self, session: aiohttp.ClientSession) -> None:
        await asyncio.sleep(SESSION_RETIRE_SECONDS)
        await session.close()

    async def close(self) -> None:
        states = self._states
        self._states = {}
        current_loop = asyncio.get_running_loop()
        for loop, state in states.items():
            session = state.session
            if session is None:
                continue
            if loop is current_loop and not loop.is_closed():
                await session.close()
            else:
                # 其他 loop 的 session 无法在当前 loop 关闭；detach 避免析构告警。
                session.detach()

    async def fetch_media(self, source: str, url: str, validate_url: Callable[[str], None], request_headers: dict[str, str] | None = None) -> tuple[bytes, str, str]:
        validate_url(url)
        cached = await self._read_cache(url)
        if cached is not None:
            return cached
        state = self._state()
        inflight = state.inflight.get(url)
        if inflight is None:
            inflight = asyncio.create_task(self._download(state, source, url, validate_url, request_headers))
            state.inflight[url] = inflight

            def _finish(finished):
                state.inflight.pop(url, None)
                # 所有等待者都取消时任务异常无人检索，这里消费掉避免 asyncio 警告。
                if not finished.cancelled():
                    finished.exception()

            inflight.add_done_callback(_finish)
        # 客户端断开只取消本次等待；共享下载继续完成并写入缓存，避免快速滚动时
        # 同一 URL 反复全量重下。
        return await asyncio.shield(inflight)

    async def _download(self, state: _LoopMediaState, source: str, url: str, validate_url: Callable[[str], None], request_headers: dict[str, str] | None) -> tuple[bytes, str, str]:
        # Transient upstream failures (5xx, timeouts, connection drops) retry with
        # backoff; 4xx stays a hard error because it usually means a real miss.
        for attempt in range(3):
            try:
                return await self._fetch_once(state, source, url, validate_url, request_headers)
            except (aiohttp.ClientError, TimeoutError, _MediaUpstreamError) as exc:
                if attempt >= 2:
                    raise RuntimeError(f"{source} media GET {url} failed after {attempt + 1} attempts: {exc}") from exc
                await asyncio.sleep(0.5 * (attempt + 1))

    async def _fetch_once(self, state: _LoopMediaState, source: str, url: str, validate_url: Callable[[str], None], request_headers: dict[str, str] | None) -> tuple[bytes, str, str]:
        current = url
        headers = {"Accept": "image/*", **(request_headers or {})}
        for _redirect in range(MAX_REDIRECTS):
            validate_url(current)
            host = aiohttp.client_reqrep.URL(current).host or ""
            semaphore = state.host_semaphores.setdefault(host, asyncio.Semaphore(6))
            async with semaphore, self.session().get(current, allow_redirects=False, headers=headers) as response:
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.headers.get("Location")
                    if not location:
                        raise RuntimeError(f"{source} media redirect has no Location header")
                    current = urljoin(current, location)
                    continue
                if response.status >= 400:
                    if response.status >= 500 or response.status == 429:
                        raise _MediaUpstreamError(f"{source} media GET {current} HTTP {response.status}")
                    raise RuntimeError(f"{source} media GET {current} HTTP {response.status}")
                content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
                if content_type not in STATIC_CONTENT_TYPES:
                    raise ValueError(f"{source} media returned unsupported Content-Type: {content_type or 'missing'}")
                declared = int(response.headers.get("Content-Length", "0") or 0)
                if declared > MAX_MEDIA_BYTES:
                    raise ValueError(f"{source} media exceeds {MAX_MEDIA_BYTES} bytes")
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.content.iter_chunked(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_MEDIA_BYTES:
                        raise ValueError(f"{source} media exceeds {MAX_MEDIA_BYTES} bytes")
                    chunks.append(chunk)
                data = b"".join(chunks)
                await self._write_cache(url, content_type, data)
                return data, content_type, current
        raise ValueError(f"{source} media redirected too many times")

    def _cache_path(self, url: str) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        return self.cache_dir / "media" / f"{digest}.bin"

    def cached_media_file(self, url: str) -> tuple[str, Path, int] | None:
        """Locate a disk-cached body for streaming: returns (content_type, path,
        body_offset) so the HTTP route can send the file without loading it into
        memory. Only the short header line is read here."""
        path = self._cache_path(url)
        if not path.exists():
            return None
        try:
            with open(path, "rb") as stream:
                header = stream.readline(256)
        except OSError:
            return None
        content_type = header.rstrip(b"\n").decode("ascii", errors="ignore")
        if not content_type or content_type not in STATIC_CONTENT_TYPES:
            return None
        return content_type, path, len(header)

    async def _read_cache(self, url: str) -> tuple[bytes, str, str] | None:
        path = self._cache_path(url)
        if not path.exists():
            return None
        try:
            payload = await asyncio.to_thread(path.read_bytes)
        except OSError:
            return None
        header, _, body = payload.partition(b"\n")
        if not header:
            return None
        try:
            content_type = header.decode("ascii")
        except UnicodeDecodeError:
            return None
        return body, content_type, url

    async def _write_cache(self, url: str, content_type: str, data: bytes) -> None:
        if len(data) > MAX_CACHED_BYTES:
            return
        path = self._cache_path(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
        await asyncio.to_thread(temporary.write_bytes, f"{content_type}\n".encode("ascii") + data)
        os.replace(temporary, path)

    def prune(self) -> None:
        budget = get_gallery_settings_store().load()["cacheBudgetMiB"] * 1024 * 1024
        roots = (self.cache_dir / "media", self.cache_dir / "originals")
        files = []
        for root in roots:
            if root.exists():
                files.extend(item for item in root.rglob("*.bin") if item.is_file())
        files.sort(key=lambda item: item.stat().st_atime)
        total = sum(item.stat().st_size for item in files)
        for item in files:
            if total <= budget:
                break
            size = item.stat().st_size
            item.unlink(missing_ok=True)
            total -= size

    def clear(self) -> None:
        root = self.cache_dir / "media"
        if root.exists():
            for item in root.rglob("*.bin"):
                item.unlink(missing_ok=True)
