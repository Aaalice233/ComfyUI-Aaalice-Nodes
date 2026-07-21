import test from "node:test";
import assert from "node:assert/strict";

import { DashboardModelError, bindingKey, createPage, emptyDashboard, normalizeDashboard } from "../js/lib/dashboard_model.js";
import { compactDashboard, createGroup, deleteGroup, duplicatePage, addItems, moveItems, resizeItem, resizeItems, ungroupItems } from "../js/lib/dashboard_commands.js";
import { firstAvailableLayout, projectScope } from "../js/lib/dashboard_layout.js";
import { dashboardCardHeight, recommendedControlRowSpan, recommendedGroupRowSpan } from "../js/lib/dashboard_sizing.js";

const binding = { provider: "generic-widget", hostId: "host-a", controlId: "steps", valueType: "number" };
const modelWithPage = () => { const model = emptyDashboard(); const page = createPage("Generation"); model.pages.push(page); return { model, page }; };

test("Dashboard V2 pages directly own grid control cards", () => {
	const { model, page } = modelWithPage();
	const next = addItems(model, page.id, [{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } }]);
	assert.equal(next.version, 2); assert.equal(next.pages[0].gridColumns, 12); assert.equal(next.pages[0].items.length, 2); assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 12 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 12 },
	]);
});

test("specialized controls can request an initial full-width footprint", () => {
	const { model, page } = modelWithPage();
	const next = addItems(model, page.id, [{ label: "Compare Images", binding: { ...binding, controlId: "compare_view", valueType: "image-compare-view" }, columnSpan: 12, rowSpan: 36 }]);
	assert.deepEqual(next.pages[0].items[0].layout, { row: 0, column: 0, columnSpan: 12, rowSpan: 36 });
});

test("legacy two-column pages normalize once into the twelve-column grid", () => {
	const legacy = { version: 2, pages: [{ id: "page", name: "Legacy", items: [
		{ id: "left", kind: "control", binding, groupId: null, layout: { row: 0, column: 0, columnSpan: 1, rowSpan: 12 } },
		{ id: "right", kind: "control", binding: { ...binding, controlId: "cfg" }, groupId: null, layout: { row: 0, column: 1, columnSpan: 1, rowSpan: 12 } },
	], groups: [] }] };
	const normalized = normalizeDashboard(legacy);
	assert.equal(normalized.pages[0].gridColumns, 12);
	assert.deepEqual(normalized.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 12 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 12 },
	]);
});

test("Dashboard V1 is rejected instead of migrated", () => {
	assert.throws(() => normalizeDashboard({ version: 1, pages: [] }), (error) => error instanceof DashboardModelError && error.code === "unsupported-version");
});

test("control footprints are stable presentation categories rather than DOM measurements", () => {
	assert.equal(recommendedControlRowSpan({ value: 30, options: { min: 1, max: 100 }, paramType: "slider" }), 12);
	assert.equal(recommendedControlRowSpan({ value: 0, options: { min: 0, max: 100, control_after_generate: "fixed" }, paramType: "seed" }), 7);
	assert.equal(recommendedControlRowSpan({ value: true }), 9);
	assert.equal(recommendedControlRowSpan({ value: ["cat"], paramType: "taglist" }), 12);
	assert.equal(recommendedGroupRowSpan([{ layout: { row: 6, rowSpan: 6 } }]), 19);
	assert.equal(dashboardCardHeight(5), 24);
	assert.equal(dashboardCardHeight(7), 36);
	assert.equal(dashboardCardHeight(9), 48);
	assert.equal(dashboardCardHeight(12), 66);
});

test("third-party adapter identity survives normalization and preset keys", () => {
	const adapted = { ...binding, adapterId: "vendor-controls" };
	const { model, page } = modelWithPage();
	const next = addItems(model, page.id, [{ label: "Steps", binding: adapted }]);
	assert.equal(next.pages[0].items[0].binding.adapterId, "vendor-controls");
	assert.equal(bindingKey(adapted), "generic-widget:host-a:steps:vendor-controls");
	assert.notEqual(bindingKey(adapted), bindingKey(binding));
});

