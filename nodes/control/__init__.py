"""Aaalice/control domain nodes."""

from __future__ import annotations

from .parameter_panel import ParameterPanel
from .parameter_receiver import ParameterReceiver

NODE_CLASSES = [
    ParameterPanel,
    ParameterReceiver,
]

__all__ = ["NODE_CLASSES", "ParameterPanel", "ParameterReceiver"]
