import assert from "node:assert/strict";
import test from "node:test";

import { normalizeChoiceValue } from "../js/lib/parameter_choice_value.js";

test("new enum and dropdown values select the first available option", () => {
	assert.equal(normalizeChoiceValue("", ["first", "second"]), "first");
	assert.equal(normalizeChoiceValue(null, ["first", "second"]), "first");
	assert.equal(normalizeChoiceValue("removed", ["first", "second"]), "first");
});

test("choice normalization preserves an existing valid selection", () => {
	assert.equal(normalizeChoiceValue("second", ["first", "second"]), "second");
});

test("temporarily unavailable dynamic options do not discard the saved value", () => {
	assert.equal(normalizeChoiceValue("saved", []), "saved");
});
