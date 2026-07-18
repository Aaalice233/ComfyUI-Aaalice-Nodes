import test from "node:test";
import assert from "node:assert/strict";

import { createSeedPresetPayload, decodeSeedPresetEntry, validateSeedPresetEntry } from "../js/lib/seed_preset.js";

test("seed presets preserve both the value and after-generate behavior", () => {
	const entry = { valueType: "number", payload: createSeedPresetPayload(42, "fixed") };
	assert.equal(validateSeedPresetEntry(entry, { min: 0, max: 100 }), true);
	assert.deepEqual(decodeSeedPresetEntry(entry, "randomize"), { value: 42, behavior: "fixed", hasBehavior: true });
});

test("legacy scalar seed presets remain valid without changing the current behavior", () => {
	const entry = { valueType: "number", payload: 17 };
	assert.equal(validateSeedPresetEntry(entry, { min: 0, max: 100 }), true);
	assert.deepEqual(decodeSeedPresetEntry(entry, "increment"), { value: 17, behavior: "increment", hasBehavior: false });
});

test("seed preset validation rejects invalid values and behaviors", () => {
	assert.equal(validateSeedPresetEntry({ valueType: "number", payload: { value: 101, control_after_generate: "fixed" } }, { min: 0, max: 100 }), "above-maximum");
	assert.equal(validateSeedPresetEntry({ valueType: "number", payload: { value: 1, control_after_generate: "surprise" } }), "invalid-seed-behavior");
});
