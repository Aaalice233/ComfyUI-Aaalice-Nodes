"""Pure configuration and text processing for PromptCleaningMaid."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

STATE_VERSION = 1
MODE_OFF = "off"
MODE_NATURAL_LANGUAGE = "natural_language"
MODE_TAG_LIST = "tag_list"

DEFAULT_CONFIG: dict[str, Any] = {
    "version": STATE_VERSION,
    "mode": MODE_NATURAL_LANGUAGE,
    "settings": {
        "naturalLanguage": {
            "trimOuterWhitespace": True,
            "trimLineEndWhitespace": True,
            "collapseBlankLines": False,
        },
        "tagList": {
            "trimTagWhitespace": True,
            "removeEmptyTags": True,
            "deduplicateTags": True,
            "ignoreCase": True,
            "underscoreEqualsSpace": True,
        },
    },
}

_OPEN_TO_CLOSE = {"(": ")", "[": "]", "{": "}", "<": ">"}
_CLOSE_TO_OPEN = {value: key for key, value in _OPEN_TO_CLOSE.items()}
_DELIMITERS = {",", "，", "\n"}
_PARTITION_CONTROL_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:ADDBASE|ADDCOL|ADDCOMM|ADDROW|BREAK|AND)(?![A-Za-z0-9_])"
)


@dataclass(frozen=True)
class TagListSyntaxError:
    position: int
    reason: str


def _settings(raw: Any, defaults: dict[str, bool], path: str) -> dict[str, bool]:
    if raw is None:
        return dict(defaults)
    if not isinstance(raw, dict):
        raise ValueError(f"{path} must be an object")
    result = dict(defaults)
    for key in defaults:
        if key not in raw:
            continue
        if not isinstance(raw[key], bool):
            raise ValueError(f"{path}.{key} must be boolean")
        result[key] = raw[key]
    return result


def normalize_config(raw: Any = None) -> dict[str, Any]:
    """Validate known fields, apply defaults, and discard unknown fields."""
    if raw is None or raw == "":
        return deepcopy(DEFAULT_CONFIG)
    if not isinstance(raw, dict):
        raise ValueError("PromptCleaningMaid config must be an object")

    version = raw.get("version", STATE_VERSION)
    if version != STATE_VERSION:
        raise ValueError(f"unsupported PromptCleaningMaid config version: {version!r}")
    mode = raw.get("mode", MODE_NATURAL_LANGUAGE)
    if mode not in {MODE_OFF, MODE_NATURAL_LANGUAGE, MODE_TAG_LIST}:
        raise ValueError(f"unsupported PromptCleaningMaid mode: {mode!r}")
    settings = raw.get("settings", {})
    if not isinstance(settings, dict):
        raise ValueError("PromptCleaningMaid settings must be an object")

    defaults = DEFAULT_CONFIG["settings"]
    return {
        "version": STATE_VERSION,
        "mode": mode,
        "settings": {
            "naturalLanguage": _settings(
                settings.get("naturalLanguage"),
                defaults["naturalLanguage"],
                "settings.naturalLanguage",
            ),
            "tagList": _settings(
                settings.get("tagList"),
                defaults["tagList"],
                "settings.tagList",
            ),
        },
    }


def parse_config_json(raw: str | None) -> dict[str, Any]:
    if raw is None or raw == "":
        return normalize_config()
    if not isinstance(raw, str):
        raise ValueError("config_json must be a JSON string")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"config_json is not valid JSON: {exc.msg}") from exc
    return normalize_config(payload)


def clean_natural_language(text: str, settings: dict[str, bool]) -> str:
    result = text.replace("\r\n", "\n").replace("\r", "\n")
    if settings["trimLineEndWhitespace"]:
        result = re.sub(r"[ \t]+(?=\n|$)", "", result)
    if settings["collapseBlankLines"]:
        result = re.sub(r"\n{3,}", "\n\n", result)
    if settings["trimOuterWhitespace"]:
        result = result.strip()
    return result


def _scan_tag_list(
    text: str,
) -> tuple[list[str] | None, str, TagListSyntaxError | None]:
    """Split tags and expose only unprotected top-level text for syntax detection."""
    items: list[str] = []
    current: list[str] = []
    top_level: list[str] = []
    stack: list[tuple[str, int]] = []
    quote: tuple[str, int] | None = None
    escaped = False

    for index, char in enumerate(text):
        if escaped:
            current.append(char)
            if not stack and not quote:
                top_level.append(" ")
            escaped = False
            continue
        if char == "\\":
            current.append(char)
            if not stack and not quote:
                top_level.append(" ")
            escaped = True
            continue
        if quote:
            current.append(char)
            top_level.append(" ")
            if char == quote[0]:
                quote = None
            continue
        if char in {'"', "'"}:
            previous = text[index - 1] if index else ""
            if index == 0 or previous.isspace() or previous in _DELIMITERS or previous in _OPEN_TO_CLOSE:
                quote = (char, index)
            current.append(char)
            top_level.append(" ")
            continue
        if char in _OPEN_TO_CLOSE:
            stack.append((char, index))
            current.append(char)
            top_level.append(" ")
            continue
        if char in _CLOSE_TO_OPEN:
            if not stack or stack[-1][0] != _CLOSE_TO_OPEN[char]:
                return None, "", TagListSyntaxError(index, f"unexpected {char!r}")
            stack.pop()
            current.append(char)
            top_level.append(" ")
            continue
        if char in _DELIMITERS and not stack:
            items.append("".join(current))
            current = []
            top_level.append(" ")
            continue
        current.append(char)
        top_level.append(char if not stack else " ")

    if escaped:
        return None, "", TagListSyntaxError(max(0, len(text) - 1), "dangling escape")
    if quote:
        return None, "", TagListSyntaxError(quote[1], f"unclosed quote {quote[0]!r}")
    if stack:
        opening, position = stack[-1]
        return None, "", TagListSyntaxError(position, f"unclosed {opening!r}")
    items.append("".join(current))
    return items, "".join(top_level), None


def split_tag_list(text: str) -> tuple[list[str] | None, TagListSyntaxError | None]:
    """Split top-level tag delimiters while preserving nested structures verbatim."""
    items, _top_level, syntax_error = _scan_tag_list(text)
    return items, syntax_error


def _deduplication_key(item: str, settings: dict[str, bool]) -> str:
    key = item
    if settings["underscoreEqualsSpace"]:
        key = re.sub(r"\s+", " ", key.replace("_", " "))
    if settings["ignoreCase"]:
        key = key.casefold()
    return key


def _serialize_tags(items: list[str]) -> str:
    if not items:
        return ""
    result = items[0]
    for item in items[1:]:
        result += ","
        if item and not item[0].isspace():
            result += " "
        result += item
    return result


def clean_tag_list(
    text: str, settings: dict[str, bool]
) -> tuple[str, TagListSyntaxError | None]:
    items, top_level, syntax_error = _scan_tag_list(text)
    if syntax_error:
        return text, syntax_error
    assert items is not None
    if _PARTITION_CONTROL_RE.search(top_level):
        return text, None

    if settings["trimTagWhitespace"]:
        items = [item.strip() for item in items]
    if settings["removeEmptyTags"]:
        items = [item for item in items if item.strip()]
    if settings["deduplicateTags"]:
        seen: set[str] = set()
        unique: list[str] = []
        for item in items:
            if not item.strip():
                unique.append(item)
                continue
            key = _deduplication_key(item, settings)
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)
        items = unique
    return _serialize_tags(items), None


def clean_prompt(
    text: Any, config: dict[str, Any] | None = None
) -> tuple[str, TagListSyntaxError | None]:
    source = "" if text is None else str(text)
    normalized = normalize_config(config)
    if normalized["mode"] == MODE_OFF:
        return source, None
    if normalized["mode"] == MODE_NATURAL_LANGUAGE:
        return clean_natural_language(
            source, normalized["settings"]["naturalLanguage"]
        ), None
    return clean_tag_list(source, normalized["settings"]["tagList"])


__all__ = [
    "DEFAULT_CONFIG",
    "MODE_OFF",
    "MODE_NATURAL_LANGUAGE",
    "MODE_TAG_LIST",
    "STATE_VERSION",
    "TagListSyntaxError",
    "clean_prompt",
    "clean_tag_list",
    "normalize_config",
    "parse_config_json",
    "split_tag_list",
]
