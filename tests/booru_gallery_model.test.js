import assert from "node:assert/strict";
import test from "node:test";
import { defaultGalleryRatings, defaultGalleryState, finalPrompt, galleryPayload, normalizeGalleryState, selectionKey } from "../js/lib/booru_gallery_model.js";

const selected = (source, postId) => ({ source, postId, mediaUrl: `https://media.test/${postId}.jpg`, previewUrl: `https://preview.test/${postId}.jpg`, originalTags: { copyright: ["series_a"], character: ["hero_(a)"], general: ["blue_hair"] } });

test("new galleries use source-native rating defaults instead of shared settings", () => {
	assert.deepEqual(defaultGalleryRatings("danbooru"), ["general"]);
	assert.deepEqual(defaultGalleryRatings("gelbooru"), ["general"]);
	assert.deepEqual(defaultGalleryRatings("safebooru"), ["safe"]);
	assert.deepEqual(defaultGalleryRatings("aitag"), []);
	assert.deepEqual(normalizeGalleryState(null, { defaultRatings: { danbooru: ["explicit"] } }).filters.ratings, ["general"]);
});

test("legacy Gelbooru safe ratings migrate to the current general value", () => {
	const state = normalizeGalleryState({ version: 1, source: "gelbooru", prompt: {}, filters: { ratings: ["safe", "questionable"] }, selections: [] });
	assert.deepEqual(state.filters.ratings, ["general", "questionable"]);
});

test("saved node ratings survive normalization independently from defaults", () => {
	const state = normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: { ratings: ["general", "questionable", "explicit"] }, selections: [] });
	assert.deepEqual(state.filters.ratings, ["general", "questionable", "explicit"]);
});

test("gallery view and Dashboard projection are workflow state while legacy workflows use defaults", () => {
	const restored = normalizeGalleryState({ version: 1, source: "danbooru", view: "selected", dashboard: { searchOpen: true }, prompt: {}, filters: {}, selections: [] });
	assert.equal(restored.view, "selected");
	assert.equal(restored.dashboard.searchOpen, true);
	const legacy = normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: {}, selections: [] });
	assert.equal(legacy.view, "browse");
	assert.equal(legacy.dashboard.searchOpen, false);
});

test("random mode persists in workflow state without entering execution payloads", () => {
	assert.equal(defaultGalleryState().randomMode, false);
	const state = normalizeGalleryState({ version: 1, source: "danbooru", randomMode: true, prompt: {}, filters: {}, selections: [] });
	assert.equal(state.randomMode, true);
	assert.equal(normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: {}, selections: [] }).randomMode, false);
	assert.equal("randomMode" in galleryPayload(state), false);
});

test("legacy Danbooru random sorting migrates to the dedicated random mode", () => {
	const state = normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: { sort: "random" }, selections: [] });
	assert.equal(state.randomMode, true);
	assert.equal(state.filters.sort, "latest");
});

test("selection mode defaults to single while explicit saved modes survive normalization", () => {
	assert.equal(defaultGalleryState().selectionMode, "single");
	assert.equal(normalizeGalleryState({ version: 1, source: "danbooru", selectionMode: "single", prompt: {}, filters: {}, selections: [] }).selectionMode, "single");
	assert.equal(normalizeGalleryState({ version: 1, source: "danbooru", selectionMode: "multi", prompt: {}, filters: {}, selections: [] }).selectionMode, "multi");
	assert.equal(normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: {}, selections: [] }).selectionMode, "single");
	assert.equal(normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: {}, selections: [selected("danbooru", 1), selected("danbooru", 2)] }).selectionMode, "multi");
	const restored = normalizeGalleryState(JSON.parse(JSON.stringify(normalizeGalleryState({ version: 1, source: "danbooru", selectionMode: "multi", prompt: {}, filters: {}, selections: [] }))));
	assert.equal(restored.selectionMode, "multi");
	const state = normalizeGalleryState({ version: 1, source: "danbooru", selectionMode: "single", prompt: {}, filters: {}, selections: [selected("danbooru", 1), selected("danbooru", 2)] });
	assert.deepEqual(state.selections.map(selectionKey), ["danbooru:1"]);
	assert.equal("selectionMode" in galleryPayload(state), false);
});

