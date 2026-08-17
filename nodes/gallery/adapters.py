"""Capability-based adapters for supported booru APIs."""

from __future__ import annotations

import asyncio
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import aiohttp

from .._lib.booru_query import join_candidates, repair_spaced_tags, tokenize_tag_query
from .danbooru_query import build_danbooru_search_tags

TAG_CATEGORIES = ("artist", "copyright", "character", "general", "meta")
STATIC_IMAGE_EXTENSIONS = frozenset({"jpg", "jpeg", "png", "webp", "gif"})
GALLERY_USER_AGENT = "Aaalice-Nodes/1.0"


def _api_headers(accept: str) -> dict[str, str]:
    # Danbooru challenges aiohttp's generic Python identity; identify the real client instead.
    return {"Accept": accept, "User-Agent": GALLERY_USER_AGENT}


class GalleryUpstreamTimeoutError(RuntimeError):
    """The remote server killed the query for exceeding its execution budget."""

    code = "upstream_timeout"


class GalleryTLSCertificateError(RuntimeError):
    """TLS peer verification failed and must not be bypassed or retried."""

    code = "tls_certificate_error"


def _is_upstream_query_timeout(status: int, body: str) -> bool:
    # Danbooru cancels oversized result sets (e.g. order:score over millions of
    # posts) with ActiveRecord::QueryCanceled; retrying cannot help.
    return status >= 400 and ("QueryCanceled" in body or "timed out running your query" in body)


def _is_rate_limited(status: int, body: str) -> bool:
    # booru sites answer intermittent 404s and XML "API limited due to abuse"
    # bodies while throttling; both are worth a bounded retry.
    return status == 404 or "API limited due to abuse" in body


@dataclass(frozen=True)
class GalleryCapabilities:
    source: str
    display_name: str
    ratings: tuple[str, ...]
    sort_values: tuple[str, ...]
    pagination: str
    max_page_size: int
    auth_fields: tuple[str, ...]
    categorized_tags: bool
    favorite_read: bool
    favorite_write: bool
    ranking_periods: tuple[str, ...] = ()
    page_jump: bool = True
    detail_hydration: bool = True
    download: bool = True
    auth_required: bool = False
    tag_search: bool = False
    max_search_tags: int | None = None
    credentials_url: str = ""

    def json(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "displayName": self.display_name,
            "ratings": list(self.ratings),
            "sortValues": list(self.sort_values),
            "pagination": self.pagination,
            "maxPageSize": self.max_page_size,
            "authFields": list(self.auth_fields),
            "categorizedTags": self.categorized_tags,
            "favoriteRead": self.favorite_read,
            "favoriteWrite": self.favorite_write,
            "rankingPeriods": list(self.ranking_periods),
            "pageJump": self.page_jump,
            "detailHydration": self.detail_hydration,
            "download": self.download,
            "authRequired": self.auth_required,
            "tagSearch": self.tag_search,
            "maxSearchTags": self.max_search_tags,
            "credentialsUrl": self.credentials_url,
        }


@dataclass(frozen=True)
class GalleryPostSummary:
    source: str
    post_id: str
    post_url: str
    preview_url: str
    width: int
    height: int
    rating: str
    created_at: str = ""
    favorite: bool | None = None
    sample_url: str = ""
    score: int = 0
    fav_count: int = 0

    def json(self) -> dict[str, Any]:
        data = asdict(self)
        data["postId"] = data.pop("post_id")
        data["postUrl"] = data.pop("post_url")
        data["previewUrl"] = data.pop("preview_url")
        data["createdAt"] = data.pop("created_at")
        data["sampleUrl"] = data.pop("sample_url")
        data["favCount"] = data.pop("fav_count")
        return data


@dataclass(frozen=True)
class GalleryPostDetail(GalleryPostSummary):
    media_url: str = ""
    file_ext: str = ""
    file_size: int = 0
    tags: dict[str, tuple[str, ...]] = field(default_factory=dict)
    complete: bool = True

    def json(self) -> dict[str, Any]:
        data = super().json()
        data.update({"mediaUrl": self.media_url, "fileExt": self.file_ext, "fileSize": self.file_size,
                     "tags": {key: list(value) for key, value in self.tags.items()}, "complete": self.complete})
        return data


@dataclass(frozen=True)
class GalleryPage:
    posts: tuple[GalleryPostSummary, ...]
    next_cursor: str | None
    ended: bool
    warnings: tuple[str, ...] = ()
    page: int = 1
    total: int | None = None

    def json(self) -> dict[str, Any]:
        return {"posts": [post.json() for post in self.posts], "nextCursor": self.next_cursor,
                "ended": self.ended, "warnings": list(self.warnings), "page": self.page}


