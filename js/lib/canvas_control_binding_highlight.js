import { app } from "../../../scripts/app.js";
import { controlItemBindings } from "./dashboard_model.js";
import { mapCanvasWidgetRows } from "./canvas_widget_row_mapping.js";
import { createCanvasWidgetMarkerManager } from "./canvas_widget_marker.js";

const DOM_BOUND_CLASS = "aaalice-sidebar-bound-widget";
const domStates = new Map();
const pendingDomStates = new Map();
let mountObserver = null;
let mountRefreshFrame = 0;
const CANVAS_BINDING_COLOR = "#a855f7";
const canvasWidgetMarkers = createCanvasWidgetMarkerManager(CANVAS_BINDING_COLOR);

function sameWidgetSet(left, right) {
	if (left.size !== right.size) return false;
	for (const widget of left) if (!right.has(widget)) return false;
	return true;
}

function isNodes2Mode() {
	const liteGraphMode = globalThis.LiteGraph?.vueNodesMode;
	if (typeof liteGraphMode === "boolean") return liteGraphMode;
	const canvasMode = app.canvas?.vueNodesMode;
	if (typeof canvasMode === "boolean") return canvasMode;
	if (typeof document === "undefined") return false;
	return Boolean(document.querySelector('[data-testid="node-widgets"]'));
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

function isPromotedCanvasOnlyWidget(widget) {
	// $$ 开头的是画布专用 pseudo widget（如画布图像预览），不占用 DOM 行映射。
	// 旧协议看 sourceWidgetName；新协议（widgetId 投影）看宿主 widget 名。
	const promoted = (typeof widget?.sourceNodeId !== "undefined" && typeof widget?.sourceWidgetName === "string")
		|| typeof widget?.widgetId !== "undefined";
	if (!promoted) return false;
	const name = typeof widget?.sourceWidgetName === "string" ? widget.sourceWidgetName : widget?.name;
	return typeof name === "string" && name.startsWith("$$");
}

function visibleWidgetCandidates(node, showAdvanced) {
	const widgets = node?.widgets || [];
	return widgets.filter((widget) => {
		const options = widget?.options || {};
		if (!widget?.type || options.canvasOnly || options.hidden || isPromotedCanvasOnlyWidget(widget)) return false;
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
	const defaultCandidates = state.candidatesDefault || visibleWidgetCandidates(state.node, Boolean(state.node.showAdvanced || settingShowsAdvancedWidgets()));
	const allAdvancedCandidates = state.candidatesAll || visibleWidgetCandidates(state.node, true);
	clearDomRows(state);
	const candidates = defaultCandidates.length >= rows.length ? defaultCandidates : allAdvancedCandidates;
	const rowsByWidget = mapCanvasWidgetRows(rows, candidates);
	for (const widget of state.widgets) {
		const row = rowsByWidget.get(widget);
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
	state.rootObserver.observe(root, { childList: true, subtree: true });
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

function syncDomTargets(targetsByNode, { refreshCandidates = false } = {}) {
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
			state = { node, widgets: new Set(), rows: new Set(), root: null, container: null, parent: null, candidatesDefault: null, candidatesAll: null };
			domStates.set(node, state);
		}
		if (!sameWidgetSet(state.widgets, widgets)) {
			state.widgets = new Set(widgets);
			clearDomRows(state);
		}
		// 候选列表读取新协议投影 widget 的响应式访问器，只在真实重解析后刷新；
		// DOM 变动触发的 applyDomRows 复用缓存，避免每次 mutation 放大 store 读取。
		if (refreshCandidates || !state.candidatesDefault) {
			state.candidatesDefault = visibleWidgetCandidates(node, Boolean(node.showAdvanced || settingShowsAdvancedWidgets()));
			state.candidatesAll = visibleWidgetCandidates(node, true);
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

// 高亮只需要绑定目标的 node/widget 身份，与控件的实时值无关；按（模型引用 + 结构签名）
// 备忘解析结果，结构未变时跳过重解析，失效绑定不再每次同步都全图重扫。
// 图重载会以相同签名重建全新节点对象，因此 beforeConfigureGraph 必须显式失效。
let lastResolution = null;

export function invalidateCanvasControlBindingResolution() {
	lastResolution = null;
}

export function syncCanvasControlBindings(model, resolve, { structureToken = null } = {}) {
	let allTargets;
	let targetsByNode;
	const fresh = structureToken != null && lastResolution?.key === structureToken && lastResolution.model === model;
	if (fresh) {
		// 备忘录保存未按当前图过滤的全量目标；图导航后按当前图重新过滤，避免命中旧图节点。
		allTargets = lastResolution.allTargets;
		targetsByNode = new Map();
		for (const [node, widgets] of allTargets) {
			if (node.graph === app.canvas?.graph) targetsByNode.set(node, widgets);
		}
	} else {
		allTargets = new Map();
		targetsByNode = new Map();
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
					let widgets = allTargets.get(resolved.node);
					if (!widgets) { widgets = new Set(); allTargets.set(resolved.node, widgets); }
					widgets.add(widget);
				}
			}
		}
		for (const [node, widgets] of allTargets) {
			if (node.graph === app.canvas?.graph) targetsByNode.set(node, widgets);
		}
		lastResolution = structureToken == null ? null : { key: structureToken, model, allTargets };
	}
	const canvasNeedsRedraw = canvasWidgetMarkers.sync(allTargets);
	syncDomTargets(targetsByNode, { refreshCandidates: !fresh });
	if (canvasNeedsRedraw) app.canvas?.setDirty?.(true, true);
}

export function resetCanvasControlBindingHighlight() {
	lastResolution = null;
	const hadMarkers = canvasWidgetMarkers.reset();
	syncDomTargets(new Map());
	if (hadMarkers) app.canvas?.setDirty?.(true, true);
}
