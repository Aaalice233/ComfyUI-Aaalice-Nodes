"""Runtime, payload, store, and route contracts for ResolutionPreset."""

from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.resolution_preset import parse_resolution_payload  # noqa: E402
from nodes.tools import NODE_CLASSES  # noqa: E402
from nodes.tools.resolution_preset import ResolutionPreset  # noqa: E402
from nodes.tools import resolution_preset_routes  # noqa: E402
from nodes.tools.resolution_preset_store import (  # noqa: E402
    PresetConflictError,
    PresetNotFoundError,
    ResolutionPresetStore,
)


class ResolutionPresetNodeTests(unittest.TestCase):
    def test_node_is_registered_with_two_integer_outputs(self):
        self.assertIn(ResolutionPreset, NODE_CLASSES)
        schema = ResolutionPreset.define_schema()
        self.assertEqual(schema.node_id, "ResolutionPreset")
        self.assertEqual(schema.category, "Aaalice/tools")
        self.assertEqual(schema.inputs, [])
        self.assertEqual([item.id for item in schema.outputs], ["width", "height"])
        self.assertTrue(schema.accept_all_inputs)

    def test_execute_returns_exact_payload_dimensions(self):
        output = ResolutionPreset.execute('{"version":1,"width":832,"height":1216}')
        self.assertEqual(output.args, (832, 1216))

    def test_payload_rejects_invalid_json_version_range_and_alignment(self):
        for payload in ["", "{", "[]", '{"version":2,"width":1024,"height":1024}',
                        '{"version":1,"width":8,"height":1024}',
                        '{"version":1,"width":1001,"height":1024}']:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_resolution_payload(payload)

    def test_validate_inputs_returns_original_validation_reason(self):
        result = ResolutionPreset.validate_inputs('{"version":1,"width":1001,"height":1024}')
        self.assertIsInstance(result, str)
        self.assertIn("divisible by 8", result)


class ResolutionPresetStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.path = Path(self.temporary.name) / "resolution_presets.json"
        self.store = ResolutionPresetStore(self.path)

    def tearDown(self):
        self.temporary.cleanup()

    def test_create_update_delete_round_trip_keeps_stable_id(self):
        created = self.store.save({"name": "Portrait", "width": 832, "height": 1216, "alignment": 64})
        preset = created["presets"][0]
        self.assertTrue(preset["id"])
        updated = self.store.save({**preset, "name": "Portrait Main"})
        self.assertEqual(updated["presets"][0]["id"], preset["id"])
        self.assertEqual(updated["revision"], 2)
        deleted = self.store.delete(preset["id"])
        self.assertEqual(deleted["presets"], [])
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))["revision"], 3)

    def test_names_are_trimmed_and_unique_without_case(self):
        self.store.save({"name": " Portrait ", "width": 832, "height": 1216, "alignment": 8})
        with self.assertRaises(PresetConflictError):
            self.store.save({"name": "portrait", "width": 768, "height": 1024, "alignment": 8})

    def test_dimensions_must_match_their_alignment(self):
        with self.assertRaisesRegex(ValueError, "divisible by 64"):
            self.store.save({"name": "Invalid", "width": 1000, "height": 1024, "alignment": 64})

    def test_missing_update_and_delete_are_explicit(self):
        missing = {"id": "missing", "name": "Missing", "width": 1024, "height": 1024, "alignment": 8}
        with self.assertRaises(PresetNotFoundError):
            self.store.save(missing)
        with self.assertRaises(PresetNotFoundError):
            self.store.delete("missing")

    def test_corrupt_file_fails_instead_of_silently_resetting(self):
        self.path.write_text("{", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "failed to read"):
            self.store.load()

    def test_concurrent_writes_are_serialized_without_losing_presets(self):
        errors = []

        def save(index):
            try:
                self.store.save({"name": f"Preset {index}", "width": 1024, "height": 1024, "alignment": 8})
            except Exception as exc:  # pragma: no cover - assertion reports original errors
                errors.append(exc)

        threads = [threading.Thread(target=save, args=(index,)) for index in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertEqual(len(self.store.load()["presets"]), 8)

    def test_atomic_replace_failure_preserves_existing_file_and_removes_temp(self):
        initial = self.store.save({"name": "Initial", "width": 1024, "height": 1024, "alignment": 8})
        before = self.path.read_bytes()
        with patch("nodes.tools.resolution_preset_store.os.replace", side_effect=OSError("replace failed")):
            with self.assertRaisesRegex(OSError, "replace failed"):
                self.store.save({"name": "Second", "width": 768, "height": 1024, "alignment": 8})
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.store.load(), initial)
        self.assertFalse(self.path.with_suffix(".json.tmp").exists())


class _Request:
    def __init__(self, payload):
        self.payload = payload

    async def json(self):
        return self.payload


class ResolutionPresetRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_save_conflict_and_missing_delete_use_explicit_statuses(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = ResolutionPresetStore(Path(temporary) / "presets.json")
            with patch.object(resolution_preset_routes, "get_resolution_preset_store", return_value=store):
                created = await resolution_preset_routes.save_preset(_Request({"preset": {"name": "Square", "width": 1024, "height": 1024, "alignment": 8}}))
                conflict = await resolution_preset_routes.save_preset(_Request({"preset": {"name": "square", "width": 768, "height": 1024, "alignment": 8}}))
                missing = await resolution_preset_routes.delete_preset(_Request({"id": "missing"}))
        self.assertEqual(created.status, 200)
        self.assertEqual(conflict.status, 409)
        self.assertEqual(missing.status, 404)
        self.assertEqual(json.loads(conflict.text)["error"], "PresetConflictError")

    async def test_invalid_json_shape_returns_400(self):
        response = await resolution_preset_routes.save_preset(_Request([]))
        self.assertEqual(response.status, 400)


if __name__ == "__main__":
    unittest.main()