class BooruAdapter:
    source = ""
    capabilities: GalleryCapabilities
    media_hosts: frozenset[str] = frozenset()

    def __init__(self) -> None:
        self._semaphore = asyncio.Semaphore(2)

    async def _get_json(self, session: aiohttp.ClientSession, url: str, *, params: dict[str, Any] | None = None) -> Any:
        async with self._semaphore:
            for attempt in range(3):
                try:
                    async with session.get(url, params=params, headers=_api_headers("application/json"), allow_redirects=True) as response:
                        text = await response.text()
                        if _is_upstream_query_timeout(response.status, text):
                            raise GalleryUpstreamTimeoutError(f"{self.source} aborted the query: the result set exceeded its execution budget")
                        if _is_rate_limited(response.status, text):
                            if attempt < 2:
                                await asyncio.sleep(min(3.0, float(response.headers.get("Retry-After", 1.0))))
                                continue
                            raise RuntimeError(f"{self.source} is rate-limiting requests; try again shortly")
                        if response.status == 429 or response.status >= 500:
                            if attempt < 2:
                                delay = min(5.0, float(response.headers.get("Retry-After", attempt + 1)))
                                await asyncio.sleep(delay)
                                continue
                        response_url = urlparse(str(response.url))._replace(query="", fragment="").geturl()
                        if response.status >= 400:
                            raise RuntimeError(f"{self.source} GET {response_url} HTTP {response.status}: {text[:300]}")
                        try:
                            return await response.json(content_type=None)
                        except Exception as exc:
                            raise RuntimeError(f"{self.source} GET {response_url} returned invalid JSON") from exc
                except aiohttp.ClientConnectorCertificateError as exc:
                    raise GalleryTLSCertificateError(f"{self.source} TLS certificate verification failed for {url}: {exc}") from exc
                except (aiohttp.ClientError, TimeoutError) as exc:
                    if attempt >= 2:
                        raise RuntimeError(f"{self.source} GET {url} failed after {attempt + 1} attempts: {exc}") from exc
                    await asyncio.sleep(attempt + 1)
        raise AssertionError("unreachable")

    def auth_params(self, credentials: dict[str, str]) -> dict[str, str]:
        return {}

    async def search(self, session: aiohttp.ClientSession, query: str, ratings: list[str], sort: str,
                     cursor: str | None, limit: int, credentials: dict[str, str],
                     blacklist: tuple[str, ...] = ()) -> GalleryPage:
        raise NotImplementedError

    def cursor_for_page(self, page: int) -> str:
        return str(max(1, page))

    async def ranking(self, session: aiohttp.ClientSession, period: str, cursor: str | None,
                      limit: int, credentials: dict[str, str], blacklist: tuple[str, ...] = ()) -> GalleryPage:
        raise ValueError(f"{self.source} does not support {period} rankings")

    async def get_post(self, session: aiohttp.ClientSession, post_id: str,
                       credentials: dict[str, str]) -> GalleryPostDetail:
        raise NotImplementedError

    async def classify_tags(self, session: aiohttp.ClientSession, tags: list[str],
                            credentials: dict[str, str]) -> dict[str, tuple[str, ...]]:
        return {"artist": (), "copyright": (), "character": (), "general": tuple(tags), "meta": ()}

    async def known_tags(self, session: aiohttp.ClientSession, names: list[str],
                         credentials: dict[str, str]) -> frozenset[str]:
        """Casefolded subset of ``names`` that exist as site tags; empty means no repair knowledge."""
        return frozenset()

    async def normalize_tag_query(self, session: aiohttp.ClientSession, query: str,
                                  credentials: dict[str, str]) -> str:
        """Canonicalize pasted prompt-style text and repair spaced tags for tag-query APIs."""
        tokens = tokenize_tag_query(query)
        known = await self.known_tags(session, join_candidates(tokens), credentials)
        if not known:
            return " ".join(tokens)
        return " ".join(repair_spaced_tags(tokens, known))

    def validate_media_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in self.media_hosts or parsed.username or parsed.password:
            raise ValueError(f"{self.source} media URL is not allowed: {url}")

    def media_request_headers(self) -> dict[str, str]:
        return {"User-Agent": GALLERY_USER_AGENT}

    async def test_credentials(self, session: aiohttp.ClientSession, credentials: dict[str, str]) -> dict[str, Any]:
        await self.search(session, "", [], "", None, 1, credentials)
        return {"ok": True}

    async def list_favorites(self, session: aiohttp.ClientSession, cursor: str | None, limit: int,
                             credentials: dict[str, str], blacklist: tuple[str, ...] = ()) -> GalleryPage:
        raise ValueError(f"{self.source} does not support favorite reading")

    async def set_favorite(self, session: aiohttp.ClientSession, post_id: str, favorite: bool,
                           credentials: dict[str, str]) -> bool:
        raise ValueError(f"{self.source} does not support favorite writing")


def _split(value: Any) -> tuple[str, ...]:
    return tuple(str(value or "").split())


