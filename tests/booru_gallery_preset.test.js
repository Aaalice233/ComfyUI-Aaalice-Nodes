import test from "node:test";
import assert from "node:assert/strict";

import { defaultGalleryState, normalizeGalleryState } from "../js/lib/booru_gallery_model.js";
import {
	BOORU_GALLERY_PRESET_VERSION,
	createBooruGalleryPreset,
	decodeBooruGalleryPreset,
	validateBooruGalleryPreset,
} from "../js/lib/booru_gallery_preset.js";

function selection(postId) {
	return {
		source: "danbooru", postId, mediaUrl: `https://example.com/${postId}.jpg`, previewUrl: `https://example.com/${postId}-preview.jpg`,
		originalTags: { artist: ["artist"], copyright: [], character: [], general: ["tag"], meta: [] },
	};
}

test("gallery presets capture the complete interactive component state", () => {
	const state = defaultGalleryState();
	state.source = "gelbooru";
	state.query = "landscape sky";
	state.view = "selected";
	state.selectionMode = "multi";
	state.randomMode = true;
	state.filters = { ratings: ["general", "sensitive"], sort: "score", feed: "favorites", period: "" };
	state.navigation.page = 7;
	state.prompt = { categories: ["artist", "general"], replaceUnderscores: true, escapeParentheses: true };
	state.selections = [selection("101"), selection("202")];

	state.dashboard.searchOpen = true;
	const preset = createBooruGalleryPreset(state);
	assert.equal(preset.version, BOORU_GALLERY_PRESET_VERSION);
	assert.deepEqual(preset.state, normalizeGalleryState(state));
	assert.equal(preset.state.dashboard.searchOpen, true);
	assert.equal("component" in preset, false);
	assert.notEqual(preset.state, state);
	assert.notEqual(preset.state.selections, state.selections);

	state.randomMode = false;
	state.selections.length = 0;
	assert.equal(preset.state.randomMode, true);
	assert.equal(preset.state.selections.length, 2);
});

test("gallery preset decoding validates and normalizes saved component state", () => {
	const state = defaultGalleryState();
	state.selectionMode = "multi";
	state.selections = [selection("42")];
	const preset = createBooruGalleryPreset(state);

	assert.equal(validateBooruGalleryPreset(preset), true);
	assert.deepEqual(decodeBooruGalleryPreset(preset), { state: preset.state });
	assert.equal(validateBooruGalleryPreset(null), "invalid-gallery-preset-version");
	assert.equal(validateBooruGalleryPreset({ version: 99, state }), "invalid-gallery-preset-version");
	assert.equal(validateBooruGalleryPreset({ version: 1 }), "invalid-gallery-preset-state");
	assert.equal(validateBooruGalleryPreset({ ...preset, state: { ...preset.state, source: "unknown" } }), "invalid-gallery-preset-state");
	assert.equal(validateBooruGalleryPreset({ ...preset, state: { ...preset.state, selections: [{ source: "danbooru" }] } }), "invalid-gallery-preset-state");
	assert.equal(validateBooruGalleryPreset({ ...preset, state: { ...preset.state, prompt: { ...preset.state.prompt, categories: ["unknown"] } } }), "invalid-gallery-preset-state");
	assert.equal(validateBooruGalleryPreset({ ...preset, state: { ...preset.state, dashboard: { searchOpen: "yes" } } }), "invalid-gallery-preset-state");
	assert.equal(validateBooruGalleryPreset({ ...preset, component: { searchOpen: "yes" } }), "invalid-gallery-preset-component");
	assert.throws(() => decodeBooruGalleryPreset({ version: 99, state }), /invalid-gallery-preset-version/);
});

test("legacy preset projection state migrates into workflow-owned gallery state", () => {
	const state = defaultGalleryState();
	delete state.dashboard;
	const decoded = decodeBooruGalleryPreset({ version: 1, state, component: { searchOpen: true } });
	assert.equal(decoded.state.dashboard.searchOpen, true);
	assert.equal("component" in decoded, false);
});

test("gallery preset snapshots survive workflow JSON serialization", () => {
	const state = defaultGalleryState();
	state.source = "safebooru";
	state.view = "selected";
	state.selectionMode = "multi";
	state.randomMode = true;
	state.navigation.page = 5;
	state.dashboard.searchOpen = true;
	state.selections = [selection("persisted")];
	const saved = JSON.parse(JSON.stringify(createBooruGalleryPreset(state)));

	assert.equal(validateBooruGalleryPreset(saved), true);
	assert.deepEqual(decodeBooruGalleryPreset(saved), { state: normalizeGalleryState(state) });
});
