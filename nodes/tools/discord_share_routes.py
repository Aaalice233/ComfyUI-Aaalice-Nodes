"""Public Discord share relay configuration.

Webhook and OAuth secrets never enter ComfyUI. This route only exposes the
public relay and community URLs used by the browser extension.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

from aiohttp import web

API = "/aaalice/discord-share"
DEFAULT_RELAY_URL = "https://aaalice-discord-share.ljk2515448788ljk.workers.dev"
DEFAULT_COMMUNITY_URL = ""
_registered = False


def _public_url(environment_key: str, default: str = "") -> str:
    value = os.getenv(environment_key, default).strip().rstrip("/")
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{environment_key} must be an absolute HTTP(S) URL")
    return value


def public_config() -> dict[str, object]:
    relay_url = _public_url("AAALICE_DISCORD_SHARE_RELAY_URL", DEFAULT_RELAY_URL)
    return {
        "enabled": bool(relay_url),
        "relay_url": relay_url,
        "community_url": _public_url(
            "AAALICE_DISCORD_SHARE_COMMUNITY_URL",
            DEFAULT_COMMUNITY_URL,
        ),
    }


async def get_config(_request: web.Request) -> web.Response:
    try:
        return web.json_response(public_config())
    except ValueError as exc:
        return web.json_response(
            {"error": type(exc).__name__, "message": str(exc)},
            status=500,
        )


def register_discord_share_routes() -> None:
    global _registered
    if _registered:
        return
    from server import PromptServer

    PromptServer.instance.routes.get(f"{API}/config")(get_config)
    _registered = True
