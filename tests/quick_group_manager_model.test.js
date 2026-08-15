import test from "node:test";
import assert from "node:assert/strict";

import {
	GROUP_MODE,
	GROUP_STATE,
	QUICK_GROUP_COLOR_PALETTE,
	classifyGroupNodes,
	groupMatchesFilter,
	normalizeQuickGroupState,
	orderedVisibleGroups,
	planLinkageCascade,
	planNodeModeChanges,
	reconcileGroupOrder,
	reorderVisibleGroups,
	validateLinkageRules,
} from "../js/lib/quick_group_manager_model.js";

test("normalizes corrupt state to stable defaults", () => {
	assert.deepEqual(normalizeQuickGroupState({ offMode: "invalid", groupOrder: [1, "1", 2], filter: { mode: "selected", colors: [" #ABC ", "#abc"], customColors: ["#ABCDEF", "not-a-color", "#abcdef"] } }), {
		version: 1,
		offMode: "mute",
		filter: { mode: "selected", colors: ["#abc"], customColors: ["#abcdef"], includeUncolored: false },
		groupOrder: ["1", "2"],
		rules: {},
	});
});

test("keeps a broad native and custom-friendly color palette", () => {
	assert.ok(QUICK_GROUP_COLOR_PALETTE.length >= 24);
	assert.equal(new Set(QUICK_GROUP_COLOR_PALETTE).size, QUICK_GROUP_COLOR_PALETTE.length);
	assert.ok(QUICK_GROUP_COLOR_PALETTE.includes("#a88"));
	assert.ok(QUICK_GROUP_COLOR_PALETTE.includes("#3b82f6"));
});

test("filters multiple colors and uncolored groups", () => {
	const filter = { mode: "selected", colors: ["#red", "#blue"], includeUncolored: true };
	assert.equal(groupMatchesFilter({ color: "#RED" }, filter), true);
	assert.equal(groupMatchesFilter({ color: "#green" }, filter), false);
	assert.equal(groupMatchesFilter({}, filter), true);
});

test("reconciles live groups while preserving stale ids", () => {
	assert.deepEqual(reconcileGroupOrder(["3", "9", "1"], [{ id: 1 }, { id: 2 }, { id: 3 }]), ["3", "1", "2", "9"]);
});

test("reorders only visible ids and keeps hidden relative order", () => {
	assert.deepEqual(reorderVisibleGroups(["1", "2", "3", "4"], ["1", "3"], "3", "1"), ["3", "2", "1", "4"]);
	const state = normalizeQuickGroupState({ groupOrder: [3, 1, 2], filter: { mode: "selected", colors: ["#a"] } });
	assert.deepEqual(orderedVisibleGroups([{ id: 1, color: "#a" }, { id: 2, color: "#b" }, { id: 3, color: "#a" }], state).map((group) => group.id), [3, 1]);
});

test("classifies enabled, disabled, mixed and empty groups", () => {
	assert.equal(classifyGroupNodes([]), GROUP_STATE.EMPTY);
	assert.equal(classifyGroupNodes([{ mode: 0 }, { mode: 0 }]), GROUP_STATE.ENABLED);
	assert.equal(classifyGroupNodes([{ mode: 2 }, { mode: 4 }]), GROUP_STATE.DISABLED);
	assert.equal(classifyGroupNodes([{ mode: 0 }, { mode: 4 }]), GROUP_STATE.MIXED);
	assert.equal(classifyGroupNodes([{ mode: 1 }]), GROUP_STATE.MIXED);
});

test("plans same-manager cascade and stops outside scope", () => {
	const rules = {
		1: { enable: { 2: "disable", 3: "enable" }, disable: {} },
		2: { enable: {}, disable: { 4: "enable" } },
		3: { enable: { 5: "disable" }, disable: {} },
	};
	const result = planLinkageCascade({ sourceId: 1, action: "enable", rules, scopedIds: new Set(["1", "2"]), knownIds: new Set(["1", "2", "3", "4", "5"]) });
	assert.equal(result.ok, true);
	assert.deepEqual([...result.assignments], [["1", "enable"], ["2", "disable"], ["3", "enable"], ["4", "enable"]]);
});

test("rejects self links, cycles, missing targets and conflicting paths", () => {
	assert.equal(validateLinkageRules({ 1: { enable: { 1: "enable" }, disable: {} } }, new Set(["1"]), new Set(["1"])).code, "self");
	assert.equal(validateLinkageRules({ 1: { enable: { 2: "enable" }, disable: {} }, 2: { enable: { 1: "enable" }, disable: {} } }, new Set(["1", "2"]), new Set(["1", "2"])).code, "cycle");
	assert.equal(validateLinkageRules({ 1: { enable: { 9: "enable" }, disable: {} } }, new Set(["1"]), new Set(["1"])).code, "missing");
	const conflict = planLinkageCascade({
		sourceId: 1,
		action: "enable",
		rules: { 1: { enable: { 2: "enable", 3: "enable" } }, 2: { enable: { 4: "enable" } }, 3: { enable: { 4: "disable" } } },
		scopedIds: new Set(["1", "2", "3"]),
		knownIds: new Set(["1", "2", "3", "4"]),
	});
	assert.equal(conflict.code, "conflict");
});

test("ignores linkage rules owned by groups that no longer exist", () => {
	const result = validateLinkageRules({
		1: { enable: { 2: "disable" }, disable: {} },
		9: { enable: { 8: "enable" }, disable: {} },
	}, new Set(["1", "2"]), new Set(["1", "2"]));
	assert.equal(result.ok, true);
});

test("preflights empty groups and overlapping node conflicts", () => {
	const shared = { id: 10, mode: 0 };
	const groups = new Map([
		["1", { nodes: [shared] }],
		["2", { nodes: [shared] }],
		["3", { nodes: [] }],
	]);
	const conflict = planNodeModeChanges(new Map([["1", "enable"], ["2", "disable"]]), groups, "mute");
	assert.equal(conflict.code, "nodeConflict");
	assert.equal(planNodeModeChanges(new Map([["3", "disable"]]), groups, "bypass").code, "empty");
	const valid = planNodeModeChanges(new Map([["1", "disable"]]), groups, "bypass");
	assert.equal(valid.ok, true);
	assert.equal(valid.nodeModes.get(shared), GROUP_MODE.BYPASS);
});
