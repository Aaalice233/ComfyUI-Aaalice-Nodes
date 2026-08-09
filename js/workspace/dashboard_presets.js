import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { emptyDashboard, normalizeDashboard } from "../lib/dashboard_model.js";
import { availableDashboardPresetName, compareDashboardPreset, createDashboardPreset, dashboardPresetFileName, dashboardPresetNameFromFile, dashboardPresetStateNeedsMigration, duplicateDashboardPreset, emptyDashboardPresetState, normalizeDashboardPresetState, parseDashboardPreset, removeDashboardPreset, renameDashboardPreset, replaceDashboardPreset, serializeDashboardPreset, setDashboardPresetBaseline } from "../lib/dashboard_presets.js";
import { applyDashboardSnapshotPlan, captureDashboardValues, mergeCapturedPresetValues, planDashboardPresetApplication, planDashboardPresetValueOverwrite } from "../lib/dashboard_preset_runtime.js";
import { badge, button, createDialog, el, field, icon, segmentedControl, selectControl } from "../lib/ui.js";
import { createTransferHero, createTransferResult, createTransferSection, createTransferStats, formatFileSize } from "../lib/workspace_components.js";
import { confirmAction, downloadBlob, setActionBusy, setDialogFooter } from "./dom_utils.js";

let runtime = null;
let dashboardPresetModelError = null;
let dashboardPresetAutoSaveFrame = 0;
let dashboardPresetAutoSaveRunning = false;
export function configureDashboardPresets(dependencies) { runtime = dependencies; }
export function getDashboardPresetModelError() { return dashboardPresetModelError; }
const dashboard = () => runtime.dashboard();
const resolve = (binding) => runtime.resolve(binding);
const graphNodes = () => runtime.graphNodes();
const scheduleRender = (view = null) => runtime.scheduleRender(view);
const scheduleStructuralRender = (view = null) => runtime.scheduleStructuralRender(view);
const remindWorkflowSave = (detail) => runtime.remindWorkflowSave(detail);
const workspaceLabels = () => runtime.workspaceLabels();

export function dashboardPresetState() {
	try {
		const source = app.graph?.extra?.[runtime.presetsExtraKey] ?? null;
		const value = normalizeDashboardPresetState(source); dashboardPresetModelError = null;
		if (source && dashboardPresetStateNeedsMigration(source, value)) app.graph.extra[runtime.presetsExtraKey] = value;
		return value;
	} catch (error) { dashboardPresetModelError = error; return emptyDashboardPresetState(); }
}

export function updateDashboardPresetState(callback, detail = null, { structural = false } = {}) {
	if (dashboardPresetModelError) throw dashboardPresetModelError;
	const graph = app.graph; graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[runtime.presetsExtraKey] = normalizeDashboardPresetState(callback(dashboardPresetState()) || dashboardPresetState());
	} finally {
		graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true);
		(structural ? scheduleStructuralRender : scheduleRender)("dashboard");
	}
	if (detail) remindWorkflowSave(detail);
}

/** Ctrl+S 保存工作流时把工作副本冲刷进当前基准预设，随后的保存序列化自然包含它。 */
export function flushActiveDashboardPresetOnSave() {
	try {
		const state = dashboardPresetState();
		const baseline = state.presets.find((preset) => preset.id === state.baselinePresetId);
		if (!baseline) return;
		const snapshot = currentDashboardPresetSnapshot(undefined, baseline.values);
		if (!compareDashboardPreset(baseline, snapshot).modified) return;
		updateDashboardPresetState((current) => replaceDashboardPreset(current, baseline.id, snapshot));
	} catch (error) {
		notifyDashboardPresetError(error);
	}
}


