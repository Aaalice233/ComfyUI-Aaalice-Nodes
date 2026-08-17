"""Source-aware random sampling without caching sampled result pages."""

from __future__ import annotations

import math
import secrets
from collections.abc import Awaitable, Callable
from typing import Any

from .._lib.booru_query import normalize_tag_query
from .adapters import BooruAdapter, DanbooruAdapter, GalleryPage
from .danbooru_query import danbooru_query_tag_count


DANBOORU_BOUND_PROBE_SIZE = 60


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


def _danbooru_account_identity(credentials: dict[str, str]) -> tuple[str, str]:
    username = str(credentials.get("username", "")).strip()
    api_key = str(credentials.get("apiKey", "")).strip()
    return ("authenticated", username.casefold()) if username and api_key else ("anonymous", "")


async def _danbooru_id_bounds(
    adapter: DanbooruAdapter,
    session: Any,
    query: str,
    ratings: list[str],
    credentials: dict[str, str],
    cache: Any,
) -> tuple[tuple[int, int] | None, GalleryPage | None]:
    key = repr((adapter.source, "id-bounds", query, tuple(ratings), _danbooru_account_identity(credentials)))
    cached = cache.get(key)
    if cached is not None:
        return cached, None

    latest = await adapter.search(session, query, ratings, "latest", "1", DANBOORU_BOUND_PROBE_SIZE, credentials, ())
    latest_ids = [int(post.post_id) for post in latest.posts if str(post.post_id).isdigit()]
    if not latest_ids:
        return None, latest
    oldest = await adapter.search_id_cursor(session, query, ratings, "a0", DANBOORU_BOUND_PROBE_SIZE, credentials, ())
    oldest_ids = [int(post.post_id) for post in oldest.posts if str(post.post_id).isdigit()]
    if not oldest_ids:
        return None, oldest if oldest.warnings else latest
    bounds = (min(oldest_ids), max(latest_ids))
    cache.put(key, bounds)
    return bounds, latest


async def _sample_danbooru_ids(
    adapter: DanbooruAdapter,
    session: Any,
    query: str,
    ratings: list[str],
    limit: int,
    credentials: dict[str, str],
    blacklist: tuple[str, ...],
    cache: Any,
) -> GalleryPage:
    normalized_query = normalize_tag_query(query)
    rating_key = list(sorted(set(ratings)))
    bounds, latest = await _danbooru_id_bounds(adapter, session, normalized_query, rating_key, credentials, cache)
    if bounds is None:
        if not blacklist:
            return latest
        return await adapter.search(session, normalized_query, rating_key, "latest", "1", limit, credentials, blacklist)
    oldest_id, latest_id = bounds
    before_id = oldest_id + secrets.randbelow(latest_id - oldest_id + 1) + 1
    result = await adapter.search_id_cursor(session, normalized_query, rating_key, f"b{before_id}", limit, credentials, blacklist)
    if result.posts or result.warnings:
        return result
    if latest is not None and not blacklist:
        return latest
    return await adapter.search(session, normalized_query, rating_key, "latest", "1", limit, credentials, blacklist)


async def sample_search(
    adapter: BooruAdapter,
    session: Any,
    query: str,
    ratings: list[str],
    limit: int,
    credentials: dict[str, str],
    blacklist: tuple[str, ...],
    cache: Any,
) -> GalleryPage:
    if adapter.source == "aitag":
        # AI TAG validates page_size >= 60, so the adapter always uses its maximum page size.
        page_size = adapter.capabilities.max_page_size
        return await _sample_paginated(
            cache,
            (adapter.source, "search", query),
            page_size,
            lambda page: adapter.search(session, query, ratings, "new", str(page), limit, credentials, blacklist),
        )
    tag_limit = adapter.capabilities.max_search_tags
    if isinstance(adapter, DanbooruAdapter) and tag_limit is not None and danbooru_query_tag_count(query) == tag_limit:
        # Numeric deep pages force expensive OFFSET scans on broad intersections.
        # ID cursors preserve the exact two-tag query while using Danbooru's indexed pagination.
        return await _sample_danbooru_ids(adapter, session, query, ratings, limit, credentials, blacklist, cache)
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
