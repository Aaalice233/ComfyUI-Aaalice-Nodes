import test from "node:test";
import assert from "node:assert/strict";

import { bindingKey } from "../js/lib/dashboard_model.js";
import { applyDashboardPresetPlan, planDashboardPresetApplication } from "../js/lib/dashboard_preset_runtime.js";
import { createValueProfile, emptyValueProfileState, matchValueProfileRules, normalizeValueProfileState, removeValueProfile, removeValueProfileRule, renameValueProfile, upsertValueProfileRule, ValueProfileError } from "../js/lib/value_profiles.js";
import { saveValueProfiles } from "../js/workspace/sidebar_preferences.js";

const binding = (controlId, valueType = "number", hostId = "host-a") => ({ provider: "generic-widget", hostId, controlId, valueType });
const candidate = (controlId, { valueType = "number", hostId = "host-a", label = controlId, hostLabel = "Host A" } = {}) => ({
	binding: binding(controlId, valueType, hostId), key: bindingKey(binding(controlId, valueType, hostId)), valueType, label, hostLabel,
});
const rule = (controlId, overrides = {}) => ({
	key: bindingKey(binding(controlId)), valueType: "number", payload: 5, label: controlId, hostLabel: "Host A", ...overrides,
});

test("normalize tolerates null and rejects unsupported versions", () => {
	assert.deepEqual(normalizeValueProfileState(null), { version: 1, profiles: [] });
	assert.throws(() => normalizeValueProfileState({ version: 2, profiles: [] }), (error) => error instanceof ValueProfileError && error.code === "unsupported-value-profiles");
	assert.throws(() => normalizeValueProfileState({ version: 1, profiles: {} }), ValueProfileError);
});

test("local profile persistence exposes storage failures to the dialog", () => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	const originalWarn = console.warn;
	const failure = new Error("storage quota exceeded");
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { setItem() { throw failure; } } });
	console.warn = () => {};
	try {
		assert.throws(() => saveValueProfiles(emptyValueProfileState()), (error) => error === failure);
	} finally {
		console.warn = originalWarn;
		if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
		else delete globalThis.localStorage;
	}
});

test("profile names are trimmed and unique case-insensitively", () => {
	let state = createValueProfile(emptyValueProfileState(), " animal ");
	assert.equal(state.profiles[0].name, "animal");
	assert.throws(() => createValueProfile(state, "Animal"), (error) => error.code === "duplicate-profile-name");
	assert.throws(() => renameValueProfile(state, state.profiles[0].id, "  "), (error) => error.code === "invalid-profile-name");
	state = renameValueProfile(state, state.profiles[0].id, "beast");
	assert.equal(state.profiles[0].name, "beast");
});

test("rules upsert and remove by binding key, payloads are validated and cloned", () => {
	let state = createValueProfile(emptyValueProfileState(), "animal");
	const id = state.profiles[0].id;
	state = upsertValueProfileRule(state, id, rule("steps", { payload: 28 }));
	state = upsertValueProfileRule(state, id, rule("steps", { payload: 40 }));
	assert.equal(state.profiles[0].rules.length, 1);
	assert.equal(state.profiles[0].rules[0].payload, 40);
	assert.throws(() => upsertValueProfileRule(state, id, rule("steps", { payload: Number.NaN })), (error) => error.code === "invalid-preset-value");
	assert.throws(() => upsertValueProfileRule(state, id, rule("steps", { payload: undefined })), /undefined/);
	state = upsertValueProfileRule(state, id, rule("seed", { valueType: "integer", payload: { value: 7, control_after_generate: "fixed" } }));
	assert.equal(state.profiles[0].rules.length, 2);
	state = removeValueProfileRule(state, id, rule("steps").key);
	assert.deepEqual(state.profiles[0].rules.map((entry) => entry.valueType), ["integer"]);
	state = removeValueProfile(state, id);
	assert.equal(state.profiles.length, 0);
});

test("matching prefers the stable binding key", () => {
	const candidates = [candidate("steps"), candidate("cfg")];
	const [match] = matchValueProfileRules([rule("steps", { label: "Old label" })], candidates);
	assert.equal(match.status, "ready");
	assert.equal(match.candidate.binding.controlId, "steps");
});

