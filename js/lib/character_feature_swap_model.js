/** Workflow-persistent model for CharacterFeatureSwapNode. */

import { normalizeTagListValue } from "./taglist_value.js";

export const DEFAULT_CHARACTER_FEATURES = Object.freeze([
	"hair style",
	"hair color",
	"hair ornament",
	"eye color",
	"clothing",
	"unique body parts",
	"body shape",
	"ear shape",
]);

export const DEFAULT_CHARACTER_FEATURE_SWAP_STATE = Object.freeze({
	version: 1,
	features: Object.freeze(DEFAULT_CHARACTER_FEATURES.map((text) => Object.freeze({ text, enabled: true }))),
});

export function normalizeCharacterFeatureSwapState(raw) {
	const source = raw && typeof raw === "object" ? raw : {};
	const provided = Array.isArray(source.features);
	return {
		version: 1,
		features: normalizeTagListValue(provided ? source.features : DEFAULT_CHARACTER_FEATURES),
	};
}

export function characterFeatureSwapPayload(state) {
	const normalized = normalizeCharacterFeatureSwapState(state);
	return { version: 1, features: normalized.features.map((entry) => ({ ...entry })) };
}
