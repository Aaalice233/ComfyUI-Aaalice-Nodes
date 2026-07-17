from __future__ import annotations

import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from nodes._lib import prompt_library as prompt_library_module
from nodes._lib.prompt_library import PromptLibrary

PNG = b"\x89PNG\r\n\x1a\n" + b"test-image"


class PromptLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.library = PromptLibrary(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def seed(self):
        category = self.library.create_category({"name": "Appearance"})
        collection = self.library.create_collection({"name": "Portrait"})
        entry = self.library.create_entry({
            "title": "Red hair", "text": "red hair", "note": "warm",
            "categoryId": category["id"], "collectionIds": [collection["id"]], "tags": ["hair", "red"],
        })
        return category, collection, entry

    def prepare_bytes(self, data: bytes, filename: str):
        source = Path(self.temp.name) / f"source-{filename}"
        source.write_bytes(data)
        token, manifest = self.library.prepare_import(source, filename)
        _manifest, assets = self.library.staged_import(token)
        return token, manifest, assets

    def test_crud_relations_order_and_cleanup(self):
        category, collection, entry = self.seed()
        snapshot = self.library.snapshot()
        self.assertEqual(snapshot["entries"][0]["categoryId"], category["id"])
        self.assertEqual(snapshot["entries"][0]["collections"][0]["collectionId"], collection["id"])
        self.assertEqual(len(snapshot["entries"][0]["tagIds"]), 2)
        updated = self.library.update_entry(entry["id"], {"title": "Crimson hair", "tags": ["hair"]})
        self.assertEqual(updated["title"], "Crimson hair")
        self.assertEqual(len(updated["tagIds"]), 1)
        self.library.delete_category(category["id"])
        self.assertIsNone(self.library.get_entry(entry["id"])["categoryId"])
        self.library.delete_entry(entry["id"])
        self.assertEqual(self.library.snapshot()["entries"], [])

    def test_preview_content_hash_lifecycle(self):
        _category, _collection, entry = self.seed()
        asset = self.library.set_preview(entry["id"], PNG)
        path, mime = self.library.asset(asset["hash"])
        self.assertTrue(path.exists())
        self.assertEqual(mime, "image/png")
        self.library.delete_preview(entry["id"])
        self.assertFalse(path.exists())
        with self.assertRaises(KeyError):
            self.library.asset(asset["hash"])

    def test_batch_update_reorder_and_transaction_rollback(self):
        category, collection, first = self.seed()
        second = self.library.create_entry({"title": "Blue eyes", "text": "blue eyes"})
        self.assertEqual(self.library.batch_update_entries(
            [second["id"]], category_id=category["id"], set_category=True, add_collection_id=collection["id"]
        ), 1)
        self.library.reorder("entries", [second["id"], first["id"]])
        self.assertEqual([entry["id"] for entry in self.library.snapshot()["entries"]], [second["id"], first["id"]])
        self.library.reorder("collection_entries", [second["id"], first["id"]], collection_id=collection["id"])
        memberships = {entry["id"]: entry["collections"][0]["position"] for entry in self.library.snapshot()["entries"]}
        self.assertEqual(memberships, {second["id"]: 0, first["id"]: 1})
        with self.assertRaisesRegex(RuntimeError, "rollback"):
            with self.library.transaction() as db:
                db.execute("INSERT INTO categories(id,name,position) VALUES ('rollback','Rollback',99)")
                raise RuntimeError("rollback")
        self.assertNotIn("rollback", {item["id"] for item in self.library.snapshot()["categories"]})

    def test_full_and_partial_archive_round_trip(self):
        category, collection, entry = self.seed()
        self.library.set_preview(entry["id"], PNG)
        archive = self.library.export_archive_to_path(category_id=category["id"])
        token, manifest = self.library.prepare_import(archive, "backup.zip")
        _manifest, assets = self.library.staged_import(token)
        self.assertEqual([item["id"] for item in manifest["entries"]], [entry["id"]])
        self.assertEqual(len(assets), 1)
        with tempfile.TemporaryDirectory() as target:
            imported = PromptLibrary(target)
            result = imported.apply_import(manifest, assets, {entry["id"]: "import"})
            self.assertEqual(result["imported"], 1)
            self.assertEqual(imported.get_entry(entry["id"])["text"], "red hair")
            self.assertEqual(imported.get_entry(entry["id"])["collections"][0]["collectionId"], collection["id"])
        self.library.discard_import(token)
        archive.unlink()

    def test_export_preparation_uses_a_download_token(self):
        self.seed()
        token, size = self.library.prepare_export()
        path = self.library.export_path(token)
        self.assertGreater(size, 0)
        self.assertEqual(size, path.stat().st_size)
        path.unlink()
        with self.assertRaises(KeyError):
            self.library.export_path(token)

    def test_import_replacement_cleans_the_last_old_preview_reference(self):
        _category, _collection, entry = self.seed()
        old_asset = self.library.set_preview(entry["id"], PNG)
        old_path, _mime = self.library.asset(old_asset["hash"])
        replacement = b"\x89PNG\r\n\x1a\nreplacement"
        replacement_hash = hashlib.sha256(replacement).hexdigest()
        manifest = {
            "format": "aaalice-prompt-library", "version": 1, "categories": [], "collections": [], "tags": [],
            "entries": [{"id": entry["id"], "title": "Red hair", "text": "red hair", "note": "", "categoryId": None,
                         "previewHash": replacement_hash, "position": 0, "tagIds": [], "collections": []}],
        }
        replacement_path = Path(self.temp.name) / "replacement.png"
        replacement_path.write_bytes(replacement)
        self.library.apply_import(manifest, {replacement_hash: replacement_path}, {entry["id"]: "import"})
        self.assertFalse(old_path.exists())
        with self.assertRaises(KeyError):
            self.library.asset(old_asset["hash"])

    def test_legacy_json_and_conflict_policies(self):
        raw = json.dumps({"version": "1.6", "categories": [
            {"name": "People", "prompts": [{"id": "old-smile", "alias": "Smile", "prompt": "smile",
                                               "description": "Friendly expression", "tags": ["face", "happy"]}]},
        ]}).encode()
        token, manifest, assets = self.prepare_bytes(raw, "legacy.json")
        self.assertEqual(manifest["entries"][0]["text"], "smile")
        self.assertEqual(manifest["entries"][0]["note"], "Friendly expression")
        self.assertEqual({item["name"] for item in manifest["tags"]}, {"face", "happy"})
        self.assertEqual(len(manifest["entries"][0]["tagIds"]), 2)
        first = self.library.apply_import(manifest, assets)
        self.assertEqual(first["imported"], 1)
        entry_id = manifest["entries"][0]["id"]
        changed = {**manifest, "entries": [{**manifest["entries"][0], "text": "big smile"}]}
        preflight = self.library.preflight_import(changed)
        self.assertEqual(len(preflight["conflict"]), 1)
        self.library.apply_import(changed, {}, {entry_id: "local"})
        self.assertEqual(self.library.get_entry(entry_id)["text"], "smile")
        self.library.apply_import(changed, {}, {entry_id: "import"})
        self.assertEqual(self.library.get_entry(entry_id)["text"], "big smile")
        self.library.apply_import(changed, {}, {entry_id: "duplicate"})
        self.assertEqual(len(self.library.snapshot()["entries"]), 2)
        duplicate_id = "same-content-new-id"
        duplicate = {**manifest, "entries": [{**manifest["entries"][0], "id": duplicate_id, "text": "big smile"}]}
        self.assertEqual(len(self.library.preflight_import(duplicate)["duplicate"]), 1)
        self.library.apply_import(duplicate, {}, {duplicate_id: "local"})
        self.assertNotIn(duplicate_id, {item["id"] for item in self.library.snapshot()["entries"]})
        self.library.discard_import(token)

    def test_legacy_export_zip_imports_data_json_and_preview(self):
        stream = io.BytesIO()
        legacy = {"version": "1.6", "categories": [
            {"name": "People", "prompts": [{"id": "old-smile", "alias": "Smile", "prompt": "smile", "image": "smile.png"}]},
        ]}
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("data.json", json.dumps(legacy))
            archive.writestr("preview/smile.png", PNG)
        token, manifest, assets = self.prepare_bytes(stream.getvalue(), "prompt_library.zip")
        self.assertEqual(manifest["entries"][0]["title"], "Smile")
        self.assertEqual(len(assets), 1)
        self.assertIn(manifest["entries"][0]["previewHash"], assets)
        self.library.discard_import(token)

    def test_rejects_zip_traversal_hash_mismatch_and_rolls_back(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("manifest.json", json.dumps({"format": "aaalice-prompt-library", "version": 1, "categories": [], "collections": [], "tags": [], "entries": []}))
            archive.writestr("../escape.png", PNG)
        with self.assertRaisesRegex(ValueError, "unsafe archive path"):
            self.prepare_bytes(stream.getvalue(), "bad.zip")
        manifest = {"format": "aaalice-prompt-library", "version": 1, "categories": [], "collections": [], "tags": [], "entries": [
            {"id": "a", "title": "A", "text": "a", "categoryId": "missing", "tagIds": [], "collections": []},
        ]}
        with self.assertRaises(Exception):
            self.library.apply_import(manifest, {})
        self.assertEqual(self.library.snapshot()["entries"], [])

    def test_import_uses_separate_compressed_and_expanded_size_limits(self):
        with patch.object(prompt_library_module, "MAX_IMPORT_BYTES", 4):
            with self.assertRaisesRegex(ValueError, "import file exceeds"):
                self.prepare_bytes(b"12345", "legacy.json")
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", "{}")
        with patch.object(prompt_library_module, "MAX_EXPANDED_ARCHIVE_BYTES", 1):
            with self.assertRaisesRegex(ValueError, "expanded archive exceeds"):
                self.prepare_bytes(stream.getvalue(), "backup.zip")
        self.assertEqual(prompt_library_module.MAX_IMPORT_BYTES, 2 * 1024 * 1024 * 1024)
        self.assertEqual(prompt_library_module.MAX_EXPORT_BYTES, 2 * 1024 * 1024 * 1024)
        self.assertEqual(prompt_library_module.MAX_EXPANDED_ARCHIVE_BYTES, 2 * 1024 * 1024 * 1024)

    def test_preflight_reports_invalid_entry_references(self):
        manifest = {"format": "aaalice-prompt-library", "version": 1, "categories": [], "collections": [], "tags": [], "entries": [
            {"id": "bad", "title": "Bad", "text": "bad", "categoryId": "missing", "tagIds": [], "collections": []},
        ]}
        result = self.library.preflight_import(manifest)
        self.assertEqual(len(result["invalid"]), 1)
        self.assertIn("unknown category", result["invalid"][0]["reason"])


if __name__ == "__main__":
    unittest.main()