def _raw_tags(value: Any) -> frozenset[str]:
    """Read list-response tags without hydrating post details."""
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            try:
                value = json.loads(stripped)
            except json.JSONDecodeError:
                pass
        if isinstance(value, str):
            value = value.split()
    if not isinstance(value, (list, tuple, set)):
        return frozenset()
    return frozenset(str(tag).strip().casefold() for tag in value if str(tag).strip())


def _normalize_blacklist(blacklist: tuple[str, ...]) -> frozenset[str]:
    return frozenset(str(tag).strip().casefold() for tag in blacklist if str(tag).strip())


def _is_blacklisted(post: dict[str, Any], blacklist: frozenset[str]) -> bool:
    if not blacklist:
        return False
    tags = _raw_tags(post.get("tag_string") or post.get("tags"))
    return not tags.isdisjoint(blacklist)


def _is_supported_static_post(post: dict[str, Any]) -> bool:
    explicit = str(post.get("file_ext") or post.get("extension") or "").strip().lower().lstrip(".")
    if explicit:
        return explicit in STATIC_IMAGE_EXTENSIONS
    for key in ("file_url", "source", "image"):
        path = urlparse(str(post.get(key) or "")).path
        suffix = path.rsplit("/", 1)[-1].rsplit(".", 1)
        if len(suffix) == 2 and suffix[1]:
            return suffix[1].lower() in STATIC_IMAGE_EXTENSIONS
    return True


def _restricted_media_hidden(posts: tuple) -> bool:
    """Danbooru 对 Member 级及以下账户整页隐藏受限内容的媒体地址：帖子返回但 preview_url 全为空。"""
    return bool(posts) and all(not post.preview_url for post in posts)


def _int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def rating_matches(source: str, value: str, ratings: list[str]) -> bool:
    if not ratings:
        return True
    aliases = ({"g": "general", "s": "sensitive", "q": "questionable", "e": "explicit"}
               if source in {"danbooru", "gelbooru"} else
               {"g": "safe", "general": "safe", "s": "safe", "q": "questionable", "e": "explicit"})
    return aliases.get(str(value).strip().lower(), str(value).strip().lower()) in ratings


