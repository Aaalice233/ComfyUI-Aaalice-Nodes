"""Pure validation and direct-output conversion for ParameterPanel values."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

MAX_TUNABLE_PARAMS = 32

PARAM_TYPE_SEPARATOR = "separator"
PARAM_TYPES_TUNABLE = frozenset(
    {"slider", "seed", "switch", "string", "dropdown", "enum", "image", "taglist"}
)
PARAM_TYPES_ALL = PARAM_TYPES_TUNABLE | {PARAM_TYPE_SEPARATOR}

ImageResolver = Callable[[Any], Any]


def parse_parameters_json(raw: str | None) -> list[dict[str, Any]]:
    if raw is None or raw == "":
        return []
    if not isinstance(raw, str):
        raise ValueError("parameters_json must be a JSON string")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"parameters_json is not valid JSON: {exc}") from exc
    if not isinstance(data, list):
        raise ValueError("parameters_json must be a JSON array")
    return data


def _finite_number(value: Any, pid: str, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"parameter {pid!r}: {field} must be numeric") from exc
    if number != number or number in {float("inf"), float("-inf")}:
        raise ValueError(f"parameter {pid!r}: {field} must be finite")
    return number


def validate_parameters_list(
    parameters: list[dict[str, Any]], *, validate_dynamic_values: bool = True
) -> None:
    if not isinstance(parameters, list):
        raise ValueError("parameters must be a list")

    ids: set[str] = set()
    names: set[str] = set()
    tunable_count = 0
    for index, parameter in enumerate(parameters):
        if not isinstance(parameter, dict):
            raise ValueError(f"parameter at index {index} must be an object")

        pid = parameter.get("id")
        if not isinstance(pid, str) or not pid.strip():
            raise ValueError(f"parameter at index {index} needs a non-empty string id")
        if pid in ids:
            raise ValueError(f"duplicate parameter id: {pid}")
        ids.add(pid)

        param_type = parameter.get("param_type")
        if param_type not in PARAM_TYPES_ALL:
            raise ValueError(
                f"parameter {pid!r}: unsupported param_type {param_type!r} "
                f"(allowed: {sorted(PARAM_TYPES_ALL)})"
            )

        name = parameter.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"parameter {pid!r}: name must be a non-empty string")
        name_key = name.strip().casefold()
        if name_key in names:
            raise ValueError(f"duplicate parameter name: {name}")
        names.add(name_key)

        if param_type == PARAM_TYPE_SEPARATOR:
            continue
        tunable_count += 1
        if tunable_count > MAX_TUNABLE_PARAMS:
            raise ValueError(
                f"tunable parameter count exceeds {MAX_TUNABLE_PARAMS} "
                "(separators do not count)"
            )

        config = parameter.get("config") or {}
        if not isinstance(config, dict):
            raise ValueError(f"parameter {pid!r}: config must be an object")
        if param_type == "slider":
            minimum = _finite_number(config.get("min", 0), pid, "min")
            maximum = _finite_number(config.get("max", 100), pid, "max")
            step = _finite_number(config.get("step", 1), pid, "step")
            if maximum < minimum:
                raise ValueError(f"parameter {pid!r}: max must be >= min")
            if step <= 0:
                raise ValueError(f"parameter {pid!r}: step must be > 0")
        if param_type in {"dropdown", "enum"}:
            options = config.get("options")
            if not isinstance(options, list) or not options:
                raise ValueError(f"parameter {pid!r}: {param_type} requires options")
            if not all(isinstance(option, str) and option for option in options):
                raise ValueError(f"parameter {pid!r}: options must be non-empty strings")
            if validate_dynamic_values and str(parameter.get("value", "")) not in options:
                raise ValueError(
                    f"parameter {pid!r}: selected value "
                    f"{parameter.get('value')!r} is unavailable"
                )
        if param_type == "taglist":
            value = parameter.get("value")
            if not isinstance(value, list):
                raise ValueError(f"parameter {pid!r}: taglist value must be an array")
            for tag_index, tag in enumerate(value):
                if isinstance(tag, str):
                    if not tag.strip():
                        raise ValueError(f"parameter {pid!r}: tag {tag_index} must not be empty")
                    continue
                if not isinstance(tag, dict) or not isinstance(tag.get("text"), str) or not tag["text"].strip():
                    raise ValueError(f"parameter {pid!r}: tag {tag_index} must contain non-empty text")
                if "enabled" in tag and not isinstance(tag["enabled"], bool):
                    raise ValueError(f"parameter {pid!r}: tag {tag_index} enabled must be boolean")
        if param_type == "seed":
            behavior = config.get("control_after_generate", "fixed")
            if behavior not in {"fixed", "increment", "decrement", "randomize"}:
                raise ValueError(f"parameter {pid!r}: invalid seed behavior {behavior!r}")


def coerce_parameter_value(
    parameter: dict[str, Any], *, image_resolver: ImageResolver | None = None
) -> Any:
    param_type = parameter.get("param_type")
    pid = str(parameter.get("id", "?"))
    value = parameter.get("value")
    config = parameter.get("config") or {}

    if param_type in {"slider", "seed"}:
        if value is None:
            raise ValueError(f"parameter {pid!r}: value must be numeric")
        step = 1 if param_type == "seed" else _finite_number(config.get("step", 1), pid, "step")
        if float(step).is_integer() and float(step) == 1.0:
            try:
                return int(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"parameter {pid!r}: value must be int") from exc
        try:
            return float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"parameter {pid!r}: value must be float") from exc
    if param_type == "switch":
        return bool(value)
    if param_type in {"string", "dropdown", "enum"}:
        return "" if value is None else str(value)
    if param_type == "taglist":
        if isinstance(value, list):
            return [
                str(item.get("text", "")).strip() if isinstance(item, dict) else str(item).strip()
                for item in value
                if not isinstance(item, dict) or item.get("enabled", True)
            ]
        raise ValueError(f"parameter {pid!r}: taglist value must be an array")
    if param_type == "image":
        if image_resolver is None:
            raise ValueError(f"parameter {pid!r}: image resolver is unavailable")
        return image_resolver(value)
    raise ValueError(f"parameter {pid!r}: cannot coerce param_type {param_type!r}")


def parameters_to_outputs(
    parameters: list[dict[str, Any]],
    *,
    image_resolver: ImageResolver | None = None,
    validate_dynamic_values: bool = True,
) -> tuple[Any, ...]:
    """Validate parameters and return the fixed-width direct output tuple."""
    validate_parameters_list(
        parameters, validate_dynamic_values=validate_dynamic_values
    )
    outputs = [
        coerce_parameter_value(parameter, image_resolver=image_resolver)
        for parameter in parameters
        if parameter.get("param_type") != PARAM_TYPE_SEPARATOR
    ]
    outputs.extend([None] * (MAX_TUNABLE_PARAMS - len(outputs)))
    return tuple(outputs)
