"""Pure GroupIsEnabled payload helpers."""

from __future__ import annotations

import json
from collections.abc import Mapping

GROUP_STATES = ("enabled", "disabled", "mixed", "empty", "missing")


def parse_group_state_payload(payload_json: object) -> dict[str, str]:
    if not isinstance(payload_json, str) or not payload_json.strip():
        raise ValueError("group_state_payload is required")
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError as exc:
        raise ValueError("group_state_payload must be valid JSON") from exc
    if not isinstance(payload, Mapping) or payload.get("version") != 1:
        raise ValueError("group_state_payload must use version 1")
    state = str(payload.get("state", ""))
    if state not in GROUP_STATES:
        raise ValueError(f"group_state_payload has unknown state: {state}")
    return {"title": str(payload.get("title", "")), "state": state}


__all__ = ["GROUP_STATES", "parse_group_state_payload"]
