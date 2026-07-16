import test from "node:test";
import assert from "node:assert/strict";

import { computeLinkedSetPosition } from "../js/lib/kj_set_layout.js";

const layout = {
	width: 370,
	contentTop: 4,
	rows: [
		{ kind: "parameter", output: { top: 16 } },
		{ kind: "parameter", output: { top: 40 } },
	],
};

test("generated Set nodes form a compact column beside the panel", () => {
	const panel = { pos: [100, 200], size: [370, 400] };
	assert.deepEqual(computeLinkedSetPosition(panel, layout, 0, 30), [518, 205]);
	assert.deepEqual(computeLinkedSetPosition(panel, layout, 1, 30), [518, 235]);
	assert.deepEqual(computeLinkedSetPosition(panel, layout, 2, 30), [518, 265]);
});

test("generated Set spacing never becomes smaller than the output-slot spacing", () => {
	const panel = { pos: [0, 0] };
	const wideOutputs = {
		width: 400,
		contentTop: 0,
		rows: [
			{ kind: "parameter", output: { top: 20 } },
			{ kind: "parameter", output: { top: 60 } },
		],
	};
	assert.deepEqual(computeLinkedSetPosition(panel, wideOutputs, 1, 30), [448, 45]);
});
