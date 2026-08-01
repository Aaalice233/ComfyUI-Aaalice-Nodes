import assert from "node:assert/strict";
import test from "node:test";

import {
	reshapeEnumBranchInputs,
	reshapeEnumBranchInputsPreservingLinks,
} from "../js/lib/enum_switch_layout.js";
import {
	parameterOutputPresentationChanged,
	publishDynamicSlotState,
	refreshDynamicSlotGeometry,
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

test("ParameterPanel detects provisional output labels after clone configuration", () => {
	const meta = [{ id: "scale", name: "放大倍数" }, { id: "save", name: "保存图像" }];
	const provisional = [
		{ _aaaliceParamId: "steps", label: "步骤", localized_name: "步骤" },
		{ _aaaliceParamId: "cfg", label: "CFG", localized_name: "CFG" },
	];
	assert.equal(parameterOutputPresentationChanged(provisional, meta), true);
	assert.equal(parameterOutputPresentationChanged([
		{ _aaaliceParamId: "scale", label: "放大倍数", localized_name: "放大倍数" },
		{ _aaaliceParamId: "save", label: "保存图像", localized_name: "保存图像" },
	], meta), false);
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

test("dynamic slot publication commits Vue arrays and LiteGraph concrete slots immediately", () => {
	const events = [];
	const graph = {
		id: "subgraph-a",
		trigger(type, detail) { events.push({ type, detail }); },
		setDirtyCanvas() { this.dirty = true; },
	};
	const node = slotNode(2, 2);
	node.id = 42;
	node.graph = graph;
	node.inputs[0].label = "CFG";
	node.inputs[1].label = "Steps";
	node.outputs[0].label = "CFG";
	node.outputs[1].label = "Steps";
	const previousInputs = node.inputs;
	const previousOutputs = node.outputs;
	const previousInputSlots = [...node.inputs];
	const previousOutputSlots = [...node.outputs];
	const outputPrototype = { rendererFamily: "test-slot" };
	Object.setPrototypeOf(node.outputs[0], outputPrototype);
	Object.defineProperty(node.outputs[0], "_internal", {
		configurable: true,
		enumerable: false,
		value: "preserved",
	});
	node._setConcreteSlots = function () {
		this._concreteInputs = this.inputs.map((slot) => ({ ...slot }));
		this._concreteOutputs = this.outputs.map((slot) => ({ ...slot }));
	};

	publishDynamicSlotState(node, { inputs: true, outputs: true });

	assert.notEqual(node.inputs, previousInputs);
	assert.notEqual(node.outputs, previousOutputs);
	assert.notEqual(node.inputs[0], previousInputSlots[0]);
	assert.notEqual(node.outputs[0], previousOutputSlots[0]);
	assert.equal(Object.getPrototypeOf(node.outputs[0]), outputPrototype);
	assert.equal(Object.getOwnPropertyDescriptor(node.outputs[0], "_internal")?.enumerable, false);
	assert.equal(node.outputs[0]._internal, "preserved");
	assert.deepEqual(node._concreteInputs.map((slot) => slot.label), ["CFG", "Steps"]);
	assert.deepEqual(node._concreteOutputs.map((slot) => slot.label), ["CFG", "Steps"]);
	assert.deepEqual(events, [
		{ type: "node:slot-label:changed", detail: { nodeId: 42, slotType: 1 } },
		{ type: "node:slot-label:changed", detail: { nodeId: 42, slotType: 2 } },
	]);
	assert.equal(graph.dirty, true);
});

test("dynamic slot publication targets the node-owned subgraph rather than the root graph", () => {
	const rootEvents = [];
	const subgraphEvents = [];
	const root = { id: "root", trigger(type, detail) { rootEvents.push({ type, detail }); } };
	const subgraph = {
		id: "nested",
		rootGraph: root,
		trigger(type, detail) { subgraphEvents.push({ type, detail }); },
	};
	const node = slotNode(0, 1);
	node.id = 7;
	node.graph = subgraph;
	node._setConcreteSlots = () => {};

	publishDynamicSlotState(node, { outputs: true });

	assert.equal(rootEvents.length, 0);
	assert.deepEqual(subgraphEvents, [
		{ type: "node:slot-label:changed", detail: { nodeId: 7, slotType: 2 } },
	]);
});

test("geometry-only refresh rebuilds concrete slots without publishing label events", () => {
	const events = [];
	const node = slotNode(1, 1);
	node.graph = { trigger(...args) { events.push(args); } };
	node.inputs[0].pos = [10, 20];
	node.outputs[0].pos = [30, 40];
	node._setConcreteSlots = function () {
		this._concreteInputs = this.inputs.map((slot) => ({ ...slot, pos: [...slot.pos] }));
		this._concreteOutputs = this.outputs.map((slot) => ({ ...slot, pos: [...slot.pos] }));
	};

	refreshDynamicSlotGeometry(node);

	assert.deepEqual(node._concreteInputs[0].pos, [10, 20]);
	assert.deepEqual(node._concreteOutputs[0].pos, [30, 40]);
	assert.deepEqual(events, []);
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

test("explicit EnumSwitch input changes rebuild concrete slots and publish the official label event", () => {
	const events = [];
	const node = slotNode(3, 0);
	node.id = 18;
	node.graph = { trigger(type, detail) { events.push({ type, detail }); } };
	node.inputs[1].label = "draft";
	node.inputs[1].localized_name = "draft";
	node.inputs[1].lazy = true;
	node.inputs[2].label = "final";
	node.inputs[2].localized_name = "final";
	node.inputs[2].lazy = true;
	node.inputs[2]._aaaliceProtocolName = "branch_2";
	node._concreteInputs = Array.from({ length: 33 }, () => ({}));
	let rebuilds = 0;
	node._setConcreteSlots = function () {
		rebuilds += 1;
		this._concreteInputs = this.inputs.map((slot) => ({ ...slot }));
	};

	publishDynamicSlotState(node, { inputs: true });

	assert.equal(rebuilds, 1);
	assert.equal(node._concreteInputs.length, 3);
	assert.equal(node._concreteInputs[2].label, "final");
	assert.equal(node._concreteInputs[2].localized_name, "final");
	assert.equal(node._concreteInputs[2].lazy, true);
	assert.equal(node._concreteInputs[2]._aaaliceProtocolName, "branch_2");
	assert.deepEqual(events, [
		{ type: "node:slot-label:changed", detail: { nodeId: 18, slotType: 1 } },
	]);
});
