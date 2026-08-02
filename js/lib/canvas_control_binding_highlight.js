import { app } from "../../../scripts/app.js";
import { controlItemBindings } from "./dashboard_model.js";

const DOM_BOUND_CLASS = "aaalice-sidebar-bound-widget";
const widgetMarkers = new WeakMap();
const activeWidgets = new Set();
const domStates = new Map();
const pendingDomStates = new Map();
let domMode = null;
let mountObserver = null;
let mountRefreshFrame = 0;
let canvasColor = null;

function canvasBindingColor() {
	if (canvasColor) return canvasColor;
	const promoted = globalThis.LiteGraph?.WIDGET_PROMOTED_OUTLINE_COLOR;
	if (typeof promoted === "string" && promoted.trim()) {
		canvasColor = promoted;
		return canvasColor;
	}
	if (typeof document !== "undefined") {
		const style = getComputedStyle(document.documentElement);
		for (const name of ["--p-primary-color", "--primary-color"]) {
			const value = style.getPropertyValue(name).trim();
			if (value) {
				canvasColor = value;
				return canvasColor;
			}
		}
	}
	canvasColor = "#0b8ce9";
	return canvasColor;
}

function restoreProperty(object, name, descriptor) {
	try {
		if (descriptor) Object.defineProperty(object, name, descriptor);
		else delete object[name];
	} catch {
		// An extension may replace the widget method while it is marked. Do not
		// overwrite that replacement during cleanup.
	}
}

function installProperty(object, name, value, state) {
	const descriptor = Object.getOwnPropertyDescriptor(object, name);
	try {
		Object.defineProperty(object, name, {
			configurable: true,
			enumerable: descriptor?.enumerable ?? false,
			writable: true,
			value,
		});
		state.properties.push({ name, descriptor, value });
		return true;
	} catch {
		return false;
	}
}

function drawFallbackOutline(ctx, width, y, height) {
	if (!ctx || !Number.isFinite(width) || !Number.isFinite(y) || !Number.isFinite(height) || height <= 0) return;
	const margin = 15;
	const outlineWidth = Math.max(0, width - margin * 2);
	ctx.save();
	ctx.strokeStyle = canvasBindingColor();
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	if (typeof ctx.roundRect === "function") ctx.roundRect(margin, y, outlineWidth, height, Math.min(6, height / 2));
	else ctx.rect(margin, y, outlineWidth, height);
	ctx.stroke();
	ctx.restore();
}

function installWidgetMarker(widget) {
	if (!widget || (typeof widget !== "object" && typeof widget !== "function")) return false;
	if (widgetMarkers.has(widget)) return true;
	const state = { properties: [] };
	let installed = false;

	if (typeof widget.getOutlineColor === "function") {
		const wrapper = function () { return canvasBindingColor(); };
		installed = installProperty(widget, "getOutlineColor", wrapper, state) || installed;
	}

	if (typeof widget.draw === "function") {
		const original = widget.draw;
		const wrapper = function (...args) {
			const result = original.apply(this, args);
			drawFallbackOutline(args[0], Number(args[2]), Number(args[3]), Number(args[4]));
			return result;
		};
		if (installProperty(widget, "draw", wrapper, state)) {
			installed = true;
		}
	} else if (typeof widget.drawWidget === "function" && typeof widget.getOutlineColor !== "function") {
		const original = widget.drawWidget;
		const wrapper = function (ctx, options = {}) {
			const result = original.apply(this, arguments);
			drawFallbackOutline(ctx, Number(options.width), Number(widget.y), Number(widget.computedHeight ?? widget.height));
			return result;
		};
		if (installProperty(widget, "drawWidget", wrapper, state)) {
			installed = true;
		}
	}

	if (!installed && "outline_color" in widget) {
		const value = canvasBindingColor();
		if (installProperty(widget, "outline_color", value, state)) installed = true;
	}
	if (!installed) return false;
	widgetMarkers.set(widget, state);
	activeWidgets.add(widget);
	return true;
}

function uninstallWidgetMarker(widget) {
	const state = widgetMarkers.get(widget);
	if (!state) return;
	for (let index = state.properties.length - 1; index >= 0; index--) {
		const entry = state.properties[index];
		if (widget[entry.name] === entry.value) restoreProperty(widget, entry.name, entry.descriptor);
	}
	widgetMarkers.delete(widget);
	activeWidgets.delete(widget);
}

