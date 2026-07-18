import test from "node:test";
import assert from "node:assert/strict";

import { intersectingSelectionIds, rectanglesIntersect, selectionRectangle } from "../js/lib/dashboard_selection.js";

test("selection rectangle normalizes drag direction and clips to bounds", () => {
	assert.deepEqual(selectionRectangle({ x: 90, y: 80 }, { x: 10, y: 20 }, { left: 20, top: 10, right: 70, bottom: 60 }), {
		left: 20, top: 20, right: 70, bottom: 60, width: 50, height: 40,
	});
});

test("rectangle selection includes intersecting cards but not edge-only contact", () => {
	const selection = { left: 10, top: 10, right: 50, bottom: 50 };
	assert.equal(rectanglesIntersect(selection, { left: 20, top: 20, right: 30, bottom: 30 }), true);
	assert.equal(rectanglesIntersect(selection, { left: 50, top: 20, right: 70, bottom: 30 }), false);
	assert.deepEqual([...intersectingSelectionIds([
		{ id: "inside", rect: { left: 20, top: 20, right: 30, bottom: 30 } },
		{ id: "outside", rect: { left: 60, top: 60, right: 70, bottom: 70 } },
	], selection)], ["inside"]);
});
