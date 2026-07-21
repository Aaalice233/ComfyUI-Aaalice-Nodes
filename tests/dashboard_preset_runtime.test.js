import test from "node:test";
import assert from "node:assert/strict";

import { bindingKey } from "../js/lib/dashboard_model.js";
import { applyDashboardPresetPlan, applyDashboardSnapshotPlan, captureDashboardValues, mergeCapturedPresetValues, planDashboardPresetApplication } from "../js/lib/dashboard_preset_runtime.js";
import { createSeedPresetPayload, decodeSeedPresetEntry, validateSeedPresetEntry } from "../js/lib/seed_preset.js";

const binding = (controlId, valueType = "number") => ({ provider: "generic-widget", hostId: "host-a", controlId, valueType });
const dashboard = (...bindings) => ({ version: 2, pages: [
	{ id: "page-a", name: "A", gridColumns: 12, groups: [], items: bindings.map((item, index) => ({ id: `item-${index}`, kind: "control", binding: item, label: "", groupId: null, compact: false, layout: { row: index * 8, column: 0, columnSpan: 6, rowSpan: 7 } })) },
	{ id: "page-b", name: "B", gridColumns: 12, groups: [], items: bindings.length ? [{ id: "mirror", kind: "control", binding: bindings[0], label: "", groupId: null, compact: false, layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 7 } }] : [] },
] });
const snapshot = (layout, values = {}) => ({ dashboard: layout, values });

test("value capture deduplicates mirrored cards and skips unresolved or unset controls", () => {
	const steps = binding("steps"); const cfg = binding("cfg"); const empty = binding("empty", "string"); const calls = [];
	const result = captureDashboardValues(dashboard(steps, cfg, empty), (candidate) => {
		calls.push(candidate.controlId);
		if (candidate.controlId === "cfg") return { status: "missing" };
		if (candidate.controlId === "empty") return { status: "ok", readPresetValue: () => undefined };
		return { status: "ok", readPresetValue: () => 28 };
	});
	assert.deepEqual(calls, ["steps", "cfg", "empty"]);
	assert.deepEqual(result.values, { [bindingKey(steps)]: { valueType: "number", payload: 28 } });
	assert.deepEqual(result.bindings.map(({ status }) => status), ["ok", "missing", "unset"]);
});

test("layout-only views keep bindings without persisting transient values", () => {
	const compare = binding("compare_view", "image-compare-view");
	const key = bindingKey(compare);
	const captured = captureDashboardValues(dashboard(compare), () => ({ status: "ok", presettable: false, value: { beforeImages: ["temp-a"] } }));
	assert.deepEqual(captured.values, {});
	assert.deepEqual(captured.bindings.map(({ status }) => status), ["layout-only"]);
	assert.deepEqual(mergeCapturedPresetValues(captured, { [key]: { valueType: "image-compare-view", payload: { beforeImages: ["stale"] } } }), {});
	const plan = planDashboardPresetApplication(snapshot(dashboard(compare), {}), () => ({ status: "ok", presettable: false }));
	assert.equal(plan.ready.length, 0); assert.equal(plan.issues.length, 0); assert.equal(plan.entries[0].status, "layout-only");
});

test("capture respects runtime availability and preserves unavailable saved values", () => {
	const steps = binding("steps"); const cfg = binding("cfg");
	const snapshot = captureDashboardValues(dashboard(steps, cfg), (candidate) => candidate.controlId === "cfg"
		? { status: "ok", value: 7, availability: { state: "unavailable" } }
		: { status: "ok", value: 24 });
	assert.deepEqual(snapshot.values, { [bindingKey(steps)]: { valueType: "number", payload: 24 } });
	assert.deepEqual(snapshot.bindings.map(({ status }) => status), ["ok", "unavailable"]);
	const previous = { [bindingKey(cfg)]: { valueType: "number", payload: 11 }, "generic-widget:gone:value": { valueType: "number", payload: 3 } };
	assert.deepEqual(mergeCapturedPresetValues(snapshot, previous), {
		[bindingKey(steps)]: { valueType: "number", payload: 24 },
		[bindingKey(cfg)]: { valueType: "number", payload: 11 },
	});
});

test("application planning separates ready, absent, incompatible and invalid values", () => {
	const steps = binding("steps"); const cfg = binding("cfg"); const mode = binding("mode", "string");
	const preset = snapshot(dashboard(steps, cfg, mode), {
		[bindingKey(steps)]: { valueType: "number", payload: 30 },
		[bindingKey(cfg)]: { valueType: "number", payload: 11 },
		[bindingKey(mode)]: { valueType: "number", payload: 1 },
		"generic-widget:gone:value": { valueType: "number", payload: 2 },
	});
	const plan = planDashboardPresetApplication(preset, (candidate) => {
		if (candidate.controlId === "cfg") return { status: "ok", value: 7, validatePresetValue: () => "above-maximum" };
		return { status: "ok", value: candidate.controlId === "mode" ? "fast" : 20, validatePresetValue: () => true };
	});
	assert.deepEqual(plan.ready.map(({ key }) => key), [bindingKey(steps)]);
	assert.deepEqual(plan.issues.map(({ status }) => status), ["invalid", "incompatible", "unused"]);
});

