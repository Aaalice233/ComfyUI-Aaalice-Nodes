/** Adds a single, workflow-persistent focus target to every LiteGraph node. */

import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { allGraphNodes, graphPath, rootGraph } from "./lib/graph_scope.js";
import {
	clearFocusOnOpenTarget,
	createFocusOnOpenScheduler,
	focusOnOpenMarkedNodes,
	focusOnOpenMenuAction,
	focusOnOpenTarget,
	isFocusOnOpenMarked,
	normalizeFocusOnOpenMarkers,
	setFocusOnOpenTarget,
} from "./lib/focus_on_open_model.js";
import { createTooltip, el, icon, isolate } from "./lib/ui.js";

const CLASSIC_WIDGET_NAME = "aaalice_focus_on_open";
const CLASSIC_WIDGETS = new Map();
const MARKER_TOOLTIP = createTooltip({ delay: 220 });

let activeRoot = null;
let vueMount = null;
let vueObserver = null;
let vueFrame = 0;
const focusScheduler = createFocusOnOpenScheduler({
	schedule: (callback) => requestAnimationFrame(callback),
	cancel: (handle) => cancelAnimationFrame(handle),
	run: (target, root, generation) => focusTarget(target, root, generation),
});

function currentRoot() {
	return rootGraph(app.canvas?.graph || (app.isGraphReady ? app.rootGraph : null));
}

function isNodes2Mode() {
	const liteGraphMode = globalThis.LiteGraph?.vueNodesMode;
	if (typeof liteGraphMode === "boolean") return liteGraphMode;
	const canvasMode = app.canvas?.vueNodesMode;
	if (typeof canvasMode === "boolean") return canvasMode;
	if (typeof document === "undefined") return false;
	return Boolean(document.querySelector('[data-testid="node-widgets"]'));
}

function markerAriaLabel() {
	return t("aaalice.focusOnOpen.aria.cancel", "Cancel focus on open");
}

function markerTooltip() {
	return t("aaalice.focusOnOpen.tooltip.cancel", "Cancel focus on open");
}

function updateMarkerLabel(button) {
	button.setAttribute("aria-label", markerAriaLabel());
	button.setAttribute("title", markerTooltip());
}

function makeMarkerButton(node) {
	const button = el("button", {
		className: "aa-focus-on-open__button",
		attrs: { type: "button", "aria-label": markerAriaLabel(), title: markerTooltip() },
		children: [
			icon("eye", { className: "aa-focus-on-open__eye", label: null }),
			icon("eyeOff", { className: "aa-focus-on-open__eye-off", label: null }),
		],
	});
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (isFocusOnOpenMarked(node)) updateFocusTarget(node, "clear");
	});
	button.addEventListener("keydown", (event) => event.stopPropagation());
	const showTooltip = (immediate) => MARKER_TOOLTIP.show(button, markerTooltip, { immediate });
	const hideTooltip = () => MARKER_TOOLTIP.scheduleHide();
	button.addEventListener("mouseenter", () => showTooltip(false));
	button.addEventListener("mouseleave", hideTooltip);
	button.addEventListener("focus", () => showTooltip(true));
	button.addEventListener("blur", hideTooltip);
	return {
		button,
		dispose() {
			if (MARKER_TOOLTIP.isOpenFor(button)) MARKER_TOOLTIP.hide();
			button.replaceChildren();
		},
	};
}

function positionClassicMarker(node, entry) {
	if (!entry?.root || !entry.widget) return;
	const width = Number(node.size?.[0]);
	const height = Number(node.size?.[1]);
	const y = Number(entry.widget.y ?? entry.widget.last_y ?? 0);
	if (Number.isFinite(width) && width > 0) entry.root.style.width = `${width}px`;
	if (Number.isFinite(height) && height > 0) entry.root.style.height = `${height}px`;
	entry.root.style.top = `${-Math.max(0, y)}px`;
}

