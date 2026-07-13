"""按域聚合节点类，供包入口 `comfy_entrypoint` 注册。

域划分（随条目落地再加子包，勿空壳堆砌）:
  tools   — P1 基础工具
  prompt  — P2 提示词
  media   — P2 图像 I/O 等
  control — P3 参数 / 组
  gallery — P4 旗舰画廊
  krita   — P4 Krita 外联
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from comfy_api.latest import io


def iter_node_classes() -> list[type[io.ComfyNode]]:
    """返回本包全部 V3 节点类。尚无节点时返回空列表。"""
    nodes: list[type[io.ComfyNode]] = []
    # 示例（条目落地时取消注释并实现）:
    # from .tools.simple_string_split import SimpleStringSplit
    # nodes.append(SimpleStringSplit)
    return nodes


__all__ = ["iter_node_classes"]
