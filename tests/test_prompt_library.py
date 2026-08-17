from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from nodes._lib import prompt_library as prompt_library_module
from nodes._lib.prompt_library import DEFAULT_COLLECTION_ID, DEFAULT_COLLECTION_NAME, PromptLibrary
from nodes._lib.prompt_library_archive import PromptLibraryArchive

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

    def test_archive_codec_is_delegated_behind_the_existing_facade(self):
        self.assertIsInstance(self.library._archive, PromptLibraryArchive)
        for method in ("prepare_export", "prepare_import", "preflight_import", "apply_import"):
            self.assertTrue(callable(getattr(self.library, method)))
            self.assertTrue(callable(getattr(self.library._archive, method)))

    def prepare_bytes(self, data: bytes, filename: str):
        source = Path(self.temp.name) / f"source-{filename}"
        source.write_bytes(data)
        token, manifest = self.library.prepare_import(source, filename)
        _manifest, assets = self.library.staged_import(token)
        return token, manifest, assets

    def test_crud_relations_order_and_cleanup(self):
        category, collection, entry = self.seed()
        snapshot = self.library.snapshot()
        self.assertEqual(snapshot["version"], 2)
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

    def test_batch_delete_is_atomic_and_cleans_shared_assets(self):
        first = self.library.create_entry({"title": "A", "text": "a"})
        second = self.library.create_entry({"title": "B", "text": "b"})
        asset = self.library.set_preview(first["id"], PNG)
        self.library.set_preview(second["id"], PNG)
        with self.assertRaisesRegex(KeyError, "missing"):
            self.library.delete_entries([first["id"], "missing"])
        self.assertIsNotNone(self.library.get_entry(first["id"]))
        self.assertEqual(self.library.delete_entries([first["id"], second["id"]]), 2)
        self.assertEqual(self.library.snapshot()["entries"], [])
        with self.assertRaises(KeyError):
            self.library.asset(asset["hash"])

    def test_usage_history_is_monotonic_and_not_exported(self):
        first = self.library.create_entry({"title": "A", "text": "a"})
        second = self.library.create_entry({"title": "B", "text": "b"})
        self.assertEqual(self.library.record_usage([first["id"], first["id"]]), 1)
        first_used_at = self.library.get_entry(first["id"])["lastUsedAt"]
        self.assertGreater(first_used_at, 0)
        self.assertEqual(self.library.record_usage([second["id"]]), 1)
        self.assertGreater(self.library.get_entry(second["id"])["lastUsedAt"], first_used_at)
        with self.assertRaisesRegex(KeyError, "missing"):
            self.library.record_usage(["missing"])

        archive = self.library.export_archive_to_path()
        with zipfile.ZipFile(archive) as package:
            manifest = json.loads(package.read("manifest.json"))
        self.assertNotIn("lastUsedAt", manifest["entries"][0])
        archive.unlink()

    def test_default_favorite_folder_is_created_and_cannot_be_deleted(self):
        default = next(item for item in self.library.snapshot()["collections"] if item["id"] == DEFAULT_COLLECTION_ID)
        self.assertEqual(default["name"], DEFAULT_COLLECTION_NAME)
        with self.assertRaisesRegex(ValueError, "default favorites"):
            self.library.delete_collection(DEFAULT_COLLECTION_ID)
        self.assertTrue(any(item["id"] == DEFAULT_COLLECTION_ID for item in self.library.snapshot()["collections"]))

    def test_category_colors_are_assigned_distinctly_and_can_be_updated(self):
        first = self.library.create_category({"name": "Appearance"})
        second = self.library.create_category({"name": "Pose"})
        self.assertRegex(first["color"], r"^#[0-9A-F]{6}$")
        self.assertNotEqual(first["color"], second["color"])
        self.library.update_category(first["id"], {"color": "#abcdef"})
        updated = next(item for item in self.library.snapshot()["categories"] if item["id"] == first["id"])
        self.assertEqual(updated["color"], "#ABCDEF")
        with self.assertRaisesRegex(ValueError, "#RRGGBB"):
            self.library.update_category(first["id"], {"color": "blue"})

    def test_existing_database_categories_receive_palette_colors(self):
        with tempfile.TemporaryDirectory() as target:
            db = sqlite3.connect(Path(target) / "prompt-library.sqlite3")
            db.execute("CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)")
            db.execute("INSERT INTO categories(id,name,position) VALUES ('second','Second',1),('legacy','Legacy',0)")
            db.execute(
                "CREATE TABLE entries (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, "
                "note TEXT NOT NULL DEFAULT '', category_id TEXT, preview_hash TEXT, "
                "position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
            db.execute("INSERT INTO entries(id,title,text,category_id) VALUES ('entry','Entry','text','legacy')")
            db.commit()
            db.close()
            migrated = PromptLibrary(target)
            snapshot = migrated.snapshot()
            category = snapshot["categories"][0]
            self.assertEqual([item["id"] for item in snapshot["categories"]], ["legacy", "second"])
            self.assertEqual(category["id"], "legacy")
            self.assertEqual(category["position"], 0)
            self.assertIsNone(category["parentId"])
            self.assertEqual(category["color"], prompt_library_module.CATEGORY_COLOR_PALETTE[0])
            self.assertEqual(snapshot["entries"][0]["categoryId"], "legacy")
            with migrated.connection() as migrated_db:
                columns = {row["name"] for row in migrated_db.execute("PRAGMA table_info(categories)")}
            self.assertIn("parent_id", columns)

    def test_legacy_slash_category_names_become_a_tree_once_without_changing_leaf_identity(self):
        with tempfile.TemporaryDirectory() as target:
            db = sqlite3.connect(Path(target) / "prompt-library.sqlite3")
            db.execute("CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)")
            db.executemany(
                "INSERT INTO categories(id,name,color,position) VALUES (?,?,?,?)",
                [
                    ("other", "默认/其他", "#A855F7", 0),
                    ("artist", "默认/画师", "#3B82F6", 1),
                    ("test", "默认/测试", "#14B8A6", 2),
                    ("test2", "默认/测试/测试2", "#10B981", 3),
                    ("test3", "默认/测试/测试3", "#84CC16", 4),
                ],
            )
            db.execute(
                "CREATE TABLE entries (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, "
                "note TEXT NOT NULL DEFAULT '', category_id TEXT, preview_hash TEXT, "
                "position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
            db.execute("INSERT INTO entries(id,title,text,category_id) VALUES ('entry','Entry','text','test2')")
            db.commit()
            db.close()

            library = PromptLibrary(target)
            categories = {item["id"]: item for item in library.snapshot()["categories"]}
            root = next(item for item in categories.values() if item["name"] == "默认" and item["parentId"] is None)
            self.assertNotIn(root["id"], {"other", "artist", "test", "test2", "test3"})
            self.assertEqual(root["color"], "#A855F7")
            self.assertEqual(
                [(categories[item_id]["name"], categories[item_id]["parentId"], categories[item_id]["position"]) for item_id in ("other", "artist", "test")],
                [("其他", root["id"], 0), ("画师", root["id"], 1), ("测试", root["id"], 2)],
            )
            self.assertEqual((categories["test2"]["name"], categories["test2"]["parentId"]), ("测试2", "test"))
            self.assertEqual((categories["test3"]["name"], categories["test3"]["parentId"]), ("测试3", "test"))
            self.assertEqual(library.get_entry("entry")["categoryId"], "test2")

            literal = library.create_category({"name": "Literal/Slash"})
            reopened = PromptLibrary(target)
            literal_after_restart = next(item for item in reopened.snapshot()["categories"] if item["id"] == literal["id"])
            self.assertEqual((literal_after_restart["name"], literal_after_restart["parentId"]), ("Literal/Slash", None))

    def test_parent_migration_preserves_existing_category_identity_color_order_and_entry_links(self):
        with tempfile.TemporaryDirectory() as target:
            db = sqlite3.connect(Path(target) / "prompt-library.sqlite3")
            db.execute("CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)")
            db.execute("INSERT INTO categories(id,name,color,position) VALUES ('first','First','#123456',0),('second','Second','#ABCDEF',1)")
            db.execute(
                "CREATE TABLE entries (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, "
                "note TEXT NOT NULL DEFAULT '', category_id TEXT, preview_hash TEXT, "
                "position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
            db.execute("INSERT INTO entries(id,title,text,category_id) VALUES ('entry','Entry','text','second')")
            db.commit()
            db.close()
            migrated = PromptLibrary(target).snapshot()
        self.assertEqual(
            [(item["id"], item["name"], item["color"], item["position"], item["parentId"]) for item in migrated["categories"]],
            [("first", "First", "#123456", 0, None), ("second", "Second", "#ABCDEF", 1, None)],
        )
        self.assertEqual(migrated["entries"][0]["categoryId"], "second")

    def test_parent_migration_rolls_back_when_existing_tree_data_is_invalid(self):
        with tempfile.TemporaryDirectory() as target:
            path = Path(target) / "prompt-library.sqlite3"
            db = sqlite3.connect(path)
            db.execute("CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)")
            db.execute("INSERT INTO categories(id,name,color,position) VALUES ('invalid','Invalid','#123456',-1)")
            db.commit()
            db.close()
            with self.assertRaisesRegex(ValueError, "invalid position"):
                PromptLibrary(target)
            db = sqlite3.connect(path)
            columns = {row[1] for row in db.execute("PRAGMA table_info(categories)")}
            db.close()
        self.assertNotIn("parent_id", columns)

    def test_nested_categories_move_atomically_and_reject_invalid_targets(self):
        people = self.library.create_category({"name": "People"})
        female = self.library.create_category({"name": "Female", "parentId": people["id"]})
        hair = self.library.create_category({"name": "Hair", "parentId": female["id"]})
        male = self.library.create_category({"name": "Male", "parentId": people["id"]})
        self.library.move_category(hair["id"], people["id"], 1)
        categories = {item["id"]: item for item in self.library.snapshot()["categories"]}
        self.assertEqual(categories[hair["id"]]["parentId"], people["id"])
        siblings = sorted(
            (item for item in categories.values() if item["parentId"] == people["id"]),
            key=lambda item: item["position"],
        )
        self.assertEqual([item["id"] for item in siblings], [female["id"], hair["id"], male["id"]])
        with self.assertRaisesRegex(ValueError, "own descendant"):
            self.library.move_category(people["id"], female["id"], 0)
        with self.assertRaisesRegex(ValueError, "own parent"):
            self.library.move_category(female["id"], female["id"], 0)
        with self.assertRaisesRegex(KeyError, "parent category"):
            self.library.move_category(female["id"], "missing", 0)
        with self.assertRaisesRegex(KeyError, "parent category"):
            self.library.create_category({"name": "Orphan", "parentId": "missing"})
        with self.assertRaisesRegex(ValueError, "outside"):
            self.library.move_category(female["id"], people["id"], 99)
        with self.assertRaisesRegex(ValueError, "integer"):
            self.library.move_category(female["id"], people["id"], True)
        self.assertIsNone(next(item for item in self.library.snapshot()["categories"] if item["id"] == people["id"])["parentId"])

        other_root = self.library.create_category({"name": "Other root"})
        self.library.move_category(male["id"], None, 1)
        root_ids = [item["id"] for item in sorted(
            (item for item in self.library.snapshot()["categories"] if item["parentId"] is None),
            key=lambda item: item["position"],
        )]
        self.assertEqual(root_ids, [people["id"], male["id"], other_root["id"]])

        original_write = self.library._write_category_order
        writes = 0

        def fail_after_writes(db, parent_id, category_ids):
            nonlocal writes
            writes += 1
            original_write(db, parent_id, category_ids)
            if writes == 2:
                raise RuntimeError("rollback move")

        with patch.object(self.library, "_write_category_order", side_effect=fail_after_writes):
            with self.assertRaisesRegex(RuntimeError, "rollback move"):
                self.library.move_category(female["id"], None, 1)
        category_after_rollback = next(item for item in self.library.snapshot()["categories"] if item["id"] == female["id"])
        self.assertEqual(category_after_rollback["parentId"], people["id"])

    def test_category_delete_promotes_children_or_removes_branch_without_deleting_entries(self):
        root = self.library.create_category({"name": "Root"})
        before = self.library.create_category({"name": "Before", "parentId": root["id"]})
        branch = self.library.create_category({"name": "Branch", "parentId": root["id"]})
        child = self.library.create_category({"name": "Child", "parentId": branch["id"]})
        after = self.library.create_category({"name": "After", "parentId": root["id"]})
        direct_entry = self.library.create_entry({"title": "Direct", "text": "direct", "categoryId": branch["id"]})
        child_entry = self.library.create_entry({"title": "Child", "text": "child", "categoryId": child["id"]})
        self.library.delete_category(branch["id"])
        categories = self.library.snapshot()["categories"]
        siblings = sorted((item for item in categories if item["parentId"] == root["id"]), key=lambda item: item["position"])
        self.assertEqual([item["id"] for item in siblings], [before["id"], child["id"], after["id"]])
        self.assertIsNone(self.library.get_entry(direct_entry["id"])["categoryId"])
        self.assertEqual(self.library.get_entry(child_entry["id"])["categoryId"], child["id"])

        grandchild = self.library.create_category({"name": "Grandchild", "parentId": child["id"]})
        grandchild_entry = self.library.create_entry({"title": "Grandchild", "text": "grandchild", "categoryId": grandchild["id"]})
        self.library.delete_category(child["id"], delete_descendants=True)
        remaining = {item["id"] for item in self.library.snapshot()["categories"]}
        self.assertNotIn(child["id"], remaining)
        self.assertNotIn(grandchild["id"], remaining)
        self.assertIsNone(self.library.get_entry(child_entry["id"])["categoryId"])
        self.assertIsNone(self.library.get_entry(grandchild_entry["id"])["categoryId"])
        self.assertEqual(len(self.library.snapshot()["entries"]), 3)

    def test_existing_database_entries_receive_usage_history(self):
        self.library.create_entry({"title": "Legacy", "text": "legacy"})
        with self.library.connection() as db:
            db.execute("ALTER TABLE entries RENAME TO entries_old")
            db.execute(
                "CREATE TABLE entries (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, "
                "note TEXT NOT NULL DEFAULT '', category_id TEXT, preview_hash TEXT, "
                "position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
            db.execute(
                "INSERT INTO entries(id,title,text,note,category_id,preview_hash,position,updated_at) "
                "SELECT id,title,text,note,category_id,preview_hash,position,updated_at FROM entries_old"
            )
            db.execute("DROP TABLE entries_old")
            db.commit()
        migrated = PromptLibrary(self.temp.name)
        self.assertEqual(migrated.snapshot()["entries"][0]["lastUsedAt"], 0)

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

    def test_category_tree_archive_v2_round_trip_and_v1_migration(self):
        root = self.library.create_category({"name": "People"})
        child = self.library.create_category({"name": "Hair", "parentId": root["id"]})
        empty = self.library.create_category({"name": "Empty", "parentId": root["id"]})
        other_empty = self.library.create_category({"name": "Other empty root"})
        entry = self.library.create_entry({"title": "Red hair", "text": "red hair", "categoryId": child["id"]})
        archive = self.library.export_archive_to_path(category_id=root["id"])
        with zipfile.ZipFile(archive) as package:
            manifest = json.loads(package.read("manifest.json"))
        self.assertEqual(manifest["version"], 2)
        self.assertEqual({item["id"] for item in manifest["categories"]}, {root["id"], child["id"], empty["id"]})
        self.assertEqual(next(item for item in manifest["categories"] if item["id"] == child["id"])["parentId"], root["id"])
        full_archive = self.library.export_archive_to_path()
        with zipfile.ZipFile(full_archive) as package:
            full_manifest = json.loads(package.read("manifest.json"))
        self.assertEqual({item["id"] for item in full_manifest["categories"]}, {root["id"], child["id"], empty["id"], other_empty["id"]})
        selected_archive = self.library.export_archive_to_path(entry_ids=[entry["id"]])
        with zipfile.ZipFile(selected_archive) as package:
            selected_manifest = json.loads(package.read("manifest.json"))
        self.assertEqual({item["id"] for item in selected_manifest["categories"]}, {root["id"], child["id"]})
        with tempfile.TemporaryDirectory() as target:
            imported = PromptLibrary(target)
            imported.create_category({"id": root["id"], "name": "Local People", "color": "#123ABC"})
            local_parent = imported.create_category({"name": "Local parent"})
            imported.create_category({"id": child["id"], "name": "Local Hair", "parentId": local_parent["id"], "color": "#456DEF"})
            imported.apply_import(manifest, {}, {entry["id"]: "import"})
            imported_categories = {item["id"]: item for item in imported.snapshot()["categories"]}
            self.assertEqual(imported_categories[root["id"]]["name"], "Local People")
            self.assertEqual(imported_categories[root["id"]]["color"], "#123ABC")
            self.assertEqual(imported_categories[child["id"]]["name"], "Local Hair")
            self.assertEqual(imported_categories[child["id"]]["parentId"], local_parent["id"])
            self.assertIn(empty["id"], imported_categories)
            attached_manifest = {
                "format": "aaalice-prompt-library", "version": 2, "collections": [], "tags": [], "entries": [],
                "categories": [{"id": "attached", "name": "Attached", "position": 0, "parentId": local_parent["id"]}],
            }
            imported.preflight_import(attached_manifest)
            imported.apply_import(attached_manifest, {})
            attached = next(item for item in imported.snapshot()["categories"] if item["id"] == "attached")
            self.assertEqual(attached["parentId"], local_parent["id"])
        v1 = {**manifest, "version": 1, "categories": [
            {key: value for key, value in item.items() if key != "parentId"} for item in manifest["categories"]
        ]}
        v1_stream = io.BytesIO()
        with zipfile.ZipFile(v1_stream, "w") as package:
            package.writestr("manifest.json", json.dumps(v1))
        _token, migrated, _assets = self.prepare_bytes(v1_stream.getvalue(), "v1.zip")
        self.assertEqual(migrated["version"], 2)
        self.assertTrue(all(item["parentId"] is None for item in migrated["categories"]))

        slash_v1 = {
            "format": "aaalice-prompt-library", "version": 1, "collections": [], "tags": [],
            "categories": [
                {"id": "legacy-root", "name": "默认", "position": 0},
                {"id": "legacy-other", "name": "默认/其他", "position": 1},
                {"id": "legacy-child", "name": "默认/测试/测试2", "position": 2},
            ],
            "entries": [{"id": "legacy-entry", "title": "Legacy", "text": "legacy", "categoryId": "legacy-child", "position": 0, "tagIds": [], "collections": []}],
        }
        slash_stream = io.BytesIO()
        with zipfile.ZipFile(slash_stream, "w") as package:
            package.writestr("manifest.json", json.dumps(slash_v1))
        _slash_token, slash_manifest, _slash_assets = self.prepare_bytes(slash_stream.getvalue(), "slash-v1.zip")
        slash_categories = {item["id"]: item for item in slash_manifest["categories"]}
        slash_root = next(item for item in slash_categories.values() if item["name"] == "默认")
        slash_branch = next(item for item in slash_categories.values() if item["name"] == "测试")
        self.assertEqual(slash_root["id"], "legacy-root")
        self.assertEqual((slash_categories["legacy-other"]["name"], slash_categories["legacy-other"]["parentId"]), ("其他", slash_root["id"]))
        self.assertEqual(slash_branch["parentId"], slash_root["id"])
        self.assertEqual((slash_categories["legacy-child"]["name"], slash_categories["legacy-child"]["parentId"]), ("测试2", slash_branch["id"]))
        self.library.apply_import(slash_manifest, {})
        self.assertEqual(self.library.get_entry("legacy-entry")["categoryId"], "legacy-child")
        archive.unlink()
        full_archive.unlink()
        selected_archive.unlink()

    def test_manifest_rejects_missing_parent_and_cycles_before_import(self):
        base = {"format": "aaalice-prompt-library", "version": 2, "collections": [], "tags": [], "entries": []}
        with self.assertRaisesRegex(ValueError, "missing parent"):
            self.library.preflight_import({**base, "categories": [
                {"id": "child", "name": "Child", "position": 0, "parentId": "missing"},
            ]})
        with self.assertRaisesRegex(ValueError, "cycle"):
            self.library.preflight_import({**base, "categories": [
                {"id": "a", "name": "A", "position": 0, "parentId": "b"},
                {"id": "b", "name": "B", "position": 0, "parentId": "a"},
            ]})
        with self.assertRaisesRegex(ValueError, "own parent"):
            self.library.preflight_import({**base, "categories": [
                {"id": "self", "name": "Self", "position": 0, "parentId": "self"},
            ]})

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
            self.assertEqual(imported.snapshot()["categories"][0]["color"], category["color"])
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
            {"name": "People/Faces", "prompts": [{"id": "old-smile", "alias": "Smile", "prompt": "smile",
                                                     "description": "Friendly expression", "tags": ["face", "happy"]}]},
        ]}).encode()
        token, manifest, assets = self.prepare_bytes(raw, "legacy.json")
        self.assertEqual(manifest["entries"][0]["text"], "smile")
        self.assertEqual(manifest["entries"][0]["note"], "Friendly expression")
        categories = {item["id"]: item for item in manifest["categories"]}
        root = next(item for item in categories.values() if item["name"] == "People")
        leaf = categories[manifest["entries"][0]["categoryId"]]
        self.assertEqual((leaf["name"], leaf["parentId"]), ("Faces", root["id"]))
        self.assertEqual(leaf["color"], prompt_library_module.CATEGORY_COLOR_PALETTE[0])
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
            {"name": "People/Faces", "prompts": [{"id": "old-smile", "alias": "Smile", "prompt": "smile", "image": "smile.png"}]},
        ]}
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("data.json", json.dumps(legacy))
            archive.writestr("preview/smile.png", PNG)
        token, manifest, assets = self.prepare_bytes(stream.getvalue(), "prompt_library.zip")
        self.assertEqual(manifest["entries"][0]["title"], "Smile")
        category = next(item for item in manifest["categories"] if item["id"] == manifest["entries"][0]["categoryId"])
        self.assertEqual(category["name"], "Faces")
        self.assertTrue(any(item["id"] == category["parentId"] and item["name"] == "People" for item in manifest["categories"]))
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

    def test_manifest_rejects_invalid_category_color(self):
        manifest = {"format": "aaalice-prompt-library", "version": 1,
                    "categories": [{"id": "category", "name": "Category", "color": "red"}],
                    "collections": [], "tags": [], "entries": []}
        with self.assertRaisesRegex(ValueError, "invalid color"):
            self.library.preflight_import(manifest)


if __name__ == "__main__":
    unittest.main()
