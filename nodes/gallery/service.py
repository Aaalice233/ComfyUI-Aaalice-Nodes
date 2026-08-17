"""Gallery orchestration, bounded caches, media security, and execution downloads."""

from __future__ import annotations

import asyncio
import hashlib
import io
import os
import sqlite3
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Generic, TypeVar

import numpy as np
import torch
from PIL import Image, ImageOps

from .adapters import ADAPTERS, GalleryPage, GalleryPostDetail, adapter_for, rating_matches
from .media import MediaProxy
from .random_sampling import sample_favorites, sample_ranking, sample_search
from .settings import get_gallery_settings_store

T = TypeVar("T")


class TTLCache(Generic[T]):
    def __init__(self, maximum: int, ttl: float):
        self.maximum = maximum
        self.ttl = ttl
        self._items: OrderedDict[str, tuple[float, T]] = OrderedDict()

    def get(self, key: str) -> T | None:
        item = self._items.get(key)
        if item is None:
            return None
        created, value = item
        if time.monotonic() - created > self.ttl:
            self._items.pop(key, None)
            return None
        self._items.move_to_end(key)
        return value

    def put(self, key: str, value: T) -> T:
        self._items[key] = (time.monotonic(), value)
        self._items.move_to_end(key)
        while len(self._items) > self.maximum:
            self._items.popitem(last=False)
        return value

    def clear(self) -> None:
        self._items.clear()


class TagCategoryCache:
    """Small on-demand SQLite cache; never performs whole-site synchronization."""

    def __init__(self, path: Path, maximum: int = 100_000):
        self.path = path
        self.maximum = maximum
        self._lock = threading.RLock()

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.execute("CREATE TABLE IF NOT EXISTS tag_category (source TEXT NOT NULL, tag TEXT NOT NULL, category TEXT NOT NULL, accessed REAL NOT NULL, PRIMARY KEY(source, tag))")
        return connection

    def get_many(self, source: str, tags: list[str]) -> dict[str, str]:
        if not tags:
            return {}
        with self._lock, self._connect() as connection:
            result: dict[str, str] = {}
            for offset in range(0, len(tags), 400):
                chunk = tags[offset:offset + 400]
                placeholders = ",".join("?" for _ in chunk)
                rows = connection.execute(f"SELECT tag, category FROM tag_category WHERE source=? AND tag IN ({placeholders})", [source, *chunk]).fetchall()
                result.update({tag: category for tag, category in rows})
            if result:
                connection.executemany("UPDATE tag_category SET accessed=? WHERE source=? AND tag=?", [(time.time(), source, tag) for tag in result])
            return result

    def put_many(self, source: str, categories: dict[str, tuple[str, ...]]) -> None:
        now = time.time()
        rows = [(source, tag, category, now) for category, tags in categories.items() for tag in tags]
        if not rows:
            return
        with self._lock, self._connect() as connection:
            connection.executemany("INSERT INTO tag_category(source, tag, category, accessed) VALUES(?, ?, ?, ?) ON CONFLICT(source, tag) DO UPDATE SET category=excluded.category, accessed=excluded.accessed", rows)
            count = connection.execute("SELECT COUNT(*) FROM tag_category").fetchone()[0]
            if count > self.maximum:
                connection.execute("DELETE FROM tag_category WHERE rowid IN (SELECT rowid FROM tag_category ORDER BY accessed ASC LIMIT ?)", (count - self.maximum,))

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()


