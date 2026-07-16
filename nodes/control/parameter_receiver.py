"""ParameterReceiver — bounded pass-through for ParameterPanel Get nodes."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.receiver_values import MAX_RECEIVER_SLOTS, receiver_values


def _receiver_inputs() -> list:
    return [
        io.AnyType.Input(
            f"input_{index}",
            display_name=f"Input {index}",
            optional=True,
            tooltip=f"Managed parameter input {index}.",
        )
        for index in range(1, MAX_RECEIVER_SLOTS + 1)
    ]


def _receiver_outputs() -> list:
    return [
        io.AnyType.Output(
            f"output_{index}",
            display_name=f"Output {index}",
            tooltip=f"Pass-through parameter output {index}.",
        )
        for index in range(1, MAX_RECEIVER_SLOTS + 1)
    ]


class ParameterReceiver(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ParameterReceiver",
            display_name="Parameter Receiver",
            category="Aaalice/control",
            description=(
                "Bind a Parameter Panel and expose its KJ Get values as one compact, "
                "dynamically sized pass-through node."
            ),
            inputs=_receiver_inputs(),
            outputs=_receiver_outputs(),
            accept_all_inputs=True,
        )

    @classmethod
    def execute(cls, **kwargs) -> io.NodeOutput:
        return io.NodeOutput(*receiver_values(kwargs))
