import assert from "node:assert/strict";
import test from "node:test";

import { reshapeEnumBranchInputs, syncEnumConcreteInputs } from "../js/lib/enum_switch_layout.js";
import { reshapeParameterOutputs } from "../js/lib/dynamic_slots.js";

function slotNode(inputCount = 0, outputCount = 0) {
	return {
		inputs: Array.from({ length: inputCount }, (_, index) => ({ name: index ? `branch_${index}` : "selector" })),
		outputs: Array.from({ length: outputCount }, (_, index) => ({ name: `output_${index + 1}` })),
		addInput(name, type, options) { this.inputs.push({ name, type, ...options }); },
		removeInput(index) { this.inputs.splice(index, 1); },
		addOutput(name, type) { this.outputs.push({ name, type }); },
		removeOutput(index) { this.outputs.splice(index, 1); },
	};
}

test("ParameterPanel materializes exactly its tunable output count", () => {
	const node = slotNode(0, 32);
	reshapeParameterOutputs(node, 6);
	assert.equal(node.outputs.length, 6);
	assert.equal(node.outputs.at(-1).name, "output_6");
	reshapeParameterOutputs(node, 2);
	assert.deepEqual(node.outputs.map((slot) => slot.name), ["output_1", "output_2"]);
	reshapeParameterOutputs(node, 5);
	assert.deepEqual(node.outputs.map((slot) => slot.name), ["output_1", "output_2", "output_3", "output_4", "output_5"]);
});

test("EnumSwitch keeps selector plus exactly the current branch inputs", () => {
	const node = slotNode(33, 0);
	reshapeEnumBranchInputs(node, 2);
	assert.deepEqual(node.inputs.map((slot) => slot.name), ["selector", "branch_1", "branch_2"]);
	reshapeEnumBranchInputs(node, 4);
	assert.deepEqual(node.inputs.map((slot) => slot.name), ["selector", "branch_1", "branch_2", "branch_3", "branch_4"]);
	assert.equal(node.inputs.at(-1).lazy, true);
});

test("Nodes 2.0 concrete enum inputs follow the actual native slot count", () => {
	const node = slotNode(3, 0);
	node.inputs[1].label = "draft";
	node.inputs[2].label = "final";
	node._concreteInputs = Array.from({ length: 33 }, () => ({}));
	syncEnumConcreteInputs(node);
	assert.equal(node._concreteInputs.length, 3);
	assert.equal(node._concreteInputs[2].label, "final");
});
