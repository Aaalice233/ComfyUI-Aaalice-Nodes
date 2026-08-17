"""HTTP transport for the prompt library.

Domain logic stays in ``nodes._lib.prompt_library`` so routes remain thin and testable.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Callable

from aiohttp import web

from .._lib.prompt_library import MAX_IMPORT_BYTES, PromptLibrary

logger = logging.getLogger(__name__)

API = "/aaalice/prompt-library"
_registered = False
_library: PromptLibrary | None = None


def get_library() -> PromptLibrary:
    global _library
    if _library is None:
        import folder_paths

        root = Path(folder_paths.get_user_directory()) / "aaalice" / "prompt-library"
        _library = PromptLibrary(root)
    return _library


def _error(exc: Exception) -> web.Response:
    status = 404 if isinstance(exc, KeyError) else 400 if isinstance(exc, (ValueError, TypeError)) else 500
    if status == 500:
        logger.exception("Prompt library request failed", exc_info=exc)
    return web.json_response({"error": type(exc).__name__, "message": str(exc)}, status=status)


async def _json(request: web.Request) -> dict[str, Any]:
    data = await request.json()
    if not isinstance(data, dict):
        raise ValueError("request body must be a JSON object")
    return data


def _changed(action: str, item_id: str | None = None) -> None:
    try:
        from server import PromptServer

        PromptServer.instance.send_sync("aaalice.prompt_library.changed", {"action": action, "id": item_id})
    except Exception:
        logger.exception("Prompt library mutation succeeded but change notification failed")


def _handler(operation: Callable[..., Any], *, action: str | None = None):
    async def wrapped(request: web.Request) -> web.Response:
        try:
            result = await operation(request)
            if action:
                _changed(action, request.match_info.get("id"))
            if isinstance(result, web.StreamResponse):
                return result
            return web.json_response(result if result is not None else {"ok": True})
        except Exception as exc:
            return _error(exc)

    return wrapped


async def snapshot(_request: web.Request):
    return await asyncio.to_thread(get_library().snapshot)


def _create_named(kind: str):
    async def operation(request: web.Request):
        data = await _json(request)
        method = getattr(get_library(), f"create_{kind}")
        return method(data)

    return operation


def _update_named(kind: str):
    async def operation(request: web.Request):
        data = await _json(request)
        method = getattr(get_library(), f"update_{kind}")
        method(request.match_info["id"], data)
        return {"ok": True}

    return operation


def _delete_named(kind: str):
    async def operation(request: web.Request):
        method = getattr(get_library(), f"delete_{kind}")
        if kind == "category":
            delete_descendants = str(request.query.get("deleteDescendants", "")).lower() in {"1", "true", "yes"}
            method(request.match_info["id"], delete_descendants=delete_descendants)
        else:
            method(request.match_info["id"])
        return {"ok": True}

    return operation


async def move_category(request: web.Request):
    data = await _json(request)
    if "parentId" not in data or "index" not in data:
        raise ValueError("parentId and index are required")
    get_library().move_category(request.match_info["id"], data["parentId"], data["index"])
    return {"ok": True}


async def create_entry(request: web.Request):
    return get_library().create_entry(await _json(request))


async def update_entry(request: web.Request):
    return get_library().update_entry(request.match_info["id"], await _json(request))


async def delete_entry(request: web.Request):
    get_library().delete_entry(request.match_info["id"])
    return {"ok": True}


async def batch_entries(request: web.Request):
    data = await _json(request)
    entry_ids = data.get("entryIds")
    if not isinstance(entry_ids, list) or not all(isinstance(item, str) for item in entry_ids):
        raise ValueError("entryIds must be a string list")
    count = get_library().batch_update_entries(
        entry_ids,
        category_id=data.get("categoryId"),
        set_category="categoryId" in data,
        add_collection_id=data.get("addCollectionId"),
        remove_collection_id=data.get("removeCollectionId"),
    )
    return {"updated": count}


async def delete_entries(request: web.Request):
    data = await _json(request)
    entry_ids = data.get("entryIds")
    if not isinstance(entry_ids, list) or not all(isinstance(item, str) for item in entry_ids):
        raise ValueError("entryIds must be a string list")
    return {"deleted": get_library().delete_entries(entry_ids)}


async def record_usage(request: web.Request):
    data = await _json(request)
    entry_ids = data.get("entryIds")
    if not isinstance(entry_ids, list) or not all(isinstance(item, str) for item in entry_ids):
        raise ValueError("entryIds must be a string list")
    return {"updated": get_library().record_usage(entry_ids)}


async def reorder(request: web.Request):
    data = await _json(request)
    ordered_ids = data.get("orderedIds")
    if not isinstance(ordered_ids, list) or not all(isinstance(item, str) for item in ordered_ids):
        raise ValueError("orderedIds must be a string list")
    get_library().reorder(str(data.get("kind", "")), ordered_ids, collection_id=data.get("collectionId"))
    return {"ok": True}


async def set_preview(request: web.Request):
    reader = await request.multipart()
    field = await reader.next()
    if field is None or field.name != "file":
        raise ValueError("multipart field 'file' is required")
    chunks: list[bytes] = []
    size = 0
    while chunk := await field.read_chunk():
        size += len(chunk)
        if size > 8 * 1024 * 1024:
            raise ValueError("preview image is too large")
        chunks.append(chunk)
    return get_library().set_preview(request.match_info["id"], b"".join(chunks))


async def delete_preview(request: web.Request):
    get_library().delete_preview(request.match_info["id"])
    return {"ok": True}


async def asset(request: web.Request):
    path, mime = get_library().asset(request.match_info["hash"])
    return web.FileResponse(path, headers={"Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable"})


async def export_prepare(request: web.Request):
    data = await _json(request)
    token, size = await asyncio.to_thread(
        get_library().prepare_export,
        entry_ids=data.get("entryIds"), category_id=data.get("categoryId"), collection_id=data.get("collectionId"),
    )
    return {"token": token, "size": size}


async def export_download(request: web.Request):
    path = get_library().export_path(request.match_info["token"])
    response = web.StreamResponse(headers={"Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="aaalice-prompt-library.zip"', "Content-Length": str(path.stat().st_size)})
    await response.prepare(request)
    try:
        with path.open("rb") as source:
            while chunk := await asyncio.to_thread(source.read, 1024 * 1024):
                await response.write(chunk)
        await response.write_eof()
        return response
    finally:
        path.unlink(missing_ok=True)


async def _read_import_file(request: web.Request) -> tuple[Path, str]:
    reader = await request.multipart()
    field = await reader.next()
    if field is None or field.name != "file":
        raise ValueError("multipart field 'file' is required")
    fd, name = tempfile.mkstemp(dir=get_library().root, prefix="import-upload-")
    os.close(fd)
    path = Path(name)
    size = 0
    try:
        with path.open("wb") as destination:
            while chunk := await field.read_chunk(size=1024 * 1024):
                size += len(chunk)
                if size > MAX_IMPORT_BYTES:
                    raise ValueError("import file exceeds 2 GiB limit")
                destination.write(chunk)
        if not size:
            raise ValueError("import file is empty")
        return path, field.filename or ""
    except Exception:
        path.unlink(missing_ok=True)
        raise


async def import_preflight(request: web.Request):
    source, filename = await _read_import_file(request)
    token = ""
    try:
        token, manifest = await asyncio.to_thread(get_library().prepare_import, source, filename)
        preflight = await asyncio.to_thread(get_library().preflight_import, manifest)
        return {"token": token, "manifest": manifest, "preflight": preflight}
    except Exception:
        if token:
            get_library().discard_import(token)
        raise
    finally:
        source.unlink(missing_ok=True)


async def import_apply(request: web.Request):
    data = await _json(request)
    token = data.get("token")
    resolutions = data.get("resolutions", {})
    if not isinstance(token, str) or not isinstance(resolutions, dict):
        raise ValueError("token and resolutions are required")
    manifest, assets = get_library().staged_import(token)
    result = await asyncio.to_thread(
        get_library().apply_import,
        manifest,
        assets,
        {str(key): str(value) for key, value in resolutions.items()},
    )
    try:
        get_library().discard_import(token)
    except KeyError:
        pass
    return result


async def import_discard(request: web.Request):
    token = (await _json(request)).get("token")
    if not isinstance(token, str):
        raise ValueError("token is required")
    get_library().discard_import(token)
    return {"ok": True}


def register_prompt_library_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer

    routes = PromptServer.instance.routes
    routes.get(f"{API}/snapshot")(_handler(snapshot))
    for kind in ("category", "collection"):
        plural = f"{kind}s" if kind != "category" else "categories"
        routes.post(f"{API}/{plural}")(_handler(_create_named(kind), action=f"{kind}.created"))
        routes.patch(f"{API}/{plural}/{{id}}")(_handler(_update_named(kind), action=f"{kind}.updated"))
        routes.delete(f"{API}/{plural}/{{id}}")(_handler(_delete_named(kind), action=f"{kind}.deleted"))
    routes.post(f"{API}/categories/{{id}}/move")(_handler(move_category, action="category.moved"))
    routes.post(f"{API}/entries")(_handler(create_entry, action="entry.created"))
    routes.patch(f"{API}/entries/{{id}}")(_handler(update_entry, action="entry.updated"))
    routes.delete(f"{API}/entries/{{id}}")(_handler(delete_entry, action="entry.deleted"))
    routes.post(f"{API}/entries/batch")(_handler(batch_entries, action="entries.updated"))
    routes.post(f"{API}/entries/batch-delete")(_handler(delete_entries, action="entries.deleted"))
    routes.post(f"{API}/entries/usage")(_handler(record_usage, action="entries.usage.updated"))
    routes.post(f"{API}/reorder")(_handler(reorder, action="order.updated"))
    routes.post(f"{API}/entries/{{id}}/preview")(_handler(set_preview, action="entry.preview.updated"))
    routes.delete(f"{API}/entries/{{id}}/preview")(_handler(delete_preview, action="entry.preview.deleted"))
    routes.get(f"{API}/assets/{{hash}}")(_handler(asset))
    routes.post(f"{API}/export")(_handler(export_prepare))
    routes.get(f"{API}/export/{{token}}")(_handler(export_download))
    routes.post(f"{API}/import/preflight")(_handler(import_preflight))
    routes.post(f"{API}/import/apply")(_handler(import_apply, action="import.applied"))
    routes.post(f"{API}/import/discard")(_handler(import_discard))
    _registered = True