class DanbooruAdapter(BooruAdapter):
    source = "danbooru"
    capabilities = GalleryCapabilities(source, "Danbooru", ("general", "sensitive", "questionable", "explicit"),
                                       ("latest", "score", "favcount"), "page", 200,
                                       ("username", "apiKey"), True, True, True, ("day", "week", "month"),
                                       tag_search=True, max_search_tags=2,
                                       credentials_url="https://danbooru.donmai.us/settings")
    media_hosts = frozenset({"cdn.donmai.us", "danbooru.donmai.us"})
    base = "https://danbooru.donmai.us"

    def auth_params(self, credentials: dict[str, str]) -> dict[str, str]:
        username, key = credentials.get("username", ""), credentials.get("apiKey", "")
        return {"login": username, "api_key": key} if username and key else {}

    def _summary(self, post: dict[str, Any]) -> GalleryPostSummary:
        post_id = str(post.get("id", ""))
        return GalleryPostSummary(self.source, post_id, f"{self.base}/posts/{post_id}",
                                  str(post.get("preview_file_url") or post.get("large_file_url") or ""),
                                  _int(post.get("image_width")), _int(post.get("image_height")),
                                  str(post.get("rating", "")), str(post.get("created_at", "")),
                                  post.get("is_favorited"), str(post.get("large_file_url") or ""),
                                  _int(post.get("score")), _int(post.get("fav_count")))

    async def _search_page(self, session, query, ratings, sort, page, page_number, limit, credentials, blacklist):
        size = min(max(1, limit), self.capabilities.max_page_size)
        auth = self.auth_params(credentials)
        tags = build_danbooru_search_tags(query, ratings, sort, size, self.capabilities.max_search_tags)
        raw = await self._get_json(session, f"{self.base}/posts.json", params={"tags": tags, "page": page, "limit": size, **auth})
        if not isinstance(raw, list):
            raise RuntimeError("danbooru search response must be a list")
        blocked = _normalize_blacklist(blacklist)
        candidates = tuple(item for item in raw if isinstance(item, dict) and item.get("id") and _is_supported_static_post(item))
        visible = tuple(item for item in candidates if not _is_blacklisted(item, blocked))
        posts = tuple(post for item in visible for post in (self._summary(item),) if rating_matches(self.source, post.rating, ratings))
        warnings = ("local-blacklist-filtered",) if len(visible) < len(candidates) else ()
        display_page = page_number or 1
        if _restricted_media_hidden(posts):
            # 受限内容（loli/shota 等）对 Member 级及以下账户整页隐藏媒体地址；继续翻页只会得到
            # 同样的空页，直接结束并给出明确信号，由前端提示配置账户。
            return GalleryPage((), None, True, warnings + ("restricted-media-hidden",), page=display_page)
        next_cursor = str(page_number + 1) if page_number is not None and len(raw) == size else None
        return GalleryPage(posts, next_cursor, len(raw) < size, warnings, display_page)

    async def search(self, session, query, ratings, sort, cursor, limit, credentials, blacklist=()):
        page = max(1, _int(cursor) or 1)
        return await self._search_page(session, query, ratings, sort, page, page, limit, credentials, blacklist)

    async def search_id_cursor(self, session, query, ratings, cursor, limit, credentials, blacklist=()):
        if not re.fullmatch(r"[ab](?:0|[1-9][0-9]*)", cursor):
            raise ValueError("danbooru post id cursor is invalid")
        return await self._search_page(session, query, ratings, "latest", cursor, None, limit, credentials, blacklist)

    async def ranking(self, session, period, cursor, limit, credentials, blacklist=()):
        if period not in self.capabilities.ranking_periods:
            raise ValueError(f"danbooru does not support {period} rankings")
        page = max(1, _int(cursor) or 1)
        size = min(max(1, limit), self.capabilities.max_page_size)
        params = {"scale": period, "page": page, "limit": size, **self.auth_params(credentials)}
        if period == "day":
            # Danbooru leaves the current daily period empty until it closes.
            params["date"] = (date.today() - timedelta(days=1)).isoformat()
        raw = await self._get_json(session, f"{self.base}/explore/posts/popular.json", params=params)
        if not isinstance(raw, list):
            raise RuntimeError("danbooru ranking response must be a list")
        blocked = _normalize_blacklist(blacklist)
        candidates = tuple(item for item in raw if isinstance(item, dict) and item.get("id") and _is_supported_static_post(item))
        visible = tuple(item for item in candidates if not _is_blacklisted(item, blocked))
        posts = tuple(self._summary(item) for item in visible)
        warnings = ("local-blacklist-filtered",) if len(visible) < len(candidates) else ()
        if _restricted_media_hidden(posts):
            return GalleryPage((), None, True, warnings + ("restricted-media-hidden",), page=page)
        return GalleryPage(posts, str(page + 1) if len(raw) == size else None, len(raw) < size, warnings, page)

    async def get_post(self, session, post_id, credentials):
        raw = await self._get_json(session, f"{self.base}/posts/{post_id}.json", params=self.auth_params(credentials))
        if not isinstance(raw, dict):
            raise RuntimeError(f"danbooru post {post_id} response must be an object")
        summary = self._summary(raw)
        tags = {category: _split(raw.get(f"tag_string_{category}")) for category in TAG_CATEGORIES}
        fields = asdict(summary)
        fields.pop("sample_url", None)
        return GalleryPostDetail(**fields, media_url=str(raw.get("file_url") or ""),
                                 sample_url=str(raw.get("large_file_url") or raw.get("preview_file_url") or ""),
                                 file_ext=str(raw.get("file_ext") or ""), file_size=_int(raw.get("file_size")), tags=tags)

    async def classify_tags(self, session, tags, credentials):
        result = {category: [] for category in TAG_CATEGORIES}
        category_map = {0: "general", 1: "artist", 3: "copyright", 4: "character", 5: "meta"}
        for offset in range(0, len(tags), 100):
            chunk = tags[offset:offset + 100]
            raw = await self._get_json(session, f"{self.base}/tags.json", params={"search[name_comma]": ",".join(chunk), "limit": 100, **self.auth_params(credentials)})
            known = {}
            if isinstance(raw, list):
                known = {str(item.get("name")): category_map.get(_int(item.get("category")), "general") for item in raw if isinstance(item, dict)}
            for tag in chunk:
                result[known.get(tag, "general")].append(tag)
        return {key: tuple(value) for key, value in result.items()}

    async def known_tags(self, session, names, credentials):
        known = set()
        for offset in range(0, len(names), 100):
            chunk = names[offset:offset + 100]
            raw = await self._get_json(session, f"{self.base}/tags.json", params={"search[name_comma]": ",".join(chunk), "limit": 100, **self.auth_params(credentials)})
            if isinstance(raw, list):
                # tags.json also returns dead tags with zero posts or a deprecated flag
                # (e.g. blue, archive); treating them as valid standalone words would
                # block repairing spaced phrases like "blue archive" into blue_archive.
                known.update(str(item.get("name", "")).casefold() for item in raw
                             if isinstance(item, dict) and _int(item.get("post_count")) > 0 and not item.get("is_deprecated"))
        known.discard("")
        return frozenset(known)

    async def list_favorites(self, session, cursor, limit, credentials, blacklist=()):
        username = credentials.get("username", "")
        if not username:
            raise ValueError("danbooru username is required to read favorites")
        return await self.search(session, f"ordfav:{username}", [], "latest", cursor, limit, credentials, blacklist)

    async def set_favorite(self, session, post_id, favorite, credentials):
        params = self.auth_params(credentials)
        if not params:
            raise ValueError("danbooru username and API key are required")
        url = f"{self.base}/favorites" + (f"/{post_id}.json" if not favorite else ".json")
        async with self._semaphore:
            method = session.post if favorite else session.delete
            kwargs = {"params": params, "headers": _api_headers("application/json")}
            if favorite:
                kwargs["json"] = {"post_id": post_id}
            async with method(url, **kwargs) as response:
                text = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"danbooru favorite post {post_id} HTTP {response.status}: {text[:300]}")
        return favorite


