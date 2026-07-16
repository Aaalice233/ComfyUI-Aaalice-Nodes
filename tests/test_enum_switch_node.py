"""Runtime contract tests for the V3 EnumSwitch node."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

# comfy_api lives at the ComfyUI root, while the package-local nodes module must
# remain first so these tests exercise this custom node project.
sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.tools.enum_switch import EnumSwitch  # noqa: E402


ROUTES = json.dumps(
    {
        "routes": [
            {"id": "draft", "key": "draft", "input": "branch_1"},
            {"id": "final", "key": "final", "input": "branch_2"},
        ]
    }
)


class EnumSwitchNodeTests(unittest.TestCase):
    def test_schema_uses_fixed_lazy_matchtype_branches(self):
        schema = EnumSwitch.define_schema()
        self.assertEqual(schema.node_id, "EnumSwitch")
        self.assertEqual(len(schema.inputs), 33)
        self.assertTrue(schema.inputs[0].force_input)
        self.assertIsNone(schema.inputs[0].default)
        self.assertTrue(all(item.optional and item.lazy for item in schema.inputs[1:]))
        self.assertIs(schema.inputs[1].template, schema.outputs[0].template)

    def test_lazy_status_requests_only_selected_branch(self):
        self.assertEqual(
            EnumSwitch.check_lazy_status("final", ROUTES, branch_1=None, branch_2=None),
            ["branch_2"],
        )

    def test_lazy_status_is_ready_after_selected_branch_resolves(self):
        self.assertEqual(
            EnumSwitch.check_lazy_status("final", ROUTES, branch_1=None, branch_2="value"),
            [],
        )

    def test_missing_selected_branch_fails(self):
        with self.assertRaisesRegex(ValueError, "not connected"):
            EnumSwitch.check_lazy_status("final", ROUTES, branch_1="unused")

    def test_execute_returns_selected_value(self):
        output = EnumSwitch.execute("final", ROUTES, branch_1="unused", branch_2="selected")
        self.assertEqual(output.args, ("selected",))


if __name__ == "__main__":
    unittest.main()
