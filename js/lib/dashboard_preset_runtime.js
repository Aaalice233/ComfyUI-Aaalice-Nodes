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

function semanticText(value) { return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
function cardLabels(item) {
	return new Set([item.labelOverride, item.labelSource, item.label].map(semanticText).filter(Boolean));
}
function labelsOverlap(left, right) {
	for (const label of left.labels) if (right.labels.has(label)) return true;
	return false;
}
function sameCardContract(left, right) {
	return left.provider === right.provider && left.valueType === right.valueType && left.controlName === right.controlName;
}
function sameCardSemantic(left, right) {
	return sameCardContract(left, right) && labelsOverlap(left, right);
}

function valueCards(snapshot) {
	const owners = new Set(); const cards = [];
	for (const page of snapshot.dashboard.pages || []) {
		const groups = new Map((page.groups || []).map((group) => [group.id, semanticText(group.name)]));
		for (const item of page.items || []) {
			if (item.kind !== "control") continue;
			const bindings = controlItemBindings(item).map((binding) => ({ binding, key: bindingKey(binding) }));
			const owned = bindings.filter(({ key }) => !owners.has(key));
			if (!owned.length) continue;
			for (const { key } of owned) owners.add(key);
			const primary = bindings[0]?.binding;
			cards.push({
				item,
				bindings,
				ownedKeys: owned.map(({ key }) => key),
				labels: cardLabels(item),
				pageName: semanticText(page.name),
				groupName: groups.get(item.groupId) || "",
				provider: primary?.provider || "",
				hostId: primary?.hostId || "",
				valueType: primary?.valueType || "",
				controlName: semanticText(bindingControlIdLabel(primary)),
			});
		}
	}
	return cards;
}

// Each recovery tier must form a mutual one-to-one match; layout order never breaks ties.
function pairUniqueCards(sourceCards, targetCards, pairs, sourceUsed, predicate, kind) {
	const targetCandidates = new Map(); const sourceCandidates = new Map();
	for (const target of targetCards) {
		if (pairs.has(target)) continue;
		const candidates = sourceCards.filter((source) => !sourceUsed.has(source) && predicate(source, target));
		targetCandidates.set(target, candidates);
		for (const source of candidates) {
			const targets = sourceCandidates.get(source) || [];
			targets.push(target); sourceCandidates.set(source, targets);
		}
	}
	for (const [target, candidates] of targetCandidates) {
		if (candidates.length !== 1) continue;
		const source = candidates[0];
		if (sourceCandidates.get(source)?.length !== 1) continue;
		pairs.set(target, { source, kind }); sourceUsed.add(source);
	}
}

function matchValueCards(source, target) {
	const sourceCards = valueCards(source).filter((card) => card.bindings.some(({ key }) => Object.prototype.hasOwnProperty.call(source.values, key)));
	const targetCards = valueCards(target);
	const pairs = new Map(); const sourceUsed = new Set();
	pairUniqueCards(sourceCards, targetCards, pairs, sourceUsed, (left, right) => sameCardContract(left, right) && left.bindings.some(({ key }) => right.bindings.some((entry) => entry.key === key)), "binding-anchor");
	pairUniqueCards(sourceCards, targetCards, pairs, sourceUsed, (left, right) => left.item.id === right.item.id && sameCardContract(left, right), "card-identity");
	pairUniqueCards(sourceCards, targetCards, pairs, sourceUsed, (left, right) => left.hostId === right.hostId && sameCardContract(left, right), "host-control");
	pairUniqueCards(sourceCards, targetCards, pairs, sourceUsed, (left, right) => sameCardContract(left, right) && left.pageName === right.pageName && left.groupName === right.groupName, "layout-context");
	pairUniqueCards(sourceCards, targetCards, pairs, sourceUsed, sameCardSemantic, "card-label");
	const ambiguous = new Set();
	for (const targetCard of targetCards) {
		if (pairs.has(targetCard)) continue;
		const plausible = sourceCards.some((sourceCard) => !sourceUsed.has(sourceCard) && sameCardContract(sourceCard, targetCard) && (
			sameCardSemantic(sourceCard, targetCard)
			|| sourceCard.item.id === targetCard.item.id
			|| sourceCard.hostId === targetCard.hostId
			|| (sourceCard.pageName === targetCard.pageName && sourceCard.groupName === targetCard.groupName)
		));
		if (plausible) ambiguous.add(targetCard);
	}
	const targetCardByKey = new Map();
	for (const card of targetCards) for (const key of card.ownedKeys) targetCardByKey.set(key, card);
	return { pairs, ambiguous, targetCardByKey };
}

function sourceCardValue(card, sourceValues) {
	for (const { key } of card.bindings) if (Object.prototype.hasOwnProperty.call(sourceValues, key)) return { key, value: sourceValues[key] };
	return null;
}

function mergeMatchedPresetValues(target, ready) {
	const values = structuredClone(target.values);
	for (const entry of ready) values[entry.key] = structuredClone(entry.presetImported || entry.imported);
	return normalizeDashboardSnapshot({ dashboard: target.dashboard, values });
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
		try { values[key] = normalizeDashboardPresetValues({ [key]: { valueType: binding.valueType, payload } })[key]; }
		catch (error) { captured.push({ key, binding, status: "invalid", reason: error.message, error }); continue; }
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

export function mergeDashboardPresetValues(sourceSnapshot, targetPreset, acceptedKeys = []) {
	const source = normalizeDashboardSnapshot(sourceSnapshot);
	const target = normalizeDashboardSnapshot(targetPreset);
	const { bindings } = uniqueBindings(target.dashboard);
	const accepted = new Set(acceptedKeys);
	const values = structuredClone(target.values);
	for (const key of accepted) {
		const sourceValue = source.values[key];
		if (!bindings.has(key) || !sourceValue || sourceValue.valueType !== bindings.get(key).valueType) continue;
		values[key] = structuredClone(sourceValue);
	}
	return { dashboard: target.dashboard, values };
}

export function planDashboardPresetValueOverwrite(sourceSnapshot, targetPreset, resolveBinding) {
	const source = normalizeDashboardSnapshot(sourceSnapshot);
	const target = normalizeDashboardSnapshot(targetPreset);
	const { bindings: targetBindings, conflicts } = uniqueBindings(target.dashboard);
	const cardMatches = matchValueCards(source, target); const consumedSourceKeys = new Set(); const entries = [];
	for (const [key, binding] of targetBindings) {
		let imported = source.values[key]; let match = imported ? "exact" : null; let sourceKey = imported ? key : null; let recovery = null;
		const targetCard = cardMatches.targetCardByKey.get(key); const cardMatch = targetCard ? cardMatches.pairs.get(targetCard) : null;
		if (!imported && cardMatch) {
			const sourceValue = sourceCardValue(cardMatch.source, source.values);
			if (sourceValue) { imported = sourceValue.value; sourceKey = sourceValue.key; match = "recovered"; recovery = cardMatch.kind; }
		}
		if (!imported) {
			entries.push({ key, binding, target: target.values[key], status: targetCard && cardMatches.ambiguous.has(targetCard) ? "ambiguous" : "preserved", reason: targetCard && cardMatches.ambiguous.has(targetCard) ? "ambiguous-semantic-match" : "source-missing" });
			continue;
		}
		consumedSourceKeys.add(sourceKey);
		if (cardMatch) for (const entry of cardMatch.source.bindings) if (Object.prototype.hasOwnProperty.call(source.values, entry.key)) consumedSourceKeys.add(entry.key);
		const common = { key, binding, imported, target: target.values[key], match, sourceKey, recovery, sourceItem: cardMatch?.source.item || null, targetItem: targetCard?.item || null };
		if (conflicts.has(key)) {
			entries.push({ ...common, status: "invalid", reason: "conflicting-value-type", conflicts: conflicts.get(key) });
			continue;
		}
		if (imported.valueType !== binding.valueType) {
			entries.push({ ...common, status: "incompatible", reason: "value-type-mismatch" });
			continue;
		}
		let resolved;
		try { resolved = resolveBinding(binding); }
		catch (error) { entries.push({ ...common, status: "invalid", reason: error.message, error }); continue; }
		if (resolved?.status !== "ok") {
			entries.push({ ...common, resolved, status: resolved?.status || "missing" });
			continue;
		}
		if (resolved.presettable === false) {
			entries.push({ ...common, resolved, status: "layout-only" });
			continue;
		}
		const availability = runtimeAvailability(resolved);
		if (availability) {
			const modelResolution = availability === "empty" ? resolveDashboardPresetModelValue(binding, imported, resolved, "missing-option") : null;
			if (modelResolution) entries.push({ ...common, resolved, imported: modelResolution.value, presetImported: modelResolution.presetValue, ...modelResolution });
			else entries.push({ ...common, resolved, status: availability });
			continue;
		}
		let validation;
		try { validation = synchronous(resolved.validatePresetValue?.(imported), "validation", key); }
		catch (error) { entries.push({ ...common, resolved, status: "invalid", reason: error.message, error }); continue; }
		if (validation === false || validation?.ok === false || typeof validation === "string") {
			const reason = typeof validation === "string" ? validation : "invalid-value";
			const modelResolution = resolveDashboardPresetModelValue(binding, imported, resolved, reason);
			if (modelResolution) {
				entries.push({ ...common, resolved, imported: modelResolution.value, presetImported: modelResolution.presetValue, ...modelResolution });
				continue;
			}
			entries.push({ ...common, resolved, status: "invalid", reason });
			continue;
		}
		entries.push({ ...common, resolved, status: "ready" });
	}
	for (const [key, imported] of Object.entries(source.values)) if (!consumedSourceKeys.has(key) && !targetBindings.has(key)) entries.push({ key, imported, status: "unused" });
	const ready = applicablePresetEntries(entries);
	const issues = entries.filter((entry) => !["ready", "preserved"].includes(entry.status));
	return {
		source,
		target,
		merged: mergeMatchedPresetValues(target, ready),
		entries,
		ready,
		issues,
		summary: {
			overwritten: ready.length,
			exact: ready.filter((entry) => entry.match === "exact").length,
			recovered: ready.filter((entry) => entry.match === "recovered").length,
			preserved: entries.filter((entry) => entry.status === "preserved" && entry.target).length,
			unmatched: entries.filter((entry) => entry.status === "unused").length,
			needsReview: entries.filter((entry) => !["ready", "preserved", "unused"].includes(entry.status)).length,
		},
	};
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
		const reason = validation === false || validation?.ok === false || typeof validation === "string" ? (typeof validation === "string" ? validation : "invalid-value") : null;
		const modelResolution = reason ? resolveDashboardPresetModelValue(binding, saved, resolved, reason) : null;
		if (reason && !modelResolution) { entries.push({ key, binding, saved, resolved, status: "invalid", reason }); continue; }
		let previousPayload;
		try { previousPayload = readCurrentPayload(resolved, key); }
		catch (error) { entries.push({ key, binding, saved, resolved, status: "invalid", reason: error.message, error }); continue; }
		const common = { key, binding, saved: modelResolution?.value || saved, resolved, previous: { valueType: binding.valueType, payload: previousPayload } };
		entries.push(modelResolution ? { ...common, presetSaved: modelResolution.presetValue, ...modelResolution, saved: modelResolution.value } : { ...common, status: "ready" });
	}
	for (const [key, saved] of Object.entries(normalized.values)) if (!dashboardBindings.has(key)) entries.push({ key, saved, status: "unused" });
	return {
		dashboard: normalized.dashboard,
		entries,
		ready: applicablePresetEntries(entries),
		issues: entries.filter((entry) => !["ready", "layout-only"].includes(entry.status)),
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