export function dashboardPresetLabels() {
	return {
		title: t("aaalice.workspace.dashboardPreset.title", "Sidebar presets"), open: t("aaalice.workspace.dashboardPreset.open", "Open sidebar presets"), placeholder: t("aaalice.workspace.dashboardPreset.placeholder", "Select preset"), attention: t("aaalice.workspace.dashboardPreset.attention", "Needs attention"),
		empty: t("aaalice.workspace.dashboardPreset.empty", "No presets yet"), emptyHint: t("aaalice.workspace.dashboardPreset.emptyHint", "Save the current sidebar layout and values for quick switching later."), emptyAction: t("aaalice.workspace.dashboardPreset.emptyAction", "Save current sidebar"),
		presetCount: t("aaalice.workspace.dashboardPreset.presetCount", "{count} presets"), presetSummary: t("aaalice.workspace.dashboardPreset.presetSummary", "{pages} pages · {values} values"), add: t("aaalice.workspace.dashboardPreset.add", "New"), create: t("aaalice.workspace.dashboardPreset.create", "New preset"), manage: t("aaalice.workspace.dashboardPreset.manage", "Manage preset"), modified: t("aaalice.workspace.dashboardPreset.modified", "Unsaved changes"), update: t("aaalice.workspace.dashboardPreset.update", "Save changes"), saveCurrent: t("aaalice.workspace.dashboardPreset.saveCurrent", "Save as preset"), restore: t("aaalice.workspace.dashboardPreset.restore", "Discard changes"), duplicate: t("aaalice.workspace.dashboardPreset.duplicate", "Duplicate"), rename: t("aaalice.workspace.dashboardPreset.rename", "Rename"), delete: t("aaalice.workspace.dashboardPreset.delete", "Delete"),
		changeSummary: t("aaalice.workspace.dashboardPreset.changeSummary", "{layout} layout · {values} values"), dataError: t("aaalice.workspace.dashboardPreset.dataError", "Preset data error"), dataErrorHint: t("aaalice.workspace.dashboardPreset.dataErrorHint", "The saved sidebar preset data could not be read."),
		attentionBindings: t("aaalice.workspace.dashboardPreset.attentionBindings", "{count} bindings need attention"), attentionStale: t("aaalice.workspace.dashboardPreset.attentionStale", "The preset holds values of removed components"),
	};
}

function notifyDashboardPresetError(error) {
	app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.workspace.dashboardPreset.error", "Sidebar preset error"), detail: String(error?.message || error), life: 5200 });
}

function notifyDashboardPresetSuccess(summary, detail) {
	app.extensionManager?.toast?.add?.({ severity: "success", summary, detail, life: 3600 });
}

export function currentDashboardPresetSnapshot(model = dashboard(), previousValues = null) {
	if (previousValues == null) {
		const state = dashboardPresetState();
		previousValues = state.presets.find((preset) => preset.id === state.baselinePresetId)?.values || {};
	}
	const captured = captureDashboardValues(model, (binding) => resolve(binding));
	return { dashboard: model, values: mergeCapturedPresetValues(captured, previousValues), bindings: captured.bindings };
}

function autoSaveActiveDashboardPreset() {
	if (!runtime.isAutoSaveEnabled() || dashboardPresetAutoSaveRunning) return;
	try {
		const state = dashboardPresetState();
		const baseline = state.presets.find((preset) => preset.id === state.baselinePresetId);
		if (!baseline) return;
		const snapshot = currentDashboardPresetSnapshot(undefined, baseline.values);
		if (!compareDashboardPreset(baseline, snapshot).modified) return;
		dashboardPresetAutoSaveRunning = true;
		updateDashboardPresetState((current) => replaceDashboardPreset(current, baseline.id, snapshot));
	} catch (error) {
		notifyDashboardPresetError(error);
	} finally {
		dashboardPresetAutoSaveRunning = false;
	}
}

export function scheduleActiveDashboardPresetAutoSave() {
	if (!runtime.isAutoSaveEnabled() || dashboardPresetAutoSaveFrame) return;
	dashboardPresetAutoSaveFrame = requestAnimationFrame(() => {
		dashboardPresetAutoSaveFrame = 0;
		autoSaveActiveDashboardPreset();
	});
}

