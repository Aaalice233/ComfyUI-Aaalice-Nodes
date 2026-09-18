import test from "node:test";
import assert from "node:assert/strict";

import { bindingKey } from "../js/lib/dashboard_model.js";
import { applyDashboardPresetPlan, planDashboardPresetApplication } from "../js/lib/dashboard_preset_runtime.js";
import { availableValueProfileName, createValueProfile, diffDashboardPresets, duplicateValueProfile, emptyValueProfileState, matchValueProfileRules, normalizeValueProfileState, parseOverridePresetsForImport, removeValueProfile, removeValueProfileRule, removeValueProfileRules, renameValueProfile, reorderValueProfileRule, serializeOverridePresets, setProfilePresetName, upsertValueProfileRule, ValueProfileError } from "../js/lib/value_profiles.js";
import { formatProfilePayload, formatBooruGalleryPayload, formatLoraListPayload } from "../js/lib/value_profile_format.js";
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

test("duplicating a profile creates an independent named copy with every rule", () => {
	let state = createValueProfile(emptyValueProfileState(), "animal");
	const sourceId = state.profiles[0].id;
	state = upsertValueProfileRule(state, sourceId, rule("seed", { valueType: "integer", payload: { value: 7, control_after_generate: "fixed" } }));
	const original = structuredClone(state);
	const copyName = availableValueProfileName("animal Copy", state);
	const duplicated = duplicateValueProfile(state, sourceId, copyName);
	assert.equal(copyName, "animal Copy");
	assert.deepEqual(state, original);
	assert.deepEqual(duplicated.profiles.map((profile) => profile.name), ["animal", "animal Copy"]);
	assert.notEqual(duplicated.profiles[1].id, sourceId);
	assert.deepEqual(duplicated.profiles[1].rules, duplicated.profiles[0].rules);
	assert.notEqual(duplicated.profiles[1].rules[0], duplicated.profiles[0].rules[0]);
	assert.notEqual(duplicated.profiles[1].rules[0].payload, duplicated.profiles[0].rules[0].payload);
	duplicated.profiles[1].rules[0].payload.value = 99;
	assert.equal(duplicated.profiles[0].rules[0].payload.value, 7);
	assert.equal(availableValueProfileName("animal Copy", duplicated), "animal Copy 2");
	assert.throws(() => duplicateValueProfile(state, "missing", "copy"), (error) => error.code === "missing-profile");
	assert.throws(() => duplicateValueProfile(state, sourceId, "Animal"), (error) => error.code === "duplicate-profile-name");
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
	const moved = candidate("steps", { hostId: "moved", label: "Steps" });
	const [byLabel] = matchValueProfileRules([rule("steps", { label: "Steps" })], [moved]);
	assert.equal(byLabel.status, "ready");
	assert.equal(byLabel.candidate.binding.hostId, "moved");

	const duplicates = [
		candidate("steps", { hostId: "host-one", label: "Steps", hostLabel: "KSampler One" }),
		candidate("steps", { hostId: "host-two", label: "Steps", hostLabel: "KSampler Two" }),
	];
	const [disambiguated] = matchValueProfileRules([rule("steps", { label: "Steps", hostLabel: "KSampler Two" })], duplicates);
	assert.equal(disambiguated.status, "ready");
	assert.equal(disambiguated.candidate.binding.hostId, "host-two");
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
	assert.deepEqual(legacy.profiles[0], { id: "p1", name: "legacy", presetName: "", rules: [] });
});

test("reorderValueProfileRule moves a rule to the target index correctly", () => {
	let state = createValueProfile(emptyValueProfileState(), "animal");
	const id = state.profiles[0].id;
	state = upsertValueProfileRule(state, id, rule("steps", { payload: 20 }));
	state = upsertValueProfileRule(state, id, rule("cfg", { payload: 8 }));
	state = upsertValueProfileRule(state, id, rule("denoise", { payload: 1 }));

	assert.deepEqual(state.profiles[0].rules.map((r) => r.key), [rule("steps").key, rule("cfg").key, rule("denoise").key]);

	// Move denoise (index 2) to 0
	state = reorderValueProfileRule(state, id, rule("denoise").key, 0);
	assert.deepEqual(state.profiles[0].rules.map((r) => r.key), [rule("denoise").key, rule("steps").key, rule("cfg").key]);

	// Move denoise (index 0) to index 1
	state = reorderValueProfileRule(state, id, rule("denoise").key, 1);
	assert.deepEqual(state.profiles[0].rules.map((r) => r.key), [rule("steps").key, rule("denoise").key, rule("cfg").key]);
});

