/** Left Aaalice workspace: manual dashboard and prompt-library management. */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { controlProviders, createControlHostIndex, HOST_ID_PROPERTY, repairDuplicateHostIds } from "./lib/control_providers.js";
import { CONTROL_ADAPTER_REGISTRY_CHANGED_EVENT, CONTROL_HOST_INVALIDATED_EVENT, CONTROL_RENDERER_REGISTRY_CHANGED_EVENT } from "./lib/control_host_events.js";
import {
	controlItemBindings, bindingKey, createPage, emptyDashboard, linkedBindingCount, normalizeDashboard,
} from "./lib/dashboard_model.js";
import { resolveControlBindingSet } from "./lib/control_binding_set.js";
import { DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, dashboardColumnsForWidth, dashboardContentRowSpan, normalizeDashboardColumnSpan, normalizeDashboardRowSpan } from "./lib/dashboard_sizing.js";
import { promptLibraryStore } from "./lib/library_store.js";
import { button, closeAnchoredPopoversWithin, closeContextMenuWithin, closeTooltipWithin, createDialog, createTooltip, el, field, guardClipboardEvents, hasAnchoredPopoverWithin, hasContextMenuWithin, icon, iconButton, onContextMenuClose, toggleSwitch } from "./lib/ui.js";
import { attachDescriptionTooltip } from "./lib/description_tooltip.js";
import { destroyVirtualLists } from "./lib/virtual_list.js";
import { createWorkspaceShell } from "./lib/workspace_components.js";
import { hasActiveControlGestures } from "./lib/workspace_controls.js";
import { destroySharedControls } from "./lib/controls/registry.js";
import { invalidateWidgetControlAdapterCache } from "./lib/widget_control_adapters.js";
import { syncCanvasControlBindings, invalidateCanvasControlBindingResolution } from "./lib/canvas_control_binding_highlight.js";
import { allGraphNodes } from "./lib/graph_scope.js";
import { graphSyncSignature as createGraphSyncSignature } from "./workspace/graph_signature.js";
import { configureGroupNavigation, handleGroupNavigationShortcut, handleGroupNavigationShortcutUp, renderGroupNavigation } from "./workspace/group_navigation.js";
import { clearGroupNavigationCanvasPointer, closeGroupNavigationWheel, isGroupNavigationCanvasPointerEvent, rememberGroupNavigationCanvasPointer } from "./workspace/group_navigation_wheel.js";
import { confirmAction } from "./workspace/dom_utils.js";
import { configureLibraryWorkspace, openLibraryEntryEditor, renderLibrary } from "./workspace/library.js";
import { configureDashboardView, renderDashboard } from "./workspace/dashboard_view.js";
import { configureValueProfiles, openValueProfiles } from "./workspace/value_profiles.js";
import { workspaceLabels } from "./workspace/labels.js";
import {
	configureDashboardBindings, installLinkedSeedQueueHook, notifyControlBindingError,
	notifyWorkspaceImageUpload, openAssignGroup, openCardActions, openComponentNoteEditor,
	openEditGroup, openManageLinkedBindings, openRebind, openMoveControl, patchNodeMenu, getNodeMenuItems as buildNodeMenuItems, controlTitle,
} from "./workspace/dashboard_bindings.js";
import { closeWorkspaceDialogs } from "./workspace/dialogs.js";
import {
	applyDashboardPreset, configureDashboardPresets, createCurrentDashboardPreset, currentDashboardPresetSnapshot,
	dashboardPresetLabels, dashboardPresetState, deleteCurrentDashboardPreset, duplicateCurrentDashboardPreset,
	flushActiveDashboardPresetOnSave, getDashboardPresetModelError, importDashboardPreset, openDashboardExport,
	renameCurrentDashboardPreset, scheduleActiveDashboardPresetAutoSave, updateCurrentDashboardPreset,
} from "./workspace/dashboard_presets.js";
import { numericRangeForControl } from "./workspace/numeric_range.js";
import {
	configureDashboardSourceGroups, sourceGroupIdentity, sourceGroupViewState,
	syncCurrentPageSourceGroups, syncDashboardSourceGroup,
} from "./workspace/dashboard_source_groups.js";
import {
	loadSidebarPinned, loadSidebarPresetAutoSave, saveSidebarPinned, saveSidebarPresetAutoSave,
} from "./workspace/sidebar_preferences.js";
import {
	captureDashboardPageSnapshots, configureDashboardScroll, dashboardScrollState, dashboardScrollTop,
	deleteDashboardScrollState, rememberDashboardScroll, resetDashboardScrollStates, setScrollTopImmediately,
} from "./workspace/dashboard_scroll.js";

