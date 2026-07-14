"""ParameterPanel — one editable parameter set and one Param Pack output."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.param_pack import build_param_pack, parse_parameters_json

ParamPack = io.Custom("AAALICE_PARAM_PACK")


def _resolve_image(value):
    if not value:
        raise ValueError("image parameter has no selected image")
    if isinstance(value, dict):
        filename = value.get("filename")
        subfolder = value.get("subfolder") or ""
        image_type = value.get("type") or "input"
        if not filename:
            raise ValueError("image parameter is missing filename")
        annotated = f"{subfolder}/{filename}" if subfolder else str(filename)
        if image_type != "input":
            annotated = f"{annotated} [{image_type}]"
    elif isinstance(value, str):
        annotated = value
    else:
        raise ValueError("image parameter must contain a ComfyUI image reference")

    # Keep the pure parameter model importable without a running ComfyUI instance.
    from nodes import LoadImage

    image, _mask = LoadImage().load_image(annotated)
    return image


class ParameterPanel(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ParameterPanel",
            display_name="Parameter Panel",
            category="Aaalice/control",
            description=(
                "Edit one parameter set and emit one Param Pack. Parameter structure "
                "is edited from the node context menu."
            ),
            inputs=[],
            outputs=[
                ParamPack.Output(
                    "parameters",
                    display_name="Param Pack",
                    tooltip="Parameter values and stable metadata",
                )
            ],
            hidden=[io.Hidden.unique_id],
            accept_all_inputs=True,
        )

    @classmethod
    def fingerprint_inputs(
        cls,
        parameters_json: str = "[]",
        validate_dynamic_values: bool = True,
        **_kwargs,
    ) -> str:
        return f"{parameters_json or '[]'}\n{bool(validate_dynamic_values)}"

    @classmethod
    def execute(
        cls,
        parameters_json: str = "[]",
        validate_dynamic_values: bool = True,
        **_kwargs,
    ) -> io.NodeOutput:
        pack = build_param_pack(
            parse_parameters_json(parameters_json),
            image_resolver=_resolve_image,
            validate_dynamic_values=bool(validate_dynamic_values),
        )
        return io.NodeOutput(pack)
