"""Aaalice/prompt domain nodes."""

from __future__ import annotations

from .character_feature_swap import CharacterFeatureSwapNode
from .prompt_assistant_bridge import PromptAssistantBridge
from .prompt_cleaning_maid import PromptCleaningMaid
from .prompt_selector import PromptSelector

NODE_CLASSES = [PromptCleaningMaid, PromptSelector, CharacterFeatureSwapNode, PromptAssistantBridge]

__all__ = [
    "CharacterFeatureSwapNode",
    "NODE_CLASSES",
    "PromptAssistantBridge",
    "PromptCleaningMaid",
    "PromptSelector",
]
