/** Left Aaalice workspace: manual dashboard and prompt-library management. */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { controlProviders, repairDuplicateHostIds } from "./lib/control_providers.js";
import { installNodeControlMenu } from "./lib/node_control_menu.js";
import { CONTROL_HOST_INVALIDATED_EVENT } from "./lib/control_host_events.js";
import {
	bindingKey, createPage, emptyDashboard, normalizeDashboard,
} from "./lib/dashboard_model.js";
import {
	compareDashboardPreset, createDashboardPreset, duplicateDashboardPreset, emptyDashboardPresetState, normalizeDashboardPresetState, parseDashboardPreset, removeDashboardPreset, renameDashboardPreset, replaceDashboardPreset, serializeDashboardPreset, setDashboardPresetBaseline,
} from "./lib/dashboard_presets.js";
import { applyDashboardSnapshotPlan, captureDashboardValues, mergeCapturedPresetValues, planDashboardPresetApplication } from "./lib/dashboard_preset_runtime.js";
import { addItems, addSeparator, assignToGroup, compactDashboard, createGroup, deleteGroup, duplicateItems, duplicatePage, moveGroup, moveItems, removeItems, resizeItem, resizeItems, ungroupItems, updateItem } from "./lib/dashboard_commands.js";
import { createDashboardGrid } from "./lib/dashboard_components.js";
import { bindDashboardBoundaryPaging, bindDashboardInteractions } from "./lib/dashboard_interactions.js";
import { DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, DASHBOARD_GRID_COLUMNS, dashboardColumnsForWidth } from "./lib/dashboard_sizing.js";
import { promptLibraryStore } from "./lib/library_store.js";
import { closeImagePreview, createSelectableImagePreview } from "./lib/image_preview.js";
import { bindPromptEntryDetails, closePromptEntryDetails } from "./lib/prompt_entry_details.js";
import { navigateToVisualGroup, visualGroups } from "./lib/group_navigation.js";
import { addGroupNavigationEntry, emptyGroupNavigation, isEditableShortcutTarget, normalizeGroupNavigation, removeGroupNavigationEntry, setGroupNavigationOffset, setGroupNavigationShortcut, setGroupNavigationZoom, shortcutFromKeyboardEvent, shortcutLabel } from "./lib/group_navigation_model.js";
import { classifyGroupNodes, GROUP_STATE, normalizeColor } from "./lib/quick_group_manager_model.js";
import { applyCategoryColor, categorySelectOption, nativeCategoryOption } from "./lib/category_color.js";
import { collectionDisplayName, isDefaultCollection } from "./lib/collection.js";
import { badge, button, createContextMenu, createDialog, createTooltip, el, emptyState, field, icon, iconButton, listboxControl, multiSelectControl, segmentedControl, selectControl, toggleSwitch } from "./lib/ui.js";
import { destroyVirtualLists, mountVirtualList } from "./lib/virtual_list.js";
import {
	createCollapsibleSearch, createControlCard, createListRow,
	createDashboardPageHeading, createDashboardPresetPicker, createSelectionActionBar, createTransferHero, createTransferResult, createTransferSection, createTransferStats, createWorkspaceShell, createWorkspaceToolbar, formatFileSize,
} from "./lib/workspace_components.js";
import { createControlElement, hasActiveControlGestures } from "./lib/workspace_controls.js";
import { destroySharedControls } from "./lib/controls/registry.js";

const EXTRA_KEY = "aaaliceSidebar";
const DASHBOARD_PRESETS_EXTRA_KEY = "aaaliceSidebarPresets";
const LEGACY_VALUE_PRESETS_EXTRA_KEY = "aaaliceSidebarValuePresets";
const GROUP_NAVIGATION_EXTRA_KEY = "aaaliceGroupNavigation";
const TAB_ID = "aaalice-workspace";
const SIDEBAR_PIN_STORAGE_KEY = "aaalice.workspace.sidebarPinned";
const mounted = new Set();
const autoCloseCanvases = new WeakSet();
const dashboardBoundaryPagingState = { locked: false, resetTimer: 0 };
const workspacePinTooltip = createTooltip({ delay: 220, closeDelay: 60 });
let activeWorkspace = "dashboard";
let sidebarPinned = loadSidebarPinned();
let activePageId = null;
let editMode = false;
let dashboardModelError = null;
let dashboardPresetModelError = null;
let groupNavigationModelError = null;
let renderFrame = 0;
const workspaceViewState = {
	dashboard: { query: "", searchOpen: false, focusSearch: false, selectedItemIds: new Set(), selectedGroupIds: new Set(), pageTransition: null },
	library: { query: "", searchOpen: false, focusSearch: false, categoryId: "", collectionId: "", selected: new Set() },
	groups: { query: "", searchOpen: false, focusSearch: false },
};
function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}
function defaultFavoritesLabel() { return t("aaalice.workspace.libraryUi.defaultFavorites", "Default favorites"); }
function favoriteFolderName(collection) { return collectionDisplayName(collection, defaultFavoritesLabel()); }

function loadSidebarPinned() {
	try {
		const stored = globalThis.localStorage?.getItem(SIDEBAR_PIN_STORAGE_KEY);
		if (stored === "true") return true;
		if (stored === "false") return false;
	} catch (error) {
		console.warn("[Aaalice] Unable to read the sidebar pin preference", error);
	}
	return true;
}

function saveSidebarPinned(value) {
	try {
		globalThis.localStorage?.setItem(SIDEBAR_PIN_STORAGE_KEY, String(value));
	} catch (error) {
		console.warn("[Aaalice] Unable to save the sidebar pin preference", error);
	}
}

export function openWorkspace(view = "dashboard") {
	if (!["dashboard", "groups", "library"].includes(view)) throw new Error(`[Aaalice] Unknown workspace view: ${view}`);
	const sidebar = app.extensionManager?.sidebarTab;
	if (!sidebar || !("activeSidebarTabId" in sidebar)) throw new Error("[Aaalice] ComfyUI sidebar state is unavailable");
	activeWorkspace = view;
	sidebar.activeSidebarTabId = TAB_ID;
	scheduleRender();
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

export async function openPromptLibraryEntryEditor(entryId) {
	openWorkspace("library");
	try {
		if (!promptLibraryStore.loaded) await promptLibraryStore.refresh();
		const entry = promptLibraryStore.snapshot.entries.find((item) => item.id === entryId);
		if (!entry) throw new Error(t("aaalice.promptSelector.missing", "Missing library entry"));
		entryEditor(entry);
	} catch (error) {
		app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message });
	}
}

function graphNodes() { return app.graph?._nodes || []; }
function dashboard() {
	app.graph.extra ||= {};
	try {
		const value = normalizeDashboard(app.graph.extra[EXTRA_KEY] ?? null); dashboardModelError = null;
		if (!app.graph.extra[EXTRA_KEY]) app.graph.extra[EXTRA_KEY] = value;
		return value;
	} catch (error) { dashboardModelError = error; return emptyDashboard(); }
}

function updateDashboard(callback) {
	if (dashboardModelError) throw dashboardModelError;
	const graph = app.graph; graph?.beforeChange?.();
	try { graph.extra ||= {}; graph.extra[EXTRA_KEY] = normalizeDashboard(callback(dashboard()) || dashboard()); }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender(); }
}

function dashboardPresetState() {
	try {
		const value = normalizeDashboardPresetState(app.graph?.extra?.[DASHBOARD_PRESETS_EXTRA_KEY] ?? null); dashboardPresetModelError = null; return value;
	} catch (error) { dashboardPresetModelError = error; return emptyDashboardPresetState(); }
}

function updateDashboardPresetState(callback, detail = null) {
	if (dashboardPresetModelError) throw dashboardPresetModelError;
	const graph = app.graph; graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[DASHBOARD_PRESETS_EXTRA_KEY] = normalizeDashboardPresetState(callback(dashboardPresetState()) || dashboardPresetState());
	} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender("dashboard"); }
	if (detail) remindWorkflowSave(detail);
}

/** Ctrl+S 保存工作流时把工作副本冲刷进当前基准预设，随后的保存序列化自然包含它。 */
function flushActiveDashboardPresetOnSave() {
	const state = dashboardPresetState();
	const baseline = state.presets.find((preset) => preset.id === state.baselinePresetId);
	if (!baseline) return;
	const snapshot = currentDashboardPresetSnapshot(undefined, baseline.values);
	if (!compareDashboardPreset(baseline, snapshot).modified) return;
	try { updateDashboardPresetState((current) => replaceDashboardPreset(current, baseline.id, snapshot)); }
	catch (error) { notifyDashboardPresetError(error); }
}

function clearLegacyDashboardPresets() {
	const graph = app.graph; const extra = graph?.extra;
	if (!extra || !Object.prototype.hasOwnProperty.call(extra, LEGACY_VALUE_PRESETS_EXTRA_KEY)) return;
	graph?.beforeChange?.();
	try {
		delete extra[LEGACY_VALUE_PRESETS_EXTRA_KEY];
		if (!extra[DASHBOARD_PRESETS_EXTRA_KEY]) extra[DASHBOARD_PRESETS_EXTRA_KEY] = emptyDashboardPresetState();
	} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); }
	remindWorkflowSave(t("aaalice.workspace.dashboardPreset.legacyCleared", "Old parameter-only presets were cleared. Save the workflow to finish upgrading."));
}

function remindWorkflowSave(detail) {
	app.extensionManager?.toast?.add?.({
		severity: "warn",
		summary: t("aaalice.common.notice", "Notice"),
		detail,
		life: 4500,
	});
}

function scheduleRender(view = null) {
	if (view && view !== activeWorkspace) return;
	if (renderFrame) return;
	renderFrame = requestAnimationFrame(() => {
		renderFrame = 0;
		const pageTransition = workspaceViewState.dashboard.pageTransition;
		for (const root of mounted) renderWorkspace(root);
		if (workspaceViewState.dashboard.pageTransition === pageTransition) workspaceViewState.dashboard.pageTransition = null;
	});
}

function widgetOptionSignature(widget) {
	const values = widget?.options?.values || widget?.options?.options;
	if (!Array.isArray(values)) return null;
	return values.map((item) => typeof item === "object" && item !== null ? String(item.value ?? item.label ?? "") : String(item));
}

function graphStructureSignature() {
	return graphNodes().map((node) => JSON.stringify([
		node.id, node.type, node.comfyClass, node.properties?.aaaliceHostId,
		(node.widgets || []).map((widget) => [widget.name, widget.type, widgetOptionSignature(widget)]),
		(node.properties?.parameters || []).map((parameter) => [parameter.id, parameter.type]),
	])).join("|");
}

// 结构相同的工作流（如同一工作流的多个版本）可能携带不同看板与预设；签名必须覆盖，否则切换标签页时选择器显示陈旧状态
function graphSyncSignature() {
	const extra = app.graph?.extra;
	return `${graphStructureSignature()}|${JSON.stringify([extra?.[EXTRA_KEY] ?? null, extra?.[DASHBOARD_PRESETS_EXTRA_KEY] ?? null])}`;
}

let graphSyncFrame = 0;
let previousGraphStructure = "";
function scheduleGraphSync() {
	if (graphSyncFrame) return;
	graphSyncFrame = requestAnimationFrame(() => {
		graphSyncFrame = 0;
		repairDuplicateHostIds(graphNodes());
		for (const node of graphNodes()) patchNodeMenu(node);
		const signature = graphSyncSignature();
		if (signature !== previousGraphStructure) { previousGraphStructure = signature; scheduleRender("dashboard"); }
		scheduleRender("groups");
	});
}

function groupNavigation() {
	try {
		const value = normalizeGroupNavigation(app.graph?.extra?.[GROUP_NAVIGATION_EXTRA_KEY] ?? null);
		groupNavigationModelError = null;
		return value;
	} catch (error) {
		groupNavigationModelError = error;
		return emptyGroupNavigation();
	}
}

function updateGroupNavigation(callback, detail = null) {
	if (groupNavigationModelError) throw groupNavigationModelError;
	const graph = app.graph;
	graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[GROUP_NAVIGATION_EXTRA_KEY] = normalizeGroupNavigation(callback(groupNavigation()) || groupNavigation());
	} finally {
		graph?.afterChange?.();
		graph?.setDirtyCanvas?.(true, true);
		scheduleRender("groups");
	}
	if (detail) remindWorkflowSave(detail);
}

function askText(title, label, value, onSave) {
	const input = document.createElement("input"); input.value = value || "";
	const body = el("div", { children: [field({ label, control: input })] }); const footer = el("div");
	const dialog = createDialog({ title, body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { if (input.value.trim()) onSave(input.value.trim()); dialog.close(); } }));
	input.focus(); input.select();
}

function captureDashboardPageSnapshot(host) {
	const source = host.querySelector(".aa-dashboard-scroll:not(.is-page-leaving)");
	if (!source) return null;
	const snapshot = source.cloneNode(true);
	const sourceFields = source.querySelectorAll("input, textarea, select");
	const snapshotFields = snapshot.querySelectorAll("input, textarea, select");
	for (let index = 0; index < sourceFields.length; index++) {
		const sourceField = sourceFields[index]; const snapshotField = snapshotFields[index];
		if (!snapshotField) continue;
		if ("value" in snapshotField) snapshotField.value = sourceField.value;
		if ("checked" in snapshotField) snapshotField.checked = sourceField.checked;
	}
	snapshot.classList.remove("is-page-entering", "is-page-entering-forward", "is-page-entering-backward");
	snapshot.setAttribute("aria-hidden", "true"); snapshot.inert = true;
	snapshot._aaaliceSnapshotScrollTop = source.scrollTop;
	return snapshot;
}

function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadUrl(url, filename) {
	const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
}

function pickFile(accept, onFile) {
	const input = document.createElement("input"); input.type = "file"; input.accept = accept;
	input.addEventListener("change", () => { if (input.files?.[0]) onFile(input.files[0]); }); input.click();
}

function setDialogFooter(footer, ...controls) { footer.replaceChildren(...controls); }

function setActionBusy(control, busy, label, busyLabel) {
	control.disabled = busy;
	control.textContent = busy ? busyLabel : label;
	control.setAttribute("aria-busy", String(busy));
}

function transferEntryList(entries, { invalid = false } = {}) {
	return el("div", { className: "aa-transfer-entry-list", children: entries.map((item) => {
		const entry = invalid ? item.entry || {} : item;
		return el("div", { className: "aa-transfer-entry-row", children: [
			el("div", { children: [el("strong", null, entry.title || entry.id || t("aaalice.workspace.transfer.untitled", "Untitled entry")), el("small", null, invalid ? item.reason : entry.text || "")] }),
			...(invalid ? [badge(t("aaalice.workspace.libraryUi.invalid", "Invalid"), { className: "is-danger" })] : []),
		] });
	}) });
}

function libraryEntriesForScope(scope, { selected, categoryId, collectionId }) {
	if (scope === "selected") return promptLibraryStore.filterEntries({ entryIds: selected });
	if (scope === "filtered") return promptLibraryStore.filterEntries({ categoryId, collectionId });
	return promptLibraryStore.snapshot.entries;
}

function libraryExportPayload(scope, { selected, categoryId, collectionId }) {
	if (scope === "selected") return { entryIds: [...selected] };
	if (scope === "filtered") return { ...(categoryId ? { categoryId } : {}), ...(collectionId ? { collectionId } : {}) };
	return {};
}

async function confirmAction(message, { title = t("aaalice.common.confirm", "Confirm"), confirmLabel = t("aaalice.common.confirm", "Confirm"), danger = false } = {}) {
	if (!danger && app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({ title, message }));
	if (!danger) return Boolean(globalThis.confirm(message));
	return new Promise((resolve) => {
		let settled = false; let dialog;
		const finish = (confirmed) => {
			if (settled) return;
			settled = true; dialog.close(); resolve(confirmed);
		};
		const body = el("div", { className: "aa-confirm-danger", children: [icon("statusWarning"), el("p", null, message)] });
		const footer = el("div", { children: [
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(false) }),
			button({ label: confirmLabel, iconName: "delete", variant: "danger", onClick: () => finish(true) }),
		] });
		dialog = createDialog({ title, body, footer, size: "sm", className: "aa-danger-dialog", onRequestClose: () => { finish(false); return false; } });
	});
}

