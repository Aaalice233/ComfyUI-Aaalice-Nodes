/** Pure workflow-owned snapshots for sidebar layouts and their live values. */

import { bindingKey, controlItemBindings, legacyBindingKey, normalizeDashboard } from "./dashboard_model.js";

export const DASHBOARD_PRESETS_VERSION = 1;
export const DASHBOARD_PRESET_FILE_FORMAT = "aaalice-sidebar-preset";
export const DASHBOARD_PRESET_FILE_VERSION = 1;
const DASHBOARD_PRESET_NAME_LIMIT = 80;
const UNSAFE_VALUE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class DashboardPresetError extends Error {
	constructor(message, code = "invalid-dashboard-presets") { super(message); this.name = "DashboardPresetError"; this.code = code; }
}

function stablePresetId() {
	const token = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
	return `dashboard_preset_${token}`;
}

function clonePayload(value, seen = new Set()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "undefined") throw new DashboardPresetError("Preset values cannot contain undefined", "invalid-preset-value");
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new DashboardPresetError("Preset values must contain finite numbers", "invalid-preset-value");
		return value;
	}
	if (typeof value !== "object") throw new DashboardPresetError("Preset values must be serializable", "invalid-preset-value");
	if (seen.has(value)) throw new DashboardPresetError("Preset values cannot contain cycles", "invalid-preset-value");
	seen.add(value);
	let result;
	if (Array.isArray(value)) result = value.map((item) => clonePayload(item, seen));
	else {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new DashboardPresetError("Preset values must use plain objects", "invalid-preset-value");
		result = {};
		for (const [key, item] of Object.entries(value)) {
			if (UNSAFE_VALUE_KEYS.has(key)) throw new DashboardPresetError(`Unsafe preset payload key: ${key}`, "invalid-preset-key");
			result[key] = clonePayload(item, seen);
		}
	}
	seen.delete(value); return result;
}

function normalizeQuickGroupManagerPreset(value) {
	if (![1, 2].includes(Number(value?.version)) || !Array.isArray(value?.groups)) return value;
	if (Number(value.version) === 2) return { version: 2, groups: value.groups };
	const valid = value.groups.every((group) => group?.id != null && Array.isArray(group.nodes) && group.nodes.every((member) => member?.id != null && [0, 2, 4].includes(Number(member.mode))));
	if (!valid) return value;
	return {
		version: 2,
		groups: value.groups.map((group) => ({
			id: group.id,
			nodes: group.nodes.map((member) => ({ id: member.id, enabled: Number(member.mode) === 0 })),
		})),
	};
}

function normalizePresetPayload(valueType, payload) {
	const value = clonePayload(payload);
	return valueType === "quick-group-manager" ? normalizeQuickGroupManagerPreset(value) : value;
}

export function normalizeDashboardPresetValues(values) {
	if (!values || typeof values !== "object" || Array.isArray(values)) throw new DashboardPresetError("Preset values must be an object", "invalid-preset-values");
	const result = {};
	for (const [key, entry] of Object.entries(values)) {
		if (UNSAFE_VALUE_KEYS.has(key)) throw new DashboardPresetError(`Unsafe preset value key: ${key}`, "invalid-preset-key");
		if (!key || !entry || typeof entry !== "object" || typeof entry.valueType !== "string" || !entry.valueType || !("payload" in entry)) throw new DashboardPresetError(`Invalid preset value: ${key || "missing key"}`, "invalid-preset-value");
		result[key] = { valueType: entry.valueType, payload: normalizePresetPayload(entry.valueType, entry.payload) };
	}
	return result;
}

function normalizeName(value) {
	const name = String(value || "").trim();
	if (!name) throw new DashboardPresetError("Preset name is required", "invalid-preset-name");
	if (name.length > 80) throw new DashboardPresetError("Preset name is too long", "invalid-preset-name");
	return name;
}

function nameKey(value) { return normalizeName(value).toLocaleLowerCase(); }

export function availableDashboardPresetName(sourceName, state) {
	const source = normalizeName(sourceName);
	const names = new Set((state?.presets || []).map((preset) => nameKey(preset.name)));
	for (let count = 1; ; count++) {
		const suffix = count === 1 ? "" : ` ${count}`;
		const candidate = `${source.slice(0, Math.max(1, DASHBOARD_PRESET_NAME_LIMIT - suffix.length)).trim()}${suffix}`;
		if (!names.has(nameKey(candidate))) return candidate;
	}
}

export function dashboardPresetNameFromFile(fileName, fallbackName = "") {
	const baseName = String(fileName || "").trim().split(/[\\/]/).pop() || "";
	const stem = baseName.replace(/\.json$/i, "").trim().slice(0, DASHBOARD_PRESET_NAME_LIMIT).trim();
	return stem || String(fallbackName || "").trim().slice(0, DASHBOARD_PRESET_NAME_LIMIT).trim();
}

export function dashboardPresetFileName(name) {
	const safeName = String(name || "").trim()
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "")
		.slice(0, DASHBOARD_PRESET_NAME_LIMIT)
		.trim();
	return `${safeName || "aaalice-dashboard-layout"}.json`;
}

