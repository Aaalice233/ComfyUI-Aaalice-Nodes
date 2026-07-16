from __future__ import annotations

import unittest

try:
    from comfy_api.latest import io
except ImportError:  # pragma: no cover - standalone discovery without ComfyUI
    io = None


@unittest.skipIf(io is None, "ComfyUI V3 API is unavailable")
class QuickGroupManagerNodeTests(unittest.TestCase):
    def test_schema_is_frontend_only_and_outputless(self):
        from nodes.control.quick_group_manager import QuickGroupManager

        schema = QuickGroupManager.define_schema()
        self.assertEqual(schema.node_id, "QuickGroupManager")
        self.assertEqual(schema.category, "Aaalice/control")
        self.assertEqual(schema.inputs, [])
        self.assertEqual(schema.outputs, [])
        self.assertFalse(schema.is_output_node)

    def test_execute_has_no_outputs(self):
        from nodes.control.quick_group_manager import QuickGroupManager

        result = QuickGroupManager.execute()
        self.assertIsInstance(result, io.NodeOutput)


if __name__ == "__main__":
    unittest.main()
