import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { controlProviders } from "../lib/control_providers.js";
import { normalizeDashboard } from "../lib/dashboard_model.js";
import { compareDashboardPreset, createDashboardPreset, duplicateDashboardPreset, emptyDashboardPresetState, normalizeDashboardPresetState, parseDashboardPreset, removeDashboardPreset, renameDashboardPreset, replaceDashboardPreset, serializeDashboardPreset, setDashboardPresetBaseline } from "../lib/dashboard_presets.js";
import { applyDashboardSnapshotPlan, captureDashboardValues, mergeCapturedPresetValues, planDashboardPresetApplication } from "../lib/dashboard_preset_runtime.js";
import { badge, button, createDialog, el, field, icon } from "../lib/ui.js";
import { createTransferHero, createTransferResult, createTransferSection, createTransferStats } from "../lib/workspace_components.js";
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
const remindWorkflowSave = (detail) => runtime.remindWorkflowSave(detail);
const workspaceLabels = () => runtime.workspaceLabels();

export function dashboardPresetState() {
	try {
		const source = app.graph?.extra?.[runtime.presetsExtraKey] ?? null;
		const value = normalizeDashboardPresetState(source); dashboardPresetModelError = null;
		if (source && source.presets?.some((preset) => preset.dashboard?.version !== value.presets.find((entry) => entry.id === preset.id)?.dashboard.version)) app.graph.extra[runtime.presetsExtraKey] = value;
		return value;
	} catch (error) { dashboardPresetModelError = error; return emptyDashboardPresetState(); }
}

export function updateDashboardPresetState(callback, detail = null) {
	if (dashboardPresetModelError) throw dashboardPresetModelError;
	const graph = app.graph; graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[runtime.presetsExtraKey] = normalizeDashboardPresetState(callback(dashboardPresetState()) || dashboardPresetState());
	} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender("dashboard"); }
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
	};
}