function currentPage(model = dashboard()) {
	let page = model.pages.find((item) => item.id === activePageId) || model.pages[0] || null;
	activePageId = page?.id || null; return page;
}

function addPage() {
	askText(t("aaalice.workspace.page.add", "Add page"), t("aaalice.workspace.page.name", "Page name"), "", (name) => updateDashboard((model) => {
		const page = createPage(name); model.pages.push(page); activePageId = page.id; return model;
	}));
}

async function removePage(page) {
	if (!await confirmAction(t("aaalice.workspace.page.deleteConfirm", "Delete this dashboard page?"))) return;
	updateDashboard((model) => { model.pages = model.pages.filter((item) => item.id !== page.id); activePageId = model.pages[0]?.id || null; return model; });
}

function resolve(binding) { return controlProviders.resolve(binding, graphNodes()); }

function sharedSourceGroup(controls) {
	if (!controls.length || controls.some((control) => !control.sourceGroup?.source)) return null;
	const [first] = controls;
	const source = first.sourceGroup.source;
	const shared = controls.every((control) => control.sourceGroup.source.provider === source.provider && control.sourceGroup.source.hostId === source.hostId);
	return shared ? first.sourceGroup : null;
}

function dashboardPresetLabels() {
	return {
		title: t("aaalice.workspace.dashboardPreset.title", "Sidebar presets"), open: t("aaalice.workspace.dashboardPreset.open", "Open sidebar presets"), placeholder: t("aaalice.workspace.dashboardPreset.placeholder", "Select preset"), attention: t("aaalice.workspace.dashboardPreset.attention", "Needs attention"),
		empty: t("aaalice.workspace.dashboardPreset.empty", "No presets yet"), emptyHint: t("aaalice.workspace.dashboardPreset.emptyHint", "Save the current sidebar layout and values for quick switching later."), emptyAction: t("aaalice.workspace.dashboardPreset.emptyAction", "Save current sidebar"),
		presetCount: t("aaalice.workspace.dashboardPreset.presetCount", "{count} presets"), presetSummary: t("aaalice.workspace.dashboardPreset.presetSummary", "{pages} pages · {values} values"), add: t("aaalice.workspace.dashboardPreset.add", "New"), create: t("aaalice.workspace.dashboardPreset.create", "New preset"), manage: t("aaalice.workspace.dashboardPreset.manage", "Manage preset"), modified: t("aaalice.workspace.dashboardPreset.modified", "Unsaved changes"), update: t("aaalice.workspace.dashboardPreset.update", "Save changes"), saveCurrent: t("aaalice.workspace.dashboardPreset.saveCurrent", "Save as preset"), restore: t("aaalice.workspace.dashboardPreset.restore", "Discard changes"), duplicate: t("aaalice.workspace.dashboardPreset.duplicate", "Duplicate"), rename: t("aaalice.workspace.dashboardPreset.rename", "Rename"), delete: t("aaalice.workspace.dashboardPreset.delete", "Delete"),
		changeSummary: t("aaalice.workspace.dashboardPreset.changeSummary", "{layout} layout · {values} values"), dataError: t("aaalice.workspace.dashboardPreset.dataError", "Preset data error"), dataErrorHint: t("aaalice.workspace.dashboardPreset.dataErrorHint", "The saved sidebar preset data could not be read."),
	};
}

function notifyDashboardPresetError(error) {
	app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.workspace.dashboardPreset.error", "Sidebar preset error"), detail: String(error?.message || error), life: 5200 });
}

function currentDashboardPresetSnapshot(model = dashboard(), previousValues = null) {
	if (previousValues == null) {
		const state = dashboardPresetState();
		previousValues = state.presets.find((preset) => preset.id === state.baselinePresetId)?.values || {};
	}
	const captured = captureDashboardValues(model, (binding) => resolve(binding));
	return { dashboard: model, values: mergeCapturedPresetValues(captured, previousValues), bindings: captured.bindings };
}

function availableDashboardPresetName(fileName, state = dashboardPresetState()) {
	const fallback = t("aaalice.workspace.dashboardPreset.defaultName", "Preset {count}").replace("{count}", "1");
	const source = String(fileName || "").replace(/\.[^.]+$/, "").trim() || fallback;
	const names = new Set(state.presets.map((preset) => preset.name.toLocaleLowerCase())); let count = 1; let name;
	do {
		const suffix = count++ === 1 ? "" : ` ${count - 1}`;
		name = `${source.slice(0, Math.max(1, 80 - suffix.length)).trim()}${suffix}`;
	} while (names.has(name.toLocaleLowerCase()));
	return name;
}

function commitDashboardPresetChange(callback, detail = t("aaalice.workspace.dashboardPreset.saveWorkflowReminder", "Save the workflow to keep these sidebar presets.")) {
	try { updateDashboardPresetState(callback, detail); return true; }
	catch (error) { notifyDashboardPresetError(error); return false; }
}

function askTextValue(title, label, value) {
	return new Promise((resolveValue) => {
		const input = document.createElement("input"); input.value = value || "";
		const body = el("div", { children: [field({ label, control: input })] }); const footer = el("div"); let settled = false; let dialog;
		const finish = (result) => { if (settled) return; settled = true; dialog.close(); resolveValue(result); };
		footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(null) }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { const result = input.value.trim(); if (result) finish(result); } }));
		dialog = createDialog({ title, body, footer, onRequestClose: () => { finish(null); return false; } });
		input.focus(); input.select();
	});
}

async function createCurrentDashboardPreset(model = dashboard()) {
	const state = dashboardPresetState(); const snapshot = currentDashboardPresetSnapshot(model);
	if (!snapshot.dashboard.pages.length && !Object.keys(snapshot.values).length) { notifyDashboardPresetError(t("aaalice.workspace.dashboardPreset.noContent", "There is no sidebar layout to save.")); return false; }
	const names = new Set(state.presets.map((preset) => preset.name.toLowerCase())); let count = 1; let name;
	do { name = t("aaalice.workspace.dashboardPreset.defaultName", "Preset {count}").replace("{count}", String(count++)); } while (names.has(name.toLowerCase()));
	const nextName = await askTextValue(dashboardPresetLabels().create, t("aaalice.workspace.dashboardPreset.name", "Preset name"), name);
	return nextName ? commitDashboardPresetChange((current) => createDashboardPreset(current, nextName, snapshot)) : false;
}

function updateCurrentDashboardPreset(presetId, model = dashboard()) {
	const state = dashboardPresetState(); const preset = state.presets.find((item) => item.id === presetId); if (!preset) return false;
	const snapshot = currentDashboardPresetSnapshot(model, preset.values);
	return commitDashboardPresetChange((current) => replaceDashboardPreset(current, presetId, snapshot), t("aaalice.workspace.dashboardPreset.savedReminder", "Sidebar preset updated. Save the workflow to keep it."));
}

async function duplicateCurrentDashboardPreset(presetId) {
	const state = dashboardPresetState(); const preset = state.presets.find((item) => item.id === presetId); if (!preset) return;
	const name = t("aaalice.workspace.dashboardPreset.copyName", "{name} copy").replace("{name}", preset.name);
	const nextName = await askTextValue(dashboardPresetLabels().duplicate, t("aaalice.workspace.dashboardPreset.name", "Preset name"), name);
	if (nextName) commitDashboardPresetChange((current) => duplicateDashboardPreset(current, presetId, nextName));
}

async function renameCurrentDashboardPreset(presetId) {
	const preset = dashboardPresetState().presets.find((item) => item.id === presetId); if (!preset) return;
	const name = await askTextValue(dashboardPresetLabels().rename, t("aaalice.workspace.dashboardPreset.name", "Preset name"), preset.name);
	if (name) commitDashboardPresetChange((current) => renameDashboardPreset(current, presetId, name));
}

async function deleteCurrentDashboardPreset(presetId) {
	const preset = dashboardPresetState().presets.find((item) => item.id === presetId); if (!preset) return;
	const message = t("aaalice.workspace.dashboardPreset.deleteConfirm", "Delete sidebar preset “{name}”? The current sidebar will not change.").replace("{name}", preset.name);
	if (!await confirmAction(message, { title: dashboardPresetLabels().delete, confirmLabel: dashboardPresetLabels().delete, danger: true })) return;
	commitDashboardPresetChange((current) => removeDashboardPreset(current, presetId));
}

function confirmDashboardPresetSwitch(activePreset = null) {
	return new Promise((resolveDecision) => {
		let settled = false; let dialog;
		const finish = (decision) => { if (settled) return; settled = true; dialog.close(); resolveDecision(decision); };
		const body = el("div", { className: "aa-value-preset-switch-warning", children: [icon("statusWarning"), el("div", { children: [el("strong", null, t("aaalice.workspace.dashboardPreset.unsavedTitle", "Current sidebar is custom")), el("p", null, t("aaalice.workspace.dashboardPreset.unsavedHint", "Save the current layout and values before switching, or discard them."))] })] });
		const footer = el("div", { children: [
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(null) }),
			button({ label: t("aaalice.workspace.dashboardPreset.discardSwitch", "Discard and switch"), variant: "ghost", onClick: () => finish("discard") }),
			button({ label: activePreset ? t("aaalice.workspace.dashboardPreset.saveSwitch", "Update and switch") : t("aaalice.workspace.dashboardPreset.saveAsSwitch", "Save as and switch"), onClick: () => finish(activePreset ? "update" : "save-as") }),
		] });
		dialog = createDialog({ title: activePreset?.name || dashboardPresetLabels().title, body, footer, size: "sm", className: "aa-value-preset-switch-dialog", onRequestClose: () => { finish(null); return false; } });
	});
}

function confirmPartialDashboardPreset(plan, preset) {
	return new Promise((resolveConfirmed) => {
		let settled = false; let dialog;
		const finish = (confirmed) => { if (settled) return; settled = true; dialog.close(); resolveConfirmed(confirmed); };
		const availability = workspaceLabels().availability;
		const labels = { missing: t("aaalice.workspace.binding.missing", "Missing"), incompatible: t("aaalice.workspace.binding.incompatible", "Incompatible"), invalid: t("aaalice.workspace.dashboardPreset.invalid", "Invalid value"), unused: t("aaalice.workspace.dashboardPreset.unused", "Not on sidebar"), empty: availability.noOptions, unset: availability.unset, unavailable: availability.unavailable, error: availability.error };
		const rows = plan.issues.map((entry) => el("div", { className: "aa-value-preset-issue", children: [
			el("div", { children: [el("strong", null, entry.binding?.controlId || entry.key), ...(entry.reason ? [el("small", null, entry.reason)] : [])] }),
			badge(labels[entry.status] || entry.status, { className: "is-warning" }),
		] }));
		const body = el("div", { className: "aa-value-preset-review", children: [
			el("p", null, t("aaalice.workspace.dashboardPreset.partialHint", "Some controls cannot be restored safely. Review them before applying the compatible layout and values.")),
			el("div", { className: "aa-value-preset-issues", children: rows }),
		] });
		const footer = el("div", { children: [button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(false) }), button({ label: t("aaalice.workspace.dashboardPreset.applyCompatible", "Apply compatible preset"), onClick: () => finish(true) })] });
		dialog = createDialog({ title: preset.name, body, footer, size: "sm", className: "aa-value-preset-review-dialog", onRequestClose: () => { finish(false); return false; } });
	});
}

async function applyDashboardPreset(presetId, { restore = false } = {}) {
	let state = dashboardPresetState(); let preset = state.presets.find((item) => item.id === presetId); if (!preset) return;
	const active = state.presets.find((item) => item.id === state.baselinePresetId) || null;
	const current = currentDashboardPresetSnapshot(); const comparison = active ? compareDashboardPreset(active, current) : null;
	const hasCustomContent = current.dashboard.pages.length > 0 || Object.keys(current.values).length > 0;
	if (!restore && active?.id !== presetId && (active ? comparison?.modified : hasCustomContent)) {
		const decision = await confirmDashboardPresetSwitch(active); if (!decision) return;
		if (decision === "update" && !updateCurrentDashboardPreset(active.id)) return;
		if (decision === "save-as" && !await createCurrentDashboardPreset()) return;
		state = dashboardPresetState(); preset = state.presets.find((item) => item.id === presetId); if (!preset) return;
	}
	const plan = planDashboardPresetApplication(preset, (binding) => resolve(binding));
	if (plan.issues.length && !await confirmPartialDashboardPreset(plan, preset)) return;
	const graph = app.graph; graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		applyDashboardSnapshotPlan(plan, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[EXTRA_KEY] = normalizeDashboard(next); } });
		graph.extra[DASHBOARD_PRESETS_EXTRA_KEY] = setDashboardPresetBaseline(state, presetId);
		activePageId = preset.dashboard.pages.some((page) => page.id === activePageId) ? activePageId : preset.dashboard.pages[0]?.id || null;
	} catch (error) { notifyDashboardPresetError(error); return; }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender("dashboard"); }
	remindWorkflowSave(t("aaalice.workspace.dashboardPreset.appliedReminder", "Sidebar preset applied. Save the workflow to keep the layout and values."));
}

function workspaceLabels() {
	return {
		pages: t("aaalice.workspace.page.pages", "Dashboard pages"), duplicatePage: t("aaalice.workspace.page.duplicate", "Duplicate page"),
		switchPage: t("aaalice.workspace.page.switch", "Switch page"),
		renamePage: t("aaalice.workspace.page.rename", "Rename page"), deletePage: t("aaalice.workspace.page.delete", "Delete page"),
		groupMenu: t("aaalice.workspace.group.menu", "Layout group menu"),
		renameHint: t("aaalice.workspace.renameHint", "Double-click to rename"),
		resizeCard: t("aaalice.workspace.card.resize", "Resize card; arrow keys adjust by one grid unit"),
		seedLocked: t("aaalice.pcp.seedMode.locked", "Seed locked; click to unlock"), seedUnlocked: t("aaalice.pcp.seedMode.unlocked", "Seed unlocked; click to lock"),
		imageNone: t("aaalice.pcp.image.none", "Choose image"), imageDrop: t("aaalice.pcp.image.drop", "Drop image here"), imageClear: t("aaalice.pcp.image.clear", "Clear selected image"),
		imageCompare: {
			empty: t("aaalice.workspace.imageCompare.empty", "Run the workflow to compare images"),
			before: t("aaalice.workspace.imageCompare.before", "Image A"), after: t("aaalice.workspace.imageCompare.after", "Image B"),
			previousBefore: t("aaalice.workspace.imageCompare.previousBefore", "Previous Image A"), nextBefore: t("aaalice.workspace.imageCompare.nextBefore", "Next Image A"),
			previousAfter: t("aaalice.workspace.imageCompare.previousAfter", "Previous Image B"), nextAfter: t("aaalice.workspace.imageCompare.nextAfter", "Next Image B"),
			slider: t("aaalice.workspace.imageCompare.slider", "Comparison position"),
			open: t("aaalice.workspace.imageCompare.open", "Open full-screen comparison"), title: t("aaalice.workspace.imageCompare.title", "Image comparison"),
			viewer: t("aaalice.workspace.imageCompare.viewer", "Full-screen image comparison. Move the pointer to compare, scroll to zoom, drag enlarged images to move, and double-click to reset."), close: t("aaalice.workspace.imageCompare.close", "Close full-screen comparison"),
			zoomIn: t("aaalice.workspace.imageCompare.zoomIn", "Zoom in"), zoomOut: t("aaalice.workspace.imageCompare.zoomOut", "Zoom out"), fit: t("aaalice.workspace.imageCompare.fit", "Fit to screen"),
		},
		selectOption: t("aaalice.workspace.binding.selectOption", "Select an option"),
		availability: {
			noOptions: t("aaalice.workspace.binding.noOptions", "No options available"), unset: t("aaalice.workspace.binding.unset", "No value available"),
			unavailable: t("aaalice.workspace.binding.unavailable", "Control is temporarily unavailable"), error: t("aaalice.workspace.binding.error", "Control unavailable due to an error"),
		},
		taglist: {
			placeholder: t("aaalice.pcp.taglist.placeholder", "Enter tags and press Enter"),
			append: t("aaalice.pcp.taglist.append", "+ Add tag"),
			empty: t("aaalice.pcp.taglist.empty", "Press Enter to add tags"),
			input: t("aaalice.pcp.taglist.input", "Add tags"),
			enable: t("aaalice.pcp.taglist.enable", "Enable {tag}"),
			disable: t("aaalice.pcp.taglist.disable", "Disable {tag}"),
			remove: t("aaalice.pcp.taglist.remove", "Remove {tag}"),
		},
		missing: t("aaalice.workspace.binding.missing", "Missing binding"), incompatible: t("aaalice.workspace.binding.incompatible", "Incompatible control"),
	};
}

