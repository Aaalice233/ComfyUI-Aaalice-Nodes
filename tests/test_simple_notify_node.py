"""Runtime contract tests for the V3 SimpleNotify node."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.tools.simple_notify import SimpleNotify  # noqa: E402
from nodes.tools import NODE_CLASSES  # noqa: E402


class SimpleNotifyNodeTests(unittest.TestCase):
    def test_node_is_registered_in_the_tools_domain(self):
        self.assertIn(SimpleNotify, NODE_CLASSES)

    def test_schema_is_a_matchtype_output_node(self):
        schema = SimpleNotify.define_schema()
        self.assertEqual(schema.node_id, "SimpleNotify")
        self.assertEqual(schema.category, "Aaalice/tools")
        self.assertEqual([item.id for item in schema.inputs], [
            "value", "message", "desktop_notification", "sound", "volume",
        ])
        self.assertTrue(schema.is_output_node)
        self.assertFalse(schema.is_input_list)
        self.assertTrue(schema.not_idempotent)
        self.assertIs(schema.inputs[0].template, schema.outputs[0].template)
        self.assertFalse(schema.outputs[0].is_output_list)

    def test_schema_defaults_enable_both_alert_channels(self):
        schema = SimpleNotify.define_schema()
        self.assertEqual(schema.inputs[1].default, "")
        self.assertIs(schema.inputs[2].default, True)
        self.assertIs(schema.inputs[3].default, True)
        self.assertEqual(schema.inputs[4].default, 0.5)

    def test_execute_preserves_each_input_value(self):
        value = {"second": True}
        output = SimpleNotify.execute(
            value,
            message="Ready",
            desktop_notification=True,
            sound=False,
            volume=0.7,
        )
        self.assertIs(output.args[0], value)
        self.assertEqual(output.ui, {
            "aaalice_simple_notify": [{
                "message": "Ready",
                "desktop_notification": True,
                "sound": False,
                "volume": 0.7,
            }],
        })

    def test_execute_accepts_direct_scalar_values_for_unit_use(self):
        value = {"image": "placeholder"}
        output = SimpleNotify.execute(value, "Done", False, True, 0.25)
        self.assertIs(output.args[0], value)
        self.assertEqual(output.ui["aaalice_simple_notify"][0]["message"], "Done")

    def test_volume_is_clamped_and_invalid_values_use_default(self):
        high = SimpleNotify.execute(1, volume=9).ui["aaalice_simple_notify"][0]
        low = SimpleNotify.execute(1, volume=-2).ui["aaalice_simple_notify"][0]
        invalid = SimpleNotify.execute(1, volume="bad").ui["aaalice_simple_notify"][0]
        self.assertEqual(high["volume"], 1.0)
        self.assertEqual(low["volume"], 0.0)
        self.assertEqual(invalid["volume"], 0.5)

    def test_fingerprint_changes_for_every_queue(self):
        self.assertNotEqual(SimpleNotify.fingerprint_inputs(), SimpleNotify.fingerprint_inputs())


if __name__ == "__main__":
    unittest.main()
