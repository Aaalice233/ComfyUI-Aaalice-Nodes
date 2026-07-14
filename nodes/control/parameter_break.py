"""ParameterBreak — expand a Param Pack into ordered AnyType outputs."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.param_pack import MAX_TUNABLE_PARAMS, pack_to_break_outputs

ParamPack = io.Custom("AAALICE_PARAM_PACK")


def _break_outputs() -> list:
    return [
        io.AnyType.Output(
            f"output_{i + 1}",
            display_name=f"Output {i + 1}",
            tooltip=f"Parameter slot {i + 1} (by list order, non-separators)",
        )
        for i in range(MAX_TUNABLE_PARAMS)
    ]


class ParameterBreak(io.ComfyNode):
    """Expand Param Pack into up to 32 ordered outputs."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ParameterBreak",
            display_name="Parameter Break",
            category="Aaalice/control",
            description=(
                "Expand a Param Pack into ordered outputs (max 32). "
                "Pin labels follow parameter names; links rebind by parameter id."
            ),
            inputs=[
                ParamPack.Input(
                    "parameters",
                    tooltip="Param Pack from Parameter Panel",
                ),
            ],
            outputs=_break_outputs(),
            hidden=[io.Hidden.unique_id],
        )

    @classmethod
    def execute(cls, parameters) -> io.NodeOutput:
        outs = pack_to_break_outputs(parameters)
        return io.NodeOutput(*outs)
