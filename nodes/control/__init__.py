"""Aaalice/control domain nodes."""

from __future__ import annotations

from .group_is_enabled import GroupIsEnabled
from .parameter_panel import ParameterPanel
from .parameter_receiver import ParameterReceiver
from .quick_group_manager import QuickGroupManager

NODE_CLASSES = [
    GroupIsEnabled,
    ParameterPanel,
    ParameterReceiver,
    QuickGroupManager,
]

__all__ = ["GroupIsEnabled", "NODE_CLASSES", "ParameterPanel", "ParameterReceiver", "QuickGroupManager"]
