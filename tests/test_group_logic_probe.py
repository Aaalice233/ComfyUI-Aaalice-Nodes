"""Runtime contract tests for the V3 GroupLogicProbe node and its logic helpers."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.group_state import evaluate_group_logic, parse_group_logic_payload  # noqa: E402
from nodes.control import NODE_CLASSES  # noqa: E402
from nodes.control.group_logic_probe import GroupLogicProbe  # noqa: E402


def payload(mode, conditions):
    return json.dumps({
        "version": 1,
        "mode": mode,
        "conditions": [{"title": title, "expect": expect, "state": state} for title, expect, state in conditions],
    })


class GroupLogicProbeSchemaTests(unittest.TestCase):
    def test_node_is_registered_in_the_control_domain(self):
        self.assertIn(GroupLogicProbe, NODE_CLASSES)

    def test_schema_reports_single_boolean_result(self):
        schema = GroupLogicProbe.define_schema()
        self.assertEqual(schema.node_id, "GroupLogicProbe")
        self.assertEqual(schema.category, "Aaalice/control")
        self.assertEqual(schema.display_name, "🧭 Group Logic Probe")
        self.assertEqual(schema.inputs, [])
        self.assertTrue(schema.accept_all_inputs)
        self.assertEqual([item.id for item in schema.outputs], ["result"])


class GroupLogicPayloadTests(unittest.TestCase):
    def test_parse_accepts_valid_payload(self):
        parsed = parse_group_logic_payload(payload("or", [("A", "disabled", "disabled")]))
        self.assertEqual(parsed["mode"], "or")
        self.assertEqual(parsed["conditions"], [{"title": "A", "expect": "disabled", "state": "disabled"}])

    def test_parse_rejects_invalid_payloads(self):
        bad = (
            "",
            "not json",
            "{}",
            payload("xor", [("A", "disabled", "disabled")]),
            payload("and", []),
            payload("and", [("A", "running", "enabled")]),
            payload("and", [("A", "enabled", "running")]),
        )
        for raw in bad:
            with self.assertRaises(ValueError, msg=raw):
                parse_group_logic_payload(raw)


class GroupLogicEvaluateTests(unittest.TestCase):
    def test_and_requires_every_condition(self):
        self.assertTrue(GroupLogicProbe.execute(payload("and", [("A", "disabled", "disabled"), ("B", "enabled", "enabled")])).args[0])
        self.assertFalse(GroupLogicProbe.execute(payload("and", [("A", "disabled", "disabled"), ("B", "enabled", "disabled")])).args[0])

    def test_or_requires_any_condition(self):
        self.assertTrue(GroupLogicProbe.execute(payload("or", [("A", "disabled", "enabled"), ("B", "enabled", "enabled")])).args[0])
        self.assertFalse(GroupLogicProbe.execute(payload("or", [("A", "disabled", "enabled"), ("B", "enabled", "mixed")])).args[0])

    def test_mixed_state_matches_neither_expectation(self):
        self.assertFalse(GroupLogicProbe.execute(payload("or", [("A", "enabled", "mixed"), ("B", "disabled", "mixed")])).args[0])

    def test_missing_group_fails_with_its_title(self):
        with self.assertRaisesRegex(ValueError, "OldGroup"):
            GroupLogicProbe.execute(payload("and", [("OldGroup", "disabled", "missing")]))

    def test_empty_group_fails_instead_of_guessing(self):
        with self.assertRaisesRegex(ValueError, "empty visual group"):
            GroupLogicProbe.execute(payload("or", [("A", "disabled", "empty")]))

    def test_missing_payload_fails(self):
        with self.assertRaisesRegex(ValueError, "group_logic_payload is required"):
            GroupLogicProbe.execute("")

    def test_evaluate_matches_parse_and_execute(self):
        parsed = parse_group_logic_payload(payload("and", [("A", "disabled", "disabled")]))
        self.assertIs(evaluate_group_logic(parsed), True)


if __name__ == "__main__":
    unittest.main()
