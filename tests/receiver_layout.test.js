import test from "node:test";
import assert from "node:assert/strict";

import { computeReceiverLayout, RECEIVER_LAYOUT, reshapeReceiverSlots } from "../js/lib/receiver_layout.js";

function receiverWithSlots(count) {
	const node = {
		inputs: Array.from({ length: count }, (_, index) => ({ name: `input_${index + 1}` })),
		outputs: Array.from({ length: count }, (_, index) => ({ name: `output_${index + 1}` })),
		removeInput(index) { this.inputs.splice(index, 1); },
		removeOutput(index) { this.outputs.splice(index, 1); },
		addInput(name, type) { this.inputs.push({ name, type }); },
		addOutput(name, type) { this.outputs.push({ name, type }); },
	};
	return node;
}

test("receiver reshapes protocol slots to the actual binding count", () => {
	const node = receiverWithSlots(32);
	reshapeReceiverSlots(node, 3);
	assert.deepEqual(node.inputs.map((slot) => slot.name), ["input_1", "input_2", "input_3"]);
	assert.deepEqual(node.outputs.map((slot) => slot.name), ["output_1", "output_2", "output_3"]);

	reshapeReceiverSlots(node, 5);
	assert.deepEqual(node.inputs.map((slot) => slot.name), ["input_1", "input_2", "input_3", "input_4", "input_5"]);
	assert.deepEqual(node.outputs.map((slot) => slot.name), ["output_1", "output_2", "output_3", "output_4", "output_5"]);
	assert.equal(node._aaaliceReshapingReceiverSlots, false);
});

test("receiver minimum layout height follows its actual input count", () => {
	assert.equal(computeReceiverLayout({}, 0).height, 60);
	assert.equal(computeReceiverLayout({}, 3).height, 122);
	assert.equal(computeReceiverLayout({}, 6).height, 212);
});

test("receiver keeps a compact minimum separate from its comfortable default width", () => {
	assert.equal(RECEIVER_LAYOUT.minWidth, 220);
	assert.equal(RECEIVER_LAYOUT.defaultWidth, 280);
	assert.equal(computeReceiverLayout({ size: [180, 100] }, 0).width, RECEIVER_LAYOUT.minWidth);
	assert.equal(computeReceiverLayout({ size: [340, 100] }, 0).width, 340);
});