test("grid projection to one column does not mutate canonical layout", () => {
	const entries = [
		{ id: "a", layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 12 } },
		{ id: "b", layout: { row: 0, column: 6, columnSpan: 6, rowSpan: 7 } },
	];
	const projection = projectScope(entries, 1); assert.deepEqual(projection.get("a"), { row: 0, column: 0, columnSpan: 1, rowSpan: 12 }); assert.deepEqual(projection.get("b"), { row: 12, column: 0, columnSpan: 1, rowSpan: 7 }); assert.equal(entries[1].layout.row, 0);
});

test("fine-grained rows allow a short card below another card beside a tall card", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "Tall", binding, rowSpan: 12 },
		{ label: "Top", binding: { ...binding, controlId: "top" }, rowSpan: 6 },
		{ label: "Bottom", binding: { ...binding, controlId: "bottom" }, rowSpan: 6 },
	]);
	const bottom = next.pages[0].items[2]; next = moveItems(next, [bottom.id], page.id, { row: 6, column: 6 });
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 12 },
		{ row: 0, column: 6, columnSpan: 6, rowSpan: 6 },
		{ row: 6, column: 6, columnSpan: 6, rowSpan: 6 },
	]);
});

test("overlap moves only the operated card and preserves the existing layout", () => {
	const page = createPage("P"); const makeItem = (id, row, column, controlId = id) => ({
		id, kind: "control", label: id, binding: { ...binding, controlId }, groupId: null,
		layout: { row, column, columnSpan: 6, rowSpan: 6 }, compact: false,
	});
	let model = normalizeDashboard({ version: 2, pages: [{ ...page, items: [
		makeItem("moving", 0, 0), makeItem("collision-a", 12, 0), makeItem("collision-b", 18, 0),
		makeItem("neighbor", 12, 6), makeItem("unrelated-gap", 30, 6),
	], groups: [] }] });
	model = moveItems(model, ["moving"], page.id, { row: 12, column: 0 });
	const layouts = Object.fromEntries(model.pages[0].items.map((item) => [item.id, item.layout]));
	assert.deepEqual(layouts.moving, { row: 24, column: 0, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["collision-a"], { row: 12, column: 0, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["collision-b"], { row: 18, column: 0, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts.neighbor, { row: 12, column: 6, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["unrelated-gap"], { row: 30, column: 6, columnSpan: 6, rowSpan: 6 });
});

test("multi-card movement preserves internal offsets without displacing existing cards", () => {
	const page = createPage("P"); const makeItem = (id, row, column) => ({
		id, kind: "control", label: id, binding: { ...binding, controlId: id }, groupId: null,
		layout: { row, column, columnSpan: 6, rowSpan: 6 }, compact: false,
	});
	let model = normalizeDashboard({ version: 2, pages: [{ ...page, items: [
		makeItem("selected-left", 0, 0), makeItem("selected-right", 0, 6),
		makeItem("collision-left", 12, 0), makeItem("collision-right", 12, 6), makeItem("unrelated", 30, 6),
	], groups: [] }] });
	model = moveItems(model, ["selected-left", "selected-right"], page.id, { row: 12, column: 0 });
	const layouts = Object.fromEntries(model.pages[0].items.map((item) => [item.id, item.layout]));
	assert.deepEqual(layouts["selected-left"], { row: 18, column: 0, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["selected-right"], { row: 18, column: 6, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["collision-left"], { row: 12, column: 0, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["collision-right"], { row: 12, column: 6, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts.unrelated, { row: 30, column: 6, columnSpan: 6, rowSpan: 6 });
});

test("groups own no duplicate member list and delete preserves controls", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } },
	]);
	const ids = next.pages[0].items.map((item) => item.id); next = createGroup(next, page.id, ids, { name: "Sampling", tone: "blue" });
	const group = next.pages[0].groups[0]; assert.equal(group.name, "Sampling"); assert.equal("itemIds" in group, false); assert.ok(next.pages[0].items.every((item) => item.groupId === group.id));
	next = deleteGroup(next, page.id, group.id); assert.equal(next.pages[0].groups.length, 0); assert.equal(next.pages[0].items.length, 2); assert.ok(next.pages[0].items.every((item) => item.groupId === null));
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 12 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 12 },
	]);
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
	next = resizeItems(next, [next.pages[0].items[0].id], 12); next = compactDashboard(next, page.id);
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 12, column: 0, columnSpan: 12, rowSpan: 12 }, { row: 0, column: 0, columnSpan: 6, rowSpan: 12 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 12 },
	]); assert.deepEqual(firstAvailableLayout(next.pages[0], { columnSpan: 6, rowSpan: 12 }), { row: 24, column: 0, columnSpan: 6, rowSpan: 12 });
});

