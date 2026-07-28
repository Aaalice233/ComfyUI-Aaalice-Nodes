"""Aaalice/control domain nodes."""

from __future__ import annotations

from .group_is_enabled import GroupIsEnabled
from .group_logic_probe import GroupLogicProbe
from .parameter_panel import ParameterPanel
from .parameter_receiver import ParameterReceiver
from .quick_group_manager import QuickGroupManager

NODE_CLASSES = [
    GroupIsEnabled,
    GroupLogicProbe,
    ParameterPanel,
    ParameterReceiver,
    QuickGroupManager,
]

__all__ = ["GroupIsEnabled", "GroupLogicProbe", "NODE_CLASSES", "ParameterPanel", "ParameterReceiver", "QuickGroupManager"]
