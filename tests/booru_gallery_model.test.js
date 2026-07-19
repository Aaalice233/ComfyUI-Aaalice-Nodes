import assert from "node:assert/strict";
import test from "node:test";
import { finalPrompt, galleryPayload, normalizeGalleryState, selectionKey } from "../js/lib/booru_gallery_model.js";

const selected = (source, postId) => ({ source, postId, mediaUrl: `https://media.test/${postId}.jpg`, previewUrl: `https://preview.test/${postId}.jpg`, originalTags: { copyright: ["series_a"], character: ["hero_(a)"], general: ["blue_hair"] } });

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
