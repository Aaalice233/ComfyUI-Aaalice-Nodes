import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingControlIdLabel, isModelResourceBinding } from "../lib/dashboard_binding_identity.js";
import { bindingKey, controlItemBindings, emptyDashboard, normalizeDashboard } from "../lib/dashboard_model.js";
import { availableDashboardPresetName, compareDashboardPreset, createDashboardPreset, dashboardPresetFileName, dashboardPresetNameFromFile, dashboardPresetStateNeedsMigration, duplicateDashboardPreset, emptyDashboardPresetState, normalizeDashboardPresetState, parseDashboardPresetForImport, removeDashboardPreset, renameDashboardPreset, replaceDashboardPreset, serializeDashboardPreset, setDashboardPresetBaseline } from "../lib/dashboard_presets.js";
import { applyDashboardSnapshotPlan, captureDashboardValues, dashboardPresetIssueLocations, mergeCapturedPresetValues, planDashboardPresetApplication, planDashboardPresetValueOverwrite } from "../lib/dashboard_preset_runtime.js";
import { badge, button, createDialog, el, field, icon, segmentedControl, selectControl } from "../lib/ui.js";
import { createTransferResult, createTransferSection, createTransferStats, formatFileSize } from "../lib/workspace_components.js";
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
const syncDashboardPresetViews = () => runtime.syncDashboardPresetViews();
const scheduleStructuralRender = (view = null) => runtime.scheduleStructuralRender(view);
const remindWorkflowSave = (detail) => runtime.remindWorkflowSave(detail);
const workspaceLabels = () => runtime.workspaceLabels();
function restoreGraphExtra(graph, key, value) {
	if (typeof value === "undefined") delete graph.extra[key];
	else graph.extra[key] = structuredClone(value);
}

export function dashboardPresetState() {
	try {
		const source = app.graph?.extra?.[runtime.presetsExtraKey] ?? null;
		const value = normalizeDashboardPresetState(source); dashboardPresetModelError = null;
		if (source && dashboardPresetStateNeedsMigration(source, value)) app.graph.extra[runtime.presetsExtraKey] = value;
		return value;
	} catch (error) { dashboardPresetModelError = error; return emptyDashboardPresetState(); }
}

export function updateDashboardPresetState(callback, detail = null) {
	if (dashboardPresetModelError) throw dashboardPresetModelError;
	const graph = app.graph; graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[runtime.presetsExtraKey] = normalizeDashboardPresetState(callback(dashboardPresetState()) || dashboardPresetState());
	} finally {
		graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); syncDashboardPresetViews();
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
	if (dashboardPresetAutoSaveRunning) return;
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
	if (dashboardPresetAutoSaveFrame) return;
	dashboardPresetAutoSaveFrame = requestAnimationFrame(() => {
		dashboardPresetAutoSaveFrame = 0;
		if (runtime.isAutoSaveEnabled()) autoSaveActiveDashboardPreset();
		else syncDashboardPresetViews();
	});
}

function commitDashboardPresetChange(callback, detail = t("aaalice.workspace.dashboardPreset.saveWorkflowReminder", "Save the workflow to keep these sidebar presets.")) {
	try { updateDashboardPresetState(callback); if (detail) notifyDashboardPresetSuccess(dashboardPresetLabels().title, detail); return true; }
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
	const graph = app.graph; const previousPresetExtra = structuredClone(graph?.extra?.[runtime.presetsExtraKey]); const previousActivePageId = runtime.getActivePageId();
	const applicationPlan = plan || { dashboard: emptyDashboard(), ready: [], issues: [] };
	const nextActivePageId = nextPreset?.dashboard.pages.some((page) => page.id === previousActivePageId) ? previousActivePageId : nextPreset?.dashboard.pages[0]?.id || null;
	graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		applyDashboardSnapshotPlan(applicationPlan, {
			readDashboard: () => dashboard(),
			writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); },
			commit: () => { graph.extra[runtime.presetsExtraKey] = nextState; runtime.setActivePageId(nextActivePageId); },
			rollbackCommit: () => { restoreGraphExtra(graph, runtime.presetsExtraKey, previousPresetExtra); runtime.setActivePageId(previousActivePageId); },
		});
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

