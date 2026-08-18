"""Source-aware random sampling without caching sampled result pages."""

from __future__ import annotations

import math
import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .._lib.booru_query import normalize_tag_query
from .adapters import BooruAdapter, DanbooruAdapter, GalleryPage, GalleryPostSummary
from .danbooru_query import danbooru_query_tag_count

DANBOORU_BOUND_PROBE_SIZE = 60


@dataclass(frozen=True)
class _DanbooruProbeResult:
    bounds: tuple[int, int] | None
    small_set: tuple[GalleryPostSummary, ...] | None
    latest: GalleryPage | None


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


async def _fetch_danbooru_count(
    adapter: DanbooruAdapter,
    session: Any,
    query: str,
    ratings: list[str],
    credentials: dict[str, str],
) -> int | None:
    auth = adapter.auth_params(credentials)
    tags = normalize_tag_query(query)
    if ratings:
        tags = f"{tags} rating:{','.join(ratings)}".strip()
    try:
        raw = await adapter._get_json(session, f"{adapter.base}/counts/posts.json", params={"tags": tags, **auth})
        if isinstance(raw, dict) and isinstance(raw.get("counts"), dict):
            count = raw["counts"].get("posts")
            if isinstance(count, (int, float)):
                return max(0, int(count))
    except Exception:
        return None
    return None


async def _danbooru_probe(
    adapter: DanbooruAdapter,
    session: Any,
    query: str,
    ratings: list[str],
    credentials: dict[str, str],
    blacklist: tuple[str, ...],
    cache: Any,
) -> _DanbooruProbeResult:
    key = repr((adapter.source, "id-probe", query, tuple(ratings), _danbooru_account_identity(credentials), blacklist))
    cached = cache.get(key)
    if cached is not None:
        return cached

    latest = await adapter.search(session, query, ratings, "latest", "1", DANBOORU_BOUND_PROBE_SIZE, credentials, blacklist)
    latest_ids = [int(post.post_id) for post in latest.posts if str(post.post_id).isdigit()]
    if not latest_ids:
        result = _DanbooruProbeResult(bounds=None, small_set=(), latest=latest)
        cache.put(key, result)
        return result

    if len(latest.posts) < DANBOORU_BOUND_PROBE_SIZE or latest.ended:
        result = _DanbooruProbeResult(bounds=None, small_set=latest.posts, latest=latest)
        cache.put(key, result)
        return result

    oldest = await adapter.search_id_cursor(session, query, ratings, "a0", DANBOORU_BOUND_PROBE_SIZE, credentials, blacklist)
    oldest_ids = [int(post.post_id) for post in oldest.posts if str(post.post_id).isdigit()]
    if not oldest_ids:
        result = _DanbooruProbeResult(bounds=None, small_set=latest.posts, latest=oldest if oldest.warnings else latest)
        cache.put(key, result)
        return result

    min_oldest, max_oldest = min(oldest_ids), max(oldest_ids)
    min_latest, max_latest = min(latest_ids), max(latest_ids)

    if max_oldest >= min_latest:
        seen: set[str] = set()
        merged: list[GalleryPostSummary] = []
        for post in (*latest.posts, *oldest.posts):
            if post.post_id not in seen:
                seen.add(post.post_id)
                merged.append(post)
        result = _DanbooruProbeResult(bounds=None, small_set=tuple(merged), latest=latest)
        cache.put(key, result)
        return result

    bounds = (min_oldest, max_latest)
    result = _DanbooruProbeResult(bounds=bounds, small_set=None, latest=latest)
    cache.put(key, result)
    return result


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
    probe = await _danbooru_probe(adapter, session, normalized_query, rating_key, credentials, blacklist, cache)

    if probe.small_set is not None:
        posts = list(probe.small_set)
        secrets.SystemRandom().shuffle(posts)
        warnings = probe.latest.warnings if probe.latest else ()
        return GalleryPage(tuple(posts[:limit]), None, True, warnings, page=1, total=len(probe.small_set))

    if probe.bounds is None:
        if not blacklist:
            return probe.latest or GalleryPage((), None, True)
        return await adapter.search(session, normalized_query, rating_key, "latest", "1", limit, credentials, blacklist)

    oldest_id, latest_id = probe.bounds
    for _ in range(3):
        target_id = oldest_id + secrets.randbelow(latest_id - oldest_id + 1)
        direction = "b" if secrets.randbelow(2) == 0 else "a"
        result = await adapter.search_id_cursor(session, normalized_query, rating_key, f"{direction}{target_id}", limit, credentials, blacklist)
        if result.posts or result.warnings:
            return result
        opposite_direction = "a" if direction == "b" else "b"
        result_opp = await adapter.search_id_cursor(session, normalized_query, rating_key, f"{opposite_direction}{target_id}", limit, credentials, blacklist)
        if result_opp.posts or result_opp.warnings:
            return result_opp

    if probe.latest is not None:
        return probe.latest
    return await adapter.search(session, normalized_query, rating_key, "latest", "1", limit, credentials, blacklist)


async def _sample_danbooru_two_tags(
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
    count_key = repr((adapter.source, "counts", normalized_query, tuple(rating_key), _danbooru_account_identity(credentials)))
    total = cache.get(count_key)
    if total is None:
        total = await _fetch_danbooru_count(adapter, session, normalized_query, rating_key, credentials)
        if total is not None:
            cache.put(count_key, total)

    if total is not None and total > 0:
        page_size = min(max(1, limit), adapter.capabilities.max_page_size)
        page_count = min(1000, max(1, math.ceil(total / page_size)))
        page = secrets.randbelow(page_count) + 1
        return await adapter.search(session, normalized_query, rating_key, "latest", str(page), limit, credentials, blacklist)

    return await _sample_danbooru_ids(adapter, session, query, ratings, limit, credentials, blacklist, cache)


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
        return await _sample_danbooru_two_tags(adapter, session, query, ratings, limit, credentials, blacklist, cache)
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
        return await adapter.search(session, f"fav:{credentials['username']}", [], "random", None, limit, credentials, blacklist)
    if adapter.source == "gelbooru" and credentials.get("userId"):
        return await adapter.search(session, f"fav:{credentials['userId']}", [], "random", None, limit, credentials, blacklist)
    return await adapter.list_favorites(session, None, limit, credentials, blacklist)