test("presetName can be updated and persisted", () => {
	let state = createValueProfile(emptyValueProfileState(), "animal", "My Preset Name");
	const id = state.profiles[0].id;
	assert.equal(state.profiles[0].presetName, "My Preset Name");

	state = setProfilePresetName(state, id, "Updated Preset Name");
	assert.equal(state.profiles[0].presetName, "Updated Preset Name");
});

test("diffDashboardPresets extracts keys where values differ between presets", () => {
	const keySteps = rule("steps").key;
	const keyCfg = rule("cfg").key;
	const keySampler = rule("sampler").key;

	const basePreset = {
		values: {
			[keySteps]: { valueType: "integer", payload: 20 },
			[keyCfg]: { valueType: "number", payload: 7 },
			[keySampler]: { valueType: "string", payload: "euler" },
		},
	};
	const keySubordinate = JSON.stringify(["subgraph-widget", "host_subordinate", "bool_zero"]);
	const targetPreset = {
		values: {
			[keySteps]: { valueType: "integer", payload: 30 }, // changed
			[keyCfg]: { valueType: "number", payload: 7 }, // same
			[keySampler]: { valueType: "string", payload: "dpmpp_2m" }, // changed
			[keySubordinate]: { valueType: "boolean", payload: true }, // changed subordinate key, not a standalone card
		},
	};

	const candidateMap = new Map([
		[keySteps, { label: "步数", hostLabel: "底模采样器", pageName: "参数页" }],
		[keySampler, { label: "采样器", hostLabel: "底模采样器", pageName: "参数页" }],
	]);

	const diffs = diffDashboardPresets(basePreset, targetPreset, candidateMap);
	assert.equal(diffs.length, 2);
	assert.equal(diffs[0].key, keySteps);
	assert.equal(diffs[0].label, "步数");
	assert.equal(diffs[0].basePayload, 20);
	assert.equal(diffs[0].targetPayload, 30);
	assert.equal(diffs[1].key, keySampler);
	assert.equal(diffs[1].label, "采样器");
	assert.equal(diffs[1].targetPayload, "dpmpp_2m");
	// Subordinate multi-target or orphan keys not in candidateMap must be excluded
	assert.ok(!diffs.some((d) => d.key === keySubordinate));
});

test("removeValueProfileRules removes multiple rules at once", () => {
	let state = createValueProfile(emptyValueProfileState(), "test-profile");
	const id = state.profiles[0].id;
	state = upsertValueProfileRule(state, id, rule("steps", { payload: 20 }));
	state = upsertValueProfileRule(state, id, rule("cfg", { payload: 7 }));
	state = upsertValueProfileRule(state, id, rule("sampler", { payload: "euler" }));
	assert.equal(state.profiles[0].rules.length, 3);

	state = removeValueProfileRules(state, id, [rule("steps").key, rule("sampler").key]);
	assert.equal(state.profiles[0].rules.length, 1);
	assert.equal(state.profiles[0].rules[0].key, rule("cfg").key);
});

test("serializeOverridePresets and parseOverridePresetsForImport roundtrip safely", () => {
	let state = createValueProfile(emptyValueProfileState(), "base-profile", "Target Preset");
	const id = state.profiles[0].id;
	state = upsertValueProfileRule(state, id, rule("steps", { payload: 25 }));

	const exported = serializeOverridePresets(state);
	assert.equal(exported.type, "aaalice-override-presets");
	assert.equal(exported.profiles.length, 1);
	assert.equal(exported.profiles[0].presetName, "Target Preset");

	// Import into state with conflicting name
	const { state: importedState, importedIds } = parseOverridePresetsForImport(exported, state);
	assert.equal(importedIds.length, 1);
	assert.equal(importedState.profiles.length, 2);
	assert.equal(importedState.profiles[0].name, "base-profile");
	assert.equal(importedState.profiles[1].name, "base-profile 2"); // renamed to avoid conflict
	assert.equal(importedState.profiles[1].presetName, "Target Preset");
	assert.equal(importedState.profiles[1].rules[0].payload, 25);
});

