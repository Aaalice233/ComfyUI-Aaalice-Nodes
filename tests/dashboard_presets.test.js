import test from "node:test";
import assert from "node:assert/strict";

import {
	DashboardPresetError,
	compareDashboardPreset,
	createDashboardPreset,
	duplicateDashboardPreset,
	emptyDashboardPresetState,
	normalizeDashboardPresetState,
	parseDashboardPreset,
	removeDashboardPreset,
	renameDashboardPreset,
	replaceDashboardPreset,
	serializeDashboardPreset,
	setDashboardPresetBaseline,
} from "../js/lib/dashboard_presets.js";
import { bindingKey, legacyBindingKey } from "../js/lib/dashboard_model.js";

const binding = { provider: "aaalice-parameter", hostId: "host-a", controlId: "steps", valueType: "number" };
const KEY = bindingKey(binding);
const layout = (column = 0) => ({
	version: 4,
	pages: [{ id: "page-a", name: "Main", gridColumns: 12, tone: null, groups: [], items: [{ id: "item-a", kind: "control", binding, label: "Steps", groupId: null, layout: { row: 0, column, columnSpan: 6, rowSpan: 13 } }] }],
});
const values = (steps = 20) => ({ [KEY]: { valueType: "number", payload: steps } });
const snapshot = (steps = 20, column = 0) => ({ dashboard: layout(column), values: values(steps) });

test("sidebar presets own complete layout and value snapshots", () => {
	assert.deepEqual(emptyDashboardPresetState(), { version: 1, presets: [], baselinePresetId: null });
	const created = createDashboardPreset(emptyDashboardPresetState(), "Portrait", snapshot());
	assert.equal(created.presets.length, 1);
	assert.equal(created.baselinePresetId, created.presets[0].id);
	assert.deepEqual(created.presets[0].dashboard, layout());
	assert.deepEqual(created.presets[0].values, values());
});

test("preset management preserves identity and does not apply duplicates", () => {
	let state = createDashboardPreset(emptyDashboardPresetState(), "Portrait", snapshot());
	const originalId = state.presets[0].id;
	state = replaceDashboardPreset(state, originalId, snapshot(32, 6));
	assert.equal(state.presets[0].id, originalId);
	assert.equal(state.presets[0].dashboard.pages[0].items[0].layout.column, 6);
	state = renameDashboardPreset(state, originalId, "Portrait XL");
	state = duplicateDashboardPreset(state, originalId, "Portrait XL copy");
	assert.equal(state.presets.length, 2);
	assert.equal(state.baselinePresetId, originalId);
	state.presets[0].values[KEY].payload = 99;
	assert.equal(state.presets[1].values[KEY].payload, 32);
	state = removeDashboardPreset(state, originalId);
	assert.equal(state.baselinePresetId, null);
	assert.deepEqual(state.presets.map((preset) => preset.name), ["Portrait XL copy"]);
});

test("preset state migrates embedded Dashboard V2 snapshots to V4", () => {
	const state = normalizeDashboardPresetState({
		version: 1,
		baselinePresetId: "preset-a",
		presets: [{
			id: "preset-a", name: "Legacy", values: {},
			dashboard: { version: 2, pages: [{ id: "page-a", name: "Main", groups: [], items: [{ id: "item-a", kind: "control", binding, label: "Steps", groupId: null, layout: { row: 0, column: 1, columnSpan: 1, rowSpan: 14 } }] }] },
		}],
	});
	assert.equal(state.presets[0].dashboard.version, 4);
	assert.deepEqual(state.presets[0].dashboard.pages[0].items[0].layout, { row: 0, column: 6, columnSpan: 6, rowSpan: 14 });
	assert.equal(state.baselinePresetId, "preset-a");
});

