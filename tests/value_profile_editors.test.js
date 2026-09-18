import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createValueProfileDraft, profileValueCodec, SHARED_PROFILE_KINDS } from "../js/lib/value_profile_draft.js";
import { captureProfileGroups, planProfileGroups, setProfileGroupEnabled } from "../js/lib/value_profile_groups.js";
import { bindingKey } from "../js/lib/dashboard_model.js";
import { planValueProfileCopy } from "../js/lib/value_profile_application.js";
import { applyDashboardPresetPlan } from "../js/lib/dashboard_preset_runtime.js";
import { applyQuickGroupManagerPreset, quickGroupManagerPresetSnapshot, validateQuickGroupManagerPreset } from "../js/lib/quick_group_manager_runtime.js";
import { normalizeValueProfileState, serializeOverridePresets, parseOverridePresetsForImport } from "../js/lib/value_profiles.js";

test("draft edits clone values, validate before saving and never own a live writer", () => {
	const rule = { valueType: "object", payload: { values: [1] } }; const saved = [];
	const draft = createValueProfileDraft({ rule, validate: (entry) => entry.payload.values[0] > 0 || "invalid", save: (value) => saved.push(value) });
	const next = draft.getValue(); next.values[0] = 2; draft.commit(next); next.values[0] = 99;
	assert.deepEqual(rule.payload, { values: [1] }); assert.deepEqual(draft.getValue(), { values: [2] });
	assert.throws(() => draft.commit({ values: [-1] }), /invalid/); assert.equal(saved.length, 1);
	draft.destroy(); assert.throws(() => draft.commit({ values: [3] }), /closed/);
});

test("failed or asynchronous storage cannot replace the committed draft", () => {
	for (const save of [() => false, () => ({ ok: false }), () => Promise.resolve(), () => { throw Error("quota"); }]) {
		const draft = createValueProfileDraft({ rule: { payload: 1 }, save });
		assert.throws(() => draft.commit(2)); assert.equal(draft.getValue(), 1);
	}
});

test("seed value changes preserve behavior and support explicit behavior edits", () => {
	const rule = { valueType: "number", payload: { value: 7, control_after_generate: "increment" } };
	const draft = createValueProfileDraft({ rule, ...profileValueCodec({ kind: "seed" }, rule), save() {} });
	draft.commit(42); assert.equal(draft.getValue(), 42); assert.equal(draft.getPayload().control_after_generate, "increment");
});

test("a custom renderer can declare a reversible preset payload codec", () => {
	const resolved = { kind: "vendor", presetEditor: { decode: (payload) => payload.n, encode: (value, previous) => ({ ...previous, n: value }) } };
	const draft = createValueProfileDraft({ rule: { payload: { n: 3, metadata: true } }, ...profileValueCodec(resolved), save() {} });
	draft.commit(9); assert.deepEqual(draft.getPayload(), { n: 9, metadata: true });
	assert.throws(() => profileValueCodec({ kind: "unknown" }), /missing/);
});

