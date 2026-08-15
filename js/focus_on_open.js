/** Adds a single, workflow-persistent focus target to every LiteGraph node. */

import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	classicFocusMarkerCanvasRect,
	hasClassicFocusMarker,
	mountClassicFocusMarker,
	unmountClassicFocusMarker,
} from "./lib/focus_on_open_classic_marker.js";
import { graphPath, rootGraph } from "./lib/graph_scope.js";
import {
	clearFocusOnOpenTarget,
	createFocusOnOpenScheduler,
	focusOnOpenMarkedNodes,
	focusOnOpenMenuAction,
	focusOnOpenSettings,
	focusOnOpenTarget,
	isFocusOnOpenMarked,
	normalizeFocusOnOpenMarkers,
	normalizeFocusOnOpenSettings,
	setFocusOnOpenSettings,
	setFocusOnOpenTarget,
} from "./lib/focus_on_open_model.js";
import { button, createAnchoredPopover, createTooltip, el, field, icon, isolate } from "./lib/ui.js";

const CLASSIC_MARKER_NODES = new Set();
const MARKER_TOOLTIP = createTooltip({ delay: 220 });

let activeRoot = null;
let vueMount = null;
let vueObserver = null;
let vueFrame = 0;
let focusSettingsPopover = null;
let focusSettingsNode = null;
let focusSettingsFrame = 0;
let focusSettingsVirtualAnchor = null;
const focusScheduler = createFocusOnOpenScheduler({
	schedule: (callback) => requestAnimationFrame(callback),
	cancel: (handle) => cancelAnimationFrame(handle),
	run: (target, root, generation) => focusTarget(target, root, generation),
});

// 撤销/重做是 changeTracker 唯一以 clean === false && restore_view === false
// 调用 loadGraphData 的路径；官方 before/afterConfigureGraph 不携带该上下文，
// 只能在这一公共入口标记，让历史恢复跳过自动聚焦而保留标记视觉同步。
let historyRestoreActive = false;
let suppressFocusOnConfigure = false;
const LOAD_GRAPH_WRAP_MARK = "aaaliceFocusOnOpenHistoryDetection";

function installHistoryRestoreDetection() {
	const original = app.loadGraphData;
	if (typeof original !== "function" || original[LOAD_GRAPH_WRAP_MARK]) return;
	const wrapped = async function (graphData, clean, restore_view, ...rest) {
		const isHistoryRestore = clean === false && restore_view === false;
		if (isHistoryRestore) historyRestoreActive = true;
		try {
			return await original.call(this, graphData, clean, restore_view, ...rest);
		} finally {
			if (isHistoryRestore) historyRestoreActive = false;
		}
	};
	wrapped[LOAD_GRAPH_WRAP_MARK] = true;
	app.loadGraphData = wrapped;
}

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
			el("span", { className: "aa-focus-on-open__emoji", attrs: { "aria-hidden": "true" }, text: "🎯" }),
			el("span", { className: "aa-focus-on-open__cancel-emoji", attrs: { "aria-hidden": "true" }, text: "🚫" }),
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

function activateClassicMarker(node) {
	if (isFocusOnOpenMarked(node)) updateFocusTarget(node, "clear");
}

function mountClassicMarker(node) {
	const wasMounted = hasClassicFocusMarker(node);
	const marker = mountClassicFocusMarker(node, () => activateClassicMarker(node));
	if (!marker) return;
	CLASSIC_MARKER_NODES.add(node);
	if (!wasMounted) node.setDirtyCanvas?.(true, true);
}

function unmountClassicMarker(node) {
	CLASSIC_MARKER_NODES.delete(node);
	if (unmountClassicFocusMarker(node)) node.setDirtyCanvas?.(true, true);
}

