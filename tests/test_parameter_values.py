from __future__ import annotations

import json
import unittest

from nodes._lib.parameter_values import (
    MAX_TUNABLE_PARAMS,
    parameters_to_outputs,
    parse_parameters_json,
    validate_model_references,
    validate_parameters_list,
)


def parameter(pid: str, name: str, value=1):
    return {
        "id": pid,
        "name": name,
        "param_type": "slider",
        "value": value,
        "config": {"min": 0, "max": 100, "step": 1},
    }


class ParameterValueTests(unittest.TestCase):
    def test_parse_payload(self):
        raw = json.dumps([parameter("steps", "Steps", 20)])
        self.assertEqual(parse_parameters_json(raw)[0]["id"], "steps")

    def test_empty_parameters_are_legal(self):
        self.assertEqual(
            parameters_to_outputs([]),
            (None,) * MAX_TUNABLE_PARAMS,
        )

    def test_dynamic_validation_can_follow_connection_state(self):
        dynamic = {
            "id": "sampler",
            "name": "Sampler",
            "param_type": "dropdown",
            "value": "removed_sampler",
            "config": {"options": ["euler"], "source": "sampler"},
        }
        parameters_to_outputs([dynamic], validate_dynamic_values=False)
        with self.assertRaisesRegex(ValueError, "unavailable"):
            parameters_to_outputs([dynamic], validate_dynamic_values=True)

    def test_known_model_sources_use_the_injected_path_resolver(self):
        model = {
            "id": "checkpoint",
            "name": "Checkpoint",
            "param_type": "dropdown",
            "value": "base.safetensors",
            "config": {"source": "checkpoint", "options": ["base.safetensors"]},
        }
        calls = []
        validate_model_references(
            [model],
            resolve_path=lambda folder, value: calls.append((folder, value)) or "/models/base.safetensors",
        )
        self.assertEqual(calls, [("checkpoints", "base.safetensors")])

    def test_missing_known_model_reference_reports_identity_and_source(self):
        model = {
            "id": "upscale",
            "name": "Upscale model",
            "param_type": "dropdown",
            "value": "missing.pth",
            "config": {"source": "upscale_model", "options": ["missing.pth"]},
        }
        with self.assertRaisesRegex(ValueError, "upscale.*Upscale model.*missing\\.pth.*upscale_model"):
            validate_model_references([model], resolve_path=lambda _folder, _value: None)

    def test_unknown_model_source_is_not_guessed(self):
        model = {
            "id": "vendor",
            "name": "Vendor model",
            "param_type": "dropdown",
            "value": "vendor.bin",
            "config": {"source": "vendor_model", "options": ["vendor.bin"]},
        }
        validate_model_references([model], resolve_path=lambda _folder, _value: None)

    def test_parameter_names_are_case_insensitively_unique(self):
        with self.assertRaisesRegex(ValueError, "duplicate parameter name"):
            validate_parameters_list(
                [parameter("a", "Steps"), parameter("b", "steps")]
            )

    def test_numeric_value_cannot_be_null(self):
        with self.assertRaisesRegex(ValueError, "value must be numeric"):
            parameters_to_outputs([parameter("steps", "Steps", None)])

    def test_parameter_limit_and_output_padding(self):
        parameters = [parameter(f"p{i}", f"P{i}", i) for i in range(MAX_TUNABLE_PARAMS)]
        outputs = parameters_to_outputs(parameters)
        self.assertEqual(len(outputs), MAX_TUNABLE_PARAMS)
        self.assertEqual(outputs[0], 0)
        self.assertEqual(outputs[-1], MAX_TUNABLE_PARAMS - 1)
        with self.assertRaisesRegex(ValueError, "exceeds 32"):
            parameters_to_outputs(parameters + [parameter("extra", "Extra")])

    def test_separator_does_not_consume_direct_output(self):
        outputs = parameters_to_outputs([
            parameter("first", "First", 3),
            {"id": "section", "name": "Section", "param_type": "separator", "value": None, "config": {}},
            parameter("second", "Second", 7),
        ])
        self.assertEqual(outputs[:2], (3, 7))
        self.assertEqual(len(outputs), MAX_TUNABLE_PARAMS)

    def test_switch_and_dropdown_are_direct_values(self):
        outputs = parameters_to_outputs([
            {"id": "enabled", "name": "Enabled", "param_type": "switch", "value": True, "config": {}},
            {"id": "mode", "name": "Mode", "param_type": "dropdown", "value": "euler", "config": {"options": ["euler", "normal"]}},
        ])
        self.assertEqual(outputs[:2], (True, "euler"))

    def test_seed_and_taglist_are_direct_values(self):
        outputs = parameters_to_outputs([
            {
                "id": "seed",
                "name": "Seed",
                "param_type": "seed",
                "value": 7,
                "config": {"control_after_generate": "increment"},
            },
            {
                "id": "tags",
                "name": "Tags",
                "param_type": "taglist",
                "value": [
                    {"text": "cat", "enabled": True},
                    {"text": "blue eyes", "enabled": False},
                    {"text": "1girl", "enabled": True},
                ],
                "config": {},
            },
        ])
        self.assertEqual(outputs[:2], (7, ["cat", "1girl"]))

    def test_legacy_taglist_strings_remain_enabled(self):
        outputs = parameters_to_outputs([{
            "id": "tags", "name": "Tags", "param_type": "taglist",
            "value": ["cat", "blue eyes"], "config": {},
        }])
        self.assertEqual(outputs[0], ["cat", "blue eyes"])


if __name__ == "__main__":
    unittest.main()
