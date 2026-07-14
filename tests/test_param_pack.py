from __future__ import annotations

import json
import unittest

from nodes._lib.param_pack import (
    MAX_TUNABLE_PARAMS,
    build_param_pack,
    pack_to_outputs,
    parse_parameters_json,
    validate_parameters_list,
)


def parameter(pid: str, name: str, value=1):
    return {
        "id": pid,
        "name": name,
        "param_type": "slider",
        "value": value,
        "config": {"min": 0, "max": 100, "step": 1},
    }


class ParameterPackTests(unittest.TestCase):
    def test_parse_payload(self):
        raw = json.dumps([parameter("steps", "Steps", 20)])
        self.assertEqual(parse_parameters_json(raw)[0]["id"], "steps")

    def test_empty_pack_is_legal(self):
        self.assertEqual(build_param_pack([]), {"_meta": [], "_values": {}})

    def test_dynamic_validation_can_follow_connection_state(self):
        dynamic = {
            "id": "sampler",
            "name": "Sampler",
            "param_type": "dropdown",
            "value": "removed_sampler",
            "config": {"options": ["euler"], "source": "sampler"},
        }
        build_param_pack([dynamic], validate_dynamic_values=False)
        with self.assertRaisesRegex(ValueError, "unavailable"):
            build_param_pack([dynamic], validate_dynamic_values=True)

    def test_parameter_names_are_case_insensitively_unique(self):
        with self.assertRaisesRegex(ValueError, "duplicate parameter name"):
            validate_parameters_list(
                [parameter("a", "Steps"), parameter("b", "steps")]
            )

    def test_parameter_limit_and_output_padding(self):
        parameters = [parameter(f"p{i}", f"P{i}", i) for i in range(MAX_TUNABLE_PARAMS)]
        pack = build_param_pack(parameters)
        outputs = pack_to_outputs(pack)
        self.assertEqual(len(outputs), MAX_TUNABLE_PARAMS)
        self.assertEqual(outputs[0], 0)
        self.assertEqual(outputs[-1], MAX_TUNABLE_PARAMS - 1)
        with self.assertRaisesRegex(ValueError, "exceeds 32"):
            build_param_pack(parameters + [parameter("extra", "Extra")])

    def test_separator_does_not_consume_direct_output(self):
        pack = build_param_pack([
            parameter("first", "First", 3),
            {"id": "section", "name": "Section", "param_type": "separator", "value": None, "config": {}},
            parameter("second", "Second", 7),
        ])
        outputs = pack_to_outputs(pack)
        self.assertEqual(outputs[:2], (3, 7))
        self.assertEqual(len(outputs), MAX_TUNABLE_PARAMS)

    def test_switch_and_dropdown_are_direct_values(self):
        pack = build_param_pack([
            {"id": "enabled", "name": "Enabled", "param_type": "switch", "value": True, "config": {}},
            {"id": "mode", "name": "Mode", "param_type": "dropdown", "value": "euler", "config": {"options": ["euler", "normal"]}},
        ])
        outputs = pack_to_outputs(pack)
        self.assertEqual(outputs[:2], (True, "euler"))

    def test_seed_and_taglist_types(self):
        pack = build_param_pack(
            [
                {
                    "id": "seed",
                    "name": "Seed",
                    "param_type": "seed",
                    "value": 7,
                    "config": {"control_after_generate": "increment"},
                },
                {
                    "id": "tags",
                    "name": "Tags",
                    "param_type": "taglist",
                    "value": ["cat", "blue eyes"],
                    "config": {},
                },
            ]
        )
        self.assertEqual(pack["_meta"][0]["type"], "INT")
        self.assertEqual(pack["_meta"][1]["type"], "AAALICE_TAG_LIST")


if __name__ == "__main__":
    unittest.main()