function controlAvailabilityDescription(control) {
	const availability = control.availability;
	if (!availability || availability.state === "ready") return control.binding.valueType;
	const labels = workspaceLabels().availability;
	if (availability.reason === "no-options") return labels.noOptions;
	if (availability.state === "unset") return labels.unset;
	if (availability.state === "error") return labels.error;
	return labels.unavailable;
}

function notifyWorkspaceImageUpload(error = null, reference = null) {
	let severity = "success";
	let detail = t("aaalice.pcp.image.uploaded", "Image uploaded: {filename}").replaceAll("{filename}", String(reference?.filename || ""));
	if (error) {
		severity = "error";
		if (error.code === "file-type") detail = t("aaalice.pcp.error.imageFileType", "Choose an image file.");
		else if (error.code === "response") detail = t("aaalice.pcp.error.imageUploadResponse", "The server response did not include an image filename.");
		else detail = t("aaalice.pcp.error.imageUpload", "Image upload failed: {reason}").replaceAll("{reason}", String(error?.message || error));
	}
	app.extensionManager?.toast?.add?.({ severity, summary: t(`aaalice.common.${severity === "error" ? "error" : "notice"}`, severity === "error" ? "Error" : "Notice"), detail, life: 4500 });
}

function openRebind(item) {
	const candidates = graphNodes().flatMap((node) => controlProviders.list(node)).filter((candidate) => candidate.binding.valueType === item.binding.valueType);
	const body = el("div", "aa-rebind-list"); const footer = el("div");
	let selected = null;
	for (const candidate of candidates) body.append(createListRow({ title: candidate.label, description: candidate.binding.provider, onSelect: (checked) => { if (checked) selected = candidate.binding; } }));
	if (!candidates.length) body.append(emptyState({ description: t("aaalice.workspace.binding.noCompatible", "No compatible controls are available.") }));
	const dialog = createDialog({ title: t("aaalice.workspace.binding.rebind", "Rebind control"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { if (selected) updateDashboard((model) => updateItem(model, item.id, (target) => { target.binding = selected; })); dialog.close(); } }));
}

function openCardActions({ x, y, editMode: layoutEditing, onMove, onRemove, onToggleSpan, onToggleCompact, onGroup, onUngroup }, item) {
	const items = [];
	if (layoutEditing) items.push(
		{ label: t("aaalice.workspace.card.move", "Move control"), iconName: "move", onSelect: onMove },
		{ label: t("aaalice.workspace.card.width", "Toggle card width"), iconName: "copy", onSelect: onToggleSpan },
		{ label: t("aaalice.workspace.card.compact", "Toggle compact mode"), iconName: "moveDown", onSelect: onToggleCompact },
		...(item.groupId ? [{ label: t("aaalice.workspace.group.removeItem", "Remove from group"), iconName: "close", onSelect: onUngroup }] : [{ label: t("aaalice.workspace.group.addItem", "Add to group"), iconName: "add", onSelect: onGroup }]),
		{ separator: true },
	);
	items.push(
		{ label: t("aaalice.workspace.binding.rebind", "Rebind control"), iconName: "link", onSelect: () => openRebind(item) },
		{ label: t("aaalice.workspace.card.remove", "Remove control"), iconName: "delete", danger: true, onSelect: onRemove },
	);
	createContextMenu({ x, y, ariaLabel: t("aaalice.workspace.card.menu", "Control card menu"), items });
}

function openMoveControl(item) {
	const model = dashboard(); const pageSelect = document.createElement("select");
	for (const page of model.pages) pageSelect.add(new Option(page.name, page.id));
	const body = el("div", { children: [field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect })] }); const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.card.move", "Move control"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { if (pageSelect.value) updateDashboard((current) => moveItems(current, [item.id], pageSelect.value)); dialog.close(); } }));
}

function openAssignGroup(page, item) {
	if (!page.groups.length) return;
	const groupSelect = selectControl({ ariaLabel: t("aaalice.workspace.group.name", "Group name"), options: page.groups.map((group) => ({ label: group.name, value: group.id })), value: page.groups[0].id });
	const body = el("div", { children: [field({ label: t("aaalice.workspace.group.name", "Group name"), control: groupSelect })] }); const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.group.addItem", "Add to group"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { updateDashboard((current) => assignToGroup(current, page.id, [item.id], groupSelect.value)); dialog.close(); } }));
}

function openEditGroup(page, group) {
	const name = document.createElement("input"); name.value = group.name;
	const tone = selectControl({ ariaLabel: t("aaalice.workspace.group.tone", "Group color"), value: group.tone, options: ["neutral", "blue", "green", "amber", "purple", "red"].map((value) => ({ value, label: t(`aaalice.workspace.group.tones.${value}`, value) })) });
	const body = el("div", { children: [field({ label: t("aaalice.workspace.group.name", "Group name"), control: name }), field({ label: t("aaalice.workspace.group.tone", "Group color"), control: tone })] }); const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.group.edit", "Edit group"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { if (!name.value.trim()) return; updateDashboard((current) => { const target = current.pages.find((entry) => entry.id === page.id)?.groups.find((entry) => entry.id === group.id); if (target) { target.name = name.value.trim(); target.tone = tone.value; } return current; }); dialog.close(); } }));
}

function openDashboardExport(model) {
	const preset = serializeDashboardPreset(currentDashboardPresetSnapshot(model));
	const pages = preset.dashboard.pages;
	const groups = pages.flatMap((page) => page.groups);
	const controls = pages.flatMap((page) => page.items).filter((item) => item.kind === "control");
	const values = Object.keys(preset.values).length;
	const body = el("div", { className: "aa-transfer-dialog-body", children: [
		createTransferHero({ iconName: "upload", eyebrow: t("aaalice.workspace.transfer.layoutPreset", "Layout backup"), title: t("aaalice.workspace.transfer.exportPresetTitle", "Export sidebar layout"), description: t("aaalice.workspace.transfer.exportPresetHint", "Packages pages, layout groups, control bindings and compatible current values into portable JSON."), fileName: "aaalice-dashboard-layout.json", fileMeta: t("aaalice.workspace.transfer.jsonPreset", "JSON layout backup"), tone: "dashboard" }),
		createTransferStats([
			{ value: pages.length, label: t("aaalice.workspace.transfer.pages", "Pages"), tone: "primary" },
			{ value: groups.length, label: t("aaalice.workspace.transfer.groups", "Groups") },
			{ value: controls.length, label: t("aaalice.workspace.transfer.controls", "Controls") },
			{ value: values, label: t("aaalice.workspace.transfer.values", "Saved values"), tone: values < controls.length ? "warning" : "success" },
		]),
		el("div", { className: "aa-transfer-callout is-info", children: [icon("statusIdle"), el("p", null, t("aaalice.workspace.transfer.presetIdentityHint", "Bindings are restored only by stable identity. Missing controls remain visible for manual rebinding."))] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.preset.export", "Export layout"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.workspace.preset.export", "Export layout"), onClick: () => {
		downloadBlob(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }), "aaalice-dashboard-layout.json");
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.exportComplete", "Export ready"), description: t("aaalice.workspace.transfer.presetExportCompleteHint", "The sidebar layout backup has been downloaded. It remains separate from your prompt-library backup."), count: controls.length, countLabel: t("aaalice.workspace.transfer.controls", "controls") }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
	} }));
}

