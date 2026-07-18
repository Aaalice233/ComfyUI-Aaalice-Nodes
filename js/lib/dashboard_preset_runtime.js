/** Runtime bridge between workflow-owned value presets and live control providers. */

import { bindingKey } from "./dashboard_model.js";

function uniqueBindings(dashboard) {
	const result = new Map();
	for (const page of dashboard.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control") continue;
		const key = bindingKey(item.binding); if (!result.has(key)) result.set(key, item.binding);
	}
	return result;
}

export function captureDashboardValues(dashboard, resolveBinding) {
	const values = {}; const bindings = [];
	for (const [key, binding] of uniqueBindings(dashboard)) {
		let resolved;
		try { resolved = resolveBinding(binding); }
		catch (error) { bindings.push({ key, binding, status: "error", error }); continue; }
		const status = resolved?.status || "missing";
		let payload;
		try { payload = status === "ok" ? (resolved.readPresetValue ? resolved.readPresetValue() : structuredClone(resolved.value)) : undefined; }
		catch (error) { bindings.push({ key, binding, status: "error", error }); continue; }
		const captureStatus = status === "ok" && typeof payload === "undefined" ? "unset" : status;
		bindings.push({ key, binding, status: captureStatus });
		if (status !== "ok") continue;
		if (typeof payload === "undefined") continue;
		values[key] = { valueType: binding.valueType, payload };
	}
	return { values, bindings };
}

export function planDashboardPresetApplication(preset, dashboard, resolveBinding) {
	const dashboardBindings = uniqueBindings(dashboard); const entries = [];
	for (const [key, saved] of Object.entries(preset.values || {})) {
		const binding = dashboardBindings.get(key);
		if (!binding) { entries.push({ key, saved, status: "unused" }); continue; }
		let resolved;
		try { resolved = resolveBinding(binding); }
		catch (error) { entries.push({ key, binding, saved, status: "invalid", reason: error.message, error }); continue; }
		if (resolved?.status !== "ok") { entries.push({ key, binding, saved, resolved, status: resolved?.status || "missing" }); continue; }
		if (saved.valueType !== binding.valueType) { entries.push({ key, binding, saved, resolved, status: "incompatible" }); continue; }
		let validation;
		try { validation = resolved.validatePresetValue?.(saved); }
		catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
		if (validation === false || typeof validation === "string") { entries.push({ key, binding, saved, resolved, status: "invalid", reason: typeof validation === "string" ? validation : "invalid-value" }); continue; }
		let previousPayload;
		try { previousPayload = resolved.readPresetValue ? resolved.readPresetValue() : structuredClone(resolved.value); }
		catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
		entries.push({ key, binding, saved, resolved, previous: { valueType: binding.valueType, payload: previousPayload }, status: "ready" });
	}
	return {
		presetId: preset.id,
		entries,
		ready: entries.filter((entry) => entry.status === "ready"),
		issues: entries.filter((entry) => entry.status !== "ready"),
	};
}

export function applyDashboardPresetPlan(plan) {
	const touchedNodes = new Set(); const applied = [];
	try {
		for (const entry of plan.ready) {
			if (entry.resolved.applyPresetValue) entry.resolved.applyPresetValue(entry.saved, { transaction: false, workspaceRedraw: false });
			else entry.resolved.setValue(entry.saved.payload, { transaction: false, workspaceRedraw: false });
			applied.push(entry); if (entry.resolved.node) touchedNodes.add(entry.resolved.node);
		}
	} catch (error) {
		const rollbackErrors = [];
		for (const entry of applied.reverse()) {
			try {
				if (entry.resolved.applyPresetValue) entry.resolved.applyPresetValue(entry.previous, { transaction: false, workspaceRedraw: false });
				else entry.resolved.setValue(entry.previous.payload, { transaction: false, workspaceRedraw: false });
			} catch (rollbackError) { rollbackErrors.push(rollbackError); }
		}
		if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Parameter preset application and rollback failed");
		throw error;
	}
	for (const node of touchedNodes) node.setDirtyCanvas?.(true, true);
	return { applied: plan.ready.length, skipped: plan.issues.length };
}
