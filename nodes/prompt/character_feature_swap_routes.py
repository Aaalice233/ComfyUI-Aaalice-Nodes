"""HTTP settings routes for CharacterFeatureSwap."""

from __future__ import annotations

import aiohttp
from aiohttp import web

from .character_feature_swap_settings import create_chat_completion, fetch_models, settings_for_request
from .character_feature_swap_store import get_character_feature_swap_store

API = "/aaalice/character-feature-swap"
_registered = False


async def _json(request: web.Request) -> dict:
    try:
        data = await request.json()
    except Exception as exc:
        raise ValueError("request body must be valid JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("request body must be a JSON object")
    return data


def _error(exc: Exception) -> web.Response:
    if isinstance(exc, ValueError):
        status = 400
    elif isinstance(exc, aiohttp.ClientResponseError):
        status = 502
    elif isinstance(exc, aiohttp.ClientError | TimeoutError):
        status = 502
    else:
        status = 500
    return web.json_response({"error": type(exc).__name__, "message": str(exc)}, status=status)


async def get_settings(_request: web.Request) -> web.Response:
    try:
        return web.json_response(get_character_feature_swap_store().public())
    except Exception as exc:
        return _error(exc)


async def save_settings(request: web.Request) -> web.Response:
    try:
        return web.json_response(get_character_feature_swap_store().save(await _json(request)))
    except Exception as exc:
        return _error(exc)


async def list_models(request: web.Request) -> web.Response:
    try:
        store = get_character_feature_swap_store()
        settings = settings_for_request(store.load(), await _json(request))
        return web.json_response({"models": await fetch_models(settings)})
    except Exception as exc:
        return _error(exc)


async def test_connection(request: web.Request) -> web.Response:
    try:
        store = get_character_feature_swap_store()
        settings = settings_for_request(store.load(), await _json(request))
        models = await fetch_models(settings)
        if settings["model"] not in models:
            raise ValueError(f"configured DeepSeek model is not available: {settings['model']}")
        await create_chat_completion(settings, "Reply with exactly: OK")
        return web.json_response({"ok": True, "model_count": len(models)})
    except Exception as exc:
        return _error(exc)


def register_character_feature_swap_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer

    routes = PromptServer.instance.routes
    routes.get(f"{API}/settings")(get_settings)
    routes.post(f"{API}/settings")(save_settings)
    routes.post(f"{API}/models")(list_models)
    routes.post(f"{API}/test")(test_connection)
    _registered = True