function renderDashboard(container, host) {
	container.classList.toggle("is-layout-editing", editMode);
	const model = dashboard(); const page = currentPage(model);
	const viewState = workspaceViewState.dashboard;
	if (dashboardModelError) {
		container.append(emptyState({ iconName: "statusWarning", className: "aa-workspace-empty aa-dashboard-unsupported", title: t("aaalice.workspace.unsupported.title", "Old dashboard layout is unsupported"), description: t("aaalice.workspace.unsupported.description", "Dashboard V2 uses a new grid model. Reset the unpublished layout to continue."), actions: [button({ label: t("aaalice.workspace.unsupported.reset", "Reset dashboard"), iconName: "delete", variant: "danger", onClick: () => {
			const graph = app.graph; graph?.beforeChange?.(); try { graph.extra ||= {}; graph.extra[EXTRA_KEY] = emptyDashboard(); dashboardModelError = null; activePageId = null; } finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender(); }
		} })] })); return;
	}
	const query = viewState.query;
	const pageTransition = viewState.pageTransition?.pageId === page?.id ? viewState.pageTransition : null;
	const pageTransitionClass = pageTransition ? ` is-page-entering is-page-entering-${pageTransition.direction}` : "";
	const pageSnapshot = pageTransition?.snapshot || null;
	const searchOpen = Boolean(page && !editMode && viewState.searchOpen);
	const focusSearch = viewState.focusSearch; viewState.focusSearch = false;
	let applyDashboardSearch = () => {};
	const search = createCollapsibleSearch({
		open: searchOpen, value: query, disabled: !page || editMode, focus: focusSearch,
		label: t("aaalice.workspace.search.parameters", "Search parameters"), closeLabel: t("aaalice.workspace.search.close", "Close search"), placeholder: t("aaalice.workspace.search.parametersPlaceholder", "Search the current page"),
		onToggle: (open) => { viewState.searchOpen = open; viewState.focusSearch = open; scheduleRender(); },
		onInput: (value) => { viewState.query = value; applyDashboardSearch(value); },
	});
	const addSeparatorToPage = () => {
		if (!page) return;
		askText(t("aaalice.workspace.layout.separator", "Add separator"), t("aaalice.workspace.layout.separatorLabel", "Separator"), "", (label) => updateDashboard((current) => addSeparator(current, page.id, label)));
	};
	const renamePage = (name) => updateDashboard((current) => {
		const target = current.pages.find((item) => item.id === page?.id);
		if (target) target.name = name;
		return current;
	});
	const openPageMenu = (event) => {
		if (!page) return;
		const rect = event.currentTarget.getBoundingClientRect();
		createContextMenu({ x: rect.right, y: rect.bottom, ariaLabel: t("aaalice.workspace.page.menu", "Page actions"), items: [
			{ label: t("aaalice.workspace.page.duplicate", "Duplicate page"), iconName: "copy", onSelect: () => updateDashboard((current) => { const next = duplicatePage(current, page.id); activePageId = next.pages[next.pages.findIndex((entry) => entry.id === page.id) + 1]?.id || page.id; return next; }) },
			{ label: t("aaalice.workspace.page.rename", "Rename page"), iconName: "edit", onSelect: () => askText(t("aaalice.workspace.page.rename", "Rename page"), t("aaalice.workspace.page.name", "Page name"), page.name, renamePage) },
			{ separator: true },
			{ label: t("aaalice.workspace.page.delete", "Delete page"), iconName: "delete", danger: true, onSelect: () => removePage(page) },
		] });
	};
	const presetState = dashboardPresetState();
	const baselinePreset = presetState.presets.find((item) => item.id === presetState.baselinePresetId) || null;
	const currentPresetSnapshot = currentDashboardPresetSnapshot(model);
	const presetComparison = baselinePreset ? compareDashboardPreset(baselinePreset, currentPresetSnapshot) : null;
	const presetPicker = createDashboardPresetPicker({
		presets: presetState.presets, baselineId: baselinePreset?.id || null, comparison: presetComparison, error: dashboardPresetModelError, labels: dashboardPresetLabels(),
		onSelect: (presetId) => applyDashboardPreset(presetId), onCreate: () => createCurrentDashboardPreset(), onUpdate: (presetId) => updateCurrentDashboardPreset(presetId),
		onRestore: (presetId) => applyDashboardPreset(presetId, { restore: true }), onDuplicate: duplicateCurrentDashboardPreset, onRename: renameCurrentDashboardPreset, onDelete: deleteCurrentDashboardPreset,
	});
	const activePageIndex = model.pages.findIndex((entry) => entry.id === page?.id);
	const selectPage = (id, detail = {}) => {
		if (!id || id === activePageId) return;
		const previousIndex = model.pages.findIndex((entry) => entry.id === activePageId);
		const nextIndex = model.pages.findIndex((entry) => entry.id === id);
		const direction = nextIndex < previousIndex ? "backward" : "forward";
		viewState.pageTransition = { pageId: id, direction, source: detail.source, initialEdge: detail.source === "boundary" && direction === "backward" ? "bottom" : "top", snapshot: captureDashboardPageSnapshot(container) };
		activePageId = id; viewState.selectedItemIds = new Set(); viewState.selectedGroupIds = new Set(); scheduleRender();
	};
	const reorderPage = (sourceId, targetId) => updateDashboard((current) => {
		const sourceIndex = current.pages.findIndex((item) => item.id === sourceId); const targetIndex = current.pages.findIndex((item) => item.id === targetId);
		if (sourceIndex >= 0 && targetIndex >= 0) { const [source] = current.pages.splice(sourceIndex, 1); current.pages.splice(targetIndex, 0, source); } return current;
	});
	const dashboardActions = [
		...(page ? [createDashboardPageHeading({
			page,
			pages: model.pages,
			index: activePageIndex,
			editMode,
			labels: workspaceLabels(),
			className: pageTransitionClass.trim(),
			onRename: renamePage,
			onSelectPage: selectPage,
			onReorderPage: reorderPage,
		})] : []),
		presetPicker,
		button({ label: editMode ? t("aaalice.workspace.done", "Done") : t("aaalice.workspace.edit", "Layout"), iconName: editMode ? "statusCheck" : "layout", variant: "ghost", size: "sm", active: editMode, className: "aa-dashboard-edit-toggle", onClick: () => { editMode = !editMode; viewState.selectedItemIds = new Set(); viewState.selectedGroupIds = new Set(); if (editMode) { viewState.searchOpen = false; viewState.query = ""; } scheduleRender(); } }),
		...(editMode ? [
			button({ label: t("aaalice.workspace.page.add", "Add page"), iconName: "add", variant: "primary", size: "sm", className: "aa-dashboard-add-page", onClick: addPage }),
			...(page ? [
				button({ label: t("aaalice.workspace.layout.separator", "Add separator"), variant: "ghost", size: "sm", className: "aa-dashboard-add-separator", onClick: addSeparatorToPage }),
				iconButton({ iconName: "layout", label: t("aaalice.workspace.layout.compact", "Tidy layout"), variant: "ghost", className: "aa-dashboard-tidy-layout", onClick: () => updateDashboard((current) => compactDashboard(current, page.id)) }),
				iconButton({ iconName: "settings", label: t("aaalice.workspace.page.menu", "Page actions"), variant: "ghost", className: "aa-dashboard-page-menu", onClick: openPageMenu }),
			] : []),
		] : [
			iconButton({ iconName: "upload", label: t("aaalice.workspace.preset.export", "Export layout"), variant: "ghost", onClick: () => openDashboardExport(model) }),
			iconButton({ iconName: "download", label: t("aaalice.workspace.preset.import", "Import layout"), variant: "ghost", onClick: () => pickFile(".json,application/json", importDashboardPreset) }),
			search.toggle,
		]),
	];
	const toolbar = createWorkspaceToolbar(searchOpen ? [search.panel] : dashboardActions, { className: `aa-dashboard-toolbar${searchOpen ? " is-searching" : ""}`, label: t("aaalice.workspace.dashboardActions", "Dashboard actions") });
	container.append(toolbar);
	if (!page) { container.append(emptyState({ iconName: "layout", className: "aa-workspace-empty aa-dashboard-empty", title: t("aaalice.workspace.empty.title", "Build your control pages"), description: t("aaalice.workspace.empty.description", "Create a page, then add controls from any compatible node's context menu."), actions: [button({ label: t("aaalice.workspace.page.add", "Add page"), iconName: "add", onClick: addPage })] })); return; }
	const scroll = el("div", `aa-dashboard-scroll${pageTransitionClass}`);
	bindDashboardBoundaryPaging(scroll, {
		state: dashboardBoundaryPagingState,
		isEnabled: () => !viewState.searchOpen && !scroll.querySelector(".aa-dashboard-grid-v2.is-dragging"),
		canAdvance: () => activePageIndex >= 0 && activePageIndex < model.pages.length - 1,
		canRetreat: () => activePageIndex > 0,
		onAdvance: () => selectPage(model.pages[activePageIndex + 1]?.id, { source: "boundary" }),
		onRetreat: () => selectPage(model.pages[activePageIndex - 1]?.id, { source: "boundary" }),
	});
	const openGroupMenu = (event, group) => {
		const rect = event.currentTarget.getBoundingClientRect(); createContextMenu({ x: event.clientX || rect.right, y: event.clientY || rect.bottom, ariaLabel: t("aaalice.workspace.group.menu", "Layout group menu"), items: [
			{ label: t("aaalice.workspace.group.edit", "Edit group"), iconName: "settings", onSelect: () => openEditGroup(page, group) },
			{ label: t("aaalice.workspace.group.delete", "Ungroup controls"), iconName: "close", onSelect: () => updateDashboard((current) => deleteGroup(current, page.id, group.id)) },
		] });
	};
	const renderItem = (item) => {
		if (item.kind === "separator") {
			const separator = el("div", { className: "aa-dashboard-separator", attrs: { "data-dashboard-item-id": item.id, tabindex: editMode ? 0 : null, role: "separator", "aria-label": item.label }, children: [el("span", "aa-dashboard-separator-label", item.label), ...(editMode ? [iconButton({ iconName: "delete", label: t("aaalice.workspace.layout.remove", "Remove layout item"), variant: "ghost", onClick: () => updateDashboard((current) => removeItems(current, [item.id])) })] : [])] });
			separator.dataset.searchText = String(item.label || "").toLocaleLowerCase(); return separator;
		}
		const resolved = resolve(item.binding);
		const control = resolved.status === "ok" ? createControlElement(resolved, { labels: workspaceLabels(), onCommit: (_value, detail = {}) => { if (detail.redraw !== false) scheduleRender("dashboard"); }, onError: (error) => notifyWorkspaceImageUpload(error), onSuccess: (reference) => notifyWorkspaceImageUpload(null, reference) }) : button({ label: t("aaalice.workspace.binding.rebind", "Rebind"), variant: "secondary", size: "sm", onClick: () => openRebind(item) });
		const cardTitle = item.label || resolved.label || item.binding.controlId;
		const card = createControlCard({ item, title: cardTitle, control, status: resolved.status, editMode, labels: workspaceLabels(), onManage: (context) => openCardActions(context, item), onMove: () => openMoveControl(item),
			onRemove: () => updateDashboard((current) => removeItems(current, [item.id])), onToggleSpan: () => updateDashboard((current) => resizeItems(current, [item.id], item.layout.columnSpan === DASHBOARD_GRID_COLUMNS ? DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN : DASHBOARD_GRID_COLUMNS)),
			onToggleCompact: () => updateDashboard((current) => updateItem(current, item.id, (target) => { target.compact = !target.compact; })),
			onRenameTitle: (name) => updateDashboard((current) => updateItem(current, item.id, (target) => { target.label = name; })),
			onGroup: () => openAssignGroup(page, item), onUngroup: () => updateDashboard((current) => ungroupItems(current, page.id, [item.id])),
		});
		card.dataset.dashboardItemId = item.id; card.dataset.searchText = String(cardTitle).toLocaleLowerCase(); return card;
	};
	const columns = dashboardColumnsForWidth(container.clientWidth);
	const grid = createDashboardGrid({ page, columns, editMode, selectedItemIds: viewState.selectedItemIds, selectedGroupIds: viewState.selectedGroupIds, labels: workspaceLabels(), renderItem, onGroupMenu: openGroupMenu,
		onRenameGroup: (group, name) => updateDashboard((current) => {
			const target = current.pages.find((entry) => entry.id === page.id)?.groups.find((entry) => entry.id === group.id);
			if (target) target.name = name;
			return current;
		}),
	});
	let updateSelectionUi = () => {}; let dashboardInteraction = null;
	const clearSelection = () => { viewState.selectedItemIds = new Set(); viewState.selectedGroupIds = new Set(); dashboardInteraction?.setSelection(viewState.selectedItemIds, viewState.selectedGroupIds); updateSelectionUi(); };
	const selectionBar = createSelectionActionBar({ ariaLabel: t("aaalice.workspace.selection.toolbar", "Selected layout actions"), actions: [
		{ id: "group", label: t("aaalice.workspace.selection.group", "Quick group"), iconName: "layout", showLabel: true, className: "aa-dashboard-selection-group", onSelect: () => {
			const ids = [...viewState.selectedItemIds]; if (ids.length < 2 || viewState.selectedGroupIds.size) return;
			askText(t("aaalice.workspace.group.create", "Create group"), t("aaalice.workspace.group.name", "Group name"), t("aaalice.workspace.group.default", "New group"), (name) => { clearSelection(); updateDashboard((current) => createGroup(current, page.id, ids, { name, tone: "blue" })); });
		} },
		{ id: "ungroup", label: t("aaalice.workspace.selection.ungroup", "Remove from group"), iconName: "close", onSelect: () => {
			const itemIds = [...viewState.selectedItemIds]; const groupIds = [...viewState.selectedGroupIds]; clearSelection();
			updateDashboard((current) => { let next = current; for (const groupId of groupIds) next = deleteGroup(next, page.id, groupId); const targetPage = next.pages.find((candidate) => candidate.id === page.id); const groupedIds = itemIds.filter((id) => targetPage?.items.find((item) => item.id === id)?.groupId); return groupedIds.length ? ungroupItems(next, page.id, groupedIds) : next; });
		} },
		{ id: "width", label: t("aaalice.workspace.selection.width", "Toggle selected widths"), iconName: "fit", onSelect: () => {
			const controls = page.items.filter((item) => viewState.selectedItemIds.has(item.id) && item.kind === "control"); if (!controls.length) return;
			const width = controls.every((item) => item.layout.columnSpan === DASHBOARD_GRID_COLUMNS) ? DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN : DASHBOARD_GRID_COLUMNS; updateDashboard((current) => resizeItems(current, controls.map((item) => item.id), width));
		} },
		{ id: "duplicate", label: t("aaalice.workspace.selection.duplicate", "Duplicate selected"), iconName: "copy", onSelect: () => {
			const ids = [...viewState.selectedItemIds]; if (!ids.length || viewState.selectedGroupIds.size) return;
			updateDashboard((current) => duplicateItems(current, page.id, ids));
		} },
		{ id: "move", label: t("aaalice.workspace.selection.move", "Move to page"), iconName: "move", onSelect: () => {
			const ids = [...viewState.selectedItemIds]; if (!ids.length || viewState.selectedGroupIds.size) return;
			const targets = model.pages.filter((entry) => entry.id !== page?.id); if (!targets.length) return;
			const pageSelect = selectControl({ ariaLabel: t("aaalice.workspace.target.page", "Page"), options: targets.map((entry) => ({ label: entry.name, value: entry.id })), value: targets[0].id });
			const body = el("div", { children: [field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect })] }); const footer = el("div");
			const dialog = createDialog({ title: t("aaalice.workspace.selection.move", "Move to page"), body, footer });
			footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { clearSelection(); updateDashboard((current) => moveItems(current, ids, pageSelect.value)); dialog.close(); } }));
		} },
		{ id: "remove", label: t("aaalice.workspace.selection.remove", "Remove selected"), iconName: "delete", className: "aa-dashboard-selection-remove", onSelect: async () => {
			const ids = [...viewState.selectedItemIds]; if (!ids.length || viewState.selectedGroupIds.size) return;
			const message = t("aaalice.workspace.selection.removeConfirm", "Remove {count} selected layout items?").replace("{count}", ids.length);
			if (!await confirmAction(message, { title: t("aaalice.workspace.selection.remove", "Remove selected"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
			clearSelection(); updateDashboard((current) => removeItems(current, ids));
		} },
		{ id: "clear", label: t("aaalice.workspace.selection.clear", "Clear selection"), iconName: "close", className: "aa-dashboard-selection-clear", onSelect: clearSelection },
	] });
	if (!page.items.length) grid.append(emptyState({ className: "aa-dashboard-page-empty", description: t("aaalice.workspace.empty.page", "Add controls from a compatible node's context menu.") }));
	scroll.append(grid);
	const searchEmpty = emptyState({ iconName: "search", className: "aa-workspace-empty aa-dashboard-search-empty", description: t("aaalice.workspace.search.noParameters", "No matching parameters.") }); searchEmpty.hidden = true; scroll.append(searchEmpty);
	if (pageSnapshot) {
		pageSnapshot.classList.add("is-page-leaving", `is-page-leaving-${pageTransition.direction}`);
		pageSnapshot.addEventListener("animationend", () => pageSnapshot.remove(), { once: true });
		setTimeout(() => pageSnapshot.remove(), 360);
	}
	const pageStage = el("div", { className: "aa-dashboard-page-stage", children: [...(pageSnapshot ? [pageSnapshot] : []), scroll] });
	const body = el("div", { className: "aa-dashboard-body", children: [pageStage, selectionBar.root] }); container.append(body);
	if (pageTransition?.initialEdge === "bottom") scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
	if (pageSnapshot) pageSnapshot.scrollTop = pageSnapshot._aaaliceSnapshotScrollTop || 0;
	updateSelectionUi = () => {
		const selectedItems = page.items.filter((item) => viewState.selectedItemIds.has(item.id)); const selectedGroups = page.groups.filter((group) => viewState.selectedGroupIds.has(group.id));
		viewState.selectedItemIds = new Set(selectedItems.map((item) => item.id)); viewState.selectedGroupIds = new Set(selectedGroups.map((group) => group.id));
		for (const card of grid.querySelectorAll("[data-dashboard-item-id]")) card.classList.toggle("is-selected", viewState.selectedItemIds.has(card.dataset.dashboardItemId));
		for (const group of grid.querySelectorAll("[data-dashboard-group-id]")) group.classList.toggle("is-selected", viewState.selectedGroupIds.has(group.dataset.dashboardGroupId));
		const count = selectedItems.length + selectedGroups.length; const canUngroup = selectedGroups.length > 0 || selectedItems.some((item) => item.groupId); const selectedControls = selectedItems.filter((item) => item.kind === "control");
		body.classList.toggle("has-selection-actions", count > 0);
		selectionBar.update({ count, summary: t("aaalice.workspace.selection.summary", "{count} selected").replace("{count}", count), actions: {
			group: { disabled: selectedItems.length < 2 || selectedGroups.length > 0 }, ungroup: { disabled: !canUngroup }, width: { disabled: !selectedControls.length || selectedGroups.length > 0 }, remove: { disabled: !selectedItems.length || selectedGroups.length > 0 }, clear: { disabled: count === 0 },
		} });
	};
	dashboardInteraction = bindDashboardInteractions(grid, { editMode, selectedItemIds: viewState.selectedItemIds, selectedGroupIds: viewState.selectedGroupIds,
		onSelectionChange: (items, groups) => { viewState.selectedItemIds = items; viewState.selectedGroupIds = groups; updateSelectionUi(); },
		onDropItems: (ids, target) => updateDashboard((current) => target.precise === false ? moveItems(current, ids, page.id, { groupId: target.groupId }) : moveItems(current, ids, page.id, target)), onDropGroup: (groupId, target) => updateDashboard((current) => moveGroup(current, page.id, groupId, target.row)),
		onResizeItem: (itemId, size) => updateDashboard((current) => resizeItem(current, itemId, size)),
	});
	updateSelectionUi();
	applyDashboardSearch = (value) => {
		const needle = String(value || "").trim().toLocaleLowerCase(); let visibleItems = 0;
		body.classList.toggle("is-searching", Boolean(needle));
		for (const item of grid.querySelectorAll("[data-dashboard-item-id]")) { const groupName = item.closest("[data-dashboard-group-id]")?.querySelector("h3")?.textContent || ""; const visible = !needle || String(item.dataset.searchText || "").includes(needle) || groupName.toLocaleLowerCase().includes(needle); item.hidden = !visible; if (visible) visibleItems++; }
		for (const group of grid.querySelectorAll("[data-dashboard-group-id]")) group.hidden = Boolean(needle) && !group.querySelector("[data-dashboard-item-id]:not([hidden])");
		searchEmpty.hidden = !needle || visibleItems > 0;
	};
	applyDashboardSearch(searchOpen ? query : "");
}

async function importDashboardPreset(file) {
	const body = el("div", { className: "aa-transfer-dialog-body", children: [
		createTransferHero({ iconName: "download", eyebrow: t("aaalice.workspace.transfer.preflight", "Safety check"), title: t("aaalice.workspace.transfer.readingPreset", "Reading layout backup…"), description: t("aaalice.workspace.transfer.readingPresetHint", "Checking layout structure, stable bindings and saved value types."), fileName: file.name, fileMeta: formatFileSize(file.size), tone: "dashboard" }),
		el("div", { className: "aa-transfer-loading", attrs: { role: "status" }, children: [el("span", "aa-transfer-loading__bar"), el("span", null, t("aaalice.workspace.transfer.preflighting", "Preparing import preview…"))] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.preset.import", "Import layout"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }));
	try {
		const snapshot = parseDashboardPreset(JSON.parse(await file.text())); const preflight = planDashboardPresetApplication(snapshot, (binding) => resolve(binding));
		const missing = preflight.issues;
		const pages = preflight.dashboard.pages;
		const groups = pages.flatMap((page) => page.groups);
		const compatible = preflight.ready;
		const savedValues = compatible.filter((item) => item.saved);
		const missingRows = missing.map((item) => el("div", { className: "aa-transfer-entry-row", children: [el("div", { children: [el("strong", null, item.binding?.controlId || item.key), el("small", null, item.binding ? `${item.binding.provider} · ${item.binding.valueType}` : item.key)] }), badge(item.status === "incompatible" ? t("aaalice.workspace.binding.incompatible", "Incompatible") : t("aaalice.workspace.binding.missing", "Missing"), { className: "is-warning" })] }));
		body.replaceChildren(
			createTransferHero({ iconName: missing.length ? "statusWarning" : "statusCheck", eyebrow: t("aaalice.workspace.transfer.review", "Import preview"), title: missing.length ? t("aaalice.workspace.transfer.presetNeedsReview", "Some controls need rebinding") : t("aaalice.workspace.transfer.readyToImport", "Ready to import"), description: missing.length ? t("aaalice.workspace.transfer.presetNeedsReviewHint", "The layout can still be restored. Missing cards stay visible and incompatible saved values are skipped.") : t("aaalice.workspace.transfer.presetReadyHint", "Every control binding matches this workflow. Layout and compatible values will be restored together."), fileName: file.name, fileMeta: `${formatFileSize(file.size)} · ${t("aaalice.workspace.transfer.jsonPreset", "JSON layout backup")}`, tone: missing.length ? "warning" : "success" }),
			createTransferStats([
				{ value: pages.length, label: t("aaalice.workspace.transfer.pages", "Pages"), tone: "primary" },
				{ value: groups.length, label: t("aaalice.workspace.transfer.groups", "Groups") },
				{ value: compatible.length, label: t("aaalice.workspace.transfer.matched", "Matched"), tone: "success" },
				{ value: missing.length, label: t("aaalice.workspace.transfer.needsRebinding", "Needs rebinding"), tone: missing.length ? "warning" : "neutral" },
			]),
			...(missing.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.unresolvedBindings", "Unresolved bindings"), description: t("aaalice.workspace.transfer.unresolvedBindingsHint", "They remain in the layout for manual rebinding after import."), count: missing.length, tone: "warning", open: true, children: [el("div", { className: "aa-transfer-entry-list", children: missingRows })] })] : []),
			el("div", { className: "aa-transfer-callout is-info", children: [icon("statusIdle"), el("p", null, `${savedValues.length} ${t("aaalice.workspace.transfer.compatibleValues", "compatible saved values will be restored. Values outside current ranges are safely skipped.")}`)] }),
		);
		const importLabel = t("aaalice.workspace.preset.import", "Import layout");
		const presetName = document.createElement("input"); presetName.maxLength = 80; presetName.value = availableDashboardPresetName(file.name);
		body.append(field({ label: t("aaalice.workspace.dashboardPreset.name", "Preset name"), control: presetName }));
		const primary = button({ label: importLabel, onClick: () => {
			setActionBusy(primary, true, importLabel, t("aaalice.workspace.transfer.importing", "Importing…"));
			try {
				const graph = app.graph; graph?.beforeChange?.();
				try {
					graph.extra ||= {};
					const nextPresetState = createDashboardPreset(dashboardPresetState(), presetName.value, snapshot);
					applyDashboardSnapshotPlan(preflight, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[EXTRA_KEY] = normalizeDashboard(next); } });
					graph.extra[DASHBOARD_PRESETS_EXTRA_KEY] = nextPresetState;
					activePageId = preflight.dashboard.pages[0]?.id || null;
				} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender(); }
				body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.presetImportComplete", "Layout imported"), description: missing.length ? t("aaalice.workspace.transfer.presetImportPartialHint", "The layout is ready. Unresolved cards were kept so you can rebind them manually.") : t("aaalice.workspace.transfer.presetImportCompleteHint", "Pages, layout groups, bindings and compatible saved values were restored."), count: compatible.length, countLabel: t("aaalice.workspace.transfer.controlsMatched", "controls matched") }));
				setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
			} catch (error) {
				body.prepend(createTransferResult({ title: t("aaalice.workspace.transfer.importFailed", "Import failed"), description: error.message, tone: "error" }));
				setActionBusy(primary, false, importLabel, "");
			}
		} });
		setDialogFooter(footer, el("span", "aa-transfer-footer-note", missing.length ? `${missing.length} ${t("aaalice.workspace.transfer.bindingsNeedAttention", "bindings need attention")}` : t("aaalice.workspace.transfer.allBindingsMatched", "All bindings matched")), button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), primary);
	} catch (error) {
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.invalidPreset", "Could not read this layout backup"), description: error.message, tone: "error" }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Close"), onClick: () => dialog.close() }));
	}
}