const EXTRA_KEY = "aaaliceSidebar";
const DASHBOARD_PRESETS_EXTRA_KEY = "aaaliceSidebarPresets";
const TAB_ID = "aaalice-workspace";
const DASHBOARD_PAGE_RAIL_WIDTH = 38;
const mounted = new Set();
const autoCloseCanvases = new WeakSet();
const bindingNavigationCanvases = new WeakSet();
const bindingModeSettings = new WeakSet();
const dashboardPageRails = new WeakMap();
const dashboardPresetViews = new WeakMap();
const workspaceOwnedTrees = new WeakMap();
const workspaceOwnershipObservers = new Map();
const workspaceParentObservers = new Map();
const workspacePinTooltips = new WeakMap();
const workspaceRootIds = new WeakMap();
let nextWorkspaceRootId = 1;
let activeWorkspace = "dashboard";
let sidebarPinned = loadSidebarPinned();
let sidebarPresetAutoSave = loadSidebarPresetAutoSave();
let activePageId = null;
let editMode = false;
let dashboardModelError = null;
let renderFrame = 0;
let dashboardPresetSyncFrame = 0;
let deferredWorkspaceRender = false;
let dashboardCacheSource = null;
let dashboardCacheValue = null;
let forcedWorkspaceRender = false;
const workspaceViewState = {
	dashboard: { query: "", searchOpen: false, focusSearch: false, focusHost: null, selectedItemIds: new Set(), selectedGroupIds: new Set(), pageTransition: null },
	library: { query: "", searchOpen: false, focusSearch: false, focusHost: null, categoryId: "", collectionId: "", selected: new Set() },
	groups: { query: "", searchOpen: false, focusSearch: false, focusHost: null },
};
function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}
export function openWorkspace(view = "dashboard") {
	if (!["dashboard", "groups", "library"].includes(view)) throw new Error(`[Aaalice] Unknown workspace view: ${view}`);
	const sidebar = app.extensionManager?.sidebarTab;
	if (!sidebar || !("activeSidebarTabId" in sidebar)) throw new Error("[Aaalice] ComfyUI sidebar state is unavailable");
	activeWorkspace = view;
	sidebar.activeSidebarTabId = TAB_ID;
	scheduleStructuralRender();
}

function installWorkspaceCanvasAutoClose() {
	const canvas = app.canvas?.canvas;
	const sidebar = app.extensionManager?.sidebarTab;
	if (!(canvas instanceof HTMLCanvasElement)) throw new Error("[Aaalice] ComfyUI canvas is unavailable");
	if (!sidebar || typeof sidebar.toggleSidebarTab !== "function") throw new Error("[Aaalice] ComfyUI sidebar toggle is unavailable");
	if (autoCloseCanvases.has(canvas)) return;
	autoCloseCanvases.add(canvas);
	canvas.addEventListener("click", () => {
		if (!sidebarPinned && sidebar.activeSidebarTabId === TAB_ID) sidebar.toggleSidebarTab(TAB_ID);
	});
}

function installCanvasBindingNavigationSync() {
	const canvas = app.canvas?.canvas;
	if (!(canvas instanceof HTMLCanvasElement)) throw new Error("[Aaalice] ComfyUI canvas is unavailable");
	if (bindingNavigationCanvases.has(canvas)) return;
	bindingNavigationCanvases.add(canvas);
	canvas.addEventListener("litegraph:set-graph", () => {
		invalidateWidgetControlAdapterCache();
		scheduleCanvasControlBindingSync();
	});
}

function installCanvasBindingModeSync() {
	const settings = app.ui?.settings;
	if (!settings || typeof settings.addEventListener !== "function" || bindingModeSettings.has(settings)) return;
	bindingModeSettings.add(settings);
	settings.addEventListener("Comfy.VueNodes.Enabled.change", () => scheduleCanvasControlBindingSync());
}

export async function openPromptLibraryEntryEditor(entryId) {
	openWorkspace("library");
	try {
		if (!promptLibraryStore.loaded) await promptLibraryStore.refresh();
		const entry = promptLibraryStore.snapshot.entries.find((item) => item.id === entryId);
		if (!entry) throw new Error(t("aaalice.promptSelector.missing", "Missing library entry"));
		openLibraryEntryEditor(entry);
	} catch (error) {
		app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message });
	}
}

function graphNodes() { return allGraphNodes(app.graph); }
function dashboard() {
	app.graph.extra ||= {};
	try {
		const source = app.graph.extra[EXTRA_KEY] ?? null;
		// updateDashboard 每次写回新对象，直接以引用做备忘；失效绑定同步等高频路径不再每次全量规范化。
		if (source && source === dashboardCacheSource && dashboardCacheValue) return dashboardCacheValue;
		const value = normalizeDashboard(source); dashboardModelError = null;
		if (!source || source.version !== value.version) app.graph.extra[EXTRA_KEY] = value;
		dashboardCacheSource = app.graph.extra[EXTRA_KEY] ?? null;
		dashboardCacheValue = value;
		return value;
	} catch (error) { dashboardModelError = error; dashboardCacheSource = null; dashboardCacheValue = null; return emptyDashboard(); }
}

function updateDashboard(callback) {
	if (dashboardModelError) throw dashboardModelError;
	const graph = app.graph; graph?.beforeChange?.();
	try { graph.extra ||= {}; graph.extra[EXTRA_KEY] = normalizeDashboard(callback(dashboard()) || dashboard()); }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender(); scheduleCanvasControlBindingSync(); scheduleActiveDashboardPresetAutoSave(); }
}