function notifyDashboardPresetError(error) {
	app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.workspace.dashboardPreset.error", "Sidebar preset error"), detail: String(error?.message || error), life: 5200 });
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

function availableDashboardPresetName(sourceName, state = dashboardPresetState()) {
	const fallback = t("aaalice.workspace.dashboardPreset.defaultName", "Preset {count}").replace("{count}", "1");
	const source = String(sourceName || "").trim() || fallback;
	const names = new Set(state.presets.map((preset) => preset.name.toLocaleLowerCase())); let count = 1; let name;
	do {
		const suffix = count++ === 1 ? "" : ` ${count - 1}`;
		name = `${source.slice(0, Math.max(1, 80 - suffix.length)).trim()}${suffix}`;
	} while (names.has(name.toLocaleLowerCase()));
	return name;
}

function dashboardPresetFileName(name) {
	const safeName = String(name || "").trim()
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "")
		.slice(0, 80)
		.trim();
	return `${safeName || "aaalice-dashboard-layout"}.json`;
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

export async function createCurrentDashboardPreset(model = dashboard()) {
	const state = dashboardPresetState(); const snapshot = currentDashboardPresetSnapshot(model);
	if (!snapshot.dashboard.pages.length && !Object.keys(snapshot.values).length) { notifyDashboardPresetError(t("aaalice.workspace.dashboardPreset.noContent", "There is no sidebar layout to save.")); return false; }
	const names = new Set(state.presets.map((preset) => preset.name.toLowerCase())); let count = 1; let name;
	do { name = t("aaalice.workspace.dashboardPreset.defaultName", "Preset {count}").replace("{count}", String(count++)); } while (names.has(name.toLowerCase()));
	const nextName = await askTextValue(dashboardPresetLabels().create, t("aaalice.workspace.dashboardPreset.name", "Preset name"), name);
	return nextName ? commitDashboardPresetChange((current) => createDashboardPreset(current, nextName, snapshot)) : false;
}

export function updateCurrentDashboardPreset(presetId, model = dashboard()) {
	const state = dashboardPresetState(); const preset = state.presets.find((item) => item.id === presetId); if (!preset) return false;
	const snapshot = currentDashboardPresetSnapshot(model, preset.values);
	return commitDashboardPresetChange((current) => replaceDashboardPreset(current, presetId, snapshot), t("aaalice.workspace.dashboardPreset.savedReminder", "Sidebar preset updated. Save the workflow to keep it."));
}

export async function duplicateCurrentDashboardPreset(presetId) {
	const state = dashboardPresetState(); const preset = state.presets.find((item) => item.id === presetId); if (!preset) return;
	const name = t("aaalice.workspace.dashboardPreset.copyName", "{name} copy").replace("{name}", preset.name);
	const nextName = await askTextValue(dashboardPresetLabels().duplicate, t("aaalice.workspace.dashboardPreset.name", "Preset name"), name);
	if (nextName) commitDashboardPresetChange((current) => duplicateDashboardPreset(current, presetId, nextName));
}

export async function renameCurrentDashboardPreset(presetId) {
	const preset = dashboardPresetState().presets.find((item) => item.id === presetId); if (!preset) return;
	const name = await askTextValue(dashboardPresetLabels().rename, t("aaalice.workspace.dashboardPreset.name", "Preset name"), preset.name);
	if (name) commitDashboardPresetChange((current) => renameDashboardPreset(current, presetId, name));
}

export async function deleteCurrentDashboardPreset(presetId) {
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

export async function applyDashboardPreset(presetId, { restore = false } = {}) {
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
		applyDashboardSnapshotPlan(plan, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); } });
		graph.extra[runtime.presetsExtraKey] = setDashboardPresetBaseline(state, presetId);
		const activePageId = runtime.getActivePageId();
		runtime.setActivePageId(preset.dashboard.pages.some((page) => page.id === activePageId) ? activePageId : preset.dashboard.pages[0]?.id || null);
	} catch (error) { notifyDashboardPresetError(error); return; }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender("dashboard"); }
	remindWorkflowSave(t("aaalice.workspace.dashboardPreset.appliedReminder", "Sidebar preset applied. Save the workflow to keep the layout and values."));
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
		el("div", { className: "aa-transfer-callout is-info", children: [icon("statusIdle"), el("p", null, t("aaalice.workspace.transfer.presetIdentityHint", "The preset name is stored in the JSON. If the same name already exists locally, import will suggest a non-conflicting name."))] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.preset.export", "Export layout"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.workspace.preset.export", "Export layout"), onClick: () => {
		downloadBlob(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }), fileName);
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.exportComplete", "Export ready"), description: t("aaalice.workspace.transfer.presetExportCompleteHint", "Preset “{name}” was downloaded as {file}.").replace("{name}", presetName).replace("{file}", fileName), count: controls.length, countLabel: t("aaalice.workspace.transfer.controls", "controls") }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
	} }));
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
		const importedName = snapshot.name || String(file.name || "").replace(/\.[^.]+$/, "").trim();
		const suggestedPresetName = availableDashboardPresetName(importedName);
		const preflight = planDashboardPresetApplication(snapshot, (binding) => resolve(binding));
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
		const presetName = document.createElement("input"); presetName.maxLength = 80; presetName.value = suggestedPresetName;
		const nameHint = suggestedPresetName !== importedName && importedName
			? t("aaalice.workspace.transfer.importNameConflictHint", "A preset named “{name}” already exists, so a non-conflicting name was suggested.").replace("{name}", importedName)
			: t("aaalice.workspace.transfer.importNameHint", "This name will be added to the current workflow. Existing presets are not overwritten.");
		const importError = el("div", { className: "aa-transfer-inline-error", attrs: { role: "alert", hidden: true } });
		body.append(field({ label: t("aaalice.workspace.dashboardPreset.name", "Preset name"), hint: nameHint, control: presetName }), importError);
		const primary = button({ label: importLabel, onClick: () => {
			importError.hidden = true;
			setActionBusy(primary, true, importLabel, t("aaalice.workspace.transfer.importing", "Importing…"));
			try {
				const graph = app.graph; graph?.beforeChange?.();
				try {
					graph.extra ||= {};
					const nextPresetState = createDashboardPreset(dashboardPresetState(), presetName.value, snapshot);
					applyDashboardSnapshotPlan(preflight, { readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); } });
					graph.extra[runtime.presetsExtraKey] = nextPresetState;
					runtime.setActivePageId(preflight.dashboard.pages[0]?.id || null);
				} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender(); }
				const resultHint = (missing.length ? t("aaalice.workspace.transfer.presetImportPartialHint", "Preset “{name}” is active. Unresolved cards were kept so you can rebind them manually.") : t("aaalice.workspace.transfer.presetImportCompleteHint", "Preset “{name}” is active. Pages, layout groups, bindings and compatible saved values were restored.")).replace("{name}", presetName.value.trim());
				body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.presetImportComplete", "Layout imported"), description: resultHint, count: compatible.length, countLabel: t("aaalice.workspace.transfer.controlsMatched", "controls matched") }));
				setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
			} catch (error) {
				importError.textContent = String(error?.message || error);
				importError.hidden = false;
				setActionBusy(primary, false, importLabel, "");
			}
		} });
		setDialogFooter(footer, el("span", "aa-transfer-footer-note", missing.length ? `${missing.length} ${t("aaalice.workspace.transfer.bindingsNeedAttention", "bindings need attention")}` : t("aaalice.workspace.transfer.allBindingsMatched", "All bindings matched")), button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), primary);
	} catch (error) {
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.invalidPreset", "Could not read this layout backup"), description: error.message, tone: "error" }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Close"), onClick: () => dialog.close() }));
	}
}

const renderedWorkspaceTabs = new WeakSet();
const workspaceWidthObservers = new Map();
