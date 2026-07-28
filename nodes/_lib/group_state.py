"""Pure GroupIsEnabled payload helpers."""

from __future__ import annotations

import json
from collections.abc import Mapping

GROUP_STATES = ("enabled", "disabled", "mixed", "empty", "missing")
LOGIC_MODES = ("and", "or")
LOGIC_EXPECTS = ("enabled", "disabled")


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


def assert_group_usable(title: str, state: str) -> None:
    """Reject snapshots that cannot answer the probe instead of guessing a state."""
    if state == "missing":
        raise ValueError(f"cannot find the selected visual group: {title or '(none selected)'}")
    if state == "empty":
        raise ValueError(f"found an empty visual group: {title}")


def parse_group_logic_payload(payload_json: object) -> dict:
    if not isinstance(payload_json, str) or not payload_json.strip():
        raise ValueError("group_logic_payload is required")
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError as exc:
        raise ValueError("group_logic_payload must be valid JSON") from exc
    if not isinstance(payload, Mapping) or payload.get("version") != 1:
        raise ValueError("group_logic_payload must use version 1")
    mode = str(payload.get("mode", ""))
    if mode not in LOGIC_MODES:
        raise ValueError(f"group_logic_payload has unknown mode: {mode}")
    raw_conditions = payload.get("conditions")
    if not isinstance(raw_conditions, list) or not raw_conditions:
        raise ValueError("group_logic_payload requires at least one condition")
    conditions = []
    for item in raw_conditions:
        if not isinstance(item, Mapping):
            raise ValueError("group_logic_payload conditions must be objects")
        expect = str(item.get("expect", ""))
        state = str(item.get("state", ""))
        if expect not in LOGIC_EXPECTS:
            raise ValueError(f"group_logic_payload has unknown expect: {expect}")
        if state not in GROUP_STATES:
            raise ValueError(f"group_logic_payload has unknown state: {state}")
        conditions.append({"title": str(item.get("title", "")), "expect": expect, "state": state})
    return {"mode": mode, "conditions": conditions}


def evaluate_group_logic(payload: Mapping) -> bool:
    """Combine per-group snapshots with the requested gate; unusable groups fail."""
    matches = []
    for condition in payload["conditions"]:
        assert_group_usable(condition["title"], condition["state"])
        matches.append(condition["state"] == condition["expect"])
    return all(matches) if payload["mode"] == "and" else any(matches)


__all__ = [
    "GROUP_STATES",
    "LOGIC_EXPECTS",
    "LOGIC_MODES",
    "assert_group_usable",
    "evaluate_group_logic",
    "parse_group_logic_payload",
    "parse_group_state_payload",
]
