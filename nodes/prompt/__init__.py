"""Aaalice/prompt domain nodes."""

from __future__ import annotations

from .character_feature_swap import CharacterFeatureSwapNode
from .prompt_selector import PromptSelector

NODE_CLASSES = [PromptSelector, CharacterFeatureSwapNode]

__all__ = [
    "CharacterFeatureSwapNode",
    "NODE_CLASSES",
    "PromptSelector",
]
