"""ParameterPanel — one editable parameter set with direct value outputs."""

from __future__ import annotations

from comfy_api.latest import io
import folder_paths

from .._lib.parameter_images import (
    image_reference_fingerprint,
    resolve_image_reference,
)
from .._lib.parameter_values import (
    MAX_TUNABLE_PARAMS,
    parameters_to_outputs,
    parse_parameters_json,
    validate_model_references,
    validate_parameters_list,
)


def _panel_outputs() -> list:
    return [
        io.AnyType.Output(
            f"output_{index + 1}",
            display_name=f"Output {index + 1}",
            tooltip=f"Parameter slot {index + 1}; the visible label follows the parameter name.",
        )
        for index in range(MAX_TUNABLE_PARAMS)
    ]


def _image_exists(annotated: str) -> bool:
    import folder_paths

    return folder_paths.exists_annotated_filepath(annotated)


def _load_image(annotated: str):
    # Keep the pure parameter model importable without a running ComfyUI instance.
    from nodes import LoadImage

    image, _mask = LoadImage().load_image(annotated)
    return image


def _black_image():
    import torch
    from comfy import model_management

    return torch.zeros(
        (1, 512, 512, 3),
        dtype=model_management.intermediate_dtype(),
        device=model_management.intermediate_device(),
    )


def _resolve_image(value):
    return resolve_image_reference(
        value,
        exists=_image_exists,
        load=_load_image,
        fallback=_black_image,
    )


def _image_fingerprints(parameters: list[dict]) -> list[str]:
    image_parameters = [
        parameter
        for parameter in parameters
        if parameter.get("param_type") == "image"
    ]
    if not image_parameters:
        return []

    from nodes import LoadImage

    return [
        image_reference_fingerprint(
            parameter.get("value"),
            exists=_image_exists,
            fingerprint=LoadImage.IS_CHANGED,
        )
        for parameter in image_parameters
    ]


class ParameterPanel(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ParameterPanel",
            display_name="🎛️ Parameter Panel",
            category="Aaalice/control",
            description=(
                "Edit one parameter set and emit up to 32 direct AnyType values. "
                "Parameter structure is edited from the node context menu."
            ),
            inputs=[],
            outputs=_panel_outputs(),
            hidden=[io.Hidden.unique_id],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(
        cls,
        parameters_json: str = "[]",
        validate_dynamic_values: bool = True,
    ) -> bool | str:
        try:
            parameters = parse_parameters_json(parameters_json)
            validate_parameters_list(
                parameters,
                validate_dynamic_values=bool(validate_dynamic_values),
            )
            if validate_dynamic_values:
                validate_model_references(
                    parameters,
                    resolve_path=folder_paths.get_full_path,
                )
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    def fingerprint_inputs(
        cls,
        parameters_json: str = "[]",
        validate_dynamic_values: bool = True,
        **_kwargs,
    ) -> str:
        raw = parameters_json or "[]"
        image_fingerprints = _image_fingerprints(parse_parameters_json(raw))
        return f"{raw}\n{bool(validate_dynamic_values)}\n{image_fingerprints!r}"

    @classmethod
    def execute(
        cls,
        parameters_json: str = "[]",
        validate_dynamic_values: bool = True,
        **_kwargs,
    ) -> io.NodeOutput:
        outputs = parameters_to_outputs(
            parse_parameters_json(parameters_json),
            image_resolver=_resolve_image,
            validate_dynamic_values=bool(validate_dynamic_values),
        )
        return io.NodeOutput(*outputs)