function entryEditor(entry = null) {
	const title = document.createElement("input"); title.value = entry?.title || "";
	const text = document.createElement("textarea"); text.value = entry?.text || "";
	const note = document.createElement("textarea"); note.value = entry?.note || "";
	const category = listboxControl({
		ariaLabel: t("aaalice.workspace.libraryUi.category", "Category"),
		value: entry?.categoryId || "",
		options: [
			{ label: t("aaalice.workspace.libraryUi.noCategory", "No category"), value: "" },
			...promptLibraryStore.snapshot.categories.map(categorySelectOption),
		],
	});
	const collections = multiSelectControl({
		ariaLabel: t("aaalice.workspace.libraryUi.collections", "Favorite folders"),
		values: (entry?.collections || []).map((membership) => membership.collectionId),
		options: promptLibraryStore.snapshot.collections.map((item) => ({ label: favoriteFolderName(item), value: item.id })),
	});
	const tags = document.createElement("input"); tags.value = promptLibraryStore.tagNames(entry?.tagIds || []).join(", ");
	const preview = document.createElement("input"); preview.type = "file"; preview.accept = "image/png,image/jpeg,image/gif,image/webp"; preview.setAttribute("aria-label", t("aaalice.workspace.libraryUi.choosePreview", "Choose preview image"));
	const previewMedia = el("div", "aa-library-entry-preview-media");
	const previewFileName = el("span", "aa-library-entry-preview-name");
	const previewAction = el("div", "aa-library-entry-preview-action");
	const previewFooter = el("div", { className: "aa-library-entry-preview-footer", children: [previewFileName, previewAction] });
	const previewPicker = el("label", { className: "aa-library-entry-preview-picker", children: [
		preview,
		previewMedia,
		el("span", { className: "aa-library-entry-preview-overlay", children: [icon("upload"), el("strong", null, t("aaalice.workspace.libraryUi.choosePreview", "Choose preview image"))] }),
	] });
	const existingPreviewUrl = entry?.previewHash ? api.apiURL(`/aaalice/prompt-library/assets/${entry.previewHash}`) : "";
	let selectedPreviewUrl = "";
	let removePreviewRequested = false;
	const releaseSelectedPreview = () => {
		if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
		selectedPreviewUrl = "";
	};
	const renderPreview = () => {
		const file = preview.files?.[0];
		const imageUrl = selectedPreviewUrl || (!removePreviewRequested ? existingPreviewUrl : "");
		previewMedia.replaceChildren();
		if (imageUrl) {
			const image = document.createElement("img"); image.src = imageUrl; image.alt = title.value || entry?.title || ""; previewMedia.append(image);
		} else {
			previewMedia.append(el("span", { className: "aa-library-entry-preview-empty", children: [icon("note"), el("span", null, t("aaalice.workspace.libraryUi.previewEmptyHint", "Click to choose a preview image"))] }));
		}
		previewPicker.classList.toggle("has-image", Boolean(imageUrl));
		previewFileName.textContent = file?.name || (imageUrl ? t("aaalice.workspace.libraryUi.currentPreview", "Current preview image") : "");
		previewAction.replaceChildren();
		if (file) {
			previewAction.append(button({ label: t("aaalice.workspace.libraryUi.clearPreviewSelection", "Clear selected image"), iconName: "delete", variant: "ghost", size: "sm", className: "aa-library-entry-preview-remove", onClick: () => { preview.value = ""; releaseSelectedPreview(); renderPreview(); } }));
		} else if (existingPreviewUrl) {
			previewAction.append(button({
				label: removePreviewRequested ? t("aaalice.workspace.libraryUi.undoRemovePreview", "Keep current image") : t("aaalice.workspace.libraryUi.removePreview", "Remove current preview"),
				iconName: removePreviewRequested ? "refresh" : "delete", variant: "ghost", size: "sm", className: `aa-library-entry-preview-remove${removePreviewRequested ? " is-undo" : ""}`,
				onClick: () => { removePreviewRequested = !removePreviewRequested; renderPreview(); },
			}));
		}
		previewFooter.hidden = !(file || existingPreviewUrl);
	};
	preview.addEventListener("change", () => {
		releaseSelectedPreview();
		const file = preview.files?.[0];
		if (file) { selectedPreviewUrl = URL.createObjectURL(file); removePreviewRequested = false; }
		renderPreview();
	});
	renderPreview();
	const contentSection = el("section", { className: "aa-library-entry-section is-content", children: [
		el("h3", null, t("aaalice.workspace.libraryUi.contentDetails", "Prompt content")),
		field({ label: t("aaalice.workspace.libraryUi.title", "Title"), control: title }),
		field({ label: t("aaalice.workspace.libraryUi.prompt", "Prompt"), control: text, className: "aa-library-entry-prompt-field" }),
	] });
	const organizeSection = el("section", { className: "aa-library-entry-section is-organize", children: [
		el("h3", null, t("aaalice.workspace.libraryUi.organization", "Organization")),
		el("div", { className: "aa-library-entry-organize-grid", children: [
			field({ label: t("aaalice.workspace.libraryUi.category", "Category"), control: category }),
			field({ label: t("aaalice.workspace.libraryUi.tags", "Tags"), control: tags }),
		] }),
		field({ label: t("aaalice.workspace.libraryUi.collections", "Favorite folders"), control: collections, className: "aa-library-entry-favorites-field" }),
		field({ label: t("aaalice.workspace.libraryUi.note", "Note"), control: note, className: "aa-library-entry-note-field" }),
	] });
	const previewSection = el("section", { className: "aa-library-entry-section is-preview", children: [
		el("h3", null, t("aaalice.workspace.libraryUi.preview", "Preview image")),
		el("div", { className: "aa-library-entry-preview-card", children: [previewPicker, previewFooter] }),
	] });
	const body = el("div", { className: "aa-library-entry-form", children: [contentSection, el("div", { className: "aa-library-entry-lower", children: [organizeSection, previewSection] })] });
	const footer = el("div"); const dialog = createDialog({
		title: entry ? t("aaalice.workspace.libraryUi.editEntry", "Edit prompt entry") : t("aaalice.workspace.libraryUi.addEntry", "Add prompt entry"),
		body, footer, size: "md", className: "aa-library-entry-dialog", onRequestClose: () => { releaseSelectedPreview(); return true; },
	});
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => { releaseSelectedPreview(); dialog.close(); } }), button({ label: t("aaalice.common.save", "Save"), iconName: "statusCheck", onClick: async () => {
		const data = { title: title.value.trim(), text: text.value, note: note.value, categoryId: category.value || null, collectionIds: collections.values(), tags: tags.value.split(",").map((item) => item.trim()).filter(Boolean) };
		try {
			const saved = entry ? await promptLibraryStore.updateEntry(entry.id, data) : await promptLibraryStore.createEntry(data);
			if (removePreviewRequested && !preview.files?.[0]) await promptLibraryStore.deletePreview(saved.id);
			if (preview.files?.[0]) await promptLibraryStore.uploadPreview(saved.id, preview.files[0]);
			releaseSelectedPreview(); dialog.close();
		} catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message }); }
	} }));
}

function openTaxonomyManager() {
	let kind = "categories"; let editingId = null; let dialog;
	const list = el("div", "aa-taxonomy-list");
	const summary = el("div", "aa-taxonomy-summary");
	const addInput = document.createElement("input"); addInput.type = "text";
	const addButton = button({ label: t("aaalice.workspace.libraryUi.add", "Add"), iconName: "add", onClick: () => addItem() });
	const tabs = segmentedControl({
		value: kind, ariaLabel: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), className: "aa-taxonomy-tabs",
		options: [
			{ value: "categories", label: t("aaalice.workspace.libraryUi.categories", "Categories"), iconName: "layout" },
			{ value: "collections", label: t("aaalice.workspace.libraryUi.collections", "Favorite folders"), iconName: "favorite" },
		],
		onChange: (value) => { kind = value; editingId = null; draw(); },
	});
	const showError = (error) => app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), detail: error.message });
	const usageCount = (item) => promptLibraryStore.usage(kind, item.id);
	const reorder = async (items, index, offset) => {
		const target = index + offset; if (target < 0 || target >= items.length) return;
		const ids = items.map((item) => item.id); [ids[index], ids[target]] = [ids[target], ids[index]];
		try { await promptLibraryStore.reorder({ kind, orderedIds: ids }); draw(); } catch (error) { showError(error); }
	};
	const saveItem = async (item, input, colorInput = null, isCategory = false) => {
		const name = input.value.trim(); if (!name) return;
		try {
			if (isCategory) await promptLibraryStore.updateCategory(item.id, { name, color: colorInput.value }); else await promptLibraryStore.updateCollection(item.id, { name });
			editingId = null; draw();
		} catch (error) { showError(error); }
	};
	const remove = async (item, isCategory) => {
		const title = isCategory ? t("aaalice.workspace.libraryUi.deleteCategoryTitle", "Delete category") : t("aaalice.workspace.libraryUi.deleteCollectionTitle", "Delete favorite folder");
		const consequence = isCategory ? t("aaalice.workspace.libraryUi.deleteCategoryHint", "Entries in this category will become uncategorized. This cannot be undone.") : t("aaalice.workspace.libraryUi.deleteCollectionHint", "This favorite membership will be removed from its entries. This cannot be undone.");
		if (!await confirmAction(`${isCategory ? item.name : favoriteFolderName(item)}\n\n${consequence}`, { title, confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
		try {
			if (isCategory) await promptLibraryStore.deleteCategory(item.id); else await promptLibraryStore.deleteCollection(item.id);
			draw();
		} catch (error) { showError(error); }
	};
	const draw = () => {
		const isCategory = kind === "categories"; const items = promptLibraryStore.snapshot[kind];
		const noun = isCategory ? t("aaalice.workspace.libraryUi.categories", "Categories") : t("aaalice.workspace.libraryUi.collections", "Favorite folders");
		const hint = isCategory ? t("aaalice.workspace.libraryUi.categoriesHint", "Each entry belongs to one category for its primary organization.") : t("aaalice.workspace.libraryUi.collectionsHint", "Favorite folders group entries across categories for flexible reuse.");
		summary.replaceChildren(el("div", { children: [el("strong", null, noun), el("p", null, hint)] }), badge(String(items.length), { className: "aa-taxonomy-count" }));
		addInput.placeholder = isCategory ? t("aaalice.workspace.libraryUi.newCategory", "New category name") : t("aaalice.workspace.libraryUi.newCollection", "New favorite-folder name");
		addInput.setAttribute("aria-label", addInput.placeholder);
		list.replaceChildren();
		if (!items.length) list.append(emptyState({ iconName: isCategory ? "layout" : "favorite", className: "aa-taxonomy-empty", title: isCategory ? t("aaalice.workspace.libraryUi.noCategories", "No categories yet") : t("aaalice.workspace.libraryUi.noCollections", "No favorite folders yet"), description: t("aaalice.workspace.libraryUi.taxonomyEmptyHint", "Create one below to start organizing your prompt entries.") }));
		items.forEach((item, index) => {
			if (editingId === item.id) {
				const input = document.createElement("input"); input.type = "text"; input.value = item.name; input.setAttribute("aria-label", t("aaalice.workspace.libraryUi.name", "Name"));
				const colorInput = isCategory ? document.createElement("input") : null;
				if (colorInput) { colorInput.type = "color"; colorInput.value = item.color || "#7C3AED"; colorInput.setAttribute("aria-label", t("aaalice.workspace.libraryUi.categoryColor", "Category color")); }
				const row = el("div", { className: `aa-taxonomy-row is-editing${isCategory ? " is-category" : ""}`, children: [input, ...(colorInput ? [colorInput] : []), el("div", { className: "aa-taxonomy-row-actions", children: [
					button({ label: t("aaalice.common.save", "Save"), iconName: "statusCheck", size: "sm", className: "aa-taxonomy-save-action", onClick: () => saveItem(item, input, colorInput, isCategory) }),
					iconButton({ iconName: "close", label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => { editingId = null; draw(); } }),
				] })] });
				input.addEventListener("keydown", (event) => { if (event.key === "Enter") saveItem(item, input, colorInput, isCategory); else if (event.key === "Escape") { editingId = null; draw(); } });
				list.append(row); queueMicrotask(() => { input.focus(); input.select(); }); return;
			}
			const defaultFavorite = !isCategory && isDefaultCollection(item);
			const actions = el("div", { className: "aa-taxonomy-row-actions", children: [
				iconButton({ iconName: "moveDown", label: t("aaalice.workspace.libraryUi.moveUp", "Move up"), className: "aa-taxonomy-move-up", variant: "ghost", disabled: index === 0, onClick: () => reorder(items, index, -1) }),
				iconButton({ iconName: "moveDown", label: t("aaalice.workspace.libraryUi.moveDown", "Move down"), variant: "ghost", disabled: index === items.length - 1, onClick: () => reorder(items, index, 1) }),
				button({ label: isCategory ? t("aaalice.workspace.libraryUi.editCategory", "Edit category") : t("aaalice.workspace.libraryUi.rename", "Rename"), iconName: "settings", size: "sm", className: "aa-taxonomy-edit-action", variant: "ghost", onClick: () => { editingId = item.id; draw(); } }),
				iconButton({ iconName: "delete", label: defaultFavorite ? t("aaalice.workspace.libraryUi.defaultFavoriteCannotDelete", "The default favorite folder cannot be deleted") : t("aaalice.common.delete", "Delete"), className: "aa-taxonomy-delete-action", variant: "ghost", disabled: defaultFavorite, onClick: () => remove(item, isCategory) }),
			] });
			const leading = isCategory ? applyCategoryColor(el("span", { className: "aa-taxonomy-color-swatch", attrs: { "aria-hidden": "true" } }), item) : null;
			const count = usageCount(item); list.append(createListRow({ title: isCategory ? item.name : favoriteFolderName(item), description: `${count} ${t("aaalice.workspace.libraryUi.entriesCount", "entries")}`, leading, actions: [actions] }));
		});
	};
	const addItem = async () => {
		const name = addInput.value.trim(); if (!name || addButton.disabled) return;
		addButton.disabled = true;
		try {
			if (kind === "categories") await promptLibraryStore.createCategory({ name }); else await promptLibraryStore.createCollection({ name });
			addInput.value = ""; draw(); addInput.focus();
		} catch (error) { showError(error); }
		finally { addButton.disabled = false; }
	};
	const body = el("div", { className: "aa-taxonomy-manager", children: [tabs, summary, list] });
	const footer = el("div", { className: "aa-taxonomy-footer", children: [addInput, addButton, button({ label: t("aaalice.workspace.done", "Done"), variant: "secondary", onClick: () => dialog.close() })] });
	addInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } });
	dialog = createDialog({ title: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), body, footer, size: "md", className: "aa-taxonomy-dialog" });
	draw();
}

