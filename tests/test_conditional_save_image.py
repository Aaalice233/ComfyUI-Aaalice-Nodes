"""Runtime contract tests for the V3 ConditionalSaveImage node."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes.tools import NODE_CLASSES  # noqa: E402
from nodes.tools import conditional_save_image as csi  # noqa: E402
from nodes.tools.conditional_save_image import ConditionalSaveImage  # noqa: E402


def _set_hidden(prompt=None, extra_pnginfo=None, unique_id="test-node"):
    ConditionalSaveImage.hidden = SimpleNamespace(
        prompt=prompt, extra_pnginfo=extra_pnginfo, unique_id=unique_id,
    )


class _FakeLoraManagerSave:
    """Stand-in for LoraManager's SaveImageLM; records the delegation call."""

    calls = []

    def process_image(self, images, id, **kwargs):
        type(self).calls.append((images, id, kwargs))
        return {"result": (["normalized-list"],), "ui": {"images": [{"filename": "a.png"}]}}


class ConditionalSaveImageNodeTests(unittest.TestCase):
    def setUp(self):
        _FakeLoraManagerSave.calls = []
        _set_hidden()
        self._mappings = {}
        self._original = csi._node_class_mappings
        csi._node_class_mappings = lambda: self._mappings

    def tearDown(self):
        csi._node_class_mappings = self._original

    def _install_fake_loramanager(self):
        self._mappings[csi._LORAMANAGER_SAVE_ID] = _FakeLoraManagerSave

    def test_node_is_registered_in_the_tools_domain(self):
        self.assertIn(ConditionalSaveImage, NODE_CLASSES)

    def test_schema_contract(self):
        schema = ConditionalSaveImage.define_schema()
        self.assertEqual(schema.node_id, "ConditionalSaveImage")
        self.assertEqual(schema.category, "Aaalice/tools")
        self.assertEqual([item.id for item in schema.inputs], [
            "images", "metadata", "enabled", "filename_prefix", "file_format",
            "lossless_webp", "quality", "webp_method", "jpeg_subsampling",
            "embed_workflow", "save_with_metadata", "add_loras_to_prompt",
            "add_counter_to_filename", "save_as_recipe",
        ])
        self.assertFalse(schema.is_output_node)
        self.assertTrue(schema.not_idempotent)
        self.assertTrue(schema.inputs[1].optional)
        self.assertEqual(schema.inputs[1].io_type, "METADATA")
        self.assertIs(schema.inputs[2].default, True)
        self.assertIs(schema.inputs[11].default, True)  # add_loras_to_prompt 默认开启
        self.assertEqual([h.value for h in schema.hidden], ["PROMPT", "EXTRA_PNGINFO", "UNIQUE_ID"])
        # 与原版 Save Image (LoraManager) 一致的布局：全部选项直接可见，不进高级区
        self.assertTrue(all(not item.advanced for item in schema.inputs))

    def test_fingerprint_forces_execution_every_run(self):
        self.assertNotEqual(
            ConditionalSaveImage.fingerprint_inputs(),
            ConditionalSaveImage.fingerprint_inputs(),
        )

    def test_disabled_passes_images_through_without_saving(self):
        self._install_fake_loramanager()
        images = object()
        output = ConditionalSaveImage.execute(images, enabled=False, file_format="webp")
        self.assertIs(output.args[0], images)
        self.assertEqual(output.ui, {"images": []})
        self.assertEqual(_FakeLoraManagerSave.calls, [])

    def test_enabled_delegates_to_loramanager_and_keeps_original_batch(self):
        self._install_fake_loramanager()
        images = object()
        metadata = {"steps": 24}
        output = ConditionalSaveImage.execute(
            images,
            metadata=metadata,
            filename_prefix="%seed%_底图",
            file_format="webp",
            quality=90,
        )
        self.assertIs(output.args[0], images)  # 不透传 LoraManager 归一化后的 list
        self.assertEqual(output.ui, {"images": [{"filename": "a.png"}]})
        self.assertEqual(len(_FakeLoraManagerSave.calls), 1)
        called_images, called_id, kwargs = _FakeLoraManagerSave.calls[0]
        self.assertIs(called_images, images)
        self.assertEqual(called_id, "test-node")
        self.assertEqual(kwargs["filename_prefix"], "%seed%_底图")
        self.assertEqual(kwargs["file_format"], "webp")
        self.assertEqual(kwargs["quality"], 90)
        self.assertNotIn("metadata", kwargs)

    def test_fallback_rejects_non_png_formats(self):
        with self.assertRaises(ValueError):
            ConditionalSaveImage.execute(object(), file_format="webp")

    def test_fallback_rejects_loramanager_only_features(self):
        with self.assertRaises(ValueError):
            ConditionalSaveImage.execute(object(), save_as_recipe=True)
        with self.assertRaises(ValueError):
            ConditionalSaveImage.execute(object(), add_loras_to_prompt=True)

    def test_fallback_uses_core_save_image_for_png(self):
        calls = []

        class FakeCoreSave:
            def save_images(self, images, filename_prefix="ComfyUI", prompt=None, extra_pnginfo=None):
                calls.append((images, filename_prefix, prompt, extra_pnginfo))
                return {"ui": {"images": [{"filename": "b.png"}]}}

        self._mappings["SaveImage"] = FakeCoreSave
        _set_hidden(prompt={"p": 1}, extra_pnginfo={"workflow": {}})
        images = object()
        output = ConditionalSaveImage.execute(images, filename_prefix="base", embed_workflow=True)
        self.assertIs(output.args[0], images)
        self.assertEqual(output.ui, {"images": [{"filename": "b.png"}]})
        self.assertEqual(calls, [(images, "base", {"p": 1}, {"workflow": {}})])

    def test_fallback_respects_metadata_toggles(self):
        calls = []

        class FakeCoreSave:
            def save_images(self, images, filename_prefix="ComfyUI", prompt=None, extra_pnginfo=None):
                calls.append((prompt, extra_pnginfo))
                return {"ui": {"images": []}}

        self._mappings["SaveImage"] = FakeCoreSave
        _set_hidden(prompt={"p": 1}, extra_pnginfo={"workflow": {}})
        ConditionalSaveImage.execute(object(), save_with_metadata=False, embed_workflow=False)
        self.assertEqual(calls, [(None, None)])


if __name__ == "__main__":
    unittest.main()