test("preset application writes each binding once and rolls back an interrupted transaction", () => {
	const first = binding("first"); const second = binding("second"); const state = { first: 1, second: 2 }; const writes = [];
	const resolved = (candidate) => ({
		status: "ok", node: { setDirtyCanvas() {} },
		readPresetValue: () => state[candidate.controlId], validatePresetValue: () => true,
		applyPresetValue(entry) {
			writes.push([candidate.controlId, entry.payload]);
			if (candidate.controlId === "second" && entry.payload === 20) throw new Error("vendor write failed");
			state[candidate.controlId] = entry.payload;
		},
	});
	const preset = snapshot(dashboard(first, second), {
		[bindingKey(first)]: { valueType: "number", payload: 10 },
		[bindingKey(second)]: { valueType: "number", payload: 20 },
	});
	const plan = planDashboardPresetApplication(preset, resolved);
	assert.throws(() => applyDashboardPresetPlan(plan), /vendor write failed/);
	assert.deepEqual(state, { first: 1, second: 2 });
	assert.deepEqual(writes, [["first", 10], ["second", 20], ["second", 2], ["first", 1]]);
});

test("application rolls back a codec that mutates before throwing", () => {
	const target = binding("target"); let current = 1;
	const plan = planDashboardPresetApplication(snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } }), () => ({
		status: "ok", readPresetValue: () => current, validatePresetValue: () => true,
		applyPresetValue(entry) { current = entry.payload; if (entry.payload === 9) throw new Error("failed after write"); },
	}));
	assert.throws(() => applyDashboardPresetPlan(plan), /failed after write/);
	assert.equal(current, 1);
});

test("asynchronous third-party preset codecs fail visibly before application", () => {
	const target = binding("target");
	const preset = snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } });
	const plan = planDashboardPresetApplication(preset, () => ({ status: "ok", value: 1, validatePresetValue: async () => true }));
	assert.equal(plan.ready.length, 0);
	assert.equal(plan.issues[0].error.code, "async-preset-codec");
});

test("successful preset application reports the atomic result", () => {
	const steps = binding("steps"); let current = 20; let dirty = 0;
	const preset = snapshot(dashboard(steps), { [bindingKey(steps)]: { valueType: "number", payload: 32 } });
	const plan = planDashboardPresetApplication(preset, () => ({
		status: "ok", node: { setDirtyCanvas: () => dirty++ }, readPresetValue: () => current,
		validatePresetValue: () => true, applyPresetValue: (entry) => { current = entry.payload; },
	}));
	assert.deepEqual(applyDashboardPresetPlan(plan), { applied: 1, skipped: 0 });
	assert.equal(current, 32); assert.equal(dirty, 1);
});

test("switching between seed presets restores each lock behavior", () => {
	const seed = binding("seed"); const state = { value: 1, behavior: "randomize" };
	const resolveSeed = () => ({
		status: "ok", kind: "seed", value: state.value,
		readPresetValue: () => createSeedPresetPayload(state.value, state.behavior),
		validatePresetValue: (entry) => validateSeedPresetEntry(entry, { min: 0, max: 100 }),
		applyPresetValue: (entry) => { const decoded = decodeSeedPresetEntry(entry, state.behavior); state.value = decoded.value; state.behavior = decoded.behavior; },
	});
	const fixed = snapshot(dashboard(seed), { [bindingKey(seed)]: { valueType: "number", payload: createSeedPresetPayload(11, "fixed") } });
	const random = snapshot(dashboard(seed), { [bindingKey(seed)]: { valueType: "number", payload: createSeedPresetPayload(22, "randomize") } });
	applyDashboardPresetPlan(planDashboardPresetApplication(fixed, resolveSeed));
	assert.deepEqual(state, { value: 11, behavior: "fixed" });
	applyDashboardPresetPlan(planDashboardPresetApplication(random, resolveSeed));
	assert.deepEqual(state, { value: 22, behavior: "randomize" });
	applyDashboardPresetPlan(planDashboardPresetApplication(fixed, resolveSeed));
	assert.deepEqual(state, { value: 11, behavior: "fixed" });
});

test("third-party codec failures stay visible in preflight without breaking capture", () => {
	const vendor = binding("vendor", "string");
	const captured = captureDashboardValues(dashboard(vendor), () => ({ status: "ok", readPresetValue: () => { throw new Error("codec offline"); } }));
	assert.deepEqual(captured.values, {});
	assert.equal(captured.bindings[0].status, "error");
	assert.match(captured.bindings[0].error.message, /codec offline/);
	const preset = snapshot(dashboard(vendor), { [bindingKey(vendor)]: { valueType: "string", payload: "x" } });
	const plan = planDashboardPresetApplication(preset, () => ({ status: "ok", value: "old", validatePresetValue: () => { throw new Error("codec rejected"); } }));
	assert.equal(plan.ready.length, 0);
	assert.equal(plan.issues[0].status, "invalid");
	assert.equal(plan.issues[0].reason, "codec rejected");
});

test("layout and values roll back together when a preset write fails", () => {
	const target = binding("target"); let currentValue = 1; let currentDashboard = dashboard(binding("old"));
	const plan = planDashboardPresetApplication(snapshot(dashboard(target), { [bindingKey(target)]: { valueType: "number", payload: 9 } }), () => ({
		status: "ok", readPresetValue: () => currentValue, validatePresetValue: () => true,
		applyPresetValue(entry) { currentValue = entry.payload; if (entry.payload === 9) throw new Error("write failed"); },
	}));
	assert.throws(() => applyDashboardSnapshotPlan(plan, { readDashboard: () => currentDashboard, writeDashboard: (next) => { currentDashboard = next; } }), /write failed/);
	assert.equal(currentValue, 1);
	assert.equal(currentDashboard.pages[0].items[0].binding.controlId, "old");
});
