"""Booru Gallery settings persistence with secret redaction."""

from __future__ import annotations

import copy
import json
import os
import threading
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

from .._lib.booru_gallery import CATEGORY_ORDER, DEFAULT_PROMPT_CATEGORIES


SELECTION_STAMPS = {
    "inspection", "approved", "pass", "qa", "audit", "certified", "verified", "selected",
    "quality", "accepted", "official", "checked", "pure", "crown",
    "inspectionDate", "inspectionReverse", "passDate", "qaDate", "reviewBadge", "birthday",
    "organic", "silverCapital", "visa", "hotPick", "soldOut", "hot", "nationwideShipping", "nationwideFlight",
    "sfShipping", "qualityGuarantee", "praise", "delicacySquare", "traditionVertical",
    "chinaCuisine", "ruyi", "snowCuisine", "traditionCircle", "delicacyWide", "traditionWide",
    "auspicious", "exclusiveCertification", "soldOutPostal", "quarantineQualified",
}


def default_settings() -> dict[str, Any]:
    return {
        "version": 1,
        "revision": 0,
        "defaultSource": "danbooru",
        "blacklist": [],
        "outputFilterTags": [],
        "promptDefaults": {"categories": list(DEFAULT_PROMPT_CATEGORIES), "replaceUnderscores": False,
                           "escapeParentheses": False},
        "tooltip": True,
        "selectionStamp": "quarantineQualified",
        "timeout": 30,
        "cacheBudgetMiB": 1024,
        "credentials": {
            "danbooru": {"username": "", "apiKey": ""},
            "gelbooru": {"userId": "", "apiKey": ""},
            "safebooru": {},
            "aitag": {},
        },
    }


def _string_list(value: Any, field: str) -> list[str]:
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError(f"{field} values must be strings")
        item = item.strip()
        if item and item not in result:
            result.append(item)
    return result


def _normalize_gelbooru_credentials(settings: dict[str, Any]) -> None:
    credentials = settings.get("credentials")
    gelbooru = credentials.get("gelbooru") if isinstance(credentials, dict) else None
    if not isinstance(gelbooru, dict):
        return
    raw_key = str(gelbooru.get("apiKey") or "").strip()
    copied = parse_qs(raw_key.lstrip("?&")) if "=" in raw_key else {}
    api_key = (copied.get("api_key") or [""])[0].strip()
    if not api_key:
        return
    gelbooru["apiKey"] = api_key
    copied_user = (copied.get("user_id") or [""])[0].strip()
    if copied_user and not str(gelbooru.get("userId") or "").strip():
        gelbooru["userId"] = copied_user


class GallerySettingsStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.RLock()

    def load(self) -> dict[str, Any]:
        with self._lock:
            settings = default_settings()
            if self.path.exists():
                try:
                    raw = json.loads(self.path.read_text(encoding="utf-8"))
                except Exception as exc:
                    raise RuntimeError(f"failed to read Booru Gallery settings at {self.path}: {exc}") from exc
                if not isinstance(raw, dict):
                    raise RuntimeError("Booru Gallery settings root must be an object")
                for key in settings:
                    if key in raw:
                        settings[key] = raw[key]
                settings["credentials"] = {**default_settings()["credentials"], **(raw.get("credentials") or {})}
            return self._validate(settings)

    def _validate(self, settings: dict[str, Any]) -> dict[str, Any]:
        if settings.get("defaultSource") not in {"danbooru", "gelbooru", "safebooru", "aitag"}:
            raise ValueError("defaultSource is invalid")
        timeout = int(settings.get("timeout", 30))
        budget = int(settings.get("cacheBudgetMiB", 1024))
        if not 3 <= timeout <= 300:
            raise ValueError("timeout must be between 3 and 300 seconds")
        if not 128 <= budget <= 32768:
            raise ValueError("cacheBudgetMiB must be between 128 and 32768")
        settings["timeout"] = timeout
        settings["cacheBudgetMiB"] = budget
        settings["blacklist"] = _string_list(settings.get("blacklist", []), "blacklist")
        settings["outputFilterTags"] = _string_list(settings.get("outputFilterTags", []), "outputFilterTags")
        prompt = settings.get("promptDefaults")
        if not isinstance(prompt, dict):
            raise ValueError("promptDefaults must be an object")
        prompt["categories"] = [item for item in _string_list(prompt.get("categories", []), "prompt categories") if item in CATEGORY_ORDER]
        legacy_excluded = _string_list(prompt.get("excludedTags", []), "excludedTags")
        settings["blacklist"] = list(dict.fromkeys([*settings["blacklist"], *legacy_excluded]))
        prompt.pop("excludedTags", None)
        prompt["replaceUnderscores"] = bool(prompt.get("replaceUnderscores", False))
        prompt["escapeParentheses"] = bool(prompt.get("escapeParentheses", False))
        settings["tooltip"] = bool(settings.get("tooltip", True))
        selection_stamp = str(settings.get("selectionStamp", "quarantineQualified"))
        if selection_stamp not in SELECTION_STAMPS:
            raise ValueError("selectionStamp is invalid")
        settings["selectionStamp"] = selection_stamp
        settings["revision"] = max(0, int(settings.get("revision", 0)))
        _normalize_gelbooru_credentials(settings)
        return settings

    def public(self) -> dict[str, Any]:
        settings = copy.deepcopy(self.load())
        credentials = settings.pop("credentials")
        settings["credentialStatus"] = {
            source: {f"has{key[0].upper()}{key[1:]}": bool(value) for key, value in values.items()}
            for source, values in credentials.items()
        }
        return settings

    def save(self, update: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(update, dict):
            raise ValueError("settings update must be an object")
        with self._lock:
            settings = self.load()
            for key in ("defaultSource", "blacklist", "outputFilterTags", "promptDefaults", "tooltip", "selectionStamp", "timeout", "cacheBudgetMiB"):
                if key in update:
                    settings[key] = copy.deepcopy(update[key])
            credential_update = update.get("credentials", {})
            clear = update.get("clearCredentials", {})
            if credential_update is not None and not isinstance(credential_update, dict):
                raise ValueError("credentials must be an object")
            for source, fields in (credential_update or {}).items():
                if source not in settings["credentials"] or not isinstance(fields, dict):
                    raise ValueError(f"invalid credential update for {source}")
                for key, value in fields.items():
                    if key not in settings["credentials"][source] or not isinstance(value, str):
                        raise ValueError(f"invalid credential field {source}.{key}")
                    if value:
                        settings["credentials"][source][key] = value.strip()
            if clear is not None and not isinstance(clear, dict):
                raise ValueError("clearCredentials must be an object")
            for source, fields in (clear or {}).items():
                if source not in settings["credentials"] or not isinstance(fields, list):
                    raise ValueError(f"invalid clearCredentials for {source}")
                for key in fields:
                    if key in settings["credentials"][source]:
                        settings["credentials"][source][key] = ""
            settings["revision"] += 1
            settings = self._validate(settings)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(self.path.suffix + ".tmp")
            temporary.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temporary, self.path)
            return self.public()


_store: GallerySettingsStore | None = None


def get_gallery_settings_store() -> GallerySettingsStore:
    global _store
    if _store is None:
        import folder_paths
        _store = GallerySettingsStore(Path(folder_paths.get_user_directory()) / "aaalice-nodes" / "booru_gallery.json")
    return _store
