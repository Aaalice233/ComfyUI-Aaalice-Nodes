"""HTTP routes for personal ResolutionPreset entries."""

from __future__ import annotations

from aiohttp import web

from .resolution_preset_store import (
    PresetConflictError,
    PresetNotFoundError,
    get_resolution_preset_store,
)

API = "/aaalice/resolution-presets"
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
    if isinstance(exc, PresetConflictError):
        status = 409
    elif isinstance(exc, PresetNotFoundError):
        status = 404
    elif isinstance(exc, ValueError):
        status = 400
    else:
        status = 500
    return web.json_response({"error": type(exc).__name__, "message": str(exc)}, status=status)


async def list_presets(_request: web.Request) -> web.Response:
    try:
        return web.json_response(get_resolution_preset_store().load())
    except Exception as exc:
        return _error(exc)


async def save_preset(request: web.Request) -> web.Response:
    try:
        value = await _json(request)
        return web.json_response(get_resolution_preset_store().save(value.get("preset")))
    except Exception as exc:
        return _error(exc)


async def delete_preset(request: web.Request) -> web.Response:
    try:
        value = await _json(request)
        return web.json_response(get_resolution_preset_store().delete(value.get("id")))
    except Exception as exc:
        return _error(exc)


def register_resolution_preset_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer

    routes = PromptServer.instance.routes
    routes.get(API)(list_presets)
    routes.post(f"{API}/save")(save_preset)
    routes.post(f"{API}/delete")(delete_preset)
    _registered = True


__all__ = ["register_resolution_preset_routes"]