test("gallery state deduplicates only source plus post id and preserves order", () => {
	const state = normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: {}, selections: [selected("danbooru", 2), selected("danbooru", 2), selected("gelbooru", 2)] });
	assert.deepEqual(state.selections.map(selectionKey), ["danbooru:2", "gelbooru:2"]);
	assert.equal(state.filters.feed, "search");
});

test("gallery state persists the favorites feed without changing output snapshots", () => {
	const state = normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: { sort: "score", feed: "favorites" }, selections: [] });
	assert.equal(state.filters.feed, "favorites");
	assert.equal(state.filters.sort, "score");
	assert.equal(galleryPayload(state).selections.length, 0);
});

test("gallery state persists a logical page and ranking period without leaking them into the queue payload", () => {
	const state = normalizeGalleryState({ version: 1, source: "danbooru", prompt: {}, filters: { feed: "ranking", period: "week" }, navigation: { page: 12 }, selections: [] });
	assert.deepEqual(state.navigation, { page: 12 });
	assert.equal(state.filters.period, "week");
	assert.equal("navigation" in galleryPayload(state), false);
});

test("legacy AI TAG monthly sort normalizes to the ranking channel", () => {
	const state = normalizeGalleryState({ version: 1, source: "aitag", prompt: {}, filters: { sort: "monthly" }, selections: [] });
	assert.equal(state.filters.feed, "ranking");
	assert.equal(state.filters.period, "month");
	assert.equal(state.filters.sort, "new");
});

test("prompt processing follows fixed category order and exact exclusion", () => {
	const item = normalizeGalleryState({ version: 1, source: "danbooru", filters: {}, prompt: { categories: ["general", "character", "copyright"], replaceUnderscores: true, escapeParentheses: true, excludedTags: ["blue_hair"] }, selections: [selected("danbooru", 1)] }).selections[0];
	assert.equal(finalPrompt(item, { categories: ["general", "character", "copyright"], replaceUnderscores: true, escapeParentheses: true, excludedTags: ["blue_hair"] }), "series a, hero \\(a\\)");
});

test("payload is an independent immutable queue snapshot", () => {
	const state = normalizeGalleryState({ version: 1, source: "danbooru", filters: {}, prompt: { categories: ["general"] }, selections: [selected("danbooru", 1)] });
	const payload = galleryPayload(state); state.selections[0].originalTags.general.push("later");
	assert.deepEqual(payload.selections[0].originalTags.general, ["blue_hair"]);
	assert.deepEqual(payload.prompts, ["blue_hair"]);
});

test("excluded tags are one global payload input instead of workflow state", () => {
	const state = normalizeGalleryState({ prompt: { excludedTags: ["stale_local"] }, selections: [selected("danbooru", 1)] });
	assert.equal("excludedTags" in state.prompt, false);
	assert.deepEqual(galleryPayload(state, ["global_tag"]).prompt.excludedTags, ["global_tag"]);
});

test("output filter tags strip prompts alongside exclusions without entering workflow state", () => {
	const item = normalizeGalleryState({ version: 1, source: "danbooru", filters: {}, prompt: { categories: ["general", "copyright"] }, selections: [selected("danbooru", 1)] }).selections[0];
	assert.equal(finalPrompt(item, { categories: ["general", "copyright"], outputFilterTags: ["blue_hair"] }), "series_a");
	assert.equal(finalPrompt(item, { categories: ["general", "copyright"], excludedTags: ["series_a"], outputFilterTags: ["blue_hair"] }), "");
	const state = normalizeGalleryState({ version: 1, prompt: { outputFilterTags: ["stale_local"] }, selections: [selected("danbooru", 1)] });
	assert.equal("outputFilterTags" in state.prompt, false);
	const payload = galleryPayload(state, ["global_tag"], ["blue_hair"]);
	assert.deepEqual(payload.prompt.outputFilterTags, ["blue_hair"]);
	assert.deepEqual(payload.prompts, [""]);
});
