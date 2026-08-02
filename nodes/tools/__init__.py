"""Aaalice/tools domain nodes."""

from __future__ import annotations

from .resolution_preset import ResolutionPreset
from .simple_notify import SimpleNotify
from .simple_string_split import SimpleStringSplit

NODE_CLASSES = [
    SimpleStringSplit,
    SimpleNotify,
    ResolutionPreset,
]

__all__ = ["NODE_CLASSES", "ResolutionPreset", "SimpleNotify", "SimpleStringSplit"]
