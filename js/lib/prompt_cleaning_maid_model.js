/** Pure persisted state and prompt payload for PromptCleaningMaid. */

export const PROMPT_CLEANING_STATE_VERSION = 1;
export const PROMPT_MODE = Object.freeze({ OFF: "off", NATURAL_LANGUAGE: "natural_language", TAG_LIST: "tag_list" });

export const DEFAULT_PROMPT_CLEANING_STATE = Object.freeze({
	version: PROMPT_CLEANING_STATE_VERSION,
	mode: PROMPT_MODE.NATURAL_LANGUAGE,
	settings: Object.freeze({
		naturalLanguage: Object.freeze({
			trimOuterWhitespace: true,
			trimLineEndWhitespace: true,
			collapseBlankLines: false,
		}),
		tagList: Object.freeze({
			trimTagWhitespace: true,
			removeEmptyTags: true,
			deduplicateTags: true,
			ignoreCase: true,
			underscoreEqualsSpace: true,
		}),
	}),
});

function booleanSettings(raw, defaults) {
	const result = {};
	for (const [key, fallback] of Object.entries(defaults)) result[key] = typeof raw?.[key] === "boolean" ? raw[key] : fallback;
	return result;
}

export function normalizePromptCleaningState(raw) {
	const modes = Object.values(PROMPT_MODE);
	return {
		version: PROMPT_CLEANING_STATE_VERSION,
		mode: modes.includes(raw?.mode) ? raw.mode : PROMPT_MODE.NATURAL_LANGUAGE,
		settings: {
			naturalLanguage: booleanSettings(raw?.settings?.naturalLanguage, DEFAULT_PROMPT_CLEANING_STATE.settings.naturalLanguage),
			tagList: booleanSettings(raw?.settings?.tagList, DEFAULT_PROMPT_CLEANING_STATE.settings.tagList),
		},
	};
}

export function promptCleaningPayload(raw) {
	return normalizePromptCleaningState(raw);
}

export function modeSettingsKey(mode) {
	return mode === PROMPT_MODE.TAG_LIST ? "tagList" : "naturalLanguage";
}

export function resetPromptCleaningMode(raw, mode = raw?.mode) {
	const state = normalizePromptCleaningState(raw);
	const key = modeSettingsKey(mode);
	state.settings[key] = { ...DEFAULT_PROMPT_CLEANING_STATE.settings[key] };
	return state;
}

export function hasCustomPromptCleaningSettings(raw) {
	const state = normalizePromptCleaningState(raw);
	for (const key of ["naturalLanguage", "tagList"]) {
		for (const [name, fallback] of Object.entries(DEFAULT_PROMPT_CLEANING_STATE.settings[key])) {
			if (state.settings[key][name] !== fallback) return true;
		}
	}
	return false;
}
