/** Runtime bridge between sidebar preset snapshots and live control providers. */

import { bindingControlIdLabel, isModelResourceBinding } from "./dashboard_binding_identity.js";
import { bindingKey, controlItemBindings } from "./dashboard_model.js";
import { normalizeDashboardPresetValues, normalizeDashboardSnapshot } from "./dashboard_presets.js";

export class DashboardPresetRuntimeError extends Error {
	constructor(message, code, key, cause = null) {
		super(message, cause ? { cause } : undefined);
		this.name = "DashboardPresetRuntimeError"; this.code = code; this.key = key;
	}
}

function synchronous(value, operation, key) {
	if (value && typeof value.then === "function") throw new DashboardPresetRuntimeError(`Preset ${operation} must be synchronous: ${key}`, "async-preset-codec", key);
	return value;
}

function successful(value, operation, key) {
	synchronous(value, operation, key);
	if (value === false || value?.ok === false) throw new DashboardPresetRuntimeError(value?.message || `Preset ${operation} was rejected: ${key}`, "rejected-preset-codec", key);
	return value;
}

function runtimeAvailability(resolved) {
	const state = resolved?.availability?.state;
	return state && state !== "ready" ? state : null;
}

function readCurrentPayload(resolved, key) {
	const value = synchronous(resolved.readPresetValue ? resolved.readPresetValue() : resolved.value, "read", key);
	return typeof value === "undefined" ? undefined : structuredClone(value);
}

function validationReason(validation) {
	if (validation === false || validation?.ok === false) return "invalid-value";
	return typeof validation === "string" ? validation : null;
}

const DAMAGED_PRESET_REASONS = new Set(["type-mismatch", "invalid-number", "invalid-integer", "invalid-boolean", "invalid-string", "invalid-list", "invalid-reference", "invalid-seed-behavior"]);

function currentPresetRepairEntry(binding, resolved, key) {
	const payload = typeof resolved.readPresetRepairValue === "function"
		? structuredClone(resolved.readPresetRepairValue())
		: readCurrentPayload(resolved, key);
	if (typeof payload === "undefined") return null;
	const current = normalizeDashboardPresetValues({ [key]: { valueType: binding.valueType, payload } })[key];
	const validation = synchronous(resolved.validatePresetValue?.(current), "validation", key);
	return validationReason(validation) ? null : current;
}

function writePresetEntry(entry, value) {
	const result = entry.resolved.applyPresetValue
		? entry.resolved.applyPresetValue(value, { transaction: false, workspaceRedraw: false })
		: entry.resolved.setValue(value.payload, { transaction: false, workspaceRedraw: false });
	successful(result, "write", entry.key);
}

function choiceValue(choice) {
	if (choice && typeof choice === "object") return String(choice.value ?? choice.label ?? "");
	return String(choice ?? "");
}

