import test from "node:test";
import assert from "node:assert/strict";
import { createBindingTargetMatcher, sameBindingTarget } from "../js/lib/dashboard_binding_identity.js";

const binding = (controlId, overrides = {}) => ({
	provider: "subgraph-widget",
	hostId: "host-a",
	controlId,
	valueType: "number",
	adapterId: "comfy-native-widget",
	...overrides,
});

test("matches current bindings by their stable physical target", () => {
	assert.equal(sameBindingTarget(binding("steps"), binding("steps")), true);
	assert.equal(sameBindingTarget(binding("steps"), binding("cfg")), false);
	assert.equal(sameBindingTarget(binding("steps"), binding("steps", { hostId: "host-b" })), false);
});

test("matches legacy promoted-widget ids through the resolved widget owner", () => {
	const legacy = binding("steps");
	const current = binding('promoted:["89","steps",null]');
	const widget = {};
	const resolve = (candidate) => ({ status: "ok", widget: candidate.controlId === legacy.controlId || candidate.controlId === current.controlId ? widget : {} });
	assert.equal(sameBindingTarget(legacy, current, resolve), true);
	assert.equal(sameBindingTarget(legacy, binding('promoted:["89","cfg",null]'), resolve), false);
	const matcher = createBindingTargetMatcher([legacy], resolve);
	assert.equal(matcher(current), true);
	assert.equal(matcher(binding('promoted:["89","cfg",null]')), false);
	assert.equal(matcher(binding(current.controlId, { hostId: "host-b" })), false);
});
