import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingControlIdLabel, isModelResourceBinding } from "../lib/dashboard_binding_identity.js";
import { emptyDashboard, normalizeDashboard } from "../lib/dashboard_model.js";
import { compareDashboardPreset, createDashboardPreset, dashboardPresetStateNeedsMigration, duplicateDashboardPreset, emptyDashboardPresetState, moveDashboardPreset, normalizeDashboardPresetState, removeDashboardPreset, renameDashboardPreset, replaceDashboardPreset, setDashboardPresetBaseline } from "../lib/dashboard_presets.js";
import { applyDashboardSnapshotPlan, captureDashboardValues, dashboardPresetIssueLocations, mergeCapturedPresetValues, planDashboardPresetApplication } from "../lib/dashboard_preset_runtime.js";
import { badge, button, createDialog, el, field, icon } from "../lib/ui.js";
import { confirmAction } from "./dom_utils.js";
import { planValueProfileCopy } from "../lib/value_profile_application.js";
import { openDuplicatePresetDialog } from "./dashboard_preset_duplicate.js";

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
		reorderHint: t("aaalice.workspace.dashboardPreset.reorderHint", "Drag to reorder; Alt+Arrow keys also work"), reorderItem: t("aaalice.workspace.dashboardPreset.reorderItem", "Reorder {name}, position {position} of {count}"), reordered: t("aaalice.workspace.dashboardPreset.reordered", "{name} moved to position {position} of {count}"),
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
	const graph = app.graph;
	const state = dashboardPresetState();
	const preset = state.presets.find((item) => item.id === presetId);
	if (!preset) return;
	const latestPreset = () => {
		if (app.graph !== graph) throw new Error(t("aaalice.workspace.valueProfiles.workflowChanged", "The workflow changed. Reopen this dialog."));
		const latest = dashboardPresetState().presets.find((item) => item.id === presetId);
		if (!latest) throw new Error(t("aaalice.workspace.valueProfiles.baseMissing", "The base preset is no longer available."));
		return latest;
	};
	openDuplicatePresetDialog({
		preset, presetState: state, openManageProfiles: runtime.openValueProfiles,
		planRules: (rules) => planValueProfileCopy(latestPreset(), rules, resolve, runtime.controlTitle),
		onCommitSuccess: async ({ mode, name, rules }) => {
			const base = latestPreset();
			if (mode === "standard") {
				const next = duplicateDashboardPreset(dashboardPresetState(), presetId, name);
				updateDashboardPresetState(() => next);
				notifyDashboardPresetSuccess(name, t("aaalice.workspace.dashboardPreset.duplicated", "Sidebar preset duplicated. Save the workflow to keep it."));
				return true;
			}
			const result = planValueProfileCopy(base, rules, resolve, runtime.controlTitle);
			if (!result.applied) return { applied: 0, skipped: result.skipped };
			const nextState = createDashboardPreset(dashboardPresetState(), name, result.snapshot);
			const previousPresetExtra = structuredClone(graph.extra?.[runtime.presetsExtraKey]);
			const previousActivePageId = runtime.getActivePageId();
			const nextActivePageId = result.snapshot.dashboard.pages.some((page) => page.id === previousActivePageId)
				? previousActivePageId : result.snapshot.dashboard.pages[0]?.id || null;
			graph.beforeChange?.();
			try {
				graph.extra ||= {};
				applyDashboardSnapshotPlan(result.application, {
					readDashboard: dashboard,
					writeDashboard: (next) => { graph.extra[runtime.dashboardExtraKey] = normalizeDashboard(next); },
					commit: () => { graph.extra[runtime.presetsExtraKey] = nextState; runtime.setActivePageId(nextActivePageId); },
					rollbackCommit: () => { restoreGraphExtra(graph, runtime.presetsExtraKey, previousPresetExtra); runtime.setActivePageId(previousActivePageId); },
				});
			} finally { graph.afterChange?.(); graph.setDirtyCanvas?.(true, true); scheduleStructuralRender("dashboard"); }
			app.extensionManager?.toast?.add?.({ severity: result.skipped ? "warn" : "success", summary: name,
				detail: t("aaalice.workspace.valueProfiles.copyResult", "Applied {applied} rules; skipped {skipped}. Save the workflow to keep the new preset.")
					.replace("{applied}", String(result.applied)).replace("{skipped}", String(result.skipped)), life: 5200 });
			return result;
		},
	});
}


export function reorderDashboardPreset(presetId, targetIndex) {
	try {
		updateDashboardPresetState((current) => moveDashboardPreset(current, presetId, targetIndex));
		return true;
	} catch (error) {
		notifyDashboardPresetError(error);
		return false;
	}
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
		plan = planDashboardPresetApplication(nextPreset, (binding) => resolve(binding), { repairDamaged: true });
		if (plan.issues.length && !await confirmPartialDashboardPreset(plan, nextPreset)) return;
		if (plan.repairs.length) nextState = replaceDashboardPreset(nextState, nextPreset.id, plan.repairedSnapshot);
	}
	const graph = app.graph; const previousPresetExtra = structuredClone(graph?.extra?.[runtime.presetsExtraKey]); const previousActivePageId = runtime.getActivePageId();
	const applicationPlan = plan || { dashboard: emptyDashboard(), ready: [], issues: [], repairs: [] };
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
	const plan = planDashboardPresetApplication(preset, (binding) => resolve(binding), { repairDamaged: true });
	if (plan.issues.length && !await confirmPartialDashboardPreset(plan, preset)) return;
	const graph = app.graph; const previousPresetExtra = structuredClone(graph?.extra?.[runtime.presetsExtraKey]); const previousActivePageId = runtime.getActivePageId();
	const repairedState = plan.repairs.length ? replaceDashboardPreset(state, presetId, plan.repairedSnapshot) : state;
	const nextPresetState = setDashboardPresetBaseline(repairedState, presetId); const nextActivePageId = preset.dashboard.pages.some((page) => page.id === previousActivePageId) ? previousActivePageId : preset.dashboard.pages[0]?.id || null;
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
	const detail = plan.repairs.length
		? t("aaalice.workspace.dashboardPreset.repairedReminder", "Sidebar preset applied. {count} damaged saved values were replaced with the current workflow values. Save the workflow to keep the repair.").replace("{count}", String(plan.repairs.length))
		: t("aaalice.workspace.dashboardPreset.appliedReminder", "Sidebar preset applied. Save the workflow to keep the layout and values.");
	notifyDashboardPresetSuccess(preset.name, detail);
}
