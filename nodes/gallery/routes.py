"""Thin JSON and media routes for Booru Gallery."""

from __future__ import annotations

import aiohttp
from aiohttp import web

from .service import get_gallery_service
from .settings import get_gallery_settings_store

API = "/aaalice/booru-gallery"
_registered = False


async def _json(request: web.Request) -> dict:
    try:
        value = await request.json()
    except Exception as exc:
        raise ValueError("request body must be valid JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("request body must be a JSON object")
    return value


def _error(exc: Exception) -> web.Response:
    status = 400 if isinstance(exc, ValueError) else 502 if isinstance(exc, (aiohttp.ClientError, TimeoutError, RuntimeError)) else 500
    payload = {"error": type(exc).__name__, "message": str(exc)}
    code = getattr(exc, "code", None)
    if code:
        payload["code"] = code
    return web.json_response(payload, status=status)


async def sources(_request):
    return web.json_response({"sources": get_gallery_service().sources()})


async def search(request):
    try:
        ratings = [item for item in request.query.getall("rating", []) if item]
        page = int(request.query["page"]) if request.query.get("page") else None
        result = await get_gallery_service().search(request.query.get("source", ""), request.query.get("query", ""), ratings,
                                                    request.query.get("sort", "latest"), request.query.get("cursor") or None,
                                                    int(request.query.get("limit", "60")), page)
        return web.json_response(result)
    except Exception as exc:
        return _error(exc)


async def ranking(request):
    try:
        ratings = [item for item in request.query.getall("rating", []) if item]
        page = int(request.query["page"]) if request.query.get("page") else None
        result = await get_gallery_service().ranking(request.query.get("source", ""), request.query.get("period", ""),
                                                     ratings, request.query.get("cursor") or None,
                                                     int(request.query.get("limit", "60")), page)
        return web.json_response(result)
    except Exception as exc:
        return _error(exc)


async def detail(request):
    try:
        return web.json_response(await get_gallery_service().detail(request.query.get("source", ""), request.query.get("postId", "")))
    except Exception as exc:
        return _error(exc)


async def media(request):
    try:
        data, content_type, _final = await get_gallery_service().fetch_media(request.query.get("source", ""), request.query.get("url", ""))
        response = web.Response(body=data, content_type=content_type)
        response.headers["Cache-Control"] = "private, max-age=86400"
        response.headers["Content-Length"] = str(len(data))
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
    except Exception as exc:
        return _error(exc)


async def settings_get(_request):
    try:
        return web.json_response(get_gallery_settings_store().public())
    except Exception as exc:
        return _error(exc)


async def settings_save(request):
    try:
        return web.json_response(get_gallery_settings_store().save(await _json(request)))
    except Exception as exc:
        return _error(exc)


async def test_connection(request):
    try:
        value = await _json(request)
        source = value.get("source", "")
        credentials = value.get("credentials", {})
        if not isinstance(credentials, dict):
            raise ValueError("credentials must be an object")
        return web.json_response(await get_gallery_service().test_credentials(source, credentials))
    except Exception as exc:
        return _error(exc)


async def favorites(request):
    try:
        page = int(request.query["page"]) if request.query.get("page") else None
        result = await get_gallery_service().favorites(request.query.get("source", ""), request.query.get("cursor") or None,
                                                       int(request.query.get("limit", "60")), page)
        return web.json_response(result)
    except Exception as exc:
        return _error(exc)


async def favorite_set(request):
    try:
        value = await _json(request)
        return web.json_response(await get_gallery_service().set_favorite(str(value.get("source", "")), str(value.get("postId", "")), bool(value.get("favorite"))))
    except Exception as exc:
        return _error(exc)


async def clear_cache(_request):
    try:
        get_gallery_service().clear_caches()
        return web.json_response({"ok": True})
    except Exception as exc:
        return _error(exc)


def register_gallery_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer
    routes = PromptServer.instance.routes
    routes.get(f"{API}/sources")(sources)
    routes.get(f"{API}/search")(search)
    routes.get(f"{API}/ranking")(ranking)
    routes.get(f"{API}/detail")(detail)
    routes.get(f"{API}/media")(media)
    routes.get(f"{API}/settings")(settings_get)
    # Keep read and write endpoints distinct. Some ComfyUI proxy/router stacks collapse
    # same-path custom routes during reload, which can send GET requests to the POST handler.
    routes.post(f"{API}/settings/save")(settings_save)
    routes.post(f"{API}/test")(test_connection)
    routes.get(f"{API}/favorites")(favorites)
    routes.post(f"{API}/favorite")(favorite_set)
    routes.post(f"{API}/cache/clear")(clear_cache)
    _registered = True
