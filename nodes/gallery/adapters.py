"""Capability-based adapters for supported booru APIs."""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib.parse import urlparse

import aiohttp

TAG_CATEGORIES = ("artist", "copyright", "character", "general", "meta")


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

    def json(self) -> dict[str, Any]:
        data = asdict(self)
        data["postId"] = data.pop("post_id")
        data["postUrl"] = data.pop("post_url")
        data["previewUrl"] = data.pop("preview_url")
        data["createdAt"] = data.pop("created_at")
        return data


@dataclass(frozen=True)
class GalleryPostDetail(GalleryPostSummary):
    media_url: str = ""
    sample_url: str = ""
    file_ext: str = ""
    file_size: int = 0
    tags: dict[str, tuple[str, ...]] = field(default_factory=dict)
    complete: bool = True

    def json(self) -> dict[str, Any]:
        data = super().json()
        data.update({"mediaUrl": self.media_url, "sampleUrl": self.sample_url, "fileExt": self.file_ext, "fileSize": self.file_size,
                     "tags": {key: list(value) for key, value in self.tags.items()}, "complete": self.complete})
        return data


@dataclass(frozen=True)
class GalleryPage:
    posts: tuple[GalleryPostSummary, ...]
    next_cursor: str | None
    ended: bool
    warnings: tuple[str, ...] = ()
    page: int = 1

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
                    async with session.get(url, params=params, headers={"Accept": "application/json"}, allow_redirects=True) as response:
                        text = await response.text()
                        if response.status == 429 or response.status >= 500:
                            if attempt < 2:
                                delay = min(5.0, float(response.headers.get("Retry-After", attempt + 1)))
                                await asyncio.sleep(delay)
                                continue
                        if response.status >= 400:
                            raise RuntimeError(f"{self.source} GET {response.url} HTTP {response.status}: {text[:300]}")
                        try:
                            return await response.json(content_type=None)
                        except Exception as exc:
                            raise RuntimeError(f"{self.source} GET {response.url} returned invalid JSON") from exc
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

    def validate_media_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in self.media_hosts or parsed.username or parsed.password:
            raise ValueError(f"{self.source} media URL is not allowed: {url}")

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


def _is_blacklisted(post: dict[str, Any], blacklist: tuple[str, ...]) -> bool:
    if not blacklist:
        return False
    tags = _raw_tags(post.get("tag_string") or post.get("tags"))
    return bool(tags.intersection(tag.casefold() for tag in blacklist))


def _with_blacklist(query: str, blacklist: tuple[str, ...]) -> str:
    # Query operators are not tags. Unsafe values still receive exact local filtering.
    exclusions = (f"-{tag}" for tag in blacklist if re.fullmatch(r"[^\s:]+", tag) and not tag.startswith("-"))
    return " ".join(part for part in (query.strip(), *exclusions) if part)


def _int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


class DanbooruAdapter(BooruAdapter):
    source = "danbooru"
    capabilities = GalleryCapabilities(source, "Danbooru", ("general", "sensitive", "questionable", "explicit"),
                                       ("latest", "score", "favcount", "random"), "page", 200,
                                       ("username", "apiKey"), True, True, True, ("day", "week", "month"))
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
                                  post.get("is_favorited"))

    async def search(self, session, query, ratings, sort, cursor, limit, credentials, blacklist=()):
        page = max(1, _int(cursor) or 1)
        tags = _with_blacklist(query, blacklist)
        if ratings:
            tags = f"{tags} rating:{','.join(ratings)}".strip()
        if sort and sort != "latest":
            tags = f"{tags} order:{sort}".strip()
        size = min(max(1, limit), self.capabilities.max_page_size)
        raw = await self._get_json(session, f"{self.base}/posts.json", params={"tags": tags, "page": page, "limit": size, **self.auth_params(credentials)})
        if not isinstance(raw, list):
            raise RuntimeError("danbooru search response must be a list")
        posts = tuple(self._summary(item) for item in raw if isinstance(item, dict) and item.get("id") and not _is_blacklisted(item, blacklist))
        return GalleryPage(posts, str(page + 1) if len(raw) == size else None, len(raw) < size, page=page)

    async def ranking(self, session, period, cursor, limit, credentials, blacklist=()):
        if period not in self.capabilities.ranking_periods:
            raise ValueError(f"danbooru does not support {period} rankings")
        page = max(1, _int(cursor) or 1)
        size = min(max(1, limit), self.capabilities.max_page_size)
        raw = await self._get_json(session, f"{self.base}/explore/posts/popular.json", params={
            "scale": period, "page": page, "limit": size, **self.auth_params(credentials),
        })
        if not isinstance(raw, list):
            raise RuntimeError("danbooru ranking response must be a list")
        posts = tuple(self._summary(item) for item in raw if isinstance(item, dict) and item.get("id") and not _is_blacklisted(item, blacklist))
        return GalleryPage(posts, str(page + 1) if len(raw) == size else None, len(raw) < size, page=page)

    async def get_post(self, session, post_id, credentials):
        raw = await self._get_json(session, f"{self.base}/posts/{post_id}.json", params=self.auth_params(credentials))
        if not isinstance(raw, dict):
            raise RuntimeError(f"danbooru post {post_id} response must be an object")
        summary = self._summary(raw)
        tags = {category: _split(raw.get(f"tag_string_{category}")) for category in TAG_CATEGORIES}
        return GalleryPostDetail(**asdict(summary), media_url=str(raw.get("file_url") or ""),
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
            kwargs = {"params": params}
            if favorite:
                kwargs["json"] = {"post_id": post_id}
            async with method(url, **kwargs) as response:
                text = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"danbooru favorite post {post_id} HTTP {response.status}: {text[:300]}")
        return favorite


