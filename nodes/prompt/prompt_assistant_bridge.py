"""PromptAssistantBridge — auto-expand prompts through prompt-assistant."""

from __future__ import annotations

import logging

from comfy.model_management import InterruptProcessingException
from comfy_api.latest import io

from . import prompt_assistant_bridge_client as client

logger = logging.getLogger(__name__)

_UI_KEY = "aaalice_prompt_assistant_bridge"


class PromptAssistantBridge(io.ComfyNode):
    """Expand the incoming prompt with prompt-assistant's active rule and service.

    The node never fails the queue for bridge-level problems: with the switch
    off, without prompt-assistant installed, or when the expansion itself
    errors, the input text passes through unchanged. Expansion failures are
    reported to the frontend as a warning toast via the ui payload.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PromptAssistantBridge",
            display_name="✨ Prompt Assistant Bridge",
            category="Aaalice/prompt",
            description=(
                "Expand the input prompt with Prompt Assistant's active rule and LLM service, "
                "or pass it through unchanged when disabled or unavailable."
            ),
            inputs=[
                io.String.Input(
                    "text",
                    optional=True,
                    force_input=True,
                    tooltip="Prompt text to expand before passing it on.",
                ),
                io.Boolean.Input(
                    "enabled",
                    default=True,
                    tooltip="Enable to expand the input with Prompt Assistant; disable to pass it through unchanged.",
                ),
            ],
            outputs=[
                io.String.Output(
                    "text",
                    display_name="Text",
                    tooltip="Expanded prompt, or the original text when disabled or unavailable.",
                ),
            ],
            search_aliases=["expand", "prompt assistant", "enhance"],
        )

    @classmethod
    def fingerprint_inputs(cls, text: str = "", enabled: bool = True, **_kwargs) -> int:
        return hash((text or "", bool(enabled)))

    @classmethod
    def execute(cls, text: str = "", enabled: bool = True, **_kwargs) -> io.NodeOutput:
        source = text or ""
        if not enabled or not source.strip() or client.resolve_prompt_assistant() is None:
            return io.NodeOutput(source)
        try:
            return io.NodeOutput(client.expand(source))
        except InterruptProcessingException:
            raise
        except Exception as exc:
            logger.warning("PromptAssistantBridge kept the original prompt after expansion failed: %s", exc)
            return io.NodeOutput(
                source,
                ui={_UI_KEY: [{"status": "expand_failed", "message": str(exc)}]},
            )


__all__ = ["PromptAssistantBridge"]
