"""Pure Booru Gallery state, snapshot, and prompt processing."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterable

CATEGORY_ORDER = ("artist", "copyright", "character", "general", "meta")
DEFAULT_PROMPT_CATEGORIES = ("copyright", "character", "general")


def _tags(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        value = value.split()
    if not isinstance(value, list | tuple):
        return ()
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        tag = item.strip()
        if tag and tag not in seen:
            seen.add(tag)
            result.append(tag)
    return tuple(result)


def normalize_tag_groups(value: Any) -> dict[str, tuple[str, ...]]:
    raw = value if isinstance(value, dict) else {}
    return {category: _tags(raw.get(category, [])) for category in CATEGORY_ORDER}


@dataclass(frozen=True)
class GallerySelection:
    source: str
    post_id: str
    post_url: str
    media_url: str
    preview_url: str
    file_ext: str
    width: int
    height: int
    rating: str
    original_tags: dict[str, tuple[str, ...]]
    edited_tags: dict[str, tuple[str, ...]] | None = None

    @property
    def key(self) -> str:
        return f"{self.source}:{self.post_id}"

    @property
    def active_tags(self) -> dict[str, tuple[str, ...]]:
        return self.edited_tags if self.edited_tags is not None else self.original_tags


@dataclass(frozen=True)
class PromptOptions:
    categories: tuple[str, ...] = DEFAULT_PROMPT_CATEGORIES
    replace_underscores: bool = False
    escape_parentheses: bool = False
    excluded_tags: tuple[str, ...] = ()


def _positive_int(value: Any, field: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Gallery selection {field} must be an integer") from exc
    if parsed < 0:
        raise ValueError(f"Gallery selection {field} must not be negative")
    return parsed


def _url(value: Any, field: str, *, required: bool = True) -> str:
    if value in (None, "") and not required:
        return ""
    if not isinstance(value, str) or not value.startswith("https://"):
        raise ValueError(f"Gallery selection {field} must be an HTTPS URL")
    return value


def parse_gallery_payload(payload_json: str) -> tuple[list[GallerySelection], PromptOptions]:
    try:
        payload = json.loads(payload_json or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid Booru Gallery payload JSON: {exc.msg}") from exc
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise ValueError("Booru Gallery payload must be a version 1 object")
    raw_prompt = payload.get("prompt", {})
    if not isinstance(raw_prompt, dict):
        raise ValueError("Booru Gallery prompt settings must be an object")
    categories = tuple(category for category in _tags(raw_prompt.get("categories", list(DEFAULT_PROMPT_CATEGORIES))) if category in CATEGORY_ORDER)
    options = PromptOptions(
        categories=categories,
        replace_underscores=bool(raw_prompt.get("replaceUnderscores", False)),
        escape_parentheses=bool(raw_prompt.get("escapeParentheses", False)),
        excluded_tags=_tags(raw_prompt.get("excludedTags", [])),
    )
    raw_selections = payload.get("selections", [])
    if not isinstance(raw_selections, list):
        raise ValueError("Booru Gallery selections must be a list")
    selections: list[GallerySelection] = []
    seen: set[str] = set()
    for index, raw in enumerate(raw_selections):
        if not isinstance(raw, dict):
            raise ValueError(f"Gallery selection {index} must be an object")
        source = raw.get("source")
        post_id = str(raw.get("postId", "")).strip()
        if not isinstance(source, str) or not re.fullmatch(r"[a-z][a-z0-9_-]*", source):
            raise ValueError(f"Gallery selection {index} has an invalid source")
        if not post_id:
            raise ValueError(f"Gallery selection {index} has no post ID")
        key = f"{source}:{post_id}"
        if key in seen:
            raise ValueError(f"Booru Gallery contains duplicate selection: {key}")
        seen.add(key)
        original_tags = normalize_tag_groups(raw.get("originalTags"))
        edited = raw.get("editedTags")
        selections.append(GallerySelection(
            source=source,
            post_id=post_id,
            post_url=_url(raw.get("postUrl"), "postUrl", required=False),
            media_url=_url(raw.get("mediaUrl"), "mediaUrl"),
            preview_url=_url(raw.get("previewUrl"), "previewUrl", required=False),
            file_ext=str(raw.get("fileExt", "")).lower().lstrip("."),
            width=_positive_int(raw.get("width", 0), "width"),
            height=_positive_int(raw.get("height", 0), "height"),
            rating=str(raw.get("rating", "")),
            original_tags=original_tags,
            edited_tags=normalize_tag_groups(edited) if isinstance(edited, dict) else None,
        ))
    return selections, options


def compose_prompt(selection: GallerySelection, options: PromptOptions) -> str:
    excluded = set(options.excluded_tags)
    result: list[str] = []
    seen: set[str] = set()
    for category in CATEGORY_ORDER:
        if category not in options.categories:
            continue
        for tag in selection.active_tags.get(category, ()):
            if tag in excluded or tag in seen:
                continue
            seen.add(tag)
            rendered = tag.replace("_", " ") if options.replace_underscores else tag
            if options.escape_parentheses:
                rendered = rendered.replace("(", r"\(").replace(")", r"\)")
            result.append(rendered)
    return ", ".join(result)


def materialize_prompts(selections: Iterable[GallerySelection], options: PromptOptions) -> list[str]:
    return [compose_prompt(selection, options) for selection in selections]
