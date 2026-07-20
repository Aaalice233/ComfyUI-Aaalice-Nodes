"""Aaalice/tools domain nodes."""

from __future__ import annotations

from .enum_switch import EnumSwitch
from .resolution_preset import ResolutionPreset
from .simple_notify import SimpleNotify
from .simple_string_split import SimpleStringSplit

NODE_CLASSES = [
    SimpleStringSplit,
    EnumSwitch,
    SimpleNotify,
    ResolutionPreset,
]

__all__ = ["EnumSwitch", "NODE_CLASSES", "ResolutionPreset", "SimpleNotify", "SimpleStringSplit"]
