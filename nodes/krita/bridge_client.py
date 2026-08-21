"""Short-lived, request-correlated communication with the local Krita Bridge."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Callable
from uuid import uuid4

from .._lib.krita_snapshot import (
    PROTOCOL_VERSION,
    KritaSnapshot,
    KritaSnapshotError,
    load_snapshot_tensors,
    parse_snapshot_response,
)

REQUEST_TIMEOUT = 15.0
SNAPSHOT_TIMEOUT = 120.0
POLL_INTERVAL = 0.05


def bridge_root() -> Path:
    return Path(tempfile.gettempdir()) / "aaalice-krita-bridge"


def _atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _read_json(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception as exc:
        raise KritaSnapshotError("invalid-response", f"failed to read Krita Bridge response: {exc}") from exc
    if not isinstance(data, dict):
        raise KritaSnapshotError("invalid-response", "Krita Bridge response must be an object")
    return data


def cleanup_request(root: Path, request_id: str, snapshot: KritaSnapshot | None = None) -> None:
    for path in (root / "requests" / f"{request_id}.json", root / "responses" / f"{request_id}.json"):
        path.unlink(missing_ok=True)
    for path in (root / "payloads" / f"{request_id}-image.png", root / "payloads" / f"{request_id}-mask.png"):
        path.unlink(missing_ok=True)
    if snapshot is not None:
        snapshot.image_path.unlink(missing_ok=True)
        if snapshot.mask_path is not None:
            snapshot.mask_path.unlink(missing_ok=True)


async def fetch_snapshot(
    *,
    root: Path | None = None,
    timeout: float = REQUEST_TIMEOUT,
    processing_timeout: float = SNAPSHOT_TIMEOUT,
    interrupt: Callable[[], None] | None = None,
):
    root = (root or bridge_root()).resolve()
    request_id = uuid4().hex
    request_path = root / "requests" / f"{request_id}.json"
    processing_path = request_path.with_suffix(".processing")
    response_path = root / "responses" / f"{request_id}.json"
    started_at = time.time()
    response_deadline = started_at + timeout
    request_deadline = response_deadline + processing_timeout
    accepted = False
    completion_deadline = None
    snapshot = None
    _atomic_json(request_path, {
        "protocol": PROTOCOL_VERSION,
        "request_id": request_id,
        "action": "fetch_snapshot",
        "deadline": request_deadline,
    })
    try:
        while True:
            if interrupt is not None:
                interrupt()
            if response_path.is_file():
                response = _read_json(response_path)
                if response.get("status") == "processing":
                    if not accepted:
                        accepted = True
                        completion_deadline = time.time() + processing_timeout
                else:
                    snapshot = parse_snapshot_response(response, request_id, root)
                    break
            if processing_path.is_file() and not accepted:
                accepted = True
                completion_deadline = time.time() + processing_timeout
            deadline = completion_deadline if accepted else response_deadline
            if time.time() >= deadline:
                if accepted:
                    raise KritaSnapshotError(
                        "snapshot-timeout",
                        f"Krita Bridge did not finish the snapshot within {processing_timeout:g} seconds",
                    )
                raise KritaSnapshotError(
                    "bridge-timeout",
                    f"Krita Bridge did not respond within {timeout:g} seconds",
                )
            await asyncio.sleep(POLL_INTERVAL)
        if interrupt is not None:
            interrupt()
        return (*await asyncio.to_thread(load_snapshot_tensors, snapshot), snapshot)
    finally:
        cleanup_request(root, request_id, snapshot)


__all__ = ["REQUEST_TIMEOUT", "SNAPSHOT_TIMEOUT", "bridge_root", "cleanup_request", "fetch_snapshot"]
