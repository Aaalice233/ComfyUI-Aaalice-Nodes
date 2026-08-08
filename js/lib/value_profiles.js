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
		return { id, name, rules };
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

export function createValueProfile(state, name) {
	const next = copy(state);
	next.profiles.push({ id: stableProfileId(), name: assertUniqueName(next, name), rules: [] });
	return next;
}

export function renameValueProfile(state, profileId, name) {
	const next = copy(state);
	findProfile(next, profileId).name = assertUniqueName(next, name, profileId);
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
