"""HTTP transport for bounded local image thumbnails."""

from __future__ import annotations

import asyncio
import logging
import os
import weakref
from pathlib import Path

from aiohttp import web
from PIL import UnidentifiedImageError

from .._lib.image_thumbnail import render_image_thumbnail, thumbnail_etag

API = "/aaalice/image-thumbnail"
_VALID_TYPES = {"input", "output", "temp"}
_registered = False
logger = logging.getLogger(__name__)


class _ThumbnailCoordinator:
    def __init__(self) -> None:
        self._slots = asyncio.Semaphore(2)
        self._in_flight: dict[tuple[str, int, int], asyncio.Task[bytes]] = {}

    async def render(self, path: Path, modified_ns: int, source_size: int) -> bytes:
        key = str(path), modified_ns, source_size
        task = self._in_flight.get(key)
        if task is None:
            task = asyncio.create_task(self._render(key))
            self._in_flight[key] = task
            task.add_done_callback(lambda completed, cache_key=key: self._discard(cache_key, completed))
        return await asyncio.shield(task)

    async def _render(self, key: tuple[str, int, int]) -> bytes:
        async with self._slots:
            return await asyncio.to_thread(render_image_thumbnail, *key)

    def _discard(self, key: tuple[str, int, int], task: asyncio.Task[bytes]) -> None:
        if not task.cancelled():
            task.exception()
        if self._in_flight.get(key) is task:
            self._in_flight.pop(key, None)


_coordinators: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, _ThumbnailCoordinator] = weakref.WeakKeyDictionary()


def _coordinator() -> _ThumbnailCoordinator:
    loop = asyncio.get_running_loop()
    coordinator = _coordinators.get(loop)
    if coordinator is None:
        coordinator = _ThumbnailCoordinator()
        _coordinators[loop] = coordinator
    return coordinator


def resolve_image_source(filename: str, subfolder: str, image_type: str, *, owner_id: str = "") -> tuple[Path, str | None]:
    if not filename or os.path.basename(filename) != filename:
        raise ValueError("filename must be a single path component")
    content_type = None
    if filename.startswith("blake3:"):
        from app.assets.services.asset_management import resolve_hash_to_path

        result = resolve_hash_to_path(filename, owner_id=owner_id)
        if result is None:
            raise FileNotFoundError(filename)
        path = Path(result.abs_path)
        content_type = result.content_type
    else:
        if image_type not in _VALID_TYPES:
            raise ValueError(f"unsupported image type: {image_type!r}")

        import folder_paths

        base_directory = folder_paths.get_directory_by_type(image_type)
        if not base_directory:
            raise ValueError(f"image directory is unavailable: {image_type!r}")
        path = Path(os.path.realpath(os.path.join(base_directory, subfolder, filename)))
        if not folder_paths.is_within_directory(base_directory, str(path)):
            raise ValueError(f"invalid image path: {os.path.join(subfolder, filename)!r}")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path, content_type


def resolve_image_path(filename: str, subfolder: str, image_type: str, *, owner_id: str = "") -> Path:
    return resolve_image_source(filename, subfolder, image_type, owner_id=owner_id)[0]


async def image_thumbnail(request: web.Request) -> web.Response:
    try:
        filename = request.query.get("filename", "").strip()
        owner_id = ""
        if filename.startswith("blake3:"):
            from server import PromptServer

            owner_id = PromptServer.instance.user_manager.get_request_user_id(request)
        path, content_type = resolve_image_source(
            filename,
            request.query.get("subfolder", ""),
            request.query.get("type", "input").lower(),
            owner_id=owner_id,
        )
        etag, modified_ns, source_size = thumbnail_etag(path)
        if request.headers.get("If-None-Match") == etag:
            return web.Response(status=304, headers={"ETag": etag, "Cache-Control": "private, no-cache"})
        if str(content_type).split(";", 1)[0].lower() == "image/svg+xml":
            body = await asyncio.to_thread(path.read_bytes)
            return web.Response(body=body, content_type="image/svg+xml", headers={"ETag": etag, "Cache-Control": "private, no-cache"})
        body = await _coordinator().render(path, modified_ns, source_size)
        return web.Response(
            body=body,
            content_type="image/webp",
            headers={"ETag": etag, "Cache-Control": "private, no-cache"},
        )
    except FileNotFoundError as exc:
        return web.json_response({"error": "FileNotFoundError", "message": str(exc)}, status=404)
    except (ValueError, UnidentifiedImageError, OSError) as exc:
        return web.json_response({"error": type(exc).__name__, "message": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("Image thumbnail request failed", exc_info=exc)
        return web.json_response({"error": type(exc).__name__, "message": str(exc)}, status=500)


def register_image_thumbnail_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer

    PromptServer.instance.routes.get(API)(image_thumbnail)
    _registered = True


__all__ = ["register_image_thumbnail_routes"]
