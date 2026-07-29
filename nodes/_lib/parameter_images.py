"""Pure image-reference resolution helpers for ParameterPanel."""

from __future__ import annotations

import errno
from collections.abc import Callable
from typing import Any


def annotated_image_reference(value: Any) -> str | None:
    """Convert a saved ComfyUI image reference to its annotated path."""
    if value is None:
        return None
    if isinstance(value, dict):
        # `/upload/image` returns `name`; saved panel values use `filename`.
        filename = str(value.get("filename") or value.get("name") or "").strip()
        if not filename:
            return None
        subfolder = str(value.get("subfolder") or "").strip("/")
        image_type = str(value.get("type") or "input")
        annotated = f"{subfolder}/{filename}" if subfolder else filename
        return f"{annotated} [{image_type}]" if image_type != "input" else annotated
    if isinstance(value, str):
        return value.strip() or None
    raise ValueError("image parameter must contain a ComfyUI image reference")


def _is_missing_file_error(error: OSError) -> bool:
    return isinstance(error, FileNotFoundError) or error.errno == errno.ENOENT


def resolve_image_reference(
    value: Any,
    *,
    exists: Callable[[str], bool],
    load: Callable[[str], Any],
    fallback: Callable[[], Any],
) -> Any:
    """Load a reference, returning the explicit fallback only when it is absent."""
    annotated = annotated_image_reference(value)
    if annotated is None or not exists(annotated):
        return fallback()
    try:
        return load(annotated)
    except OSError as error:
        # The file may disappear after the existence check. Decode and permission
        # failures remain visible instead of being disguised as a missing image.
        if _is_missing_file_error(error):
            return fallback()
        raise


def image_reference_fingerprint(
    value: Any,
    *,
    exists: Callable[[str], bool],
    fingerprint: Callable[[str], str],
) -> str:
    """Include missing/present transitions in ComfyUI's execution cache key."""
    annotated = annotated_image_reference(value)
    if annotated is None:
        return "empty"
    if not exists(annotated):
        return f"missing:{annotated}"
    try:
        return f"present:{fingerprint(annotated)}"
    except OSError as error:
        if _is_missing_file_error(error):
            return f"missing:{annotated}"
        raise