function dashboardPresetIssueReason(entry, modelResource = false) {
	const value = ["string", "number", "boolean"].includes(typeof (entry.presetSaved || entry.saved)?.payload) ? String((entry.presetSaved || entry.saved).payload) : "";
	const reasons = {
		"missing-option": t(modelResource ? "aaalice.workspace.dashboardPreset.reasonMissingModelOption" : "aaalice.workspace.dashboardPreset.reasonMissingOption", modelResource ? "Model “{value}” is not in this parameter's current model list. Check that the file exists in the correct ComfyUI model directory, then check whether its relative path differs from the preset because it is inside a nested folder. If both are correct, refresh the ComfyUI page and try again. The preset value will still be applied so this component cannot silently keep the previous preset's model." : "The saved option “{value}” is no longer in this parameter's list. The current workflow value will be kept.").replaceAll("{value}", () => value),
		"missing-model-option": t("aaalice.workspace.dashboardPreset.reasonMissingModelOption", "Model “{value}” is not in this parameter's current model list. Check that the file exists in the correct ComfyUI model directory, then check whether its relative path differs from the preset because it is inside a nested folder. If both are correct, refresh the ComfyUI page and try again. The preset value will still be applied so this component cannot silently keep the previous preset's model.").replaceAll("{value}", () => value),
		"ambiguous-model-option": t("aaalice.workspace.dashboardPreset.reasonAmbiguousModelOption", "Several models named “{value}” were found in nested folders, so no path can be selected safely. The preset value will still be applied; remove or rename duplicate files, then switch the preset again.").replaceAll("{value}", () => value),
		"model-path-match": t("aaalice.workspace.dashboardPreset.reasonModelPathMatch", "Model “{value}” was found at “{path}”. Confirm to use the detected nested path for this switch.").replaceAll("{value}", () => value).replaceAll("{path}", () => String(entry.detectedModelPath || "")),
		"below-minimum": t("aaalice.workspace.dashboardPreset.reasonBelowMinimum", "The saved number is below this parameter's current minimum. The current workflow value will be kept."),
		"above-maximum": t("aaalice.workspace.dashboardPreset.reasonAboveMaximum", "The saved number is above this parameter's current maximum. The current workflow value will be kept."),
		"ambiguous-semantic-match": t("aaalice.workspace.dashboardPreset.reasonAmbiguous", "Several components could match, so no value was guessed."),
		"value-type-mismatch": t("aaalice.workspace.dashboardPreset.reasonTypeChanged", "This parameter now uses a different value type. The current workflow value will be kept."),
		"conflicting-value-type": t("aaalice.workspace.dashboardPreset.reasonTypeConflict", "This target has conflicting value types, so its saved value was skipped."),
		"invalid-preset-value": t("aaalice.workspace.dashboardPreset.reasonDamaged", "This saved value is damaged and was skipped."),
		"invalid-preset-key": t("aaalice.workspace.dashboardPreset.reasonDamaged", "This saved value is damaged and was skipped."),
	};
	const statusReasons = { missing: t("aaalice.workspace.dashboardPreset.reasonMissing", "The original parameter is not available in the current workflow. Rebind this component before restoring its value."), incompatible: t("aaalice.workspace.dashboardPreset.reasonIncompatible", "The parameter contract has changed. The current workflow value will be kept."), unused: t("aaalice.workspace.dashboardPreset.reasonUnused", "This value belongs to a component that is no longer on the sidebar and will be skipped."), empty: t("aaalice.workspace.dashboardPreset.reasonEmpty", "This parameter currently has no available options. The current workflow value will be kept."), unset: t("aaalice.workspace.dashboardPreset.reasonUnset", "This parameter currently has no value to restore."), unavailable: t("aaalice.workspace.dashboardPreset.reasonUnavailable", "This parameter is temporarily unavailable. The current workflow value will be kept."), error: t("aaalice.workspace.dashboardPreset.reasonControlError", "This parameter could not be read safely. The current workflow value will be kept."), invalid: t("aaalice.workspace.dashboardPreset.reasonRejected", "This parameter no longer accepts the saved value. The current workflow value will be kept.") };
	return reasons[entry.reason] || statusReasons[entry.status] || t("aaalice.workspace.dashboardPreset.reasonUnknown", "This saved value cannot be restored safely and will be skipped.");
}

