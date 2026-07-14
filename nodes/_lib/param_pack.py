"""Param pack pure logic: parse, validate, coerce, build execution payload.

No ComfyNode imports — safe for unit tests and frontend contract docs.
"""

from __future__ import annotations

import json
from typing import Any

MAX_TUNABLE_PARAMS = 32

PARAM_TYPE_SEPARATOR = "separator"
PARAM_TYPES_TUNABLE = frozenset({"slider", "switch", "string", "dropdown"})
PARAM_TYPES_ALL = PARAM_TYPES_TUNABLE | {PARAM_TYPE_SEPARATOR}


def parse_parameters_json(raw: str | None) -> list[dict[str, Any]]:
    """Parse parameters_json widget value into a list of parameter dicts."""
    if raw is None or raw == "":
        return []
    if not isinstance(raw, str):
        raise ValueError("parameters_json must be a JSON string")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"parameters_json is not valid JSON: {exc}") from exc
    if data is None:
        return []
    if not isinstance(data, list):
        raise ValueError("parameters_json must be a JSON array")
    return data


def _is_tunable(param: dict[str, Any]) -> bool:
    return param.get("param_type") != PARAM_TYPE_SEPARATOR


def validate_parameters_list(parameters: list[dict[str, Any]]) -> None:
    """Raise ValueError if the list violates Phase A rules."""
    if not isinstance(parameters, list):
        raise ValueError("parameters must be a list")

    ids: set[str] = set()
    names: set[str] = set()
    tunable_count = 0

    for i, param in enumerate(parameters):
        if not isinstance(param, dict):
            raise ValueError(f"parameter at index {i} must be an object")

        pid = param.get("id")
        if not isinstance(pid, str) or not pid.strip():
            raise ValueError(f"parameter at index {i} needs a non-empty string id")
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
        if name in names:
            raise ValueError(f"duplicate parameter name: {name}")
        names.add(name)

        if ptype == PARAM_TYPE_SEPARATOR:
            continue

        tunable_count += 1
        if tunable_count > MAX_TUNABLE_PARAMS:
            raise ValueError(
                f"tunable parameter count exceeds {MAX_TUNABLE_PARAMS} "
                "(separators do not count)"
            )

        if ptype == "dropdown":
            config = param.get("config") or {}
            options = config.get("options")
            if not isinstance(options, list) or len(options) == 0:
                raise ValueError(
                    f"parameter {pid!r}: dropdown requires a non-empty options list"
                )
            if not all(isinstance(o, str) and o != "" for o in options):
                raise ValueError(
                    f"parameter {pid!r}: dropdown options must be non-empty strings"
                )


def coerce_parameter_value(param: dict[str, Any]) -> tuple[Any, str]:
    """Return (runtime_value, comfy_type_string) for one tunable parameter."""
    ptype = param.get("param_type")
    pid = param.get("id", "?")
    value = param.get("value")
    config = param.get("config") or {}

    if ptype == "slider":
        step = config.get("step", 1)
        try:
            step_f = float(step)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"parameter {pid!r}: invalid slider step") from exc
        # step == 1 (int-like) → INT; otherwise FLOAT
        if step_f == 1.0 and float(step_f).is_integer():
            try:
                return int(value), "INT"
            except (TypeError, ValueError) as exc:
                raise ValueError(f"parameter {pid!r}: slider value must be int") from exc
        try:
            return float(value), "FLOAT"
        except (TypeError, ValueError) as exc:
            raise ValueError(f"parameter {pid!r}: slider value must be float") from exc

    if ptype == "switch":
        return bool(value), "BOOLEAN"

    if ptype == "string":
        return "" if value is None else str(value), "STRING"

    if ptype == "dropdown":
        options = list((config.get("options") or []))
        if not options:
            raise ValueError(f"parameter {pid!r}: dropdown has no options")
        s = "" if value is None else str(value)
        if s not in options:
            raise ValueError(
                f"parameter {pid!r}: value {s!r} is not in options {options!r}"
            )
        return s, "STRING"

    raise ValueError(f"parameter {pid!r}: cannot coerce param_type {ptype!r}")


def build_param_pack(parameters: list[dict[str, Any]]) -> dict[str, Any]:
    """Build execution Param Pack from a validated parameter list."""
    validate_parameters_list(parameters)

    meta: list[dict[str, Any]] = []
    values: dict[str, Any] = {}
    order = 0

    for param in parameters:
        if param.get("param_type") == PARAM_TYPE_SEPARATOR:
            continue

        pid = str(param["id"])
        name = str(param["name"])
        runtime_value, comfy_type = coerce_parameter_value(param)
        config = param.get("config") or {}

        entry: dict[str, Any] = {
            "id": pid,
            "name": name,
            "type": comfy_type,
            "order": order,
            "param_type": param.get("param_type"),
        }
        if param.get("param_type") == "dropdown":
            entry["options"] = list(config.get("options") or [])
            entry["config"] = dict(config)

        meta.append(entry)
        values[pid] = runtime_value
        order += 1

    if len(meta) > MAX_TUNABLE_PARAMS:
        raise ValueError(
            f"Param Pack has {len(meta)} tunable parameters; "
            f"maximum is {MAX_TUNABLE_PARAMS}"
        )

    return {"_meta": meta, "_values": values}


def pack_to_break_outputs(pack: dict[str, Any] | None) -> tuple[Any, ...]:
    """Expand a pack into MAX_TUNABLE_PARAMS slot values (None-padded)."""
    outputs: list[Any] = [None] * MAX_TUNABLE_PARAMS
    if not pack or not isinstance(pack, dict):
        return tuple(outputs)

    meta = pack.get("_meta") or []
    values = pack.get("_values") or {}
    if not isinstance(meta, list) or not isinstance(values, dict):
        raise ValueError("Param Pack must contain _meta list and _values dict")

    if len(meta) > MAX_TUNABLE_PARAMS:
        raise ValueError(
            f"Param Pack has {len(meta)} outputs; maximum is {MAX_TUNABLE_PARAMS}"
        )

    for i, entry in enumerate(meta):
        if not isinstance(entry, dict):
            raise ValueError(f"_meta[{i}] must be an object")
        pid = entry.get("id")
        if pid is None:
            raise ValueError(f"_meta[{i}] missing id")
        pid = str(pid)
        if pid not in values:
            # Prefer explicit defaults by declared type rather than silent invent
            comfy_type = entry.get("type", "*")
            if comfy_type == "INT":
                outputs[i] = 0
            elif comfy_type == "FLOAT":
                outputs[i] = 0.0
            elif comfy_type == "BOOLEAN":
                outputs[i] = False
            elif comfy_type == "STRING":
                outputs[i] = ""
            else:
                outputs[i] = None
        else:
            outputs[i] = values[pid]

    return tuple(outputs)
