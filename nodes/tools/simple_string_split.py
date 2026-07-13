"""SimpleStringSplit — split a string by delimiter into a list of parts.

Behavior (aligned with old SimpleStringSplit, rewritten for V3):
- Split on the chosen delimiter
- Strip whitespace on each part
- Drop empty parts (consecutive / leading / trailing delimiters)
"""

from __future__ import annotations

from comfy_api.latest import io


class SimpleStringSplit(io.ComfyNode):
    """Split text by delimiter; return a non-empty stripped string list."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="SimpleStringSplit",
            display_name="Simple String Split",
            category="Aaalice/tools",
            description=(
                "Split a string by delimiter, strip whitespace from each part, "
                "and drop empty segments."
            ),
            inputs=[
                io.String.Input(
                    "text",
                    default="",
                    multiline=True,
                    tooltip="Source string to split",
                ),
                io.Combo.Input(
                    "delimiter",
                    options=[",", "|"],
                    default=",",
                    tooltip="Delimiter character",
                ),
            ],
            outputs=[
                io.String.Output(
                    "parts",
                    display_name="Parts",
                    is_output_list=True,
                    tooltip="Split segments as a list",
                ),
            ],
        )

    @classmethod
    def execute(cls, text: str, delimiter: str = ",") -> io.NodeOutput:
        if text is None:
            text = ""
        if not delimiter:
            raise ValueError("delimiter must be a non-empty string")

        parts = [segment.strip() for segment in str(text).split(delimiter)]
        parts = [segment for segment in parts if segment]
        return io.NodeOutput(parts)