function remindWorkflowSave(detail) {
	app.extensionManager?.toast?.add?.({
		severity: "warn",
		summary: t("aaalice.common.notice", "Notice"),
		detail,
		life: 4500,
	});
}

function ownsWorkspaceRoot(root) {
	const ownedTree = workspaceOwnedTrees.get(root);
	return root.isConnected && root.childElementCount === 1 && root.firstElementChild === ownedTree && ownedTree?.parentElement === root;
}

function workspaceRootId(root) {
	let id = workspaceRootIds.get(root);
	if (!id) { id = `root-${nextWorkspaceRootId++}`; workspaceRootIds.set(root, id); }
	return id;
}

function isWorkspaceRootVisible(root) {
	if (!root.isConnected || (root.checkVisibility && !root.checkVisibility())) return false;
	const rectangles = root.getClientRects?.();
	return !rectangles || rectangles.length > 0;
}

function isWorkspaceRootInteractive(root) {
	return ownsWorkspaceRoot(root) && isWorkspaceRootVisible(root);
}

function isFocusedWorkspaceValueControl() {
	const active = document.activeElement;
	if (active instanceof Element && active.closest?.(
		'.aa-workspace-host input:not([type="checkbox"]):not([type="radio"]), .aa-workspace-host select, .aa-workspace-host textarea, .aa-workspace-host [contenteditable="true"], .aa-workspace-host button[aria-haspopup], .aa-workspace-host [data-aaalice-value-field="true"]'
	)) return true;
	return Boolean(document.querySelector('.aa-control-inline-editor'));
}

function hasWorkspacePopover() {
	for (const root of mounted) if (hasAnchoredPopoverWithin(root) || hasContextMenuWithin(root)) return true;
	return false;
}

function scheduleRender(view = null, { structural = false } = {}) {
	if (view && view !== activeWorkspace) return;
	if (structural) forcedWorkspaceRender = true;
	// Coalesce before recording focus deferral; a queued structural frame must not inherit a stale deferred render.
	if (renderFrame) return;
	const forceFocusRender = structural || forcedWorkspaceRender;
	if (hasActiveControlGestures() || hasWorkspacePopover() || (!forceFocusRender && isFocusedWorkspaceValueControl())) { deferredWorkspaceRender = true; return; }
	deferredWorkspaceRender = false;
	renderFrame = requestAnimationFrame(() => {
		renderFrame = 0;
		const renderStructurally = forcedWorkspaceRender;
		forcedWorkspaceRender = false;
		if (hasActiveControlGestures() || hasWorkspacePopover() || (!renderStructurally && isFocusedWorkspaceValueControl())) {
			deferredWorkspaceRender = true;
			if (renderStructurally) forcedWorkspaceRender = true;
			return;
		}
		const pageTransition = workspaceViewState.dashboard.pageTransition;
		for (const root of [...mounted]) {
			if (!ownsWorkspaceRoot(root)) destroyWorkspaceRoot(root);
			else if (isWorkspaceRootInteractive(root)) renderWorkspace(root);
			else suspendWorkspaceRoot(root);
		}
		if (workspaceViewState.dashboard.pageTransition === pageTransition) workspaceViewState.dashboard.pageTransition = null;
	});
}

// Structural changes bypass value-control focus, but a queued frame must not destroy an owned popover before its action finishes.
function scheduleStructuralRender(view = null) {
	scheduleRender(view, { structural: true });
}

function flushDeferredWorkspaceRender() {
	if ((!deferredWorkspaceRender && !forcedWorkspaceRender) || hasActiveControlGestures() || hasWorkspacePopover()) return;
	deferredWorkspaceRender = false;
	scheduleRender();
}

function scheduleDashboardPresetViewSync() {
	if (dashboardPresetSyncFrame) return;
	dashboardPresetSyncFrame = requestAnimationFrame(() => {
		dashboardPresetSyncFrame = 0;
		for (const root of mounted) if (isWorkspaceRootInteractive(root)) dashboardPresetViews.get(root)?.();
	});
}

let canvasBindingSyncFrame = 0;
function scheduleCanvasControlBindingSync({ force = false } = {}) {
	if (canvasBindingSyncFrame) return;
	canvasBindingSyncFrame = requestAnimationFrame(() => {
		canvasBindingSyncFrame = 0;
		const nodes = graphNodes();
		const hostIndex = createControlHostIndex(nodes);
		syncCanvasControlBindings(dashboard(), (binding) => controlProviders.resolve(binding, hostIndex), { structureToken: force ? null : graphSyncSignature(nodes) });
	});
}

// 看板布局参与结构签名；预设快照只定向刷新选择器，不能让普通值保存重建整棵控件树。
function graphSyncSignature(nodes = graphNodes()) {
	const extra = app.graph?.extra;
	return createGraphSyncSignature(nodes, extra, { hostIdProperty: HOST_ID_PROPERTY, dashboardKey: EXTRA_KEY });
}

let graphSyncFrame = 0;
let graphSyncForceRender = false;
let previousGraphStructure = "";

