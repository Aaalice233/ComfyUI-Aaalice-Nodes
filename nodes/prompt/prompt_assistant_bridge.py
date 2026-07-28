"""PromptAssistantBridge — auto-expand prompts through prompt-assistant."""

from __future__ import annotations

import logging

from typing import Callable

from comfy.model_management import InterruptProcessingException
from comfy_api.latest import io

from . import prompt_assistant_bridge_client as client

logger = logging.getLogger(__name__)

_UI_KEY = "aaalice_prompt_assistant_bridge"
_STREAM_EVENT = "aaalice.prompt_assistant_bridge.chunk"


def _stream_forwarder(node_cls) -> Callable[[str], None] | None:
    """Forward streamed deltas to the node's frontend display, if identifiable."""
    node_id = getattr(getattr(node_cls, "hidden", None), "unique_id", None)
    if node_id is None:
        return None

    def forward(delta: str) -> None:
        if not delta:
            return
        try:
            # 延迟导入与 routes 保持一致，避免纯逻辑测试加载整套 server 栈。
            from server import PromptServer

            PromptServer.instance.send_sync(_STREAM_EVENT, {"node": str(node_id), "delta": delta})
        except Exception:
            # 流式展示只是附属反馈，发送失败不应拖垮扩写本身。
            logger.debug("PromptAssistantBridge failed to forward a streamed chunk", exc_info=True)

    return forward


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
            hidden=[io.Hidden.unique_id],
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
            expanded = client.expand(source, stream_callback=_stream_forwarder(cls))
            return io.NodeOutput(expanded, ui={_UI_KEY: [{"status": "expanded", "text": expanded}]})
        except InterruptProcessingException:
            raise
        except Exception as exc:
            logger.warning("PromptAssistantBridge kept the original prompt after expansion failed: %s", exc)
            return io.NodeOutput(
                source,
                ui={_UI_KEY: [{"status": "expand_failed", "message": str(exc)}]},
            )


__all__ = ["PromptAssistantBridge"]
