"""Pure normalization rules for booru search queries."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[3]))

from nodes._lib.booru_query import (  # noqa: E402
    MAX_REPAIR_TOKENS,
    is_query_operator,
    join_candidates,
    normalize_tag_query,
    repair_spaced_tags,
    tokenize_tag_query,
)


class TokenizeTests(unittest.TestCase):
    def test_commas_and_whitespace_collapse_and_empty_tokens_drop(self):
        self.assertEqual(tokenize_tag_query("1girl, solo,"), ["1girl", "solo"])
        self.assertEqual(tokenize_tag_query("  red  hair ,\n blue eyes , ,"), ["red", "hair", "blue", "eyes"])
        self.assertEqual(tokenize_tag_query(" , , "), [])
        self.assertEqual(tokenize_tag_query(None), [])

    def test_operator_detection(self):
        for token in ("-lowres", "~cat", "rating:s", "order:score", "a*b", "(1girl", "ordfav:me"):
            self.assertTrue(is_query_operator(token), token)
        for token in ("1girl", "red_hair", "3d", "hair"):
            self.assertFalse(is_query_operator(token), token)

    def test_tier1_canonical_form_preserves_tokens(self):
        self.assertEqual(normalize_tag_query("1girl,  solo , rating:s,"), "1girl solo rating:s")
        self.assertEqual(normalize_tag_query(""), "")


class JoinCandidateTests(unittest.TestCase):
    def test_singles_and_bounded_joins_are_lowercased(self):
        names = join_candidates(["Red", "Hair", "rating:s", "solo"])
        self.assertIn("red", names)
        self.assertIn("hair", names)
        self.assertIn("red_hair", names)
        self.assertIn("solo", names)
        self.assertNotIn("red_hair_solo", names)  # runs break at operators
        self.assertNotIn("rating:s", names)


class RepairSpacedTagTests(unittest.TestCase):
    def test_broken_spaced_phrase_joins(self):
        tokens = tokenize_tag_query("red hair,")
        self.assertEqual(repair_spaced_tags(tokens, {"red_hair"}), ["red_hair"])

    def test_native_multi_tag_query_is_never_reinterpreted(self):
        # Every word is a valid standalone tag, so the joined form existing changes nothing.
        tokens = tokenize_tag_query("1girl solo")
        known = {"1girl", "solo", "1girl_solo"}
        self.assertEqual(repair_spaced_tags(tokens, known), ["1girl", "solo"])

    def test_operators_and_metatags_pass_through(self):
        tokens = tokenize_tag_query("-lowres red hair, rating:s")
        self.assertEqual(repair_spaced_tags(tokens, {"red_hair"}), ["-lowres", "red_hair", "rating:s"])

    def test_greedy_longest_match_inside_mixed_run(self):
        tokens = tokenize_tag_query("hitsugaya toushirou, solo")
        self.assertEqual(repair_spaced_tags(tokens, {"hitsugaya_toushirou"}), ["hitsugaya_toushirou", "solo"])

    def test_empty_known_set_degrades_to_tier1(self):
        tokens = tokenize_tag_query("red hair,")
        self.assertEqual(repair_spaced_tags(tokens, set()), ["red", "hair"])

    def test_overlong_query_skips_repair(self):
        tokens = ["red", "hair"] + ["1girl"] * MAX_REPAIR_TOKENS
        self.assertEqual(repair_spaced_tags(tokens, {"red_hair"}), tokens)


if __name__ == "__main__":
    unittest.main()