function openMoveSelected(selected) {
	const entryIds = [...selected];
	if (!entryIds.length) return;
	const target = document.createElement("select");
	target.add(new Option(t("aaalice.workspace.libraryUi.chooseTargetCategory", "Choose a target category"), "__choose__", true, true));
	target.options[0].disabled = true;
	target.add(new Option(t("aaalice.workspace.libraryUi.noCategory", "No category"), "__none__"));
	for (const category of promptLibraryStore.snapshot.categories) target.add(nativeCategoryOption(category));
	const body = el("div", { className: "aa-library-move-dialog", children: [
		el("p", null, `${entryIds.length} ${t("aaalice.workspace.libraryUi.entriesSelectedForMove", "entries will be moved together.")}`),
		field({ label: t("aaalice.workspace.libraryUi.targetCategory", "Target category"), control: target }),
	] });
	const footer = el("div");
	let dialog;
	const confirm = button({
		label: t("aaalice.workspace.libraryUi.moveConfirm", "Move"), iconName: "move", disabled: true,
		onClick: async () => {
			if (target.value === "__choose__" || confirm.disabled) return;
			confirm.disabled = true;
			try {
				await promptLibraryStore.batchEntries({ entryIds, categoryId: target.value === "__none__" ? null : target.value });
				dialog.close();
			} catch (error) {
				confirm.disabled = false;
				app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.libraryUi.moveSelected", "Move selected entries"), detail: error.message });
			}
		},
	});
	target.addEventListener("change", () => { confirm.disabled = target.value === "__choose__"; });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirm);
	dialog = createDialog({ title: t("aaalice.workspace.libraryUi.moveSelected", "Move selected entries"), body, footer, size: "sm", className: "aa-library-move-dialog-shell" });
}

function openLibraryExport(context) {
	const hasSelection = context.selected.size > 0;
	const hasFilters = Boolean(context.categoryId || context.collectionId);
	let scope = hasSelection ? "selected" : hasFilters ? "filtered" : "all";
	const body = el("div", "aa-transfer-dialog-body");
	const footer = el("div");
	const scopeOptions = [
		{ value: "all", label: t("aaalice.workspace.transfer.entireLibrary", "Entire library"), description: t("aaalice.workspace.transfer.entireLibraryHint", "A complete portable backup of every prompt entry.") },
		...(hasFilters ? [{ value: "filtered", label: t("aaalice.workspace.transfer.currentFilter", "Current filter"), description: t("aaalice.workspace.transfer.currentFilterHint", "Only entries matching the active category and favorite-folder filters.") }] : []),
		...(hasSelection ? [{ value: "selected", label: `${t("aaalice.workspace.transfer.selectedEntries", "Selected entries")} (${context.selected.size})`, description: t("aaalice.workspace.transfer.selectedEntriesHint", "Only the entries you selected in the library.") }] : []),
	];
	const scopeList = el("div", { className: "aa-transfer-scope-list", attrs: { role: "radiogroup", "aria-label": t("aaalice.workspace.transfer.exportScope", "Export scope") } });
	const summary = el("div");
	const primary = button({ label: t("aaalice.workspace.libraryUi.export", "Export"), onClick: async () => {
		setActionBusy(primary, true, t("aaalice.workspace.libraryUi.export", "Export"), t("aaalice.workspace.transfer.exporting", "Exporting…"));
		try {
			const prepared = await promptLibraryStore.exportArchive(libraryExportPayload(scope, context));
			downloadUrl(prepared.url, "aaalice-prompt-library.zip");
			body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.exportComplete", "Export ready"), description: t("aaalice.workspace.transfer.exportCompleteHint", "The ZIP backup has been downloaded and can be imported on another ComfyUI installation."), count: libraryEntriesForScope(scope, context).length, countLabel: t("aaalice.workspace.transfer.entries", "entries") }));
			setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
		} catch (error) {
			body.prepend(createTransferResult({ title: t("aaalice.workspace.transfer.exportFailed", "Export failed"), description: error.message, tone: "error" }));
			setActionBusy(primary, false, t("aaalice.workspace.libraryUi.export", "Export"), "");
		}
	} });
	const draw = () => {
		scopeList.replaceChildren();
		for (const option of scopeOptions) {
			const input = document.createElement("input"); input.type = "radio"; input.name = "aa-library-export-scope"; input.value = option.value; input.checked = scope === option.value;
			input.addEventListener("change", () => { scope = option.value; draw(); });
			scopeList.append(el("label", { className: `aa-transfer-scope${scope === option.value ? " is-selected" : ""}`, children: [input, el("span", "aa-transfer-scope__indicator"), el("div", { children: [el("strong", null, option.label), el("small", null, option.description)] })] }));
		}
		const entries = libraryEntriesForScope(scope, context);
		const categoryIds = new Set(entries.map((entry) => entry.categoryId).filter(Boolean));
		const collectionIds = new Set(entries.flatMap((entry) => entry.collections.map((item) => item.collectionId)));
		const previewCount = entries.filter((entry) => entry.previewHash).length;
		summary.replaceChildren(createTransferStats([
			{ value: entries.length, label: t("aaalice.workspace.transfer.entries", "Entries"), tone: "primary" },
			{ value: categoryIds.size, label: t("aaalice.workspace.libraryUi.categories", "Categories") },
			{ value: collectionIds.size, label: t("aaalice.workspace.libraryUi.collections", "Favorite folders") },
			{ value: previewCount, label: t("aaalice.workspace.transfer.previews", "Previews") },
		]));
		primary.disabled = entries.length === 0;
	};
	body.append(
		createTransferHero({ iconName: "upload", eyebrow: t("aaalice.workspace.transfer.backup", "Portable backup"), title: t("aaalice.workspace.transfer.exportLibraryTitle", "Export prompt library"), description: t("aaalice.workspace.transfer.exportLibraryHint", "Choose what to include. Related categories, collections, tags and preview images are bundled automatically."), fileName: "aaalice-prompt-library.zip", fileMeta: t("aaalice.workspace.transfer.zipArchive", "ZIP archive"), tone: "library" }),
		el("section", { className: "aa-transfer-block", children: [el("h3", null, t("aaalice.workspace.transfer.exportScope", "Export scope")), scopeList] }), summary,
	);
	const dialog = createDialog({ title: t("aaalice.workspace.libraryUi.export", "Export prompt library"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), primary);
	draw();
}

function renderLibrary(container) {
	const viewState = workspaceViewState.library;
	let query = viewState.query; const categoryId = viewState.categoryId; const collectionId = viewState.collectionId;
	const selected = viewState.selected;
	const searchOpen = viewState.searchOpen;
	const focusSearch = viewState.focusSearch; viewState.focusSearch = false;
	let drawEntries = () => {};
	const search = createCollapsibleSearch({
		open: searchOpen, value: query, focus: focusSearch,
		label: t("aaalice.workspace.search.library", "Search prompt library"), closeLabel: t("aaalice.workspace.search.close", "Close search"), placeholder: t("aaalice.workspace.search.library", "Search prompt library"),
		onToggle: (open) => { viewState.searchOpen = open; viewState.focusSearch = open; scheduleRender(); },
		onInput: (value) => { query = value; viewState.query = value; drawEntries(); },
	});
	const category = selectControl({ ariaLabel: t("aaalice.promptSelector.allCategories", "All categories"), value: categoryId, className: "aa-library-filter-select", options: [{ label: t("aaalice.promptSelector.allCategories", "All categories"), value: "" }, ...promptLibraryStore.snapshot.categories.map(categorySelectOption)], onChange: (value) => { viewState.categoryId = value; scheduleRender(); } });
	const collection = selectControl({ ariaLabel: t("aaalice.promptSelector.allCollections", "All favorite folders"), value: collectionId, className: "aa-library-filter-select", options: [{ label: t("aaalice.promptSelector.allCollections", "All favorite folders"), value: "" }, ...promptLibraryStore.snapshot.collections.map((item) => ({ label: favoriteFolderName(item), value: item.id }))], onChange: (value) => { viewState.collectionId = value; scheduleRender(); } });
	const libraryActions = [
		button({ label: t("aaalice.workspace.libraryUi.addEntry", "Add entry"), iconName: "add", size: "sm", onClick: () => entryEditor() }),
		button({ label: t("aaalice.workspace.libraryUi.manageAction", "Categories & favorites"), iconName: "settings", variant: "ghost", size: "sm", onClick: openTaxonomyManager }),
		iconButton({ iconName: "upload", label: selected.size ? `${t("aaalice.workspace.libraryUi.exportSelected", "Export selected")} (${selected.size})` : t("aaalice.workspace.libraryUi.export", "Export"), variant: "ghost", onClick: () => openLibraryExport({ selected, categoryId, collectionId }) }),
		iconButton({ iconName: "download", label: t("aaalice.workspace.libraryUi.import", "Import"), variant: "ghost", onClick: () => pickFile(".zip,.json,application/zip,application/json", importLibrary) }),
		search.toggle,
	];
	const toolbar = createWorkspaceToolbar(searchOpen ? [search.panel] : libraryActions, { className: `aa-library-toolbar${searchOpen ? " is-searching" : ""}`, label: t("aaalice.workspace.libraryUi.actions", "Library actions") });
	const list = el("div", "aa-library-list");
	let visibleEntries = [];
	let clearsSelection = false;
	const selectedCount = el("span", "aa-library-selection-count");
	const moveSelected = button({
		label: t("aaalice.workspace.libraryUi.moveAction", "Move"), iconName: "move", variant: "ghost", size: "sm", className: "aa-library-move-selected", disabled: selected.size === 0,
		onClick: () => openMoveSelected(selected),
	});
	const exportSelected = iconButton({
		iconName: "upload", label: t("aaalice.workspace.libraryUi.exportSelected", "Export selected"), variant: "ghost", className: "aa-library-export-selected", disabled: selected.size === 0,
		onClick: () => openLibraryExport({ selected, categoryId, collectionId }),
	});
	const deleteSelected = iconButton({
		iconName: "delete", label: t("aaalice.workspace.libraryUi.deleteSelected", "Delete selected"), variant: "ghost", className: "aa-library-delete-selected", disabled: selected.size === 0,
		onClick: async () => {
			const entryIds = [...selected];
			if (!entryIds.length) return;
			const message = `${entryIds.length} ${t("aaalice.workspace.libraryUi.deleteSelectedConfirm", "selected entries will be permanently deleted. PromptSelector references to them will become missing.")}`;
			if (!await confirmAction(message, { title: t("aaalice.workspace.libraryUi.deleteSelected", "Delete selected"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
			deleteSelected.disabled = true;
			try {
				await promptLibraryStore.deleteEntries(entryIds);
				selected.clear();
			} catch (error) {
				deleteSelected.disabled = false;
				app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.libraryUi.deleteSelected", "Delete selected"), detail: error.message });
			}
		},
	});
	const selectionToggle = button({
		label: t("aaalice.workspace.libraryUi.selectAll", "Select all"), iconName: "statusCheck", variant: "ghost", size: "sm", className: "aa-library-selection-toggle",
		onClick: () => {
			if (clearsSelection) selected.clear();
			else for (const entry of visibleEntries) selected.add(entry.id);
			drawEntries(false);
		},
	});
	const selectionActions = el("div", { className: "aa-library-selection-actions", children: [selectedCount, moveSelected, exportSelected, deleteSelected, selectionToggle] });
	container.append(toolbar, el("div", { className: "aa-library-filters", children: [category, collection] }), selectionActions, list);
	const renderEntry = (entry) => {
		const isSelected = selected.has(entry.id);
		const row = el("article", `aa-library-entry${isSelected ? " is-selected" : ""}`);
		const preview = createSelectableImagePreview({
			source: entry.previewHash ? api.apiURL(`/aaalice/prompt-library/assets/${entry.previewHash}`) : "",
			title: entry.title,
			label: `${t("aaalice.workspace.libraryUi.select", "Select")} ${entry.title}`,
			className: "aa-library-entry-preview",
			selected: isSelected,
			inputId: `aa-library-entry-${entry.id}`,
			onChange: (checked) => { if (checked) selected.add(entry.id); else selected.delete(entry.id); scheduleRender(); },
		});
		row.append(preview.root);
		const entryCategory = promptLibraryStore.category(entry.categoryId);
		const tagNames = promptLibraryStore.tagNames(entry.tagIds || []).slice(0, 3);
		const meta = el("div", "aa-library-entry-meta");
		if (entryCategory) meta.append(applyCategoryColor(el("span", "aa-library-chip is-category", entryCategory.name), entryCategory));
		for (const name of tagNames) meta.append(el("span", "aa-library-chip", name));
		const copy = el("label", { className: "aa-library-entry-copy", attrs: {
			for: `aa-library-entry-${entry.id}`,
			tabindex: "0",
			role: "checkbox",
			"aria-checked": String(isSelected),
			"aria-label": `${isSelected ? t("aaalice.promptSelector.selected", "selected") : t("aaalice.workspace.libraryUi.select", "Select")} ${entry.title}`,
		}, children: [el("strong", null, entry.title), el("p", null, entry.text), meta] });
		copy.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			preview.input.click();
		});
		bindPromptEntryDetails(copy, entry);
		const actions = el("div", { className: "aa-library-entry-actions", children: [iconButton({ iconName: "settings", label: t("aaalice.workspace.libraryUi.edit", "Edit"), className: "aa-library-entry-edit", variant: "ghost", onClick: () => entryEditor(entry) }), iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), className: "aa-library-entry-delete", variant: "ghost", onClick: async () => { if (await confirmAction(t("aaalice.workspace.libraryUi.deleteEntryConfirm", "Delete this prompt entry?"))) { await promptLibraryStore.deleteEntry(entry.id); selected.delete(entry.id); } } })] });
		row.append(copy, actions); return row;
	};
	const virtualList = mountVirtualList(list, { rowHeight: 74, gap: 6, overscan: 5, onBeforeRender: () => { closeImagePreview(); closePromptEntryDetails(); }, renderItem: renderEntry, renderEmpty: () => {
		const isLibraryEmpty = promptLibraryStore.snapshot.entries.length === 0;
		return emptyState({ iconName: isLibraryEmpty ? "note" : "filter", className: "aa-workspace-empty aa-library-empty", title: isLibraryEmpty ? t("aaalice.workspace.libraryUi.emptyTitle", "Your library is empty") : t("aaalice.workspace.libraryUi.noMatchTitle", "No matching entries"), description: isLibraryEmpty ? t("aaalice.workspace.libraryUi.emptyDescription", "Add your first prompt entry to reuse it across selectors.") : t("aaalice.promptSelector.noResults", "No matching prompt entries."), actions: isLibraryEmpty ? [button({ label: t("aaalice.workspace.libraryUi.addEntry", "Add entry"), iconName: "add", onClick: () => entryEditor() })] : [] });
	} });
	list.addEventListener("scroll", () => { viewState.scrollTop = list.scrollTop; }, { passive: true });
	drawEntries = (reset = true) => {
		closeImagePreview();
		visibleEntries = promptLibraryStore.filterEntries({ query, categoryId, collectionId });
		selectedCount.textContent = `${selected.size} ${t("aaalice.workspace.libraryUi.selectedShort", "selected")}`;
		clearsSelection = selected.size > 0 && (!visibleEntries.length || visibleEntries.every((entry) => selected.has(entry.id)));
		const actionLabel = clearsSelection ? t("aaalice.workspace.libraryUi.clearAll", "Clear all") : t("aaalice.workspace.libraryUi.selectAll", "Select all");
		selectionToggle.replaceChildren(icon(clearsSelection ? "close" : "statusCheck"), el("span", "aa-ui-button__label", actionLabel));
		selectionToggle.classList.toggle("is-clear", clearsSelection);
		selectionToggle.disabled = !visibleEntries.length && selected.size === 0;
		moveSelected.disabled = selected.size === 0;
		exportSelected.disabled = selected.size === 0;
		deleteSelected.disabled = selected.size === 0;
		selectionToggle.setAttribute("aria-label", actionLabel);
		selectionToggle.title = actionLabel;
		selectionActions.classList.toggle("has-selection", selected.size > 0);
		virtualList.setItems(visibleEntries, { preserveScroll: !reset });
		if (reset) viewState.scrollTop = 0;
	};
	drawEntries(false); list.scrollTop = viewState.scrollTop || 0; virtualList.refresh();
}

