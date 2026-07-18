import test from "node:test";
import assert from "node:assert/strict";

import {
	DashboardValuePresetError,
	compareValuePreset,
	createValuePreset,
	duplicateValuePreset,
	emptyValuePresetState,
	markValuePresetApplied,
	normalizeValuePresetState,
	removeValuePreset,
	renameValuePreset,
	replaceValuePreset,
} from "../js/lib/dashboard_value_presets.js";

const values = (steps = 20) => ({
	"aaalice-parameter:host-a:steps": { valueType: "number", payload: steps },
	"aaalice-parameter:host-a:tags": { valueType: "string-list", payload: ["cat", "night"] },
});

test("parameter presets are a separate versioned workflow collection", () => {
	assert.deepEqual(emptyValuePresetState(), { version: 1, presets: [], lastAppliedPresetId: null });
	const created = createValuePreset(emptyValuePresetState(), "Portrait", values());
	assert.equal(created.version, 1);
	assert.equal(created.presets.length, 1);
	assert.equal(created.lastAppliedPresetId, created.presets[0].id);
	assert.deepEqual(created.presets[0].values, values());
});

test("preset collection operations preserve stable identity and independent payloads", () => {
	let state = createValuePreset(emptyValuePresetState(), "Portrait", values());
	const originalId = state.presets[0].id;
	state = replaceValuePreset(state, originalId, values(32));
	assert.equal(state.presets[0].id, originalId);
	assert.equal(state.presets[0].values["aaalice-parameter:host-a:steps"].payload, 32);
	state = renameValuePreset(state, originalId, "Portrait XL");
	state = duplicateValuePreset(state, originalId, "Portrait XL copy");
	assert.equal(state.presets.length, 2);
	assert.notEqual(state.presets[1].id, originalId);
	state.presets[0].values["aaalice-parameter:host-a:tags"].payload.push("edited");
	assert.deepEqual(state.presets[1].values["aaalice-parameter:host-a:tags"].payload, ["cat", "night"]);
	state = markValuePresetApplied(state, originalId);
	state = removeValuePreset(state, originalId);
	assert.equal(state.lastAppliedPresetId, null);
	assert.deepEqual(state.presets.map((preset) => preset.name), ["Portrait XL copy"]);
});

test("preset state rejects ambiguous names and non-serializable values", () => {
	const state = createValuePreset(emptyValuePresetState(), "Portrait", values());
	assert.throws(() => createValuePreset(state, " portrait ", values()), (error) => error instanceof DashboardValuePresetError && error.code === "duplicate-preset-name");
	assert.throws(() => createValuePreset(state, "Broken", { value: { valueType: "number", payload: Number.NaN } }), /finite numbers/);
	assert.throws(() => createValuePreset(state, "Unset", { value: { valueType: "string", payload: undefined } }), /undefined/);
	const circular = {}; circular.self = circular;
	assert.throws(() => createValuePreset(state, "Circular", { value: { valueType: "reference", payload: circular } }), /cycles/);
	assert.throws(() => normalizeValuePresetState({ version: 2, presets: [] }), /Unsupported parameter preset version/);
});

test("preset comparison distinguishes edits, new controls and missing saved bindings", () => {
	const preset = { id: "p", name: "Portrait", values: values() };
	assert.deepEqual(compareValuePreset(preset, values()), { changed: 0, missing: 0, added: 0, modified: false, attention: false });
	const current = values(24);
	current["generic-widget:host-b:cfg"] = { valueType: "number", payload: 7.5 };
	delete current["aaalice-parameter:host-a:tags"];
	assert.deepEqual(compareValuePreset(preset, current), { changed: 1, missing: 1, added: 1, modified: true, attention: true });
});