class GelbooruAdapter(BooruAdapter):
    source = "gelbooru"
    capabilities = GalleryCapabilities(source, "Gelbooru", ("general", "sensitive", "questionable", "explicit"),
                                       ("latest", "score"), "pid", 100, ("userId", "apiKey"), True, True, False,
                                       auth_required=True, tag_search=True,
                                       credentials_url="https://gelbooru.com/index.php?page=account&s=options")
    media_hosts = frozenset({"gelbooru.com", "img3.gelbooru.com", "img4.gelbooru.com"})
    base = "https://gelbooru.com/index.php"

    def media_request_headers(self) -> dict[str, str]:
        # Gelbooru redirects media requests without a site Referer to the HTML post page.
        return {**super().media_request_headers(), "Referer": "https://gelbooru.com/"}

    def auth_params(self, credentials):
        user = str(credentials.get("userId") or "").strip()
        key = str(credentials.get("apiKey") or "").strip()
        copied = parse_qs(key.lstrip("?&")) if "=" in key else {}
        copied_key = (copied.get("api_key") or [""])[0].strip()
        if copied_key:
            key = copied_key
            user = user or (copied.get("user_id") or [""])[0].strip()
        return {"user_id": user, "api_key": key} if user and key else {}

    def require_credentials(self, credentials):
        # Gelbooru 自 2025-06 起对所有 dapi 请求强制 api_key + user_id，匿名请求一律 401。
        if self.capabilities.auth_required and not self.auth_params(credentials):
            raise ValueError(f"{self.capabilities.display_name} requires User ID and API Key. Open ComfyUI Settings > Booru Gallery > Accounts.")

    def cursor_for_page(self, page: int) -> str:
        return str(max(1, page) - 1)

    def _summary(self, post):
        post_id = str(post.get("id", ""))
        return GalleryPostSummary(self.source, post_id, f"https://gelbooru.com/index.php?page=post&s=view&id={post_id}",
                                  str(post.get("preview_url") or post.get("sample_url") or ""), _int(post.get("width")),
                                  _int(post.get("height")), str(post.get("rating", "")), str(post.get("created_at", "")), None,
                                  str(post.get("sample_url") or ""), _int(post.get("score")), _int(post.get("fav_count")))

    async def _posts(self, session, params, credentials):
        self.require_credentials(credentials)
        raw = await self._get_json(session, self.base, params={"page": "dapi", "s": "post", "q": "index", "json": "1", **params, **self.auth_params(credentials)})
        if isinstance(raw, dict):
            raw = raw.get("post", [])
        if not isinstance(raw, list):
            raise RuntimeError("gelbooru post response must contain a list")
        return raw

    async def search(self, session, query, ratings, sort, cursor, limit, credentials, blacklist=()):
        pid = _int(cursor)
        tags = query.strip()
        # Gelbooru cannot OR multiple rating metatags; keep that case local so pagination still advances over real pages.
        if len(ratings) == 1:
            tags = f"{tags} rating:{ratings[0]}".strip()
        if sort == "score":
            tags = f"{tags} sort:score:desc".strip()
        elif sort == "random":
            tags = f"{tags} sort:random".strip()
        size = min(max(1, limit), 100)
        raw = await self._posts(session, {"tags": tags, "pid": pid, "limit": size}, credentials)
        blocked = _normalize_blacklist(blacklist)
        candidates = tuple(item for item in raw if isinstance(item, dict) and item.get("id") and _is_supported_static_post(item))
        visible = tuple(item for item in candidates if not _is_blacklisted(item, blocked))
        posts = tuple(post for item in visible for post in (self._summary(item),) if rating_matches(self.source, post.rating, ratings))
        warnings = ("local-blacklist-filtered",) if len(visible) < len(candidates) else ()
        return GalleryPage(posts, str(pid + 1) if len(raw) == size else None, len(raw) < size, warnings, pid + 1)

    async def get_post(self, session, post_id, credentials):
        raw = await self._posts(session, {"id": post_id, "limit": 1}, credentials)
        if not raw:
            raise ValueError(f"gelbooru post {post_id} was not found")
        post = raw[0]
        summary = self._summary(post)
        flat = list(_split(post.get("tags")))
        tags = {"artist": (), "copyright": (), "character": (), "general": tuple(flat), "meta": ()}
        media = str(post.get("file_url") or post.get("source") or "")
        fields = asdict(summary)
        fields.pop("sample_url", None)
        return GalleryPostDetail(**fields, media_url=media,
                                 sample_url=str(post.get("sample_url") or post.get("preview_url") or ""),
                                 file_ext=media.rsplit(".", 1)[-1].lower(),
                                 file_size=_int(post.get("file_size")), tags=tags, complete=False)

    async def classify_tags(self, session, tags, credentials):
        self.require_credentials(credentials)
        result = {category: [] for category in TAG_CATEGORIES}
        category_map = {0: "general", 1: "artist", 3: "copyright", 4: "character", 5: "meta"}
        for offset in range(0, len(tags), 100):
            chunk = tags[offset:offset + 100]
            raw = await self._get_json(session, self.base, params={"page": "dapi", "s": "tag", "q": "index", "json": "1", "names": " ".join(chunk), "limit": 100, **self.auth_params(credentials)})
            items = raw.get("tag", []) if isinstance(raw, dict) else raw
            known = {str(item.get("name")): category_map.get(_int(item.get("type")), "general") for item in items or [] if isinstance(item, dict)} if isinstance(items, list) else {}
            for tag in chunk:
                result[known.get(tag, "general")].append(tag)
        return {key: tuple(value) for key, value in result.items()}

    async def known_tags(self, session, names, credentials):
        self.require_credentials(credentials)
        known = set()
        for offset in range(0, len(names), 100):
            chunk = names[offset:offset + 100]
            raw = await self._get_json(session, self.base, params={"page": "dapi", "s": "tag", "q": "index", "json": "1", "names": " ".join(chunk), "limit": 100, **self.auth_params(credentials)})
            items = raw.get("tag", []) if isinstance(raw, dict) else raw
            if isinstance(items, list):
                # Same dead-tag guard as danbooru: a zero-post standalone word must not
                # block joining a spaced phrase into its real underscore tag. Only filter
                # when the endpoint reports a count so older payloads stay valid.
                known.update(str(item.get("name", "")).casefold() for item in items
                             if isinstance(item, dict) and ("count" not in item or _int(item.get("count")) > 0))
        known.discard("")
        return frozenset(known)

    async def list_favorites(self, session, cursor, limit, credentials, blacklist=()):
        user = credentials.get("userId", "")
        if not user:
            raise ValueError("gelbooru User ID is required to read favorites")
        return await self.search(session, f"fav:{user}", [], "latest", cursor, limit, credentials, blacklist)


