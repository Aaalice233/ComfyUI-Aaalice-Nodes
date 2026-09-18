/** Pure model for global value adjustment profiles: named reusable control-value override lists. */

import { normalizeDashboardPresetValues } from "./dashboard_presets.js";

export const VALUE_PROFILES_VERSION = 1;
const VALUE_PROFILE_NAME_LIMIT = 80;

export class ValueProfileError extends Error {
	constructor(message, code = "invalid-value-profiles") { super(message); this.name = "ValueProfileError"; this.code = code; }
}

function stableProfileId() {
	const token = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
	return `value_profile_${token}`;
}

function normalizeName(value) {
	const name = String(value || "").trim();
	if (!name) throw new ValueProfileError("Value profile name is required", "invalid-profile-name");
	if (name.length > VALUE_PROFILE_NAME_LIMIT) throw new ValueProfileError("Value profile name is too long", "invalid-profile-name");
	return name;
}

function nameKey(value) { return normalizeName(value).toLocaleLowerCase(); }

export function availableValueProfileName(sourceName, state) {
	const source = normalizeName(sourceName);
	const names = new Set((state?.profiles || []).map((profile) => nameKey(profile.name)));
	for (let count = 1; ; count++) {
		const suffix = count === 1 ? "" : ` ${count}`;
		const candidate = `${source.slice(0, Math.max(1, VALUE_PROFILE_NAME_LIMIT - suffix.length)).trim()}${suffix}`;
		if (!names.has(nameKey(candidate))) return candidate;
	}
}

function normalizeRule(source) {
	const key = String(source?.key || "");
	const valueType = String(source?.valueType || "");
	if (!key || !valueType) throw new ValueProfileError("Value profile rule is missing its binding identity", "invalid-profile-rule");
	// 复用预设值校验，保证 payload 是可 JSON 序列化的有限值。
	const entry = normalizeDashboardPresetValues({ [key]: { valueType, payload: source?.payload } })[key];
	return {
		key,
		valueType,
		payload: entry.payload,
		label: String(source?.label || "").trim(),
		hostLabel: String(source?.hostLabel || "").trim(),
	};
}

export function emptyValueProfileState() { return { version: VALUE_PROFILES_VERSION, profiles: [] }; }

export function normalizeValueProfileState(raw) {
	if (raw == null) return emptyValueProfileState();
	if (raw?.version !== VALUE_PROFILES_VERSION) throw new ValueProfileError(`Unsupported value profile version: ${raw?.version ?? "missing"}`, "unsupported-value-profiles");
	if (!Array.isArray(raw.profiles)) throw new ValueProfileError("Value profiles must be an array");
	const ids = new Set(); const names = new Set();
	const profiles = raw.profiles.map((source) => {
		const id = String(source?.id || ""); const name = normalizeName(source?.name);
		if (!id || ids.has(id)) throw new ValueProfileError(`Duplicate or missing value profile identity: ${id || "missing"}`, "invalid-profile-id");
		const lowered = nameKey(name);
		if (names.has(lowered)) throw new ValueProfileError(`Duplicate value profile name: ${name}`, "duplicate-profile-name");
		ids.add(id); names.add(lowered);
		if (!Array.isArray(source?.rules)) throw new ValueProfileError("Value profile rules must be an array");
		const ruleKeys = new Set(); const rules = [];
		for (const rule of source.rules) {
			const normalized = normalizeRule(rule);
			if (ruleKeys.has(normalized.key)) throw new ValueProfileError(`Duplicate value profile rule: ${normalized.key}`, "duplicate-profile-rule");
			ruleKeys.add(normalized.key); rules.push(normalized);
		}
		const presetName = String(source?.presetName || "").trim().slice(0, VALUE_PROFILE_NAME_LIMIT);
		// 早期版本的 pages 页面范围字段已随功能移除，读取时直接丢弃。
		return { id, name, presetName, rules };
	});
	return { version: VALUE_PROFILES_VERSION, profiles };
}

