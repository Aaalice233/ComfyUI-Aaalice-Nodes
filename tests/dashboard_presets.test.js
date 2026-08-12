import test from "node:test";
import assert from "node:assert/strict";

import {
	DashboardPresetError,
	availableDashboardPresetName,
	compareDashboardPreset,
	createDashboardPreset,
	dashboardPresetFileName,
	dashboardPresetNameFromFile,
	dashboardPresetStateNeedsMigration,
	duplicateDashboardPreset,
	emptyDashboardPresetState,
	normalizeDashboardPresetState,
	parseDashboardPreset,
	parseDashboardPresetForImport,
	removeDashboardPreset,
	renameDashboardPreset,
	replaceDashboardPreset,
	serializeDashboardPreset,
	setDashboardPresetBaseline,
} from "../js/lib/dashboard_presets.js";
import { bindingKey, legacyBindingKey } from "../js/lib/dashboard_model.js";

const binding = { provider: "test-source", hostId: "host-a", controlId: "steps", valueType: "number" };
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

test("creating an imported preset selects the new copy without mutating the base", () => {
	let state = createDashboardPreset(emptyDashboardPresetState(), "Base", snapshot());
	const baselineId = state.baselinePresetId; const baseBefore = structuredClone(state.presets[0]);
	state = createDashboardPreset(state, "Imported values", snapshot(32, 6));
	assert.equal(state.presets.length, 2);
	assert.notEqual(state.baselinePresetId, baselineId);
	assert.deepEqual(state.presets[0], baseBefore);
	assert.equal(state.presets[1].id, state.baselinePresetId);
	assert.equal(state.presets[1].name, "Imported values");
	assert.equal(state.presets[1].values[KEY].payload, 32);
	assert.equal(state.presets[1].dashboard.pages[0].items[0].layout.column, 6);
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
	assert.equal(state.baselinePresetId, state.presets[0].id);
	assert.deepEqual(state.presets.map((preset) => preset.name), ["Portrait XL copy"]);
});

test("deleting the active preset selects the next preset, then the previous one at the end", () => {
	let state = emptyDashboardPresetState();
	state = createDashboardPreset(state, "One", snapshot());
	const firstId = state.presets[0].id;
	state = createDashboardPreset(state, "Two", snapshot(21));
	const secondId = state.presets[1].id;
	state = createDashboardPreset(state, "Three", snapshot(22));
	const thirdId = state.presets[2].id;
	state = setDashboardPresetBaseline(state, secondId);
	state = removeDashboardPreset(state, secondId);
	assert.equal(state.baselinePresetId, thirdId);
	state = removeDashboardPreset(state, thirdId);
	assert.equal(state.baselinePresetId, firstId);
	state = removeDashboardPreset(state, firstId);
	assert.equal(state.baselinePresetId, null);
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

test("QuickGroupManager preset values migrate to shared configuration semantics", () => {
	const managerKey = "quick-group-manager";
	const legacyGroups = [{ id: "managed", nodes: [{ id: "101", mode: 2 }] }];
	const groups = [{ id: "managed", nodes: [{ id: "101", enabled: false }] }];
	const legacyPreset = {
		id: "preset-a",
		name: "Legacy manager",
		dashboard: layout(),
		values: { [managerKey]: { valueType: "quick-group-manager", payload: { version: 1, state: { offMode: "bypass", rules: { managed: { disable: { other: "disable" } } } }, groups: legacyGroups } } },
	};
	const legacyState = { version: 1, baselinePresetId: "preset-a", presets: [legacyPreset] };
	const state = normalizeDashboardPresetState(legacyState);
	assert.equal(dashboardPresetStateNeedsMigration(legacyState, state), true);
	assert.equal(dashboardPresetStateNeedsMigration(state, normalizeDashboardPresetState(state)), false);
	assert.deepEqual(state.presets[0].values[managerKey].payload, { version: 2, groups });
	const current = { dashboard: layout(), values: { [managerKey]: { valueType: "quick-group-manager", payload: { version: 2, groups } } } };
	assert.equal(compareDashboardPreset(legacyPreset, current).modified, false);
	assert.deepEqual(parseDashboardPreset(serializeDashboardPreset(legacyPreset)).values[managerKey].payload, { version: 2, groups });
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

test("import parsing isolates invalid legacy values instead of rejecting the complete layout", () => {
	const serialized = serializeDashboardPreset(snapshot());
	serialized.values.bad = { valueType: "number" };
	assert.throws(() => parseDashboardPreset(serialized), /Invalid preset value/);
	const parsed = parseDashboardPresetForImport(serialized);
	assert.deepEqual(parsed.snapshot, snapshot());
	assert.equal(parsed.issues.length, 1);
	assert.deepEqual({ key: parsed.issues[0].key, status: parsed.issues[0].status }, { key: "bad", status: "invalid" });
	assert.equal(parsed.issues[0].reason, "invalid-preset-value");
	assert.throws(() => parseDashboardPresetForImport({ ...serialized, dashboard: { version: 99, pages: [] } }), /Unsupported dashboard version/);
});

test("preset file stems and conflict names share one portable naming contract", () => {
	assert.equal(dashboardPresetFileName("Updated layout"), "Updated layout.json");
	assert.equal(dashboardPresetNameFromFile("legacy-values.json", "Embedded name"), "legacy-values");
	assert.equal(dashboardPresetNameFromFile("legacy-values.JSON", "Embedded name"), "legacy-values");
	assert.equal(dashboardPresetNameFromFile("", "Embedded name"), "Embedded name");
	let state = createDashboardPreset(emptyDashboardPresetState(), "Legacy values", snapshot());
	state = createDashboardPreset(state, "Legacy values 2", snapshot());
	assert.equal(availableDashboardPresetName("legacy values", state), "legacy values 3");
	assert.equal(availableDashboardPresetName("Fresh values", state), "Fresh values");
});

test("numeric card range overrides round-trip through complete sidebar presets", () => {
	const source = snapshot(); source.dashboard.pages[0].items[0].numericRange = { min: 1, max: 100, step: 2 };
	const state = createDashboardPreset(emptyDashboardPresetState(), "Custom slider", source);
	assert.deepEqual(state.presets[0].dashboard.pages[0].items[0].numericRange, { min: 1, max: 100, step: 2 });
	const parsed = parseDashboardPreset(serializeDashboardPreset(state.presets[0]));
	assert.deepEqual(parsed.dashboard.pages[0].items[0].numericRange, { min: 1, max: 100, step: 2 });
});

test("component Markdown notes round-trip through complete sidebar presets", () => {
	const source = snapshot(); source.dashboard.pages[0].items[0].note = "## Steps\n\nKeep this below **40**.";
	const state = createDashboardPreset(emptyDashboardPresetState(), "Documented slider", source);
	assert.equal(state.presets[0].dashboard.pages[0].items[0].note, source.dashboard.pages[0].items[0].note);
	const parsed = parseDashboardPreset(serializeDashboardPreset(state.presets[0]));
	assert.equal(parsed.dashboard.pages[0].items[0].note, source.dashboard.pages[0].items[0].note);
});

test("preset state survives workflow JSON serialization unchanged", () => {
	// 预设随工作流 extra 分发（含 Workflow Hub 打包/安装），JSON 往返后必须逐字节等价
	const state = createDashboardPreset(emptyDashboardPresetState(), "Portrait", snapshot());
	const roundTripped = normalizeDashboardPresetState(JSON.parse(JSON.stringify(state)));
	assert.deepEqual(roundTripped, state);
	assert.equal(roundTripped.baselinePresetId, state.presets[0].id);
});
