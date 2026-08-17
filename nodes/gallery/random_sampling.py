"""Source-aware random sampling without caching sampled result pages."""

from __future__ import annotations

import math
import secrets
from collections.abc import Awaitable, Callable
from typing import Any

from .._lib.booru_query import normalize_tag_query
from .adapters import BooruAdapter, GalleryPage
from .danbooru_query import danbooru_query_tag_count


DANBOORU_MAX_INDEXED_PAGE = 1000
_DANBOORU_UNKNOWN_COUNT = -1


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


async def _sample_danbooru_pages(
    adapter: BooruAdapter,
    session: Any,
    query: str,
    ratings: list[str],
    limit: int,
    credentials: dict[str, str],
    blacklist: tuple[str, ...],
    count_cache: Any,
) -> GalleryPage:
    normalized_query = normalize_tag_query(query)
    rating_key = tuple(sorted(set(ratings)))
    key = repr((adapter.source, "search", normalized_query, rating_key, limit, _danbooru_account_identity(credentials)))
    cached_total = count_cache.get(key)
    if cached_total is None:
        total = await adapter.search_count(session, normalized_query, list(rating_key), credentials)
        count_cache.put(key, _DANBOORU_UNKNOWN_COUNT if total is None else total)
    else:
        total = None if cached_total == _DANBOORU_UNKNOWN_COUNT else cached_total

    if total is None:
        # Danbooru returns counts.posts=null when an exact count exceeds its
        # execution budget. The result query is still valid, so sample within
        # the server's indexed-page window instead of treating that timeout as
        # malformed data. An out-of-range draw falls back to the first page.
        page = secrets.randbelow(DANBOORU_MAX_INDEXED_PAGE) + 1
        result = await adapter.search(session, normalized_query, list(rating_key), "latest", str(page), limit, credentials, blacklist)
        if page > 1 and result.ended and not result.posts:
            return await adapter.search(session, normalized_query, list(rating_key), "latest", "1", limit, credentials, blacklist)
        return result

    # Danbooru rejects indexed pages above 1000, so generated page numbers must
    # stay within that server boundary.
    page_count = min(DANBOORU_MAX_INDEXED_PAGE, max(1, math.ceil(max(0, total) / limit)))
    page = secrets.randbelow(page_count) + 1
    return await adapter.search(session, normalized_query, list(rating_key), "latest", str(page), limit, credentials, blacklist)


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
    tag_limit = adapter.capabilities.max_search_tags
    if adapter.source == "danbooru" and tag_limit is not None and danbooru_query_tag_count(query) == tag_limit:
        # Danbooru counts random:<limit> as a tag. Sample an exact-query page when
        # both public search slots are already occupied.
        return await _sample_danbooru_pages(adapter, session, query, ratings, limit, credentials, blacklist, count_cache)
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
