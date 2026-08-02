/** Card-level coordination for one primary control and explicit linked write targets. */

import { controlItemBindings, bindingKey, bindingTargetKey } from "./dashboard_model.js";
import { resolvedControlSpec } from "./controls/specs.js";

const LINKABLE_KINDS = new Set(["numeric", "seed", "boolean", "choice", "text", "taglist", "image", "image-choice"]);

export class ControlBindingSetError extends Error {
	constructor(message, code = "binding-set-error", binding = null, cause = null) {
		super(message, cause ? { cause } : undefined);
		this.name = "ControlBindingSetError";
		this.code = code;
		this.binding = binding;
	}
}

function clone(value) { return typeof value === "undefined" ? undefined : structuredClone(value); }

function synchronousValue(result, operation, binding) {
	if (result && typeof result.then === "function") throw new ControlBindingSetError(`Linked control ${operation} must be synchronous`, "async-linked-control", binding);
	return result;
}

function successfulResult(result, operation, binding) {
	synchronousValue(result, operation, binding);
	if (result === false || result?.ok === false) throw new ControlBindingSetError(result?.message || `Linked control ${operation} failed`, "linked-write-failed", binding);
	return result;
}

function availabilityState(resolved) {
	const state = resolved?.availability?.state;
	return state && state !== "ready" ? state : null;
}

function optionValues(options = {}) {
	const source = Array.isArray(options.values) ? options.values : Array.isArray(options.options) ? options.options : [];
	return source.map((value) => String(typeof value === "object" ? value.value ?? value.label : value)).sort();
}

function finiteOption(options, name) {
	const value = Number(options?.[name]);
	return Number.isFinite(value) ? value : null;
}

function linkSignature(binding, resolved, { includeDynamicOptions = true } = {}) {
	if (resolved?.status !== "ok") return null;
	const spec = resolvedControlSpec(resolved);
	const base = { valueType: binding.valueType, kind: spec.kind };
	if (["numeric", "seed"].includes(spec.kind)) return {
		...base,
		numericDomain: resolved.numericDomain || null,
		min: finiteOption(spec.options, "min"),
		max: finiteOption(spec.options, "max"),
		step: finiteOption(spec.options, "step"),
		...(spec.kind === "seed" ? { behaviors: optionValues({ values: resolved.seedBehaviors || [] }) } : {}),
	};
	if (spec.kind === "image-choice") return {
		...base,
		imageFolder: String(spec.options.image_folder || "input"),
		uploadSubfolder: String(spec.options.upload_subfolder || ""),
	};
	if (spec.kind === "choice") return { ...base, ...(includeDynamicOptions ? { values: optionValues(spec.options) } : {}) };
	if (spec.kind === "text") return { ...base, multiline: Boolean(spec.options.multiline) };
	return base;
}

function equalValue(left, right) {
	if (Object.is(left, right)) return true;
	if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
	const leftKeys = Object.keys(left); const rightKeys = Object.keys(right);
	return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && equalValue(left[key], right[key]));
}

function equalSignature(left, right) {
	return equalValue(left, right);
}

export function inspectControlLinkCompatibility(primary, candidate) {
	if (!primary?.binding || !candidate?.binding) return { ok: false, reason: "missing-binding" };
	if (bindingTargetKey(primary.binding) === bindingTargetKey(candidate.binding)) return { ok: false, reason: "duplicate-binding" };
	if (primary.resolved?.status !== "ok" || candidate.resolved?.status !== "ok") return { ok: false, reason: "unresolved-binding" };
	const primarySpec = resolvedControlSpec(primary.resolved); const candidateSpec = resolvedControlSpec(candidate.resolved);
	if (!LINKABLE_KINDS.has(primarySpec.kind) || !LINKABLE_KINDS.has(candidateSpec.kind) || primary.resolved.linkable !== true || candidate.resolved.linkable !== true) return { ok: false, reason: "unsupported-control" };
	if (primary.resolved.presettable === false || candidate.resolved.presettable === false) return { ok: false, reason: "unsupported-codec" };
	if (primarySpec.kind === "numeric" && !["integer", "float"].includes(primary.resolved.numericDomain)) return { ok: false, reason: "unsupported-numeric-domain" };
	if (candidateSpec.kind === "numeric" && !["integer", "float"].includes(candidate.resolved.numericDomain)) return { ok: false, reason: "unsupported-numeric-domain" };
	if (typeof primary.resolved.readPresetValue !== "function" || typeof primary.resolved.applyPresetValue !== "function" || typeof candidate.resolved.readPresetValue !== "function" || typeof candidate.resolved.applyPresetValue !== "function") return { ok: false, reason: "unsupported-codec" };
	if (primarySpec.kind === "seed" && (primary.resolved.hasCustomPresetCodec === false || candidate.resolved.hasCustomPresetCodec === false || primary.resolved.supportsSeedBehavior !== true || candidate.resolved.supportsSeedBehavior !== true || !primary.resolved.seedBehaviors?.length || !candidate.resolved.seedBehaviors?.length || typeof primary.resolved.setSeedBehavior !== "function" || typeof candidate.resolved.setSeedBehavior !== "function")) return { ok: false, reason: "unsupported-seed" };
	const primaryGraph = primary.resolved.node?.graph; const candidateGraph = candidate.resolved.node?.graph;
	if (!primaryGraph || !candidateGraph || primaryGraph !== candidateGraph) return { ok: false, reason: "different-graph" };
	if (primary.resolved.node === candidate.resolved.node && (primary.resolved.control === candidate.resolved.control || primary.resolved.controlId === candidate.resolved.controlId)) return { ok: false, reason: "duplicate-binding" };
	const includeDynamicOptions = !availabilityState(primary.resolved) && !availabilityState(candidate.resolved);
	const primarySignature = linkSignature(primary.binding, primary.resolved, { includeDynamicOptions }); const candidateSignature = linkSignature(candidate.binding, candidate.resolved, { includeDynamicOptions });
	return equalSignature(primarySignature, candidateSignature)
		? { ok: true, signature: primarySignature }
		: { ok: false, reason: "incompatible-contract", primary: primarySignature, candidate: candidateSignature };
}

