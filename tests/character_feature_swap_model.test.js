import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_CHARACTER_FEATURES,
	characterFeatureSwapPayload,
	normalizeCharacterFeatureSwapState,
} from "../js/lib/character_feature_swap_model.js";

test("creates the documented default feature list", () => {
	const state = normalizeCharacterFeatureSwapState(null);
	assert.deepEqual(state.features.map((entry) => entry.text), DEFAULT_CHARACTER_FEATURES);
	assert.ok(state.features.every((entry) => entry.enabled));
});

test("normalizes custom, disabled and duplicate features", () => {
	const state = normalizeCharacterFeatureSwapState({ features: [
		{ text: "hair style", enabled: false }, " clothing ", { text: "clothing", enabled: true }, "",
	] });
	assert.deepEqual(state.features, [
		{ text: "hair style", enabled: false },
		{ text: "clothing", enabled: true },
	]);
});

test("emits a versioned independent payload", () => {
	const state = normalizeCharacterFeatureSwapState({ features: [{ text: "eyes", enabled: true }] });
	const payload = characterFeatureSwapPayload(state);
	assert.deepEqual(payload, { version: 1, features: [{ text: "eyes", enabled: true }] });
	payload.features[0].text = "changed";
	assert.equal(state.features[0].text, "eyes");
});
