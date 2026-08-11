"""Source-aware random sampling without caching sampled result pages."""

from __future__ import annotations

import math
import secrets
from collections.abc import Awaitable, Callable
from typing import Any

from .adapters import BooruAdapter, GalleryPage


async def _sample_paginated(
    cache: Any,
    cache_key: tuple[Any, ...],
    page_size: int,
    fetch: Callable[[int], Awaitable[GalleryPage]],
) -> GalleryPage:
    key = repr(cache_key)
    total = cache.get(key)
    first_page = None
    if total is None:
        first_page = await fetch(1)
        total = first_page.total if first_page.total is not None else len(first_page.posts)
        cache.put(key, total)
    page_count = max(1, math.ceil(max(0, total) / page_size))
    page = secrets.randbelow(page_count) + 1
    if page == 1 and first_page is not None:
        return first_page
    return await fetch(page)


async def sample_search(
    adapter: BooruAdapter,
    session: Any,
    query: str,
    ratings: list[str],
    limit: int,
    credentials: dict[str, str],
    blacklist: tuple[str, ...],
    count_cache: Any,
) -> GalleryPage:
    if adapter.source == "aitag":
        # AI TAG validates page_size >= 60, so the adapter always uses its maximum page size.
        page_size = adapter.capabilities.max_page_size
        return await _sample_paginated(
            count_cache,
            (adapter.source, "search", query),
            page_size,
            lambda page: adapter.search(session, query, ratings, "new", str(page), limit, credentials, blacklist),
        )
    return await adapter.search(session, query, ratings, "random", None, limit, credentials, blacklist)


async def sample_ranking(
    adapter: BooruAdapter,
    session: Any,
    period: str,
    ratings: list[str],
    limit: int,
    credentials: dict[str, str],
    blacklist: tuple[str, ...],
    count_cache: Any,
) -> GalleryPage:
    if adapter.source == "aitag":
        page_size = adapter.capabilities.max_page_size
        return await _sample_paginated(
            count_cache,
            (adapter.source, "ranking", period),
            page_size,
            lambda page: adapter.ranking(session, period, str(page), limit, credentials, blacklist),
        )
    return await adapter.ranking(session, period, None, limit, credentials, blacklist)


async def sample_favorites(
    adapter: BooruAdapter,
    session: Any,
    limit: int,
    credentials: dict[str, str],
    blacklist: tuple[str, ...],
) -> GalleryPage:
    if adapter.source == "danbooru" and credentials.get("username"):
        return await adapter.search(session, f"ordfav:{credentials['username']}", [], "random", None, limit, credentials, blacklist)
    if adapter.source == "gelbooru" and credentials.get("userId"):
        return await adapter.search(session, f"fav:{credentials['userId']}", [], "random", None, limit, credentials, blacklist)
    return await adapter.list_favorites(session, None, limit, credentials, blacklist)
