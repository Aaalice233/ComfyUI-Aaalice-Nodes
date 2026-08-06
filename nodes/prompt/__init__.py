"""Aaalice/prompt domain nodes."""

from __future__ import annotations

from .prompt_selector import PromptSelector

NODE_CLASSES = [PromptSelector]

__all__ = [
    "NODE_CLASSES",
    "PromptSelector",
]
