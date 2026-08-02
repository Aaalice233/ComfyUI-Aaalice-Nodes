"""Aaalice/control domain nodes."""

from __future__ import annotations

from .group_is_enabled import GroupIsEnabled
from .group_logic_probe import GroupLogicProbe
from .quick_group_manager import QuickGroupManager

NODE_CLASSES = [
    GroupIsEnabled,
    GroupLogicProbe,
    QuickGroupManager,
]

__all__ = ["GroupIsEnabled", "GroupLogicProbe", "NODE_CLASSES", "QuickGroupManager"]