test("all built-in writable renderers have a shared or specialized profile editor", () => {
	const source = readFileSync(new URL("../js/lib/controls/comfy.js", import.meta.url), "utf8");
	const kinds = [...source.slice(source.indexOf("Object.freeze({")).matchAll(/^\s*(?:"([\w-]+)"|(\w+)):\s*\(/gm)].map((match) => match[1] || match[2]);
	const supported = new Set([...SHARED_PROFILE_KINDS, "quick-group-manager", "booru-gallery", "resolution", "prompt-selector"]);
	const readOnly = new Set(["markdown", "image-compare", "image-output", "text-output"]);
	for (const kind of kinds) assert.ok(supported.has(kind) || readOnly.has(kind), `Missing preset editor: ${kind}`);
	assert.equal(kinds.length, 15);
});

test("profile host supplies control tokens and two-column group geometry", () => {
	const css = readFileSync(new URL("../js/lib/theme-profile-editors.css", import.meta.url), "utf8");
	assert.match(css, /--aa-control-accent: var\(--aa-ui-accent\)/);
	assert.match(css, /--aa-control-field: var\(--aa-ui-control\)/);
	assert.match(css, /\.aa-profile-group-editor \.aa-quick-group-control__row \{ grid-template-columns: minmax\(0, 1fr\) auto;/);
	assert.match(css, /\[data-kind="numeric"\] \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 64px;/);
});

const group = (id, title, ids) => ({ id, title, nodes: ids.map((id) => ({ id, mode: 0 })) });
const savedGroup = (id, title, enabled, ids) => ({ id, title, enabled, nodes: ids.map((id) => ({ id, enabled })) });

test("group intent survives rebuilding and new members while missing groups stay isolated", () => {
	const groups = [group("new", "Text to image", ["10", "11"]), group("keep", "Added", ["20"])];
	const payload = { version: 3, groups: [savedGroup("old", "Text to image", false, ["1"]), savedGroup("gone", "Deleted", true, ["2"])] };
	const plan = planProfileGroups(payload, groups, { version: 2, groups: [{ id: "keep", nodes: [{ id: "20", enabled: true }] }] });
	assert.equal(plan.applied, 1); assert.equal(plan.skipped, 1); assert.equal(plan.matches[0].recovered, true);
	assert.deepEqual(plan.payload.groups[0].nodes, [{ id: "10", enabled: false }, { id: "11", enabled: false }]);
	assert.deepEqual(plan.payload.groups[1].nodes, [{ id: "20", enabled: true }]);
});

test("legacy mixed groups keep exact members and do not guess added node states", () => {
	const plan = planProfileGroups({ version: 2, groups: [{ id: "g", nodes: [{ id: "1", enabled: false }, { id: "gone", enabled: true }] }] }, [group("g", "Renamed", ["1", "2"])]);
	assert.equal(plan.matches[0].status, "partial"); assert.deepEqual(plan.payload.groups[0].nodes, [{ id: "1", enabled: false }]);
});

test("manager scope limits capture and overrides, preserving hidden base groups", () => {
	const groups = [group("visible", "Generation", ["1"]), group("hidden", "SET", ["2"])];
	const base = { version: 2, groups: groups.map((g) => ({ id: g.id, nodes: g.nodes.map((n) => ({ id: n.id, enabled: true })) })) };
	const captured = captureProfileGroups(base, [groups[0]]);
	assert.deepEqual(captured.groups.map((g) => g.id), ["visible"]);
	const old = { version: 3, groups: groups.map((g) => savedGroup(g.id, g.title, false, g.nodes.map((n) => n.id))) };
	const planned = planProfileGroups(old, groups, base, [groups[0]]);
	assert.equal(planned.matches[1].status, "outOfScope");
	assert.equal(planned.payload.groups[0].nodes[0].enabled, false);
	assert.equal(planned.payload.groups[1].nodes[0].enabled, true);
});

test("ambiguous group names and overlapping conflicts cannot overwrite unrelated groups", () => {
	const groups = [group("a", "Same", ["1"]), group("b", "Same", ["1"]), group("c", "Other", ["3"])];
	const ambiguous = planProfileGroups({ version: 3, groups: [savedGroup("old", "Same", true, [])] }, groups);
	assert.equal(ambiguous.applied, 0); assert.equal(ambiguous.matches[0].status, "ambiguous");
	const conflict = planProfileGroups({ version: 3, groups: [savedGroup("a", "Same", true, []), savedGroup("b", "Same", false, []), savedGroup("c", "Other", false, [])] }, groups);
	assert.equal(conflict.applied, 1); assert.deepEqual(conflict.matches.map((match) => match.status), ["conflict", "conflict", "ready"]);
});

test("new group intent round-trips through profile export without changing old Dashboard codecs", () => {
	const groups = [group("g", "Name", ["1", "2"])];
	const payload = captureProfileGroups({ version: 2, groups: [{ id: "g", nodes: [{ id: "1", enabled: true }, { id: "2", enabled: false }] }] }, groups);
	assert.equal(payload.groups[0].enabled, undefined);
	const edited = setProfileGroupEnabled(payload, "g", groups[0], false);
	assert.equal(edited.groups[0].enabled, false); assert.equal(payload.groups[0].nodes[0].enabled, true);
	const key = JSON.stringify(["quick-group-manager", "host", "manager", null]);
	const state = normalizeValueProfileState({ version: 1, profiles: [{ id: "p", name: "Profile", rules: [{ key, valueType: "quick-group-manager", payload: edited }] }] });
	const restored = parseOverridePresetsForImport(JSON.parse(JSON.stringify(serializeOverridePresets(state))));
	assert.deepEqual(restored.state.profiles[0].rules[0].payload, edited);
});

test("copy planning converts group intent to real codec, preserves base and applies inside manager graph", () => {
	const groups = [group("g", "Generation", ["1", "2"])];
	const node = { type: "QuickGroupManager", graph: { _groups: groups, _nodes: [] }, properties: {}, title: "Manager" };
	const binding = { provider: "quick-group-manager", hostId: "manager", controlId: "manager", valueType: "quick-group-manager" };
	const key = bindingKey(binding); const basePayload = quickGroupManagerPresetSnapshot(node);
	const base = { dashboard: { version: 4, pages: [{ id: "p", name: "P", gridColumns: 12, groups: [], items: [{ id: "c", kind: "control", binding, layout: { row: 0, column: 0, rowSpan: 13, columnSpan: 12 } }] }] }, values: { [key]: { valueType: binding.valueType, payload: basePayload } } };
	const before = structuredClone(base);
	const resolve = () => ({ status: "ok", kind: "quick-group-manager", node, readPresetValue: () => quickGroupManagerPresetSnapshot(node), validatePresetValue: (entry) => validateQuickGroupManagerPreset(entry.payload), applyPresetValue: (entry) => applyQuickGroupManagerPreset(node, entry.payload, { transaction: false }) });
	const payload = { version: 3, groups: [savedGroup("old", "Generation", false, []), savedGroup("removed", "Removed", true, [])] };
	const plan = planValueProfileCopy(base, [{ key, valueType: binding.valueType, payload }], resolve, () => "Manager");
	assert.equal(plan.applied, 1); assert.equal(plan.matches[0].groupIssues.length, 1); assert.deepEqual(base, before);
	assert.equal(groups[0].nodes[0].mode, 0);
	applyDashboardPresetPlan(plan.application);
	assert.deepEqual(groups[0].nodes.map((member) => member.mode), [2, 2]);
});
