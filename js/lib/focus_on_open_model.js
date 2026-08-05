/** Pure workflow state for the single node that receives focus after opening. */

import { allGraphNodes } from "./graph_scope.js";

export const FOCUS_ON_OPEN_PROPERTY = "aaaliceFocusOnOpen";
export const FOCUS_ON_OPEN_VERSION = 1;
export const FOCUS_ON_OPEN_DEFAULT_ZOOM = 0.82;

const FOCUS_ON_OPEN_OFFSET_LIMIT = 100000;

export function defaultFocusOnOpenSettings() {
	return { offset: { x: 0, y: 0 }, zoom: FOCUS_ON_OPEN_DEFAULT_ZOOM };
}

export function normalizeFocusOnOpenOffset(value) {
	const normalizeAxis = (axis) => {
		const number = Number(axis ?? 0);
		if (!Number.isFinite(number)) throw new Error("Focus-on-open offset must be finite");
		return Math.max(-FOCUS_ON_OPEN_OFFSET_LIMIT, Math.min(FOCUS_ON_OPEN_OFFSET_LIMIT, Math.round(number)));
	};
	return { x: normalizeAxis(value?.x), y: normalizeAxis(value?.y) };
}

export function normalizeFocusOnOpenZoom(value) {
	if (value == null || value === "") return FOCUS_ON_OPEN_DEFAULT_ZOOM;
	const number = Number(value);
	if (!Number.isFinite(number)) throw new Error("Focus-on-open zoom must be finite");
	return Math.max(0.1, Math.min(3, Math.round(number * 100) / 100));
}

export function normalizeFocusOnOpenSettings(value) {
	return { offset: normalizeFocusOnOpenOffset(value?.offset), zoom: normalizeFocusOnOpenZoom(value?.zoom) };
}

function markerValue(value) {
	return value === true || (value && typeof value === "object" && value.version === FOCUS_ON_OPEN_VERSION);
}

function markerSettings(value) {
	if (!markerValue(value)) return null;
	try {
		return normalizeFocusOnOpenSettings(value);
	} catch {
		return defaultFocusOnOpenSettings();
	}
}

function markerMatches(value, settings) {
	if (!value || typeof value !== "object" || value.version !== FOCUS_ON_OPEN_VERSION || Object.keys(value).length !== 3) return false;
	if (!value.offset || Object.keys(value.offset).length !== 2) return false;
	const current = markerSettings(value);
	return current.offset.x === settings.offset.x
		&& current.offset.y === settings.offset.y
		&& current.zoom === settings.zoom;
}

function setMarker(node, settings = defaultFocusOnOpenSettings()) {
	if (!node.properties || typeof node.properties !== "object") node.properties = {};
	const normalized = normalizeFocusOnOpenSettings(settings);
	node.properties[FOCUS_ON_OPEN_PROPERTY] = { version: FOCUS_ON_OPEN_VERSION, ...normalized };
}

export function isFocusOnOpenMarked(node) {
	return markerValue(node?.properties?.[FOCUS_ON_OPEN_PROPERTY]);
}

export function focusOnOpenSettings(node) {
	return markerSettings(node?.properties?.[FOCUS_ON_OPEN_PROPERTY]) || defaultFocusOnOpenSettings();
}

export function isGraphNode(node) {
	const graph = node?.graph;
	if (!graph || typeof node !== "object") return false;
	return Boolean(graph._nodes?.includes?.(node) || graph.getNodeById?.(node.id) === node);
}

export function focusOnOpenMenuAction(node) {
	if (!isGraphNode(node)) return null;
	return isFocusOnOpenMarked(node) ? "clear" : "set";
}

export function focusOnOpenMarkedNodes(root) {
	return allGraphNodes(root).filter(isFocusOnOpenMarked);
}

export function focusOnOpenTarget(root) {
	return focusOnOpenMarkedNodes(root)[0] || null;
}

export function normalizeFocusOnOpenMarkers(root) {
	const marked = focusOnOpenMarkedNodes(root);
	const target = marked[0] || null;
	let changed = false;
	for (const node of marked.slice(1)) {
		delete node.properties[FOCUS_ON_OPEN_PROPERTY];
		changed = true;
	}
	return { target, changed };
}

export function setFocusOnOpenTarget(root, target) {
	const nodes = allGraphNodes(root);
	if (!target || !nodes.includes(target)) return { target: null, changed: false };
	const defaultSettings = defaultFocusOnOpenSettings();
	let changed = false;
	for (const node of nodes) {
		if (node === target) {
			const current = node.properties?.[FOCUS_ON_OPEN_PROPERTY];
			if (!markerMatches(current, defaultSettings)) {
				setMarker(node, defaultSettings);
				changed = true;
			}
			continue;
		}
		if (isFocusOnOpenMarked(node)) {
			delete node.properties[FOCUS_ON_OPEN_PROPERTY];
			changed = true;
		}
	}
	return { target, changed };
}

export function setFocusOnOpenSettings(root, target, settings) {
	const nodes = allGraphNodes(root);
	if (!target || !nodes.includes(target) || !isFocusOnOpenMarked(target)) return { target: null, changed: false };
	const normalized = normalizeFocusOnOpenSettings(settings);
	const current = focusOnOpenSettings(target);
	const changed = current.offset.x !== normalized.offset.x
		|| current.offset.y !== normalized.offset.y
		|| current.zoom !== normalized.zoom
		|| !markerMatches(target.properties?.[FOCUS_ON_OPEN_PROPERTY], normalized);
	if (changed) setMarker(target, normalized);
	return { target, changed };
}

export function clearFocusOnOpenTarget(root, target = null) {
	let changed = false;
	for (const node of allGraphNodes(root)) {
		if (target && node !== target && !isFocusOnOpenMarked(node)) continue;
		if (isFocusOnOpenMarked(node)) {
			delete node.properties[FOCUS_ON_OPEN_PROPERTY];
			changed = true;
		}
	}
	return { target: null, changed };
}

export function createFocusOnOpenScheduler({ schedule, cancel, run }) {
	let generation = 0;
	let pending = null;
	let scheduledRoot = null;
	let scheduledGeneration = -1;

	const cancelPending = () => {
		if (pending !== null) cancel?.(pending);
		pending = null;
		scheduledRoot = null;
		scheduledGeneration = -1;
	};

	return {
		beforeConfigure() {
			generation += 1;
			cancelPending();
		},
		afterConfigure(root, target) {
			if (!root || (scheduledGeneration === generation && scheduledRoot === root)) return false;
			if (pending !== null) cancel?.(pending);
			pending = null;
			scheduledRoot = root;
			scheduledGeneration = generation;
			if (!target) return true;
			pending = schedule(() => {
				pending = null;
				if (scheduledGeneration !== generation || scheduledRoot !== root) return;
				run?.(target, root, generation);
			});
			return true;
		},
		cancelPending,
		get generation() { return generation; },
	};
}
