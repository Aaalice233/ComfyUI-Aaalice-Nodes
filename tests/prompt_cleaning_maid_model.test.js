import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_PROMPT_CLEANING_STATE,
	PROMPT_MODE,
	hasCustomPromptCleaningSettings,
	normalizePromptCleaningState,
	promptCleaningPayload,
	resetPromptCleaningMode,
} from "../js/lib/prompt_cleaning_maid_model.js";

test("normalizes missing and invalid persisted state to safe defaults", () => {
	assert.deepEqual(normalizePromptCleaningState(null), DEFAULT_PROMPT_CLEANING_STATE);
	const state = normalizePromptCleaningState({ mode: "auto", settings: { tagList: { deduplicateTags: "yes", ignoreCase: false } } });
	assert.equal(state.mode, PROMPT_MODE.NATURAL_LANGUAGE);
	assert.equal(state.settings.tagList.deduplicateTags, true);
	assert.equal(state.settings.tagList.ignoreCase, false);
});

test("keeps natural-language and tag-list settings independent", () => {
	const state = normalizePromptCleaningState({ mode: PROMPT_MODE.TAG_LIST });
	state.settings.tagList.deduplicateTags = false;
	state.settings.naturalLanguage.collapseBlankLines = true;
	const reset = resetPromptCleaningMode(state, PROMPT_MODE.TAG_LIST);
	assert.equal(reset.settings.tagList.deduplicateTags, true);
	assert.equal(reset.settings.naturalLanguage.collapseBlankLines, true);
});

test("off mode preserves both cleaning configurations", () => {
	const state = normalizePromptCleaningState({
		mode: PROMPT_MODE.OFF,
		settings: { naturalLanguage: { collapseBlankLines: true }, tagList: { deduplicateTags: false } },
	});
	assert.equal(state.mode, PROMPT_MODE.OFF);
	assert.equal(state.settings.naturalLanguage.collapseBlankLines, true);
	assert.equal(state.settings.tagList.deduplicateTags, false);
	assert.equal(promptCleaningPayload(state).mode, PROMPT_MODE.OFF);
});

test("detects custom settings and emits normalized prompt payload", () => {
	assert.equal(hasCustomPromptCleaningSettings({}), false);
	const custom = { settings: { naturalLanguage: { collapseBlankLines: true } } };
	assert.equal(hasCustomPromptCleaningSettings(custom), true);
	assert.deepEqual(promptCleaningPayload(custom), normalizePromptCleaningState(custom));
});