function syncClassicMarkers(root) {
	const nodes2 = isNodes2Mode();
	const marked = new Set(nodes2 ? [] : focusOnOpenMarkedNodes(root));
	for (const node of [...CLASSIC_MARKER_NODES]) {
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
	closeFocusSettingsPopover();
	const root = rootGraph(node?.graph);
	if (!root) return;
	const result = commitRoot(root, () => action === "clear"
		? clearFocusOnOpenTarget(root, node)
		: setFocusOnOpenTarget(root, node));
	syncVisuals(root);
	return result;
}

function updateFocusOnOpenSettings(node, settings) {
	const root = rootGraph(node?.graph);
	if (!root) return;
	const normalized = normalizeFocusOnOpenSettings(settings);
	const result = commitRoot(root, () => setFocusOnOpenSettings(root, node, normalized));
	syncVisuals(root);
	return result;
}

function removeFocusSettingsVirtualAnchor() {
	focusSettingsVirtualAnchor?.remove();
	focusSettingsVirtualAnchor = null;
}

function classicFocusSettingsAnchor(node) {
	const canvas = app.canvas;
	const canvasElement = canvas?.canvas;
	if (!hasClassicFocusMarker(node) || canvas?.graph !== node.graph || !(canvasElement instanceof HTMLElement)) return null;
	const markerRect = classicFocusMarkerCanvasRect(node, canvas, globalThis.LiteGraph?.NODE_TITLE_HEIGHT);
	if (!markerRect) return null;
	const canvasRect = canvasElement.getBoundingClientRect();
	const anchor = el("span", { attrs: { "aria-hidden": "true" } });
	Object.assign(anchor.style, {
		position: "fixed",
		left: `${canvasRect.left + markerRect.left}px`,
		top: `${canvasRect.top + markerRect.top}px`,
		width: `${Math.max(1, markerRect.width)}px`,
		height: `${Math.max(1, markerRect.height)}px`,
		pointerEvents: "none",
		opacity: "0",
	});
	document.body.append(anchor);
	focusSettingsVirtualAnchor = anchor;
	return anchor;
}

function focusSettingsAnchor(node) {
	if (!isNodes2Mode()) return classicFocusSettingsAnchor(node);
	if (vueMount?.node === node && vueMount.buttonView.button.isConnected) return vueMount.buttonView.button;
	return nodeElement(node);
}

function closeFocusSettingsPopover() {
	if (focusSettingsFrame) {
		cancelAnimationFrame(focusSettingsFrame);
		focusSettingsFrame = 0;
	}
	focusSettingsPopover?.close();
	focusSettingsPopover = null;
	focusSettingsNode = null;
	removeFocusSettingsVirtualAnchor();
}

function openFocusOnOpenSettings(node) {
	if (!isFocusOnOpenMarked(node)) return false;
	closeFocusSettingsPopover();
	const anchor = focusSettingsAnchor(node);
	if (!anchor) return false;
	const settings = focusOnOpenSettings(node);
	const offsetX = el("input", { attrs: { type: "number", min: "-100000", max: "100000", step: "50", value: settings.offset.x, "aria-label": t("aaalice.focusOnOpen.settings.offsetX", "X offset") } });
	const offsetY = el("input", { attrs: { type: "number", min: "-100000", max: "100000", step: "50", value: settings.offset.y, "aria-label": t("aaalice.focusOnOpen.settings.offsetY", "Y offset") } });
	const zoom = el("input", { attrs: { type: "number", min: "10", max: "300", step: "5", value: Math.round(settings.zoom * 100), "aria-label": t("aaalice.focusOnOpen.settings.zoom", "Zoom (%)") } });
	const error = el("div", { className: "aa-focus-on-open-settings__error", attrs: { role: "alert", hidden: true } });
	const setError = (message = "") => {
		error.textContent = message;
		error.hidden = !message;
	};
	let popup = null;
	const save = button({ label: t("aaalice.common.save", "Save"), onClick: () => {
		try {
			updateFocusOnOpenSettings(node, { offset: { x: offsetX.value, y: offsetY.value }, zoom: zoom.value === "" ? null : Number(zoom.value) / 100 });
			popup.close();
		} catch {
			setError(t("aaalice.focusOnOpen.settings.invalid", "Enter valid numeric values."));
		}
	} });
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => popup.close() });
	popup = createAnchoredPopover({
		anchor,
		ariaLabel: t("aaalice.focusOnOpen.settings.aria", "Focus-on-open view settings"),
		className: "aa-focus-on-open-settings-popover",
		width: 310,
		onClose: () => {
			if (focusSettingsVirtualAnchor === anchor) removeFocusSettingsVirtualAnchor();
			if (focusSettingsPopover !== popup) return;
			focusSettingsPopover = null;
			focusSettingsNode = null;
		},
	});
	focusSettingsPopover = popup;
	focusSettingsNode = node;
	const fields = el("div", { className: "aa-focus-on-open-settings__fields", children: [
		field({ label: t("aaalice.focusOnOpen.settings.offsetX", "X offset"), control: offsetX }),
		field({ label: t("aaalice.focusOnOpen.settings.offsetY", "Y offset"), control: offsetY }),
		field({ label: t("aaalice.focusOnOpen.settings.zoom", "Zoom (%)"), control: zoom }),
	] });
	const header = el("header", { className: "aa-focus-on-open-settings__header", children: [icon("fit"), el("strong", null, t("aaalice.focusOnOpen.settings.title", "Focus view"))] });
	const footer = el("footer", { className: "aa-focus-on-open-settings__footer", children: [cancel, save] });
	popup.root.append(header, fields, error, footer);
	popup.reposition();
	return true;
}