async function importLibrary(file) {
	const controller = new AbortController();
	const body = el("div", "aa-transfer-dialog-body");
	const footer = el("div");
	let importToken = "";
	let dialog;
	const discardStage = () => { if (!importToken) return; const token = importToken; importToken = ""; void promptLibraryStore.discardImport(token).catch(() => {}); };
	const close = () => { controller.abort(); discardStage(); dialog.close(); };
	dialog = createDialog({ title: t("aaalice.workspace.libraryUi.importTitle", "Import prompt library"), body, footer, size: "lg", className: "aa-transfer-dialog", onRequestClose: () => { controller.abort(); discardStage(); return true; } });
	body.append(
		createTransferHero({ iconName: "download", eyebrow: t("aaalice.workspace.transfer.preflight", "Safety check"), title: t("aaalice.workspace.transfer.readingFile", "Reading backup…"), description: t("aaalice.workspace.transfer.readingFileHint", "Checking the archive structure, entries and preview assets before anything is written."), fileName: file.name, fileMeta: formatFileSize(file.size), tone: "library" }),
		el("div", { className: "aa-transfer-loading", attrs: { role: "status" }, children: [el("span", "aa-transfer-loading__bar"), el("span", null, t("aaalice.workspace.transfer.preflighting", "Preparing import preview…"))] }),
	);
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: close }));
	try {
		const result = await promptLibraryStore.importPreflight(file, { signal: controller.signal });
		importToken = result.token;
		const groups = result.preflight;
		const conflicts = [...groups.conflict.map((entry) => ({ ...entry, conflictKind: "conflict" })), ...groups.duplicate.map((entry) => ({ ...entry, conflictKind: "duplicate" }))];
		const resolutions = Object.fromEntries(conflicts.map((entry) => [entry.id, "local"]));
		const resolutionSelects = new Map();
		const conflictRows = el("div", "aa-transfer-conflicts");
		const policyOptions = () => [
			new Option(t("aaalice.workspace.libraryUi.keepLocal", "Keep local"), "local"),
			new Option(t("aaalice.workspace.libraryUi.useImport", "Use import"), "import"),
			new Option(t("aaalice.workspace.libraryUi.createDuplicate", "Create duplicate"), "duplicate"),
		];
		for (const entry of conflicts) {
			const select = document.createElement("select"); select.setAttribute("aria-label", entry.title || entry.id); select.append(...policyOptions());
			select.addEventListener("change", () => { resolutions[entry.id] = select.value; }); resolutionSelects.set(entry.id, select);
			conflictRows.append(el("div", { className: "aa-transfer-conflict-row", children: [
				el("div", { children: [el("strong", null, entry.title || entry.id), el("small", null, entry.conflictKind === "duplicate" ? t("aaalice.workspace.transfer.sameContent", "The same content already exists locally.") : t("aaalice.workspace.transfer.changedContent", "This entry has the same ID but different content."))] }), select,
			] }));
		}
		const bulkSelect = document.createElement("select"); bulkSelect.setAttribute("aria-label", t("aaalice.workspace.transfer.applyToAll", "Apply to all conflicts")); bulkSelect.append(new Option(t("aaalice.workspace.transfer.applyToAll", "Apply to all…"), ""), ...policyOptions());
		bulkSelect.addEventListener("change", () => { if (!bulkSelect.value) return; for (const [id, select] of resolutionSelects) { select.value = bulkSelect.value; resolutions[id] = bulkSelect.value; } bulkSelect.value = ""; });
		const total = groups.new.length + groups.update.length + groups.conflict.length + groups.duplicate.length;
		body.replaceChildren(
			createTransferHero({ iconName: groups.invalid.length ? "statusWarning" : conflicts.length ? "statusWarning" : "statusCheck", eyebrow: t("aaalice.workspace.transfer.review", "Import preview"), title: groups.invalid.length ? t("aaalice.workspace.transfer.cannotImport", "This backup needs attention") : conflicts.length ? t("aaalice.workspace.transfer.resolveConflicts", "Choose how to handle conflicts") : t("aaalice.workspace.transfer.readyToImport", "Ready to import"), description: groups.invalid.length ? t("aaalice.workspace.transfer.invalidBlocksImport", "Invalid entries must be fixed in the source backup before it can be imported.") : conflicts.length ? t("aaalice.workspace.transfer.resolveConflictsHint", "Nothing is changed until you confirm. Each conflicting entry starts with the safest option: keep local.") : t("aaalice.workspace.transfer.readyToImportHint", "The backup passed validation. Review the summary, then import it in one transaction."), fileName: file.name, fileMeta: `${formatFileSize(file.size)} · ${file.name.toLocaleLowerCase().endsWith(".json") ? t("aaalice.workspace.transfer.legacyJson", "Legacy JSON") : t("aaalice.workspace.transfer.zipArchive", "ZIP archive")}`, tone: groups.invalid.length ? "danger" : conflicts.length ? "warning" : "success" }),
			createTransferStats([
				{ value: groups.new.length, label: t("aaalice.workspace.libraryUi.new", "New"), tone: "success" },
				{ value: groups.update.length, label: t("aaalice.workspace.libraryUi.existing", "Updates"), tone: "info" },
				{ value: groups.conflict.length, label: t("aaalice.workspace.libraryUi.conflicts", "Conflicts"), tone: groups.conflict.length ? "warning" : "neutral" },
				{ value: groups.duplicate.length, label: t("aaalice.workspace.libraryUi.duplicates", "Duplicates"), tone: groups.duplicate.length ? "warning" : "neutral" },
				{ value: groups.invalid.length, label: t("aaalice.workspace.libraryUi.invalid", "Invalid"), tone: groups.invalid.length ? "danger" : "neutral" },
			]),
			...(conflicts.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.conflictDecisions", "Conflict decisions"), description: t("aaalice.workspace.transfer.conflictDecisionsHint", "Review individually or apply one policy to all."), count: conflicts.length, tone: "warning", open: true, children: [el("div", { className: "aa-transfer-bulk", children: [el("span", null, t("aaalice.workspace.transfer.bulkPolicy", "Bulk policy")), bulkSelect] }), conflictRows] })] : []),
			...(groups.invalid.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.invalidEntries", "Invalid entries"), description: t("aaalice.workspace.transfer.invalidEntriesHint", "These entries prevent a safe transactional import."), count: groups.invalid.length, tone: "danger", open: true, children: [transferEntryList(groups.invalid, { invalid: true })] })] : []),
			...(groups.new.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.newEntries", "New entries"), count: groups.new.length, tone: "success", children: [transferEntryList(groups.new)] })] : []),
			...(groups.update.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.unchangedEntries", "Existing entries"), description: t("aaalice.workspace.transfer.unchangedEntriesHint", "These entries already match local content, so no action is required."), count: groups.update.length, tone: "info", children: [transferEntryList(groups.update)] })] : []),
		);
		const importLabel = t("aaalice.workspace.libraryUi.import", "Import");
		const primary = button({ label: importLabel, disabled: groups.invalid.length > 0, onClick: async () => {
			setActionBusy(primary, true, importLabel, t("aaalice.workspace.transfer.importing", "Importing…"));
			try {
				const applied = await promptLibraryStore.importApply(importToken, resolutions, { signal: controller.signal });
				importToken = "";
				body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.importComplete", "Import complete"), description: t("aaalice.workspace.transfer.importCompleteHint", "The library was updated successfully. PromptSelector nodes will use the latest entries immediately."), count: applied.imported, countLabel: t("aaalice.workspace.transfer.entriesImported", "entries imported") }));
				setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
			} catch (error) {
				if (error.name === "AbortError") return;
				body.prepend(createTransferResult({ title: t("aaalice.workspace.transfer.importFailed", "Import failed"), description: error.message, tone: "error" }));
				setActionBusy(primary, false, importLabel, "");
			}
		} });
		setDialogFooter(footer, el("span", "aa-transfer-footer-note", groups.invalid.length ? t("aaalice.workspace.transfer.importBlocked", "Import blocked by invalid entries") : `${total} ${t("aaalice.workspace.transfer.entriesReviewed", "entries reviewed")}`), button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: close }), primary);
	} catch (error) {
		if (error.name === "AbortError") return;
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.preflightFailed", "Could not read this backup"), description: error.message, tone: "error" }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Close"), onClick: () => dialog.close() }));
	}
}

function groupNavigationStatus(group) {
	const status = classifyGroupNodes(group?.nodes);
	return {
		status,
		label: {
			[GROUP_STATE.ENABLED]: t("aaalice.workspace.groupNavigation.status.enabled", "Enabled"),
			[GROUP_STATE.DISABLED]: t("aaalice.workspace.groupNavigation.status.disabled", "Disabled"),
			[GROUP_STATE.MIXED]: t("aaalice.workspace.groupNavigation.status.mixed", "Mixed"),
			[GROUP_STATE.EMPTY]: t("aaalice.workspace.groupNavigation.status.empty", "Empty"),
		}[status],
	};
}

function navigateFromWorkspace(group, offset = null, zoom = 0.82) {
	if (!navigateToVisualGroup(app.canvas, group, { offset, zoom })) {
		app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.workspace.groupNavigation.title", "Group navigation"), detail: t("aaalice.workspace.groupNavigation.unavailable", "This group cannot be located on the current canvas.") });
		return;
	}
	const sidebar = app.extensionManager?.sidebarTab;
	if (!sidebarPinned && sidebar?.activeSidebarTabId === TAB_ID) sidebar.toggleSidebarTab?.(TAB_ID);
}

