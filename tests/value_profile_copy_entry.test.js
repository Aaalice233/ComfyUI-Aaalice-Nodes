import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bindingKey } from "../js/lib/dashboard_model.js";
import { createDashboardPreset, duplicateDashboardPreset } from "../js/lib/dashboard_presets.js";
import { applyDashboardSnapshotPlan } from "../js/lib/dashboard_preset_runtime.js";
import { planValueProfileCopy } from "../js/lib/value_profile_application.js";

// Execute the production entry with injected ComfyUI boundaries, not a reconstructed write loop.
const source = readFileSync(new URL("../js/workspace/dashboard_presets.js", import.meta.url), "utf8");
const entry = source.slice(source.indexOf("export async function duplicateCurrentDashboardPreset"), source.indexOf("export function reorderDashboardPreset")).replace("export ", "");
async function fixture() {
	const target = { provider: "generic-widget", hostId: "new", controlId: "steps", valueType: "number" };
	const old = { ...target, hostId: "old" };
	const dashboard = { version: 4, pages: [{ id: "page", name: "Page", gridColumns: 12, groups: [], items: [{ id: "card", kind: "control", label: "Steps", binding: target, layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 } }] }] };
	const base = { id: "base", name: "Base", dashboard, values: { [bindingKey(target)]: { valueType: "number", payload: 20 } } };
	const graph = { extra: { dashboard, presets: { version: 1, presets: [base], baselinePresetId: "base" } }, beforeChange() {}, afterChange() {}, setDirtyCanvas() {} };
	let value = 20; let captured; let fail = false;
	const notices = []; const app = { graph, extensionManager: { toast: { add: (notice) => notices.push(notice) } } };
	const resolve = () => ({ status: "ok", node: { title: "Sampler" }, value, readPresetValue: () => value, validatePresetValue: () => true,
		applyPresetValue: (saved) => { value = saved.payload; if (fail && value === 40) throw Error("codec failed"); } });
	const runtime = { controlTitle: (item) => item.label, dashboardExtraKey: "dashboard", presetsExtraKey: "presets", getActivePageId: () => "page", setActivePageId() {} };
	const dependencies = { app, runtime, resolve, t: (_, fallback) => fallback, dashboardPresetState: () => graph.extra.presets,
		openDuplicatePresetDialog: (options) => { captured = options; }, planValueProfileCopy, createDashboardPreset, duplicateDashboardPreset, applyDashboardSnapshotPlan,
		dashboard: () => graph.extra.dashboard, normalizeDashboard: (next) => next, updateDashboardPresetState: (update) => { graph.extra.presets = update(); },
		notifyDashboardPresetSuccess() {}, scheduleStructuralRender() {}, restoreGraphExtra: (g, key, previous) => { g.extra[key] = previous; } };
	const run = Function(...Object.keys(dependencies), `${entry}; return duplicateCurrentDashboardPreset;`)(...Object.values(dependencies));
	await run("base");
	return { app, graph, base, notices, options: captured, value: () => value, fail: () => { fail = true; }, rules: [{ key: bindingKey(old), valueType: "number", payload: 40, label: "Steps", hostLabel: "Sampler" }] };
}

test("actual copy entry applies recovered rules, switches baseline and reports skipped rules", async () => {
	const f = await fixture(); const before = structuredClone(f.base);
	const removed = { ...f.rules[0], key: JSON.stringify(["generic-widget", "gone", "removed", null]), label: "Removed" };
	const result = await f.options.onCommitSuccess({ mode: "with-profile", name: "Copy", rules: [...f.rules, removed] });
	assert.equal(f.value(), 40); assert.equal(result.applied, 1); assert.equal(result.skipped, 1);
	assert.equal(f.graph.extra.presets.presets.length, 2);
	assert.equal(f.graph.extra.presets.baselinePresetId, f.graph.extra.presets.presets[1].id);
	assert.equal(f.notices[0].severity, "warn");
	assert.deepEqual(f.base, before);
});

test("actual copy entry does not create a copy for zero matches", async () => {
	const f = await fixture(); const result = await f.options.onCommitSuccess({ mode: "with-profile", name: "Copy", rules: [] });
	assert.equal(result.applied, 0); assert.equal(f.graph.extra.presets.presets.length, 1); assert.equal(f.notices.length, 0);
});

test("duplicate names and changed workflows reject before writing", async () => {
	const f = await fixture();
	await assert.rejects(f.options.onCommitSuccess({ mode: "with-profile", name: "Base", rules: f.rules }), /Duplicate preset name/);
	assert.equal(f.value(), 20); assert.equal(f.graph.extra.presets.presets.length, 1);
	f.app.graph = { extra: {} };
	await assert.rejects(f.options.onCommitSuccess({ mode: "with-profile", name: "Copy", rules: f.rules }), /workflow changed/);
});

test("production copy entry rolls back a partially mutated codec without committing the new preset", async () => {
	const f = await fixture(); f.fail();
	await assert.rejects(f.options.onCommitSuccess({ mode: "with-profile", name: "Copy", rules: f.rules }), /codec failed/);
	assert.equal(f.value(), 20); assert.equal(f.graph.extra.presets.presets.length, 1); assert.equal(f.notices.length, 0);
});
