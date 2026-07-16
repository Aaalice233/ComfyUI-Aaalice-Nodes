"""Tests for the pure EnumSwitch route contract."""

from __future__ import annotations

import json
import unittest

from nodes._lib.enum_switch import MAX_ENUM_BRANCHES, parse_routes, selected_input


def payload(keys: list[str]) -> str:
    return json.dumps(
        {
            "version": 1,
            "routes": [
                {"id": f"route_{index}", "key": key, "input": f"branch_{index + 1}"}
                for index, key in enumerate(keys)
            ],
        }
    )


class EnumSwitchRouteTests(unittest.TestCase):
    def test_exact_selector_returns_matching_input(self):
        self.assertEqual(selected_input("final", payload(["draft", "final"])), "branch_2")

    def test_selector_is_case_sensitive(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            selected_input("Final", payload(["final"]))

    def test_unknown_selector_fails_instead_of_falling_back(self):
        with self.assertRaisesRegex(ValueError, "missing"):
            selected_input("missing", payload(["option_a", "option_b"]))

    def test_duplicate_keys_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate.*key"):
            parse_routes(payload(["same", "same"]))

    def test_empty_key_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "empty key"):
            parse_routes(payload([""]))

    def test_empty_routes_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "requires 1"):
            parse_routes(payload([]))

    def test_all_32_routes_are_supported(self):
        keys = [f"option_{index}" for index in range(MAX_ENUM_BRANCHES)]
        self.assertEqual(len(parse_routes(payload(keys))), MAX_ENUM_BRANCHES)
        self.assertEqual(selected_input(keys[-1], payload(keys)), "branch_32")

    def test_more_than_32_routes_are_rejected(self):
        keys = [f"option_{index}" for index in range(MAX_ENUM_BRANCHES + 1)]
        with self.assertRaisesRegex(ValueError, "1 to 32"):
            parse_routes(payload(keys))

    def test_input_ids_must_match_route_order(self):
        value = json.dumps({"routes": [{"id": "a", "key": "a", "input": "branch_2"}]})
        with self.assertRaisesRegex(ValueError, "invalid input id"):
            parse_routes(value)


if __name__ == "__main__":
    unittest.main()

