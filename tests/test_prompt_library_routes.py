from __future__ import annotations

import json
import tempfile
import unittest

from nodes._lib.prompt_library import PromptLibrary
from nodes.prompt import prompt_library_routes as routes


class FakeRequest:
    def __init__(self, body=None, match_info=None):
        self.body = body
        self.match_info = match_info or {}

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

    async def test_validation_and_missing_errors_are_explicit(self):
        invalid = await routes._handler(routes.create_entry)(FakeRequest({"title": ""}))
        self.assertEqual(invalid.status, 400)
        missing = await routes._handler(routes.delete_entry)(FakeRequest(match_info={"id": "missing"}))
        self.assertEqual(missing.status, 404)

    async def test_batch_and_reorder_handlers(self):
        first = routes.get_library().create_entry({"title": "A", "text": "a"})
        second = routes.get_library().create_entry({"title": "B", "text": "b"})
        response = await routes._handler(routes.reorder)(FakeRequest({"kind": "entries", "orderedIds": [second["id"], first["id"]]}))
        self.assertEqual(response.status, 200)
        self.assertEqual(routes.get_library().snapshot()["entries"][0]["id"], second["id"])


if __name__ == "__main__":
    unittest.main()
