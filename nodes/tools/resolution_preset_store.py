"""Per-user personal preset persistence for ResolutionPreset."""

from __future__ import annotations

import copy
import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any

from .._lib.resolution_preset import validate_dimension

ALIGNMENTS = {8, 16, 32, 64}
MAX_NAME_LENGTH = 48


class PresetConflictError(ValueError):
    """Raised when a personal preset name already exists."""


class PresetNotFoundError(ValueError):
    """Raised when a requested personal preset does not exist."""


def _empty() -> dict[str, Any]:
    return {"version": 1, "revision": 0, "presets": []}


def _name(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("preset name must be a string")
    result = value.strip()
    if not 1 <= len(result) <= MAX_NAME_LENGTH:
        raise ValueError(f"preset name must contain 1 to {MAX_NAME_LENGTH} characters")
    return result


def _preset(raw: object, *, require_id: bool) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("preset must be an object")
    preset_id = raw.get("id")
    if require_id and (not isinstance(preset_id, str) or not preset_id.strip()):
        raise ValueError("preset id is required")
    alignment = raw.get("alignment", 8)
    if isinstance(alignment, bool) or not isinstance(alignment, int) or alignment not in ALIGNMENTS:
        raise ValueError("preset alignment must be one of 8, 16, 32, or 64")
    return {
        "id": str(preset_id).strip() if preset_id else "",
        "name": _name(raw.get("name")),
        "width": validate_dimension(raw.get("width"), "preset width", alignment=alignment),
        "height": validate_dimension(raw.get("height"), "preset height", alignment=alignment),
        "alignment": alignment,
    }


class ResolutionPresetStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.RLock()

    def load(self) -> dict[str, Any]:
        with self._lock:
            if not self.path.exists():
                return _empty()
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception as exc:
                raise RuntimeError(f"failed to read Resolution Preset settings at {self.path}: {exc}") from exc
            if not isinstance(raw, dict) or raw.get("version") != 1:
                raise RuntimeError("Resolution Preset settings must use version 1")
            presets = raw.get("presets")
            if not isinstance(presets, list):
                raise RuntimeError("Resolution Preset presets must be a list")
            normalized = [_preset(item, require_id=True) for item in presets]
            ids = [item["id"] for item in normalized]
            names = [item["name"].casefold() for item in normalized]
            if len(ids) != len(set(ids)):
                raise RuntimeError("Resolution Preset ids must be unique")
            if len(names) != len(set(names)):
                raise RuntimeError("Resolution Preset names must be unique")
            return {"version": 1, "revision": max(0, int(raw.get("revision", 0))), "presets": normalized}

    def _write(self, data: dict[str, Any]) -> dict[str, Any]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        try:
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temporary, self.path)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        return copy.deepcopy(data)

    def save(self, raw: object) -> dict[str, Any]:
        candidate = _preset(raw, require_id=False)
        with self._lock:
            data = self.load()
            presets = data["presets"]
            existing_index = next((index for index, item in enumerate(presets) if item["id"] == candidate["id"]), None) if candidate["id"] else None
            if candidate["id"] and existing_index is None:
                raise PresetNotFoundError("personal preset was not found")
            conflict = next((item for item in presets if item["name"].casefold() == candidate["name"].casefold() and item["id"] != candidate["id"]), None)
            if conflict:
                raise PresetConflictError("personal preset name already exists")
            if existing_index is None:
                candidate["id"] = str(uuid.uuid4())
                presets.append(candidate)
            else:
                presets[existing_index] = candidate
            data["revision"] += 1
            return self._write(data)

    def delete(self, preset_id: object) -> dict[str, Any]:
        if not isinstance(preset_id, str) or not preset_id.strip():
            raise ValueError("preset id is required")
        with self._lock:
            data = self.load()
            remaining = [item for item in data["presets"] if item["id"] != preset_id]
            if len(remaining) == len(data["presets"]):
                raise PresetNotFoundError("personal preset was not found")
            data["presets"] = remaining
            data["revision"] += 1
            return self._write(data)


_store: ResolutionPresetStore | None = None


def get_resolution_preset_store() -> ResolutionPresetStore:
    global _store
    if _store is None:
        import folder_paths

        _store = ResolutionPresetStore(Path(folder_paths.get_user_directory()) / "aaalice-nodes" / "resolution_presets.json")
    return _store


__all__ = [
    "PresetConflictError",
    "PresetNotFoundError",
    "ResolutionPresetStore",
    "get_resolution_preset_store",
]
