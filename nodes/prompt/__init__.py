"""Aaalice/prompt domain nodes."""

from __future__ import annotations

from .prompt_cleaning_maid import PromptCleaningMaid

NODE_CLASSES = [PromptCleaningMaid]

__all__ = ["NODE_CLASSES", "PromptCleaningMaid"]