function dashboardPresetIssueView(entry, dashboard) {
	const locations = dashboardPresetIssueLocations(dashboard, entry); const location = locations[0] || null;
	const modelResource = ["missing-option", "missing-model-option", "ambiguous-model-option", "model-path-match"].includes(entry.reason) && isModelResourceBinding(entry.binding, (entry.presetSaved || entry.saved)?.payload, location?.parameterLabel || entry.resolved?.label);
	const fallbackLabel = entry.binding ? bindingControlIdLabel(entry.binding) : t("aaalice.workspace.dashboardPreset.removedComponent", "Removed sidebar component");
	const componentLabel = location?.componentLabel || entry.resolved?.label || fallbackLabel;
	const details = [];
	if (location?.pageName) details.push(t("aaalice.workspace.dashboardPreset.locationPage", "Page “{page}”").replaceAll("{page}", () => location.pageName));
	if (location?.groupName) details.push(t("aaalice.workspace.dashboardPreset.locationGroup", "Group “{group}”").replaceAll("{group}", () => location.groupName));
	if (location?.parameterLabel && location.parameterLabel !== componentLabel) details.push(t("aaalice.workspace.dashboardPreset.locationParameter", "Parameter “{parameter}”").replaceAll("{parameter}", () => location.parameterLabel));
	if (locations.length > 1) details.push(t("aaalice.workspace.dashboardPreset.locationMore", "+{count} more locations").replaceAll("{count}", () => String(locations.length - 1)));
	return { componentLabel, location: details.join(" · "), reason: dashboardPresetIssueReason(entry, modelResource), modelResource };
}

function confirmPartialDashboardPreset(plan, preset) {
	return new Promise((resolveConfirmed) => {
		let settled = false; let dialog;
		const finish = (confirmed) => { if (settled) return; settled = true; dialog.close(); resolveConfirmed(confirmed); };
		const availability = workspaceLabels().availability;
		const labels = { missing: t("aaalice.workspace.binding.missing", "Missing"), incompatible: t("aaalice.workspace.binding.incompatible", "Incompatible"), invalid: t("aaalice.workspace.dashboardPreset.invalid", "Invalid value"), ambiguous: t("aaalice.workspace.dashboardPreset.ambiguous", "Needs review"), unused: t("aaalice.workspace.dashboardPreset.unused", "Not on sidebar"), "layout-only": t("aaalice.workspace.dashboardPreset.layoutOnly", "Layout only"), empty: availability.noOptions, unset: availability.unset, unavailable: availability.unavailable, error: availability.error };
		const rows = plan.issues.map((entry) => { const view = dashboardPresetIssueView(entry, plan.dashboard); return el("div", { className: "aa-value-preset-issue", children: [
			el("div", { children: [el("strong", null, view.componentLabel), ...(view.location ? [el("span", { className: "aa-value-preset-issue__location" }, view.location)] : []), el("small", null, view.reason)] }),
			badge(entry.status === "model-path-match" ? t("aaalice.workspace.dashboardPreset.modelPathFound", "Nested path found") : view.modelResource ? t("aaalice.workspace.dashboardPreset.modelUnavailable", "Model not listed") : entry.reason === "missing-option" ? t("aaalice.workspace.dashboardPreset.optionUnavailable", "Option unavailable") : labels[entry.status] || t("aaalice.workspace.dashboardPreset.attention", "Needs attention"), { className: entry.status === "model-path-match" ? "is-success" : "is-warning" }),
		] }); });
		const hasDetectedModels = plan.issues.some((entry) => entry.status === "model-path-match");
		const hasForcedModels = plan.issues.some((entry) => ["missing-model", "ambiguous-model"].includes(entry.status));
		const body = el("div", { className: "aa-value-preset-review", children: [
			el("p", null, hasForcedModels
				? t("aaalice.workspace.dashboardPreset.modelReviewHint", "Some model paths need attention. Confirming still applies every model value from the new preset, so no component silently keeps a model from the previous preset. Detected nested paths will use the listed installed path.")
				: hasDetectedModels
					? t("aaalice.workspace.dashboardPreset.modelPathHint", "Matching model files were found in nested folders. Confirm to use the detected installed paths for this switch.")
					: t("aaalice.workspace.dashboardPreset.partialHint", "Some controls cannot be restored safely. Review them before applying the compatible layout and values.")),
			el("div", { className: "aa-value-preset-issues", children: rows }),
		] });
		const footer = el("div", { children: [button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(false) }), button({ label: hasDetectedModels || hasForcedModels ? t("aaalice.workspace.dashboardPreset.applyPresetModels", "Apply preset models") : t("aaalice.workspace.dashboardPreset.applyCompatible", "Apply compatible preset"), onClick: () => finish(true) })] });
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
	const graph = app.graph; const previousPresetExtra = structuredClone(graph?.extra?.[runtime.presetsExtraKey]); const previousActivePageId = runtime.getActivePageId();
	const nextPresetState = setDashboardPresetBaseline(state, presetId); const nextActivePageId = preset.dashboard.pages.some((page) => page.id === previousActivePageId) ? previousActivePageId : preset.dashboard.pages[0]?.id || null;
	graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		applyDashboardSnapshotPlan(plan, {
			readDashboard: () => dashboard(),
			writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); },
			commit: () => { graph.extra[runtime.presetsExtraKey] = nextPresetState; runtime.setActivePageId(nextActivePageId); },
			rollbackCommit: () => { restoreGraphExtra(graph, runtime.presetsExtraKey, previousPresetExtra); runtime.setActivePageId(previousActivePageId); },
		});
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
	const controls = pages.flatMap((page) => page.items).filter((item) => item.kind === "control");
	const values = Object.keys(preset.values).length;
	const body = el("div", { className: "aa-transfer-dialog-body aa-dashboard-preset-transfer", children: [
		createDashboardPresetTransferSource({ iconName: "upload", title: presetName, meta: fileName }),
		createTransferStats([
			{ value: pages.length, label: t("aaalice.workspace.transfer.pages", "Pages"), tone: "primary" },
			{ value: controls.length, label: t("aaalice.workspace.transfer.controls", "Controls") },
			{ value: values, label: t("aaalice.workspace.transfer.values", "Saved values"), tone: values < controls.length ? "warning" : "success" },
		]),
		el("div", { className: "aa-transfer-callout is-info", children: [icon("statusIdle"), el("p", null, t("aaalice.workspace.transfer.exportPresetHint", "The current sidebar preset will be downloaded with its layout, bindings and compatible values."))] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.preset.export", "Export preset"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.workspace.preset.export", "Export preset"), onClick: () => {
		downloadBlob(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }), fileName);
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.exportComplete", "Preset exported"), description: t("aaalice.workspace.transfer.presetExportCompleteHint", "Preset “{name}” was downloaded as {file}.").replace("{name}", presetName).replace("{file}", fileName), count: controls.length, countLabel: t("aaalice.workspace.transfer.controls", "controls") }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
	} }));
}