function mountClassicMarker(node) {
	if (CLASSIC_WIDGETS.has(node)) return;
	const buttonView = makeMarkerButton(node);
	const root = isolate(el("div", { className: "aa-focus-on-open__classic-root", children: [buttonView.button] }));
	const entry = { root, button: buttonView.button, dispose: buttonView.dispose, widget: null };
	const widget = addLifecycleDOMWidget(node, CLASSIC_WIDGET_NAME, "custom", root, {
		serialize: false,
		canvasOnly: true,
		hideOnZoom: true,
		margin: 0,
		getMinHeight: () => 0,
		getMaxHeight: () => 0,
		getHeight: () => 0,
		getValue: () => "",
		setValue: () => {},
		afterResize: () => positionClassicMarker(node, entry),
	});
	entry.widget = widget;
	widget.computedHeight = 0;
	widget.height = 0;
	widget.onRemove = () => {
		entry.dispose();
		entry.root.remove();
		if (CLASSIC_WIDGETS.get(node)?.widget === widget) CLASSIC_WIDGETS.delete(node);
	};
	CLASSIC_WIDGETS.set(node, entry);
	positionClassicMarker(node, entry);
	node.setDirtyCanvas?.(true, true);
}

function unmountClassicMarker(node) {
	const entry = CLASSIC_WIDGETS.get(node);
	if (!entry) return;
	CLASSIC_WIDGETS.delete(node);
	if (node.widgets?.includes?.(entry.widget)) node.removeWidget?.(entry.widget);
	else entry.dispose();
	entry.root.remove();
	node.setDirtyCanvas?.(true, true);
}

function syncClassicMarkers(root) {
	const nodes2 = isNodes2Mode();
	const marked = new Set(nodes2 ? [] : focusOnOpenMarkedNodes(root));
	for (const node of [...CLASSIC_WIDGETS.keys()]) {
		if (nodes2 || !marked.has(node)) unmountClassicMarker(node);
	}
	if (nodes2) return;
	for (const node of marked) mountClassicMarker(node);
}

