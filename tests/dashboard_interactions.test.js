import test from "node:test";
import assert from "node:assert/strict";

import { grabSpanOffset, selectionFootprint } from "../js/lib/dashboard_interactions.js";

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
