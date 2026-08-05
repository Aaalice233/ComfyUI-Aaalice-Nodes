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


class MediaProxy:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self._session: aiohttp.ClientSession | None = None
        self._session_timeout: int | None = None
        self._host_semaphores: dict[str, asyncio.Semaphore] = {}
        self._inflight: dict[str, asyncio.Task] = {}

    def session(self) -> aiohttp.ClientSession:
        timeout = get_gallery_settings_store().load()["timeout"]
        current = self._session
        if current is None or self._session_timeout != timeout:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout), trust_env=True)
            self._session_timeout = timeout
            if current is not None:
                asyncio.get_running_loop().create_task(self._retire(current))
        return self._session

    async def _retire(self, session: aiohttp.ClientSession) -> None:
        await asyncio.sleep(SESSION_RETIRE_SECONDS)
        await session.close()

    async def close(self) -> None:
        session = self._session
        self._session = None
        self._session_timeout = None
        if session is not None:
            await session.close()

    async def fetch_media(self, source: str, url: str, validate_url: Callable[[str], None]) -> tuple[bytes, str, str]:
        validate_url(url)
        cached = await self._read_cache(url)
        if cached is not None:
            return cached
        inflight = self._inflight.get(url)
        if inflight is None:
            inflight = asyncio.create_task(self._download(source, url, validate_url))
            self._inflight[url] = inflight
        try:
            return await inflight
        finally:
            self._inflight.pop(url, None)

    async def _download(self, source: str, url: str, validate_url: Callable[[str], None]) -> tuple[bytes, str, str]:
        current = url
        for _redirect in range(MAX_REDIRECTS):
            validate_url(current)
            host = aiohttp.client_reqrep.URL(current).host or ""
            semaphore = self._host_semaphores.setdefault(host, asyncio.Semaphore(6))
            async with semaphore, self.session().get(current, allow_redirects=False, headers={"Accept": "image/*"}) as response:
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.headers.get("Location")
                    if not location:
                        raise RuntimeError(f"{source} media redirect has no Location header")
                    current = urljoin(current, location)
                    continue
                if response.status >= 400:
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