function commitDashboardPresetChange(callback, detail = t("aaalice.workspace.dashboardPreset.saveWorkflowReminder", "Save the workflow to keep these sidebar presets.")) {
	try { updateDashboardPresetState(callback, null, { structural: true }); if (detail) notifyDashboardPresetSuccess(dashboardPresetLabels().title, detail); return true; }
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

export async function createCurrentDashboardPreset(model = dashboard()) {
	const state = dashboardPresetState(); const snapshot = currentDashboardPresetSnapshot(model);
	if (!snapshot.dashboard.pages.length && !Object.keys(snapshot.values).length) { notifyDashboardPresetError(t("aaalice.workspace.dashboardPreset.noContent", "There is no sidebar layout to save.")); return false; }
	const names = new Set(state.presets.map((preset) => preset.name.toLowerCase())); let count = 1; let name;
	do { name = t("aaalice.workspace.dashboardPreset.defaultName", "Preset {count}").replace("{count}", String(count++)); } while (names.has(name.toLowerCase()));
	const nextName = await askTextValue(dashboardPresetLabels().create, t("aaalice.workspace.dashboardPreset.name", "Preset name"), name);
	return nextName ? commitDashboardPresetChange((current) => createDashboardPreset(current, nextName, snapshot), t("aaalice.workspace.dashboardPreset.created", "Sidebar preset created. Save the workflow to keep it.")) : false;
}

export function updateCurrentDashboardPreset(presetId, model = dashboard()) {
	const state = dashboardPresetState(); const preset = state.presets.find((item) => item.id === presetId); if (!preset) return false;
	const snapshot = currentDashboardPresetSnapshot(model, preset.values);
	return commitDashboardPresetChange((current) => replaceDashboardPreset(current, presetId, snapshot), t("aaalice.workspace.dashboardPreset.updated", "Sidebar preset updated. Save the workflow to keep it."));
}

export async function duplicateCurrentDashboardPreset(presetId) {
	const state = dashboardPresetState(); const preset = state.presets.find((item) => item.id === presetId); if (!preset) return;
	const name = t("aaalice.workspace.dashboardPreset.copyName", "{name} copy").replace("{name}", preset.name);
	const nextName = await askTextValue(dashboardPresetLabels().duplicate, t("aaalice.workspace.dashboardPreset.name", "Preset name"), name);
	if (nextName) commitDashboardPresetChange((current) => duplicateDashboardPreset(current, presetId, nextName), t("aaalice.workspace.dashboardPreset.duplicated", "Sidebar preset duplicated. Save the workflow to keep it."));
}

export async function renameCurrentDashboardPreset(presetId) {
	const preset = dashboardPresetState().presets.find((item) => item.id === presetId); if (!preset) return;
	const name = await askTextValue(dashboardPresetLabels().rename, t("aaalice.workspace.dashboardPreset.name", "Preset name"), preset.name);
	if (name) commitDashboardPresetChange((current) => renameDashboardPreset(current, presetId, name), t("aaalice.workspace.dashboardPreset.renamed", "Sidebar preset renamed. Save the workflow to keep it."));
}

export async function deleteCurrentDashboardPreset(presetId) {
	const state = dashboardPresetState();
	const preset = state.presets.find((item) => item.id === presetId); if (!preset) return;
	const nextState = removeDashboardPreset(state, presetId);
	const nextPreset = nextState.presets.find((item) => item.id === nextState.baselinePresetId) || null;
	const messageKey = state.baselinePresetId === presetId
		? nextPreset
			? "aaalice.workspace.dashboardPreset.deleteSwitchConfirm"
			: "aaalice.workspace.dashboardPreset.deleteLastConfirm"
		: "aaalice.workspace.dashboardPreset.deleteConfirm";
	const fallback = nextPreset ? `“${nextPreset.name}”` : "";
	const message = t(messageKey, nextPreset
		? "Delete sidebar preset “{name}”? The sidebar will switch to “{fallback}”."
		: "Delete sidebar preset “{name}”? The sidebar will be cleared because no presets remain.")
		.replace("{name}", preset.name)
		.replace("{fallback}", fallback);
	if (!await confirmAction(message, { title: dashboardPresetLabels().delete, confirmLabel: dashboardPresetLabels().delete, danger: true })) return;
	if (state.baselinePresetId !== presetId) {
		commitDashboardPresetChange((current) => removeDashboardPreset(current, presetId), t("aaalice.workspace.dashboardPreset.deleted", "Sidebar preset deleted. Save the workflow to keep it."));
		return;
	}
	await commitDeletedActiveDashboardPreset(nextState, nextPreset);
}

async function commitDeletedActiveDashboardPreset(nextState, nextPreset) {
	let plan = null;
	if (nextPreset) {
		plan = planDashboardPresetApplication(nextPreset, (binding) => resolve(binding));
		if (plan.issues.length && !await confirmPartialDashboardPreset(plan, nextPreset)) return;
	}
	const graph = app.graph;
	graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		if (plan) {
			applyDashboardSnapshotPlan(plan, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); } });
			runtime.setActivePageId(nextPreset.dashboard.pages.some((page) => page.id === runtime.getActivePageId()) ? runtime.getActivePageId() : nextPreset.dashboard.pages[0]?.id || null);
		} else {
			graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(emptyDashboard());
			runtime.setActivePageId(null);
		}
		graph.extra[runtime.presetsExtraKey] = nextState;
	} catch (error) {
		notifyDashboardPresetError(error);
		return;
	} finally {
		graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender("dashboard");
	}
	notifyDashboardPresetSuccess(dashboardPresetLabels().title, nextPreset
		? t("aaalice.workspace.dashboardPreset.deletedAndSwitched", "Sidebar preset deleted and switched to another preset. Save the workflow to keep the change.")
		: t("aaalice.workspace.dashboardPreset.deletedAndCleared", "The last sidebar preset was deleted and the sidebar was cleared. Save the workflow to keep the change."));
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

