"""Aaalice/control domain nodes (#15–19; #20 is JS-only)."""

from __future__ import annotations

from .parameter_break import ParameterBreak
from .parameter_control_panel import ParameterControlPanel

NODE_CLASSES = [
    ParameterControlPanel,
    ParameterBreak,
]

__all__ = ["NODE_CLASSES", "ParameterControlPanel", "ParameterBreak"]
