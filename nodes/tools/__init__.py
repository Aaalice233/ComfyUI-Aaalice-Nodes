"""Aaalice/tools domain nodes."""

from __future__ import annotations

from .conditional_save_image import ConditionalSaveImage
from .resolution_preset import ResolutionPreset
from .simple_notify import SimpleNotify
from .simple_string_split import SimpleStringSplit
from .universal_vae_encode import UniversalVAEEncode

NODE_CLASSES = [
    SimpleStringSplit,
    SimpleNotify,
    ConditionalSaveImage,
    ResolutionPreset,
    UniversalVAEEncode,
]

__all__ = [
    "ConditionalSaveImage",
    "NODE_CLASSES",
    "ResolutionPreset",
    "SimpleNotify",
    "SimpleStringSplit",
    "UniversalVAEEncode",
]
