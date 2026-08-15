import test from "node:test";
import assert from "node:assert/strict";
import {
	applyQuickGroupManagerAction,
	applyQuickGroupManagerPreset,
	quickGroupManagerPresetSnapshot,
	quickGroupManagerSnapshot,
	setQuickGroupManagerOffMode,
} from "../js/lib/quick_group_manager_runtime.js";
import { GROUP_MODE } from "../js/lib/quick_group_manager_model.js";

function group(id, title, nodes, color = null) {
	return { id, title, nodes, color, recomputeInsideNodes() {} };
}

function manager(graph, id, state = {}) {
	return { id, type: "QuickGroupManager", comfyClass: "QuickGroupManager", graph, properties: { quickGroupManagerState: state } };
}

function graph(id, groups = []) {
	return { id, _groups: groups, _nodes: [], beforeChangeCount: 0, afterChangeCount: 0, changeCount: 0, dirtyCount: 0,
		beforeChange() { this.beforeChangeCount++; }, afterChange() { this.afterChangeCount++; }, change() { this.changeCount++; }, setDirtyCanvas() { this.dirtyCount++; } };
}

function node(mode = GROUP_MODE.ALWAYS, id = null) {
	return id == null ? { mode } : { id, mode };
}

test("returns an ordered, filtered read-only snapshot for the manager graph", () => {
	const red = group("red", "Red", [node()], "#ff0000");
	const blue = group("blue", "Blue", [node()], "#0000ff");
	const managerGraph = graph("root", [red, blue]);
	const current = manager(managerGraph, 1, { groupOrder: ["blue", "red"], filter: { mode: "selected", colors: ["#0000ff"] } });
	const snapshot = quickGroupManagerSnapshot(current);
	assert.equal(snapshot.state.filter.mode, "selected");
	assert.deepEqual(snapshot.visibleGroups.map((item) => item.id), ["blue"]);
	assert.deepEqual(snapshot.groups.map((item) => item.id), ["red", "blue"]);
});

test("recovers live members when a group cache is empty during graph hydration", () => {
	const member = { id: 101, mode: GROUP_MODE.ALWAYS, pos: [20, 20], size: [40, 40], boundingRect: [20, 20, 40, 40] };
	const visual = { id: "visual", title: "Visual", nodes: [], color: null, _bounding: [0, 0, 120, 120], recomputeInsideNodes() {} };
	const current = manager(graph("root", [visual]), 1);
	current.graph._nodes = [member];
	const snapshot = quickGroupManagerSnapshot(current);
	assert.deepEqual(snapshot.groups[0].nodes, [member]);
	const result = applyQuickGroupManagerAction(current, "visual", "disable");
	assert.equal(result.ok, true);
	assert.equal(member.mode, GROUP_MODE.NEVER);
});

test("keeps cached members when a graph group refresh fails", () => {
	const cached = group("cached", "Cached", [node()]);
	cached.recomputeInsideNodes = () => { throw new Error("incomplete graph"); };
	const current = manager(graph("root", [cached]), 1);
	const originalError = console.error;
	console.error = () => {};
	try {
		assert.deepEqual(quickGroupManagerSnapshot(current).groups, [cached]);
	} finally {
		console.error = originalError;
	}
});

test("keeps sidebar and preset snapshots safe when a graph group has no member cache", () => {
	const incomplete = { id: "incomplete", title: "Incomplete", recomputeInsideNodes() {} };
	const current = manager(graph("root", [incomplete]), 1);
	const snapshot = quickGroupManagerSnapshot(current);
	assert.deepEqual(snapshot.groups, [incomplete]);
	assert.deepEqual(quickGroupManagerPresetSnapshot(current), { version: 2, groups: [{ id: "incomplete", nodes: [] }] });
	assert.equal(applyQuickGroupManagerPreset(current, { version: 1, state: snapshot.state, groups: [{ id: "incomplete", nodes: [] }] }, { transaction: false }).ok, true);
});

test("applies a linkage cascade in one graph transaction", () => {
	const first = group("first", "First", [node()]);
	const secondNode = node();
	const second = group("second", "Second", [secondNode]);
	const managerGraph = graph("root", [first, second]);
	const current = manager(managerGraph, 1, { rules: { first: { disable: { second: "disable" } } } });
	const result = applyQuickGroupManagerAction(current, "first", "disable");
	assert.equal(result.ok, true);
	assert.equal(first.nodes[0].mode, GROUP_MODE.NEVER);
	assert.equal(secondNode.mode, GROUP_MODE.NEVER);
	assert.equal(managerGraph.beforeChangeCount, 1);
	assert.equal(managerGraph.afterChangeCount, 1);
	assert.equal(managerGraph.changeCount, 1);
	assert.equal(managerGraph.dirtyCount, 1);
});

