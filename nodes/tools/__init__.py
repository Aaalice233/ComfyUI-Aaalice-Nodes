"""Aaalice/tools domain nodes."""

from __future__ import annotations

from .simple_string_split import SimpleStringSplit

NODE_CLASSES = [
    SimpleStringSplit,
]

__all__ = ["NODE_CLASSES", "SimpleStringSplit"]