class GelbooruAdapter(BooruAdapter):
    source = "gelbooru"
    capabilities = GalleryCapabilities(source, "Gelbooru", ("safe", "questionable", "explicit"),
                                       ("latest", "score"), "pid", 100, ("userId", "apiKey"), True, True, False,
                                       auth_required=True)
    media_hosts = frozenset({"gelbooru.com", "img3.gelbooru.com", "img4.gelbooru.com"})
    base = "https://gelbooru.com/index.php"

    def auth_params(self, credentials):
        user, key = credentials.get("userId", ""), credentials.get("apiKey", "")
        return {"user_id": user, "api_key": key} if user and key else {}

    def require_credentials(self, credentials):
        if not self.auth_params(credentials):
            raise ValueError("Gelbooru requires User ID and API Key. Open ComfyUI Settings > Booru Gallery > Accounts.")

    def cursor_for_page(self, page: int) -> str:
        return str(max(1, page) - 1)

    def _summary(self, post):
        post_id = str(post.get("id", ""))
        return GalleryPostSummary(self.source, post_id, f"https://gelbooru.com/index.php?page=post&s=view&id={post_id}",
                                  str(post.get("preview_url") or post.get("sample_url") or ""), _int(post.get("width")),
                                  _int(post.get("height")), str(post.get("rating", "")), str(post.get("created_at", "")), None)

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
        tags = _with_blacklist(query, blacklist)
        if ratings:
            tags = f"{tags} rating:{','.join(ratings)}".strip()
        if sort == "score":
            tags = f"{tags} sort:score:desc".strip()
        size = min(max(1, limit), 100)
        raw = await self._posts(session, {"tags": tags, "pid": pid, "limit": size}, credentials)
        posts = tuple(self._summary(item) for item in raw if isinstance(item, dict) and item.get("id") and not _is_blacklisted(item, blacklist))
        return GalleryPage(posts, str(pid + 1) if len(raw) == size else None, len(raw) < size, page=pid + 1)

    async def get_post(self, session, post_id, credentials):
        raw = await self._posts(session, {"id": post_id, "limit": 1}, credentials)
        if not raw:
            raise ValueError(f"gelbooru post {post_id} was not found")
        post = raw[0]
        summary = self._summary(post)
        flat = list(_split(post.get("tags")))
        tags = {"artist": (), "copyright": (), "character": (), "general": tuple(flat), "meta": ()}
        media = str(post.get("file_url") or post.get("source") or "")
        return GalleryPostDetail(**asdict(summary), media_url=media,
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

    async def list_favorites(self, session, cursor, limit, credentials, blacklist=()):
        user = credentials.get("userId", "")
        if not user:
            raise ValueError("gelbooru User ID is required to read favorites")
        return await self.search(session, f"fav:{user}", [], "latest", cursor, limit, credentials, blacklist)


class SafebooruAdapter(GelbooruAdapter):
    source = "safebooru"
    capabilities = GalleryCapabilities(source, "Safebooru", ("safe",), ("latest", "score"), "pid", 1000,
                                       (), True, False, False)
    media_hosts = frozenset({"safebooru.org", "images.safebooru.org"})
    base = "https://safebooru.org/index.php"

    def auth_params(self, credentials):
        return {}

    def _summary(self, post):
        post_id = str(post.get("id", ""))
        return GalleryPostSummary(self.source, post_id, f"https://safebooru.org/index.php?page=post&s=view&id={post_id}",
                                  str(post.get("preview_url") or post.get("sample_url") or ""), _int(post.get("width")),
                                  _int(post.get("height")), str(post.get("rating", "safe")), str(post.get("created_at", "")), None)

    async def list_favorites(self, session, cursor, limit, credentials, blacklist=()):
        raise ValueError("safebooru does not support account favorites")


class AITagAdapter(BooruAdapter):
    """Public AI TAG gallery API; prompt metadata is normalized as General tags."""

    source = "aitag"
    capabilities = GalleryCapabilities(source, "AI TAG", (), ("new",), "page", 60, (), False, False, False, ("month",))
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
        items = raw["items"]
        posts = tuple(self._summary(item) for item in items if isinstance(item, dict) and item.get("id") and not _is_blacklisted(item, blacklist))
        total = _int(raw.get("total"))
        ended = len(items) < size or (total > 0 and page * size >= total)
        warnings = ("AI TAG does not expose rating or categorized tag metadata.",)
        return GalleryPage(posts, None if ended else str(page + 1), ended, warnings, page)

    async def ranking(self, session, period, cursor, limit, credentials, blacklist=()):
        if period != "month":
            raise ValueError(f"aitag does not support {period} rankings")
        page = max(1, _int(cursor) or 1)
        size = 60
        raw = await self._get_json(session, f"{self.base}/api/rank/monthly/real", params={"page": page, "page_size": size})
        if not isinstance(raw, dict) or not isinstance(raw.get("items"), list):
            raise RuntimeError("aitag monthly ranking response must contain an items list")
        items = raw["items"]
        posts = tuple(self._summary(item) for item in items if isinstance(item, dict) and item.get("id") and not _is_blacklisted(item, blacklist))
        total = _int(raw.get("total"))
        ended = len(items) < size or (total > 0 and page * size >= total)
        return GalleryPage(posts, None if ended else str(page + 1), ended,
                           ("AI TAG does not expose rating or categorized tag metadata.",), page)

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
