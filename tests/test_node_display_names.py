from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT.parents[1]))

from nodes import iter_node_classes  # noqa: E402


class NodeDisplayNameTests(unittest.TestCase):
    def test_all_node_names_share_an_emoji_prefix_across_schema_and_locales(self):
        localized = {
            language: json.loads((ROOT / "locales" / language / "nodeDefs.json").read_text(encoding="utf-8"))
            for language in ("en", "zh", "zh-TW")
        }

        schemas = {}
        for node in iter_node_classes():
            schema = node.define_schema()
            self.assertNotIn(schema.node_id, schemas)
            schemas[schema.node_id] = schema
        for language in localized:
            self.assertEqual(set(schemas), set(localized[language]))

        for node_id, schema in schemas.items():
            names = [schema.display_name, *(localized[language][node_id]["display_name"] for language in localized)]
            prefixes = [name.split(maxsplit=1)[0] for name in names]
            self.assertTrue(all(len(name.split(maxsplit=1)) == 2 for name in names), node_id)
            self.assertTrue(all(not prefix.isascii() for prefix in prefixes), node_id)
            self.assertTrue(all(prefix == prefixes[0] for prefix in prefixes[1:]), node_id)


if __name__ == "__main__":
    unittest.main()
