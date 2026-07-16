from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.prompt import NODE_CLASSES
from nodes.prompt.prompt_cleaning_maid import PromptCleaningMaid


class PromptCleaningMaidNodeTests(unittest.TestCase):
    def test_node_is_registered_with_string_socket_contract(self):
        self.assertIn(PromptCleaningMaid, NODE_CLASSES)
        schema = PromptCleaningMaid.define_schema()
        self.assertEqual(schema.node_id, "PromptCleaningMaid")
        self.assertEqual(schema.category, "Aaalice/prompt")
        self.assertEqual([item.id for item in schema.inputs], ["text"])
        self.assertTrue(schema.inputs[0].force_input)
        self.assertEqual([item.id for item in schema.outputs], ["text"])
        self.assertTrue(schema.accept_all_inputs)

    def test_execute_uses_defaults_without_frontend(self):
        output = PromptCleaningMaid.execute("  A sentence.  ")
        self.assertEqual(output.args, ("A sentence.",))

    def test_execute_uses_injected_tag_list_config(self):
        payload = json.dumps({"mode": "tag_list"})
        output = PromptCleaningMaid.execute("a, A, b", config_json=payload)
        self.assertEqual(output.args, ("a, b",))

    def test_execute_off_mode_is_an_exact_passthrough(self):
        payload = json.dumps({"mode": "off"})
        source = "  a, A  \r\n"
        output = PromptCleaningMaid.execute(source, config_json=payload)
        self.assertEqual(output.args, (source,))

    def test_execute_preserves_partition_control_prompts(self):
        payload = json.dumps({"mode": "tag_list"})
        source = "red hair\nBREAK\nred hair\nADDCOL\nblue eyes"
        output = PromptCleaningMaid.execute(source, config_json=payload)
        self.assertEqual(output.args, (source,))

    def test_validate_inputs_rejects_corrupt_config(self):
        self.assertIs(PromptCleaningMaid.validate_inputs(config_json="{}"), True)
        self.assertIsInstance(PromptCleaningMaid.validate_inputs(config_json="{"), str)


if __name__ == "__main__":
    unittest.main()