function scheduleGraphSync(forceRender = false) {
	graphSyncForceRender ||= forceRender;
	if (graphSyncFrame) return;
	graphSyncFrame = requestAnimationFrame(() => {
		graphSyncFrame = 0;
		const shouldForceRender = graphSyncForceRender;
		graphSyncForceRender = false;
		const nodes = graphNodes();
		repairDuplicateHostIds(nodes);
		for (const node of nodes) patchNodeMenu(node);
		const signature = graphSyncSignature(nodes);
		const scheduleGraphViewRender = shouldForceRender ? scheduleStructuralRender : scheduleRender;
		if (shouldForceRender || signature !== previousGraphStructure) { previousGraphStructure = signature; scheduleCanvasControlBindingSync(); scheduleGraphViewRender("dashboard"); }
		else scheduleDashboardPresetViewSync();
		scheduleGraphViewRender("groups");
	});
}

function askText(title, label, value, onSave) {
	const input = document.createElement("input"); input.value = value || "";
	const body = el("div", { children: [field({ label, control: input })] }); const footer = el("div");
	const dialog = createDialog({ title, body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { if (input.value.trim()) onSave(input.value.trim()); dialog.close(); } }));
	input.focus(); input.select();
}

function currentPage(model = dashboard()) {
	let page = model.pages.find((item) => item.id === activePageId) || model.pages[0] || null;
	activePageId = page?.id || null; return page;
}

function dashboardColumnsForWorkspaceWidth(width) {
	return dashboardColumnsForWidth(width - DASHBOARD_PAGE_RAIL_WIDTH);
}

function observeDashboardViewport(host, body, grid, page, controls) {
	dashboardViewportObservers.get(host)?.disconnect(); dashboardViewportObservers.delete(host);
	const item = page.items.length === 1 && page.groups.length === 0 ? page.items[0] : null;
	const card = item?.kind === "control" && controls.get(item.id)?.kind === "booru-gallery" ? grid.querySelector("[data-dashboard-item-id]") : null;
	if (!card) return;
	const sync = () => {
		if (!body.clientHeight) return;
		card.style.setProperty("--aa-dashboard-row", "1");
		card.style.setProperty("--aa-dashboard-row-span", String(dashboardContentRowSpan(body.clientHeight)));
		card.dataset.dashboardAutoRowSpan = "true";
	};
	const observer = new ResizeObserver(sync); dashboardViewportObservers.set(host, observer); observer.observe(body); sync();
}

function addPage() {
	askText(t("aaalice.workspace.page.add", "Add page"), t("aaalice.workspace.page.name", "Page name"), "", (name) => { updateDashboard((model) => {
		const page = createPage(name); model.pages.push(page); activePageId = page.id; return model;
	}); });
}

async function removePage(page) {
	if (!await confirmAction(t("aaalice.workspace.page.deleteConfirm", "Delete this dashboard page?"))) return;
	updateDashboard((model) => { model.pages = model.pages.filter((item) => item.id !== page.id); activePageId = model.pages[0]?.id || null; return model; });
}

function resolve(binding, nodes = null) { return controlProviders.resolve(binding, nodes || graphNodes()); }

function dashboardUsesHost(node) {
	const hostId = node?.properties?.[HOST_ID_PROPERTY]; if (!hostId) return false;
	const model = dashboard(); if (dashboardModelError) return true;
	return model.pages.some((page) => page.items.some((item) => item.kind === "control" && controlItemBindings(item).some((binding) => binding.hostId === hostId)));
}

const pendingRelocatedMigrations = new Set();
// 宿主被替换导致的失效绑定经唯一重定位自愈后，把新 hostId 写回持久身份，避免每次解析都全图扫描。
function scheduleRelocatedBindingMigration(relocations) {
	const fresh = relocations.filter((entry) => !pendingRelocatedMigrations.has(entry.key));
	if (!fresh.length) return;
	for (const entry of fresh) pendingRelocatedMigrations.add(entry.key);
	setTimeout(() => {
		try {
			updateDashboard((model) => {
				for (const page of model.pages) for (const item of page.items) {
					if (item.kind !== "control") continue;
					for (const binding of controlItemBindings(item)) {
						const migration = fresh.find((entry) => entry.key === bindingKey(binding));
						if (migration) binding.hostId = migration.hostId;
					}
				}
				return model;
			});
			app.extensionManager?.toast?.add?.({ severity: "info", summary: t("aaalice.workspace.binding.relocated", "Bindings restored"), detail: t("aaalice.workspace.binding.relocatedDetail", "{count} sidebar binding(s) were re-attached to their replacement nodes.").replace("{count}", String(fresh.length)), life: 3600 });
		} catch (error) {
			console.error("[Aaalice] Failed to persist relocated bindings", error);
		} finally { for (const entry of fresh) pendingRelocatedMigrations.delete(entry.key); }
	}, 0);
}

