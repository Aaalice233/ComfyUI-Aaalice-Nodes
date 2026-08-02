import test from "node:test";
import assert from "node:assert/strict";

import { createPage, emptyDashboard } from "../js/lib/dashboard_model.js";
import { addItems } from "../js/lib/dashboard_commands.js";
import { buildSourceSnapshot, inspectSourceGroup, planSourceGroupSync, SOURCE_SYNC_STATUS } from "../js/lib/dashboard_source_sync.js";
import { orderedItems } from "../js/lib/dashboard_layout.js";

const source = { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:sampling" };
const binding = (controlId, valueType = "number") => ({ provider: source.provider, hostId: source.hostId, controlId, valueType });
const descriptor = (controlId, label, valueType = "number") => ({ binding: binding(controlId, valueType), label, sourceGroup: { source, name: "Sampling" }, rowSpan: 12, columnSpan: 6 });
const modelWithSourceGroup = (controls = [descriptor("steps", "Steps"), descriptor("cfg", "CFG")]) => {
	const model = emptyDashboard(); const page = createPage("Generation"); model.pages.push(page);
	return { model: addItems(model, page.id, controls), pageId: page.id };
};

function snapshot(controls) { return buildSourceSnapshot(controls, source, { label: controls[0]?.sourceGroup?.name || "Sampling" }); }

test("source snapshots default new bindings to a two-column footprint", () => {
	const compact = { binding: binding("steps"), label: "Steps", sourceGroup: { source, name: "Sampling" } };
	const defaultSnapshot = snapshot([compact]);
	assert.deepEqual(defaultSnapshot.controls.map(({ columnSpan, rowSpan }) => ({ columnSpan, rowSpan })), [{ columnSpan: 6, rowSpan: 13 }]);
	const explicitSnapshot = snapshot([{ ...compact, columnSpan: 3, rowSpan: 17 }]);
	assert.deepEqual(explicitSnapshot.controls.map(({ columnSpan, rowSpan }) => ({ columnSpan, rowSpan })), [{ columnSpan: 3, rowSpan: 17 }]);
});

test("source group inspection reports synced and changed source descriptors", () => {
	const controls = [descriptor("steps", "Steps"), descriptor("cfg", "CFG")];
	const { model, pageId } = modelWithSourceGroup(controls); const page = model.pages[0]; const group = page.groups[0];
	page.items.find((item) => item.binding.controlId === "steps").linkedBindings = [binding("seed")];
	let result = inspectSourceGroup(group, page.items.filter((item) => item.groupId === group.id), snapshot(controls));
	assert.equal(result.status, SOURCE_SYNC_STATUS.SYNCED);
	const changed = [descriptor("cfg", "Guidance"), descriptor("steps", "Iterations"), descriptor("seed", "Seed")];
	result = inspectSourceGroup(group, page.items.filter((item) => item.groupId === group.id), snapshot(changed));
	assert.equal(result.status, SOURCE_SYNC_STATUS.NEEDS_SYNC);
	assert.equal(result.added, 1); assert.equal(result.renamed, 2); assert.equal(result.reordered, 1);
	assert.equal(pageId, page.id);
});

test("source sync adds, renames, updates types, reorders, and preserves group geometry", () => {
	const initial = [descriptor("steps", "Steps"), descriptor("cfg", "CFG")];
	const { model, pageId } = modelWithSourceGroup(initial); const page = model.pages[0]; const group = page.groups[0];
	group.widthMode = "fixed"; group.layout = { row: 4, column: 2, columnSpan: 9, rowSpan: 1 };
	const steps = page.items.find((item) => item.binding.controlId === "steps"); const cfg = page.items.find((item) => item.binding.controlId === "cfg");
	const linkedBindings = [binding("seed")]; steps.linkedBindings = structuredClone(linkedBindings);
	steps.layout = { row: 0, column: 0, columnSpan: 3, rowSpan: 14 }; cfg.layout = { row: 0, column: 6, columnSpan: 6, rowSpan: 12 };
	const nextSource = [descriptor("cfg", "Guidance", "boolean"), descriptor("steps", "Iterations"), descriptor("seed", "Seed")];
	const result = planSourceGroupSync(model, pageId, group.id, snapshot(nextSource));
	const nextPage = result.next.pages[0]; const nextGroup = nextPage.groups.find((entry) => entry.source.scopeId === source.scopeId);
	assert.deepEqual({ row: nextGroup.layout.row, column: nextGroup.layout.column, columnSpan: nextGroup.layout.columnSpan, widthMode: nextGroup.widthMode }, { row: 4, column: 2, columnSpan: 9, widthMode: "fixed" });
	assert.equal(result.summary.added, 1, "added");
	assert.equal(result.summary.renamed, 2, "renamed");
	assert.equal(result.summary.updated, 1, "updated");
	assert.equal(result.summary.reordered, 1, "reordered");
	const managed = orderedItems(nextPage.items.filter((item) => item.groupId === nextGroup.id && item.groupSource));
	assert.deepEqual(managed.map((item) => item.binding.controlId), ["cfg", "steps", "seed"]);
	assert.equal(nextPage.items.find((item) => item.binding.controlId === "steps").layout.columnSpan, 3);
	assert.equal(nextPage.items.find((item) => item.binding.controlId === "steps").layout.rowSpan, 14);
	assert.deepEqual(nextPage.items.find((item) => item.binding.controlId === "steps").linkedBindings, linkedBindings);
	assert.equal(nextPage.items.find((item) => item.binding.controlId === "cfg").label, "Guidance");
	assert.equal(nextPage.items.find((item) => item.binding.controlId === "cfg").binding.valueType, "boolean");
});

test("source sync directly removes managed deleted parameters but preserves manual members and overrides", () => {
	const initial = [descriptor("steps", "Steps"), descriptor("cfg", "CFG")];
	const { model, pageId } = modelWithSourceGroup(initial); const page = model.pages[0]; const group = page.groups[0];
	const manual = { binding: binding("manual"), label: "Manual", groupId: group.id, layout: { row: 20, column: 0, columnSpan: 6, rowSpan: 12 } };
	page.items.push({ id: "manual-item", kind: "control", ...manual });
	const steps = page.items.find((item) => item.binding.controlId === "steps"); steps.labelOverride = "Pinned steps"; steps.label = "Pinned steps";
	const result = planSourceGroupSync(model, pageId, group.id, snapshot([descriptor("steps", "Iterations")]));
	const nextPage = result.next.pages[0];
	assert.equal(nextPage.items.some((item) => item.binding.controlId === "cfg"), false);
	assert.equal(nextPage.items.some((item) => item.binding.controlId === "manual"), true);
	assert.equal(nextPage.items.find((item) => item.binding.controlId === "steps").label, "Pinned steps");
	assert.equal(result.summary.removed, 1); assert.equal(result.summary.preservedManual, 1);
});

test("source sync preserves linked managed cards as manual when the primary source is deleted", () => {
	const { model, pageId } = modelWithSourceGroup([descriptor("steps", "Steps")]); const page = model.pages[0]; const group = page.groups[0];
	const item = page.items[0]; const linkedBindings = [{ provider: "generic-widget", hostId: "node-b", controlId: "strength", valueType: "number" }];
	item.linkedBindings = structuredClone(linkedBindings);
	item.labelOverride = "Pinned steps"; item.label = "Pinned steps";
	item.layout = { row: 5, column: 0, columnSpan: 6, rowSpan: 15 };
	const expectedBinding = structuredClone(item.binding); const expectedLayout = structuredClone(item.layout);
	const emptySnapshot = snapshot([]);
	const inspection = inspectSourceGroup(group, [item], emptySnapshot);
	assert.equal(inspection.status, SOURCE_SYNC_STATUS.NEEDS_SYNC);
	assert.equal(inspection.removed, 0); assert.equal(inspection.preservedManual, 1);

	const result = planSourceGroupSync(model, pageId, group.id, emptySnapshot);
	const preserved = result.next.pages[0].items.find((entry) => entry.id === item.id);
	assert.ok(preserved);
	assert.equal(preserved.groupSource, undefined);
	assert.deepEqual(preserved.binding, expectedBinding);
	assert.deepEqual(preserved.linkedBindings, linkedBindings);
	assert.deepEqual(preserved.layout, expectedLayout);
	assert.equal(preserved.label, "Pinned steps"); assert.equal(preserved.labelOverride, "Pinned steps");
	assert.equal(result.summary.removed, 0); assert.equal(result.summary.preservedManual, 1);
	assert.ok(item.groupSource, "the input model remains untouched");
});

test("source type drift detaches linked cards without losing targets or returning a partial mutation", () => {
	const { model, pageId } = modelWithSourceGroup([descriptor("steps", "Steps")]); const page = model.pages[0]; const group = page.groups[0];
	const item = page.items[0]; const linkedBindings = [{ provider: "generic-widget", hostId: "node-b", controlId: "strength", valueType: "number" }];
	item.linkedBindings = structuredClone(linkedBindings);
	item.layout = { row: 3, column: 0, columnSpan: 6, rowSpan: 16 };
	const before = structuredClone(model); const changed = snapshot([descriptor("steps", "Iterations", "boolean")]);
	const inspection = inspectSourceGroup(group, [item], changed);
	assert.equal(inspection.status, SOURCE_SYNC_STATUS.NEEDS_SYNC);
	assert.equal(inspection.updated, 0); assert.equal(inspection.preservedManual, 1);

	const result = planSourceGroupSync(model, pageId, group.id, changed);
	const preserved = result.next.pages[0].items.find((entry) => entry.id === item.id);
	assert.deepEqual(model, before, "planning is immutable");
	assert.equal(preserved.groupSource, undefined);
	assert.deepEqual(preserved.binding, before.pages[0].items[0].binding);
	assert.deepEqual(preserved.linkedBindings, linkedBindings);
	assert.deepEqual(preserved.layout, before.pages[0].items[0].layout);
	assert.equal(preserved.label, "Steps");
	assert.equal(result.summary.removed, 0); assert.equal(result.summary.updated, 0); assert.equal(result.summary.preservedManual, 1);
	assert.equal(inspectSourceGroup(result.next.pages[0].groups[0], [preserved], changed).status, SOURCE_SYNC_STATUS.SYNCED);
	const later = planSourceGroupSync(result.next, pageId, group.id, snapshot([descriptor("steps", "Iterations", "boolean"), descriptor("cfg", "CFG")]));
	assert.equal(later.next.pages[0].items.filter((entry) => entry.binding.controlId === "steps").length, 1);
	assert.equal(later.next.pages[0].items.filter((entry) => entry.binding.controlId === "cfg").length, 1);
});

test("legacy source groups only claim exact current controls and do not delete unknown members", () => {
	const initial = [descriptor("steps", "Steps")];
	const { model, pageId } = modelWithSourceGroup(initial); const page = model.pages[0]; const group = page.groups[0];
	const legacy = page.items[0]; delete legacy.groupSource;
	const result = planSourceGroupSync(model, pageId, group.id, snapshot([descriptor("steps", "Iterations")]));
	assert.equal(result.next.pages[0].items[0].label, "Iterations");
	const unknown = { id: "unknown-item", kind: "control", binding: binding("deleted"), label: "Old", groupId: group.id, layout: { row: 12, column: 0, columnSpan: 6, rowSpan: 12 } };
	const withUnknown = structuredClone(result.next); withUnknown.pages[0].items.push(unknown);
	const second = planSourceGroupSync(withUnknown, pageId, group.id, snapshot([descriptor("steps", "Iterations")]));
	assert.equal(second.next.pages[0].items.some((item) => item.id === unknown.id), true);
});

test("source synchronization is scoped to the requested page", () => {
	const model = emptyDashboard(); const first = createPage("First"); const second = createPage("Second"); model.pages.push(first, second);
	let next = addItems(model, first.id, [descriptor("steps", "Steps"), descriptor("cfg", "CFG")]);
	next = addItems(next, second.id, [descriptor("steps", "Steps"), descriptor("cfg", "CFG")]);
	const firstGroup = next.pages[0].groups[0];
	const result = planSourceGroupSync(next, first.id, firstGroup.id, snapshot([descriptor("steps", "Iterations"), descriptor("cfg", "Guidance")]));
	assert.equal(result.next.pages[0].items.find((item) => item.binding.controlId === "steps").label, "Iterations");
	assert.equal(result.next.pages[1].items.find((item) => item.binding.controlId === "steps").label, "Steps");
});

test("invalid or missing source snapshots never produce a partial plan", () => {
	const { model, pageId } = modelWithSourceGroup(); const group = model.pages[0].groups[0];
	const missing = buildSourceSnapshot(null, source, { status: SOURCE_SYNC_STATUS.MISSING_SOURCE, reason: "host missing" });
	assert.equal(inspectSourceGroup(group, model.pages[0].items, missing).status, SOURCE_SYNC_STATUS.MISSING_SOURCE);
	assert.throws(() => planSourceGroupSync(model, pageId, group.id, missing), /host missing/);
	const duplicate = buildSourceSnapshot([descriptor("steps", "Steps"), descriptor("steps", "Duplicate")], source, { label: "Sampling" });
	assert.equal(duplicate.status, SOURCE_SYNC_STATUS.ERROR);
	const mismatched = buildSourceSnapshot([{ ...descriptor("steps", "Steps"), binding: { ...binding("steps"), hostId: "other-panel" } }], source, { label: "Sampling" });
	assert.equal(mismatched.status, SOURCE_SYNC_STATUS.ERROR);
	const duplicateManaged = structuredClone(model);
	duplicateManaged.pages[0].items.push({ ...structuredClone(duplicateManaged.pages[0].items[0]), id: "duplicate-managed" });
	assert.equal(inspectSourceGroup(duplicateManaged.pages[0].groups[0], duplicateManaged.pages[0].items, snapshot([descriptor("steps", "Steps"), descriptor("cfg", "CFG")])).status, SOURCE_SYNC_STATUS.ERROR);
});
