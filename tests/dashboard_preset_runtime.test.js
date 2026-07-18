import test from "node:test";
import assert from "node:assert/strict";

import { bindingKey } from "../js/lib/dashboard_model.js";
import { applyDashboardPresetPlan, captureDashboardValues, planDashboardPresetApplication } from "../js/lib/dashboard_preset_runtime.js";

const binding = (controlId, valueType = "number") => ({ provider: "generic-widget", hostId: "host-a", controlId, valueType });
const dashboard = (...bindings) => ({ pages: [
	{ items: bindings.map((item, index) => ({ id: `item-${index}`, kind: "control", binding: item })) },
	{ items: bindings.length ? [{ id: "mirror", kind: "control", binding: bindings[0] }] : [] },
] });

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

test("application planning separates ready, absent, incompatible and invalid values", () => {
	const steps = binding("steps"); const cfg = binding("cfg"); const mode = binding("mode", "string");
	const preset = { id: "quality", values: {
		[bindingKey(steps)]: { valueType: "number", payload: 30 },
		[bindingKey(cfg)]: { valueType: "number", payload: 11 },
		[bindingKey(mode)]: { valueType: "number", payload: 1 },
		"generic-widget:gone:value": { valueType: "number", payload: 2 },
	} };
	const plan = planDashboardPresetApplication(preset, dashboard(steps, cfg, mode), (candidate) => {
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
	const preset = { id: "broken", values: {
		[bindingKey(first)]: { valueType: "number", payload: 10 },
		[bindingKey(second)]: { valueType: "number", payload: 20 },
	} };
	const plan = planDashboardPresetApplication(preset, dashboard(first, second), resolved);
	assert.throws(() => applyDashboardPresetPlan(plan), /vendor write failed/);
	assert.deepEqual(state, { first: 1, second: 2 });
	assert.deepEqual(writes, [["first", 10], ["second", 20], ["first", 1]]);
});

test("successful preset application reports the atomic result", () => {
	const steps = binding("steps"); let current = 20; let dirty = 0;
	const preset = { id: "quality", values: { [bindingKey(steps)]: { valueType: "number", payload: 32 } } };
	const plan = planDashboardPresetApplication(preset, dashboard(steps), () => ({
		status: "ok", node: { setDirtyCanvas: () => dirty++ }, readPresetValue: () => current,
		validatePresetValue: () => true, applyPresetValue: (entry) => { current = entry.payload; },
	}));
	assert.deepEqual(applyDashboardPresetPlan(plan), { applied: 1, skipped: 0 });
	assert.equal(current, 32); assert.equal(dirty, 1);
});

test("third-party codec failures stay visible in preflight without breaking capture", () => {
	const vendor = binding("vendor", "string");
	const captured = captureDashboardValues(dashboard(vendor), () => ({ status: "ok", readPresetValue: () => { throw new Error("codec offline"); } }));
	assert.deepEqual(captured.values, {});
	assert.equal(captured.bindings[0].status, "error");
	assert.match(captured.bindings[0].error.message, /codec offline/);
	const preset = { id: "vendor", values: { [bindingKey(vendor)]: { valueType: "string", payload: "x" } } };
	const plan = planDashboardPresetApplication(preset, dashboard(vendor), () => ({ status: "ok", value: "old", validatePresetValue: () => { throw new Error("codec rejected"); } }));
	assert.equal(plan.ready.length, 0);
	assert.equal(plan.issues[0].status, "invalid");
	assert.equal(plan.issues[0].reason, "codec rejected");
});
