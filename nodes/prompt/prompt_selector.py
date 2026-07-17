"""PromptSelector — select ordered prompt-library entries."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.prompt_selector import compose_prompt, parse_selection_payload


class PromptSelector(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PromptSelector",
            display_name="📚 Prompt Selector",
            category="Aaalice/prompt",
            description="Select and order prompt-library entries with optional weights.",
            inputs=[io.String.Input(
                "prefix_prompt",
                optional=True,
                force_input=True,
                tooltip="Optional prompt placed before selected entries.",
            )],
            outputs=[io.String.Output("prompt", display_name="Prompt", tooltip="Combined selected prompt text.")],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, selection_payload_json: str = "", **_kwargs):
        try:
            parse_selection_payload(selection_payload_json)
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    def execute(cls, prefix_prompt: str = "", selection_payload_json: str = "", **_kwargs) -> io.NodeOutput:
        return io.NodeOutput(compose_prompt(prefix_prompt, selection_payload_json))
