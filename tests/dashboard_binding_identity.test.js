import test from "node:test";
import assert from "node:assert/strict";
import { createBindingTargetMatcher, createControlBindingMatcher, isModelResourceBinding, sameBindingTarget } from "../js/lib/dashboard_binding_identity.js";

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

test("add-controls matching unwraps Provider control descriptors at the boundary", () => {
	const legacyIds = ["model_name", "steps", "cfg", "sampler", "scheduler", "denoise", "seed", "switch", "filename_prefix", "embed_workflow", "save_with_metadata", "desktop_notification", "volume", "sound", "message"];
	const currentIds = [
		['promoted:["94","model_name",null]', "model_name"],
		['promoted:["89","steps",null]', "steps"],
		['promoted:["89","cfg",null]', "cfg"],
		['promoted:["89","sampler",null]', "sampler"],
		['promoted:["89","scheduler",null]', "scheduler"],
		['promoted:["89","denoise",null]', "denoise"],
		['promoted:["89","seed",null]', "seed"],
		['promoted:["677","switch",null]', "switch"],
		['promoted:["675","filename_prefix",null]', "filename_prefix"],
		['promoted:["675","embed_workflow",null]', "embed_workflow"],
		['promoted:["675","save_with_metadata",null]', "save_with_metadata"],
		['promoted:["679","desktop_notification",null]', "desktop_notification"],
		['promoted:["679","volume",null]', "volume"],
		['promoted:["679","sound",null]', "sound"],
		['promoted:["679","message",null]', "message"],
	];
	const legacyBindings = legacyIds.map((controlId) => binding(controlId));
	const widgetById = new Map();
	for (const [currentId, legacyId] of currentIds) {
		const widget = {};
		widgetById.set(currentId, widget);
		widgetById.set(legacyId, widget);
	}
	const missingId = 'promoted:["102","value",null]';
	const currentControls = [...currentIds.map(([controlId]) => binding(controlId)), binding(missingId)].map((candidate) => ({ binding: candidate }));
	const resolve = (candidate) => ({ status: "ok", widget: widgetById.get(candidate.controlId) || (candidate.controlId === missingId ? {} : null) });
	const isExisting = createControlBindingMatcher(legacyBindings, resolve);
	const addable = currentControls.filter((control) => !isExisting(control));

	assert.equal(addable.length, 1);
	assert.equal(addable[0].binding.controlId, missingId);
	assert.equal(isExisting(legacyBindings[0]), false, "the matcher accepts control descriptors, not raw bindings");
});

test("bindingControlIdLabel renders promoted tuples as readable source names", async () => {
	const { bindingControlIdLabel } = await import("../js/lib/dashboard_binding_identity.js");
	assert.equal(bindingControlIdLabel({ controlId: 'promoted:["4","cfg",null]' }), "cfg");
	assert.equal(bindingControlIdLabel({ controlId: 'promoted:["5","seed","6"]' }), "seed");
	assert.equal(bindingControlIdLabel({ controlId: "steps" }), "steps");
	assert.equal(bindingControlIdLabel({ controlId: "promoted:not-json" }), "promoted:not-json");
	assert.equal(bindingControlIdLabel({}), "");
});

test("model resource bindings are identified without treating ordinary combos as model files", () => {
	assert.equal(isModelResourceBinding(binding('promoted:["4","unet_name",null]'), "custom-model"), true);
	assert.equal(isModelResourceBinding(binding("clip_name3"), "text-encoder"), true);
	assert.equal(isModelResourceBinding(binding("custom_choice"), "weights/model.gguf"), true);
	assert.equal(isModelResourceBinding(binding("custom_choice"), "weights/model.safetensors"), true);
	assert.equal(isModelResourceBinding(binding("custom_choice"), "model-without-extension", "Checkpoint name"), true);
	assert.equal(isModelResourceBinding(binding("sampler_name"), "euler"), false);
	assert.equal(isModelResourceBinding(binding("model_type"), "flux"), false);
	assert.equal(isModelResourceBinding(binding("image"), "example.png"), false);
});
