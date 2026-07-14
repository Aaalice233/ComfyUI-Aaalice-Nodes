"""Aaalice/tools domain nodes (#1, #3–9; #2 dropped)."""

from __future__ import annotations

from .simple_string_split import SimpleStringSplit

NODE_CLASSES = [
    SimpleStringSplit,
]

__all__ = ["NODE_CLASSES", "SimpleStringSplit"]
