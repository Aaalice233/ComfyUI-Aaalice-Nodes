"""Pure PromptSelector payload validation and prompt composition."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


@dataclass(frozen=True)
class PromptSelection:
    entry_id: str
    text: str
    weight: Decimal


def _parse_weight(value: Any) -> Decimal:
    try:
        weight = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"invalid prompt weight: {value!r}") from exc
    if not weight.is_finite() or weight < 0 or weight > 20:
        raise ValueError(f"prompt weight must be between 0 and 20: {value!r}")
    if weight.as_tuple().exponent < -2:
        raise ValueError(f"prompt weight must use at most two decimal places: {value!r}")
    return weight


def parse_selection_payload(payload_json: str) -> tuple[list[PromptSelection], str]:
    try:
        payload = json.loads(payload_json or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid PromptSelector payload JSON: {exc.msg}") from exc
    if not isinstance(payload, dict) or payload.get("version", 1) != 1:
        raise ValueError("PromptSelector payload must be a version 1 object")
    separator = payload.get("separator", ", ")
    if not isinstance(separator, str):
        raise ValueError("PromptSelector separator must be a string")
    raw_selections = payload.get("selections", [])
    if not isinstance(raw_selections, list):
        raise ValueError("PromptSelector selections must be a list")
    selections: list[PromptSelection] = []
    seen: set[str] = set()
    for index, raw in enumerate(raw_selections):
        if not isinstance(raw, dict):
            raise ValueError(f"PromptSelector selection {index} must be an object")
        entry_id = raw.get("entryId")
        text = raw.get("text")
        if not isinstance(entry_id, str) or not entry_id:
            raise ValueError(f"PromptSelector selection {index} has no entry id")
        if entry_id in seen:
            raise ValueError(f"PromptSelector contains duplicate entry id: {entry_id}")
        if not isinstance(text, str):
            raise ValueError(f"PromptSelector entry {entry_id} is missing from the prompt library")
        seen.add(entry_id)
        selections.append(PromptSelection(entry_id, text, _parse_weight(raw.get("weight", 1))))
    return selections, separator


def compose_prompt(prefix: str, payload_json: str) -> str:
    selections, separator = parse_selection_payload(payload_json)
    parts: list[str] = []
    if prefix:
        parts.append(prefix)
    for selection in selections:
        if selection.weight == 1:
            parts.append(selection.text)
            continue
        formatted = format(selection.weight.normalize(), "f")
        parts.append(f"({selection.text}:{formatted})")
    return separator.join(parts)