async function prepareDashboardPresetSwitch(presetId, { restore = false, forcePrompt = false } = {}) {
	let state = dashboardPresetState(); let preset = state.presets.find((item) => item.id === presetId); if (!preset) return null;
	const active = state.presets.find((item) => item.id === state.baselinePresetId) || null;
	const current = currentDashboardPresetSnapshot(); const comparison = active ? compareDashboardPreset(active, current) : null;
	const hasCustomContent = current.dashboard.pages.length > 0 || Object.keys(current.values).length > 0;
	const shouldPrompt = !restore && (active?.id !== presetId || forcePrompt) && (active ? comparison?.modified : hasCustomContent);
	if (shouldPrompt) {
		const decision = await confirmDashboardPresetSwitch(active); if (!decision) return null;
		if (decision === "update" && !updateCurrentDashboardPreset(active.id)) return null;
		if (decision === "save-as" && !await createCurrentDashboardPreset()) return null;
		state = dashboardPresetState(); preset = state.presets.find((item) => item.id === presetId); if (!preset) return null;
	}
	return { state, preset };
}

export async function applyDashboardPreset(presetId, { restore = false } = {}) {
	const prepared = await prepareDashboardPresetSwitch(presetId, { restore }); if (!prepared) return;
	const { state, preset } = prepared;
	const plan = planDashboardPresetApplication(preset, (binding) => resolve(binding));
	if (plan.issues.length && !await confirmPartialDashboardPreset(plan, preset)) return;
	const graph = app.graph; graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		applyDashboardSnapshotPlan(plan, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); } });
		graph.extra[runtime.presetsExtraKey] = setDashboardPresetBaseline(state, presetId);
		const activePageId = runtime.getActivePageId();
		runtime.setActivePageId(preset.dashboard.pages.some((page) => page.id === activePageId) ? activePageId : preset.dashboard.pages[0]?.id || null);
	} catch (error) { notifyDashboardPresetError(error); return; }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender("dashboard"); }
	notifyDashboardPresetSuccess(preset.name, t("aaalice.workspace.dashboardPreset.appliedReminder", "Sidebar preset applied. Save the workflow to keep the layout and values."));
}

export function openDashboardExport(model) {
	const state = dashboardPresetState();
	const baseline = state.presets.find((preset) => preset.id === state.baselinePresetId) || null;
	const presetName = baseline?.name || t("aaalice.workspace.transfer.currentLayout", "Current layout");
	const fileName = dashboardPresetFileName(presetName);
	const preset = serializeDashboardPreset(currentDashboardPresetSnapshot(model), presetName);
	const pages = preset.dashboard.pages;
	const groups = pages.flatMap((page) => page.groups);
	const controls = pages.flatMap((page) => page.items).filter((item) => item.kind === "control");
	const values = Object.keys(preset.values).length;
	const exportHint = t("aaalice.workspace.transfer.exportPresetHint", "Exports the selected preset “{name}”, including pages, layout groups, control bindings and compatible current values.").replace("{name}", presetName);
	const body = el("div", { className: "aa-transfer-dialog-body", children: [
		createTransferHero({ iconName: "upload", eyebrow: baseline ? t("aaalice.workspace.transfer.currentPreset", "Current preset") : t("aaalice.workspace.transfer.currentLayout", "Current layout"), title: presetName, description: exportHint, fileName, fileMeta: t("aaalice.workspace.transfer.jsonPreset", "JSON layout backup"), tone: "dashboard" }),
		createTransferStats([
			{ value: pages.length, label: t("aaalice.workspace.transfer.pages", "Pages"), tone: "primary" },
			{ value: groups.length, label: t("aaalice.workspace.transfer.groups", "Groups") },
			{ value: controls.length, label: t("aaalice.workspace.transfer.controls", "Controls") },
			{ value: values, label: t("aaalice.workspace.transfer.values", "Saved values"), tone: values < controls.length ? "warning" : "success" },
		]),
		el("div", { className: "aa-transfer-callout is-info", children: [icon("statusIdle"), el("p", null, t("aaalice.workspace.transfer.presetIdentityHint", "The preset name and downloaded file name use the same name. Import uses the selected file name; conflicts receive a suffix when confirmed."))] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.preset.export", "Export layout"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.workspace.preset.export", "Export layout"), onClick: () => {
		downloadBlob(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }), fileName);
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.exportComplete", "Export ready"), description: t("aaalice.workspace.transfer.presetExportCompleteHint", "Preset “{name}” was downloaded as {file}.").replace("{name}", presetName).replace("{file}", fileName), count: controls.length, countLabel: t("aaalice.workspace.transfer.controls", "controls") }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
	} }));
}


