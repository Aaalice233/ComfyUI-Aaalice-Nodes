/** Dashboard preset codec for workflow-owned Gallery state plus Dashboard projection state. */

import { GALLERY_CATEGORIES, GALLERY_STATE_VERSION, normalizeGallerySelection, normalizeGalleryState } from "./booru_gallery_model.js";

export const BOORU_GALLERY_PRESET_VERSION = 1;

function normalizedSnapshot(state, settings = {}) {
	return structuredClone(normalizeGalleryState(state, settings));
}

function snapshotWithLegacyComponent(state, componentState, settings = {}) {
	const snapshot = normalizedSnapshot(state, settings);
	if (componentState && Object.prototype.hasOwnProperty.call(componentState, "searchOpen")) {
		snapshot.dashboard.searchOpen = Boolean(componentState.searchOpen);
	}
	return snapshot;
}

function validObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function validGalleryState(value) {
	if (!validObject(value) || value.version !== GALLERY_STATE_VERSION) return false;
	if (!["danbooru", "gelbooru", "safebooru", "aitag"].includes(value.source)) return false;
	if (typeof value.query !== "string" || !["browse", "selected"].includes(value.view)) return false;
	if (!["single", "multi"].includes(value.selectionMode) || typeof value.randomMode !== "boolean") return false;
	if (!validObject(value.filters) || !Array.isArray(value.filters.ratings) || !value.filters.ratings.every((item) => typeof item === "string")) return false;
	if (typeof value.filters.sort !== "string" || !["search", "ranking", "favorites"].includes(value.filters.feed) || typeof value.filters.period !== "string") return false;
	if (!validObject(value.navigation) || !Number.isInteger(value.navigation.page) || value.navigation.page < 1) return false;
	if (value.dashboard != null && (!validObject(value.dashboard) || typeof value.dashboard.searchOpen !== "boolean")) return false;
	if (!validObject(value.prompt) || !Array.isArray(value.prompt.categories) || !value.prompt.categories.every((item) => GALLERY_CATEGORIES.includes(item))) return false;
	if (typeof value.prompt.replaceUnderscores !== "boolean" || typeof value.prompt.escapeParentheses !== "boolean") return false;
	return Array.isArray(value.selections) && value.selections.every((item) => Boolean(normalizeGallerySelection(item)));
}

export function createBooruGalleryPreset(state, settings = {}, componentState = null) {
	return {
		version: BOORU_GALLERY_PRESET_VERSION,
		state: snapshotWithLegacyComponent(state, componentState, settings),
	};
}

export function validateBooruGalleryPreset(value, settings = {}) {
	if (!validObject(value) || value.version !== BOORU_GALLERY_PRESET_VERSION) return "invalid-gallery-preset-version";
	if (!validGalleryState(value.state)) return "invalid-gallery-preset-state";
	if (value.component != null && (!validObject(value.component) || typeof value.component.searchOpen !== "boolean")) return "invalid-gallery-preset-component";
	try { snapshotWithLegacyComponent(value.state, value.component, settings); }
	catch { return "invalid-gallery-preset-state"; }
	return true;
}

export function decodeBooruGalleryPreset(value, settings = {}) {
	const validation = validateBooruGalleryPreset(value, settings);
	if (validation !== true) throw new TypeError(validation);
	return { state: snapshotWithLegacyComponent(value.state, value.component, settings) };
}
