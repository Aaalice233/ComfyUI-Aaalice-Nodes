/** Pure workflow state for the single node that receives focus after opening. */

import { allGraphNodes } from "./graph_scope.js";

export const FOCUS_ON_OPEN_PROPERTY = "aaaliceFocusOnOpen";
export const FOCUS_ON_OPEN_VERSION = 1;

function markerValue(value) {
	return value === true || (value && typeof value === "object" && value.version === FOCUS_ON_OPEN_VERSION);
}

function setMarker(node) {
	if (!node.properties || typeof node.properties !== "object") node.properties = {};
	node.properties[FOCUS_ON_OPEN_PROPERTY] = { version: FOCUS_ON_OPEN_VERSION };
}

export function isFocusOnOpenMarked(node) {
	return markerValue(node?.properties?.[FOCUS_ON_OPEN_PROPERTY]);
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
	let changed = false;
	for (const node of nodes) {
		if (node === target) {
			const current = node.properties?.[FOCUS_ON_OPEN_PROPERTY];
			if (!markerValue(current) || current === true || current.version !== FOCUS_ON_OPEN_VERSION || Object.keys(current).length !== 1) {
				setMarker(node);
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