test("free card resize snaps both axes without moving neighboring cards", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } },
	]);
	const firstId = next.pages[0].items[0].id;
	next = resizeItem(next, firstId, { columnSpan: 9.4, rowSpan: 15.6 });
	assert.deepEqual(next.pages[0].items.find((item) => item.id === firstId).layout, { row: 12, column: 0, columnSpan: 9, rowSpan: 16 });
	assert.deepEqual(next.pages[0].items[1].layout, { row: 0, column: 6, columnSpan: 6, rowSpan: 12 });
	next = resizeItem(next, firstId, { columnSpan: 1, rowSpan: 2 });
	assert.equal(next.pages[0].items.find((item) => item.id === firstId).layout.columnSpan, 3);
});

test("resizing a grouped card refreshes its group without moving external cards", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "C", binding: { ...binding, controlId: "c" } },
	]);
	next = createGroup(next, page.id, next.pages[0].items.slice(0, 2).map((item) => item.id));
	const group = next.pages[0].groups[0]; const member = next.pages[0].items.find((item) => item.groupId === group.id);
	next = resizeItem(next, member.id, { columnSpan: 12, rowSpan: 20 });
	const resizedGroup = next.pages[0].groups.find((item) => item.id === group.id);
	assert.equal(resizedGroup.layout.rowSpan, 39);
	assert.equal(next.pages[0].items.find((item) => item.binding.controlId === "c").layout.row, 12);
});

test("grouping preserves member geometry and never compacts unrelated cards", () => {
	const page = createPage("P"); const makeItem = (id, row, column) => ({
		id, kind: "control", label: id, binding: { ...binding, controlId: id }, groupId: null,
		layout: { row, column, columnSpan: 6, rowSpan: 6 }, compact: false,
	});
	let model = normalizeDashboard({ version: 2, pages: [{ ...page, items: [
		makeItem("selected-a", 6, 0), makeItem("selected-b", 12, 6), makeItem("fixed", 30, 0),
	], groups: [] }] });
	model = createGroup(model, page.id, ["selected-a", "selected-b"], { name: "Selection" });
	const group = model.pages[0].groups[0]; const layouts = Object.fromEntries(model.pages[0].items.map((item) => [item.id, item.layout]));
	assert.equal(group.layout.row, 6);
	assert.deepEqual(layouts["selected-a"], { row: 0, column: 0, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["selected-b"], { row: 6, column: 6, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts.fixed, { row: 30, column: 0, columnSpan: 6, rowSpan: 6 });
});

test("duplicating a page regenerates layout identities and preserves bindings", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }]);
	next = createGroup(next, page.id, next.pages[0].items.map((item) => item.id)); next = duplicatePage(next, page.id);
	assert.equal(next.pages.length, 2); assert.notEqual(next.pages[0].id, next.pages[1].id); assert.notEqual(next.pages[0].groups[0].id, next.pages[1].groups[0].id); assert.notEqual(next.pages[0].items[0].id, next.pages[1].items[0].id); assert.deepEqual(next.pages[0].items[0].binding, next.pages[1].items[0].binding);
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
