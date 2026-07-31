from __future__ import annotations

import inspect
import json
import unittest
from unittest.mock import patch

from nodes.control.parameter_panel import ParameterPanel
from nodes._lib.parameter_values import MAX_TUNABLE_PARAMS


def model_parameter(pid: str, name: str, value: str, source: str = "checkpoint", options=None):
    return {
        "id": pid,
        "name": name,
        "param_type": "dropdown",
        "value": value,
        "config": {"source": source, "options": [value] if options is None else options},
    }


class ParameterPanelNodeTests(unittest.TestCase):
    def test_schema_and_validation_signature_remain_payload_only(self):
        schema = ParameterPanel.define_schema()
        self.assertEqual(schema.node_id, "ParameterPanel")
        self.assertEqual(len(schema.outputs), MAX_TUNABLE_PARAMS)
        self.assertEqual(list(inspect.signature(ParameterPanel.validate_inputs).parameters), [
            "parameters_json", "validate_dynamic_values",
        ])

    def test_known_model_path_is_checked_before_execution(self):
        payload = json.dumps([model_parameter("ckpt", "Checkpoint", "base.safetensors")])
        with patch(
            "nodes.control.parameter_panel.folder_paths.get_full_path",
            return_value="/models/base.safetensors",
        ) as get_full_path:
            self.assertIs(ParameterPanel.validate_inputs(payload), True)
        get_full_path.assert_called_once_with("checkpoints", "base.safetensors")

    def test_missing_model_is_rejected_by_validate_inputs(self):
        payload = json.dumps([model_parameter("upscale", "Upscale model", "missing.pth", "upscale_model")])
        with patch("nodes.control.parameter_panel.folder_paths.get_full_path", return_value=None):
            result = ParameterPanel.validate_inputs(payload)
        self.assertIsInstance(result, str)
        self.assertIn("upscale", result)
        self.assertIn("Upscale model", result)
        self.assertIn("missing.pth", result)
        self.assertIn("upscale_model", result)

    def test_stale_dynamic_options_keep_the_existing_unavailable_error(self):
        payload = json.dumps([model_parameter("ckpt", "Checkpoint", "removed.safetensors", options=["base.safetensors"])])
        with patch("nodes.control.parameter_panel.folder_paths.get_full_path") as get_full_path:
            result = ParameterPanel.validate_inputs(payload)
        self.assertIn("unavailable", result)
        get_full_path.assert_not_called()

    def test_disabled_dynamic_validation_skips_model_membership_and_path_checks(self):
        payload = json.dumps([model_parameter("ckpt", "Checkpoint", "removed.safetensors", options=["base.safetensors"])])
        with patch("nodes.control.parameter_panel.folder_paths.get_full_path") as get_full_path:
            self.assertIs(ParameterPanel.validate_inputs(payload, False), True)
        get_full_path.assert_not_called()

    def test_disabled_dynamic_validation_allows_an_empty_unused_source(self):
        payload = json.dumps([model_parameter("ckpt", "Checkpoint", "removed.safetensors", options=[])])
        with patch("nodes.control.parameter_panel.folder_paths.get_full_path") as get_full_path:
            self.assertIs(ParameterPanel.validate_inputs(payload, False), True)
        get_full_path.assert_not_called()

    def test_unknown_source_is_not_assigned_a_directory(self):
        payload = json.dumps([model_parameter("vendor", "Vendor model", "vendor.bin", "vendor_model")])
        with patch("nodes.control.parameter_panel.folder_paths.get_full_path") as get_full_path:
            self.assertIs(ParameterPanel.validate_inputs(payload), True)
        get_full_path.assert_not_called()

    def test_execute_and_fingerprint_contracts_remain_compatible(self):
        payload = json.dumps([{
            "id": "steps",
            "name": "Steps",
            "param_type": "slider",
            "value": 20,
            "config": {"min": 1, "max": 100, "step": 1},
        }])
        output = ParameterPanel.execute(payload)
        self.assertEqual(output.args[0], 20)
        self.assertEqual(len(output.args), MAX_TUNABLE_PARAMS)
        self.assertIn(payload, ParameterPanel.fingerprint_inputs(payload, False))


if __name__ == "__main__":
    unittest.main()
