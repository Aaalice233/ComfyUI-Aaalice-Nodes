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
