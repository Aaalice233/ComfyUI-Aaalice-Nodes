from __future__ import annotations

import json
import unittest

from nodes._lib.prompt_selector import compose_prompt, parse_selection_payload


def payload(selections, separator=", "):
    return json.dumps({"version": 1, "separator": separator, "selections": selections})


class PromptSelectorLogicTests(unittest.TestCase):
    def test_composes_prefix_order_separator_and_weights(self):
        value = payload([
            {"entryId": "b", "text": "blue eyes", "weight": 1},
            {"entryId": "a", "text": "red hair", "weight": 1.25},
            {"entryId": "z", "text": "smile", "weight": 0},
        ], " | ")
        self.assertEqual(compose_prompt("portrait", value), "portrait | blue eyes | (red hair:1.25) | (smile:0)")

    def test_empty_selection_keeps_prefix_or_empty_output(self):
        self.assertEqual(compose_prompt("prefix", payload([])), "prefix")
        self.assertEqual(compose_prompt("", payload([])), "")

    def test_missing_text_rejects_execution(self):
        value = payload([{"entryId": "missing", "weight": 1}])
        with self.assertRaisesRegex(ValueError, "missing from the prompt library"):
            compose_prompt("", value)

    def test_rejects_duplicate_ids_and_invalid_weights(self):
        with self.assertRaisesRegex(ValueError, "duplicate entry id"):
            parse_selection_payload(payload([
                {"entryId": "a", "text": "a", "weight": 1},
                {"entryId": "a", "text": "a", "weight": 1},
            ]))
        for weight in (-1, 20.01, 1.234):
            with self.assertRaises(ValueError):
                parse_selection_payload(payload([{"entryId": "a", "text": "a", "weight": weight}]))


if __name__ == "__main__":
    unittest.main()