function openAddGroupNavigation() {
	const groups = visualGroups(app.graph);
	const existing = new Set(groupNavigation().entries.map((entry) => entry.groupId));
	const available = groups.filter((group) => !existing.has(String(group.id)));
	const selected = new Set();
	const list = el("div", { className: "aa-group-navigation-picker" });
	for (const group of available) {
		const groupId = String(group.id);
		list.append(createListRow({
			title: String(group.title || t("aaalice.quickGroup.untitled", "Untitled group")),
			description: message("aaalice.workspace.groupNavigation.nodeCount", "{count} nodes", { count: Array.isArray(group.nodes) ? group.nodes.length : 0 }),
			selected: false,
			onSelect: (checked) => { if (checked) selected.add(groupId); else selected.delete(groupId); confirm.disabled = selected.size === 0; },
		}));
	}
	if (!available.length) list.append(emptyState({ iconName: "statusCheck", title: t("aaalice.workspace.groupNavigation.allAddedTitle", "All groups are already added"), description: t("aaalice.workspace.groupNavigation.allAdded", "Remove an existing navigation item before adding it again.") }));
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.groupNavigation.addTitle", "Add groups to navigation"), body: list, footer, size: "md", className: "aa-group-navigation-dialog" });
	const confirm = button({ label: t("aaalice.workspace.groupNavigation.addSelected", "Add selected"), disabled: true, onClick: () => {
		updateGroupNavigation((model) => {
			let next = model;
			for (const group of available) if (selected.has(String(group.id))) next = addGroupNavigationEntry(next, group);
			return next;
		}, t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
		dialog.close();
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirm);
}

function openGroupNavigationSettings(entry, groupName) {
	let candidate = entry.shortcut;
	const input = el("input", { className: "aa-group-navigation-shortcut-input", attrs: { type: "text", readonly: "", placeholder: t("aaalice.workspace.groupNavigation.shortcutPlaceholder", "Press a shortcut") } });
	const hint = el("small", "aa-group-navigation-shortcut-hint", t("aaalice.workspace.groupNavigation.shortcutHint", "Use Ctrl, Alt, or Command with another key. Backspace clears it."));
	const error = el("small", "aa-group-navigation-shortcut-error");
	const sync = () => {
		input.value = shortcutLabel(candidate);
		const conflict = candidate && groupNavigation().entries.find((other) => other.groupId !== entry.groupId && other.shortcut === candidate);
		error.textContent = conflict ? message("aaalice.workspace.groupNavigation.shortcutConflict", "Already used by {group}", { group: conflict.label || conflict.groupId }) : "";
		save.disabled = Boolean(conflict);
	};
	input.addEventListener("keydown", (event) => {
		if (event.key === "Escape") return;
		event.preventDefault(); event.stopPropagation();
		if (event.key === "Backspace" || event.key === "Delete") candidate = null;
		else {
			const shortcut = shortcutFromKeyboardEvent(event);
			if (!shortcut) return;
			candidate = shortcut;
		}
		sync();
	});
	const offsetX = el("input", { attrs: { type: "number", step: "50", value: entry.offset.x, "aria-label": t("aaalice.workspace.groupNavigation.offsetX", "Horizontal offset") } });
	const offsetY = el("input", { attrs: { type: "number", step: "50", value: entry.offset.y, "aria-label": t("aaalice.workspace.groupNavigation.offsetY", "Vertical offset") } });
	const zoom = el("input", { attrs: { type: "number", min: "10", max: "300", step: "5", value: Math.round(entry.zoom * 100), "aria-label": t("aaalice.workspace.groupNavigation.zoom", "Zoom") } });
	const offsetFields = el("div", { className: "aa-group-navigation-offset-fields", children: [
		field({ label: t("aaalice.workspace.groupNavigation.offsetX", "Horizontal offset"), control: offsetX }),
		field({ label: t("aaalice.workspace.groupNavigation.offsetY", "Vertical offset"), control: offsetY }),
		field({ label: t("aaalice.workspace.groupNavigation.zoom", "Zoom"), control: zoom }),
	] });
	const body = el("div", { className: "aa-group-navigation-shortcut-editor", children: [
		field({ label: message("aaalice.workspace.groupNavigation.shortcutFor", "Shortcut for {group}", { group: groupName }), control: input }), hint, error,
		el("div", { className: "aa-group-navigation-offset-section", children: [el("strong", null, t("aaalice.workspace.groupNavigation.viewTitle", "Target view")), el("small", null, t("aaalice.workspace.groupNavigation.viewHint", "Offsets use canvas units; zoom controls how much of the viewport the group occupies.")), offsetFields] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.groupNavigation.settings", "Navigation settings"), body, footer, confirmOnEnter: false });
	const save = button({ label: t("aaalice.common.save", "Save"), onClick: () => {
		updateGroupNavigation((model) => setGroupNavigationZoom(setGroupNavigationOffset(setGroupNavigationShortcut(model, entry.groupId, candidate), entry.groupId, { x: offsetX.value, y: offsetY.value }), entry.groupId, zoom.value === "" ? null : Number(zoom.value) / 100), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
		dialog.close();
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), save);
	sync(); input.focus();
}

function renderGroupNavigation(container) {
	const groups = visualGroups(app.graph);
	const groupsById = new Map(groups.map((group) => [String(group.id), group]));
	const navigation = groupNavigation();
	const entries = navigation.entries.map((entry) => ({ entry, group: groupsById.get(entry.groupId) || null }));
	const viewState = workspaceViewState.groups;
	const focusSearch = viewState.focusSearch; viewState.focusSearch = false;
	let applySearch = () => {};
	const search = createCollapsibleSearch({
		open: viewState.searchOpen, value: viewState.query, focus: focusSearch, disabled: entries.length === 0,
		label: t("aaalice.workspace.groupNavigation.search", "Search groups"), closeLabel: t("aaalice.workspace.search.close", "Close search"), placeholder: t("aaalice.workspace.groupNavigation.searchPlaceholder", "Search workflow groups"),
		onToggle: (open) => { viewState.searchOpen = open; viewState.focusSearch = open; scheduleRender(); },
		onInput: (value) => { viewState.query = value; applySearch(value); },
	});
	const count = badge(message("aaalice.workspace.groupNavigation.count", "{count} groups", { count: entries.length }), { className: "aa-group-navigation-count" });
	const add = iconButton({ iconName: "add", label: t("aaalice.workspace.groupNavigation.add", "Add groups"), variant: "ghost", className: "aa-group-navigation-add", onClick: openAddGroupNavigation });
	const toolbar = createWorkspaceToolbar(viewState.searchOpen ? [search.panel] : [
		el("div", { className: "aa-group-navigation-heading", children: [el("strong", null, t("aaalice.workspace.groupNavigation.title", "Group navigation")), count] }),
		search.toggle, add,
	], { className: `aa-group-navigation-toolbar${viewState.searchOpen ? " is-searching" : ""}`, label: t("aaalice.workspace.groupNavigation.actions", "Group navigation actions") });
	const list = el("nav", { className: "aa-group-navigation-list", attrs: { "aria-label": t("aaalice.workspace.groupNavigation.groups", "Workflow groups") } });
	applySearch = (value = "") => {
		const query = String(value).trim().toLocaleLowerCase();
		const visible = entries.filter(({ entry, group }) => !query || String(group?.title || entry.label || entry.groupId).toLocaleLowerCase().includes(query));
		list.replaceChildren();
		for (const { entry, group } of visible) {
			const name = String(group?.title || entry.label || message("aaalice.workspace.groupNavigation.missingGroup", "Missing group #{id}", { id: entry.groupId }));
			const nodeCount = Array.isArray(group?.nodes) ? group.nodes.length : 0;
			const state = group ? groupNavigationStatus(group) : { status: "missing", label: t("aaalice.workspace.groupNavigation.status.missing", "Missing") };
			const color = normalizeColor(group?.color);
			const marker = el("span", { className: `aa-group-navigation-marker${color ? "" : " is-uncolored"}`, attrs: { ...(color ? { style: `--group-color:${color}` } : {}), "aria-hidden": "true" } });
			const offsetActive = entry.offset.x !== 0 || entry.offset.y !== 0;
			const offsetLabel = offsetActive ? message("aaalice.workspace.groupNavigation.offsetMeta", "offset {x}, {y}", { x: entry.offset.x, y: entry.offset.y }) : "";
			const zoomLabel = message("aaalice.workspace.groupNavigation.zoomMeta", "zoom {zoom}%", { zoom: Math.round(entry.zoom * 100) });
			const meta = `${message("aaalice.workspace.groupNavigation.meta", "{count} nodes · {status}", { count: nodeCount, status: state.label })}${offsetLabel ? ` · ${offsetLabel}` : ""} · ${zoomLabel}`;
			const target = el("button", {
				className: "aa-group-navigation-target",
				attrs: { type: "button", disabled: !group, "aria-label": message("aaalice.workspace.groupNavigation.navigate", "Go to {group}", { group: name }) },
				children: [marker, el("span", { className: "aa-group-navigation-copy", children: [el("strong", null, name), el("small", null, meta)] }), el("span", { className: "aa-group-navigation-fit", attrs: { "aria-hidden": "true" }, children: [icon("fit")] })],
			});
			target.addEventListener("click", () => navigateFromWorkspace(group, entry.offset, entry.zoom));
			const shortcut = button({ label: entry.shortcut ? shortcutLabel(entry.shortcut) : t("aaalice.workspace.groupNavigation.settingsShort", "Set"), variant: "ghost", size: "sm", className: `aa-group-navigation-shortcut${entry.shortcut || offsetActive || entry.zoom !== 0.82 ? " is-set" : ""}`, onClick: () => openGroupNavigationSettings(entry, name) });
			const remove = iconButton({ iconName: "close", label: message("aaalice.workspace.groupNavigation.remove", "Remove {group} from navigation", { group: name }), variant: "ghost", className: "aa-group-navigation-remove", onClick: () => updateGroupNavigation((model) => removeGroupNavigationEntry(model, entry.groupId), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings.")) });
			const row = el("div", { className: `aa-group-navigation-row is-${state.status}`, children: [target, el("div", { className: "aa-group-navigation-actions", children: [shortcut, remove] })] });
			list.append(row);
		}
		if (!visible.length) list.append(emptyState({
			iconName: "fit", className: "aa-workspace-empty aa-group-navigation-empty",
			title: entries.length ? t("aaalice.workspace.groupNavigation.noMatchesTitle", "No matching groups") : t("aaalice.workspace.groupNavigation.emptyTitle", "No navigation groups yet"),
			description: entries.length ? t("aaalice.workspace.groupNavigation.noMatches", "Try another group name.") : t("aaalice.workspace.groupNavigation.empty", "Add only the workflow groups you want to navigate to."),
		}));
	};
	applySearch(viewState.query);
	container.append(toolbar, list);
}

function handleGroupNavigationShortcut(event) {
	if (event.defaultPrevented || event.repeat || isEditableShortcutTarget(event.target)) return;
	const shortcut = shortcutFromKeyboardEvent(event);
	if (!shortcut) return;
	const entry = groupNavigation().entries.find((candidate) => candidate.shortcut === shortcut);
	if (!entry) return;
	const group = visualGroups(app.graph).find((candidate) => String(candidate.id) === entry.groupId);
	if (!group) return;
	event.preventDefault();
	event.stopPropagation();
	navigateFromWorkspace(group, entry.offset, entry.zoom);
}

const renderedWorkspaceTabs = new WeakSet();
const workspaceWidthObservers = new Map();

function renderWorkspace(root) {
	clearLegacyDashboardPresets();
	workspacePinTooltip.hide();
	closeImagePreview(); closePromptEntryDetails(); destroyVirtualLists(root);
	destroySharedControls(root);
	root.replaceChildren();
	let shell;
	const renderActiveWorkspace = () => {
		destroySharedControls(shell.content);
		shell.content.replaceChildren();
		if (activeWorkspace === "dashboard") renderDashboard(shell.content, root);
		else if (activeWorkspace === "groups") renderGroupNavigation(shell.content);
		else renderLibrary(shell.content);
	};
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
	syncPinButton();
	shell = createWorkspaceShell({ title: t("aaalice.workspace.title", "Aaalice Workspace"), activeTab: activeWorkspace, tabs: [{ value: "dashboard", label: t("aaalice.workspace.dashboard", "Controls"), iconName: "settings" }, { value: "groups", label: t("aaalice.workspace.groups", "Groups"), iconName: "fit" }, { value: "library", label: t("aaalice.workspace.library", "Library"), iconName: "note" }], headerActions: [pinButton], onTabChange: (value) => { activeWorkspace = value; renderActiveWorkspace(); } });
	root.append(shell.root); renderActiveWorkspace();
}

function openAddControls(node) {
	const controls = controlProviders.list(node); if (!controls.length) return;
	let model = dashboard(); let page = currentPage(model); let selected = new Set(); let allowDuplicate = false;
	const body = el("div", "aa-add-controls-dialog"); const list = el("div", "aa-add-controls-list");
	const pageSelect = selectControl({ ariaLabel: t("aaalice.workspace.target.page", "Page"), onChange: () => rebuildTargets() });
	const targetGrid = el("div", "aa-add-controls-target-grid");
	const destinationPanel = el("section", { className: "aa-add-controls-section aa-add-controls-destination", children: [
		el("div", { className: "aa-add-controls-destination-copy", children: [el("h3", null, t("aaalice.workspace.binding.destination", "Destination")), el("p", null, t("aaalice.workspace.binding.destinationHint", "Choose where the selected controls will appear."))] }),
		targetGrid,
	] });
	const rebuildTargets = () => {
		model = dashboard(); page = model.pages.find((item) => item.id === pageSelect.control.value) || model.pages[0];
		pageSelect.setOptions(model.pages.map((item) => ({ label: item.name, value: item.id })), page?.id);
	};
	if (!model.pages.length) {
		const pageName = document.createElement("input"); pageName.value = t("aaalice.workspace.page.default", "Generation");
		targetGrid.append(field({ label: t("aaalice.workspace.target.newPage", "New page"), control: pageName }));
		body._createTarget = () => updateDashboard((current) => { const nextPage = createPage(pageName.value.trim() || "Page"); current.pages.push(nextPage); activePageId = nextPage.id; return current; });
	} else { rebuildTargets(); targetGrid.append(field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect })); }
	const existing = new Set(model.pages.flatMap((candidatePage) => candidatePage.items.filter((item) => item.kind === "control").map((item) => bindingKey(item.binding))));
	const duplicateKeys = new Set(controls.map((control) => bindingKey(control.binding)).filter((key) => existing.has(key)));
	selected = new Set(controls.map((control) => bindingKey(control.binding)).filter((key) => !existing.has(key)));
	const selectionCount = el("span", "aa-add-controls-selection-count");
	let confirmButton = null; let selectAllButton = null;
	const eligibleKeys = () => controls.map((control) => bindingKey(control.binding)).filter((key) => allowDuplicate || !existing.has(key));
	const updateSelectionState = () => {
		const text = `${selected.size} ${t("aaalice.workspace.binding.selectedControls", "controls selected")}`;
		selectionCount.textContent = text;
		if (confirmButton) {
			confirmButton.disabled = selected.size === 0;
			confirmButton.querySelector(".aa-ui-button__label").textContent = t("aaalice.workspace.binding.addSelected", "Add controls · {count}").replace("{count}", selected.size);
		}
		if (selectAllButton) {
			const keys = eligibleKeys(); const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
			const label = allSelected ? t("aaalice.workspace.binding.clearAll", "Clear all") : t("aaalice.workspace.binding.selectAll", "Select all");
			selectAllButton.querySelector(".aa-ui-button__label").textContent = label;
			selectAllButton.setAttribute("aria-label", label); selectAllButton.disabled = keys.length === 0;
		}
	};
	let drawList = () => {};
	const duplicateToggle = toggleSwitch({ checked: false, label: t("aaalice.workspace.binding.allowDuplicate", "Allow duplicate cards"), onChange: (value) => {
		allowDuplicate = value;
		for (const key of duplicateKeys) { if (value) selected.add(key); else selected.delete(key); }
		drawList();
	} });
	const duplicateSetting = el("div", { className: "aa-add-controls-duplicate", children: [
		el("div", { children: [el("strong", null, t("aaalice.workspace.binding.allowDuplicate", "Allow duplicate cards")), el("small", null, t("aaalice.workspace.binding.allowDuplicateHint", "Permit another card for controls already placed in the sidebar."))] }), duplicateToggle,
	] });
	selectAllButton = button({ label: t("aaalice.workspace.binding.selectAll", "Select all"), variant: "ghost", size: "sm", className: "aa-add-controls-select-all", onClick: () => {
		const keys = eligibleKeys(); const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
		if (allSelected) for (const key of keys) selected.delete(key); else for (const key of keys) selected.add(key);
		drawList();
	} });
	const pickerActions = el("div", { className: "aa-add-controls-picker-actions", children: [selectionCount, selectAllButton] });
	const controlPicker = el("section", { className: "aa-add-controls-section aa-add-controls-picker", children: [
		el("header", { className: "aa-add-controls-section-header", children: [el("div", { children: [el("h3", null, t("aaalice.workspace.binding.chooseControls", "Choose controls")), el("p", null, t("aaalice.workspace.binding.chooseControlsHint", "Select one or more controls to add to this page."))] }), pickerActions] }),
		...(duplicateKeys.size ? [duplicateSetting] : []), list,
	] });
	drawList = () => {
		list.replaceChildren();
		for (const control of controls) {
			const key = bindingKey(control.binding); const added = existing.has(key);
			const row = createListRow({ title: control.label, description: added ? t("aaalice.workspace.binding.added", "Already added") : controlAvailabilityDescription(control), selected: selected.has(key), onSelect: (checked) => { if (checked) selected.add(key); else selected.delete(key); updateSelectionState(); } });
			row.selectionControl.setDisabled(added && !allowDuplicate); list.append(row);
		}
		updateSelectionState();
	};
	body.append(destinationPanel, controlPicker); drawList();
	const footer = el("div"); const dialog = createDialog({ title: t("aaalice.workspace.binding.add", "Add controls to sidebar"), body, footer, size: "md", className: "aa-add-controls-dialog-shell" });
	confirmButton = button({ label: t("aaalice.workspace.binding.addSelected", "Add controls · {count}").replace("{count}", selected.size), disabled: true, onClick: () => {
		if (body._createTarget) { body._createTarget(); model = dashboard(); page = currentPage(model); }
		if (!page) return;
		const chosen = controls.filter((control) => selected.has(bindingKey(control.binding)));
		updateDashboard((current) => addItems(current, page.id, chosen, { sourceGroup: sharedSourceGroup(chosen) }));
		remindWorkflowSave(t("aaalice.workspace.binding.saveWorkflowReminder", "Save the workflow to keep these sidebar controls; otherwise they will be lost."));
		dialog.close();
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirmButton);
	updateSelectionState();
}

function patchNodeMenu(node) {
	installNodeControlMenu(node, {
		label: t("aaalice.workspace.binding.menu", "📌 Add controls to sidebar…"),
		listControls: (candidate) => controlProviders.list(candidate),
		openControls: openAddControls,
	});
}

app.registerExtension({
	name: "ComfyUI.Aaalice.Workspace",
	async init() {
		await ensureI18nReady();
		try { await promptLibraryStore.refresh(); }
		catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message }); }
	},
	beforeRegisterNodeDef(nodeType) { const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); patchNodeMenu(this); return result; }; },
	nodeCreated(node) { patchNodeMenu(node); }, loadedGraphNode(node) { patchNodeMenu(node); },
	setup() {
		app.extensionManager.registerSidebarTab({ id: TAB_ID, icon: "aaalice-workspace-sidebar-icon", title: t("aaalice.workspace.sidebarTitle", "Aaalice"), tooltip: t("aaalice.workspace.title", "Aaalice Workspace"), type: "custom", render: (element) => {
			element.classList.add("aa-workspace-host"); mounted.add(element);
			// 前端的挂载效果会跟随渲染期读取的响应式状态(如滑条预览写 widget 值)重新触发。
			// 手势期间重建会销毁被拖拽元素,跳过重挂载;手势结束后的提交渲染统一刷新。
			if (renderedWorkspaceTabs.has(element)) { if (!hasActiveControlGestures()) scheduleRender(); }
			else { renderedWorkspaceTabs.add(element); renderWorkspace(element); }
			// 侧栏宽度在打开动画期间尚未稳定，列数投影可能从错误的宽度计算；宽度跨越断点时必须重排。
			const columnBucket = () => dashboardColumnsForWidth(element.clientWidth);
			let lastColumnBucket = columnBucket();
			workspaceWidthObservers.get(element)?.disconnect();
			const widthObserver = new ResizeObserver(() => {
				const next = columnBucket();
				if (next === lastColumnBucket) return;
				lastColumnBucket = next; scheduleRender("dashboard");
			});
			workspaceWidthObservers.set(element, widthObserver);
			widthObserver.observe(element);
			return () => { workspaceWidthObservers.get(element)?.disconnect(); workspaceWidthObservers.delete(element); workspacePinTooltip.hide(); closeImagePreview(); closePromptEntryDetails(); destroyVirtualLists(element); element.classList.remove("aa-workspace-host"); mounted.delete(element); };
		} });
		installWorkspaceCanvasAutoClose();
		repairDuplicateHostIds(graphNodes()); for (const node of graphNodes()) patchNodeMenu(node); previousGraphStructure = graphSyncSignature();
		api.addEventListener("graphChanged", scheduleGraphSync);
		// 捕获阶段先于前端快捷键分发执行；保存序列化在之后进行，刚冲刷的预设会被一并写入。
		window.addEventListener("keydown", (event) => {
			if (event.repeat || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== "s") return;
			const target = event.target;
			if (target instanceof Element && (["input", "textarea", "select"].includes(target.localName) || target.isContentEditable)) return;
			flushActiveDashboardPresetOnSave();
		}, true);
		window.addEventListener("keydown", handleGroupNavigationShortcut, true);
		window.addEventListener(CONTROL_HOST_INVALIDATED_EVENT, () => scheduleRender("dashboard"));
		window.addEventListener("aaalice-parameter-panel-changed", (event) => { if (event.detail?.workspaceRedraw !== false) scheduleRender("dashboard"); }); promptLibraryStore.addEventListener("change", () => scheduleRender("library"));
	},
});
