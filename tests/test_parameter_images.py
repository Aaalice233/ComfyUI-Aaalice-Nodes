from __future__ import annotations

import errno
import unittest

from nodes._lib.parameter_images import (
    annotated_image_reference,
    image_reference_fingerprint,
    resolve_image_reference,
)


class ParameterImageTests(unittest.TestCase):
    def test_saved_references_preserve_comfyui_folder_annotations(self):
        self.assertEqual(annotated_image_reference(None), None)
        self.assertEqual(annotated_image_reference(""), None)
        self.assertEqual(
            annotated_image_reference(
                {"filename": "preview.png", "subfolder": "drafts", "type": "output"}
            ),
            "drafts/preview.png [output]",
        )

    def test_empty_and_missing_references_use_the_fallback(self):
        fallback = object()
        load_calls: list[str] = []

        self.assertIs(
            resolve_image_reference(
                None,
                exists=lambda _path: True,
                load=lambda path: load_calls.append(path),
                fallback=lambda: fallback,
            ),
            fallback,
        )
        self.assertIs(
            resolve_image_reference(
                {"filename": "gone.png", "type": "input"},
                exists=lambda _path: False,
                load=lambda path: load_calls.append(path),
                fallback=lambda: fallback,
            ),
            fallback,
        )
        self.assertEqual(load_calls, [])

    def test_disappearing_file_uses_the_fallback_without_hiding_other_io_errors(self):
        fallback = object()

        self.assertIs(
            resolve_image_reference(
                "gone.png",
                exists=lambda _path: True,
                load=lambda _path: (_ for _ in ()).throw(FileNotFoundError()),
                fallback=lambda: fallback,
            ),
            fallback,
        )
        with self.assertRaises(PermissionError):
            resolve_image_reference(
                "blocked.png",
                exists=lambda _path: True,
                load=lambda _path: (_ for _ in ()).throw(
                    PermissionError(errno.EACCES, "blocked")
                ),
                fallback=lambda: fallback,
            )

    def test_fingerprint_changes_when_a_missing_reference_appears(self):
        missing = image_reference_fingerprint(
            "image.png",
            exists=lambda _path: False,
            fingerprint=lambda _path: "unused",
        )
        present = image_reference_fingerprint(
            "image.png",
            exists=lambda _path: True,
            fingerprint=lambda _path: "sha256",
        )

        self.assertEqual(missing, "missing:image.png")
        self.assertEqual(present, "present:sha256")


if __name__ == "__main__":
    unittest.main()