test("matching falls back to a unique saved label, then to the host title, never guessing", () => {
	const moved = candidate("steps-renamed", { label: "Steps" });
	const [byLabel] = matchValueProfileRules([rule("steps", { label: "Steps" })], [moved]);
	assert.equal(byLabel.status, "ready");
	assert.equal(byLabel.candidate.binding.controlId, "steps-renamed");

	const duplicates = [
		candidate("steps-a", { label: "Steps", hostLabel: "KSampler One" }),
		candidate("steps-b", { label: "Steps", hostLabel: "KSampler Two" }),
	];
	const [disambiguated] = matchValueProfileRules([rule("steps", { label: "Steps", hostLabel: "KSampler Two" })], duplicates);
	assert.equal(disambiguated.status, "ready");
	assert.equal(disambiguated.candidate.binding.controlId, "steps-b");
	const [ambiguous] = matchValueProfileRules([rule("steps", { label: "Steps", hostLabel: "Elsewhere" })], duplicates);
	assert.equal(ambiguous.status, "ambiguous");
	const [missing] = matchValueProfileRules([rule("steps", { label: "Steps" })], [candidate("cfg")]);
	assert.equal(missing.status, "missing");
});

test("matched rules drive the existing preset application pipeline, including rollback", () => {
	const candidates = [candidate("steps"), candidate("cfg", { hostId: "host-b" })];
	const rules = [rule("steps", { payload: 40 }), rule("cfg", { hostLabel: "Host B", payload: 7 })];
	const matches = matchValueProfileRules(rules, candidates);
	const matched = matches.filter((match) => match.status === "ready");
	const synthetic = { version: 4, pages: [{ id: "value-profiles", name: "", gridColumns: 12, tone: null, groups: [], items: matched.map((match, index) => ({ id: `rule-${index}`, kind: "control", binding: match.candidate.binding, layout: { row: index * 13, column: 0, columnSpan: 6, rowSpan: 13 } })) }] };
	const values = {};
	for (const match of matched) values[match.candidate.key] = { valueType: match.rule.valueType, payload: match.rule.payload };
	const current = new Map([[bindingKey(binding("steps")), 28], [bindingKey(binding("cfg", "number", "host-b")), 4]]);
	const writes = [];
	const plan = planDashboardPresetApplication({ dashboard: synthetic, values }, (candidateBinding) => ({
		status: "ok",
		readPresetValue: () => current.get(bindingKey(candidateBinding)),
		applyPresetValue(entry) { writes.push([bindingKey(candidateBinding), entry.payload]); current.set(bindingKey(candidateBinding), entry.payload); return true; },
	}));
	assert.equal(plan.ready.length, 2);
	assert.equal(plan.issues.length, 0);
	applyDashboardPresetPlan(plan);
	assert.equal(current.get(bindingKey(binding("steps"))), 40);
	assert.equal(current.get(bindingKey(binding("cfg", "number", "host-b"))), 7);

	let failuresLeft = 1;
	current.set(bindingKey(binding("steps")), 1);
	current.set(bindingKey(binding("cfg", "number", "host-b")), 2);
	const failing = planDashboardPresetApplication({ dashboard: synthetic, values }, (candidateBinding) => ({
		status: "ok",
		readPresetValue: () => current.get(bindingKey(candidateBinding)),
		applyPresetValue(entry) {
			current.set(bindingKey(candidateBinding), entry.payload);
			if (candidateBinding.controlId === "cfg" && failuresLeft > 0) { failuresLeft -= 1; return false; }
			return true;
		},
	}));
	assert.throws(() => applyDashboardPresetPlan(failing), /rejected/);
	assert.equal(current.get(bindingKey(binding("steps"))), 1, "the earlier write must be rolled back to its previous payload");
	assert.equal(current.get(bindingKey(binding("cfg", "number", "host-b"))), 2);
});

test("plan reports invalid and unavailable rules as issues instead of writing them", () => {
	const candidates = [candidate("steps")];
	const [match] = matchValueProfileRules([rule("steps", { payload: 40 })], candidates);
	const synthetic = { version: 4, pages: [{ id: "value-profiles", name: "", gridColumns: 12, tone: null, groups: [], items: [{ id: "rule-0", kind: "control", binding: match.candidate.binding, layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 } }] }] };
	const values = { [match.candidate.key]: { valueType: "number", payload: 40 } };
	const plan = planDashboardPresetApplication({ dashboard: synthetic, values }, () => ({ status: "ok", readPresetValue: () => 28, validatePresetValue: () => "invalid-value" }));
	assert.equal(plan.ready.length, 0);
	assert.equal(plan.issues[0].status, "invalid");
	assert.equal(plan.issues[0].reason, "invalid-value");
});

test("legacy profiles with a page scope load with the scope dropped", () => {
	const legacy = normalizeValueProfileState({ version: 1, profiles: [{ id: "p1", name: "legacy", pages: ["page-a"], rules: [] }] });
	assert.deepEqual(legacy.profiles[0], { id: "p1", name: "legacy", rules: [] });
});