function resolvePageControls(page) {
	const controls = new Map(); const sizeProjections = new Map();
	const hostIndex = createControlHostIndex(graphNodes()), resolvePageBinding = (binding) => resolve(binding, hostIndex);
	const relocations = [];
	for (const item of page?.items || []) {
		if (item.kind !== "control") continue;
		let resolved;
		try { resolved = resolveControlBindingSet(item, resolvePageBinding); }
		catch (error) { resolved = { status: "error", error, binding: item.binding, bindingSet: { entries: [], linkedCount: linkedBindingCount(item), mixed: false, issues: [] } }; }
		if (resolved.status === "ok" && resolved.bindingSet?.entries) {
			for (const entry of resolved.bindingSet.entries) {
				const relocated = entry.resolved?.relocatedHostId;
				if (relocated && entry.binding && entry.binding.hostId !== relocated) relocations.push({ key: bindingKey(entry.binding), hostId: relocated });
			}
		}
		if (resolved.status === "ok" && resolved.kind === "resolution" && item.layout.rowSpan === 40) resolved = { ...resolved, layoutProjection: { ...(resolved.layoutProjection || {}), rowSpan: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN } }; // Keep cards created by the old editor compact without rewriting saved layout.
		controls.set(item.id, resolved);
		if (resolved.status !== "ok" || !resolved.layoutProjection || typeof resolved.layoutProjection !== "object") continue;
		const projection = {};
		if (Number.isFinite(Number(resolved.layoutProjection.columnSpan)) && Number(resolved.layoutProjection.columnSpan) > 0) projection.columnSpan = normalizeDashboardColumnSpan(resolved.layoutProjection.columnSpan);
		if (Number.isFinite(Number(resolved.layoutProjection.rowSpan)) && Number(resolved.layoutProjection.rowSpan) > 0) {
			const minimum = Math.max(DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, Number(resolved.minRowSpan) || DASHBOARD_DEFAULT_CONTROL_ROW_SPAN);
			projection.rowSpan = normalizeDashboardRowSpan(resolved.layoutProjection.rowSpan, { minimum });
		}
		if (Object.keys(projection).length) sizeProjections.set(item.id, projection);
	}
	if (relocations.length) scheduleRelocatedBindingMigration(relocations);
	return { controls, sizeProjections };
}

function resolveGroupTitle(group) {
	return group.nameOverride != null ? group.nameOverride : group.name;
}

const renderedWorkspaceTabs = new WeakSet();
const workspaceWidthObservers = new Map();
const dashboardViewportObservers = new WeakMap();

function destroyDashboardPageRailForRoot(element) {
	const rail = dashboardPageRails.get(element);
	rail?.destroy?.(); dashboardPageRails.delete(element);
}

function closeWorkspaceTransientSurfaces(element, { closeDialogs = true } = {}) {
	closeGroupNavigationWheel(element);
	closeAnchoredPopoversWithin(element);
	closeContextMenuWithin(element);
	closeTooltipWithin(element);
	if (closeDialogs) closeWorkspaceDialogs(element);
}

function suspendWorkspaceRoot(element) {
	dashboardViewportObservers.get(element)?.disconnect(); dashboardViewportObservers.delete(element);
	closeWorkspaceTransientSurfaces(element);
	const ownedTree = workspaceOwnedTrees.get(element);
	if (ownedTree) { destroyVirtualLists(ownedTree); destroySharedControls(ownedTree); }
	dashboardPageRails.get(element)?.destroy?.();
}

function destroyWorkspaceRoot(element) {
	const ownedTree = workspaceOwnedTrees.get(element);
	dashboardPresetViews.delete(element);
	dashboardViewportObservers.get(element)?.disconnect(); dashboardViewportObservers.delete(element);
	workspaceWidthObservers.get(element)?.disconnect(); workspaceWidthObservers.delete(element);
	workspaceOwnershipObservers.get(element)?.disconnect(); workspaceOwnershipObservers.delete(element);
	workspaceParentObservers.get(element)?.disconnect(); workspaceParentObservers.delete(element); renderedWorkspaceTabs.delete(element);
	closeWorkspaceTransientSurfaces(element);
	if (ownedTree) { closeWorkspaceTransientSurfaces(ownedTree); destroyVirtualLists(ownedTree); destroySharedControls(ownedTree); ownedTree.remove(); }
	workspacePinTooltips.delete(element); workspaceOwnedTrees.delete(element); deleteDashboardScrollState(element); destroyDashboardPageRailForRoot(element); element.classList.remove("aa-workspace-host"); mounted.delete(element);
	for (const viewState of Object.values(workspaceViewState)) if (viewState.focusHost === element) { viewState.focusHost = null; viewState.focusSearch = false; }
}

function pruneWorkspaceRoots() {
	for (const element of [...mounted]) if (!ownsWorkspaceRoot(element)) destroyWorkspaceRoot(element);
}

function destroyWorkspaceSidebar() {
	// CustomExtension.destroy has no instance argument and multiple graph views can coexist; prune only roots the host actually detached.
	queueMicrotask(pruneWorkspaceRoots);
}

