"""SimpleNotify — alert when execution reaches a transparent pass-through point."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from comfy_api.latest import io


def _volume(value: Any) -> float:
    try:
        numeric = float(0.5 if value is None else value)
    except (TypeError, ValueError):
        numeric = 0.5
    return max(0.0, min(1.0, numeric))


class SimpleNotify(io.ComfyNode):
    """Notify the initiating frontend and return the input value unchanged."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        template = io.MatchType.Template("simple_notify")
        return io.Schema(
            node_id="SimpleNotify",
            display_name="🔔 Simple Notify",
            category="Aaalice/tools",
            description=(
                "Send enabled alerts when execution reaches this node, then pass "
                "the input value through unchanged."
            ),
            inputs=[
                io.MatchType.Input(
                    "value",
                    template=template,
                    tooltip="Value used as the execution dependency and passed through unchanged.",
                ),
                io.String.Input(
                    "message",
                    default="",
                    tooltip="Notification text; leave empty to use the localized default.",
                ),
                io.Boolean.Input(
                    "desktop_notification",
                    default=True,
                    tooltip="Show a desktop notification in the initiating ComfyUI client.",
                ),
                io.Boolean.Input(
                    "sound",
                    default=True,
                    tooltip="Play the bundled alert sound in the initiating ComfyUI client.",
                ),
                io.Float.Input(
                    "volume",
                    default=0.5,
                    min=0.0,
                    max=1.0,
                    step=0.1,
                    round=0.1,
                    display_mode=io.NumberDisplay.slider,
                    tooltip="Alert sound volume from 0 to 1.",
                ),
            ],
            outputs=[
                io.MatchType.Output(
                    template=template,
                    id="value",
                    display_name="Value",
                    tooltip="The unchanged input value.",
                ),
            ],
            is_output_node=True,
            not_idempotent=True,
            search_aliases=["notification", "alert", "sound"],
        )

    @classmethod
    def fingerprint_inputs(cls, **_kwargs) -> str:
        """Force the alert side effect to run for every queued prompt."""
        return uuid4().hex

    @classmethod
    def execute(
        cls,
        value: Any,
        message: Any = None,
        desktop_notification: Any = None,
        sound: Any = None,
        volume: Any = None,
    ) -> io.NodeOutput:
        payload = {
            "message": str("" if message is None else message),
            "desktop_notification": True if desktop_notification is None else bool(desktop_notification),
            "sound": True if sound is None else bool(sound),
            "volume": _volume(volume),
        }
        return io.NodeOutput(
            value,
            ui={"aaalice_simple_notify": [payload]},
        )