function readEntry(entry) {
	const payload = entry.resolved.readPresetValue ? entry.resolved.readPresetValue() : entry.resolved.value;
	synchronousValue(payload, "read", entry.binding);
	return { valueType: entry.binding.valueType, payload: clone(payload) };
}

function validateEntry(entry, presetEntry, { live = false } = {}) {
	if (presetEntry.valueType !== entry.binding.valueType) throw new ControlBindingSetError("Linked control value type changed", "incompatible-value", entry.binding);
	let validation = true;
	if (live && typeof entry.resolved.validateLinkedValue === "function") validation = synchronousValue(entry.resolved.validateLinkedValue(clone(presetEntry.payload)), "validation", entry.binding);
	else if (typeof entry.resolved.validatePresetValue === "function") validation = synchronousValue(entry.resolved.validatePresetValue(clone(presetEntry)), "validation", entry.binding);
	if (validation === false || validation?.ok === false || typeof validation === "string") throw new ControlBindingSetError(typeof validation === "string" ? validation : validation?.message || "Linked control rejected the value", "invalid-linked-value", entry.binding);
}

function graphFor(entries) {
	const graphs = new Set(entries.map((entry) => entry.resolved.node?.graph).filter(Boolean));
	if (graphs.size !== 1 || entries.some((entry) => entry.resolved.node?.graph !== [...graphs][0])) throw new ControlBindingSetError("Linked controls must belong to the same graph", "different-graph");
	return [...graphs][0];
}

function rollbackEntries(applied) {
	const errors = [];
	for (const entry of [...applied].reverse()) {
		try {
			const result = entry.resolved.applyPresetValue(clone(entry.previous), { transaction: false, workspaceRedraw: false });
			successfulResult(result, "rollback", entry.binding);
		} catch (error) { errors.push(error); }
	}
	return errors;
}

function runAtomic(entries, writer, { transaction = true } = {}) {
	const graph = graphFor(entries);
	const prepared = entries.map((entry) => ({ ...entry, previous: readEntry(entry) }));
	const applied = [];
	if (transaction) graph.beforeChange?.();
	try {
		for (const entry of prepared) {
			applied.push(entry);
			successfulResult(writer(entry), "write", entry.binding);
		}
	} catch (error) {
		const rollbackErrors = rollbackEntries(applied);
		if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Linked control update and rollback failed");
		throw error;
	} finally {
		if (transaction) graph.afterChange?.();
		graph.setDirtyCanvas?.(true, true);
	}
}

function writeValue(entries, next, options = {}) {
	const presetEntries = entries.map((entry) => ({ entry, value: { valueType: entry.binding.valueType, payload: clone(next) } }));
	for (const { entry, value } of presetEntries) validateEntry(entry, value, { live: true });
	runAtomic(entries, (entry) => entry.resolved.setValue(clone(next), {
		transaction: false,
		transient: options.transient === true,
		workspaceRedraw: false,
	}), options);
}

function writePreset(entries, presetEntry, options = {}) {
	for (const entry of entries) validateEntry(entry, presetEntry);
	runAtomic(entries, (entry) => entry.resolved.applyPresetValue(clone(presetEntry), { transaction: false, workspaceRedraw: false }), options);
}

