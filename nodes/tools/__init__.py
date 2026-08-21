"""Aaalice/tools domain nodes."""

from __future__ import annotations

from .conditional_save_image import ConditionalSaveImage
from .load_image_with_metadata import LoadImageWithMetadata
from .resolution_preset import ResolutionPreset
from .simple_notify import SimpleNotify
from .simple_string_split import SimpleStringSplit

NODE_CLASSES = [
    SimpleStringSplit,
    SimpleNotify,
    ConditionalSaveImage,
    LoadImageWithMetadata,
    ResolutionPreset,
]

__all__ = [
    "ConditionalSaveImage",
    "LoadImageWithMetadata",
    "NODE_CLASSES",
    "ResolutionPreset",
    "SimpleNotify",
    "SimpleStringSplit",
]