class GalleryService:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.search_cache: TTLCache[Any] = TTLCache(64, 300)
        self.normalized_query_cache: TTLCache[str] = TTLCache(64, 300)
        self.random_sampling_cache: TTLCache[Any] = TTLCache(64, 300)
        self.detail_cache: TTLCache[GalleryPostDetail] = TTLCache(512, 86400)
        self.tag_cache = TagCategoryCache(cache_dir / "tag_categories.sqlite3")
        self._media = MediaProxy(cache_dir)
        self._execution_semaphore = asyncio.Semaphore(3)

    def sources(self) -> list[dict[str, Any]]:
        return [adapter.capabilities.json() for adapter in ADAPTERS.values()]

    def _credentials(self, source: str) -> dict[str, str]:
        return get_gallery_settings_store().load()["credentials"].get(source, {})

    def _blacklist(self) -> tuple[str, ...]:
        return tuple(get_gallery_settings_store().load()["blacklist"])

    async def search(self, source: str, query: str, ratings: list[str], sort: str,
                     cursor: str | None, limit: int, page: int | None = None,
                     random_mode: bool = False) -> dict[str, Any]:
        adapter = adapter_for(source)
        invalid_ratings = set(ratings) - set(adapter.capabilities.ratings)
        if invalid_ratings:
            raise ValueError(f"{source} does not support ratings: {', '.join(sorted(invalid_ratings))}")
        if page is not None and not random_mode:
            if not adapter.capabilities.page_jump:
                raise ValueError(f"{source} does not support direct page navigation")
            cursor = adapter.cursor_for_page(page)
        limit = min(max(1, int(limit)), adapter.capabilities.max_page_size)
        blacklist = self._blacklist()
        credentials = self._credentials(source)
        session = self._media.session()
        normalized_key = repr((source, query))
        normalized = self.normalized_query_cache.get(normalized_key)
        if normalized is None:
            normalized = await adapter.normalize_tag_query(session, query, credentials)
            self.normalized_query_cache.put(normalized_key, normalized)
        if random_mode:
            result = await sample_search(adapter, session, normalized, ratings, limit, credentials, blacklist, self.random_sampling_cache)
            return result.json()
        key = repr((source, normalized, tuple(ratings), sort, cursor, limit, blacklist))
        cached = self.search_cache.get(key)
        if cached is not None:
            return cached.json()
        result = await adapter.search(session, normalized, ratings, sort, cursor, limit, credentials, blacklist)
        self.search_cache.put(key, result)
        return result.json()

    async def ranking(self, source: str, period: str, ratings: list[str], cursor: str | None,
                      limit: int, page: int | None = None, random_mode: bool = False) -> dict[str, Any]:
        adapter = adapter_for(source)
        if period not in adapter.capabilities.ranking_periods:
            raise ValueError(f"{source} does not support {period} rankings")
        invalid_ratings = set(ratings) - set(adapter.capabilities.ratings)
        if invalid_ratings:
            raise ValueError(f"{source} does not support ratings: {', '.join(sorted(invalid_ratings))}")
        if page is not None and not random_mode:
            if not adapter.capabilities.page_jump:
                raise ValueError(f"{source} does not support direct page navigation")
            cursor = adapter.cursor_for_page(page)
        limit = min(max(1, int(limit)), adapter.capabilities.max_page_size)
        blacklist = self._blacklist()
        key = repr(("ranking", source, period, tuple(ratings), cursor, limit, blacklist))
        session = self._media.session()
        credentials = self._credentials(source)
        if random_mode:
            result = await sample_ranking(adapter, session, period, ratings, limit, credentials, blacklist, self.random_sampling_cache)
        else:
            cached = self.search_cache.get(key)
            if cached is not None:
                return cached.json()
            result = await adapter.ranking(session, period, cursor, limit, credentials, blacklist)
        if ratings:
            result = GalleryPage(tuple(post for post in result.posts if rating_matches(source, post.rating, ratings)),
                                 result.next_cursor, result.ended, result.warnings, result.page, result.total)
        if not random_mode:
            self.search_cache.put(key, result)
        return result.json()

    async def detail(self, source: str, post_id: str) -> dict[str, Any]:
        key = f"{source}:{post_id}"
        cached = self.detail_cache.get(key)
        if cached is not None:
            return cached.json()
        adapter = adapter_for(source)
        session = self._media.session()
        detail = await adapter.get_post(session, post_id, self._credentials(source))
        if not detail.complete:
            raw_tags = [tag for values in detail.tags.values() for tag in values]
            cached = await asyncio.to_thread(self.tag_cache.get_many, source, raw_tags)
            missing = [tag for tag in raw_tags if tag not in cached]
            classified = await adapter.classify_tags(session, missing, self._credentials(source)) if missing else {}
            if classified:
                await asyncio.to_thread(self.tag_cache.put_many, source, classified)
            for category, tags in classified.items():
                for tag in tags:
                    cached[tag] = category
            grouped = {category: [] for category in ("artist", "copyright", "character", "general", "meta")}
            for tag in raw_tags:
                grouped[cached.get(tag, "general")].append(tag)
            detail = GalleryPostDetail(
                source=detail.source, post_id=detail.post_id, post_url=detail.post_url, preview_url=detail.preview_url,
                width=detail.width, height=detail.height, rating=detail.rating, created_at=detail.created_at,
                favorite=detail.favorite, media_url=detail.media_url, sample_url=detail.sample_url,
                file_ext=detail.file_ext, file_size=detail.file_size,
                tags={key: tuple(value) for key, value in grouped.items()}, complete=bool(detail.media_url),
            )
        if detail.media_url:
            adapter.validate_media_url(detail.media_url)
        if detail.sample_url:
            adapter.validate_media_url(detail.sample_url)
        self.detail_cache.put(key, detail)
        return detail.json()

    async def test_credentials(self, source: str, temporary: dict[str, str] | None = None) -> dict[str, Any]:
        adapter = adapter_for(source)
        credentials = dict(self._credentials(source))
        for key, value in (temporary or {}).items():
            if value:
                credentials[key] = value
        session = self._media.session()
        return await adapter.test_credentials(session, credentials)

    async def favorites(self, source: str, cursor: str | None, limit: int, page: int | None = None,
                        random_mode: bool = False) -> dict[str, Any]:
        adapter = adapter_for(source)
        if page is not None and not random_mode:
            if not adapter.capabilities.page_jump:
                raise ValueError(f"{source} does not support direct page navigation")
            cursor = adapter.cursor_for_page(page)
        limit = min(max(1, int(limit)), adapter.capabilities.max_page_size)
        blacklist = self._blacklist()
        credentials = self._credentials(source)
        if random_mode:
            result = await sample_favorites(adapter, self._media.session(), limit, credentials, blacklist)
            return result.json()
        key = repr(("favorites", source, cursor, limit, blacklist))
        cached = self.search_cache.get(key)
        if cached is not None:
            return cached.json()
        result = await adapter.list_favorites(self._media.session(), cursor, limit, credentials, blacklist)
        self.search_cache.put(key, result)
        return result.json()

    async def set_favorite(self, source: str, post_id: str, favorite: bool) -> dict[str, Any]:
        adapter = adapter_for(source)
        session = self._media.session()
        state = await adapter.set_favorite(session, post_id, favorite, self._credentials(source))
        cached = self.detail_cache.get(f"{source}:{post_id}")
        if cached is not None:
            self.detail_cache._items.pop(f"{source}:{post_id}", None)
        return {"favorite": state}

    async def fetch_media(self, source: str, url: str) -> tuple[bytes, str, str]:
        adapter = adapter_for(source)
        return await self._media.fetch_media(source, url, adapter.validate_media_url, adapter.media_request_headers())

    def cached_media_file(self, source: str, url: str) -> tuple[str, Path, int] | None:
        adapter = adapter_for(source)
        adapter.validate_media_url(url)
        return self._media.cached_media_file(url)

    def _cache_path(self, source: str, post_id: str, url: str) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        safe_id = "".join(character for character in post_id if character.isalnum() or character in "-_") or "post"
        return self.cache_dir / "originals" / source / f"{safe_id}-{digest}.bin"

    async def execution_bytes(self, source: str, post_id: str, url: str) -> bytes:
        path = self._cache_path(source, post_id, url)
        async with self._execution_semaphore:
            if path.exists():
                os.utime(path, None)
                return await asyncio.to_thread(path.read_bytes)
            data, _content_type, _final_url = await self.fetch_media(source, url)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
            await asyncio.to_thread(temporary.write_bytes, data)
            os.replace(temporary, path)
            await asyncio.to_thread(self._media.prune)
            return data

    def clear_caches(self) -> None:
        self.search_cache.clear()
        self.normalized_query_cache.clear()
        self.random_sampling_cache.clear()
        self.detail_cache.clear()
        self.tag_cache.clear()
        self._media.clear()
        root = self.cache_dir / "originals"
        if root.exists():
            for item in root.rglob("*.bin"):
                item.unlink(missing_ok=True)

    async def close(self) -> None:
        await self._media.close()

    @staticmethod
    def decode_image(data: bytes) -> torch.Tensor:
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            array = np.asarray(image, dtype=np.float32) / 255.0
            return torch.from_numpy(array)[None, ...]


_service: GalleryService | None = None


def get_gallery_service() -> GalleryService:
    global _service
    if _service is None:
        import folder_paths
        _service = GalleryService(Path(folder_paths.get_user_directory()) / "aaalice-nodes" / "booru-gallery-cache")
    return _service