function copy(state) { return structuredClone(normalizeValueProfileState(state)); }
function findProfile(state, profileId) {
	const profile = state.profiles.find((item) => item.id === profileId);
	if (!profile) throw new ValueProfileError("Value profile is missing", "missing-profile");
	return profile;
}
function assertUniqueName(state, name, ignoredId = null) {
	const normalized = normalizeName(name); const key = nameKey(normalized);
	if (state.profiles.some((profile) => profile.id !== ignoredId && nameKey(profile.name) === key)) throw new ValueProfileError(`Duplicate value profile name: ${normalized}`, "duplicate-profile-name");
	return normalized;
}

export function createValueProfile(state, name, presetName = "") {
	const next = copy(state);
	next.profiles.push({
		id: stableProfileId(),
		name: assertUniqueName(next, name),
		presetName: String(presetName || "").trim().slice(0, VALUE_PROFILE_NAME_LIMIT),
		rules: [],
	});
	return next;
}

export function duplicateValueProfile(state, profileId, name) {
	const next = copy(state);
	const source = findProfile(next, profileId);
	next.profiles.push({ ...structuredClone(source), id: stableProfileId(), name: assertUniqueName(next, name) });
	return next;
}

export function renameValueProfile(state, profileId, name) {
	const next = copy(state);
	findProfile(next, profileId).name = assertUniqueName(next, name, profileId);
	return next;
}

export function setProfilePresetName(state, profileId, presetName) {
	const next = copy(state);
	findProfile(next, profileId).presetName = String(presetName || "").trim().slice(0, VALUE_PROFILE_NAME_LIMIT);
	return next;
}

export function reorderValueProfileRule(state, profileId, ruleKey, targetIndex) {
	const next = copy(state);
	const profile = findProfile(next, profileId);
	const sourceIndex = profile.rules.findIndex((item) => item.key === ruleKey);
	if (sourceIndex < 0) throw new ValueProfileError("Rule is missing", "missing-rule");
	const clampedTarget = Math.max(0, Math.min(profile.rules.length - 1, targetIndex));
	if (sourceIndex === clampedTarget) return next;
	const [rule] = profile.rules.splice(sourceIndex, 1);
	profile.rules.splice(clampedTarget, 0, rule);
	return next;
}

export function removeValueProfile(state, profileId) {
	const next = copy(state);
	next.profiles = next.profiles.filter((profile) => profile.id !== profileId);
	return next;
}


export function upsertValueProfileRule(state, profileId, rule) {
	const next = copy(state);
	const profile = findProfile(next, profileId);
	const normalized = normalizeRule(rule);
	const index = profile.rules.findIndex((item) => item.key === normalized.key);
	if (index >= 0) profile.rules[index] = normalized;
	else profile.rules.push(normalized);
	return next;
}

export function removeValueProfileRule(state, profileId, key) {
	const next = copy(state);
	const profile = findProfile(next, profileId);
	profile.rules = profile.rules.filter((rule) => rule.key !== key);
	return next;
}

export function removeValueProfileRules(state, profileId, keysToRemove) {
	const next = copy(state);
	const profile = findProfile(next, profileId);
	const removeSet = new Set(Array.isArray(keysToRemove) ? keysToRemove : [keysToRemove]);
	profile.rules = profile.rules.filter((rule) => !removeSet.has(rule.key));
	return next;
}

function labelKey(value) { return String(value || "").trim().toLocaleLowerCase(); }

/**
 * candidates: [{ key, valueType, label, hostLabel }]
 * 每条规则先按稳定 Binding Key 匹配；Key 失效时按保存的控件名称回退，
 * 名称重复时再用宿主标题消歧，仍不唯一则报 ambiguous，不猜测。
 */
