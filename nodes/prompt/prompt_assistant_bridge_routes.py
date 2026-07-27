"""HTTP info route for PromptAssistantBridge."""

from __future__ import annotations

from aiohttp import web

from . import prompt_assistant_bridge_client as client

API = "/aaalice/prompt-assistant-bridge"
_registered = False


async def info(_request: web.Request) -> web.Response:
    api = client.resolve_prompt_assistant()
    return web.json_response({"installed": api is not None, "js_base": client.js_base()})


def register_prompt_assistant_bridge_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer

    routes = PromptServer.instance.routes
    routes.get(f"{API}/info")(info)
    _registered = True


__all__ = ["register_prompt_assistant_bridge_routes"]
