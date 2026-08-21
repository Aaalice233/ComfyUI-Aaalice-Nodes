"""Tests for the complete image-generation metadata payload."""

from __future__ import annotations

import unittest

from nodes._lib.image_generation_metadata import (
    IMAGE_GENERATION_METADATA_SCHEMA,
    build_image_generation_metadata,
    is_image_generation_metadata,
    parse_image_generation_metadata,
)


class ImageGenerationMetadataTests(unittest.TestCase):
    def test_non_empty_parameters_round_trip_verbatim(self):
        parameters = "提示词\nNegative prompt: 无\nSteps: 20, Unknown: 保留"
        payload = build_image_generation_metadata(parameters)
        payload["future_field"] = {"kept": True}

        self.assertEqual(parse_image_generation_metadata(payload), parameters)
        self.assertTrue(is_image_generation_metadata(payload))
        self.assertEqual(payload["future_field"], {"kept": True})

    def test_none_and_empty_string_are_explicit_empty_metadata(self):
        self.assertIsNone(
            parse_image_generation_metadata(build_image_generation_metadata(None))
        )
        self.assertIsNone(
            parse_image_generation_metadata(build_image_generation_metadata(""))
        )

    def test_plain_metadata_overwrite_is_not_misidentified(self):
        self.assertFalse(is_image_generation_metadata({"steps": 20, "seed": 1}))

    def test_invalid_payloads_fail_clearly(self):
        with self.assertRaises(TypeError):
            parse_image_generation_metadata("metadata")
        with self.assertRaisesRegex(ValueError, "schema"):
            parse_image_generation_metadata({"schema": "other", "version": 1})
        with self.assertRaisesRegex(ValueError, "version"):
            parse_image_generation_metadata(
                {
                    "schema": IMAGE_GENERATION_METADATA_SCHEMA,
                    "version": 2,
                    "parameters": "prompt",
                }
            )
        with self.assertRaisesRegex(ValueError, "missing parameters"):
            parse_image_generation_metadata(
                {"schema": IMAGE_GENERATION_METADATA_SCHEMA, "version": 1}
            )
        with self.assertRaises(TypeError):
            parse_image_generation_metadata(
                {
                    "schema": IMAGE_GENERATION_METADATA_SCHEMA,
                    "version": 1,
                    "parameters": 12,
                }
            )


if __name__ == "__main__":
    unittest.main()
