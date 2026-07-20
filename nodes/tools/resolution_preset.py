"""ResolutionPreset — output an exact workflow-owned width and height."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.resolution_preset import parse_resolution_payload


class ResolutionPreset(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ResolutionPreset",
            display_name="📐 Resolution Preset",
            category="Aaalice/tools",
            description="Choose an exact aligned width and height with presets, direct input, or a draggable canvas.",
            inputs=[],
            outputs=[
                io.Int.Output("width", display_name="Width", tooltip="Selected width in pixels."),
                io.Int.Output("height", display_name="Height", tooltip="Selected height in pixels."),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, resolution_json: str = ""):
        try:
            parse_resolution_payload(resolution_json)
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    def execute(cls, resolution_json: str = "", **_kwargs) -> io.NodeOutput:
        width, height = parse_resolution_payload(resolution_json)
        return io.NodeOutput(width, height)

