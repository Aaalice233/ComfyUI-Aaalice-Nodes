"""Aaalice/control domain nodes."""

from __future__ import annotations

from .parameter_panel import ParameterPanel
from .parameter_receiver import ParameterReceiver
from .quick_group_manager import QuickGroupManager

NODE_CLASSES = [
    ParameterPanel,
    ParameterReceiver,
    QuickGroupManager,
]

__all__ = ["NODE_CLASSES", "ParameterPanel", "ParameterReceiver", "QuickGroupManager"]
