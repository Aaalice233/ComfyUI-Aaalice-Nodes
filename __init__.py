"""ComfyUI-Aaalice-Nodes 入口。

ComfyUI 加载本目录时导入此模块：
- V3：`comfy_entrypoint()` → `ComfyExtension.get_node_list`
- 前端：`WEB_DIRECTORY` 下全部 `.js` 自动加载
- i18n：`locales/{en,zh}/` 由 ComfyUI 扫描 `/api/i18n` 合并，无需在此注册
"""

from __future__ import annotations

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

from .nodes import iter_node_classes

WEB_DIRECTORY = "./js"


class AaaliceNodesExtension(ComfyExtension):
    """本包扩展：节点列表由 `nodes.iter_node_classes` 聚合。"""

    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return iter_node_classes()


async def comfy_entrypoint() -> AaaliceNodesExtension:
    return AaaliceNodesExtension()


__all__ = [
    "WEB_DIRECTORY",
    "AaaliceNodesExtension",
    "comfy_entrypoint",
]
