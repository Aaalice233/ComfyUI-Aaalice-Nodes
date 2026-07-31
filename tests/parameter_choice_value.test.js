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
	assert.equal(normalizeChoiceValue("", []), "");
});

test("model sources preserve a non-empty value removed from the refreshed list", () => {
	assert.equal(
		normalizeChoiceValue("missing-model.safetensors", ["other-model.safetensors"], { preserveInvalid: true }),
		"missing-model.safetensors",
	);
	assert.equal(normalizeChoiceValue("", ["first", "second"], { preserveInvalid: true }), "first");
});
