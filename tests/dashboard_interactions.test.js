import test from "node:test";
import assert from "node:assert/strict";

import { grabSpanOffset, selectionFootprint } from "../js/lib/dashboard_interactions.js";
import { applyMarqueeSelection, containedSelectionIds, marqueeSelectionIds, nearestInDirection, nextClickSelection } from "../js/lib/dashboard_selection.js";

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

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const entries = [
	{ id: "inside", rect: rect(20, 20, 60, 60) },
	{ id: "touching", rect: rect(80, 20, 140, 60) },
	{ id: "outside", rect: rect(200, 20, 260, 60) },
];

test("marquee selection switches between intersection and containment by drag direction", () => {
	const area = rect(10, 10, 100, 80);
	const forward = marqueeSelectionIds(entries, area, { x: 10, y: 10 }, { x: 100, y: 80 });
	assert.deepEqual([...forward.ids].sort(), ["inside", "touching"]);
	assert.equal(forward.containment, false);
	const backward = marqueeSelectionIds(entries, area, { x: 100, y: 80 }, { x: 10, y: 10 });
	assert.deepEqual([...backward.ids], ["inside"]);
	assert.equal(backward.containment, true);
	assert.deepEqual([...containedSelectionIds(entries, rect(0, 0, 300, 100))].sort(), ["inside", "outside", "touching"]);
});

test("marquee application supports additive and subtractive modes", () => {
	assert.deepEqual([...applyMarqueeSelection(["a"], ["b", "c"], "add")].sort(), ["a", "b", "c"]);
	assert.deepEqual([...applyMarqueeSelection(["a", "b", "c"], ["b"], "subtract")].sort(), ["a", "c"]);
	assert.deepEqual([...applyMarqueeSelection(["a"], ["b"], "subtract")], ["a"]);
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
