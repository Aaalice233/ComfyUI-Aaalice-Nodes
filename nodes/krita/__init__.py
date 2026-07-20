"""Aaalice/krita domain nodes."""

from __future__ import annotations

from .fetch_from_krita import FetchFromKrita

NODE_CLASSES = [FetchFromKrita]

__all__ = ["FetchFromKrita", "NODE_CLASSES"]
