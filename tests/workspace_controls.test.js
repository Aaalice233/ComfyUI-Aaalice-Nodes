import test from "node:test";
import assert from "node:assert/strict";

import { registerControlValueView, updateBoundControlValues } from "../js/lib/control_value_channel.js";

test("binding-key value channel updates matching views once without touching unrelated controls", () => {
	const events = [];
	const removePrimary = registerControlValueView(["primary"], (value, detail) => events.push(["primary", value, detail.seedBehavior || null]));
	const removeShared = registerControlValueView(["primary", "linked"], (value) => events.push(["shared", value]));
	const removeOther = registerControlValueView(["other"], (value) => events.push(["other", value]));

	updateBoundControlValues(["primary", "linked"], 42, { seedBehavior: "fixed" });
	assert.deepEqual(events, [["primary", 42, "fixed"], ["shared", 42]]);

	removePrimary(); removeShared(); removeOther();
	updateBoundControlValues(["primary", "other"], 7);
	assert.equal(events.length, 2);
});
