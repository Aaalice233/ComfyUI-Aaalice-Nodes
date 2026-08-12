import { emptyValueProfileState, normalizeValueProfileState } from "../lib/value_profiles.js";

const SIDEBAR_PIN_STORAGE_KEY = "aaalice.workspace.sidebarPinned";
const SIDEBAR_AUTO_SAVE_STORAGE_KEY = "aaalice.workspace.sidebarPresetAutoSave";

function loadBooleanPreference(key, fallback, description) {
	try {
		const stored = globalThis.localStorage?.getItem(key);
		if (stored === "true") return true;
		if (stored === "false") return false;
	} catch (error) {
		console.warn(`[Aaalice] Unable to read the ${description} preference`, error);
	}
	return fallback;
}

function saveBooleanPreference(key, value, description) {
	try {
		globalThis.localStorage?.setItem(key, String(value));
	} catch (error) {
		console.warn(`[Aaalice] Unable to save the ${description} preference`, error);
	}
}

export function loadSidebarPinned() { return loadBooleanPreference(SIDEBAR_PIN_STORAGE_KEY, true, "sidebar pin"); }
export function saveSidebarPinned(value) { saveBooleanPreference(SIDEBAR_PIN_STORAGE_KEY, value, "sidebar pin"); }
export function loadSidebarPresetAutoSave() { return loadBooleanPreference(SIDEBAR_AUTO_SAVE_STORAGE_KEY, true, "sidebar preset auto-save"); }
export function saveSidebarPresetAutoSave(value) { saveBooleanPreference(SIDEBAR_AUTO_SAVE_STORAGE_KEY, value, "sidebar preset auto-save"); }

const VALUE_PROFILES_STORAGE_KEY = "aaalice.workspace.valueProfiles";

export function loadValueProfiles() {
	try {
		const stored = globalThis.localStorage?.getItem(VALUE_PROFILES_STORAGE_KEY);
		return normalizeValueProfileState(stored ? JSON.parse(stored) : null);
	} catch (error) {
		console.warn("[Aaalice] Unable to read the value adjustment profiles", error);
		return emptyValueProfileState();
	}
}

export function saveValueProfiles(state) {
	try {
		if (!globalThis.localStorage) throw new Error("Browser local storage is unavailable.");
		globalThis.localStorage.setItem(VALUE_PROFILES_STORAGE_KEY, JSON.stringify(normalizeValueProfileState(state)));
	} catch (error) {
		console.warn("[Aaalice] Unable to save the value adjustment profiles", error);
		throw error;
	}
}
