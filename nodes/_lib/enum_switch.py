"""Pure route validation and selection for EnumSwitch."""

from __future__ import annotations

import json
from typing import Any

MAX_ENUM_BRANCHES = 32


def parse_routes(value: str | dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, str]]:
    """Parse and validate the serialized EnumSwitch route payload."""
    try:
        payload = json.loads(value) if isinstance(value, str) else value
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid EnumSwitch route JSON: {exc.msg}") from exc

    raw_routes = payload.get("routes") if isinstance(payload, dict) else payload
    if not isinstance(raw_routes, list):
        raise ValueError("EnumSwitch routes must be a list")
    if not 1 <= len(raw_routes) <= MAX_ENUM_BRANCHES:
        raise ValueError(f"EnumSwitch requires 1 to {MAX_ENUM_BRANCHES} branches")

    routes: list[dict[str, str]] = []
    ids: set[str] = set()
    keys: set[str] = set()
    inputs: set[str] = set()
    for index, route in enumerate(raw_routes):
        if not isinstance(route, dict):
            raise ValueError(f"EnumSwitch route {index + 1} must be an object")
        route_id = str(route.get("id") or "").strip()
        key = str(route.get("key") or "").strip()
        input_id = str(route.get("input") or f"branch_{index + 1}").strip()
        if not route_id:
            raise ValueError(f"EnumSwitch route {index + 1} is missing id")
        if not key:
            raise ValueError(f"EnumSwitch route {index + 1} has an empty key")
        if input_id != f"branch_{index + 1}":
            raise ValueError(f"EnumSwitch route {key!r} has an invalid input id")
        if route_id in ids:
            raise ValueError(f"duplicate EnumSwitch route id: {route_id!r}")
        if key in keys:
            raise ValueError(f"duplicate EnumSwitch route key: {key!r}")
        if input_id in inputs:
            raise ValueError(f"duplicate EnumSwitch input id: {input_id!r}")
        ids.add(route_id)
        keys.add(key)
        inputs.add(input_id)
        routes.append({"id": route_id, "key": key, "input": input_id})
    return routes


def selected_input(selector: str, routes_value: str | dict[str, Any] | list[dict[str, Any]]) -> str:
    """Return the protocol input id selected by an exact route-key match."""
    selected = str(selector or "")
    for route in parse_routes(routes_value):
        if route["key"] == selected:
            return route["input"]
    raise ValueError(f"EnumSwitch selector {selected!r} does not match any branch")