test("formatProfilePayload produces friendly summaries and tooltips for gallery, lora list, and resolution without '[object Object]'", () => {
	// 1. Booru Gallery
	const galleryPreset = {
		version: 1,
		state: {
			source: "danbooru",
			query: "1girl, solo",
			selections: [{ source: "danbooru", postId: "12345" }, { source: "danbooru", postId: "67890" }],
		},
	};
	const gallerySummary = formatProfilePayload(galleryPreset, { valueType: "booru-gallery" });
	assert.equal(gallerySummary, 'Danbooru · "1girl, solo" · 2 selected');
	assert.doesNotMatch(gallerySummary, /\[object Object\]/);

	const galleryTooltip = formatProfilePayload(galleryPreset, { valueType: "booru-gallery", format: "tooltip" });
	assert.match(galleryTooltip, /Danbooru · "1girl, solo"/);
	assert.match(galleryTooltip, /#12345/);
	assert.match(galleryTooltip, /#67890/);

	// Raw gallery state without wrapper
	const rawGallery = { source: "gelbooru", query: "", selections: [] };
	assert.equal(formatProfilePayload(rawGallery), "Gelbooru");

	// 2. LoRA Manager list
	const loraList = [
		{ name: "models/loras/anime_detail.safetensors", strength: 0.8, clipStrength: 0.8, active: true },
		{ name: "face_fix.safetensors", strength: 1.0, clipStrength: 1.0, active: false },
	];
	const loraSummary = formatProfilePayload(loraList, { valueType: "lora-list" });
	assert.equal(loraSummary, "anime_detail (0.8), face_fix (1) [Off]");
	assert.doesNotMatch(loraSummary, /\[object Object\]/);

	const loraTooltip = formatProfilePayload(loraList, { valueType: "lora-list", format: "tooltip" });
	assert.match(loraTooltip, /1\/2 enabled/);
	assert.match(loraTooltip, /anime_detail: 0.80/);
	assert.match(loraTooltip, /\[On\]/);
	assert.match(loraTooltip, /face_fix: 1.00/);
	assert.match(loraTooltip, /\[Off\]/);

	// Empty LoRA list
	assert.equal(formatProfilePayload([], { valueType: "lora-list" }), "0 LoRAs");

	// Many LoRAs
	const manyLoras = [
		{ name: "lora_a", strength: 1, active: true },
		{ name: "lora_b", strength: 1, active: true },
		{ name: "lora_c", strength: 1, active: true },
	];
	const manySummary = formatProfilePayload(manyLoras, { valueType: "lora-list" });
	assert.equal(manySummary, "3/3 enabled · lora_a, lora_b…");

	// 3. Resolution
	const resPayload = { version: 1, width: 1024, height: 768, alignment: 64 };
	const resSummary = formatProfilePayload(resPayload, { valueType: "resolution" });
	assert.equal(resSummary, "1024 × 768");
	assert.doesNotMatch(resSummary, /\[object Object\]/);

	// 4. Prompt Selector
	const promptPayload = { version: 1, selections: [{ entryId: "e1" }, { entryId: "e2" }] };
	const promptSummary = formatProfilePayload(promptPayload, { valueType: "prompt-selector" });
	assert.equal(promptSummary, "2 selected");
	assert.doesNotMatch(promptSummary, /\[object Object\]/);

	// 5. Primitives and generic objects
	assert.equal(formatProfilePayload(true), "On");
	assert.equal(formatProfilePayload(false), "Off");
	assert.equal(formatProfilePayload(42), "42");
	assert.equal(formatProfilePayload("hello"), "hello");
	assert.equal(formatProfilePayload(null), "—");
	assert.doesNotMatch(formatProfilePayload({ custom: "data" }), /\[object Object\]/);
});

