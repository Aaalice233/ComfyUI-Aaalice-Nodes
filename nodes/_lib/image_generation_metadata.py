"""Versioned payload for transferring complete image generation parameters."""

from __future__ import annotations

from typing import Any

IMAGE_GENERATION_METADATA_SCHEMA = "aaalice.image-generation-metadata"
IMAGE_GENERATION_METADATA_VERSION = 1


def build_image_generation_metadata(parameters: str | None) -> dict[str, Any]:
    """Create a normalized metadata-transfer payload."""
    if parameters is not None and not isinstance(parameters, str):
        raise TypeError("parameters must be a string or None")
    if parameters == "":
        parameters = None
    return {
        "schema": IMAGE_GENERATION_METADATA_SCHEMA,
        "version": IMAGE_GENERATION_METADATA_VERSION,
        "parameters": parameters,
    }


def is_image_generation_metadata(value: Any) -> bool:
    """Return whether value declares this payload schema."""
    return (
        isinstance(value, dict)
        and value.get("schema") == IMAGE_GENERATION_METADATA_SCHEMA
    )


def parse_image_generation_metadata(value: Any) -> str | None:
    """Validate a payload and return its complete parameters value."""
    if not isinstance(value, dict):
        raise TypeError("image generation metadata must be a dictionary")
    if value.get("schema") != IMAGE_GENERATION_METADATA_SCHEMA:
        raise ValueError(
            f"unsupported image generation metadata schema: {value.get('schema')!r}"
        )
    if value.get("version") != IMAGE_GENERATION_METADATA_VERSION:
        raise ValueError(
            f"unsupported image generation metadata version: {value.get('version')!r}"
        )
    if "parameters" not in value:
        raise ValueError("image generation metadata is missing parameters")

    parameters = value["parameters"]
    if parameters is not None and not isinstance(parameters, str):
        raise TypeError("image generation metadata parameters must be a string or None")
    if parameters == "":
        return None
    return parameters
