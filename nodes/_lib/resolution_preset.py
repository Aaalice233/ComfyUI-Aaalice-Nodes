"""Pure validation helpers for ResolutionPreset."""

from __future__ import annotations

import json
from typing import Any

BASE_ALIGNMENT = 8
MIN_RESOLUTION = 16
FALLBACK_MAX_RESOLUTION = 16384


def comfy_max_resolution() -> int:
    """Return ComfyUI's current maximum without making pure tests depend on it."""
    try:
        from nodes import MAX_RESOLUTION  # type: ignore[attr-defined]
    except (ImportError, AttributeError):
        return FALLBACK_MAX_RESOLUTION
    return int(MAX_RESOLUTION)


def validate_dimension(value: object, field: str, *, alignment: int = BASE_ALIGNMENT) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer")
    maximum = comfy_max_resolution()
    if not MIN_RESOLUTION <= value <= maximum:
        raise ValueError(f"{field} must be between {MIN_RESOLUTION} and {maximum}")
    if value % alignment:
        raise ValueError(f"{field} must be divisible by {alignment}")
    return value


def parse_resolution_payload(raw: object) -> tuple[int, int]:
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("resolution_json is required")
    try:
        payload: Any = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("resolution_json must be valid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("resolution_json must be an object")
    if payload.get("version") != 1:
        raise ValueError("resolution_json must use version 1")
    return (
        validate_dimension(payload.get("width"), "width"),
        validate_dimension(payload.get("height"), "height"),
    )


__all__ = [
    "BASE_ALIGNMENT",
    "FALLBACK_MAX_RESOLUTION",
    "MIN_RESOLUTION",
    "comfy_max_resolution",
    "parse_resolution_payload",
    "validate_dimension",
]
