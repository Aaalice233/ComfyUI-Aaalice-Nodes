"""Aaalice/control domain nodes."""

from __future__ import annotations

from .parameter_panel import ParameterPanel

NODE_CLASSES = [
    ParameterPanel,
]

__all__ = ["NODE_CLASSES", "ParameterPanel"]
