/** Pure workflow-owned parameter-value preset model. */

export const DASHBOARD_VALUE_PRESETS_VERSION = 1;

export class DashboardValuePresetError extends Error {
	constructor(message, code = "invalid-value-presets") { super(message); this.name = "DashboardValuePresetError"; this.code = code; }
}

function stablePresetId() {
	const token = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
	return `value_preset_${token}`;
}

function clonePayload(value, seen = new Set()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "undefined") throw new DashboardValuePresetError("Preset values cannot contain undefined", "invalid-preset-value");
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new DashboardValuePresetError("Preset values must contain finite numbers", "invalid-preset-value");
		return value;
	}
	if (typeof value !== "object") throw new DashboardValuePresetError("Preset values must be serializable", "invalid-preset-value");
	if (seen.has(value)) throw new DashboardValuePresetError("Preset values cannot contain cycles", "invalid-preset-value");
	seen.add(value);
	let result;
	if (Array.isArray(value)) result = value.map((item) => clonePayload(item, seen));
	else {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new DashboardValuePresetError("Preset values must use plain objects", "invalid-preset-value");
		result = {};
		for (const [key, item] of Object.entries(value)) result[key] = clonePayload(item, seen);
	}
	seen.delete(value); return result;
}

function normalizeValues(values) {
	if (!values || typeof values !== "object" || Array.isArray(values)) throw new DashboardValuePresetError("Preset values must be an object", "invalid-preset-values");
	const result = {};
	for (const [key, entry] of Object.entries(values)) {
		if (!key || !entry || typeof entry !== "object" || typeof entry.valueType !== "string" || !entry.valueType || !("payload" in entry)) throw new DashboardValuePresetError(`Invalid preset value: ${key || "missing key"}`, "invalid-preset-value");
		result[key] = { valueType: entry.valueType, payload: clonePayload(entry.payload) };
	}
	return result;
}

function normalizeName(value) {
	const name = String(value || "").trim();
	if (!name) throw new DashboardValuePresetError("Preset name is required", "invalid-preset-name");
	if (name.length > 80) throw new DashboardValuePresetError("Preset name is too long", "invalid-preset-name");
	return name;
}

export function emptyValuePresetState() { return { version: DASHBOARD_VALUE_PRESETS_VERSION, presets: [], lastAppliedPresetId: null }; }

export function normalizeValuePresetState(raw) {
	if (raw == null) return emptyValuePresetState();
	if (raw?.version !== DASHBOARD_VALUE_PRESETS_VERSION) throw new DashboardValuePresetError(`Unsupported parameter preset version: ${raw?.version ?? "missing"}`, "unsupported-value-presets");
	if (!Array.isArray(raw.presets)) throw new DashboardValuePresetError("Parameter presets must be an array");
	const ids = new Set(); const names = new Set(); const presets = raw.presets.map((source) => {
		const id = String(source?.id || ""); const name = normalizeName(source?.name);
		if (!id || ids.has(id)) throw new DashboardValuePresetError(`Duplicate or missing parameter preset identity: ${id || "missing"}`, "invalid-preset-id");
		const normalizedName = name.toLocaleLowerCase();
		if (names.has(normalizedName)) throw new DashboardValuePresetError(`Duplicate parameter preset name: ${name}`, "duplicate-preset-name");
		ids.add(id); names.add(normalizedName); return { id, name, values: normalizeValues(source.values || {}) };
	});
	const lastAppliedPresetId = ids.has(raw.lastAppliedPresetId) ? raw.lastAppliedPresetId : null;
	return { version: DASHBOARD_VALUE_PRESETS_VERSION, presets, lastAppliedPresetId };
}

function copy(state) { return structuredClone(normalizeValuePresetState(state)); }
function assertUniqueName(state, name, ignoredId = null) {
	const normalized = normalizeName(name); const key = normalized.toLocaleLowerCase();
	if (state.presets.some((preset) => preset.id !== ignoredId && preset.name.toLocaleLowerCase() === key)) throw new DashboardValuePresetError(`Duplicate parameter preset name: ${normalized}`, "duplicate-preset-name");
	return normalized;
}

export function createValuePreset(state, name, values) {
	const next = copy(state); const preset = { id: stablePresetId(), name: assertUniqueName(next, name), values: normalizeValues(values) };
	next.presets.push(preset); next.lastAppliedPresetId = preset.id; return next;
}

export function replaceValuePreset(state, presetId, values) {
	const next = copy(state); const preset = next.presets.find((item) => item.id === presetId);
	if (!preset) throw new DashboardValuePresetError("Parameter preset is missing", "missing-preset");
	preset.values = normalizeValues(values); next.lastAppliedPresetId = preset.id; return next;
}

export function renameValuePreset(state, presetId, name) {
	const next = copy(state); const preset = next.presets.find((item) => item.id === presetId);
	if (!preset) throw new DashboardValuePresetError("Parameter preset is missing", "missing-preset");
	preset.name = assertUniqueName(next, name, preset.id); return next;
}

export function duplicateValuePreset(state, presetId, name) {
	const source = normalizeValuePresetState(state).presets.find((item) => item.id === presetId);
	if (!source) throw new DashboardValuePresetError("Parameter preset is missing", "missing-preset");
	return createValuePreset(state, name, source.values);
}

export function removeValuePreset(state, presetId) {
	const next = copy(state);
	if (!next.presets.some((item) => item.id === presetId)) return next;
	next.presets = next.presets.filter((item) => item.id !== presetId);
	if (next.lastAppliedPresetId === presetId) next.lastAppliedPresetId = null;
	return next;
}

export function markValuePresetApplied(state, presetId) {
	const next = copy(state);
	if (!next.presets.some((item) => item.id === presetId)) throw new DashboardValuePresetError("Parameter preset is missing", "missing-preset");
	next.lastAppliedPresetId = presetId; return next;
}

function equalPayload(left, right) {
	if (Object.is(left, right)) return true;
	if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
	const leftKeys = Object.keys(left); const rightKeys = Object.keys(right);
	return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && equalPayload(left[key], right[key]));
}

export function compareValuePreset(preset, currentValues) {
	const saved = normalizeValues(preset?.values || {}); const current = normalizeValues(currentValues || {});
	let changed = 0; let missing = 0; let added = 0;
	for (const [key, entry] of Object.entries(saved)) {
		const value = current[key];
		if (!value) missing++;
		else if (entry.valueType !== value.valueType || !equalPayload(entry.payload, value.payload)) changed++;
	}
	for (const key of Object.keys(current)) if (!saved[key]) added++;
	return { changed, missing, added, modified: changed > 0 || added > 0, attention: missing > 0 };
}