function dashboardPresetTransferStatusLabel(status) {
	const availability = workspaceLabels().availability;
	return {
		missing: t("aaalice.workspace.binding.missing", "Missing binding"),
		incompatible: t("aaalice.workspace.binding.incompatible", "Incompatible"),
		invalid: t("aaalice.workspace.dashboardPreset.invalid", "Invalid value"),
		ambiguous: t("aaalice.workspace.transfer.ambiguousMatch", "Ambiguous match"),
		"model-path-match": t("aaalice.workspace.dashboardPreset.modelPathFound", "Nested path found"),
		"missing-model": t("aaalice.workspace.dashboardPreset.modelUnavailable", "Model not listed"),
		"ambiguous-model": t("aaalice.workspace.dashboardPreset.modelPathAmbiguous", "Duplicate model names"),
		recovered: t("aaalice.workspace.transfer.recoveredMatch", "Recovered match"),
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
		const value = entry.imported || entry.saved; const statusLabel = dashboardPresetTransferStatusLabel(entry.status);
		const identity = entry.binding ? `${entry.binding.provider} · ${entry.binding.valueType}` : value?.valueType || statusLabel;
		const badgeClass = ["recovered", "model-path-match"].includes(entry.status) ? "is-success" : ["invalid", "incompatible", "error"].includes(entry.status) ? "is-danger" : "is-warning";
		return el("div", { className: "aa-transfer-entry-row", children: [
			el("div", { children: [el("strong", null, entry.binding ? bindingControlIdLabel(entry.binding) : entry.key), el("small", null, identity)] }),
			badge(statusLabel, { className: badgeClass }),
		] });
	});
}

function layoutBreakingPresetIssues(plan) {
	return plan.issues.filter((entry) => ["missing", "error"].includes(entry.status)
		|| (entry.status === "incompatible" && entry.resolved?.status !== "ok")
		|| (entry.status === "invalid" && (!entry.resolved || entry.conflicts)));
}