class SafebooruAdapter(GelbooruAdapter):
    source = "safebooru"
    capabilities = GalleryCapabilities(source, "Safebooru", ("safe",), ("latest", "score"), "pid", 1000,
                                       (), True, False, False, tag_search=True)
    media_hosts = frozenset({"safebooru.org", "images.safebooru.org"})
    base = "https://safebooru.org/index.php"

    def __init__(self) -> None:
        super().__init__()
        # safebooru's tag dapi only matches one exact name per request and rate-limits
        # bursty lookups with fake 404s; concurrency 2 with short inter-batch pauses
        # measured zero 404s over repeated 24-tag runs.
        self._tag_semaphore = asyncio.Semaphore(2)

    def auth_params(self, credentials):
        return {}

    async def _get_tag_type(self, session, name):
        # safebooru answers XML here; json=1 and the plural names= parameter
        # are both ignored for the tag endpoint. 404 means rate-limited and is
        # retried by the batch coordinator below, never concurrently here.
        async with self._tag_semaphore:
            async with session.get(self.base, params={"page": "dapi", "s": "tag", "q": "index",
                                                      "name": name, "limit": 1},
                                   headers=_api_headers("application/xml"), allow_redirects=True) as response:
                if _is_upstream_query_timeout(response.status, await response.text()):
                    raise GalleryUpstreamTimeoutError(f"{self.source} aborted the query: the result set exceeded its execution budget")
                if response.status >= 400:
                    raise RuntimeError(f"{self.source} GET {response.url} HTTP {response.status}")
                text = await response.text()
                try:
                    root = ET.fromstring(text)
                except ET.ParseError as exc:
                    raise RuntimeError(f"{self.source} GET {response.url} returned invalid tag XML") from exc
                for tag in root:
                    if str(tag.get("name", "")) == name:
                        return {"name": name, "type": _int(tag.get("type"))}
                return None

    async def _lookup_tag_types(self, session, tags):
        """Batch tag lookups with rate-limit protection.

        safebooru answers real HTTP 404 while rate-limiting the tag endpoint
        and ignores batch parameters, so every tag costs one request. 2-way
        concurrency plus a short inter-batch pause measured zero 404s over
        repeated 24-tag runs; failed tags retry serially once after a pause
        (parallel retries interleave and keep tripping the limiter). If a batch
        still loses several lookups the endpoint is clearly throttled and the
        rest is skipped (degraded to General) instead of hammering it. A later
        detail refresh retries from the category cache.
        """
        known: dict[str, str] = {}
        failures: list[tuple[str, Exception]] = []
        rate_limited = False
        category_map = {0: "general", 1: "artist", 3: "copyright", 4: "character", 5: "meta"}
        for offset in range(0, len(tags), 6):
            if rate_limited:
                continue
            batch = tags[offset:offset + 6]
            found = await asyncio.gather(*(self._get_tag_type(session, tag) for tag in batch), return_exceptions=True)
            batch_failures = [(tag, position) for position, (tag, item) in enumerate(zip(batch, found)) if isinstance(item, Exception)]
            if batch_failures:
                await asyncio.sleep(1.0)
                for tag, position in batch_failures:
                    try:
                        found[position] = await self._get_tag_type(session, tag)
                    except Exception as exc:
                        found[position] = exc
                batch_failures = [(tag, position) for position, (tag, item) in enumerate(zip(batch, found)) if isinstance(item, Exception)]
            if len(batch_failures) >= 3:
                rate_limited = True
            failures.extend((tag, found[position]) for tag, position in batch_failures)
            for tag, item in zip(batch, found):
                if isinstance(item, Exception) or not item:
                    continue
                known[item["name"]] = category_map.get(item["type"], "general")
            if offset + 6 < len(tags):
                await asyncio.sleep(0.15)
        return known, failures, rate_limited

    async def classify_tags(self, session, tags, credentials):
        result = {category: [] for category in TAG_CATEGORIES}
        known, failures, rate_limited = await self._lookup_tag_types(session, tags)
        if failures:
            first, error = failures[0]
            if rate_limited:
                print(f"[Aaalice] safebooru tag classification rate-limited; {len(tags)} tags degraded to general (first: {first!r}: {error})", flush=True)  # noqa: T201
            else:
                print(f"[Aaalice] safebooru tag classification failed for {len(failures)} tags (first: {first!r}: {error})", flush=True)  # noqa: T201
        for tag in tags:
            result[known.get(tag, "general")].append(tag)
        return {key: tuple(value) for key, value in result.items()}

    async def known_tags(self, session, names, credentials):
        known, failures, rate_limited = await self._lookup_tag_types(session, names)
        if failures:
            first, error = failures[0]
            if rate_limited:
                print(f"[Aaalice] safebooru tag lookup rate-limited; {len(names)} names skipped (first: {first!r}: {error})", flush=True)  # noqa: T201
            else:
                print(f"[Aaalice] safebooru tag lookup failed for {len(failures)} names (first: {first!r}: {error})", flush=True)  # noqa: T201
        return frozenset(name.casefold() for name in known)

    def _summary(self, post):
        post_id = str(post.get("id", ""))
        return GalleryPostSummary(self.source, post_id, f"https://safebooru.org/index.php?page=post&s=view&id={post_id}",
                                  str(post.get("preview_url") or post.get("sample_url") or ""), _int(post.get("width")),
                                  _int(post.get("height")), str(post.get("rating", "safe")), str(post.get("created_at", "")), None,
                                  str(post.get("sample_url") or ""), _int(post.get("score")), _int(post.get("fav_count")))

    async def list_favorites(self, session, cursor, limit, credentials, blacklist=()):
        raise ValueError("safebooru does not support account favorites")