function scheduleFocusOnOpenSettings(node, attempt = 0) {
	closeFocusSettingsPopover();
	const open = () => {
		focusSettingsFrame = 0;
		if (!isFocusOnOpenMarked(node)) return;
		if (openFocusOnOpenSettings(node)) return;
		if (attempt < 3) scheduleFocusOnOpenSettings(node, attempt + 1);
	};
	if (typeof requestAnimationFrame === "function") focusSettingsFrame = requestAnimationFrame(open);
	else open();
}

function normalizeLoadedMarkers(root) {
	if (focusOnOpenMarkedNodes(root).length <= 1) return { target: focusOnOpenTarget(root), changed: false };
	return commitRoot(root, () => normalizeFocusOnOpenMarkers(root));
}

function focusBounds(node, settings) {
	const pos = node?.pos;
	const size = node?.size;
	if (!pos || !size || pos.length < 2 || size.length < 2) return null;
	const values = [Number(pos[0]), Number(pos[1]), Number(size[0]), Number(size[1])];
	if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
	return [values[0] + settings.offset.x, values[1] + settings.offset.y, values[2], values[3]];
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
		const settings = focusOnOpenSettings(target);
		const bounds = focusBounds(target, settings);
		if (bounds && typeof canvas.ds?.fitToBounds === "function") {
			canvas.ds.fitToBounds(bounds, { zoom: settings.zoom });
			canvas.setDirty?.(true, true);
		} else if (typeof canvas.centerOnNode === "function") {
			canvas.centerOnNode(bounds ? { pos: [bounds[0], bounds[1]], size: [bounds[2], bounds[3]] } : target);
		}
		scheduleVueSync();
	}
}

function scheduleFocus(root, target) {
	focusScheduler.afterConfigure(root, target);
}

function refreshMarkerLabels() {
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
		if (action === "set") {
			return [{
				content: t("aaalice.focusOnOpen.menu.set", "👁️ Focus on open"),
				callback: () => {
					const result = updateFocusTarget(node, focusOnOpenMenuAction(node));
					if (result?.target) scheduleFocusOnOpenSettings(result.target);
				},
			}];
		}
		return [
			{ content: t("aaalice.focusOnOpen.menu.settings", "⚙️ Focus view settings"), callback: () => scheduleFocusOnOpenSettings(node) },
			{ content: t("aaalice.focusOnOpen.menu.clear", "🚫 Cancel focus on open"), callback: () => updateFocusTarget(node, focusOnOpenMenuAction(node)) },
		];
	},
	nodeCreated(node) {
		syncNodeLifecycle(node);
	},
	loadedGraphNode(node) {
		syncNodeLifecycle(node);
	},
	nodeRemoved(node) {
		focusScheduler.cancelPending();
		if (focusSettingsNode === node) closeFocusSettingsPopover();
		unmountClassicMarker(node);
		if (vueMount?.node === node) disposeVueMount();
		scheduleVueSync();
	},
	beforeConfigureGraph() {
		suppressFocusOnConfigure = historyRestoreActive;
		focusScheduler.beforeConfigure();
		closeFocusSettingsPopover();
		activeRoot = null;
		disposeVueMount();
	},
	afterConfigureGraph() {
		const root = currentRoot();
		const suppressFocus = suppressFocusOnConfigure;
		suppressFocusOnConfigure = false;
		if (!root) return;
		const normalized = normalizeLoadedMarkers(root);
		syncVisuals(root);
		scheduleFocus(root, suppressFocus ? null : normalized.target);
	},
	async setup() {
		installHistoryRestoreDetection();
		if (isNodes2Mode()) ensureVueObserver();
		syncVisuals(currentRoot());
		await ensureI18nReady();
		refreshMarkerLabels();
	},
});
