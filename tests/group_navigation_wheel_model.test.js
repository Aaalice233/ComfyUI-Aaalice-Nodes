import test from "node:test";
import assert from "node:assert/strict";

import {
	GROUP_NAVIGATION_WHEEL_PAGE_SIZE,
	clampWheelCenter,
	cycleWheelIndex,
	pageStep,
	wheelPage,
	wheelPages,
	wheelSectorIndex,
} from "../js/lib/group_navigation_wheel_model.js";

const entries = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1, selectable: true }));

test("wheel pages preserve manual order and never silently drop entries", () => {
	const pages = wheelPages(entries(17));
	assert.equal(GROUP_NAVIGATION_WHEEL_PAGE_SIZE, 8);
	assert.equal(pages.length, 3);
	assert.deepEqual(pages.map((page) => page.items.map((entry) => entry.id)), [[1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16], [17]]);
	assert.equal(wheelPage(entries(3), 99).index, 0);
	assert.equal(wheelPage(entries(17), 1).hasPrevious, true);
	assert.equal(wheelPage(entries(17), 1).hasNext, true);
});

test("wheel sectors use a top-origin clockwise direction and a center dead zone", () => {
	assert.equal(wheelSectorIndex(0, -100, 8), 0);
	assert.equal(wheelSectorIndex(100, 0, 8), 2);
	assert.equal(wheelSectorIndex(0, 100, 8), 4);
	assert.equal(wheelSectorIndex(-100, 0, 8), 6);
	assert.equal(wheelSectorIndex(0, 10, 8), null);
	assert.equal(wheelSectorIndex(0, -100, 0), null);
});

test("keyboard cycling skips unavailable entries and wraps within the page", () => {
	const page = [{ selectable: false }, { selectable: true }, { selectable: true }, { selectable: false }];
	assert.equal(cycleWheelIndex(null, 1, page), 1);
	assert.equal(cycleWheelIndex(1, 1, page), 2);
	assert.equal(cycleWheelIndex(2, 1, page), 1);
	assert.equal(cycleWheelIndex(null, -1, page), 2);
	assert.equal(cycleWheelIndex(0, 1, [{ selectable: false }]), null);
});

test("page navigation clamps at both ends", () => {
	assert.equal(pageStep(0, -1, 3), 0);
	assert.equal(pageStep(0, 1, 3), 1);
	assert.equal(pageStep(2, 1, 3), 2);
	assert.equal(pageStep(2, -1, 3), 1);
});

test("wheel center stays inside the viewport safety margin", () => {
	assert.deepEqual(clampWheelCenter({ x: 0, y: 0 }, { width: 1000, height: 800 }, 200, 20), { x: 220, y: 220 });
	assert.deepEqual(clampWheelCenter(null, { width: 1000, height: 800 }, 200, 20), { x: 500, y: 400 });
});
