/** QuickGroupManager canvas group controller and compact DOM surface. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { allGraphNodes } from "./lib/graph_scope.js";
import {
	applyQuickGroupManagerAction,
	isQuickGroupManager,
	quickGroupManagerGroups,
	quickGroupManagerSnapshot,
	quickGroupManagerState,
	refreshQuickGroupManagerControls,
	setQuickGroupManagerOffMode,
} from "./lib/quick_group_manager_runtime.js";
import { navigateToVisualGroup } from "./lib/group_navigation.js";
import { createQuickGroupManagerPopoverController } from "./lib/quick_group_manager_popovers.js";
import { el, emptyState, icon, iconButton, isolate, segmentedControl } from "./lib/ui.js";
import {
	GROUP_STATE,
	classifyGroupNodes,
	orderedVisibleGroups,
	reconcileGroupOrder,
	reorderVisibleGroups,
	ruleCount,
} from "./lib/quick_group_manager_model.js";

const NODE = "QuickGroupManager";
const PROPERTY = "quickGroupManagerState";
const WIDGET = "aaalice_quick_group_manager";
const TOOLBAR_WIDGET = "aaalice_quick_group_manager_toolbar";
const MIN_WIDTH = 380;
const MIN_BODY_HEIGHT = 82;
const GROUP_ROW_HEIGHT = 42;
const GROUP_ROW_GAP = 2;
const GROUP_LIST_VERTICAL_MARGIN = 10;
const minimumBodyHeights = new WeakMap();

function minimumBodyHeightForVisibleCount(count) {
	if (!count) return MIN_BODY_HEIGHT;
	return Math.max(MIN_BODY_HEIGHT, (count * GROUP_ROW_HEIGHT) + (Math.max(0, count - 1) * GROUP_ROW_GAP) + GROUP_LIST_VERTICAL_MARGIN);
}

function cacheMinimumBodyHeight(node, visibleGroupCount) {
	minimumBodyHeights.set(node, minimumBodyHeightForVisibleCount(visibleGroupCount));
}

function minimumBodyHeight(node) {
	return minimumBodyHeights.get(node) ?? MIN_BODY_HEIGHT;
}

const mountedManagers = new Set();
let graphListenerInstalled = false;
let refreshFrame = 0;
let vueManagerObserver = null;
let vueManagerFrame = 0;

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({ severity, summary: t("aaalice.quickGroup.title", "Quick Group Manager"), detail, life: 4200 });
}

function isManager(node) {
	return isQuickGroupManager(node);
}

function stateFor(node) {
	return quickGroupManagerState(node);
}

function groupsFor(node) {
	return quickGroupManagerGroups(node);
}

function groupLabel(group) {
	return String(group?.title || message("aaalice.quickGroup.untitled", "Untitled group"));
}

function locateGroup(group) {
	if (!navigateToVisualGroup(app.canvas, group)) toast("error", t("aaalice.quickGroup.navigateUnavailable", "This group cannot be located on the current canvas."));
}

function commit(node, mutate) {
	const graph = node.graph;
	graph?.beforeChange?.();
	try { mutate(); }
	finally {
		graph?.afterChange?.();
		graph?.change?.();
		graph?.setDirtyCanvas?.(true, true);
		refreshQuickGroupManagerControls(node);
	}
}

const popovers = createQuickGroupManagerPopoverController({ commit, render, toast });

function scheduleRenderAll() {
	if (refreshFrame) return;
	refreshFrame = requestAnimationFrame(() => {
		refreshFrame = 0;
		for (const node of mountedManagers) if (node.graph) { render(node); refreshQuickGroupManagerControls(node); }
	});
}

function installGraphListener() {
	if (graphListenerInstalled) return;
	graphListenerInstalled = true;
	api.addEventListener("graphChanged", scheduleRenderAll);
}

function syncVueManagerLayout(node) {
	if (typeof document === "undefined") return;
	const id = String(node.id);
	for (const element of document.querySelectorAll("[data-node-id]")) {
		if (element.getAttribute("data-node-id") !== id) continue;
		const widgetLayer = element.querySelector(".lg-node-widgets");
		if (!widgetLayer?.querySelector(".aaalice-qgm-body")) continue;
		element.classList.add("aaalice-quick-group-manager-node");
		// Nodes 2.0 reads this inline property during resize instead of the
		// computed CSS min-width, so the native handles need the real value here.
		element.style.setProperty("min-width", `${MIN_WIDTH}px`);
		widgetLayer.classList.add("aaalice-qgm-widget-stack");
	}
}

function ensureVueManagerObserver() {
	if (vueManagerObserver || typeof MutationObserver === "undefined" || !document.body) return;
	vueManagerObserver = new MutationObserver(() => {
		if (vueManagerFrame) return;
		vueManagerFrame = requestAnimationFrame(() => {
			vueManagerFrame = 0;
			for (const node of mountedManagers) if (node?.graph) syncVueManagerLayout(node);
		});
	});
	vueManagerObserver.observe(document.body, { childList: true, subtree: true });
}

function applyGroupAction(node, sourceId, action) {
	const result = applyQuickGroupManagerAction(node, sourceId, action);
	if (!result.ok) { toast("error", popovers.ruleErrorText(result)); return; }
	render(node);
}

function switchOffMode(node, offMode) {
	const result = setQuickGroupManagerOffMode(node, offMode);
	if (!result.ok) { toast("error", popovers.ruleErrorText(result)); return; }
	render(node);
}

function moveGroup(node, sourceId, targetId) {
	const groups = groupsFor(node);
	const state = stateFor(node);
	const order = reconcileGroupOrder(state.groupOrder, groups);
	const visibleIds = orderedVisibleGroups(groups, state).map((group) => String(group.id));
	const next = reorderVisibleGroups(order, visibleIds, sourceId, targetId);
	if (next.join("\u0000") === order.join("\u0000")) return;
	commit(node, () => { state.groupOrder = next; });
	render(node);
}

function modeSwitcher(node, state) {
	return segmentedControl({
		value: state.offMode,
		options: [
			{ value: "mute", label: t("aaalice.quickGroup.mode.mute", "Mute"), iconName: "volumeOff" },
			{ value: "bypass", label: t("aaalice.quickGroup.mode.bypass", "Bypass"), iconName: "skipForward" },
		],
		ariaLabel: t("aaalice.quickGroup.mode.aria", "Disabled group mode"),
		onChange: (value) => switchOffMode(node, value),
		className: `aaalice-qgm-segmented is-${state.offMode}`,
		thumbClassName: "aaalice-qgm-segmented-thumb",
		dataAttribute: "offMode",
	});
}

function syncModeSwitcher(segmented, state) {
	segmented.setValue?.(state.offMode);
	segmented.classList.toggle("is-mute", state.offMode === "mute");
	segmented.classList.toggle("is-bypass", state.offMode === "bypass");
	segmented.setAttribute("aria-label", t("aaalice.quickGroup.mode.aria", "Disabled group mode"));
	for (const choice of segmented.querySelectorAll("[data-off-mode]")) {
		const value = choice.dataset.offMode;
		const active = value === state.offMode;
		choice.classList.toggle("is-active", active);
		choice.setAttribute("aria-checked", String(active));
		const label = choice.querySelector(".aa-ui-segmented__label");
		if (label) label.textContent = value === "mute" ? t("aaalice.quickGroup.mode.mute", "Mute") : t("aaalice.quickGroup.mode.bypass", "Bypass");
	}
}

function syncToolbar(node, state) {
	const toolbar = node._aaaliceQuickToolbar;
	let actions = toolbar.querySelector(".aaalice-qgm-actions");
	if (!actions) {
		actions = el("div", "aaalice-qgm-actions");
		const filter = iconButton({ iconName: "filter", label: t("aaalice.quickGroup.filter.aria", "Choose group colors"), variant: "ghost", className: "aaalice-qgm-filter-button" });
		filter.removeAttribute("title");
		filter.addEventListener("mouseenter", () => popovers.showFilterTooltip(node, filter));
		filter.addEventListener("mouseleave", () => popovers.closeHoverTooltip(node));
		filter.addEventListener("focus", () => popovers.showFilterTooltip(node, filter, true));
		filter.addEventListener("blur", () => popovers.closeHoverTooltip(node));
		filter.addEventListener("click", () => popovers.openFilter(node, filter));
		const refresh = iconButton({ iconName: "refresh", label: t("aaalice.quickGroup.refresh", "Refresh groups"), variant: "ghost", className: "aaalice-qgm-refresh-button", onClick: () => render(node) });
		const utilities = el("div", "aaalice-qgm-utilities");
		utilities.append(filter, refresh);
		actions.append(modeSwitcher(node, state), utilities);
		toolbar.replaceChildren(actions);
		node._aaaliceQuickFilterButton = filter;
	}
	const segmented = actions.querySelector(".aaalice-qgm-segmented");
	if (segmented) syncModeSwitcher(segmented, state);
	const filter = actions.querySelector(".aaalice-qgm-filter-button");
	if (filter) {
		const label = `${t("aaalice.quickGroup.filter.aria", "Choose group colors")}: ${popovers.filterSummary(state)}`;
		filter.setAttribute("aria-label", label);
		filter.removeAttribute("title");
		if (node._aaaliceQuickHoverTooltip?.isOpenFor(filter)) popovers.showFilterTooltip(node, filter, true);
		node._aaaliceQuickFilterButton = filter;
	}
	const refresh = actions.querySelector(".aaalice-qgm-refresh-button");
	if (refresh) {
		const label = t("aaalice.quickGroup.refresh", "Refresh groups");
		refresh.setAttribute("aria-label", label);
		refresh.title = label;
	}
}

function groupRow(node, group, visibleGroups) {
	const state = stateFor(node);
	const id = String(group.id);
	const status = classifyGroupNodes(group.nodes);
	const hasNodes = status !== GROUP_STATE.EMPTY;
	const row = el("div", { className: `aaalice-qgm-row is-${status}`, attrs: { "data-group-id": id, role: "group", tabindex: hasNodes ? "0" : "-1", "aria-disabled": String(!hasNodes), "aria-label": groupLabel(group) } });
	const drag = el("button", { className: "aaalice-qgm-drag", attrs: { type: "button", draggable: true, title: t("aaalice.quickGroup.reorder", "Drag to reorder; Alt+Arrow keys also work"), "aria-label": message("aaalice.quickGroup.reorderGroup", "Reorder {group}", { group: groupLabel(group) }) }, children: [icon("drag")] });
	drag.addEventListener("dragstart", (event) => { event.dataTransfer?.setData("text/plain", id); event.dataTransfer.effectAllowed = "move"; row.classList.add("is-dragging"); });
	drag.addEventListener("dragend", () => row.classList.remove("is-dragging"));
	drag.addEventListener("keydown", (event) => {
		if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
		event.preventDefault();
		const index = visibleGroups.findIndex((candidate) => String(candidate.id) === id);
		const target = visibleGroups[index + (event.key === "ArrowUp" ? -1 : 1)];
		if (target) moveGroup(node, id, target.id);
	});
	row.addEventListener("dragover", (event) => { event.preventDefault(); row.classList.add("is-drop-target"); });
	row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
	row.addEventListener("drop", (event) => { event.preventDefault(); row.classList.remove("is-drop-target"); const source = event.dataTransfer?.getData("text/plain"); if (source) moveGroup(node, source, id); });
	const name = el("span", { className: "aaalice-qgm-name", attrs: { title: groupLabel(group) }, text: groupLabel(group) });
	const locate = iconButton({ iconName: "fit", label: message("aaalice.quickGroup.navigate", "Go to {group}", { group: groupLabel(group) }), variant: "ghost", className: "aaalice-qgm-locate", onClick: () => locateGroup(group) });
	const count = ruleCount(state.rules, id);
	const link = iconButton({ iconName: "link", label: message("aaalice.quickGroup.rules.edit", "Edit linkage for {group}", { group: groupLabel(group) }), variant: "ghost", className: `aaalice-qgm-link${count ? " has-rules" : ""}` });
	link.removeAttribute("title");
	if (count) {
		link.append(el("span", "aaalice-qgm-rule-count", String(count)));
		link.addEventListener("mouseenter", () => popovers.showRuleTooltip(node, group, link));
		link.addEventListener("mouseleave", () => popovers.closeHoverTooltip(node));
		link.addEventListener("focus", () => popovers.showRuleTooltip(node, group, link, true));
		link.addEventListener("blur", () => popovers.closeHoverTooltip(node));
	}
	link.addEventListener("click", () => popovers.openRuleEditor(node, group, link));
	const enabled = status === GROUP_STATE.ENABLED;
	const toggle = el("button", { className: `aaalice-qgm-switch${enabled ? " is-on" : ""}${status === GROUP_STATE.MIXED ? " is-mixed" : ""}`, attrs: { type: "button", role: "switch", "aria-checked": status === GROUP_STATE.MIXED ? "mixed" : enabled, disabled: !hasNodes, title: !hasNodes ? t("aaalice.quickGroup.emptyGroup", "This group has no nodes") : null, "aria-label": message("aaalice.quickGroup.toggle", "Toggle {group}", { group: groupLabel(group) }) }, children: [el("span", "aaalice-qgm-switch-thumb")] });
	const activate = () => {
		const currentStatus = classifyGroupNodes(group.nodes);
		if (currentStatus === GROUP_STATE.EMPTY) return;
		applyGroupAction(node, id, currentStatus === GROUP_STATE.ENABLED ? "disable" : "enable");
	};
	toggle.addEventListener("click", activate);
	row.addEventListener("click", (event) => {
		if (event.target?.closest?.("button, input, select, textarea, [contenteditable='true']")) return;
		activate();
	});
	row.addEventListener("keydown", (event) => {
		if (!hasNodes || !["Enter", " "].includes(event.key)) return;
		event.preventDefault();
		activate();
	});
	row.append(drag, name, locate, link, toggle);
	return row;
}

function render(node) {
	const root = node._aaaliceQuickRoot;
	const toolbar = node._aaaliceQuickToolbar;
	if (!root || !toolbar) return;
	node._aaaliceQuickAccent?.sync();
	// Toolbar controls survive body redraws. Keep their popovers open so a queued
	// graphChanged render cannot cancel the user's click on the filter button.
	// Row controls are rebuilt below, so popovers anchored to them must close.
	const popoverAnchor = node._aaaliceQuickPopover?.anchor;
	if (popoverAnchor && !toolbar.contains(popoverAnchor)) popovers.closePopover(node);
	const hoverAnchor = node._aaaliceQuickHoverTooltip?.anchor;
	if (hoverAnchor && !toolbar.contains(hoverAnchor)) popovers.closeHoverTooltip(node);
	const snapshot = quickGroupManagerSnapshot(node);
	const { groups, state, visibleGroups } = snapshot;
	cacheMinimumBodyHeight(node, visibleGroups.length);
	state.groupOrder = reconcileGroupOrder(state.groupOrder, groups);
	syncToolbar(node, state);
	const list = el("div", { className: "aaalice-qgm-list", attrs: { role: "list", "aria-label": t("aaalice.quickGroup.groups", "Workflow groups") } });
	if (visibleGroups.length) for (const group of visibleGroups) list.append(groupRow(node, group, visibleGroups));
	else list.append(emptyState({ description: groups.length ? t("aaalice.quickGroup.noFilteredGroups", "No groups match the selected colors.") : t("aaalice.quickGroup.noGroups", "No visual groups are available in this graph."), iconName: "filter", className: "aaalice-qgm-empty" }));
	root.replaceChildren(list);
	enforceMinimumSize(node);
	syncVueManagerLayout(node);
	node.graph?.setDirtyCanvas?.(true, true);
}

function placeToolbarWidget(node) {
	const widget = node.widgets?.find((item) => item.name === TOOLBAR_WIDGET);
	if (!widget) return;
	widget.y = -(Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT) || 30);
	widget.last_y = widget.y;
	widget.computedHeight = 0;
}

function scheduleInitialSize(node) {
	if (node._aaaliceQuickInitialSizeFrame) return;
	node._aaaliceQuickInitialSizeFrame = requestAnimationFrame(() => {
		node._aaaliceQuickInitialSizeFrame = 0;
		if (!node.graph || node._aaaliceQuickConfigured) return;
		const minimum = node.computeSize?.() || [0, MIN_BODY_HEIGHT];
		node.setSize?.([
			Math.max(Number(minimum[0]) || 0, Number(node.size?.[0]) || 0),
			Number(minimum[1]) || MIN_BODY_HEIGHT,
		]);
		node.graph?.setDirtyCanvas?.(true, true);
	});
}

function enforceMinimumSize(node) {
	const width = Number(node.size?.[0]);
	const height = Number(node.size?.[1]);
	const [minimumWidth, minimumHeight] = node.computeSize?.() || [MIN_WIDTH, MIN_BODY_HEIGHT];
	if (![width, height, minimumWidth, minimumHeight].every(Number.isFinite)) return;
	if (width >= minimumWidth && height >= minimumHeight) return;
	node.setSize?.([Math.max(width, minimumWidth), Math.max(height, minimumHeight)]);
}

function beginResizePassthrough(node) {
	if (node._aaaliceQuickResizeCleanup) return;
	node._aaaliceQuickToolbar?.classList.add("is-resizing");
	node._aaaliceQuickRoot?.classList.add("is-resizing");
	const cleanup = () => {
		document.removeEventListener("pointerup", cleanup, true);
		document.removeEventListener("pointercancel", cleanup, true);
		node._aaaliceQuickToolbar?.classList.remove("is-resizing");
		node._aaaliceQuickRoot?.classList.remove("is-resizing");
		node._aaaliceQuickResizeCleanup = null;
	};
	node._aaaliceQuickResizeCleanup = cleanup;
	document.addEventListener("pointerup", cleanup, true);
	document.addEventListener("pointercancel", cleanup, true);
}

function beginPlacementPassthrough(node) {
	if (node._aaaliceQuickPlacementCleanup) return;
	node._aaaliceQuickToolbar?.classList.add("is-placing");
	node._aaaliceQuickRoot?.classList.add("is-placing");
	const cleanup = () => {
		document.removeEventListener("pointerup", cleanup, true);
		document.removeEventListener("pointercancel", cleanup, true);
		node._aaaliceQuickToolbar?.classList.remove("is-placing");
		node._aaaliceQuickRoot?.classList.remove("is-placing");
		node._aaaliceQuickPlacementCleanup = null;
	};
	node._aaaliceQuickPlacementCleanup = cleanup;
	document.addEventListener("pointerup", cleanup, true);
	document.addEventListener("pointercancel", cleanup, true);
}

function setupManager(node, { initializeSize = false } = {}) {
	if (!isManager(node)) return;
	if (node._aaaliceQuickMounted) {
		stateFor(node);
		node._aaaliceQuickAccent?.sync();
		render(node);
		placeToolbarWidget(node);
		return;
	}
	node._aaaliceQuickMounted = true;
	mountedManagers.add(node);
	cacheMinimumBodyHeight(node, 0);
	installGraphListener();
	ensureVueManagerObserver();
	stateFor(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] QuickGroupManager requires addDOMWidget");
	const toolbar = isolate(el("div", "aaalice-qgm-toolbar aaalice-qgm"));
	node._aaaliceQuickToolbar = toolbar;
		const toolbarWidget = addLifecycleDOMWidget(node, TOOLBAR_WIDGET, "custom", toolbar, {
		serialize: false,
		hideOnZoom: true,
		margin: 0,
		getMinHeight: () => 0,
		getMaxHeight: () => 0,
		getHeight: () => 0,
		getValue: () => "",
		setValue: () => {},
	});
	toolbarWidget.computedHeight = 0;
	const root = isolate(el("div", "aaalice-qgm aaalice-qgm-body aaalice-pcp"));
	node._aaaliceQuickRoot = root;
	node._aaaliceQuickAccent = bindNodeAccent(node, () => [toolbar, root]);
		addLifecycleDOMWidget(node, WIDGET, "custom", root, {
		serialize: false,
		hideOnZoom: true,
		margin: 0,
		getMinHeight: () => minimumBodyHeight(node),
		getMaxHeight: () => minimumBodyHeight(node),
		getValue: () => "",
		setValue: () => {},
	});
	const previousComputeSize = node.computeSize;
	node.computeSize = function () {
		const computed = previousComputeSize?.apply(this, arguments) || [0, MIN_BODY_HEIGHT];
		// The fixed toolbar and localized title share one row. Use a content-sized
		// floor instead of inheriting LiteGraph's DOM-widget height calculation,
		// which already includes the body widget and leaves duplicate space below it.
		return [
			Math.max(Math.ceil(Number(computed[0]) || 0), MIN_WIDTH),
			minimumBodyHeight(this),
		];
	};
	const previousGetWidgetOnPos = node.getWidgetOnPos;
	node.getWidgetOnPos = function (x, y) {
		// Keep hit testing pure; resize state starts only after this node owns the gesture.
		if (this.findResizeDirection?.(x, y)) return undefined;
		return previousGetWidgetOnPos?.apply(this, arguments);
	};
	const previousResize = node.onResize;
	node.onResize = function (size) {
		if (app.canvas?.resizing_node === this) beginResizePassthrough(this);
		if (Array.isArray(size)) {
			size[0] = Math.max(MIN_WIDTH, Number(size[0]) || 0);
			size[1] = Math.max(minimumBodyHeight(this), Number(size[1]) || 0);
		}
		if (Array.isArray(this.size)) {
			this.size[0] = Math.max(MIN_WIDTH, Number(this.size[0]) || 0);
			this.size[1] = Math.max(minimumBodyHeight(this), Number(this.size[1]) || 0);
		}
		return previousResize?.apply(this, arguments);
	};
	const previousArrangeWidgets = node._arrangeWidgets;
	// The zero-height title toolbar and the resizable body need different
	// origins; widgets_start_y would move both, so only the toolbar is corrected.
	node._arrangeWidgets = function () {
		const result = previousArrangeWidgets?.apply(this, arguments);
		placeToolbarWidget(this);
		return result;
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () {
		const result = previousConfigure?.apply(this, arguments);
		this._aaaliceQuickConfigured = true;
		quickGroupManagerState(this);
		this._aaaliceQuickAccent?.sync();
		requestAnimationFrame(() => {
			render(this);
			placeToolbarWidget(this);
		});
		return result;
	};
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		mountedManagers.delete(this);
		minimumBodyHeights.delete(this);
		popovers.closePopover(this);
		this._aaaliceQuickHoverTooltip?.destroy();
		this._aaaliceQuickHoverTooltip = null;
		this._aaaliceQuickAccent?.dispose();
		this._aaaliceQuickAccent = null;
		if (this._aaaliceQuickInitialSizeFrame) cancelAnimationFrame(this._aaaliceQuickInitialSizeFrame);
		this._aaaliceQuickResizeCleanup?.();
		this._aaaliceQuickPlacementCleanup?.();
		this._aaaliceQuickToolbar?.remove?.();
		this._aaaliceQuickRoot?.remove?.();
		return previousRemoved?.apply(this, arguments);
	};
	if (initializeSize) {
		beginPlacementPassthrough(node);
		scheduleInitialSize(node);
	}
	enforceMinimumSize(node);
	placeToolbarWidget(node);
	render(node);
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaaliceQuickGroupManager) return;
	nodeType.__aaaliceQuickGroupManager = true;
	const previous = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previous?.apply(this, arguments);
		setupManager(this, { initializeSize: true });
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.QuickGroupManager",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isManager(node)) setupManager(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isManager(node)) setupManager(node); },
	setup() { installGraphListener(); for (const node of allGraphNodes(app.graph)) if (isManager(node)) setupManager(node); },
});
