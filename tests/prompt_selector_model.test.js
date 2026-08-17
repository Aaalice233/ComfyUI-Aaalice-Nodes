import test from "node:test";
import assert from "node:assert/strict";

import { clearPromptSelections, countPromptSelectionsByCategory, materializePromptPayload, normalizePromptSelectorState, resolvePromptSelections, setPromptWeight, togglePromptSelection } from "../js/lib/prompt_selector_model.js";

test("prompt selector supports cross-category selection and node-local order", () => {
	let state = normalizePromptSelectorState(null);
	state = togglePromptSelection(state, "appearance:red", true);
	state = togglePromptSelection(state, "pose:standing", true);
	assert.deepEqual(state.selections.map((item) => item.entryId), ["appearance:red", "pose:standing"]);
});

test("weights normalize and missing entries stay explicit", () => {
	let state = normalizePromptSelectorState({ selections: [{ entryId: "a", weight: 99 }, { entryId: "a", weight: 1 }] });
	assert.deepEqual(state.selections, [{ entryId: "a", weight: 20 }]);
	state = setPromptWeight(state, "a", 1.25);
	const resolved = resolvePromptSelections(state, []);
	assert.equal(resolved[0].missing, true);
	assert.deepEqual(materializePromptPayload(state, []).selections[0], { entryId: "a", weight: 1.25 });
});

test("materialized payload includes current library text rather than a node snapshot", () => {
	const state = { selections: [{ entryId: "a", weight: 1 }], separator: ", " };
	assert.equal(materializePromptPayload(state, [{ id: "a", text: "new text" }]).selections[0].text, "new text");
});

test("clear selection removes every node-local choice", () => {
	const state = clearPromptSelections({ selections: [
		{ entryId: "a", weight: 1.5 }, { entryId: "b", weight: 0.8 },
	], separator: " | " });
	assert.deepEqual(state, { version: 1, selections: [], separator: " | " });
});

test("category selection counts retain uncategorized entries and ignore missing entries", () => {
	const state = normalizePromptSelectorState({ selections: [
		{ entryId: "a", weight: 1 }, { entryId: "b", weight: 1 }, { entryId: "missing", weight: 1 },
	] });
	const counts = countPromptSelectionsByCategory(state, [
		{ id: "a", categoryId: "people" }, { id: "b", categoryId: null }, { id: "c", categoryId: "people" },
	]);
	assert.deepEqual([...counts], [["people", 1], [null, 1]]);
});
