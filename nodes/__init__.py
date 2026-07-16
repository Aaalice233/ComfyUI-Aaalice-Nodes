"""Aggregate implemented node domains for the package entry point."""

from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from comfy_api.latest import io

# Registration order is stable so menus and diagnostics remain predictable.
_DOMAIN_MODULES = (
    "tools",
    "control",
    "prompt",
)


def iter_node_classes() -> list[type[io.ComfyNode]]:
    """Return all implemented V3 node classes in stable domain order."""
    nodes: list[type[io.ComfyNode]] = []
    for name in _DOMAIN_MODULES:
        module = import_module(f".{name}", package=__name__)
        domain_nodes = getattr(module, "NODE_CLASSES", None)
        if not domain_nodes:
            raise RuntimeError(f"node domain {name!r} does not export NODE_CLASSES")
        nodes.extend(domain_nodes)
    return nodes


__all__ = ["iter_node_classes"]
