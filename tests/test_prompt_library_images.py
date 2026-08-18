from __future__ import annotations

import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image

from nodes._lib.prompt_library import PromptLibrary
from nodes._lib.prompt_library_images import PREVIEW_MAX_EDGE, PREVIEW_TARGET_BYTES


def large_png() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (2048, 1536), "#7C3AED").save(output, format="PNG", compress_level=0)
    return output.getvalue()


class PromptLibraryImageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.library = PromptLibrary(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_large_uploaded_preview_is_compacted_before_storage(self):
        source = large_png()
        self.assertGreater(len(source), 8 * 1024 * 1024)
        entry = self.library.create_entry({"title": "Large", "text": "large"})

        asset = self.library.set_preview(entry["id"], source)
        path, mime = self.library.asset(asset["hash"])

        self.assertEqual((mime, path.suffix), ("image/webp", ".webp"))
        self.assertLessEqual(path.stat().st_size, PREVIEW_TARGET_BYTES)
        with Image.open(path) as preview:
            self.assertLessEqual(max(preview.size), PREVIEW_MAX_EDGE)

    def test_legacy_archive_compacts_oversized_preview_instead_of_rejecting_import(self):
        source = large_png()
        archive_path = Path(self.temp.name) / "legacy.zip"
        legacy = {"version": "1.6", "categories": [{
            "name": "People/Faces",
            "prompts": [{"id": "large", "alias": "Large", "prompt": "large", "image": "large.png"}],
        }]}
        with zipfile.ZipFile(archive_path, "w") as archive:
            archive.writestr("data.json", json.dumps(legacy))
            archive.writestr("preview/large.png", source)

        token, manifest = self.library.prepare_import(archive_path, archive_path.name)
        _manifest, assets = self.library.staged_import(token)
        preview_hash = manifest["entries"][0]["previewHash"]

        self.assertIn(preview_hash, assets)
        self.assertEqual(assets[preview_hash].suffix, ".webp")
        self.assertLessEqual(assets[preview_hash].stat().st_size, PREVIEW_TARGET_BYTES)
        self.assertEqual(len(self.library.preflight_import(manifest)["invalid"]), 0)

    def test_current_archive_rewrites_preview_hash_after_compaction(self):
        source = large_png()
        source_hash = hashlib.sha256(source).hexdigest()
        archive_path = Path(self.temp.name) / "current.zip"
        manifest = {
            "format": "aaalice-prompt-library", "version": 2,
            "categories": [], "collections": [], "tags": [],
            "entries": [{
                "id": "large", "title": "Large", "text": "large", "note": "", "categoryId": None,
                "position": 0, "tagIds": [], "collections": [], "previewHash": source_hash,
            }],
        }
        with zipfile.ZipFile(archive_path, "w") as archive:
            archive.writestr("manifest.json", json.dumps(manifest))
            archive.writestr(f"assets/{source_hash}.png", source)

        token, normalized = self.library.prepare_import(archive_path, archive_path.name)
        _manifest, assets = self.library.staged_import(token)
        normalized_hash = normalized["entries"][0]["previewHash"]

        self.assertNotEqual(normalized_hash, source_hash)
        self.assertEqual(set(assets), {normalized_hash})
        self.assertLessEqual(assets[normalized_hash].stat().st_size, PREVIEW_TARGET_BYTES)


if __name__ == "__main__":
    unittest.main()
