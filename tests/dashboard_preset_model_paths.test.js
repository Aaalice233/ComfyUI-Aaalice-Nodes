import test from "node:test";
import assert from "node:assert/strict";

import { bindingKey } from "../js/lib/dashboard_model.js";
import { applyDashboardPresetPlan, captureDashboardValues, mergeCapturedPresetValues, planDashboardPresetApplication, planDashboardPresetValueOverwrite } from "../js/lib/dashboard_preset_runtime.js";

const binding = (controlId) => ({ provider: "generic-widget", hostId: "host-a", controlId, valueType: "string" });
const dashboard = (model) => ({ version: 4, pages: [{ id: "page-a", name: "Models", gridColumns: 12, tone: null, groups: [], items: [{ id: "model", kind: "control", binding: model, label: "", groupId: null, layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 } }] }] });
const snapshot = (model, payload) => ({ dashboard: dashboard(model), values: { [bindingKey(model)]: { valueType: "string", payload } } });

test("capturing an applied nested model path preserves the portable preset filename", () => {
	const model = binding("unet_name"); const key = bindingKey(model);
	const previous = { [key]: { valueType: "string", payload: "anima.safetensors" } };
	const captured = captureDashboardValues(dashboard(model), () => ({ status: "ok", options: { values: ["Models\\Anima\\anima.safetensors"] }, readPresetValue: () => "Models\\Anima\\anima.safetensors" }));
	assert.deepEqual(mergeCapturedPresetValues(captured, previous), previous);
	const changed = captureDashboardValues(dashboard(model), () => ({ status: "ok", options: { values: ["Models/Anima/other.safetensors"] }, readPresetValue: () => "Models/Anima/other.safetensors" }));
	assert.equal(mergeCapturedPresetValues(changed, previous)[key].payload, "Models/Anima/other.safetensors");
	const duplicate = captureDashboardValues(dashboard(model), () => ({ status: "ok", options: { values: ["A/anima.safetensors", "B/anima.safetensors"] }, readPresetValue: () => "B/anima.safetensors" }));
	assert.equal(mergeCapturedPresetValues(duplicate, previous)[key].payload, "B/anima.safetensors");
});

test("model preset values resolve unique nested paths across common model controls", () => {
	for (const controlId of ["unet_name", "clip_name", "vae_name", "ckpt_name", "upscale_model"]) {
		const model = binding(controlId); let current = "krea2.safetensors";
		const expected = `${controlId}.safetensors`; const nested = `Models\\Anima\\${expected}`;
		const resolve = () => ({
			status: "ok", label: controlId, options: { values: ["krea2.safetensors", nested] }, readPresetValue: () => current,
			validatePresetValue: (entry) => ["krea2.safetensors", nested].includes(entry.payload) ? true : "missing-option",
			applyPresetValue: (entry) => { current = entry.payload; },
		});
		const plan = planDashboardPresetApplication(snapshot(model, expected), resolve);
		assert.equal(plan.ready.length, 1); assert.equal(plan.issues[0].status, "model-path-match");
		assert.equal(plan.issues[0].detectedModelPath, nested); assert.equal(plan.entries[0].presetSaved.payload, expected);
		assert.deepEqual(applyDashboardPresetPlan(plan), { applied: 1, skipped: 0 }); assert.equal(current, nested);
	}
});

test("values-only import keeps portable model filenames while planning a nested local path", () => {
	const model = binding("vae_name"); const key = bindingKey(model);
	const target = snapshot(model, "krea_vae.safetensors");
	const plan = planDashboardPresetValueOverwrite(snapshot(model, "anima_vae.safetensors"), target, () => ({
		status: "ok", label: "VAE", options: { values: ["VAE/Anima/anima_vae.safetensors"] }, validatePresetValue: () => "missing-option",
	}));
	assert.equal(plan.ready[0].imported.payload, "VAE/Anima/anima_vae.safetensors");
	assert.equal(plan.merged.values[key].payload, "anima_vae.safetensors");
});

test("missing and empty model options receive the new preset value", () => {
	for (const [controlId, resolved] of [
		["unet_name", { label: "UNET model", options: { values: ["krea2.safetensors"] }, validatePresetValue: () => "missing-option" }],
		["clip_name", { label: "CLIP", options: { values: [] }, availability: { state: "empty" } }],
	]) {
		const model = binding(controlId); let current = "krea2.safetensors";
		const plan = planDashboardPresetApplication(snapshot(model, "anima.safetensors"), () => ({
			status: "ok", ...resolved, readPresetValue: () => current, applyPresetValue: (entry) => { current = entry.payload; },
		}));
		assert.equal(plan.issues[0].status, "missing-model"); assert.equal(plan.issues[0].applySaved, true);
		assert.deepEqual(applyDashboardPresetPlan(plan), { applied: 1, skipped: 0 }); assert.equal(current, "anima.safetensors");
	}
});

test("ambiguous nested model filenames never guess a path but still replace the previous model", () => {
	const model = binding("ckpt_name"); let current = "krea2.safetensors";
	const plan = planDashboardPresetApplication(snapshot(model, "anima.safetensors"), () => ({
		status: "ok", label: "Checkpoint", options: { values: ["A/anima.safetensors", "B\\anima.safetensors"] }, readPresetValue: () => current,
		validatePresetValue: () => "missing-option", applyPresetValue: (entry) => { current = entry.payload; },
	}));
	assert.equal(plan.issues[0].status, "ambiguous-model");
	assert.deepEqual(plan.issues[0].candidates, ["A/anima.safetensors", "B\\anima.safetensors"]);
	applyDashboardPresetPlan(plan); assert.equal(current, "anima.safetensors");
});

test("ordinary missing combo options remain skipped", () => {
	const scheduler = binding("scheduler"); let current = "normal";
	const plan = planDashboardPresetApplication(snapshot(scheduler, "removed"), () => ({
		status: "ok", label: "Scheduler", options: { values: ["normal"] }, readPresetValue: () => current,
		validatePresetValue: () => "missing-option", applyPresetValue: (entry) => { current = entry.payload; },
	}));
	assert.equal(plan.ready.length, 0); assert.equal(plan.issues[0].status, "invalid");
	assert.deepEqual(applyDashboardPresetPlan(plan), { applied: 0, skipped: 1 }); assert.equal(current, "normal");
});
