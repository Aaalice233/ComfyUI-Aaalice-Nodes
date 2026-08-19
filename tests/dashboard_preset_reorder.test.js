import test from "node:test";
import assert from "node:assert/strict";

import { dashboardPresetDropIndex } from "../js/lib/dashboard_preset_reorder.js";

const order = ["a", "b", "c", "d"];

test("preset drop positions remain correct when moving in either direction", () => {
	assert.equal(dashboardPresetDropIndex(order, "a", "c", false), 1);
	assert.equal(dashboardPresetDropIndex(order, "a", "c", true), 2);
	assert.equal(dashboardPresetDropIndex(order, "d", "b", false), 1);
	assert.equal(dashboardPresetDropIndex(order, "d", "b", true), 2);
	assert.equal(dashboardPresetDropIndex(order, "b", "c", true), 2);
});
