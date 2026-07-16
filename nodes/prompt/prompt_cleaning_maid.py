"""PromptCleaningMaid — conservative natural-language or tag-list cleaning."""

from __future__ import annotations

import logging

from comfy_api.latest import io

from .._lib.prompt_cleaning import clean_prompt, parse_config_json

logger = logging.getLogger(__name__)


class PromptCleaningMaid(io.ComfyNode):
    """Clean text according to an explicitly selected prompt format."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PromptCleaningMaid",
            display_name="🧹 Prompt Cleaning Maid",
            category="Aaalice/prompt",
            description=(
                "Pass prompts through unchanged or conservatively clean natural-language "
                "and flat tag-list formats while preserving recognized partition syntax."
            ),
            inputs=[
                io.String.Input(
                    "text",
                    force_input=True,
                    tooltip="Prompt text to clean.",
                ),
            ],
            outputs=[
                io.String.Output(
                    "text",
                    display_name="Text",
                    tooltip="Cleaned prompt text.",
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, config_json: str = "", **_kwargs):
        try:
            parse_config_json(config_json)
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    def execute(cls, text: str, config_json: str = "", **_kwargs) -> io.NodeOutput:
        result, syntax_error = clean_prompt(text, parse_config_json(config_json))
        if syntax_error:
            logger.warning(
                "PromptCleaningMaid kept malformed tag-list input unchanged: %s at position %d",
                syntax_error.reason,
                syntax_error.position,
            )
        return io.NodeOutput(result)