export function normalizeDashboardSnapshot(source) {
	if (!source || typeof source !== "object") throw new DashboardPresetError("Sidebar preset snapshot is missing", "invalid-preset-snapshot");
	const dashboard = normalizeDashboard(source.dashboard); const values = normalizeDashboardPresetValues(source.values || {}); const migratedKeys = new Set();
	const legacyCandidates = new Map();
	for (const page of dashboard.pages) for (const item of page.items) {
		if (item.kind !== "control") continue;
		for (const binding of controlItemBindings(item)) {
			const key = bindingKey(binding); const legacyKey = legacyBindingKey(binding);
			if (legacyKey === key) continue;
			const candidates = legacyCandidates.get(legacyKey) || new Set(); candidates.add(key); legacyCandidates.set(legacyKey, candidates);
		}
	}
	for (const [legacyKey, candidates] of legacyCandidates) {
		if (candidates.size !== 1 || !Object.prototype.hasOwnProperty.call(values, legacyKey)) continue;
		const [key] = candidates;
		if (!Object.prototype.hasOwnProperty.call(values, key)) values[key] = structuredClone(values[legacyKey]);
		migratedKeys.add(legacyKey);
	}
	for (const key of migratedKeys) delete values[key];
	return { dashboard, values };
}

export function emptyDashboardPresetState() { return { version: DASHBOARD_PRESETS_VERSION, presets: [], baselinePresetId: null }; }

export function normalizeDashboardPresetState(raw) {
	if (raw == null) return emptyDashboardPresetState();
	if (raw?.version !== DASHBOARD_PRESETS_VERSION) throw new DashboardPresetError(`Unsupported sidebar preset version: ${raw?.version ?? "missing"}`, "unsupported-dashboard-presets");
	if (!Array.isArray(raw.presets)) throw new DashboardPresetError("Sidebar presets must be an array");
	const ids = new Set(); const names = new Set();
	const presets = raw.presets.map((source) => {
		const id = String(source?.id || ""); const name = normalizeName(source?.name);
		if (!id || ids.has(id)) throw new DashboardPresetError(`Duplicate or missing preset identity: ${id || "missing"}`, "invalid-preset-id");
		const normalizedName = nameKey(name);
		if (names.has(normalizedName)) throw new DashboardPresetError(`Duplicate preset name: ${name}`, "duplicate-preset-name");
		ids.add(id); names.add(normalizedName);
		return { id, name, ...normalizeDashboardSnapshot(source) };
	});
	return { version: DASHBOARD_PRESETS_VERSION, presets, baselinePresetId: ids.has(raw.baselinePresetId) ? raw.baselinePresetId : null };
}

export function dashboardPresetStateNeedsMigration(source, normalized) {
	return Boolean(source?.presets?.some((preset) => {
		if (preset.dashboard?.version !== normalized.presets.find((entry) => entry.id === preset.id)?.dashboard.version) return true;
		return Object.values(preset.values || {}).some((entry) => entry?.valueType === "quick-group-manager" && (entry.payload?.version !== 2 || Object.prototype.hasOwnProperty.call(entry.payload || {}, "state")));
	}));
}

function copy(state) { return structuredClone(normalizeDashboardPresetState(state)); }
function assertUniqueName(state, name, ignoredId = null) {
	const normalized = normalizeName(name); const key = nameKey(normalized);
	if (state.presets.some((preset) => preset.id !== ignoredId && nameKey(preset.name) === key)) throw new DashboardPresetError(`Duplicate preset name: ${normalized}`, "duplicate-preset-name");
	return normalized;
}

export function createDashboardPreset(state, name, snapshot) {
	const next = copy(state); const preset = { id: stablePresetId(), name: assertUniqueName(next, name), ...normalizeDashboardSnapshot(snapshot) };
	next.presets.push(preset); next.baselinePresetId = preset.id; return next;
}

export function replaceDashboardPreset(state, presetId, snapshot) {
	const next = copy(state); const preset = next.presets.find((item) => item.id === presetId);
	if (!preset) throw new DashboardPresetError("Sidebar preset is missing", "missing-preset");
	Object.assign(preset, normalizeDashboardSnapshot(snapshot)); next.baselinePresetId = preset.id; return next;
}

export function renameDashboardPreset(state, presetId, name) {
	const next = copy(state); const preset = next.presets.find((item) => item.id === presetId);
	if (!preset) throw new DashboardPresetError("Sidebar preset is missing", "missing-preset");
	preset.name = assertUniqueName(next, name, preset.id); return next;
}

export function duplicateDashboardPreset(state, presetId, name) {
	const next = copy(state); const source = next.presets.find((item) => item.id === presetId);
	if (!source) throw new DashboardPresetError("Sidebar preset is missing", "missing-preset");
	next.presets.push({ id: stablePresetId(), name: assertUniqueName(next, name), ...normalizeDashboardSnapshot(source) });
	return next;
}

