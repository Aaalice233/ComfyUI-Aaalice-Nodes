"""Tests for the pure ParameterReceiver pass-through contract."""

from __future__ import annotations

import unittest

from nodes._lib.receiver_values import MAX_RECEIVER_SLOTS, receiver_values


class ReceiverValuesTests(unittest.TestCase):
    def test_empty_inputs_return_fixed_empty_protocol(self):
        self.assertEqual(receiver_values({}), (None,) * MAX_RECEIVER_SLOTS)

    def test_one_value_is_preserved(self):
        marker = object()
        values = receiver_values({"input_1": marker})
        self.assertIs(values[0], marker)
        self.assertEqual(values[1:], (None,) * 31)

    def test_six_mixed_values_keep_slot_order(self):
        source = [7, 0.25, "euler", False, ["tag"], {"image": "reference"}]
        values = receiver_values({f"input_{index + 1}": value for index, value in enumerate(source)})
        self.assertEqual(list(values[:6]), source)

    def test_all_32_values_are_returned_in_order(self):
        values = receiver_values({f"input_{index}": index for index in range(1, 33)})
        self.assertEqual(values, tuple(range(1, 33)))

    def test_unknown_inputs_do_not_change_protocol(self):
        self.assertEqual(receiver_values({"other": 1}), (None,) * MAX_RECEIVER_SLOTS)


if __name__ == "__main__":
    unittest.main()