function renderWorkspace(root) {
	dashboardPresetViews.delete(root);
	dashboardViewportObservers.get(root)?.disconnect(); dashboardViewportObservers.delete(root);
	for (const candidate of workspaceOwnershipObservers.keys()) if (candidate !== root && !isWorkspaceRootInteractive(candidate)) closeWorkspaceTransientSurfaces(candidate);
	rememberDashboardScroll(root);
	closeWorkspaceTransientSurfaces(root, { closeDialogs: false }); destroyVirtualLists(root);
	destroySharedControls(root);
	root.replaceChildren();
	let shell;
	const renderActiveWorkspace = () => {
		destroySharedControls(shell.content);
		shell.content.replaceChildren();
		if (activeWorkspace === "dashboard") renderDashboard(shell.content, root);
		else {
			destroyDashboardPageRailForRoot(root);
			if (activeWorkspace === "groups") renderGroupNavigation(shell.content, root);
			else renderLibrary(shell.content, root);
		}
	};
	const autoSaveDescription = () => sidebarPresetAutoSave
		? t("aaalice.workspace.autoSave.enabledHint", "Auto-save is enabled by default. Changes to the active sidebar preset are saved automatically.")
		: t("aaalice.workspace.autoSave.disabledHint", "Auto-save is off. Update the active sidebar preset manually when you want to keep changes.");
	const autoSaveStatus = el("span", "aa-workspace-auto-save__status");
	const autoSaveToggle = toggleSwitch({
		checked: sidebarPresetAutoSave,
		label: t("aaalice.workspace.autoSave.toggle", "Automatically save the active sidebar preset"),
		onChange: (value) => {
			sidebarPresetAutoSave = value;
			saveSidebarPresetAutoSave(value);
			syncAutoSaveControl();
			if (value) scheduleActiveDashboardPresetAutoSave();
		},
	});
	const autoSaveControl = el("div", {
		className: "aa-workspace-auto-save",
		attrs: { role: "group", "aria-label": t("aaalice.workspace.autoSave.label", "Sidebar preset auto-save") },
		children: [
			el("span", { className: "aa-workspace-auto-save__icon", attrs: { "aria-hidden": "true" }, children: [icon("save")] }),
			el("span", "aa-workspace-auto-save__label", t("aaalice.workspace.autoSave.label", "Auto-save")),
			autoSaveStatus,
			autoSaveToggle,
		],
	});
	attachDescriptionTooltip(autoSaveControl, autoSaveDescription);
	const syncAutoSaveControl = () => {
		autoSaveStatus.textContent = sidebarPresetAutoSave ? t("aaalice.workspace.autoSave.on", "On") : t("aaalice.workspace.autoSave.off", "Off");
		autoSaveToggle.setLabel(autoSaveDescription());
		autoSaveControl.setAttribute("data-auto-save", String(sidebarPresetAutoSave));
	};
	let workspacePinTooltip = workspacePinTooltips.get(root);
	if (!workspacePinTooltip) { workspacePinTooltip = createTooltip({ delay: 220, closeDelay: 60 }); workspacePinTooltips.set(root, workspacePinTooltip); }
	const pinLabel = () => sidebarPinned
		? t("aaalice.workspace.pin.pinned", "Pinned: clicking outside keeps the sidebar open. Click to enable auto-close.")
		: t("aaalice.workspace.pin.unpinned", "Auto-close enabled: clicking outside closes the sidebar. Click to pin.");
	const pinButton = iconButton({ iconName: "pin", label: pinLabel(), variant: "ghost", active: sidebarPinned, className: "aa-workspace-pin" });
	pinButton.removeAttribute("title");
	const syncPinButton = () => {
		pinButton.classList.toggle("is-active", sidebarPinned);
		pinButton.setAttribute("aria-label", pinLabel());
		pinButton.setAttribute("aria-pressed", String(sidebarPinned));
	};
	pinButton.addEventListener("click", () => {
		workspacePinTooltip.hide();
		sidebarPinned = !sidebarPinned;
		saveSidebarPinned(sidebarPinned);
		syncPinButton();
	});
	pinButton.addEventListener("mouseenter", () => workspacePinTooltip.show(pinButton, pinLabel));
	pinButton.addEventListener("mouseleave", () => workspacePinTooltip.hide());
	pinButton.addEventListener("focus", () => workspacePinTooltip.show(pinButton, pinLabel, { immediate: true }));
	pinButton.addEventListener("blur", () => workspacePinTooltip.hide());
	syncAutoSaveControl();
	syncPinButton();
	shell = createWorkspaceShell({ title: t("aaalice.workspace.title", "Aaalice Workspace"), activeTab: activeWorkspace, tabs: [{ value: "dashboard", label: t("aaalice.workspace.dashboard", "Controls"), iconName: "settings" }, { value: "groups", label: t("aaalice.workspace.groups", "Groups"), iconName: "fit" }, { value: "library", label: t("aaalice.workspace.library", "Library"), iconName: "note" }], footerActions: [autoSaveControl, pinButton], onTabChange: (value) => { activeWorkspace = value; scheduleStructuralRender(); } });
	root.append(shell.root); workspaceOwnedTrees.set(root, shell.root); renderActiveWorkspace();
}

