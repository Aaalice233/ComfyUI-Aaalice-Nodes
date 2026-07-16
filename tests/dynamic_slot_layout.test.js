import assert from "node:assert/strict";
import test from "node:test";

import {
	reshapeEnumBranchInputs,
	reshapeEnumBranchInputsPreservingLinks,
	syncEnumConcreteInputs,
} from "../js/lib/enum_switch_layout.js";
import {
	reshapeParameterOutputs,
	reshapeParameterOutputsPreservingLinks,
} from "../js/lib/dynamic_slots.js";

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

test("appending a ParameterPanel output keeps existing slots and links intact", () => {
	const node = slotNode(0, 2);
	node.outputs[0].links = [10];
	node.outputs[1].links = [11];
	const existing = [...node.outputs];
	reshapeParameterOutputsPreservingLinks(
		node,
		[{ id: "steps" }, { id: "cfg" }],
		[{ id: "steps" }, { id: "cfg" }, { id: "seed" }],
		() => { throw new Error("append-only reshape must not inspect or disconnect links"); },
		() => null,
	);
	assert.equal(node.outputs.length, 3);
	assert.equal(node.outputs[0], existing[0]);
	assert.equal(node.outputs[1], existing[1]);
	assert.deepEqual(node.outputs[0].links, [10]);
	assert.deepEqual(node.outputs[1].links, [11]);
});

test("reordering ParameterPanel outputs restores links by stable parameter id", () => {
	const node = slotNode(0, 2);
	node.outputs[0].links = [10];
	node.outputs[1].links = [11];
	const links = new Map([
		[10, { target_id: 100, target_slot: 0 }],
		[11, { target_id: 101, target_slot: 2 }],
	]);
	const targets = new Map();
	for (const targetId of [100, 101]) {
		targets.set(targetId, {
			id: targetId,
			disconnectInput(targetSlot) {
				for (const [linkId, link] of links) {
					if (link.target_id !== targetId || link.target_slot !== targetSlot) continue;
					links.delete(linkId);
					for (const output of node.outputs) output.links = output.links?.filter((id) => id !== linkId);
				}
			},
		});
	}
	const restored = [];
	node.connect = (outputIndex, target, targetSlot) => restored.push({ outputIndex, targetId: target.id, targetSlot });
	reshapeParameterOutputsPreservingLinks(
		node,
		[{ id: "steps" }, { id: "cfg" }],
		[{ id: "cfg" }, { id: "steps" }],
		(linkId) => links.get(linkId),
		(nodeId) => targets.get(nodeId),
	);
	assert.deepEqual(restored, [
		{ outputIndex: 1, targetId: 100, targetSlot: 0 },
		{ outputIndex: 0, targetId: 101, targetSlot: 2 },
	]);
});

test("EnumSwitch keeps selector plus exactly the current branch inputs", () => {
	const node = slotNode(33, 0);
	reshapeEnumBranchInputs(node, 2);
	assert.deepEqual(node.inputs.map((slot) => slot.name), ["selector", "branch_1", "branch_2"]);
	reshapeEnumBranchInputs(node, 4);
	assert.deepEqual(node.inputs.map((slot) => slot.name), ["selector", "branch_1", "branch_2", "branch_3", "branch_4"]);
	assert.equal(node.inputs.at(-1).lazy, true);
});

test("appending an EnumSwitch route keeps existing branch links intact", () => {
	const node = slotNode(3, 0);
	node.inputs[1].link = 20;
	node.inputs[2].link = 21;
	const existing = [...node.inputs];
	reshapeEnumBranchInputsPreservingLinks(
		node,
		[{ id: "draft" }, { id: "final" }],
		[{ id: "draft" }, { id: "final" }, { id: "archive" }],
		() => { throw new Error("append-only reshape must not inspect or disconnect links"); },
		() => null,
	);
	assert.equal(node.inputs.length, 4);
	assert.equal(node.inputs[1], existing[1]);
	assert.equal(node.inputs[2], existing[2]);
	assert.equal(node.inputs[1].link, 20);
	assert.equal(node.inputs[2].link, 21);
});

test("reordering EnumSwitch routes restores sources by stable route id", () => {
	const node = slotNode(3, 0);
	node.inputs[1].link = 20;
	node.inputs[2].link = 21;
	const links = new Map([
		[20, { origin_id: 200, origin_slot: 1 }],
		[21, { origin_id: 201, origin_slot: 3 }],
	]);
	const restored = [];
	const sources = new Map([200, 201].map((id) => [id, {
		id,
		connect(originSlot, target, inputIndex) { restored.push({ sourceId: id, originSlot, target, inputIndex }); },
	}]));
	node.disconnectInput = (index) => {
		links.delete(node.inputs[index].link);
		node.inputs[index].link = null;
	};
	reshapeEnumBranchInputsPreservingLinks(
		node,
		[{ id: "draft" }, { id: "final" }],
		[{ id: "final" }, { id: "draft" }],
		(linkId) => links.get(linkId),
		(nodeId) => sources.get(nodeId),
	);
	assert.deepEqual(restored.map(({ sourceId, originSlot, inputIndex }) => ({ sourceId, originSlot, inputIndex })), [
		{ sourceId: 200, originSlot: 1, inputIndex: 2 },
		{ sourceId: 201, originSlot: 3, inputIndex: 1 },
	]);
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
