import assert from "node:assert/strict";
import test from "node:test";

import {
	ALIGNMENTS, BUILTIN_PRESETS, alignDimension, canvasDimensions, normalizeResolutionState,
	requiredCanvasMax, resolutionPayload, resolutionSummary, selectPreset, selectionFractions, updateDimensions,
} from "../js/lib/resolution_preset_model.js";

test("ships nine stable model-agnostic built-in presets", () => {
	assert.equal(BUILTIN_PRESETS.length, 9);
	assert.equal(new Set(BUILTIN_PRESETS.map((item) => item.id)).size, 9);
	assert.ok(BUILTIN_PRESETS.every((item) => item.width % 64 === 0 && item.height % 64 === 0));
});

test("normalizes workflow state to aligned dimensions and a fitting range", () => {
	const state = normalizeResolutionState({ version: 1, width: 3001, height: 1021, alignment: 16, canvasMax: 2048 });
	assert.deepEqual(state, { version: 1, width: 3008, height: 1024, alignment: 16, canvasMax: 4096, presetId: null });
	assert.deepEqual(resolutionPayload(state), { version: 1, width: 3008, height: 1024 });
});

test("aligns dimensions at midpoint boundaries and clamps to legal values", () => {
	assert.equal(alignDimension(1027, 8), 1024);
	assert.equal(alignDimension(1030, 8), 1032);
	assert.equal(alignDimension(1, 64), 64);
	assert.equal(requiredCanvasMax(2049, 1024), 4096);
});

test("maps the canvas independently for width height and corner handles", () => {
	const state = normalizeResolutionState(null);
	assert.deepEqual(canvasDimensions(state, 0.5, 0.25, "both"), { width: 1032, height: 528 });
	assert.deepEqual(canvasDimensions(state, 0.75, 0, "width"), { width: 1544, height: 1024 });
	assert.deepEqual(canvasDimensions(state, 0, 0.75, "height"), { width: 1024, height: 1544 });
	const fractions = selectionFractions(state);
	assert.ok(fractions.width > 0.49 && fractions.width < 0.51);
});

test("preset selection restores dimensions and alignment while manual edits clear identity", () => {
	const state = normalizeResolutionState({ version: 1, width: 1024, height: 1024, alignment: 64 });
	const selected = selectPreset(state, BUILTIN_PRESETS[2]);
	assert.equal(selected.presetId, BUILTIN_PRESETS[2].id);
	assert.equal(selected.alignment, 64);
	const edited = updateDimensions(selected, { width: 896 });
	assert.equal(edited.presetId, null);
	assert.equal(edited.width, 896);
	assert.ok(ALIGNMENTS.includes(edited.alignment));
});

test("summarizes exact ratio and megapixels without affecting execution", () => {
	assert.deepEqual(resolutionSummary(1024, 1024), { ratio: "1:1", megapixels: "1.00 MP" });
	assert.deepEqual(resolutionSummary(1536, 1024), { ratio: "3:2", megapixels: "1.50 MP" });
});
