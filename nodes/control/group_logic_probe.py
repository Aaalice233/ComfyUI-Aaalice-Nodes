"""GroupLogicProbe — combine multiple visual-group probes with AND/OR gates."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.group_state import evaluate_group_logic, parse_group_logic_payload


class GroupLogicProbe(io.ComfyNode):
    """Evaluate group conditions at queue time and output one boolean.

    The frontend snapshots every referenced group's member modes when the
    prompt is queued; the node only combines the injected snapshots. Feed the
    result into a lazy conditional branch (e.g. Impact Pack's
    ImpactConditionalBranch) to skip whole branches.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="GroupLogicProbe",
            display_name="🧭 Group Logic Probe",
            category="Aaalice/control",
            description=(
                "Combine multiple visual-group enabled/disabled probes with AND or OR "
                "at the moment the prompt is queued, and output one boolean for lazy branching."
            ),
            inputs=[],
            outputs=[
                io.Boolean.Output(
                    "result",
                    display_name="Result",
                    tooltip="Combined probe result; connect to a lazy conditional branch such as ImpactConditionalBranch's cond.",
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, group_logic_payload: str = ""):
        # The payload is injected at graphToPrompt; execute() validates it for real.
        return True

    @classmethod
    def execute(cls, group_logic_payload: str = "", **_kwargs) -> io.NodeOutput:
        return io.NodeOutput(evaluate_group_logic(parse_group_logic_payload(group_logic_payload)))


__all__ = ["GroupLogicProbe"]
