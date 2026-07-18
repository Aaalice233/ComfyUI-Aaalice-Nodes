import test from "node:test";
import assert from "node:assert/strict";

import { DashboardModelError, createPage, emptyDashboard, exportDashboardPreset, normalizeDashboard, preflightDashboardPreset } from "../js/lib/dashboard_model.js";
import { compactDashboard, createGroup, deleteGroup, duplicatePage, addItems, moveItems, resizeItems, ungroupItems } from "../js/lib/dashboard_commands.js";
import { firstAvailableLayout, projectScope } from "../js/lib/dashboard_layout.js";
import { recommendedControlRowSpan, recommendedGroupRowSpan } from "../js/lib/dashboard_sizing.js";

const binding = { provider: "generic-widget", hostId: "host-a", controlId: "steps", valueType: "number" };
const modelWithPage = () => { const model = emptyDashboard(); const page = createPage("Generation"); model.pages.push(page); return { model, page }; };

test("Dashboard V2 pages directly own grid control cards", () => {
	const { model, page } = modelWithPage();
	const next = addItems(model, page.id, [{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } }]);
	assert.equal(next.version, 2); assert.equal(next.pages[0].items.length, 2); assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 1, rowSpan: 12 }, { row: 0, column: 1, columnSpan: 1, rowSpan: 12 },
	]);
});

test("Dashboard V1 is rejected instead of migrated", () => {
	assert.throws(() => normalizeDashboard({ version: 1, pages: [] }), (error) => error instanceof DashboardModelError && error.code === "unsupported-version");
});

test("control footprints are stable presentation categories rather than DOM measurements", () => {
	assert.equal(recommendedControlRowSpan({ value: 30, options: { min: 1, max: 100 }, paramType: "slider" }), 12);
	assert.equal(recommendedControlRowSpan({ value: 0, options: { min: 0, max: 100, control_after_generate: "fixed" }, paramType: "seed" }), 7);
	assert.equal(recommendedControlRowSpan({ value: true }), 9);
	assert.equal(recommendedControlRowSpan({ value: ["cat"], paramType: "taglist" }), 16);
	assert.equal(recommendedGroupRowSpan([{ layout: { row: 6, rowSpan: 6 } }]), 19);
});

test("grid projection to one column does not mutate canonical layout", () => {
	const entries = [
		{ id: "a", layout: { row: 0, column: 0, columnSpan: 1, rowSpan: 12 } },
		{ id: "b", layout: { row: 0, column: 1, columnSpan: 1, rowSpan: 7 } },
	];
	const projection = projectScope(entries, 1); assert.deepEqual(projection.get("a"), { row: 0, column: 0, columnSpan: 1, rowSpan: 12 }); assert.deepEqual(projection.get("b"), { row: 12, column: 0, columnSpan: 1, rowSpan: 7 }); assert.equal(entries[1].layout.row, 0);
});

test("fine-grained rows allow a short card below another card beside a tall card", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "Tall", binding, rowSpan: 12 },
		{ label: "Top", binding: { ...binding, controlId: "top" }, rowSpan: 6 },
		{ label: "Bottom", binding: { ...binding, controlId: "bottom" }, rowSpan: 6 },
	]);
	const bottom = next.pages[0].items[2]; next = moveItems(next, [bottom.id], page.id, { row: 6, column: 1 });
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 1, rowSpan: 12 },
		{ row: 0, column: 1, columnSpan: 1, rowSpan: 6 },
		{ row: 6, column: 1, columnSpan: 1, rowSpan: 6 },
	]);
});

test("groups own no duplicate member list and delete preserves controls", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } },
	]);
	const ids = next.pages[0].items.map((item) => item.id); next = createGroup(next, page.id, ids, { name: "Sampling", tone: "blue" });
	const group = next.pages[0].groups[0]; assert.equal(group.name, "Sampling"); assert.equal("itemIds" in group, false); assert.ok(next.pages[0].items.every((item) => item.groupId === group.id));
	next = deleteGroup(next, page.id, group.id); assert.equal(next.pages[0].groups.length, 0); assert.equal(next.pages[0].items.length, 2); assert.ok(next.pages[0].items.every((item) => item.groupId === null));
});

test("ungrouping the last member removes an empty group", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } },
	]);
	next = createGroup(next, page.id, next.pages[0].items.map((item) => item.id)); const groupId = next.pages[0].groups[0].id;
	next = ungroupItems(next, page.id, next.pages[0].items.map((item) => item.id)); assert.equal(next.pages[0].groups.length, 0); assert.ok(next.pages[0].items.every((item) => item.groupId === null)); assert.notEqual(groupId, null);
});

