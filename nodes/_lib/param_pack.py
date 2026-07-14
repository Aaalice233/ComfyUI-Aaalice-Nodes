"""Pure helpers for ParameterPanel payloads and Param Packs."""

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


def _parse_json(raw: str | None, *, field: str, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    if not isinstance(raw, str):
        raise ValueError(f"{field} must be a JSON string")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field} is not valid JSON: {exc}") from exc


def parse_parameters_json(raw: str | None) -> list[dict[str, Any]]:
    data = _parse_json(raw, field="parameters_json", default=[])
    if not isinstance(data, list):
        raise ValueError("parameters_json must be a JSON array")
    return data


def validate_parameters_list(
    parameters: list[dict[str, Any]], *, validate_dynamic_values: bool = True
) -> None:
    if not isinstance(parameters, list):
        raise ValueError("parameters must be a list")

    ids: set[str] = set()
    names: set[str] = set()
    tunable_count = 0
    for index, param in enumerate(parameters):
        if not isinstance(param, dict):
            raise ValueError(f"parameter at index {index} must be an object")

        pid = param.get("id")
        if not isinstance(pid, str) or not pid.strip():
            raise ValueError(f"parameter at index {index} needs a non-empty string id")
        if pid in ids:
            raise ValueError(f"duplicate parameter id: {pid}")
        ids.add(pid)

        ptype = param.get("param_type")
        if ptype not in PARAM_TYPES_ALL:
            raise ValueError(
                f"parameter {pid!r}: unsupported param_type {ptype!r} "
                f"(allowed: {sorted(PARAM_TYPES_ALL)})"
            )

        name = param.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"parameter {pid!r}: name must be a non-empty string")
        name_key = name.strip().casefold()
        if name_key in names:
            raise ValueError(f"duplicate parameter name: {name}")
        names.add(name_key)

        if ptype == PARAM_TYPE_SEPARATOR:
            continue
        tunable_count += 1
        if tunable_count > MAX_TUNABLE_PARAMS:
            raise ValueError(
                f"tunable parameter count exceeds {MAX_TUNABLE_PARAMS} "
                "(separators do not count)"
            )

        config = param.get("config") or {}
        if not isinstance(config, dict):
            raise ValueError(f"parameter {pid!r}: config must be an object")
        if ptype == "slider":
            minimum = _finite_number(config.get("min", 0), pid, "min")
            maximum = _finite_number(config.get("max", 100), pid, "max")
            step = _finite_number(config.get("step", 1), pid, "step")
            if maximum < minimum:
                raise ValueError(f"parameter {pid!r}: max must be >= min")
            if step <= 0:
                raise ValueError(f"parameter {pid!r}: step must be > 0")
        if ptype in {"dropdown", "enum"}:
            options = config.get("options")
            if not isinstance(options, list) or not options:
                raise ValueError(f"parameter {pid!r}: {ptype} requires options")
            if not all(isinstance(option, str) and option for option in options):
                raise ValueError(f"parameter {pid!r}: options must be non-empty strings")
            if validate_dynamic_values and str(param.get("value", "")) not in options:
                raise ValueError(
                    f"parameter {pid!r}: selected value {param.get('value')!r} is unavailable"
                )
        if ptype == "seed":
            behavior = config.get("control_after_generate", "fixed")
            if behavior not in {"fixed", "increment", "decrement", "randomize"}:
                raise ValueError(f"parameter {pid!r}: invalid seed behavior {behavior!r}")


def _finite_number(value: Any, pid: str, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"parameter {pid!r}: {field} must be numeric") from exc
    if number != number or number in {float("inf"), float("-inf")}:
        raise ValueError(f"parameter {pid!r}: {field} must be finite")
    return number


def coerce_parameter_value(
    param: dict[str, Any], *, image_resolver: ImageResolver | None = None
) -> tuple[Any, str]:
    ptype = param.get("param_type")
    pid = str(param.get("id", "?"))
    value = param.get("value")
    config = param.get("config") or {}

    if ptype in {"slider", "seed"}:
        step = 1 if ptype == "seed" else _finite_number(config.get("step", 1), pid, "step")
        if float(step).is_integer() and float(step) == 1.0:
            try:
                return int(value), "INT"
            except (TypeError, ValueError) as exc:
                raise ValueError(f"parameter {pid!r}: value must be int") from exc
        try:
            return float(value), "FLOAT"
        except (TypeError, ValueError) as exc:
            raise ValueError(f"parameter {pid!r}: value must be float") from exc
    if ptype == "switch":
        return bool(value), "BOOLEAN"
    if ptype == "string":
        return "" if value is None else str(value), "STRING"
    if ptype in {"dropdown", "enum"}:
        return "" if value is None else str(value), "STRING"
    if ptype == "taglist":
        if isinstance(value, list):
            return [str(item) for item in value], "AAALICE_TAG_LIST"
        raise ValueError(f"parameter {pid!r}: taglist value must be an array")
    if ptype == "image":
        if image_resolver is None:
            raise ValueError(f"parameter {pid!r}: image resolver is unavailable")
        return image_resolver(value), "IMAGE"
    raise ValueError(f"parameter {pid!r}: cannot coerce param_type {ptype!r}")


def build_param_pack(
    parameters: list[dict[str, Any]],
    *,
    image_resolver: ImageResolver | None = None,
    validate_dynamic_values: bool = True,
) -> dict[str, Any]:
    validate_parameters_list(
        parameters, validate_dynamic_values=validate_dynamic_values
    )
    meta: list[dict[str, Any]] = []
    values: dict[str, Any] = {}
    for parameter in parameters:
        if parameter.get("param_type") == PARAM_TYPE_SEPARATOR:
            continue
        pid = str(parameter["id"])
        runtime_value, comfy_type = coerce_parameter_value(
            parameter, image_resolver=image_resolver
        )
        entry: dict[str, Any] = {
            "id": pid,
            "name": str(parameter["name"]),
            "type": comfy_type,
            "order": len(meta),
            "param_type": parameter.get("param_type"),
            "config": dict(parameter.get("config") or {}),
        }
        config = parameter.get("config") or {}
        if parameter.get("param_type") in {"dropdown", "enum"}:
            entry["options"] = list(config.get("options") or [])
        meta.append(entry)
        values[pid] = runtime_value
    return {"_meta": meta, "_values": values}


def pack_to_break_outputs(pack: dict[str, Any] | None) -> tuple[Any, ...]:
    outputs: list[Any] = [None] * MAX_TUNABLE_PARAMS
    if not pack:
        return tuple(outputs)
    meta = pack.get("_meta") or []
    values = pack.get("_values") or {}
    if not isinstance(meta, list) or not isinstance(values, dict):
        raise ValueError("Param Pack must contain _meta list and _values dict")
    if len(meta) > MAX_TUNABLE_PARAMS:
        raise ValueError(
            f"Param Pack has {len(meta)} outputs; maximum is {MAX_TUNABLE_PARAMS}"
        )
    for index, entry in enumerate(meta):
        if not isinstance(entry, dict) or "id" not in entry:
            raise ValueError(f"_meta[{index}] must contain id")
        pid = str(entry["id"])
        if pid in values:
            outputs[index] = values[pid]
            continue
        outputs[index] = {
            "INT": 0,
            "FLOAT": 0.0,
            "BOOLEAN": False,
            "STRING": "",
        }.get(entry.get("type"))
    return tuple(outputs)
