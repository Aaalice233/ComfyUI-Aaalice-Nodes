"""QuickGroupManager — frontend-only visual group controller."""

from __future__ import annotations

from comfy_api.latest import io


class QuickGroupManager(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="QuickGroupManager",
            display_name="⚡ Quick Group Manager",
            category="Aaalice/control",
            description=(
                "Manage visual groups from a compact frontend panel. "
                "This node has no prompt inputs, outputs, or execution side effects."
            ),
            inputs=[],
            outputs=[],
        )

    @classmethod
    def execute(cls) -> io.NodeOutput:
        return io.NodeOutput()
