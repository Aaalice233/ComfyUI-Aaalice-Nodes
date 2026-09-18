import test from "node:test";
import assert from "node:assert/strict";
import { bindingKey } from "../js/lib/dashboard_model.js";
import { planValueProfileCopy } from "../js/lib/value_profile_application.js";
import { applyDashboardSnapshotPlan } from "../js/lib/dashboard_preset_runtime.js";
import { matchValueProfileRules, parseOverridePresetsForImport } from "../js/lib/value_profiles.js";

const binding = (hostId, controlId = "steps", valueType = "number") => ({ provider: "generic-widget", hostId, controlId, valueType });
const rule = (b, payload = 40) => ({ key: bindingKey(b), valueType: b.valueType, payload, label: "Steps", hostLabel: "Sampler" });
function fixture({ linked = false, invalid = false, missing = false, fail = false } = {}) {
	const primary = binding("new"); const added = binding("new", "added"); const secondary = binding("linked");
	const items = [primary, added].map((b, i) => ({ id: `card-${i}`, kind: "control", binding: b, label: i ? "Added" : "Steps", groupId: null, layout: { row: i * 13, column: 0, columnSpan: 6, rowSpan: 13 } }));
	if (linked) items[0].linkedBindings = [secondary];
	const dashboard = { version: 4, pages: [{ id: "main", name: "Main", gridColumns: 12, groups: [], items }] };
	const values = Object.fromEntries([primary, added, ...(linked ? [secondary] : [])].map((b) => [bindingKey(b), { valueType: "number", payload: b.controlId === "added" ? 99 : 20 }]));
	const live = new Map(Object.entries(values).map(([key, entry]) => [key, entry.payload]));
	const graph = {}; const nodes = new Map();
	const resolve = (b) => {
		if (missing && b.hostId === "linked") return { status: "missing" };
		if (!nodes.has(b.hostId)) nodes.set(b.hostId, { graph, title: "Sampler" });
		return { status: "ok", node: nodes.get(b.hostId), controlId: b.controlId, control: b.controlId, kind: "numeric", numericDomain: "integer", linkable: true,
			options: { min: 0, max: 100, step: 1 }, readPresetValue: () => live.get(bindingKey(b)),
			validatePresetValue: (entry) => invalid && entry.payload === 40 ? "above-maximum" : true,
			applyPresetValue: (entry) => { live.set(bindingKey(b), entry.payload); if (fail && entry.payload === 40) throw Error("write failed"); } };
	};
	return { base: { dashboard, values }, primary, added, live, resolve, title: (item) => item.label };
}

test("old IDs recover onto new bindings; added values and base snapshot remain unchanged", () => {
	const f = fixture(); const before = structuredClone(f.base);
	const plan = planValueProfileCopy(f.base, [rule(binding("old")), rule(binding("gone", "removed"))], f.resolve, f.title);
	assert.equal(plan.applied, 1); assert.equal(plan.skipped, 1);
	assert.equal(plan.snapshot.values[bindingKey(f.primary)].payload, 40);
	assert.equal(plan.snapshot.values[bindingKey(f.added)].payload, 99);
	assert.equal(plan.snapshot.values[bindingKey(binding("old"))], undefined);
	assert.deepEqual(f.base, before);
	applyDashboardSnapshotPlan(plan.application, { readDashboard: () => f.base.dashboard, writeDashboard() {} });
	assert.equal(f.live.get(bindingKey(f.primary)), 40);
});

test("incompatible and ambiguous destinations are never chosen by order", () => {
	const old = binding("old");
	const candidates = ["one", "two"].map((id) => ({ key: bindingKey(binding(id)), valueType: "number", label: "Steps", hostLabel: "Sampler" }));
	assert.equal(matchValueProfileRules([rule(old)], candidates)[0].status, "ambiguous");
	assert.equal(matchValueProfileRules([rule(old)], [{ ...candidates[0], valueType: "string" }])[0].status, "missing");
	const twoRules = [rule(binding("old-a")), rule(binding("old-b"))];
	assert.deepEqual(matchValueProfileRules(twoRules, [candidates[0]]).map((m) => m.status), ["ambiguous", "ambiguous"]);
});

test("validation failure preserves the base value and is counted as skipped", () => {
	const f = fixture({ invalid: true }); const plan = planValueProfileCopy(f.base, [rule(f.primary)], f.resolve, f.title);
	assert.equal(plan.applied, 0); assert.equal(plan.skipped, 1);
	assert.equal(plan.snapshot.values[bindingKey(f.primary)].payload, 20);
});

test("missing linked members block the whole rule without writing half a card", () => {
	const f = fixture({ linked: true, missing: true }); const plan = planValueProfileCopy(f.base, [rule(f.primary)], f.resolve, f.title);
	assert.equal(plan.applied, 0);
	assert.ok(!plan.application.ready.some((entry) => entry.key === bindingKey(f.primary)));
	assert.equal(f.live.get(bindingKey(f.primary)), 20);
});

test("valid linked cards expand recovered rules and roll back write failures", () => {
	for (const fail of [false, true]) {
		const f = fixture({ linked: true, fail }); const plan = planValueProfileCopy(f.base, [rule(binding("old"))], f.resolve, f.title);
		assert.equal(plan.applied, 1);
		const apply = () => applyDashboardSnapshotPlan(plan.application, { readDashboard: () => f.base.dashboard, writeDashboard() {} });
		if (fail) assert.throws(apply, /write failed/); else apply();
		assert.equal(f.live.get(bindingKey(f.primary)), fail ? 20 : 40);
		assert.equal(f.live.get(bindingKey(binding("linked"))), fail ? 20 : 40);
	}
});

test("importing old rules does not require their nodes to exist", () => {
	const result = parseOverridePresetsForImport({ version: 1, type: "aaalice-override-presets", profiles: [{ name: "Old", rules: [rule(binding("gone"))] }] });
	assert.equal(result.state.profiles[0].rules.length, 1);
	assert.throws(() => parseOverridePresetsForImport({ version: 1, type: "other", profiles: [] }), /file type/);
});

test("model overrides recover unique local paths but never force missing models", () => {
	for (const available of [true, false]) {
		const f = fixture(); const model = binding("model", "unet_name", "string");
		f.base.dashboard.pages[0].items = [{ ...f.base.dashboard.pages[0].items[0], binding: model, label: "Model" }];
		f.base.values = { [bindingKey(model)]: { valueType: "string", payload: "base.safetensors" } };
		const options = available ? ["base.safetensors", "folder/new.safetensors"] : ["base.safetensors"];
		const resolve = () => ({ status: "ok", kind: "choice", node: { title: "Loader" }, options: { values: options },
			readPresetValue: () => "base.safetensors", validatePresetValue: (entry) => options.includes(entry.payload) ? true : "missing-option" });
		const result = planValueProfileCopy(f.base, [rule(model, "new.safetensors")], resolve, f.title);
		assert.equal(result.applied, available ? 1 : 0);
		assert.equal(result.snapshot.values[bindingKey(model)].payload, available ? "folder/new.safetensors" : "base.safetensors");
	}
});

test("same labels do not recover different parameter identities or providers", () => {
	const source = rule(binding("old", "steps"));
	for (const target of [binding("new", "cfg"), { ...binding("new"), provider: "other" }]) {
		const [match] = matchValueProfileRules([source], [{ key: bindingKey(target), valueType: "number", label: "Steps", hostLabel: "Sampler" }]);
		assert.equal(match.status, "missing");
	}
});
