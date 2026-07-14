"""ParameterControlPanel — central parameter dock; outputs a Param Pack.

No user-facing STRING widget / pin for JSON.
Frontend keeps state in node.properties and injects `parameters_json` into the
prompt via graphToPrompt. Backend accepts it with accept_all_inputs=True
(see comfy_api Schema.accept_all_inputs + execution.get_input_data).
"""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.param_pack import build_param_pack, parse_parameters_json

ParamPack = io.Custom("AAALICE_PARAM_PACK")


class ParameterControlPanel(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ParameterControlPanel",
            display_name="Parameter Control Panel",
            category="Aaalice/control",
            description=(
                "Central parameter dock. Sidebar = full editor; node = values. "
                "Works in classic node UI and Nodes 2.0."
            ),
            # No parameters_json in inputs → no "参数 JSON" widget/pin in UI.
            # JS injects it into the prompt; accept_all_inputs lets execute receive it.
            inputs=[],
            outputs=[
                ParamPack.Output(
                    "parameters",
                    display_name="Parameters",
                    tooltip="Param Pack for Parameter Break",
                ),
            ],
            hidden=[io.Hidden.unique_id],
            accept_all_inputs=True,
        )

    @classmethod
    def fingerprint_inputs(cls, parameters_json: str = "[]", **_kwargs) -> str:
        return parameters_json or "[]"

    @classmethod
    def execute(cls, parameters_json: str = "[]", **_kwargs) -> io.NodeOutput:
        if not parameters_json:
            parameters_json = "[]"
        pack = build_param_pack(parse_parameters_json(parameters_json))
        return io.NodeOutput(pack)
