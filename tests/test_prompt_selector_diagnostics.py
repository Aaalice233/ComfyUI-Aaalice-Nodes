from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from nodes._lib.prompt_library import PromptLibrary
from nodes.prompt import prompt_selector_diagnostics as diagnostics
from nodes.prompt.prompt_selector import PromptSelector


class PromptSelectorDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parents[1] / "tmp"
        scratch.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch, prefix="selector-diagnostics-")
        self.addCleanup(self.temp.cleanup)
        self.library = PromptLibrary(Path(self.temp.name) / "library")
        self.path_patch = patch.object(diagnostics, "get_library_database_path", return_value=self.library.db_path)
        self.path_patch.start()
        self.addCleanup(self.path_patch.stop)

    def payload(self, entry_id, **extra):
        return json.dumps({"version": 1, "selections": [{"entryId": entry_id, "weight": 1, **extra}]})

    def test_existing_entry_is_not_misreported_as_deleted_or_automatically_repaired(self):
        entry = self.library.create_entry({"title": "Private title", "text": "private prompt text"})
        before = self.library.snapshot()
        with self.assertLogs(diagnostics.logger, level="ERROR") as logs:
            result = PromptSelector.validate_inputs(self.payload(entry["id"]))
        self.assertIn("exists in the server library", result)
        self.assertIsInstance(result, str)
        output = "\n".join(logs.output)
        self.assertIn("status=entry-present", output)
        self.assertIn(entry["id"], output)
        self.assertIn("selection_count=1", output)
        self.assertIn("entry_count=1", output)
        self.assertIn(self.library.db_path.resolve().as_posix(), output)
        self.assertNotIn("Private title", output)
        self.assertNotIn("private prompt text", output)
        self.assertEqual(self.library.snapshot(), before)

    def test_real_missing_reference_remains_an_error(self):
        self.library.create_entry({"title": "Other", "text": "other text"})
        with self.assertLogs(diagnostics.logger, level="ERROR") as logs:
            result = PromptSelector.validate_inputs(self.payload("missing-id"))
        self.assertIn("absent from the current server library", result)
        self.assertIn("status=entry-absent", "\n".join(logs.output))
        self.assertIn("entry_count=1", "\n".join(logs.output))

    def test_missing_database_is_not_created_by_diagnostics(self):
        database = Path(self.temp.name) / "not-created" / "prompt-library.sqlite3"
        with patch.object(diagnostics, "get_library_database_path", return_value=database):
            with self.assertLogs(diagnostics.logger, level="ERROR") as logs:
                result = PromptSelector.validate_inputs(self.payload("missing-id"))
        self.assertIn("Server library inspection failed", result)
        output = "\n".join(logs.output)
        self.assertIn("status=database-unavailable", output)
        self.assertIn("Traceback", output)
        self.assertIn("original_error=", output)
        self.assertFalse(database.parent.exists())

    def test_corrupt_database_retains_original_failure_and_traceback(self):
        database = Path(self.temp.name) / "broken.sqlite3"
        database.write_bytes(b"not a sqlite database")
        with patch.object(diagnostics, "get_library_database_path", return_value=database):
            with self.assertLogs(diagnostics.logger, level="ERROR") as logs:
                result = PromptSelector.validate_inputs(self.payload("missing-id"))
        self.assertIn("missing or invalid text", result)
        self.assertIn("database-unavailable", "\n".join(logs.output))
        self.assertIn("DatabaseError", "\n".join(logs.output))
        self.assertEqual(database.read_bytes(), b"not a sqlite database")

    def test_success_path_does_not_query_database_or_replace_submitted_text(self):
        with patch.object(diagnostics, "get_library_database_path", side_effect=AssertionError("unexpected query")):
            value = self.payload("submitted-id", text="submitted text")
            self.assertIs(PromptSelector.validate_inputs(value), True)
            self.assertEqual(PromptSelector.execute("prefix", value).args, ("prefix, submitted text",))
            self.assertIs(PromptSelector.validate_inputs(), True)
            self.assertIsInstance(PromptSelector.validate_inputs("{"), str)

    def test_execute_failure_also_logs_and_never_emits_incomplete_prompt(self):
        with self.assertLogs(diagnostics.logger, level="ERROR"):
            with self.assertRaisesRegex(ValueError, "absent from the current server library") as raised:
                PromptSelector.execute("private prefix", self.payload("missing-id"))
        self.assertIsNotNone(raised.exception.__cause__)

    def test_invalid_text_is_diagnosed_but_empty_string_remains_valid(self):
        for invalid in (None, 123, []):
            with self.subTest(invalid=invalid), self.assertLogs(diagnostics.logger, level="ERROR"):
                self.assertIsInstance(PromptSelector.validate_inputs(self.payload("id", text=invalid)), str)
        self.assertIs(PromptSelector.validate_inputs(self.payload("id", text="")), True)


if __name__ == "__main__":
    unittest.main()