function dashboardPresetTransferStatusLabel(status) {
	const availability = workspaceLabels().availability;
	return {
		missing: t("aaalice.workspace.binding.missing", "Missing binding"),
		incompatible: t("aaalice.workspace.binding.incompatible", "Incompatible"),
		invalid: t("aaalice.workspace.dashboardPreset.invalid", "Invalid value"),
		unused: t("aaalice.workspace.dashboardPreset.unused", "Not on sidebar"),
		unset: availability.unset,
		unavailable: availability.unavailable,
		empty: availability.noOptions,
		"layout-only": t("aaalice.workspace.dashboardPreset.layoutOnly", "Layout only"),
		error: availability.error,
	}[status] || status;
}

function dashboardPresetTransferRows(entries) {
	return entries.map((entry) => {
		const value = entry.imported || entry.saved;
		const identity = entry.binding ? `${entry.binding.provider} · ${entry.binding.valueType}` : value?.valueType || entry.key;
		return el("div", { className: "aa-transfer-entry-row", children: [
			el("div", { children: [el("strong", null, entry.binding?.controlId || entry.key), el("small", null, identity)] }),
			badge(dashboardPresetTransferStatusLabel(entry.status), { className: entry.status === "invalid" || entry.status === "incompatible" ? "is-danger" : "is-warning" }),
		] });
	});
}

