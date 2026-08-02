/** Runtime bridge between sidebar preset snapshots and live control providers. */

import { bindingKey, controlItemBindings } from "./dashboard_model.js";
import { normalizeDashboardSnapshot } from "./dashboard_presets.js";

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

function writePresetEntry(entry, value) {
	const result = entry.resolved.applyPresetValue
		? entry.resolved.applyPresetValue(value, { transaction: false, workspaceRedraw: false })
		: entry.resolved.setValue(value.payload, { transaction: false, workspaceRedraw: false });
	successful(result, "write", entry.key);
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
		const captureStatus = status === "ok" && typeof payload === "undefined" ? "unset" : status;
		captured.push({ key, binding, status: captureStatus });
		if (status !== "ok") continue;
		if (typeof payload === "undefined") continue;
		values[key] = { valueType: binding.valueType, payload };
	}
	return { values, bindings: captured };
}

export function mergeCapturedPresetValues(snapshot, previousValues = {}) {
	const values = structuredClone(snapshot?.values || {});
	for (const binding of snapshot?.bindings || []) {
		if (binding.status === "ok" || binding.status === "layout-only" || !Object.prototype.hasOwnProperty.call(previousValues, binding.key)) continue;
		values[binding.key] = structuredClone(previousValues[binding.key]);
	}
	return values;
}

export function planDashboardPresetApplication(snapshot, resolveBinding) {
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
		if (availability) { entries.push({ key, binding, saved, resolved, status: availability }); continue; }
		if (!saved) { entries.push({ key, binding, resolved, status: "unset" }); continue; }
		if (saved.valueType !== binding.valueType) { entries.push({ key, binding, saved, resolved, status: "incompatible" }); continue; }
		let validation;
		try { validation = synchronous(resolved.validatePresetValue?.(saved), "validation", key); }
		catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
		if (validation === false || validation?.ok === false || typeof validation === "string") { entries.push({ key, binding, saved, resolved, status: "invalid", reason: typeof validation === "string" ? validation : "invalid-value" }); continue; }
		let previousPayload;
		try { previousPayload = readCurrentPayload(resolved, key); }
		catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
		entries.push({ key, binding, saved, resolved, previous: { valueType: binding.valueType, payload: previousPayload }, status: "ready" });
	}
	for (const [key, saved] of Object.entries(normalized.values)) if (!dashboardBindings.has(key)) entries.push({ key, saved, status: "unused" });
	return {
		dashboard: normalized.dashboard,
		entries,
		ready: entries.filter((entry) => entry.status === "ready"),
		issues: entries.filter((entry) => !["ready", "layout-only"].includes(entry.status)),
	};
}

export function applyDashboardSnapshotPlan(plan, { readDashboard, writeDashboard }) {
	const previousDashboard = structuredClone(readDashboard());
	try {
		writeDashboard(structuredClone(plan.dashboard));
		return applyDashboardPresetPlan(plan);
	} catch (error) {
		try { writeDashboard(previousDashboard); }
		catch (rollbackError) { throw new AggregateError([error, rollbackError], "Sidebar preset application and layout rollback failed"); }
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
		const rollbackErrors = [];
		for (const entry of applied.reverse()) {
			try {
				writePresetEntry(entry, entry.previous);
			} catch (rollbackError) { rollbackErrors.push(rollbackError); }
		}
		if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Parameter preset application and rollback failed");
		throw error;
	}
	for (const node of touchedNodes) node.setDirtyCanvas?.(true, true);
	return { applied: plan.ready.length, skipped: plan.issues.length };
}
