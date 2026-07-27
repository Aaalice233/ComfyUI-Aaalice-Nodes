"""Booru search-query normalization.

Two tiers:

- ``normalize_tag_query`` canonicalizes pasted prompt-style text: commas and
  repeated whitespace collapse into single spaces and empty tokens are
  dropped, so a trailing comma can no longer break a search.
- ``repair_spaced_tags`` uses a site-provided known-tag set to join adjacent
  plain words into their underscore tag form. A run of words is only
  considered for joining when at least one word is not a valid standalone
  tag, so native multi-tag queries like ``1girl solo`` are never
  reinterpreted as a single tag.
"""

from __future__ import annotations

import re
from typing import Iterable

_SPLIT = re.compile(r"[\s,]+")
_OPERATOR_CHARS = re.compile(r"[:*()\[\]\"']")
MAX_TAG_WORDS = 6
MAX_REPAIR_TOKENS = 40


def tokenize_tag_query(query: str) -> list[str]:
    """Split a raw query on commas and whitespace, dropping empty tokens."""
    return [part for part in _SPLIT.split(str(query or "")) if part]


def is_query_operator(token: str) -> bool:
    """Metatags, exclusions, optionals, wildcards and grouping are never joined."""
    return token.startswith(("-", "~")) or bool(_OPERATOR_CHARS.search(token))


def normalize_tag_query(query: str) -> str:
    """Tier-1 canonical form; every token is preserved exactly."""
    return " ".join(tokenize_tag_query(query))


def _plain_runs(tokens: list[str]) -> list[tuple[int, int]]:
    """Half-open spans of adjacent non-operator tokens."""
    spans: list[tuple[int, int]] = []
    start: int | None = None
    for index, token in enumerate(tokens):
        if is_query_operator(token):
            if start is not None:
                spans.append((start, index))
                start = None
        elif start is None:
            start = index
    if start is not None:
        spans.append((start, len(tokens)))
    return spans


def join_candidates(tokens: list[str]) -> list[str]:
    """Lowercased single words and underscore joins worth validating."""
    names: set[str] = set()
    for start, end in _plain_runs(tokens):
        words = tokens[start:end]
        for word in words:
            names.add(word.lower())
        for first in range(len(words)):
            for last in range(first + 2, min(len(words), first + MAX_TAG_WORDS) + 1):
                names.add("_".join(words[first:last]).lower())
    return sorted(names)


def repair_spaced_tags(tokens: list[str], known_tags: Iterable[str]) -> list[str]:
    """Join spaced phrases into underscore tags using a known-tag set.

    Runs whose words are all known standalone tags pass through unchanged;
    an empty known set or an over-long query degrades to the tier-1 form.
    """
    known = {str(tag).casefold() for tag in known_tags}
    if not known or len(tokens) > MAX_REPAIR_TOKENS:
        return list(tokens)
    out: list[str] = []
    index = 0
    while index < len(tokens):
        if is_query_operator(tokens[index]):
            out.append(tokens[index])
            index += 1
            continue
        run_end = index
        while run_end < len(tokens) and not is_query_operator(tokens[run_end]):
            run_end += 1
        out.extend(_join_run(tokens[index:run_end], known))
        index = run_end
    return out


def _join_run(words: list[str], known: set[str]) -> list[str]:
    if len(words) == 1 or all(word.casefold() in known for word in words):
        return list(words)
    out: list[str] = []
    start = 0
    while start < len(words):
        stop = min(len(words), start + MAX_TAG_WORDS)
        for end in range(stop, start + 1, -1):
            if "_".join(words[start:end]).casefold() in known:
                out.append("_".join(words[start:end]))
                start = end
                break
        else:
            out.append(words[start])
            start += 1
    return out


__all__ = [
    "MAX_REPAIR_TOKENS",
    "MAX_TAG_WORDS",
    "is_query_operator",
    "join_candidates",
    "normalize_tag_query",
    "repair_spaced_tags",
    "tokenize_tag_query",
]