function sameWidgetSet(left, right) {
	if (left.size !== right.size) return false;
	for (const widget of left) if (!right.has(widget)) return false;
	return true;
}

function isNodes2Mode() {
	if (domMode !== null) return domMode;
	if (globalThis.LiteGraph?.vueNodesMode === true || app.canvas?.vueNodesMode === true) {
		domMode = true;
		return domMode;
	}
	if (typeof document === "undefined") {
		domMode = false;
		return domMode;
	}
	domMode = Boolean(document.querySelector('[data-testid="node-widgets"]'));
	return domMode;
}

function cssEscape(value) {
	if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);
	return value.replace(/(["\\]|\s)/g, "\\$1");
}

function nodeElement(node) {
	if (typeof document === "undefined" || node?.id == null) return null;
	try {
		return document.querySelector(`[data-node-id="${cssEscape(String(node.id))}"]`);
	} catch {
		return null;
	}
}

function settingShowsAdvancedWidgets() {
	try {
		return Boolean(app.ui?.settings?.getSettingValue?.("Comfy.Node.AlwaysShowAdvancedWidgets"));
	} catch {
		return false;
	}
}

function visibleWidgetCandidates(node, showAdvanced) {
	const widgets = node?.widgets || [];
	return widgets.filter((widget) => {
		const options = widget?.options || {};
		if (!widget?.type || options.canvasOnly || options.hidden) return false;
		const advanced = Boolean(options.advanced ?? widget.advanced);
		return !advanced || showAdvanced || widget?.slotMetadata?.linked || widget?.linked;
	});
}

function widgetRows(container) {
	return [...(container?.children || [])].filter((child) => child.getAttribute?.("data-testid") === "node-widget");
}

function clearDomRows(state) {
	for (const row of state.rows) row.classList?.remove(DOM_BOUND_CLASS);
	state.rows.clear();
}

function applyDomRows(state) {
	const container = state.container;
	if (!container?.isConnected) return;
	const rows = widgetRows(container);
	const defaultCandidates = visibleWidgetCandidates(state.node, Boolean(state.node.showAdvanced || settingShowsAdvancedWidgets()));
	const allAdvancedCandidates = visibleWidgetCandidates(state.node, true);
	const candidates = [defaultCandidates, allAdvancedCandidates].find((list) => list.length === rows.length);
	clearDomRows(state);
	if (!candidates) return;
	for (const widget of state.widgets) {
		const index = candidates.indexOf(widget);
		const row = index >= 0 ? rows[index] : null;
		if (row) {
			row.classList.add(DOM_BOUND_CLASS);
			state.rows.add(row);
		}
	}
}

function disconnectDomState(state) {
	state.rootObserver?.disconnect();
	state.containerObserver?.disconnect();
	state.parentObserver?.disconnect();
	state.rootObserver = null;
	state.containerObserver = null;
	state.parentObserver = null;
	clearDomRows(state);
	state.root = null;
	state.container = null;
	state.parent = null;
}

function findContainer(state) {
	return state.root?.querySelector?.('[data-testid="node-widgets"]') || null;
}

function attachContainer(state, container) {
	state.containerObserver?.disconnect();
	state.parentObserver?.disconnect();
	state.container = container;
	state.parent = container?.parentElement || null;
	if (!container) return;
	state.containerObserver = new MutationObserver(() => applyDomRows(state));
	state.containerObserver.observe(container, { childList: true });
	if (state.parent) {
		state.parentObserver = new MutationObserver(() => {
			const next = findContainer(state);
			if (next !== state.container) {
				clearDomRows(state);
				attachContainer(state, next);
			}
		});
		state.parentObserver.observe(state.parent, { childList: true });
	}
	applyDomRows(state);
}

function attachRoot(state, root) {
	if (state.root === root && state.container?.isConnected) {
		applyDomRows(state);
		return;
	}
	disconnectDomState(state);
	state.root = root;
	state.rootObserver = new MutationObserver(() => {
		if (!state.root?.isConnected) {
			pendingDomStates.set(String(state.node.id), state);
			ensureMountObserver();
			return;
		}
		const next = findContainer(state);
		if (next !== state.container) attachContainer(state, next);
	});
	state.rootObserver.observe(root, { childList: true });
	attachContainer(state, findContainer(state));
}

function ensureMountObserver() {
	if (mountObserver || typeof document === "undefined" || !pendingDomStates.size || !document.body) return;
	mountObserver = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type !== "childList") continue;
			const addedRoot = [...record.addedNodes].some((node) => node.nodeType === 1 && node.getAttribute?.("data-node-id") != null);
			if (addedRoot) {
				scheduleMountRefresh();
				return;
			}
		}
	});
	mountObserver.observe(document.body, { childList: true, subtree: true });
}