function createDashboardPresetTransferSource({ iconName, title, meta }) {
	return el("section", { className: "aa-dashboard-preset-transfer-source", children: [
		el("span", { className: "aa-dashboard-preset-transfer-source__icon", children: [icon(iconName)] }),
		el("div", { children: [el("strong", null, title), el("span", null, meta)] }),
	] });
}

function confirmUnsafeDashboardLayoutImport(issueCount, canUseValues) {
	return new Promise((resolveDecision) => {
		let settled = false; let dialog;
		const finish = (decision) => { if (settled) return; settled = true; dialog.close(); resolveDecision(decision); };
		const body = el("div", { className: "aa-dashboard-import-risk-confirm", children: [
			icon("statusWarning"),
			el("p", null, t("aaalice.workspace.transfer.layoutBreakConfirmHint", "The new preset will keep {count} broken bindings. Values-only import is safer because it copies an existing preset and transfers only uniquely identified values.").replace("{count}", String(issueCount))),
		] });
		const actions = [button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(null) })];
		if (canUseValues) actions.push(button({ label: t("aaalice.workspace.transfer.useValueOnly", "Use values only"), onClick: () => finish("values") }));
		actions.push(button({ label: t("aaalice.workspace.transfer.importLayoutAnyway", "Import full preset anyway"), variant: "danger", onClick: () => finish("layout") }));
		dialog = createDialog({ title: t("aaalice.workspace.transfer.layoutBreakWarningTitle", "This preset contains broken bindings"), body, footer: el("div", { className: "aa-dashboard-import-risk-actions", children: actions }), size: "sm", className: "aa-dashboard-import-risk-dialog", onRequestClose: () => { finish(null); return false; } });
	});
}