configureDashboardBindings({
	dashboard,
	updateDashboard,
	graphNodes,
	resolve,
	workspaceLabels,
	resolveGroupTitle,
	scheduleRender,
	scheduleStructuralRender,
	scheduleCanvasControlBindingSync,
	scheduleActiveDashboardPresetAutoSave,
	currentPage,
	sourceGroupIdentity,
	remindWorkflowSave,
	getActivePageId: () => activePageId,
	setActivePageId: (value) => { activePageId = value; },
	extraKey: EXTRA_KEY,
	dashboardModelError: () => dashboardModelError,
	clearDashboardModelError: () => { dashboardModelError = null; },
});

configureDashboardPresets({
	dashboard,
	resolve,
	graphNodes,
	syncDashboardPresetViews: scheduleDashboardPresetViewSync,
	scheduleStructuralRender,
	remindWorkflowSave,
	workspaceLabels,
	dashboardExtraKey: EXTRA_KEY,
	presetsExtraKey: DASHBOARD_PRESETS_EXTRA_KEY,
	isAutoSaveEnabled: () => sidebarPresetAutoSave,
	getActivePageId: () => activePageId,
	setActivePageId: (value) => { activePageId = value; },
});

configureGroupNavigation({
	scheduleRender,
	scheduleStructuralRender,
	remindWorkflowSave,
	isWorkspaceRootInteractive,
	isSidebarPinned: () => sidebarPinned,
	getActiveWorkspaceRoot: () => [...workspaceOwnershipObservers.keys()].find((root) => isWorkspaceRootInteractive(root)) || null,
	tabId: TAB_ID,
	viewState: workspaceViewState.groups,
});
configureLibraryWorkspace({ scheduleRender, scheduleStructuralRender, workspaceRootId, isWorkspaceRootInteractive, viewState: workspaceViewState.library });
configureDashboardSourceGroups({ dashboard, graphNodes, scheduleRender, scheduleStructuralRender, updateDashboard });
configureDashboardScroll({ mounted, ownsWorkspaceRoot, isWorkspaceRootInteractive, workspaceOwnedTrees });
configureValueProfiles({
	dashboard,
	resolve,
	controlTitle,
	askText,
	scheduleStructuralRender,
	scheduleActiveDashboardPresetAutoSave,
});
configureDashboardView({
	dashboard,
	currentPage,
	sourceGroupViewState,
	resolveGroupTitle,
	resolvePageControls,
	get dashboardModelError() { return dashboardModelError; },
	get dashboardPresetModelError() { return getDashboardPresetModelError(); },
	resetDashboardModel: (model) => { app.graph.extra ||= {}; app.graph.extra[EXTRA_KEY] = model; dashboardModelError = null; },
	isWorkspaceRootInteractive,
	scheduleRender,
	scheduleStructuralRender,
	askText,
	updateDashboard,
	removePage,
	syncCurrentPageSourceGroups,
	dashboardPresetState,
	currentDashboardPresetSnapshot,
	dashboardPresetLabels,
	applyDashboardPreset,
	createCurrentDashboardPreset,
	updateCurrentDashboardPreset,
	duplicateCurrentDashboardPreset,
	openValueProfiles,
	renameCurrentDashboardPreset,
	deleteCurrentDashboardPreset,
	mounted,
	captureDashboardPageSnapshots,
	dashboardPageRails,
	registerDashboardPresetView: (host, update) => dashboardPresetViews.set(host, update),
	workspaceLabels,
	openDashboardExport,
	importDashboardPreset,
	openEditGroup,
	openComponentNoteEditor,
	addPage,
	numericRangeForControl,
	flushDeferredWorkspaceRender,
	notifyWorkspaceImageUpload,
	notifyControlBindingError,
	openManageLinkedBindings,
	openRebind,
	controlTitle,
	openCardActions,
	openMoveControl,
	openAssignGroup,
	resolve,
	syncDashboardSourceGroup,
	dashboardColumnsForWorkspaceWidth,
	dashboardScrollState,
	setScrollTopImmediately,
	dashboardScrollTop,
	observeDashboardViewport,
	viewState: workspaceViewState.dashboard,
	getEditMode: () => editMode,
	setEditMode: (value) => { editMode = value; },
	getActivePageId: () => activePageId,
	setActivePageId: (value) => { activePageId = value; },
});