test("refreshes every mounted manager control in the graph after a linked action", () => {
	const first = group("first", "First", [node()]);
	const second = group("second", "Second", [node()]);
	const managerGraph = graph("root", [first, second]);
	const source = manager(managerGraph, 1, { rules: { first: { disable: { second: "disable" } } } });
	const sibling = manager(managerGraph, 2);
	let sourceRefreshes = 0;
	let siblingRefreshes = 0;
	source._aaaliceQuickGroupControlRefreshes = new Set([() => { sourceRefreshes++; }]);
	sibling._aaaliceQuickGroupControlRefreshes = new Set([() => { siblingRefreshes++; }]);
	managerGraph._nodes = [source, sibling];

	assert.equal(applyQuickGroupManagerAction(source, "first", "disable").ok, true);
	assert.equal(second.nodes[0].mode, GROUP_MODE.NEVER);
	assert.equal(sourceRefreshes, 1);
	assert.equal(siblingRefreshes, 1);
});

test("updates the off mode without a second transaction when unchanged", () => {
	const disabled = group("disabled", "Disabled", [node(GROUP_MODE.NEVER)]);
	const managerGraph = graph("root", [disabled]);
	const current = manager(managerGraph, 1, { offMode: "mute" });
	const changed = setQuickGroupManagerOffMode(current, "bypass");
	assert.equal(changed.ok, true);
	assert.equal(changed.offMode, "bypass");
	assert.equal(current.properties.quickGroupManagerState.offMode, "bypass");
	assert.equal(managerGraph.beforeChangeCount, 1);
	const unchanged = setQuickGroupManagerOffMode(current, "bypass");
	assert.equal(unchanged.ok, true);
	assert.equal(unchanged.changed, false);
	assert.equal(managerGraph.beforeChangeCount, 1);
});

test("presets restore group switches without specializing manager configuration or linkage", () => {
	const enabledMember = node(GROUP_MODE.ALWAYS, 101);
	const disabledMember = node(GROUP_MODE.BYPASS, 102);
	const managed = group("managed", "Managed", [enabledMember, disabledMember]);
	const managerGraph = graph("root", [managed]);
	const current = manager(managerGraph, 1, {
		offMode: "bypass",
		groupOrder: ["managed"],
		rules: { managed: { disable: { other: "disable" } } },
	});
	const snapshot = quickGroupManagerPresetSnapshot(current);
	assert.deepEqual(snapshot, { version: 2, groups: [{ id: "managed", nodes: [{ id: "101", enabled: true }, { id: "102", enabled: false }] }] });
	enabledMember.mode = GROUP_MODE.BYPASS;
	disabledMember.mode = GROUP_MODE.ALWAYS;
	current.properties.quickGroupManagerState = {
		version: 1,
		offMode: "mute",
		filter: { mode: "selected", colors: ["#ff0000"], customColors: [], includeUncolored: false },
		groupOrder: ["other", "managed"],
		rules: { other: { enable: { managed: "enable" }, disable: {} } },
	};
	const sharedState = structuredClone(current.properties.quickGroupManagerState);
	const result = applyQuickGroupManagerPreset(current, snapshot, { transaction: false });
	assert.equal(result.ok, true);
	assert.equal(enabledMember.mode, GROUP_MODE.ALWAYS);
	assert.equal(disabledMember.mode, GROUP_MODE.NEVER);
	assert.deepEqual(current.properties.quickGroupManagerState, sharedState);
	assert.equal(managerGraph.beforeChangeCount, 0);

	enabledMember.mode = GROUP_MODE.BYPASS;
	disabledMember.mode = GROUP_MODE.ALWAYS;
	const legacy = {
		version: 1,
		state: { offMode: "bypass", rules: { managed: { disable: { other: "disable" } } } },
		groups: [{ id: "managed", nodes: [{ id: "101", mode: GROUP_MODE.ALWAYS }, { id: "102", mode: GROUP_MODE.BYPASS }] }],
	};
	assert.equal(applyQuickGroupManagerPreset(current, legacy, { transaction: false }).ok, true);
	assert.equal(enabledMember.mode, GROUP_MODE.ALWAYS);
	assert.equal(disabledMember.mode, GROUP_MODE.NEVER);
	assert.deepEqual(current.properties.quickGroupManagerState, sharedState);
});

test("rejects invalid linkage before changing node modes", () => {
	const first = group("first", "First", [node()]);
	const second = group("second", "Second", [node()]);
	const managerGraph = graph("root", [first, second]);
	const current = manager(managerGraph, 1, { rules: { first: { disable: { missing: "disable" } } } });
	const result = applyQuickGroupManagerAction(current, "first", "disable");
	assert.equal(result.ok, false);
	assert.equal(result.code, "missing");
	assert.equal(first.nodes[0].mode, GROUP_MODE.ALWAYS);
	assert.equal(managerGraph.beforeChangeCount, 0);
});