function cssEscape(value) {
	if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);
	return value.replace(/(["\\\s])/g, "\\$1");
}

function nodeElement(node) {
	if (typeof document === "undefined" || node?.id == null) return null;
	return document.querySelector(`[data-node-id="${cssEscape(String(node.id))}"]`);
}

function disposeVueMount() {
	if (!vueMount) return;
	vueMount.buttonView.dispose();
	vueMount.root.remove();
	vueMount = null;
}

function syncVueMount() {
	vueFrame = 0;
	const target = focusOnOpenTarget(activeRoot);
	if (!target || !isNodes2Mode() || app.canvas?.graph !== target.graph) {
		disposeVueMount();
		return;
	}
	const targetElement = nodeElement(target);
	if (!targetElement) {
		disposeVueMount();
		return;
	}
	if (vueMount?.node === target && vueMount.nodeElement === targetElement && targetElement.contains(vueMount.root)) {
		updateMarkerLabel(vueMount.buttonView.button);
		return;
	}
	disposeVueMount();
	const buttonView = makeMarkerButton(target);
	const root = isolate(buttonView.button);
	targetElement.append(root);
	vueMount = { node: target, nodeElement: targetElement, root, buttonView };
}

function scheduleVueSync() {
	if (vueFrame || typeof requestAnimationFrame !== "function") return;
	vueFrame = requestAnimationFrame(syncVueMount);
}

function mutationTouchesNode(record) {
	const target = focusOnOpenTarget(activeRoot);
	if (!target || target.id == null) return false;
	const id = String(target.id);
	if (record.target?.getAttribute?.("data-node-id") === id) return true;
	for (const added of record.addedNodes || []) {
		if (added.nodeType === 1 && added.getAttribute?.("data-node-id") === id) return true;
	}
	for (const removed of record.removedNodes || []) {
		if (removed.nodeType === 1 && removed.getAttribute?.("data-node-id") === id) return true;
	}
	return false;
}

function ensureVueObserver() {
	if (vueObserver || typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.body || !isNodes2Mode()) return;
	vueObserver = new MutationObserver((records) => {
		if (records.some(mutationTouchesNode)) scheduleVueSync();
	});
	vueObserver.observe(document.body, { childList: true, subtree: true });
}

function syncVisuals(root) {
	activeRoot = root;
	syncClassicMarkers(root);
	const nodes2 = isNodes2Mode();
	if (nodes2) ensureVueObserver();
	else {
		vueObserver?.disconnect();
		vueObserver = null;
		disposeVueMount();
	}
	scheduleVueSync();
}

function commitRoot(root, mutate) {
	let result;
	root?.beforeChange?.();
	try {
		result = mutate();
	} finally {
		root?.afterChange?.();
		root?.change?.();
		root?.setDirtyCanvas?.(true, true);
	}
	return result;
}

function updateFocusTarget(node, action) {
	const root = rootGraph(node?.graph);
	if (!root) return;
	const result = commitRoot(root, () => action === "clear"
		? clearFocusOnOpenTarget(root, node)
		: setFocusOnOpenTarget(root, node));
	syncVisuals(root);
	return result;
}

function normalizeLoadedMarkers(root) {
	if (focusOnOpenMarkedNodes(root).length <= 1) return { target: focusOnOpenTarget(root), changed: false };
	return commitRoot(root, () => normalizeFocusOnOpenMarkers(root));
}

function focusTarget(target, root, generation) {
	if (generation !== focusScheduler.generation || !isFocusOnOpenMarked(target) || rootGraph(target.graph) !== root) return;
	const canvas = app.canvas;
	if (!canvas || !target.graph) return;
	if (canvas.graph !== root) canvas.setGraph?.(root);
	const path = graphPath(target.graph);
	if (!path || canvas.graph !== root) return;
	for (const wrapper of path) {
		if (canvas.graph !== wrapper.graph || !wrapper.subgraph) return;
		canvas.openSubgraph?.(wrapper.subgraph, wrapper);
	}
	if (canvas.graph === target.graph) {
		canvas.centerOnNode?.(target);
		scheduleVueSync();
	}
}

function scheduleFocus(root, target) {
	focusScheduler.afterConfigure(root, target);
}

function refreshMarkerLabels() {
	for (const entry of CLASSIC_WIDGETS.values()) updateMarkerLabel(entry.button);
	if (vueMount) updateMarkerLabel(vueMount.buttonView.button);
}

function syncNodeLifecycle(node) {
	const root = rootGraph(node?.graph);
	if (!root) return;
	if (focusOnOpenMarkedNodes(root).length > 1) {
		normalizeLoadedMarkers(root);
		syncVisuals(root);
		return;
	}
	const nodes2 = isNodes2Mode();
	if (nodes2) ensureVueObserver();
	else if (isFocusOnOpenMarked(node)) mountClassicMarker(node);
}

app.registerExtension({
	name: "ComfyUI.Aaalice.FocusOnOpen",
	getNodeMenuItems(node) {
		const action = focusOnOpenMenuAction(node);
		if (!action) return [];
		const label = t(
			action === "set" ? "aaalice.focusOnOpen.menu.set" : "aaalice.focusOnOpen.menu.clear",
			action === "set" ? "👁️ Focus on open" : "🚫 Cancel focus on open",
		);
		return [{ content: label, callback: () => updateFocusTarget(node, focusOnOpenMenuAction(node)) }];
	},
	nodeCreated(node) {
		syncNodeLifecycle(node);
	},
	loadedGraphNode(node) {
		syncNodeLifecycle(node);
	},
	nodeRemoved(node) {
		focusScheduler.cancelPending();
		unmountClassicMarker(node);
		if (vueMount?.node === node) disposeVueMount();
		scheduleVueSync();
	},
	beforeConfigureGraph() {
		focusScheduler.beforeConfigure();
		activeRoot = null;
		disposeVueMount();
	},
	afterConfigureGraph() {
		const root = currentRoot();
		if (!root) return;
		const normalized = normalizeLoadedMarkers(root);
		syncVisuals(root);
		scheduleFocus(root, normalized.target);
	},
	async setup() {
		if (isNodes2Mode()) ensureVueObserver();
		syncVisuals(currentRoot());
		await ensureI18nReady();
		refreshMarkerLabels();
	},
});
