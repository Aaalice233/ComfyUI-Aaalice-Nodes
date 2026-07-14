"""按域聚合节点类，供包入口 `comfy_entrypoint` 注册。

域包（仅落盘与菜单 category；排期见 README # 逐条。有节点再建，勿空壳堆砌）:

  tools   — #1, #3–9    category: Aaalice/tools  （#2 已砍）
  prompt  — #10–12      category: Aaalice/prompt
  media   — #13–14,#23  category: Aaalice/media
  control — #15–19      category: Aaalice/control  （#20 纯 JS）
  gallery — #21–22      category: Aaalice/gallery
  krita   — #24–25      category: Aaalice/krita
  _lib    — 共享纯逻辑，禁止放 ComfyNode

各域 `nodes/<domain>/__init__.py` 导出 NODE_CLASSES；此处按固定顺序拼接。
"""

from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from comfy_api.latest import io

# 域加载顺序（与 AGENTS 规划一致）
_DOMAIN_MODULES = (
    "tools",
    "prompt",
    "media",
    "control",
    "gallery",
    "krita",
)


def iter_node_classes() -> list[type[io.ComfyNode]]:
    """返回本包全部 V3 节点类。尚无域包时返回空列表。"""
    nodes: list[type[io.ComfyNode]] = []
    for name in _DOMAIN_MODULES:
        try:
            module = import_module(f".{name}", package=__name__)
        except ModuleNotFoundError:
            # 域尚未落地：跳过
            continue
        domain_nodes = getattr(module, "NODE_CLASSES", None)
        if not domain_nodes:
            continue
        nodes.extend(domain_nodes)
    return nodes


__all__ = ["iter_node_classes", "_DOMAIN_MODULES"]