function synchronizePreset(entries, presetEntry, options = {}) {
	const changed = entries.filter((entry) => !equalValue(readEntry(entry), presetEntry));
	if (!changed.length) return false;
	writePreset(changed, presetEntry, options);
	return true;
}

function writeSeedBehavior(entries, behavior, options = {}) {
	runAtomic(entries, (entry) => entry.resolved.setSeedBehavior(behavior, { transaction: false, workspaceRedraw: false }), options);
}

export function resolveControlBindingSet(item, resolveBinding) {
	const bindings = controlItemBindings(item);
	const entries = bindings.map((binding) => {
		try { return { binding, key: bindingKey(binding), resolved: resolveBinding(binding) }; }
		catch (error) { return { binding, key: bindingKey(binding), resolved: { status: "error", error } }; }
	});
	const primary = entries[0];
	if (!primary) return { status: "missing", bindingSet: { entries: [], linkedCount: 0, mixed: false, issues: [] } };
	const issues = [];
	if (primary.resolved?.status !== "ok") issues.push({ binding: primary.binding, key: primary.key, status: primary.resolved?.status || "missing", reason: "unresolved-binding", error: primary.resolved?.error });
	else {
		for (const entry of entries.slice(1)) {
			const compatibility = inspectControlLinkCompatibility(primary, entry);
			if (!compatibility.ok) issues.push({ binding: entry.binding, key: entry.key, status: entry.resolved?.status || "incompatible", reason: compatibility.reason, error: entry.resolved?.error });
		}
	}
	let mixed = false;
	if (primary.resolved?.status === "ok" && !issues.length && entries.length > 1 && !entries.some((entry) => availabilityState(entry.resolved))) {
		try {
			const values = entries.map((entry) => readEntry(entry).payload);
			mixed = values.slice(1).some((value) => !equalValue(values[0], value));
		} catch (error) { issues.push({ binding: primary.binding, key: primary.key, status: "error", reason: error.message, error }); }
	}
	const bindingSet = { entries, linkedCount: Math.max(0, entries.length - 1), mixed, issues };
	if (primary.resolved?.status !== "ok" || entries.length === 1) return { ...primary.resolved, bindingSet };
	if (issues.length) return { ...primary.resolved, status: "linked-error", bindingSet };
	const unavailableEntry = entries.find((entry) => availabilityState(entry.resolved));
	const assertAvailable = () => {
		if (unavailableEntry) throw new ControlBindingSetError("Linked controls are temporarily unavailable", "unavailable-binding", unavailableEntry.binding);
	};
	return {
		...primary.resolved,
		availability: unavailableEntry?.resolved.availability || primary.resolved.availability,
		bindingSet,
		setValue(next, options = {}) { assertAvailable(); return writeValue(entries, next, options); },
		flushValue() { assertAvailable(); for (const entry of entries) successfulResult(entry.resolved.flushValue?.(), "flush", entry.binding); },
		setSeedBehavior(behavior, options = {}) { assertAvailable(); return writeSeedBehavior(entries, behavior, options); },
		synchronizeFromPrimary(options = {}) { assertAvailable(); return synchronizePreset(entries.slice(1), readEntry(primary), options); },
	};
}

export function synchronizeLinkedBindingSets(dashboard, resolveBinding, { kind = null, transaction = false } = {}) {
	const synchronized = []; const issues = []; const seen = new Set();
	for (const page of dashboard?.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control") continue;
		const bindings = controlItemBindings(item); if (bindings.length < 2) continue;
		const signature = JSON.stringify(bindings.map(bindingKey).sort()); if (seen.has(signature)) continue; seen.add(signature);
		let primaryResolved = null;
		if (kind) {
			try { primaryResolved = resolveBinding(bindings[0]); }
			catch (error) { issues.push({ itemId: item.id, binding: bindings[0], status: "error", error }); continue; }
			if (primaryResolved?.status !== "ok") { issues.push({ itemId: item.id, binding: bindings[0], status: primaryResolved?.status || "missing", error: primaryResolved?.error || null }); continue; }
			if (resolvedControlSpec(primaryResolved).kind !== kind) continue;
		}
		const resolved = resolveControlBindingSet(item, (binding) => primaryResolved && bindingKey(binding) === bindingKey(bindings[0]) ? primaryResolved : resolveBinding(binding));
		if (resolved.status !== "ok") { issues.push({ itemId: item.id, binding: bindings[0], status: resolved.status, error: resolved.bindingSet?.issues?.[0]?.error || null }); continue; }
		if (availabilityState(resolved)) { issues.push({ itemId: item.id, binding: bindings[0], status: resolved.availability.state, error: null }); continue; }
		try { if (resolved.synchronizeFromPrimary({ transaction })) synchronized.push(item.id); }
		catch (error) { issues.push({ itemId: item.id, status: "error", error }); }
	}
	return { synchronized, issues };
}