export async function importDashboardPreset(file) {
	const sourceMeta = `${formatFileSize(file.size)} · ${t("aaalice.workspace.transfer.jsonPreset", "JSON preset")}`;
	const body = el("div", { className: "aa-transfer-dialog-body aa-dashboard-preset-transfer", children: [
		createDashboardPresetTransferSource({ iconName: "download", title: file.name, meta: sourceMeta }),
		el("div", { className: "aa-transfer-loading", attrs: { role: "status" }, children: [el("span", "aa-transfer-loading__bar"), el("span", null, t("aaalice.workspace.transfer.preflighting", "Preparing import…"))] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.preset.import", "Import preset"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }));
	try {
		const parsed = parseDashboardPresetForImport(JSON.parse(await file.text()));
		const { snapshot } = parsed; const sourceBindings = new Map();
		for (const page of snapshot.dashboard.pages) for (const item of page.items) for (const binding of controlItemBindings(item)) sourceBindings.set(bindingKey(binding), binding);
		const sourceIssues = parsed.issues.map((entry) => ({ ...entry, binding: sourceBindings.get(entry.key) || null }));
		const fallbackName = snapshot.name || t("aaalice.workspace.dashboardPreset.defaultName", "Preset {count}").replace("{count}", "1");
		const defaultPresetName = dashboardPresetNameFromFile(file.name, fallbackName);
		const initialState = dashboardPresetState();
		let targetId = initialState.baselinePresetId || initialState.presets[0]?.id || "";
		let mode = initialState.presets.length ? "values" : "new";
		let actionBusy = false; let presetNameEdited = false; let primary;
		const modeControl = segmentedControl({
			value: mode,
			ariaLabel: t("aaalice.workspace.transfer.importMode", "Import mode"),
			className: "aa-dashboard-import-mode",
			options: [
				{ value: "values", label: t("aaalice.workspace.transfer.overwriteValues", "Values only"), iconName: "download", disabled: !initialState.presets.length },
				{ value: "new", label: t("aaalice.workspace.transfer.importAsNew", "Layout + values"), iconName: "copy" },
			],
			onChange: (next) => { mode = next; renderImportPreview(); },
		});
		const targetSelect = selectControl({
			options: [], value: targetId, ariaLabel: t("aaalice.workspace.transfer.targetPreset", "Base preset"), className: "aa-dashboard-import-target",
			onChange: (next) => { targetId = next; renderImportPreview(); },
		});
		const presetName = document.createElement("input"); presetName.maxLength = 80;
		presetName.addEventListener("input", () => { presetNameEdited = true; renderImportPreview(); });
		const modeField = field({ label: t("aaalice.workspace.transfer.importMode", "Import mode"), control: modeControl, className: "aa-dashboard-import-mode-field" });
		const targetField = field({ label: t("aaalice.workspace.transfer.targetPreset", "Base preset"), control: targetSelect, className: "aa-dashboard-import-target-field" });
		const nameField = field({ label: t("aaalice.workspace.dashboardPreset.name", "New preset name"), control: presetName, className: "aa-dashboard-import-name-field" });
		const form = el("div", { className: "aa-dashboard-preset-transfer-form", children: [modeField, targetField, nameField] });
		const preview = el("div", { className: "aa-dashboard-import-preview" });
		const importError = el("div", { className: "aa-transfer-inline-error", attrs: { role: "alert", hidden: true } });
		const actionableFullIssues = (plan) => plan.issues.filter((entry) => !["unset", "layout-only", "unused"].includes(entry.status));
		const setImportControlsBusy = (busy) => {
			actionBusy = busy; modeControl.setDisabled?.(busy); targetSelect.setDisabled(busy || mode !== "values" || !dashboardPresetState().presets.length); presetName.disabled = busy;
		};
		const useValueOnly = () => { mode = "values"; modeControl.setValue(mode, false); renderImportPreview(); };
		const suggestedName = (state, targetPreset) => {
			const copyName = targetPreset ? t("aaalice.workspace.dashboardPreset.copyName", "{name} copy").replace("{name}", targetPreset.name) : defaultPresetName;
			const sourceName = mode === "values" ? copyName : defaultPresetName;
			return availableDashboardPresetName(sourceName.slice(0, 80), state);
		};
		const renderFullPreview = (plan) => {
			const pages = plan.dashboard.pages;
			const controls = pages.flatMap((page) => page.items).filter((item) => item.kind === "control").length;
			const review = [...actionableFullIssues(plan), ...sourceIssues];
			return [
				createTransferStats([
					{ value: pages.length, label: t("aaalice.workspace.transfer.pages", "Pages"), tone: "primary" },
					{ value: controls, label: t("aaalice.workspace.transfer.controls", "Controls"), tone: "success" },
					{ value: review.length, label: t("aaalice.workspace.transfer.needsReview", "Needs review"), tone: review.length ? "warning" : "neutral" },
				]),
				el("div", { className: `aa-transfer-callout ${review.length ? "is-warning" : "is-success"}`, children: [icon(review.length ? "statusWarning" : "statusCheck"), el("p", null, review.length ? t("aaalice.workspace.transfer.fullPresetReviewHint", "A new full preset will still be created. Review the skipped values and bindings that need repair.") : t("aaalice.workspace.transfer.fullPresetReadyHint", "A new preset will be created with this layout, its bindings and compatible values."))] }),
				...(review.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.needsReview", "Needs review"), count: review.length, tone: "warning", children: [el("div", { className: "aa-transfer-entry-list", children: dashboardPresetTransferRows(review) })] })] : []),
			];
		};
		const renderValuePreview = (plan, targetPreset) => {
			if (!targetPreset) return [el("div", { className: "aa-transfer-callout is-warning", children: [icon("statusWarning"), el("p", null, t("aaalice.workspace.transfer.noTargetPreset", "Create a sidebar preset before importing values only."))] })];
			const review = [...sourceIssues, ...plan.entries.filter((entry) => !["ready", "preserved", "unused"].includes(entry.status))];
			const skipped = review.length + plan.entries.filter((entry) => entry.status === "unused").length;
			return [
				createTransferStats([
					{ value: plan.summary.overwritten, label: t("aaalice.workspace.transfer.valuesReady", "Values ready"), tone: "success" },
					{ value: plan.summary.recovered, label: t("aaalice.workspace.transfer.recoveredMatches", "Recovered"), tone: plan.summary.recovered ? "info" : "neutral" },
					{ value: skipped, label: t("aaalice.workspace.transfer.valuesSkipped", "Skipped"), tone: skipped ? "warning" : "neutral" },
				]),
				el("div", { className: "aa-transfer-callout is-success", children: [icon("copy"), el("p", null, t("aaalice.workspace.transfer.valueCopyHint", "“{name}” will be copied into a new preset, then the matched values will be applied to that copy. The selected preset will not change.").replace("{name}", targetPreset.name))] }),
				...(review.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.valueNeedsReview", "Skipped values"), count: review.length, tone: "warning", children: [el("div", { className: "aa-transfer-entry-list", children: dashboardPresetTransferRows(review) })] })] : []),
			];
		};

		function renderImportPreview() {
			const state = dashboardPresetState();
			let targetPreset = state.presets.find((preset) => preset.id === targetId) || null;
			if (!targetPreset && state.presets.length) { targetId = state.baselinePresetId || state.presets[0].id; targetPreset = state.presets.find((preset) => preset.id === targetId) || null; }
			const hasPresets = state.presets.length > 0;
			if (!hasPresets && mode === "values") { mode = "new"; modeControl.setValue(mode, false); }
			modeControl.setOptionDisabled?.("values", !hasPresets);
			targetSelect.setOptions(hasPresets ? state.presets.map((preset) => ({ value: preset.id, label: preset.name })) : [{ value: "", label: t("aaalice.workspace.transfer.noTargetPreset", "No saved presets"), disabled: true }], targetId);
			if (!presetNameEdited) presetName.value = suggestedName(state, targetPreset);
			let fullPlan = null; let valuePlan = null;
			if (mode === "values" && targetPreset) valuePlan = planDashboardPresetValueOverwrite(snapshot, targetPreset, (binding) => resolve(binding));
			else if (mode === "new") fullPlan = planDashboardPresetApplication(snapshot, (binding) => resolve(binding));
			targetField.hidden = mode !== "values";
			modeControl.setDisabled?.(actionBusy); targetSelect.setDisabled(actionBusy || mode !== "values" || !hasPresets); presetName.disabled = actionBusy;
			preview.replaceChildren(...(mode === "values" ? renderValuePreview(valuePlan, targetPreset) : renderFullPreview(fullPlan)));
			const validName = Boolean(presetName.value.trim());
			const canApply = validName && (mode === "new" || Boolean(targetPreset && valuePlan?.ready.length));
			primary.disabled = !canApply;
			const footerNote = mode === "values" && valuePlan
				? t("aaalice.workspace.transfer.valuesReadySummary", "{count} values ready · {recovered} recovered").replace("{count}", String(valuePlan.summary.overwritten)).replace("{recovered}", String(valuePlan.summary.recovered))
				: t("aaalice.workspace.transfer.newPresetWillBeCreated", "A new preset will be created");
			setDialogFooter(footer, el("span", "aa-transfer-footer-note", footerNote), button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), primary);
		}

		primary = button({ label: t("aaalice.workspace.transfer.importPreset", "Import preset"), onClick: async () => {
			importError.hidden = true;
			const actionLabel = t("aaalice.workspace.transfer.importPreset", "Import preset");
			setActionBusy(primary, true, actionLabel, t("aaalice.workspace.transfer.importing", "Importing…")); setImportControlsBusy(true);
			try {
				const graph = app.graph;
				if (mode === "new") {
					const latestPlan = planDashboardPresetApplication(snapshot, (binding) => resolve(binding));
					const currentState = dashboardPresetState(); const brokenBindings = layoutBreakingPresetIssues(latestPlan);
					if (brokenBindings.length) {
						const currentTarget = currentState.presets.find((preset) => preset.id === targetId) || null;
						const canUseValues = Boolean(currentTarget && planDashboardPresetValueOverwrite(snapshot, currentTarget, (binding) => resolve(binding)).ready.length);
						const decision = await confirmUnsafeDashboardLayoutImport(brokenBindings.length, canUseValues);
						if (decision !== "layout") {
							setImportControlsBusy(false); setActionBusy(primary, false, actionLabel, "");
							if (decision === "values") useValueOnly(); else renderImportPreview();
							return;
						}
					}
					const modelIssues = latestPlan.issues.filter((entry) => entry.applySaved === true);
					if (modelIssues.length && !await confirmPartialDashboardPreset({ ...latestPlan, issues: modelIssues }, { name: presetName.value.trim() || defaultPresetName })) {
						setImportControlsBusy(false); setActionBusy(primary, false, actionLabel, ""); renderImportPreview(); return;
					}
					const importedPresetName = availableDashboardPresetName(presetName.value, currentState);
					const previousPresetExtra = structuredClone(graph?.extra?.[runtime.presetsExtraKey]); const previousActivePageId = runtime.getActivePageId();
					const nextPresetState = createDashboardPreset(currentState, importedPresetName, snapshot); const nextActivePageId = latestPlan.dashboard.pages[0]?.id || null;
					graph?.beforeChange?.();
					try {
						graph.extra ||= {};
						applyDashboardSnapshotPlan(latestPlan, {
							readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); },
							commit: () => { graph.extra[runtime.presetsExtraKey] = nextPresetState; runtime.setActivePageId(nextActivePageId); },
							rollbackCommit: () => { restoreGraphExtra(graph, runtime.presetsExtraKey, previousPresetExtra); runtime.setActivePageId(previousActivePageId); },
						});
					} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender(); }
					const resultHint = (actionableFullIssues(latestPlan).length + sourceIssues.length ? t("aaalice.workspace.transfer.presetImportPartialHint", "Preset “{name}” was created and applied. Unresolved cards were kept and invalid values were skipped.") : t("aaalice.workspace.transfer.presetImportCompleteHint", "Preset “{name}” was created and applied with its layout, bindings and compatible values.")).replace("{name}", importedPresetName);
					body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.presetImportComplete", "Preset imported"), description: resultHint, count: latestPlan.ready.length, countLabel: t("aaalice.workspace.transfer.controlsMatched", "controls matched") }));
				} else {
					const state = dashboardPresetState();
					const targetPreset = state.presets.find((preset) => preset.id === targetId);
					if (!targetPreset) throw new Error(t("aaalice.workspace.transfer.noTargetPreset", "Create a sidebar preset before importing values only."));
					const latestValues = planDashboardPresetValueOverwrite(snapshot, targetPreset, (binding) => resolve(binding));
					if (!latestValues.ready.length) throw new Error(t("aaalice.workspace.transfer.noValuesMatched", "No compatible values matched the selected base preset."));
					const applicationPlan = planDashboardPresetApplication(latestValues.merged, (binding) => resolve(binding));
					const applicationIssues = applicationPlan.issues.filter((entry) => !["unset", "unused", "layout-only"].includes(entry.status));
					if (applicationIssues.length && !await confirmPartialDashboardPreset({ ...applicationPlan, issues: applicationIssues }, targetPreset)) { setImportControlsBusy(false); setActionBusy(primary, false, actionLabel, ""); renderImportPreview(); return; }
					const importedPresetName = availableDashboardPresetName(presetName.value, state);
					const previousPresetExtra = structuredClone(graph?.extra?.[runtime.presetsExtraKey]); const previousActivePageId = runtime.getActivePageId();
					const nextState = createDashboardPreset(state, importedPresetName, latestValues.merged);
					const nextActivePageId = applicationPlan.dashboard.pages.some((page) => page.id === previousActivePageId) ? previousActivePageId : applicationPlan.dashboard.pages[0]?.id || null;
					graph?.beforeChange?.();
					try {
						graph.extra ||= {};
						applyDashboardSnapshotPlan(applicationPlan, {
							readDashboard: () => dashboard(), writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); },
							commit: () => { graph.extra[runtime.presetsExtraKey] = nextState; runtime.setActivePageId(nextActivePageId); },
							rollbackCommit: () => { restoreGraphExtra(graph, runtime.presetsExtraKey, previousPresetExtra); runtime.setActivePageId(previousActivePageId); },
						});
					} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender(); }
					const skipped = sourceIssues.length + latestValues.summary.needsReview + latestValues.summary.unmatched + applicationIssues.length;
					const resultHint = t("aaalice.workspace.transfer.valueImportCompleteHint", "Preset “{name}” was created from “{source}” and applied. The source preset was not changed; {count} compatible values were imported.{skippedHint}").replace("{name}", importedPresetName).replace("{source}", targetPreset.name).replace("{count}", String(latestValues.summary.overwritten)).replace("{skippedHint}", skipped ? ` ${skipped} ${t("aaalice.workspace.transfer.valuesSkipped", "source values were skipped")}.` : "");
					body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.valuesImported", "Preset imported"), description: resultHint, count: latestValues.summary.overwritten, countLabel: t("aaalice.workspace.transfer.valuesOverwritten", "values imported") }));
				}
				setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
			} catch (error) {
				importError.textContent = String(error?.message || error); importError.hidden = false;
				setImportControlsBusy(false); setActionBusy(primary, false, actionLabel, ""); renderImportPreview();
			}
		} });
		body.replaceChildren(createDashboardPresetTransferSource({ iconName: "download", title: file.name, meta: sourceMeta }), form, preview, importError);
		renderImportPreview();
	} catch (error) {
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.invalidPreset", "Could not read this preset"), description: error.message, tone: "error" }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Close"), onClick: () => dialog.close() }));
	}
}

const renderedWorkspaceTabs = new WeakSet();
const workspaceWidthObservers = new Map();