app.registerExtension({
	name: "ComfyUI.Aaalice.Workspace",
	getNodeMenuItems(node) { return buildNodeMenuItems(node); },
	async init() {
		await ensureI18nReady();
		try { await promptLibraryStore.refresh(); }
		catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message }); }
	},
	beforeRegisterNodeDef(nodeType) { const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); patchNodeMenu(this); return result; }; },
	nodeCreated(node) { patchNodeMenu(node); }, loadedGraphNode(node) { patchNodeMenu(node); },
	beforeConfigureGraph() { clearGroupNavigationCanvasPointer(); closeGroupNavigationWheel(); closeWorkspaceDialogs(); workspaceViewState.dashboard.pageTransition = null; resetDashboardScrollStates(); invalidateCanvasControlBindingResolution(); },
	afterConfigureGraph() { invalidateWidgetControlAdapterCache(); scheduleGraphSync(true); },
	setup() {
		installLinkedSeedQueueHook();
		app.extensionManager.registerSidebarTab({ id: TAB_ID, icon: "aaalice-workspace-sidebar-icon", title: t("aaalice.workspace.sidebarTitle", "Aaalice"), tooltip: t("aaalice.workspace.title", "Aaalice Workspace"), type: "custom", render: (element) => {
			if (renderedWorkspaceTabs.has(element) && !ownsWorkspaceRoot(element)) destroyWorkspaceRoot(element);
			element.classList.add("aa-workspace-host"); mounted.add(element);
			guardClipboardEvents(element);
			// ComfyUI 会在 render 期间读取的响应式 widget 值变化后再次调用此回调。
			// 已拥有完整树时必须幂等返回；值同步由 binding channel 定向更新，结构失效才显式 scheduleRender。
			if (renderedWorkspaceTabs.has(element)) return;
			else {
				renderedWorkspaceTabs.add(element);
				if (isWorkspaceRootVisible(element)) renderWorkspace(element);
				else {
					const placeholder = el("div", { className: "aa-workspace aa-workspace-placeholder", attrs: { "aria-hidden": "true" } });
					element.replaceChildren(placeholder); workspaceOwnedTrees.set(element, placeholder);
				}
			}
			// 宽度观察器必须和渲染器使用同一有效网格宽度，否则 Page Rail 会让断点判断错位。
			const columnBucket = () => dashboardColumnsForWorkspaceWidth(element.clientWidth);
			let lastColumnBucket = columnBucket(); let wasInteractive = isWorkspaceRootInteractive(element);
			workspaceWidthObservers.get(element)?.disconnect();
			const widthObserver = new ResizeObserver(() => {
				if (!ownsWorkspaceRoot(element)) { destroyWorkspaceRoot(element); return; }
				const interactive = isWorkspaceRootInteractive(element);
				if (!interactive) { wasInteractive = false; suspendWorkspaceRoot(element); return; }
				const next = columnBucket();
				if (!wasInteractive) { wasInteractive = true; lastColumnBucket = next; scheduleRender(); return; }
				if (next === lastColumnBucket) return;
				lastColumnBucket = next; scheduleRender("dashboard");
			});
			workspaceWidthObservers.set(element, widthObserver);
			widthObserver.observe(element);
			workspaceOwnershipObservers.get(element)?.disconnect();
			const ownershipObserver = new MutationObserver(() => { if (!ownsWorkspaceRoot(element)) destroyWorkspaceRoot(element); });
			workspaceOwnershipObservers.set(element, ownershipObserver); ownershipObserver.observe(element, { childList: true });
			workspaceParentObservers.get(element)?.disconnect();
			const parentObserver = new MutationObserver(() => { if (!element.isConnected || !ownsWorkspaceRoot(element)) destroyWorkspaceRoot(element); });
			workspaceParentObservers.set(element, parentObserver); if (element.parentElement) parentObserver.observe(element.parentElement, { childList: true });
		}, destroy: destroyWorkspaceSidebar });
		installWorkspaceCanvasAutoClose();
		installCanvasBindingNavigationSync();
		installCanvasBindingModeSync();
		const nodes = graphNodes(); repairDuplicateHostIds(nodes); for (const node of nodes) patchNodeMenu(node); previousGraphStructure = graphSyncSignature(nodes); scheduleCanvasControlBindingSync();
		api.addEventListener("graphChanged", () => { invalidateWidgetControlAdapterCache(); scheduleGraphSync(); scheduleActiveDashboardPresetAutoSave(); });
		// 捕获阶段先于前端快捷键分发执行；保存序列化在之后进行，刚冲刷的预设会被一并写入。
		window.addEventListener("keydown", (event) => {
			if (event.repeat || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== "s") return;
			const target = event.target;
			if (target instanceof Element && (["input", "textarea", "select"].includes(target.localName) || target.isContentEditable)) return;
			flushActiveDashboardPresetOnSave();
		}, true);
		window.addEventListener("keydown", handleGroupNavigationShortcut, true);
		window.addEventListener("keyup", handleGroupNavigationShortcutUp, true);
		window.addEventListener("pointermove", (event) => { if (isGroupNavigationCanvasPointerEvent(event, app.canvas?.canvas)) rememberGroupNavigationCanvasPointer(event, app.graph); }, true);
		window.addEventListener("focusout", () => queueMicrotask(flushDeferredWorkspaceRender), true);
		onContextMenuClose(flushDeferredWorkspaceRender);
		window.addEventListener(CONTROL_HOST_INVALIDATED_EVENT, (event) => {
			const node = event.detail?.node || null; invalidateWidgetControlAdapterCache(node); if (!dashboardUsesHost(node)) return; scheduleRender("dashboard"); scheduleCanvasControlBindingSync({ force: true }); scheduleActiveDashboardPresetAutoSave();
		});
		window.addEventListener(CONTROL_ADAPTER_REGISTRY_CHANGED_EVENT, () => {
			invalidateWidgetControlAdapterCache(); scheduleGraphSync(true); scheduleActiveDashboardPresetAutoSave();
		});
		window.addEventListener(CONTROL_RENDERER_REGISTRY_CHANGED_EVENT, () => scheduleStructuralRender("dashboard"));
		promptLibraryStore.addEventListener("change", () => scheduleRender("library"));
	},
});
