import test from "node:test";
import assert from "node:assert/strict";

import { virtualGridHeight, virtualGridLayout, virtualGridRange } from "../js/lib/virtual_grid.js";

test("virtual grid derives responsive columns and bounded geometry", () => {
	const grid = virtualGridLayout(392, "grid", { gridMinWidth: 88, gridExtraHeight: 38, gap: 7 });
	assert.equal(grid.columns, 4);
	assert.equal(grid.itemWidth, 92.75);
	assert.equal(grid.itemHeight, 130.75);
	assert.equal(virtualGridHeight(1_000, grid), 34_430.5);

	const list = virtualGridLayout(392, "list", { listHeight: 48, gap: 7 });
	assert.deepEqual(list, { columns: 1, gap: 7, itemWidth: 392, itemHeight: 48 });
	assert.equal(virtualGridHeight(1_000, list), 54_993);
});

test("virtual grid range mounts only visible rows plus a fixed overscan", () => {
	const layout = virtualGridLayout(392, "grid", { gridMinWidth: 88, gridExtraHeight: 38, gap: 7 });
	assert.deepEqual(virtualGridRange({ itemCount: 10_000, layout, scrollTop: 0, viewportHeight: 440, overscanRows: 2 }), { start: 0, end: 24 });
	assert.deepEqual(virtualGridRange({ itemCount: 10_000, layout, scrollTop: 4_000, viewportHeight: 440, overscanRows: 2 }), { start: 108, end: 140 });
	assert.deepEqual(virtualGridRange({ itemCount: 0, layout, scrollTop: 0, viewportHeight: 440 }), { start: 0, end: 0 });
});
