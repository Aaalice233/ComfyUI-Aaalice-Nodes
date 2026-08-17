from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from nodes._lib.prompt_library import DEFAULT_COLLECTION_ID, PromptLibrary
from nodes.prompt import prompt_library_routes as routes


class FakeRequest:
    def __init__(self, body=None, match_info=None, query=None):
        self.body = body
        self.match_info = match_info or {}
        self.query = query or {}

    async def json(self):
        return self.body


class PromptLibraryRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous = routes._library
        routes._library = PromptLibrary(self.temp.name)

    async def asyncTearDown(self):
        routes._library = self.previous
        self.temp.cleanup()

    async def test_json_crud_handler_returns_domain_result(self):
        response = await routes._handler(routes.create_entry)(FakeRequest({"title": "Smile", "text": "smile"}))
        self.assertEqual(response.status, 200)
        data = json.loads(response.text)
        self.assertEqual(data["text"], "smile")
        snapshot = await routes._handler(routes.snapshot)(FakeRequest())
        self.assertEqual(len(json.loads(snapshot.text)["entries"]), 1)

    async def test_category_routes_return_and_update_identification_color(self):
        create = routes._handler(routes._create_named("category"))
        created_response = await create(FakeRequest({"name": "Pose"}))
        created = json.loads(created_response.text)
        self.assertRegex(created["color"], r"^#[0-9A-F]{6}$")
        update = routes._handler(routes._update_named("category"))
        response = await update(FakeRequest({"color": "#123abc"}, {"id": created["id"]}))
        self.assertEqual(response.status, 200)
        self.assertEqual(routes.get_library().snapshot()["categories"][0]["color"], "#123ABC")

    async def test_category_move_and_delete_modes_are_explicit(self):
        root = routes.get_library().create_category({"name": "Root"})
        child = routes.get_library().create_category({"name": "Child", "parentId": root["id"]})
        grandchild = routes.get_library().create_category({"name": "Grandchild", "parentId": child["id"]})
        move_response = await routes._handler(routes.move_category)(FakeRequest(
            {"parentId": root["id"], "index": 1}, {"id": grandchild["id"]},
        ))
        self.assertEqual(move_response.status, 200)
        moved = next(item for item in routes.get_library().snapshot()["categories"] if item["id"] == grandchild["id"])
        self.assertEqual(moved["parentId"], root["id"])

        delete = routes._handler(routes._delete_named("category"))
        safe_root = routes.get_library().create_category({"name": "Safe root"})
        safe_child = routes.get_library().create_category({"name": "Safe child", "parentId": safe_root["id"]})
        safe_response = await delete(FakeRequest(match_info={"id": safe_root["id"]}))
        self.assertEqual(safe_response.status, 200)
        promoted = next(item for item in routes.get_library().snapshot()["categories"] if item["id"] == safe_child["id"])
        self.assertIsNone(promoted["parentId"])

        response = await delete(FakeRequest(match_info={"id": root["id"]}, query={"deleteDescendants": "true"}))
        self.assertEqual(response.status, 200)
        self.assertEqual([item["id"] for item in routes.get_library().snapshot()["categories"]], [safe_child["id"]])

    async def test_validation_and_missing_errors_are_explicit(self):
        invalid = await routes._handler(routes.create_entry)(FakeRequest({"title": ""}))
        self.assertEqual(invalid.status, 400)
        missing = await routes._handler(routes.delete_entry)(FakeRequest(match_info={"id": "missing"}))
        self.assertEqual(missing.status, 404)

    async def test_default_favorite_folder_delete_is_rejected(self):
        delete = routes._handler(routes._delete_named("collection"))
        response = await delete(FakeRequest(match_info={"id": DEFAULT_COLLECTION_ID}))
        self.assertEqual(response.status, 400)
        self.assertIn("default favorites", json.loads(response.text)["message"])

    async def test_batch_and_reorder_handlers(self):
        first = routes.get_library().create_entry({"title": "A", "text": "a"})
        second = routes.get_library().create_entry({"title": "B", "text": "b"})
        response = await routes._handler(routes.reorder)(FakeRequest({"kind": "entries", "orderedIds": [second["id"], first["id"]]}))
        self.assertEqual(response.status, 200)
        self.assertEqual(routes.get_library().snapshot()["entries"][0]["id"], second["id"])

        deleted = await routes._handler(routes.delete_entries)(FakeRequest({"entryIds": [first["id"], second["id"]]}))
        self.assertEqual(json.loads(deleted.text)["deleted"], 2)
        self.assertEqual(routes.get_library().snapshot()["entries"], [])

    async def test_usage_handler_records_recent_entries(self):
        entry = routes.get_library().create_entry({"title": "A", "text": "a"})
        response = await routes._handler(routes.record_usage)(FakeRequest({"entryIds": [entry["id"]]}))
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.text)["updated"], 1)
        self.assertGreater(routes.get_library().get_entry(entry["id"])["lastUsedAt"], 0)

    async def test_apply_uses_preflight_token_once_and_removes_stage(self):
        source = Path(self.temp.name) / "legacy.json"
        source.write_text(json.dumps({"Imported": ["smile"]}), encoding="utf-8")
        token, manifest = routes.get_library().prepare_import(source, source.name)
        entry_id = manifest["entries"][0]["id"]
        result = await routes.import_apply(FakeRequest({"token": token, "resolutions": {entry_id: "import"}}))
        self.assertEqual(result["imported"], 1)
        self.assertEqual(routes.get_library().snapshot()["entries"][0]["text"], "smile")
        with self.assertRaises(KeyError):
            routes.get_library().staged_import(token)

    async def test_failed_apply_preserves_database_and_staged_import_for_retry(self):
        source = Path(self.temp.name) / "retry.json"
        source.write_text(json.dumps({"Imported": ["retry"]}), encoding="utf-8")
        token, manifest = routes.get_library().prepare_import(source, source.name)
        entry_id = manifest["entries"][0]["id"]
        before = routes.get_library().snapshot()
        with self.assertRaisesRegex(ValueError, "invalid import resolution"):
            await routes.import_apply(FakeRequest({"token": token, "resolutions": {entry_id: "invalid"}}))
        self.assertEqual(routes.get_library().snapshot(), before)
        staged_manifest, _assets = routes.get_library().staged_import(token)
        self.assertEqual(staged_manifest["entries"][0]["id"], entry_id)


if __name__ == "__main__":
    unittest.main()