export function matchValueProfileRules(rules, candidates) {
	const byKey = new Map((candidates || []).map((candidate) => [candidate.key, candidate]));
	return (rules || []).map((rule) => {
		const direct = byKey.get(rule.key);
		if (direct) return { rule, status: "ready", candidate: direct };
		const byLabel = (candidates || []).filter((candidate) => labelKey(candidate.label) === labelKey(rule.label));
		if (byLabel.length === 1) return { rule, status: "ready", candidate: byLabel[0] };
		if (byLabel.length > 1) {
			const byHost = byLabel.filter((candidate) => labelKey(candidate.hostLabel) === labelKey(rule.hostLabel));
			if (byHost.length === 1) return { rule, status: "ready", candidate: byHost[0] };
			return { rule, status: "ambiguous", candidate: null };
		}
		return { rule, status: "missing", candidate: null };
	});
}

/**
 * Compare two presets or preset-like snapshots and extract different values.
 * candidateMap: Map<bindingKey, { label, hostLabel, pageName }>
 */
export function diffDashboardPresets(basePreset, targetPreset, candidateMap = new Map()) {
	const baseValues = basePreset?.values || {};
	const targetValues = targetPreset?.values || {};
	const diffs = [];
	const keysToCompare = (candidateMap && candidateMap.size > 0)
		? [...candidateMap.keys()]
		: Object.keys(targetValues);

	for (const key of keysToCompare) {
		const targetEntry = targetValues[key];
		if (!targetEntry || typeof targetEntry !== "object") continue;
		const baseEntry = baseValues[key];
		const isDifferent = !baseEntry || JSON.stringify(baseEntry.payload) !== JSON.stringify(targetEntry.payload);
		if (!isDifferent) continue;
		const candidate = candidateMap?.get?.(key) || null;
		diffs.push({
			key,
			valueType: targetEntry.valueType,
			payload: structuredClone(targetEntry.payload),
			label: candidate?.label || key,
			hostLabel: candidate?.hostLabel || "",
			pageName: candidate?.pageName || "",
			basePayload: baseEntry ? structuredClone(baseEntry.payload) : null,
			targetPayload: structuredClone(targetEntry.payload),
		});
	}
	return diffs;
}

export const OVERRIDE_PRESET_FILE_TYPE = "aaalice-override-presets";

export function serializeOverridePresets(state, profileIdOrIds = null) {
	const normalized = normalizeValueProfileState(state);
	const ids = profileIdOrIds == null
		? null
		: new Set(Array.isArray(profileIdOrIds) ? profileIdOrIds : [profileIdOrIds]);
	const profiles = ids == null
		? normalized.profiles
		: normalized.profiles.filter((profile) => ids.has(profile.id));
	return {
		version: VALUE_PROFILES_VERSION,
		type: OVERRIDE_PRESET_FILE_TYPE,
		profiles: structuredClone(profiles),
	};
}

export function parseOverridePresetsForImport(raw, existingState = emptyValueProfileState()) {
	if (!raw || typeof raw !== "object") throw new ValueProfileError("Invalid override preset file format", "invalid-import-format");
	if (raw.version !== VALUE_PROFILES_VERSION) throw new ValueProfileError(`Unsupported version: ${raw?.version}`, "unsupported-value-profiles");
	const incomingProfiles = Array.isArray(raw.profiles) ? raw.profiles : [];
	if (!incomingProfiles.length) throw new ValueProfileError("No profiles found in import file", "empty-import");

	let next = copy(existingState);
	const importedIds = [];
	for (const item of incomingProfiles) {
		const baseName = normalizeName(item.name);
		const safeName = availableValueProfileName(baseName, next);
		const nextId = stableProfileId();
		const presetName = String(item.presetName || "").trim().slice(0, VALUE_PROFILE_NAME_LIMIT);
		const rules = (Array.isArray(item.rules) ? item.rules : []).map(normalizeRule);
		next.profiles.push({
			id: nextId,
			name: safeName,
			presetName,
			rules,
		});
		importedIds.push(nextId);
	}
	return { state: next, importedIds };
}