export function removeDashboardPreset(state, presetId) {
	const next = copy(state);
	const removedIndex = next.presets.findIndex((item) => item.id === presetId);
	if (removedIndex < 0) return next;
	const wasBaseline = next.baselinePresetId === presetId;
	next.presets.splice(removedIndex, 1);
	if (wasBaseline) next.baselinePresetId = next.presets[removedIndex]?.id || next.presets[removedIndex - 1]?.id || null;
	return next;
}

export function setDashboardPresetBaseline(state, presetId = null) {
	const next = copy(state);
	if (presetId != null && !next.presets.some((item) => item.id === presetId)) throw new DashboardPresetError("Sidebar preset is missing", "missing-preset");
	next.baselinePresetId = presetId; return next;
}

function equalPayload(left, right) {
	if (Object.is(left, right)) return true;
	const seedValue = (value) => value && typeof value === "object" && !Array.isArray(value) && typeof value.value === "number" && typeof value.control_after_generate === "string" ? value.value : undefined;
	if (typeof left === "number" && Object.is(left, seedValue(right))) return true;
	if (typeof right === "number" && Object.is(seedValue(left), right)) return true;
	if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
	const leftKeys = Object.keys(left); const rightKeys = Object.keys(right);
	return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && equalPayload(left[key], right[key]));
}

function dashboardUnits(source) {
	const dashboard = normalizeDashboard(source); const units = new Map();
	for (const [pageIndex, page] of dashboard.pages.entries()) {
		units.set(`page:${page.id}`, { index: pageIndex, name: page.name });
		for (const [groupIndex, group] of page.groups.entries()) units.set(`group:${group.id}`, { pageId: page.id, index: groupIndex, ...group });
		for (const [itemIndex, item] of page.items.entries()) units.set(`item:${item.id}`, { pageId: page.id, index: itemIndex, ...item });
	}
	return units;
}

function countDashboardChanges(left, right) {
	const before = dashboardUnits(left); const after = dashboardUnits(right); const keys = new Set([...before.keys(), ...after.keys()]); let changed = 0;
	for (const key of keys) if (!equalPayload(before.get(key), after.get(key))) changed++;
	return changed;
}

export function compareDashboardPreset(preset, currentSnapshot) {
	const saved = normalizeDashboardSnapshot(preset); const current = normalizeDashboardSnapshot(currentSnapshot);
	const statuses = new Map((currentSnapshot?.bindings || []).map((entry) => [entry.key, entry.status]));
	const layoutChanges = countDashboardChanges(saved.dashboard, current.dashboard);
	let changed = 0; let missing = 0; let added = 0;
	for (const [key, entry] of Object.entries(saved.values)) {
		const value = current.values[key]; const status = statuses.get(key);
		if (["empty", "unset", "unavailable"].includes(status)) continue;
		if (!value) missing++;
		else if (entry.valueType !== value.valueType || !equalPayload(entry.payload, value.payload)) changed++;
	}
	for (const key of Object.keys(current.values)) if (!saved.values[key]) added++;
	const valueChanges = changed + missing + added;
	return { layoutChanges, valueChanges, changed, missing, added, modified: layoutChanges > 0 || valueChanges > 0, attention: missing > 0 || [...statuses.values()].some((status) => ["missing", "incompatible", "error", "invalid"].includes(status)) };
}

export function serializeDashboardPreset(snapshot, name = null) {
	const normalized = normalizeDashboardSnapshot(snapshot);
	const presetName = name == null ? snapshot?.name : name;
	return { format: DASHBOARD_PRESET_FILE_FORMAT, version: DASHBOARD_PRESET_FILE_VERSION, ...(presetName == null ? {} : { name: normalizeName(presetName) }), ...normalized };
}

export function parseDashboardPreset(raw) {
	if (raw?.format !== DASHBOARD_PRESET_FILE_FORMAT || raw?.version !== DASHBOARD_PRESET_FILE_VERSION) throw new DashboardPresetError("Unsupported sidebar preset backup", "unsupported-preset-file");
	const snapshot = normalizeDashboardSnapshot(raw);
	return raw.name == null ? snapshot : { ...snapshot, name: normalizeName(raw.name) };
}

export function parseDashboardPresetForImport(raw) {
	if (raw?.format !== DASHBOARD_PRESET_FILE_FORMAT || raw?.version !== DASHBOARD_PRESET_FILE_VERSION) throw new DashboardPresetError("Unsupported sidebar preset backup", "unsupported-preset-file");
	const rawValues = raw.values ?? {};
	if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) throw new DashboardPresetError("Preset values must be an object", "invalid-preset-values");
	const values = {}; const issues = [];
	for (const [key, entry] of Object.entries(rawValues)) {
		try { Object.assign(values, normalizeDashboardPresetValues({ [key]: entry })); }
		catch (error) { issues.push({ key, status: "invalid", reason: error?.code || "invalid-preset-value" }); }
	}
	const snapshot = normalizeDashboardSnapshot({ dashboard: raw.dashboard, values });
	return {
		snapshot: raw.name == null ? snapshot : { ...snapshot, name: normalizeName(raw.name) },
		issues,
	};
}
