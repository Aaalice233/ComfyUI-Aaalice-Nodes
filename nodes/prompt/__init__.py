"""Aaalice/prompt domain nodes."""

from __future__ import annotations

from .prompt_cleaning_maid import PromptCleaningMaid
from .prompt_selector import PromptSelector

NODE_CLASSES = [PromptCleaningMaid, PromptSelector]

__all__ = ["NODE_CLASSES", "PromptCleaningMaid", "PromptSelector"]