test("legacy colon-delimited preset keys migrate to collision-free tuple keys", () => {
	const state = normalizeDashboardPresetState({
		version: 1,
		baselinePresetId: "preset-a",
		presets: [{ id: "preset-a", name: "Legacy keys", dashboard: layout(), values: { [legacyBindingKey(binding)]: { valueType: "number", payload: 27 } } }],
	});
	assert.equal(state.presets[0].values[KEY].payload, 27);
	assert.equal(Object.prototype.hasOwnProperty.call(state.presets[0].values, legacyBindingKey(binding)), false);
});

test("preset state rejects old value-only state and invalid payloads", () => {
	const state = createDashboardPreset(emptyDashboardPresetState(), "Portrait", snapshot());
	assert.throws(() => createDashboardPreset(state, " portrait ", snapshot()), (error) => error instanceof DashboardPresetError && error.code === "duplicate-preset-name");
	assert.throws(() => createDashboardPreset(state, "Broken", { dashboard: layout(), values: { value: { valueType: "number", payload: Number.NaN } } }), /finite numbers/);
	const unsafePayload = Object.create(null); Object.defineProperty(unsafePayload, "__proto__", { value: { polluted: true }, enumerable: true });
	assert.throws(() => createDashboardPreset(state, "Unsafe", { dashboard: layout(), values: { value: { valueType: "object", payload: unsafePayload } } }), /Unsafe preset payload key/);
	assert.throws(() => normalizeDashboardPresetState({ version: 0, presets: [], lastAppliedPresetId: null }), /Unsupported sidebar preset version/);
	assert.throws(() => setDashboardPresetBaseline(state, "missing"), /missing/);
});

test("comparison detects layout and value changes but ignores transient unavailability", () => {
	const preset = { id: "p", name: "Portrait", ...snapshot() };
	assert.deepEqual(compareDashboardPreset(preset, snapshot()), { layoutChanges: 0, valueChanges: 0, changed: 0, missing: 0, added: 0, modified: false, attention: false });
	const changed = compareDashboardPreset(preset, { ...snapshot(24, 6), bindings: [{ key: KEY, status: "ok" }] });
	assert.equal(changed.layoutChanges, 1); assert.equal(changed.valueChanges, 1); assert.equal(changed.modified, true);
	const unavailable = compareDashboardPreset(preset, { dashboard: layout(), values: {}, bindings: [{ key: KEY, status: "unavailable" }] });
	assert.equal(unavailable.modified, false); assert.equal(unavailable.attention, false);
	const missing = compareDashboardPreset(preset, { dashboard: layout(), values: {}, bindings: [{ key: KEY, status: "missing" }] });
	assert.equal(missing.modified, true); assert.equal(missing.attention, true);
});

test("legacy scalar seed presets compare against the current structured seed state", () => {
	const key = KEY;
	const preset = { id: "p", name: "Legacy seed", dashboard: layout(), values: { [key]: { valueType: "number", payload: 20 } } };
	const same = compareDashboardPreset(preset, { dashboard: layout(), values: { [key]: { valueType: "number", payload: { value: 20, control_after_generate: "fixed" } } } });
	assert.equal(same.modified, false);
	const changed = compareDashboardPreset(preset, { dashboard: layout(), values: { [key]: { valueType: "number", payload: { value: 21, control_after_generate: "fixed" } } } });
	assert.equal(changed.modified, true);
});

test("portable backups use the same normalized snapshot contract", () => {
	const serialized = serializeDashboardPreset(snapshot());
	assert.equal(serialized.format, "aaalice-sidebar-preset");
	assert.deepEqual(parseDashboardPreset(serialized), snapshot());
	assert.throws(() => parseDashboardPreset({ ...serialized, version: 99 }), /Unsupported sidebar preset backup/);
});

test("preset state survives workflow JSON serialization unchanged", () => {
	// 预设随工作流 extra 分发（含 Workflow Hub 打包/安装），JSON 往返后必须逐字节等价
	const state = createDashboardPreset(emptyDashboardPresetState(), "Portrait", snapshot());
	const roundTripped = normalizeDashboardPresetState(JSON.parse(JSON.stringify(state)));
	assert.deepEqual(roundTripped, state);
	assert.equal(roundTripped.baselinePresetId, state.presets[0].id);
});
