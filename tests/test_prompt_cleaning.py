from __future__ import annotations

import json
import unittest

from nodes._lib.prompt_cleaning import (
    DEFAULT_CONFIG,
    clean_prompt,
    normalize_config,
    parse_config_json,
)


def config(mode: str, **settings):
    result = normalize_config({"mode": mode})
    branch = "naturalLanguage" if mode == "natural_language" else "tagList"
    result["settings"][branch].update(settings)
    return result


class PromptCleaningTests(unittest.TestCase):
    def clean(self, text, value=None):
        return clean_prompt(text, value)[0]

    def test_default_config_is_natural_language_and_independent(self):
        first = normalize_config()
        second = normalize_config()
        self.assertEqual(first, DEFAULT_CONFIG)
        first["settings"]["naturalLanguage"]["trimOuterWhitespace"] = False
        self.assertTrue(second["settings"]["naturalLanguage"]["trimOuterWhitespace"])

    def test_config_validation_and_json_defaults(self):
        self.assertEqual(parse_config_json(""), DEFAULT_CONFIG)
        with self.assertRaisesRegex(ValueError, "not valid JSON"):
            parse_config_json("{")
        with self.assertRaisesRegex(ValueError, "must be boolean"):
            normalize_config({"settings": {"tagList": {"ignoreCase": "yes"}}})
        with self.assertRaisesRegex(ValueError, "unsupported.*mode"):
            normalize_config({"mode": "auto"})

    def test_natural_language_only_performs_enabled_whitespace_cleanup(self):
        source = "  Repeat, repeat.  \r\nLine_two  \r\n\r\n\r\nLine_two  "
        expected = "Repeat, repeat.\nLine_two\n\n\nLine_two"
        self.assertEqual(self.clean(source), expected)
        collapsed = config("natural_language", collapseBlankLines=True)
        self.assertEqual(self.clean(source, collapsed), "Repeat, repeat.\nLine_two\n\nLine_two")

    def test_natural_language_preserves_semantic_text(self):
        source = "A woman, looking outside. Repeat repeat. <lora:test:1> (soft_light)"
        self.assertEqual(self.clean(source), source)

    def test_natural_language_settings_can_be_disabled(self):
        value = config(
            "natural_language",
            trimOuterWhitespace=False,
            trimLineEndWhitespace=False,
            collapseBlankLines=False,
        )
        self.assertEqual(self.clean("  text  \r\n", value), "  text  \n")

    def test_off_mode_returns_the_input_exactly(self):
        source = "  red hair  \r\nBREAK\r\nred hair  "
        result, error = clean_prompt(source, normalize_config({"mode": "off"}))
        self.assertEqual(result, source)
        self.assertIsNone(error)

    def test_tag_list_splits_only_top_level_delimiters(self):
        value = config("tag_list")
        source = '1girl， (red hair, blue eyes:1.2), "quoted, tag"\n<lora:a,b:1>, smile'
        self.assertEqual(
            self.clean(source, value),
            '1girl, (red hair, blue eyes:1.2), "quoted, tag", <lora:a,b:1>, smile',
        )

    def test_tag_list_stably_deduplicates_without_rewriting_first_item(self):
        value = config("tag_list")
        self.assertEqual(
            self.clean("long_hair, smile, LONG hair, (smile:1.2), smile", value),
            "long_hair, smile, (smile:1.2)",
        )

    def test_tag_list_duplicate_matching_options_are_independent(self):
        exact = config("tag_list", ignoreCase=False, underscoreEqualsSpace=False)
        self.assertEqual(self.clean("Blue_Eyes, blue eyes, Blue_Eyes", exact), "Blue_Eyes, blue eyes")
        no_dedupe = config("tag_list", deduplicateTags=False)
        self.assertEqual(self.clean("a, A, a", no_dedupe), "a, A, a")

    def test_tag_list_can_preserve_empty_positions_and_item_whitespace(self):
        keep_empty = config("tag_list", removeEmptyTags=False)
        self.assertEqual(self.clean("a,, b,", keep_empty), "a,, b,")
        keep_space = config("tag_list", trimTagWhitespace=False)
        self.assertEqual(self.clean(" a,  b", keep_space), " a,  b")

    def test_tag_list_passes_partition_control_syntax_through_exactly(self):
        value = config("tag_list")
        cases = [
            "red hair\nBREAK\nred hair\nBREAK\nblue eyes",
            "common ADDCOMM red hair\nBREAK\nred hair",
            "base ADDBASE red hair\nBREAK\nred hair",
            "left ADDCOL right ADDROW bottom",
            "red hair\nAND\nred hair",
        ]
        for source in cases:
            with self.subTest(source=source):
                result, error = clean_prompt(source, value)
                self.assertEqual(result, source)
                self.assertIsNone(error)

    def test_partition_words_inside_protected_syntax_do_not_disable_cleaning(self):
        value = config("tag_list")
        source = '"BREAK", <lora:AND:1>, (ADDCOL), hand, hand'
        self.assertEqual(
            self.clean(source, value),
            '"BREAK", <lora:AND:1>, (ADDCOL), hand',
        )

    def test_lowercase_partition_words_remain_ordinary_tags(self):
        value = config("tag_list")
        self.assertEqual(self.clean("red hair\nbreak\nred hair", value), "red hair, break")

    def test_malformed_tag_structures_are_returned_exactly(self):
        value = config("tag_list")
        for source in ["a, (b", "a, [b)", 'a, "b', "a, b\\"]:
            with self.subTest(source=source):
                result, error = clean_prompt(source, value)
                self.assertEqual(result, source)
                self.assertIsNotNone(error)

    def test_both_modes_are_idempotent(self):
        cases = [
            ("  prose  \r\n\r\n\r\nnext  ", config("natural_language", collapseBlankLines=True)),
            ("a,, b, A, long_hair, long hair", config("tag_list", removeEmptyTags=False)),
            (" a,  b", config("tag_list", trimTagWhitespace=False)),
        ]
        for source, value in cases:
            with self.subTest(source=source):
                once = self.clean(source, value)
                self.assertEqual(self.clean(once, value), once)

    def test_json_round_trip(self):
        value = config("tag_list", deduplicateTags=False)
        self.assertEqual(parse_config_json(json.dumps(value)), value)


if __name__ == "__main__":
    unittest.main()