class AITagAdapter(BooruAdapter):
    """Public AI TAG gallery API; prompt metadata is normalized as General tags."""

    source = "aitag"
    capabilities = GalleryCapabilities(source, "AI TAG", (), ("new",), "page", 60, (), False, False, False, ("month",), tag_search=True)
    media_hosts = frozenset({"ai-img.10118899.xyz"})
    base = "https://aitag.win"
    asset_base = "https://ai-img.10118899.xyz/"

    @staticmethod
    def _decode(value: Any, fallback: Any) -> Any:
        if not isinstance(value, str):
            return value
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback

    def _preview(self, work: dict[str, Any]) -> str:
        image_type = str(work.get("AI_type") or work.get("ai_type") or "").strip()
        user_id = str(work.get("userId") or work.get("userid") or "")
        post_id = str(work.get("id") or "")
        if not image_type or not user_id or not post_id:
            return ""
        return f"{self.asset_base}{image_type}/{user_id}/{post_id}_p0.webp"

    def _summary(self, work: dict[str, Any]) -> GalleryPostSummary:
        post_id = str(work.get("id", ""))
        return GalleryPostSummary(self.source, post_id, f"{self.base}/i/{post_id}", self._preview(work), 1, 1, "",
                                  str(work.get("create_date", "")), None)

    async def normalize_tag_query(self, session, query, credentials):
        # AI TAG search is free-text over prompt metadata, not a tag query.
        return str(query or "").strip()

    async def search(self, session, query, ratings, sort, cursor, limit, credentials, blacklist=()):
        if ratings:
            raise ValueError("aitag does not expose rating filters")
        page = max(1, _int(cursor) or 1)
        size = 60  # The public API currently validates page_size >= 60.
        path = "/api/ai_works_search"
        params: dict[str, Any] = {"page": page, "page_size": size}
        if query.strip():
            params["q"] = query.strip()
        raw = await self._get_json(session, f"{self.base}{path}", params=params)
        if not isinstance(raw, dict) or not isinstance(raw.get("items"), list):
            raise RuntimeError("aitag search response must contain an items list")
        items = tuple(item for item in raw["items"] if isinstance(item, dict) and item.get("id"))
        blocked = _normalize_blacklist(blacklist)
        visible = tuple(item for item in items if not _is_blacklisted(item, blocked))
        posts = tuple(self._summary(item) for item in visible)
        total = _int(raw.get("total"))
        ended = len(items) < size or (total > 0 and page * size >= total)
        warnings = ("AI TAG does not expose rating or categorized tag metadata.",)
        if len(visible) < len(items):
            warnings += ("local-blacklist-filtered",)
        return GalleryPage(posts, None if ended else str(page + 1), ended, warnings, page, total)

    async def ranking(self, session, period, cursor, limit, credentials, blacklist=()):
        if period != "month":
            raise ValueError(f"aitag does not support {period} rankings")
        page = max(1, _int(cursor) or 1)
        size = 60
        raw = await self._get_json(session, f"{self.base}/api/rank/monthly/real", params={"page": page, "page_size": size})
        if not isinstance(raw, dict) or not isinstance(raw.get("items"), list):
            raise RuntimeError("aitag monthly ranking response must contain an items list")
        items = tuple(item for item in raw["items"] if isinstance(item, dict) and item.get("id"))
        blocked = _normalize_blacklist(blacklist)
        visible = tuple(item for item in items if not _is_blacklisted(item, blocked))
        posts = tuple(self._summary(item) for item in visible)
        total = _int(raw.get("total"))
        ended = len(items) < size or (total > 0 and page * size >= total)
        warnings = ("AI TAG does not expose rating or categorized tag metadata.",)
        if len(visible) < len(items):
            warnings += ("local-blacklist-filtered",)
        return GalleryPage(posts, None if ended else str(page + 1), ended, warnings, page, total)

    async def get_post(self, session, post_id, credentials):
        raw = await self._get_json(session, f"{self.base}/api/work/{post_id}")
        if isinstance(raw, str):
            raw = self._decode(raw, {})
        if not isinstance(raw, dict) or not isinstance(raw.get("work"), dict):
            raise RuntimeError(f"aitag post {post_id} response must contain a work object")
        work = raw["work"]
        images = raw.get("images") if isinstance(raw.get("images"), list) else []
        image_candidates = [item for item in images if isinstance(item, dict)]
        image_candidates.sort(key=lambda item: _int(re.search(r"_p(\d+)$", str(item.get("file_name") or ""))[1])
                              if re.search(r"_p(\d+)$", str(item.get("file_name") or "")) else 10**9)
        image = image_candidates[0] if image_candidates else {}
        media = f"{self.asset_base}{str(image.get('image_path', '')).lstrip('/')}" if image.get("image_path") else self._preview(work)
        pixiv = self._decode(work.get("json"), {})
        width = _int(pixiv.get("width")) if isinstance(pixiv, dict) else 0
        height = _int(pixiv.get("height")) if isinstance(pixiv, dict) else 0
        prompt = str(image.get("prompt_text") or "")
        prompt = re.split(r"\nSteps\s*:", prompt, maxsplit=1, flags=re.IGNORECASE)[0]
        prompt_tags = tuple(part.strip() for part in re.split(r"[,\n]+", prompt) if part.strip())
        if not prompt_tags:
            prompt_tags = tuple(str(tag) for tag in self._decode(work.get("tags"), []) if str(tag).strip())
        summary = self._summary(work)
        return GalleryPostDetail(source=self.source, post_id=summary.post_id, post_url=summary.post_url,
                                 preview_url=media, width=width or 1, height=height or 1, rating="",
                                 created_at=summary.created_at, favorite=None, media_url=media,
                                 sample_url=media, file_ext="webp",
                                 file_size=0, tags={"artist": (), "copyright": (), "character": (),
                                                         "general": prompt_tags, "meta": ()}, complete=True)

    async def list_favorites(self, session, cursor, limit, credentials, blacklist=()):
        raise ValueError("aitag does not support account favorites")


ADAPTERS: dict[str, BooruAdapter] = {adapter.source: adapter for adapter in (DanbooruAdapter(), GelbooruAdapter(), SafebooruAdapter(), AITagAdapter())}


def adapter_for(source: str) -> BooruAdapter:
    try:
        return ADAPTERS[source]
    except KeyError as exc:
        raise ValueError(f"unsupported booru source: {source}") from exc