function scheduleMountRefresh() {
	if (mountRefreshFrame) return;
	const callback = () => {
		mountRefreshFrame = 0;
		if (!pendingDomStates.size || typeof document === "undefined") return;
		const selector = [...pendingDomStates.keys()].map((id) => `[data-node-id="${cssEscape(id)}"]`).join(",");
		if (!selector) return;
		const roots = document.querySelectorAll(selector);
		for (const root of roots) {
			const state = pendingDomStates.get(root.getAttribute("data-node-id"));
			if (!state) continue;
			pendingDomStates.delete(String(state.node.id));
			attachRoot(state, root);
		}
		if (!pendingDomStates.size) {
			mountObserver?.disconnect();
			mountObserver = null;
		}
	};
	mountRefreshFrame = globalThis.requestAnimationFrame ? requestAnimationFrame(callback) : setTimeout(callback, 0);
}

function syncDomTargets(targetsByNode) {
	if (!isNodes2Mode()) {
		for (const state of domStates.values()) disconnectDomState(state);
		domStates.clear();
		pendingDomStates.clear();
		mountObserver?.disconnect();
		mountObserver = null;
		return;
	}
	for (const [node, state] of domStates) {
		if (targetsByNode.has(node)) continue;
		disconnectDomState(state);
		domStates.delete(node);
		pendingDomStates.delete(String(node.id));
	}
	for (const [node, widgets] of targetsByNode) {
		let state = domStates.get(node);
		if (!state) {
			state = { node, widgets: new Set(), rows: new Set(), root: null, container: null, parent: null };
			domStates.set(node, state);
		}
		if (!sameWidgetSet(state.widgets, widgets)) {
			state.widgets = new Set(widgets);
			clearDomRows(state);
		}
		const root = nodeElement(node);
		if (root) {
			pendingDomStates.delete(String(node.id));
			attachRoot(state, root);
		} else {
			pendingDomStates.set(String(node.id), state);
		}
	}
	if (pendingDomStates.size) ensureMountObserver();
}

export function syncCanvasControlBindings(model, resolve) {
	const targetsByNode = new Map();
	const nextWidgets = new Set();
	for (const page of model?.pages || []) {
		for (const item of page?.items || []) {
			if (item?.kind !== "control") continue;
			for (const binding of controlItemBindings(item)) {
				if (!binding || !["generic-widget", "subgraph-widget"].includes(binding.provider)) continue;
				let resolved;
				try { resolved = resolve(binding); } catch (error) {
					console.error("[Aaalice] Unable to resolve a bound canvas control", binding, error);
					continue;
				}
				if (resolved?.status !== "ok") continue;
				const widget = resolved.widget || (resolved.node?.widgets || []).find((candidate) => candidate === resolved.control);
				if (!resolved.node || !widget) continue;
				let widgets = targetsByNode.get(resolved.node);
				if (!widgets) { widgets = new Set(); targetsByNode.set(resolved.node, widgets); }
				widgets.add(widget);
				nextWidgets.add(widget);
			}
		}
	}
	for (const widget of activeWidgets) if (!nextWidgets.has(widget)) uninstallWidgetMarker(widget);
	for (const widget of nextWidgets) installWidgetMarker(widget);
	syncDomTargets(targetsByNode);
}

export function resetCanvasControlBindingHighlight() {
	for (const widget of [...activeWidgets]) uninstallWidgetMarker(widget);
	syncDomTargets(new Map());
}
