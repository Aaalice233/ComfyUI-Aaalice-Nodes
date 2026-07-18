from __future__ import annotations

import inspect
import json
import unittest

from nodes.prompt import NODE_CLASSES
from nodes.prompt.prompt_selector import PromptSelector


class PromptSelectorNodeTests(unittest.TestCase):
    def test_custom_validation_only_reads_injected_selection(self):
        signature = inspect.signature(PromptSelector.validate_inputs)
        self.assertEqual(list(signature.parameters), ["selection_payload_json"])

    def test_registration_and_schema(self):
        self.assertIn(PromptSelector, NODE_CLASSES)
        schema = PromptSelector.define_schema()
        self.assertEqual(schema.node_id, "PromptSelector")
        self.assertEqual(schema.category, "Aaalice/prompt")
        self.assertEqual([item.id for item in schema.inputs], ["prefix_prompt"])
        self.assertTrue(schema.inputs[0].optional)
        self.assertTrue(schema.inputs[0].force_input)
        self.assertEqual([item.id for item in schema.outputs], ["prompt"])
        self.assertTrue(schema.accept_all_inputs)

    def test_execute_and_validation_use_injected_payload(self):
        value = json.dumps({"version": 1, "separator": ", ", "selections": [
            {"entryId": "a", "text": "red hair", "weight": 1},
        ]})
        self.assertIs(PromptSelector.validate_inputs(selection_payload_json=value), True)
        self.assertEqual(PromptSelector.execute("portrait", value).args, ("portrait, red hair",))
        self.assertIsInstance(PromptSelector.validate_inputs(selection_payload_json="{"), str)


if __name__ == "__main__":
    unittest.main()