export async function importDashboardPreset(file) {
	const body = el("div", { className: "aa-transfer-dialog-body", children: [
		createTransferHero({ iconName: "download", eyebrow: t("aaalice.workspace.transfer.preflight", "Safety check"), title: t("aaalice.workspace.transfer.readingPreset", "Reading layout backup…"), description: t("aaalice.workspace.transfer.readingPresetHint", "Checking layout structure, stable bindings and saved value types."), fileName: file.name, fileMeta: formatFileSize(file.size), tone: "dashboard" }),
		el("div", { className: "aa-transfer-loading", attrs: { role: "status" }, children: [el("span", "aa-transfer-loading__bar"), el("span", null, t("aaalice.workspace.transfer.preflighting", "Preparing import preview…"))] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.preset.import", "Import layout"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }));
	try {
		const snapshot = parseDashboardPreset(JSON.parse(await file.text()));
		const fallbackName = snapshot.name || t("aaalice.workspace.dashboardPreset.defaultName", "Preset {count}").replace("{count}", "1");
		const defaultPresetName = dashboardPresetNameFromFile(file.name, fallbackName);
		const initialState = dashboardPresetState();
		let mode = "new";
		let targetId = initialState.baselinePresetId || initialState.presets[0]?.id || "";
		const modeControl = segmentedControl({
			value: mode,
			ariaLabel: t("aaalice.workspace.transfer.importMode", "Import mode"),
			className: "aa-dashboard-import-mode",
			options: [
				{ value: "new", label: t("aaalice.workspace.transfer.importAsNew", "Import as new preset"), iconName: "copy" },
				{ value: "values", label: t("aaalice.workspace.transfer.overwriteValues", "Overwrite preset values"), iconName: "download", disabled: !initialState.presets.length },
			],
			onChange: (next) => { mode = next; renderImportPreview(); },
		});
		const modeHint = el("p", "aa-transfer-mode-hint");
		const targetSelect = selectControl({
			options: [], value: targetId, ariaLabel: t("aaalice.workspace.transfer.targetPreset", "Target preset"), className: "aa-dashboard-import-target",
			onChange: (next) => { targetId = next; renderImportPreview(); },
		});
		const targetField = field({ label: t("aaalice.workspace.transfer.targetPreset", "Target preset"), hint: t("aaalice.workspace.transfer.targetPresetHint", "Its pages, cards, groups, sizes and bindings will stay unchanged."), control: targetSelect, className: "aa-dashboard-import-target-field" });
		const presetName = document.createElement("input"); presetName.maxLength = 80; presetName.value = defaultPresetName;
		const nameHint = t("aaalice.workspace.transfer.importNameHint", "The file name is used by default. If it conflicts, a suffix is added when you confirm.");
		const nameField = field({ label: t("aaalice.workspace.dashboardPreset.name", "Preset name"), hint: nameHint, control: presetName, className: "aa-dashboard-import-name-field" });
		const preview = el("div", { className: "aa-dashboard-import-preview" });
		const importError = el("div", { className: "aa-transfer-inline-error", attrs: { role: "alert", hidden: true } });
		const modeBlock = el("section", { className: "aa-transfer-block aa-dashboard-import-mode-block", children: [el("h3", null, t("aaalice.workspace.transfer.importMode", "Import mode")), modeControl, modeHint] });
		let primary; let actionBusy = false;
		const setImportControlsBusy = (busy) => { actionBusy = busy; modeControl.setDisabled?.(busy); targetSelect.setDisabled(busy || !dashboardPresetState().presets.length); presetName.disabled = busy; };

		const actionableFullIssues = (plan) => plan.issues.filter((entry) => !["unset", "layout-only", "unused"].includes(entry.status));
		const renderFullPreview = (plan) => {
			const pages = plan.dashboard.pages; const groups = pages.flatMap((page) => page.groups); const issues = actionableFullIssues(plan); const compatible = plan.ready; const savedValues = compatible.filter((entry) => entry.saved);
			return [
				createTransferStats([
					{ value: pages.length, label: t("aaalice.workspace.transfer.pages", "Pages"), tone: "primary" },
					{ value: groups.length, label: t("aaalice.workspace.transfer.groups", "Groups") },
					{ value: compatible.length, label: t("aaalice.workspace.transfer.matched", "Matched"), tone: "success" },
					{ value: issues.length, label: t("aaalice.workspace.transfer.needsRebinding", "Needs rebinding"), tone: issues.length ? "warning" : "neutral" },
				]),
				...(issues.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.unresolvedBindings", "Unresolved bindings"), description: t("aaalice.workspace.transfer.unresolvedBindingsHint", "They remain in the layout for manual rebinding after import."), count: issues.length, tone: "warning", open: true, children: [el("div", { className: "aa-transfer-entry-list", children: dashboardPresetTransferRows(issues) })] })] : []),
				el("div", { className: "aa-transfer-callout is-info", children: [icon("statusIdle"), el("p", null, `${savedValues.length} ${t("aaalice.workspace.transfer.compatibleValues", "compatible saved values will be restored. Values outside current ranges are safely skipped.")}`)] }),
			];
		};

		const renderValuePreview = (plan, targetPreset) => {
			if (!targetPreset) return [el("div", { className: "aa-transfer-callout is-warning", children: [icon("statusWarning"), el("p", null, t("aaalice.workspace.transfer.noTargetPreset", "Save a target sidebar preset before using value-only import."))] })];
			const review = plan.entries.filter((entry) => !["ready", "preserved", "unused"].includes(entry.status));
			const unused = plan.entries.filter((entry) => entry.status === "unused");
			const targetMeta = `${targetPreset.dashboard.pages.length} ${t("aaalice.workspace.transfer.pages", "Pages")} · ${targetPreset.dashboard.pages.flatMap((page) => page.items).filter((item) => item.kind === "control").length} ${t("aaalice.workspace.transfer.controls", "Controls")}`;
			return [
				createTransferStats([
					{ value: plan.summary.overwritten, label: t("aaalice.workspace.transfer.willOverwrite", "Will overwrite"), tone: "success" },
					{ value: plan.summary.preserved, label: t("aaalice.workspace.transfer.willKeep", "Will keep"), tone: "primary" },
					{ value: plan.summary.unmatched, label: t("aaalice.workspace.transfer.unmatched", "Unmatched"), tone: plan.summary.unmatched ? "info" : "neutral" },
					{ value: plan.summary.needsReview, label: t("aaalice.workspace.transfer.needsReview", "Needs review"), tone: plan.summary.needsReview ? "warning" : "neutral" },
				]),
				el("div", { className: "aa-transfer-callout is-success", children: [icon("statusCheck"), el("p", null, t("aaalice.workspace.transfer.targetLayoutKept", "Target “{name}” keeps its current pages, cards, groups, sizes and bindings ({meta}).").replace("{name}", targetPreset.name).replace("{meta}", targetMeta))] }),
				...(review.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.valueNeedsReview", "Values needing attention"), description: t("aaalice.workspace.transfer.valueNeedsReviewHint", "These source values will be skipped and the target values will remain unchanged."), count: review.length, tone: "warning", open: true, children: [el("div", { className: "aa-transfer-entry-list", children: dashboardPresetTransferRows(review) })] })] : []),
				...(unused.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.valuesNotOnTarget", "Values not on target preset"), description: t("aaalice.workspace.transfer.valuesNotOnTargetHint", "The old layout is never used to create cards or write outside the selected target."), count: unused.length, tone: "info", children: [el("div", { className: "aa-transfer-entry-list", children: dashboardPresetTransferRows(unused) })] })] : []),
				el("div", { className: "aa-transfer-callout is-info", children: [icon("statusIdle"), el("p", null, t("aaalice.workspace.transfer.valueImportHint", "Only exact stable Binding Keys are considered. Source values missing from the target keep the target value; new target parameters keep their own value."))] }),
			];
		};

		function renderImportPreview() {
			const state = dashboardPresetState();
			let targetPreset = state.presets.find((preset) => preset.id === targetId) || null;
			if (!targetPreset && state.presets.length) { targetId = state.baselinePresetId || state.presets[0].id; targetPreset = state.presets.find((preset) => preset.id === targetId) || null; targetSelect.setValue(targetId, false); }
			if (!targetPreset && mode === "values") { mode = "new"; modeControl.setValue(mode); }
			const selectedTarget = mode === "values" ? targetPreset : null;
			const fullPlan = mode === "new" ? planDashboardPresetApplication(snapshot, (binding) => resolve(binding)) : null;
			const valuePlan = selectedTarget ? planDashboardPresetValueOverwrite(snapshot, selectedTarget, (binding) => resolve(binding)) : null;
			const hasPresets = state.presets.length > 0;
			modeControl.setOptionDisabled?.("values", !hasPresets);
			targetSelect.setOptions(hasPresets ? state.presets.map((preset) => ({ value: preset.id, label: `${preset.name} · ${preset.dashboard.pages.length} ${t("aaalice.workspace.transfer.pages", "pages")} · ${Object.keys(preset.values).length} ${t("aaalice.workspace.transfer.values", "values")}` })) : [{ value: "", label: t("aaalice.workspace.transfer.noTargetPreset", "Save a target sidebar preset first."), disabled: true }], targetId);
			modeControl.setDisabled?.(actionBusy);
			targetSelect.setDisabled(actionBusy || !hasPresets);
			presetName.disabled = actionBusy;
			targetField.hidden = mode !== "values";
			nameField.hidden = mode !== "new";
			modeHint.textContent = mode === "new"
				? t("aaalice.workspace.transfer.importAsNewHint", "Restore the file as a complete preset: layout, bindings and compatible values.")
				: t("aaalice.workspace.transfer.overwriteValuesHint", "Use the file only as a value source. The selected preset’s layout stays exactly as it is.");
			const noTargetNotice = !hasPresets ? [el("div", { className: "aa-transfer-callout is-warning", children: [icon("statusWarning"), el("p", null, t("aaalice.workspace.transfer.noTargetPreset", "Save a target sidebar preset before using value-only import."))] })] : [];
			preview.replaceChildren(...noTargetNotice, ...(mode === "new" ? renderFullPreview(fullPlan) : renderValuePreview(valuePlan, selectedTarget)));
			const canApply = mode === "new" || Boolean(valuePlan?.ready.length);
			const primaryLabel = mode === "new" ? t("aaalice.workspace.transfer.importAsNew", "Import as new preset") : t("aaalice.workspace.transfer.overwriteAndApply", "Overwrite values and apply");
			primary.textContent = primaryLabel; primary.disabled = !canApply;
			const fullIssueCount = fullPlan ? actionableFullIssues(fullPlan).length : 0;
			setDialogFooter(footer, el("span", "aa-transfer-footer-note", mode === "new" ? (fullIssueCount ? `${fullIssueCount} ${t("aaalice.workspace.transfer.bindingsNeedAttention", "bindings need attention")}` : t("aaalice.workspace.transfer.allBindingsMatched", "All bindings matched")) : (valuePlan ? `${valuePlan.summary.overwritten} ${t("aaalice.workspace.transfer.valuesReady", "values ready")}` : t("aaalice.workspace.transfer.chooseTarget", "Choose a target preset"))), button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), primary);
		}

		primary = button({ label: t("aaalice.workspace.transfer.importAsNew", "Import as new preset"), onClick: async () => {
			importError.hidden = true;
			const actionLabel = mode === "new" ? t("aaalice.workspace.transfer.importAsNew", "Import as new preset") : t("aaalice.workspace.transfer.overwriteAndApply", "Overwrite values and apply");
			setActionBusy(primary, true, actionLabel, t("aaalice.workspace.transfer.importing", "Importing…"));
			setImportControlsBusy(true);
			try {
				const graph = app.graph;
				if (mode === "new") {
					const latestPlan = planDashboardPresetApplication(snapshot, (binding) => resolve(binding));
					const currentState = dashboardPresetState();
					const importedPresetName = availableDashboardPresetName(presetName.value, currentState);
					graph?.beforeChange?.();
					try {
						graph.extra ||= {};
						const nextPresetState = createDashboardPreset(currentState, importedPresetName, snapshot);
						applyDashboardSnapshotPlan(latestPlan, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); } });
						graph.extra[runtime.presetsExtraKey] = nextPresetState;
						runtime.setActivePageId(latestPlan.dashboard.pages[0]?.id || null);
					} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender(); }
					const resultHint = (actionableFullIssues(latestPlan).length ? t("aaalice.workspace.transfer.presetImportPartialHint", "Preset “{name}” was created and applied. Unresolved cards were kept so you can rebind them manually.") : t("aaalice.workspace.transfer.presetImportCompleteHint", "Preset “{name}” was created and applied. Pages, layout groups, bindings and compatible saved values were restored.")).replace("{name}", importedPresetName);
					body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.presetImportComplete", "Layout imported"), description: resultHint, count: latestPlan.ready.length, countLabel: t("aaalice.workspace.transfer.controlsMatched", "controls matched") }));
				} else {
					const prepared = await prepareDashboardPresetSwitch(targetId, { forcePrompt: true });
					if (!prepared) { setImportControlsBusy(false); setActionBusy(primary, false, actionLabel, ""); renderImportPreview(); return; }
					const { state, preset: targetPreset } = prepared;
					const latestValues = planDashboardPresetValueOverwrite(snapshot, targetPreset, (binding) => resolve(binding));
					if (!latestValues.ready.length) throw new Error(t("aaalice.workspace.transfer.noValuesMatched", "No compatible values matched the selected target preset."));
					const applicationPlan = planDashboardPresetApplication(latestValues.merged, (binding) => resolve(binding));
					const applicationIssues = applicationPlan.issues.filter((entry) => !["unset", "unused", "layout-only"].includes(entry.status));
					if (applicationIssues.length && !await confirmPartialDashboardPreset({ ...applicationPlan, issues: applicationIssues }, targetPreset)) { setImportControlsBusy(false); setActionBusy(primary, false, actionLabel, ""); renderImportPreview(); return; }
					const previousExtra = graph.extra?.[runtime.presetsExtraKey];
					const nextState = replaceDashboardPreset(state, targetPreset.id, latestValues.merged);
					graph?.beforeChange?.();
					try {
						graph.extra ||= {};
						graph.extra[runtime.presetsExtraKey] = nextState;
						applyDashboardSnapshotPlan(applicationPlan, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); } });
						runtime.setActivePageId(applicationPlan.dashboard.pages.some((page) => page.id === runtime.getActivePageId()) ? runtime.getActivePageId() : applicationPlan.dashboard.pages[0]?.id || null);
					} catch (error) {
						if (typeof previousExtra === "undefined") delete graph.extra[runtime.presetsExtraKey]; else graph.extra[runtime.presetsExtraKey] = structuredClone(previousExtra);
						throw error;
					} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender(); }
					const skipped = latestValues.summary.needsReview + latestValues.summary.unmatched + applicationIssues.length;
					const resultHint = t("aaalice.workspace.transfer.valueImportCompleteHint", "Preset “{name}” was updated and applied. Its layout stayed unchanged; {count} compatible values were written.{skippedHint}").replace("{name}", targetPreset.name).replace("{count}", String(latestValues.summary.overwritten)).replace("{skippedHint}", skipped ? ` ${skipped} ${t("aaalice.workspace.transfer.valuesSkipped", "source values were skipped")}.` : "");
					body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.valuesImported", "Values imported"), description: resultHint, count: latestValues.summary.overwritten, countLabel: t("aaalice.workspace.transfer.valuesOverwritten", "values overwritten") }));
				}
				setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
			} catch (error) {
				importError.textContent = String(error?.message || error); importError.hidden = false;
				setImportControlsBusy(false); setActionBusy(primary, false, actionLabel, ""); renderImportPreview();
			}
		} });
		body.replaceChildren(createTransferHero({ iconName: "download", eyebrow: t("aaalice.workspace.transfer.review", "Import preview"), title: file.name, description: t("aaalice.workspace.transfer.chooseImportMode", "Choose whether to restore the complete layout or only transfer values into an existing preset."), fileName: file.name, fileMeta: `${formatFileSize(file.size)} · ${t("aaalice.workspace.transfer.jsonPreset", "JSON layout backup")}`, tone: "dashboard" }), modeBlock, targetField, preview, nameField, importError);
		renderImportPreview();
	} catch (error) {
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.invalidPreset", "Could not read this layout backup"), description: error.message, tone: "error" }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Close"), onClick: () => dialog.close() }));
	}
}

const renderedWorkspaceTabs = new WeakSet();
const workspaceWidthObservers = new Map();
