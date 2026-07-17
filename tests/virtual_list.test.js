import test from "node:test";
import assert from "node:assert/strict";

import { calculateVirtualRange } from "../js/lib/virtual_list.js";

test("virtual range keeps DOM work bounded around the viewport", () => {
	assert.deepEqual(calculateVirtualRange({ count: 10000, rowHeight: 50, scrollTop: 25000, viewportHeight: 500, overscan: 4 }), { start: 496, end: 514 });
	assert.deepEqual(calculateVirtualRange({ count: 3, rowHeight: 50, scrollTop: 0, viewportHeight: 500, overscan: 4 }), { start: 0, end: 3 });
	assert.deepEqual(calculateVirtualRange({ count: 0, rowHeight: 50, scrollTop: 0, viewportHeight: 500 }), { start: 0, end: 0 });
});