test("moving the only remaining member inside its group keeps the target group", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "C", binding: { ...binding, controlId: "c" } },
	]);
	next = createGroup(next, page.id, next.pages[0].items.slice(0, 2).map((item) => item.id));
	const group = next.pages[0].groups[0]; const members = next.pages[0].items.filter((item) => item.groupId === group.id);
	next = ungroupItems(next, page.id, [members[1].id]);
	next = moveItems(next, [members[0].id], page.id, { groupId: group.id, row: 2, column: 0 });
	assert.equal(next.pages[0].groups[0].id, group.id); assert.equal(next.pages[0].items.find((item) => item.id === members[0].id).groupId, group.id);
});

test("controls move across pages without changing stable binding", () => {
	const first = createPage("First"); const second = createPage("Second"); let model = emptyDashboard(); model.pages.push(first, second);
	model = addItems(model, first.id, [{ label: "Steps", binding }]); const itemId = model.pages[0].items[0].id;
	model = moveItems(model, [itemId], second.id); assert.equal(model.pages[0].items.length, 0); assert.equal(model.pages[1].items[0].id, itemId); assert.deepEqual(model.pages[1].items[0].binding, binding);
});

test("width changes and explicit compaction remain deterministic", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "C", binding: { ...binding, controlId: "c" } },
	]);
	next = resizeItems(next, [next.pages[0].items[0].id], 2); next = compactDashboard(next, page.id);
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 2, rowSpan: 12 }, { row: 12, column: 0, columnSpan: 1, rowSpan: 12 }, { row: 12, column: 1, columnSpan: 1, rowSpan: 12 },
	]); assert.deepEqual(firstAvailableLayout(next.pages[0], { rowSpan: 12 }), { row: 24, column: 0, columnSpan: 1, rowSpan: 12 });
});

test("duplicating a page regenerates layout identities and preserves bindings", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }]);
	next = createGroup(next, page.id, next.pages[0].items.map((item) => item.id)); next = duplicatePage(next, page.id);
	assert.equal(next.pages.length, 2); assert.notEqual(next.pages[0].id, next.pages[1].id); assert.notEqual(next.pages[0].groups[0].id, next.pages[1].groups[0].id); assert.notEqual(next.pages[0].items[0].id, next.pages[1].items[0].id); assert.deepEqual(next.pages[0].items[0].binding, next.pages[1].items[0].binding);
});

test("preset carries current values and rejects old preset versions", () => {
	const { model, page } = modelWithPage(); const dashboard = addItems(model, page.id, [{ label: "Steps", binding }]);
	const preset = exportDashboardPreset(dashboard, () => ({ status: "ok", value: 30 })); assert.equal(Object.values(preset.values)[0].value, 30);
	assert.equal(preflightDashboardPreset(preset, () => ({ status: "missing" })).bindings[0].status, "missing");
	assert.throws(() => preflightDashboardPreset({ ...preset, version: 1 }, () => ({ status: "ok" })), /Unsupported dashboard preset/);
});

test("duplicate ids, missing groups and overlapping cells fail visibly", () => {
	const page = createPage("P"); const base = { version: 2, pages: [{ ...page, items: [], groups: [] }] };
	assert.throws(() => normalizeDashboard({ version: 2, pages: [page, page] }), /Duplicate dashboard identity/);
	assert.throws(() => normalizeDashboard({ ...base, pages: [{ ...page, items: [{ id: "x", kind: "control", binding, groupId: "missing", layout: { row: 0, column: 0, columnSpan: 1, rowSpan: 12 } }] }] }), /missing group/);
	assert.throws(() => normalizeDashboard({ ...base, pages: [{ ...page, items: [
		{ id: "a", kind: "control", binding, groupId: null, layout: { row: 0, column: 0, columnSpan: 1, rowSpan: 12 } },
		{ id: "b", kind: "control", binding: { ...binding, controlId: "b" }, groupId: null, layout: { row: 6, column: 0, columnSpan: 1, rowSpan: 12 } },
	] }] }), /overlap/);
	assert.throws(() => normalizeDashboard({ ...base, pages: [{ ...page, items: [{ id: "x", kind: "control", binding, groupId: null, layout: { row: 0, column: 0, columnSpan: 1 } }] }] }), /row span/);
});
