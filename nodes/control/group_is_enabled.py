"""GroupIsEnabled — snapshot a visual group's enabled state at queue time."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.group_state import parse_group_state_payload


class GroupIsEnabled(io.ComfyNode):
    """Report whether the selected visual group is fully enabled or disabled.

    The frontend snapshots the group member modes when the prompt is queued
    and injects them as ``group_state_payload``; a group that no longer exists
    or has no member nodes fails explicitly instead of guessing a state.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="GroupIsEnabled",
            display_name="🚦 Group Is Enabled",
            category="Aaalice/control",
            description=(
                "Report whether the selected visual group is fully enabled or fully disabled "
                "at the moment the prompt is queued."
            ),
            inputs=[],
            outputs=[
                io.Boolean.Output(
                    "enabled",
                    display_name="Enabled",
                    tooltip="True when every node in the selected group is enabled (not muted or bypassed).",
                ),
                io.Boolean.Output(
                    "disabled",
                    display_name="Disabled",
                    tooltip="True when every node in the selected group is muted or bypassed.",
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, group_state_payload: str = ""):
        # The payload is injected at graphToPrompt; execute() validates it for real.
        return True

    @classmethod
    def execute(cls, group_state_payload: str = "", **_kwargs) -> io.NodeOutput:
        payload = parse_group_state_payload(group_state_payload)
        state, title = payload["state"], payload["title"]
        if state == "missing":
            raise ValueError(f"Group Is Enabled cannot find the selected visual group: {title or '(none selected)'}")
        if state == "empty":
            raise ValueError(f"Group Is Enabled found an empty visual group: {title}")
        return io.NodeOutput(state == "enabled", state == "disabled")


__all__ = ["GroupIsEnabled"]
