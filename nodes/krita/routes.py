"""HTTP routes for Krita Bridge status, managed updates, and maintenance."""

from __future__ import annotations

import logging

from aiohttp import web

from .bridge_service import auto_update_bridge, bridge_status, install_bridge

API = "/aaalice/krita"
_registered = False
logger = logging.getLogger(__name__)


def _error(exc: Exception) -> web.Response:
    status = 409 if isinstance(exc, RuntimeError) else 500
    return web.json_response({"error": type(exc).__name__, "message": str(exc)}, status=status)


def _attempt_auto_update(*, log_failure: bool = False) -> None:
    try:
        auto_update_bridge()
    except RuntimeError as exc:
        if log_failure:
            logger.warning("Krita Bridge automatic update failed: %s", exc)


async def get_status(_request: web.Request) -> web.Response:
    try:
        _attempt_auto_update()
        return web.json_response(bridge_status())
    except Exception as exc:
        return _error(exc)


async def install(_request: web.Request) -> web.Response:
    try:
        return web.json_response(install_bridge(repair=False))
    except Exception as exc:
        return _error(exc)


async def repair(_request: web.Request) -> web.Response:
    try:
        return web.json_response(install_bridge(repair=True))
    except Exception as exc:
        return _error(exc)


async def test_connection(_request: web.Request) -> web.Response:
    try:
        status = bridge_status()
        if not status["online"]:
            raise RuntimeError("Krita Bridge is not online")
        return web.json_response(status)
    except Exception as exc:
        return _error(exc)


def register_krita_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer

    routes = PromptServer.instance.routes
    routes.get(f"{API}/status")(get_status)
    routes.post(f"{API}/install")(install)
    routes.post(f"{API}/repair")(repair)
    routes.post(f"{API}/test")(test_connection)
    _registered = True
    _attempt_auto_update(log_failure=True)


__all__ = ["register_krita_routes"]
