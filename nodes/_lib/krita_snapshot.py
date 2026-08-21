"""Pure validation and decoding for Krita Bridge snapshot responses."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image

from .image_file_metadata import (
    SUPPORTED_IMAGE_METADATA_EXTENSIONS,
    extract_image_generation_parameters,
)

PROTOCOL_VERSION = 1
MAX_PAYLOAD_BYTES = 512 * 1024 * 1024


class KritaSnapshotError(RuntimeError):
    """A bridge response is invalid or reports an explicit failure."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class KritaDocument:
    name: str
    width: int
    height: int
    color_model: str


@dataclass(frozen=True)
class KritaSnapshot:
    request_id: str
    document: KritaDocument
    image_path: Path
    selection_present: bool
    mask_path: Path | None
    selection_bounds: tuple[int, int, int, int] | None
    parameters: str | None


def _object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise KritaSnapshotError("invalid-response", f"{name} must be an object")
    return value


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise KritaSnapshotError("invalid-response", f"{name} must be a non-empty string")
    return value.strip()


def _dimension(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise KritaSnapshotError("invalid-response", f"{name} must be a positive integer")
    return value


def _payload_path(value: Any, root: Path, name: str) -> Path:
    path = Path(_text(value, name)).resolve()
    payload_root = (root / "payloads").resolve()
    try:
        path.relative_to(payload_root)
    except ValueError as exc:
        raise KritaSnapshotError("unsafe-path", f"{name} is outside the Krita Bridge payload directory") from exc
    if path.suffix.lower() != ".png":
        raise KritaSnapshotError("invalid-format", f"{name} must reference a PNG file")
    if not path.is_file():
        raise KritaSnapshotError("missing-payload", f"{name} does not exist")
    if path.stat().st_size > MAX_PAYLOAD_BYTES:
        raise KritaSnapshotError("payload-too-large", f"{name} exceeds the 512 MiB safety limit")
    return path


def _source_parameters(value: Any) -> str | None:
    if value is None:
        return None
    source_path = Path(_text(value, "source_path")).resolve()
    if source_path.suffix.lower() not in SUPPORTED_IMAGE_METADATA_EXTENSIONS:
        raise KritaSnapshotError(
            "invalid-source-format",
            "source_path must reference a PNG, JPEG, or WebP image",
        )
    if not source_path.is_file():
        raise KritaSnapshotError(
            "missing-source",
            f"the active Krita document source no longer exists: {source_path}",
        )
    try:
        return extract_image_generation_parameters(source_path)
    except Exception as exc:
        raise KritaSnapshotError(
            "source-metadata-decode-failed",
            f"failed to read generation metadata from the active Krita document source: {exc}",
        ) from exc


def parse_snapshot_response(data: Any, expected_request_id: str, root: Path) -> KritaSnapshot:
    response = _object(data, "response")
    if response.get("protocol") != PROTOCOL_VERSION:
        raise KritaSnapshotError(
            "protocol-mismatch",
            f"Krita Bridge protocol {response.get('protocol')!r} is incompatible with protocol {PROTOCOL_VERSION}",
        )
    request_id = _text(response.get("request_id"), "request_id")
    if request_id != expected_request_id:
        raise KritaSnapshotError("request-mismatch", "Krita Bridge response belongs to another request")
    status = _text(response.get("status"), "status")
    if status != "success":
        error = _object(response.get("error"), "error")
        code = _text(error.get("code"), "error.code")
        message = _text(error.get("message"), "error.message")
        raise KritaSnapshotError(code, message)

    document_data = _object(response.get("document"), "document")
    document = KritaDocument(
        name=_text(document_data.get("name"), "document.name"),
        width=_dimension(document_data.get("width"), "document.width"),
        height=_dimension(document_data.get("height"), "document.height"),
        color_model=_text(document_data.get("color_model"), "document.color_model"),
    )
    selection = _object(response.get("selection"), "selection")
    present = selection.get("present")
    if not isinstance(present, bool):
        raise KritaSnapshotError("invalid-response", "selection.present must be a boolean")
    mask_path = _payload_path(selection.get("mask_path"), root, "selection.mask_path") if present else None
    bounds = selection.get("bounds")
    if present:
        if not isinstance(bounds, list) or len(bounds) != 4 or any(isinstance(item, bool) or not isinstance(item, int) for item in bounds):
            raise KritaSnapshotError("invalid-response", "selection.bounds must contain four integers")
        selection_bounds = tuple(bounds)
    else:
        selection_bounds = None
        if bounds is not None or selection.get("mask_path") is not None:
            raise KritaSnapshotError("invalid-response", "an absent selection must not include mask data")

    return KritaSnapshot(
        request_id=request_id,
        document=document,
        image_path=_payload_path(response.get("image_path"), root, "image_path"),
        selection_present=present,
        mask_path=mask_path,
        selection_bounds=selection_bounds,
        parameters=_source_parameters(response.get("source_path")),
    )


def load_snapshot_tensors(snapshot: KritaSnapshot) -> tuple[torch.Tensor, torch.Tensor]:
    try:
        with Image.open(snapshot.image_path) as source:
            image = source.convert("RGB")
            if image.size != (snapshot.document.width, snapshot.document.height):
                raise KritaSnapshotError(
                    "image-size-mismatch",
                    f"Krita image is {image.width}x{image.height}, expected {snapshot.document.width}x{snapshot.document.height}",
                )
            image_array = np.asarray(image, dtype=np.float32).copy() / 255.0
    except KritaSnapshotError:
        raise
    except Exception as exc:
        raise KritaSnapshotError("image-decode-failed", f"failed to decode Krita image: {exc}") from exc

    if snapshot.selection_present:
        try:
            with Image.open(snapshot.mask_path) as source:
                mask = source.convert("L")
                if mask.size != (snapshot.document.width, snapshot.document.height):
                    raise KritaSnapshotError(
                        "mask-size-mismatch",
                        f"Krita mask is {mask.width}x{mask.height}, expected {snapshot.document.width}x{snapshot.document.height}",
                    )
                mask_array = np.asarray(mask, dtype=np.float32).copy() / 255.0
        except KritaSnapshotError:
            raise
        except Exception as exc:
            raise KritaSnapshotError("mask-decode-failed", f"failed to decode Krita selection mask: {exc}") from exc
    else:
        mask_array = np.zeros((snapshot.document.height, snapshot.document.width), dtype=np.float32)

    return torch.from_numpy(image_array)[None, ...], torch.from_numpy(mask_array)[None, ...]


__all__ = [
    "KritaDocument",
    "KritaSnapshot",
    "KritaSnapshotError",
    "PROTOCOL_VERSION",
    "load_snapshot_tensors",
    "parse_snapshot_response",
]
