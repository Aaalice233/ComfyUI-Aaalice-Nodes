import test from "node:test";
import assert from "node:assert/strict";

import { grabSpanOffset, isGroupMembershipDrop, normalizeDragSelection, selectionFootprint, shouldStartMarquee } from "../js/lib/dashboard_interactions.js";
import { applyMarqueeSelection, containedIds, nearestInDirection, nextClickSelection } from "../js/lib/dashboard_selection.js";

test("drag grab offset preserves the pointer anchor across grid spans", () => {
	assert.equal(grabSpanOffset(150, 0, 300, 6), 3);
	assert.equal(grabSpanOffset(20, 0, 100, 10), 2);
});

test("drag grab offset clamps pointer positions to the grabbed footprint", () => {
	assert.equal(grabSpanOffset(-20, 0, 300, 6), 0);
	assert.equal(grabSpanOffset(320, 0, 300, 6), 5);
	assert.equal(grabSpanOffset(150, 0, 300, 1), 0);
});

test("multi-selection drag uses one stable bounding footprint", () => {
	assert.deepEqual(selectionFootprint([
		{ row: 2, column: 3, rowSpan: 6, columnSpan: 3 },
		{ row: 10, column: 7, rowSpan: 4, columnSpan: 5 },
	]), { row: 2, column: 3, rowSpan: 12, columnSpan: 9 });
});

test("mixed root and grouped card selection promotes the group as an intact drag unit", () => {
	const entries = [
		{ id: "loose", groupId: null },
		{ id: "member-a", groupId: "group-a" },
		{ id: "member-b", groupId: "group-a" },
	];
	assert.deepEqual(normalizeDragSelection(entries, new Set(["loose", "member-a"]), new Set()), {
		itemIds: ["loose"], groupIds: ["group-a"], topLevel: true,
	});
	assert.deepEqual(normalizeDragSelection(entries, new Set(["member-a", "member-b"]), new Set()), {
		itemIds: ["member-a", "member-b"], groupIds: [], topLevel: false,
	});
});

test("group membership drop only activates when cards enter another group", () => {
	assert.equal(isGroupMembershipDrop("group-b", [null]), true);
	assert.equal(isGroupMembershipDrop("group-b", ["group-a"]), true);
	assert.equal(isGroupMembershipDrop("group-b", ["group-b"]), false);
	assert.equal(isGroupMembershipDrop(null, ["group-a"]), false);
});

test("marquee application supports additive and subtractive modes", () => {
	assert.deepEqual([...applyMarqueeSelection(["a"], ["b", "c"], "add")].sort(), ["a", "b", "c"]);
	assert.deepEqual([...applyMarqueeSelection(["a", "b", "c"], ["b"], "subtract")].sort(), ["a", "c"]);
	assert.deepEqual([...applyMarqueeSelection(["a"], ["b"], "subtract")], ["a"]);
});

test("dense dashboards start marquee from unselected cards while selected cards remain draggable", () => {
	assert.equal(shouldStartMarquee({ hasEntry: false }), true);
	assert.equal(shouldStartMarquee({ hasEntry: true, selected: false }), true);
	assert.equal(shouldStartMarquee({ hasEntry: true, selected: true }), false);
	assert.equal(shouldStartMarquee({ hasEntry: true, selected: true, additive: true }), true);
	assert.equal(shouldStartMarquee({ hasEntry: true, selected: true, subtract: true }), true);
});

test("contained ids only include frames fully covered by the rectangle", () => {
	const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
	const frames = [
		{ id: "covered", rect: rect(20, 20, 60, 60) },
		{ id: "partial", rect: rect(80, 20, 140, 60) },
		{ id: "outside", rect: rect(200, 20, 260, 60) },
	];
	assert.deepEqual([...containedIds(frames, rect(10, 10, 100, 80))], ["covered"]);
	assert.deepEqual([...containedIds(frames, rect(0, 0, 300, 100))].sort(), ["covered", "outside", "partial"]);
	assert.deepEqual([...containedIds(frames, rect(0, 0, 30, 30))], []);
});

test("click selection replaces, toggles, or subtracts without guessing", () => {
	assert.deepEqual([...nextClickSelection(["a", "b"], "c")], ["c"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "a")], ["a", "b"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "a", { additive: true })], ["b"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "c", { additive: true })].sort(), ["a", "b", "c"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "a", { subtract: true })], ["b"]);
	assert.deepEqual([...nextClickSelection(["a", "b"], "c", { subtract: true })].sort(), ["a", "b"]);
});

test("keyboard navigation picks the nearest card in the requested direction", () => {
	const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
	const grid = [
		{ id: "origin", rect: rect(100, 100, 160, 140) },
		{ id: "right", rect: rect(200, 104, 260, 136) },
		{ id: "right-far", rect: rect(300, 100, 360, 140) },
		{ id: "below", rect: rect(104, 200, 156, 240) },
		{ id: "left", rect: rect(10, 100, 60, 140) },
	];
	assert.equal(nearestInDirection(grid, "origin", "right"), "right");
	assert.equal(nearestInDirection(grid, "origin", "down"), "below");
	assert.equal(nearestInDirection(grid, "origin", "left"), "left");
	assert.equal(nearestInDirection(grid, "origin", "up"), null);
	assert.equal(nearestInDirection(grid, "right", "right"), "right-far");
	assert.equal(nearestInDirection(grid, "missing", "right"), null);
});
