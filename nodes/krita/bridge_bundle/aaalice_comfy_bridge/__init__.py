"""Aaalice Comfy Bridge — local snapshot transport for Krita."""

from krita import Krita

from .extension import AaaliceComfyBridgeExtension

VERSION = "1.0.0"

Krita.instance().addExtension(AaaliceComfyBridgeExtension(Krita.instance()))

__all__ = ["VERSION"]