function normalizedModelPath(value) {
	return String(value || "").normalize("NFKC").trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function modelFileName(value) {
	return normalizedModelPath(value).split("/").pop() || "";
}

function modelOptionValues(resolved) {
	const optionSource = resolved?.options?.values ?? resolved?.options?.options;
	return Array.isArray(optionSource) ? optionSource.map(choiceValue).filter(Boolean) : [];
}

function modelOptionMatches(savedValue, options) {
	const expectedPath = normalizedModelPath(savedValue); const expectedFile = modelFileName(savedValue);
	const exact = [...new Set(options.filter((value) => normalizedModelPath(value) === expectedPath))];
	return exact.length ? exact : [...new Set(options.filter((value) => modelFileName(value) === expectedFile))];
}

export function resolveDashboardPresetModelValue(binding, saved, resolved, validation) {
	if (validation !== "missing-option" || saved?.valueType !== "string" || typeof saved.payload !== "string"
		|| !isModelResourceBinding(binding, saved.payload, resolved?.label)) return null;
	const matches = modelOptionMatches(saved.payload, modelOptionValues(resolved));
	if (matches.length === 1) return {
		status: "model-path-match", reason: "model-path-match", applySaved: true,
		value: { ...structuredClone(saved), payload: matches[0] }, presetValue: structuredClone(saved), detectedModelPath: matches[0], candidates: matches,
	};
	return {
		status: matches.length ? "ambiguous-model" : "missing-model",
		reason: matches.length ? "ambiguous-model-option" : "missing-model-option",
		applySaved: true, value: structuredClone(saved), presetValue: structuredClone(saved), candidates: matches,
	};
}

function applicablePresetEntries(entries) {
	return entries.filter((entry) => entry.status === "ready" || entry.applySaved === true);
}

function uniqueBindings(dashboard) {
	const bindings = new Map(); const conflicts = new Map();
	for (const page of dashboard.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control") continue;
		for (const binding of controlItemBindings(item)) {
			const key = bindingKey(binding); const previous = bindings.get(key);
			if (!previous) { bindings.set(key, binding); continue; }
			if (previous.valueType !== binding.valueType) conflicts.set(key, [previous, binding]);
		}
	}
	return { bindings, conflicts };
}

export function dashboardPresetIssueLocations(dashboard, issue) {
	const issueKey = issue?.binding ? bindingKey(issue.binding) : String(issue?.key || "");
	if (!issueKey) return [];
	const locations = [];
	for (const page of dashboard?.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control") continue;
		const bindings = controlItemBindings(item); const bindingIndex = bindings.findIndex((binding) => bindingKey(binding) === issueKey);
		if (bindingIndex < 0) continue;
		const group = (page.groups || []).find((candidate) => candidate.id === item.groupId) || null;
		const parameterLabel = String(issue?.resolved?.label || bindingControlIdLabel(bindings[bindingIndex])).trim();
		const savedComponentLabel = String(item.labelOverride ?? item.label ?? "").trim();
		locations.push({
			pageName: String(page.name || "").trim(), groupName: String(group?.nameOverride ?? group?.name ?? "").trim(),
			componentLabel: savedComponentLabel || (bindingIndex === 0 ? parameterLabel : bindingControlIdLabel(item.binding)),
			parameterLabel, linked: bindingIndex > 0,
		});
	}
	return locations;
}


export function captureDashboardValues(dashboard, resolveBinding) {
	const values = {}; const captured = []; const { bindings: unique, conflicts } = uniqueBindings(dashboard);
	for (const [key, binding] of unique) {
		if (conflicts.has(key)) { captured.push({ key, binding, status: "error", reason: "conflicting-value-type", conflicts: conflicts.get(key) }); continue; }
		let resolved;
		try { resolved = resolveBinding(binding); }
		catch (error) { captured.push({ key, binding, status: "error", error }); continue; }
		const status = resolved?.status || "missing";
		if (status === "ok" && resolved.presettable === false) { captured.push({ key, binding, status: "layout-only" }); continue; }
		const availability = status === "ok" ? runtimeAvailability(resolved) : null;
		if (availability) { captured.push({ key, binding, status: availability, resolved }); continue; }
		let payload;
		try { payload = status === "ok" ? readCurrentPayload(resolved, key) : undefined; }
		catch (error) { captured.push({ key, binding, status: "error", error }); continue; }
		if (status !== "ok") { captured.push({ key, binding, status }); continue; }
		if (typeof payload === "undefined") { captured.push({ key, binding, status: "unset" }); continue; }
		let current;
		try {
			current = normalizeDashboardPresetValues({ [key]: { valueType: binding.valueType, payload } })[key];
			const reason = validationReason(synchronous(resolved.validatePresetValue?.(current), "validation", key));
			if (reason) { captured.push({ key, binding, status: "invalid", reason, resolved }); continue; }
		}
		catch (error) { captured.push({ key, binding, status: "invalid", reason: error.message, error }); continue; }
		values[key] = current;
		captured.push({ key, binding, status: "ok", modelOptions: modelOptionValues(resolved) });
	}
	return { values, bindings: captured };
}

export function mergeCapturedPresetValues(snapshot, previousValues = {}) {
	const values = structuredClone(snapshot?.values || {});
	for (const binding of snapshot?.bindings || []) {
		if (!Object.prototype.hasOwnProperty.call(previousValues, binding.key)) continue;
		const previous = previousValues[binding.key]; const captured = values[binding.key];
		if (binding.status === "ok" && previous?.valueType === "string" && captured?.valueType === "string"
			&& isModelResourceBinding(binding.binding, previous.payload) && modelFileName(previous.payload) === modelFileName(captured.payload)
			&& modelOptionMatches(previous.payload, binding.modelOptions || []).length === 1) {
			values[binding.key] = structuredClone(previous);
			continue;
		}
		if (binding.status === "ok" || binding.status === "layout-only") continue;
		values[binding.key] = structuredClone(previous);
	}
	return values;
}


export function planDashboardPresetApplication(snapshot, resolveBinding, { repairDamaged = false } = {}) {
	const normalized = normalizeDashboardSnapshot(snapshot); const { bindings: dashboardBindings, conflicts } = uniqueBindings(normalized.dashboard); const entries = [];
	for (const [key, binding] of dashboardBindings) {
		const saved = normalized.values[key];
		if (conflicts.has(key)) { entries.push({ key, binding, saved, status: "invalid", reason: "conflicting-value-type", conflicts: conflicts.get(key) }); continue; }
		let resolved;
		try { resolved = resolveBinding(binding); }
		catch (error) { entries.push({ key, binding, saved, status: "invalid", reason: error.message, error }); continue; }
		if (resolved?.status !== "ok") { entries.push({ key, binding, saved, resolved, status: resolved?.status || "missing" }); continue; }
		if (resolved.presettable === false) { entries.push({ key, binding, saved, resolved, status: "layout-only" }); continue; }
		const availability = runtimeAvailability(resolved);
		if (availability) {
			const modelResolution = availability === "empty" ? resolveDashboardPresetModelValue(binding, saved, resolved, "missing-option") : null;
			if (!modelResolution) { entries.push({ key, binding, saved, resolved, status: availability }); continue; }
			let previousPayload;
			try { previousPayload = readCurrentPayload(resolved, key); }
			catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
			entries.push({ key, binding, saved: modelResolution.value, presetSaved: modelResolution.presetValue, resolved, previous: { valueType: binding.valueType, payload: previousPayload }, ...modelResolution });
			continue;
		}
		if (!saved) { entries.push({ key, binding, resolved, status: "unset" }); continue; }
		if (saved.valueType !== binding.valueType) { entries.push({ key, binding, saved, resolved, status: "incompatible" }); continue; }
		let validation;
		try { validation = synchronous(resolved.validatePresetValue?.(saved), "validation", key); }
		catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
		const reason = validationReason(validation);
		const modelResolution = reason ? resolveDashboardPresetModelValue(binding, saved, resolved, reason) : null;
		if (reason && !modelResolution) {
			let replacement = null; let previousPayload;
			if (repairDamaged && DAMAGED_PRESET_REASONS.has(reason)) {
				try { replacement = currentPresetRepairEntry(binding, resolved, key); previousPayload = replacement ? readCurrentPayload(resolved, key) : undefined; }
				catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
			}
			entries.push(replacement ? { key, binding, saved: replacement, presetSaved: saved, resolved, replacement, previous: { valueType: binding.valueType, payload: previousPayload }, status: "repaired", reason, applySaved: true } : { key, binding, saved, resolved, status: "invalid", reason });
			continue;
		}
		let previousPayload;
		try { previousPayload = readCurrentPayload(resolved, key); }
		catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
		const common = { key, binding, saved: modelResolution?.value || saved, resolved, previous: { valueType: binding.valueType, payload: previousPayload } };
		entries.push(modelResolution ? { ...common, presetSaved: modelResolution.presetValue, ...modelResolution, saved: modelResolution.value } : { ...common, status: "ready" });
	}
	for (const [key, saved] of Object.entries(normalized.values)) if (!dashboardBindings.has(key)) entries.push({ key, saved, status: "unused" });
	const repairs = entries.filter((entry) => entry.status === "repaired");
	const repairedValues = structuredClone(normalized.values);
	for (const entry of repairs) repairedValues[entry.key] = structuredClone(entry.replacement);
	return {
		dashboard: normalized.dashboard,
		repairedSnapshot: { dashboard: normalized.dashboard, values: repairedValues },
		entries,
		ready: applicablePresetEntries(entries),
		repairs,
		issues: entries.filter((entry) => !["ready", "repaired", "layout-only"].includes(entry.status)),
	};
}

function rollbackPresetEntries(entries) {
	const errors = [];
	for (const entry of [...entries].reverse()) {
		try { writePresetEntry(entry, entry.previous); }
		catch (error) { errors.push(error); }
	}
	return errors;
}

export function applyDashboardSnapshotPlan(plan, { readDashboard, writeDashboard, commit = null, rollbackCommit = null }) {
	const previousDashboard = structuredClone(readDashboard()); let valuesApplied = false; let commitStarted = false;
	try {
		writeDashboard(structuredClone(plan.dashboard));
		const result = applyDashboardPresetPlan(plan); valuesApplied = true;
		if (commit) { commitStarted = true; commit(); }
		return result;
	} catch (error) {
		const rollbackErrors = [];
		if (commitStarted && rollbackCommit) {
			try { rollbackCommit(); }
			catch (rollbackError) { rollbackErrors.push(rollbackError); }
		}
		if (valuesApplied) rollbackErrors.push(...rollbackPresetEntries(plan.ready));
		try { writeDashboard(previousDashboard); }
		catch (rollbackError) { rollbackErrors.push(rollbackError); }
		if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Sidebar preset application and rollback failed");
		throw error;
	}
}

export function applyDashboardPresetPlan(plan) {
	const touchedNodes = new Set(); const applied = [];
	try {
		for (const entry of plan.ready) {
			// Include the current entry before writing: a third-party codec may mutate
			// its state and then throw, and that partial write must also be rolled back.
			applied.push(entry);
			writePresetEntry(entry, entry.saved);
			if (entry.resolved.node) touchedNodes.add(entry.resolved.node);
		}
	} catch (error) {
		const rollbackErrors = rollbackPresetEntries(applied);
		if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Parameter preset application and rollback failed");
		throw error;
	}
	for (const node of touchedNodes) node.setDirtyCanvas?.(true, true);
	return { applied: plan.ready.length, skipped: plan.issues.filter((entry) => entry.applySaved !== true).length };
}
