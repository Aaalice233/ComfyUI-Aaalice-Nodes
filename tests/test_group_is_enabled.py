"""Runtime contract tests for the V3 GroupIsEnabled node and its payload helpers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.group_state import parse_group_state_payload  # noqa: E402
from nodes.control import NODE_CLASSES  # noqa: E402
from nodes.control.group_is_enabled import GroupIsEnabled  # noqa: E402


def payload(state, title="Upscalers"):
    import json
    return json.dumps({"version": 1, "title": title, "state": state})


class GroupIsEnabledSchemaTests(unittest.TestCase):
    def test_node_is_registered_in_the_control_domain(self):
        self.assertIn(GroupIsEnabled, NODE_CLASSES)

    def test_schema_reports_disabled_state(self):
        schema = GroupIsEnabled.define_schema()
        self.assertEqual(schema.node_id, "GroupIsEnabled")
        self.assertEqual(schema.category, "Aaalice/control")
        self.assertEqual(schema.display_name, "🚦 Group Is Enabled")
        self.assertEqual(schema.inputs, [])
        self.assertTrue(schema.accept_all_inputs)
        self.assertEqual([item.id for item in schema.outputs], ["disabled"])


class GroupIsEnabledPayloadTests(unittest.TestCase):
    def test_parse_accepts_every_known_state(self):
        for state in ("enabled", "disabled", "mixed", "empty", "missing"):
            parsed = parse_group_state_payload(payload(state))
            self.assertEqual(parsed, {"title": "Upscalers", "state": state})

    def test_parse_rejects_missing_invalid_and_unknown_payloads(self):
        for raw in ("", "not json", "{}", '{"version": 2, "state": "enabled"}', '{"version": 1, "state": "banana"}'):
            with self.assertRaises(ValueError, msg=raw):
                parse_group_state_payload(raw)


class GroupIsEnabledExecuteTests(unittest.TestCase):
    def test_enabled_group_reports_not_disabled(self):
        output = GroupIsEnabled.execute(payload("enabled"))
        self.assertEqual(output.args, (False,))

    def test_disabled_group_reports_disabled(self):
        output = GroupIsEnabled.execute(payload("disabled"))
        self.assertEqual(output.args, (True,))

    def test_mixed_group_reports_not_disabled(self):
        output = GroupIsEnabled.execute(payload("mixed"))
        self.assertEqual(output.args, (False,))

    def test_missing_group_fails_with_the_selected_title(self):
        with self.assertRaisesRegex(ValueError, "Upscalers"):
            GroupIsEnabled.execute(payload("missing"))

    def test_missing_selection_fails_with_a_clear_marker(self):
        with self.assertRaisesRegex(ValueError, "none selected"):
            GroupIsEnabled.execute(payload("missing", title=""))

    def test_empty_group_fails_instead_of_guessing(self):
        with self.assertRaisesRegex(ValueError, "empty visual group"):
            GroupIsEnabled.execute(payload("empty"))

    def test_missing_payload_fails(self):
        with self.assertRaisesRegex(ValueError, "group_state_payload is required"):
            GroupIsEnabled.execute("")


if __name__ == "__main__":
    unittest.main()
