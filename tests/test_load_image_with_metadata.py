"""Runtime contract tests for LoadImageWithMetadata."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image, PngImagePlugin

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.image_file_metadata import USER_COMMENT_TAG
from nodes._lib.image_generation_metadata import parse_image_generation_metadata
from nodes.tools import NODE_CLASSES
from nodes.tools import load_image_with_metadata as loader
from nodes.tools.load_image_with_metadata import LoadImageWithMetadata

ROOT = Path(__file__).resolve().parents[1]


class LoadImageWithMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _run(self, path: Path, *, image_reference: str | None = None):
        image_tensor = object()
        mask_tensor = object()
        with (
            patch.object(loader.folder_paths, "exists_annotated_filepath", return_value=True),
            patch.object(loader.folder_paths, "get_annotated_filepath", return_value=str(path)),
            patch.object(loader, "_load_image_tensors", return_value=(image_tensor, mask_tensor)),
        ):
            output = LoadImageWithMetadata.execute(
                image_reference or f"{path.name} [output]"
            )
        self.assertIs(output.args[0], image_tensor)
        self.assertIs(output.args[1], mask_tensor)
        return output.args[2]

    @staticmethod
    def _save_exif_image(path: Path, image_format: str, parameters: str):
        exif = Image.Exif()
        exif[USER_COMMENT_TAG] = b"UNICODE\0" + parameters.encode("utf-16be")
        Image.new("RGB", (4, 3), "blue").save(path, format=image_format, exif=exif)

    def test_schema_extends_input_loader_with_metadata(self):
        (self.root / "b.png").write_bytes(b"png")
        (self.root / "a.jpg").write_bytes(b"jpg")
        (self.root / "ignore.txt").write_text("text", encoding="utf-8")
        with (
            patch.object(loader.folder_paths, "get_input_directory", return_value=str(self.root)),
            patch.object(
                loader.folder_paths,
                "filter_files_content_types",
                return_value=["b.png", "a.jpg"],
            ) as filter_files,
        ):
            schema = LoadImageWithMetadata.define_schema()
        self.assertIn(LoadImageWithMetadata, NODE_CLASSES)
        self.assertEqual(schema.node_id, "LoadImageWithMetadata")
        self.assertEqual(schema.category, "Aaalice/tools")
        self.assertEqual([item.id for item in schema.inputs], ["image"])
        self.assertEqual(schema.inputs[0].io_type, "COMBO")
        self.assertEqual(schema.inputs[0].options, ["a.jpg", "b.png"])
        self.assertEqual(schema.inputs[0].upload.value, "image_upload")
        self.assertIsNone(schema.inputs[0].image_folder)
        self.assertIsNone(schema.inputs[0].remote)
        filter_files.assert_called_once()
        self.assertEqual(
            [item.io_type for item in schema.outputs],
            ["IMAGE", "MASK", "METADATA"],
        )

    def test_locale_contract(self):
        for language in ("en", "zh", "zh-TW"):
            definitions = json.loads(
                (ROOT / "locales" / language / "nodeDefs.json").read_text(
                    encoding="utf-8"
                )
            )
            localized = definitions["LoadImageWithMetadata"]
            self.assertTrue(localized["display_name"].startswith("🧾"))
            self.assertEqual(set(localized["inputs"]), {"image", "upload"})
            self.assertTrue(localized["inputs"]["upload"]["name"])
            self.assertEqual(set(localized["outputs"]), {"0", "1", "2"})

    def test_extracts_png_jpeg_and_webp_parameters_verbatim(self):
        parameters = "人物, café\nNegative prompt: 无\nSteps: 30, Custom: 未知字段"
        png_path = self.root / "source.png"
        png_info = PngImagePlugin.PngInfo()
        png_info.add_text("parameters", parameters)
        Image.new("RGB", (4, 3), "red").save(png_path, pnginfo=png_info)
        self.assertEqual(
            parse_image_generation_metadata(self._run(png_path)), parameters
        )

        for extension, image_format in (("jpg", "JPEG"), ("webp", "WEBP")):
            with self.subTest(extension=extension):
                path = self.root / f"source.{extension}"
                self._save_exif_image(path, image_format, parameters)
                self.assertEqual(
                    parse_image_generation_metadata(self._run(path)), parameters
                )

    def test_missing_parameters_is_explicit_empty_metadata(self):
        path = self.root / "workflow-only.png"
        png_info = PngImagePlugin.PngInfo()
        png_info.add_text("prompt", '{"1": {"class_type": "KSampler"}}')
        png_info.add_text("workflow", '{"nodes": []}')
        Image.new("RGB", (4, 3), "green").save(path, pnginfo=png_info)
        self.assertIsNone(parse_image_generation_metadata(self._run(path)))

    def test_invalid_path_extension_and_corrupt_metadata_fail(self):
        with patch.object(
            loader.folder_paths, "exists_annotated_filepath", return_value=False
        ):
            with self.assertRaises(FileNotFoundError):
                LoadImageWithMetadata.execute("missing.png [output]")

        unsupported = self.root / "source.gif"
        unsupported.write_bytes(b"GIF89a")
        with self.assertRaisesRegex(ValueError, "only PNG, JPEG, and WebP"):
            self._run(unsupported)

        malformed = self.root / "malformed.webp"
        exif = Image.Exif()
        exif[USER_COMMENT_TAG] = b"UNICODE\0\x00"
        Image.new("RGB", (4, 3), "white").save(
            malformed, format="WEBP", exif=exif
        )
        with self.assertRaises(UnicodeDecodeError):
            self._run(malformed)

    def test_fingerprint_tracks_file_content(self):
        path = self.root / "source.png"
        path.write_bytes(b"first")
        with (
            patch.object(loader.folder_paths, "exists_annotated_filepath", return_value=True),
            patch.object(loader.folder_paths, "get_annotated_filepath", return_value=str(path)),
        ):
            first = LoadImageWithMetadata.fingerprint_inputs("source.png [output]")
            path.write_bytes(b"second")
            second = LoadImageWithMetadata.fingerprint_inputs("source.png [output]")
        self.assertNotEqual(first, second)

    def test_registered_core_loader_is_reused_without_modification(self):
        image_tensor = object()
        mask_tensor = object()

        class CoreLoader:
            def load_image(self, image):
                self.image = image
                return image_tensor, mask_tensor

        core_nodes = SimpleNamespace(
            NODE_CLASS_MAPPINGS={"LoadImage": CoreLoader}
        )
        with patch.dict(sys.modules, {"nodes": core_nodes}):
            self.assertEqual(
                loader._load_image_tensors("source.png [output]"),
                (image_tensor, mask_tensor),
            )
        self.assertIs(CoreLoader.load_image, CoreLoader.__dict__["load_image"])

    def test_incompatible_core_loader_fails_clearly(self):
        with patch.dict(
            sys.modules,
            {"nodes": SimpleNamespace(NODE_CLASS_MAPPINGS={})},
        ):
            with self.assertRaisesRegex(RuntimeError, "update ComfyUI"):
                loader._load_image_tensors("source.png [output]")


if __name__ == "__main__":
    unittest.main()
