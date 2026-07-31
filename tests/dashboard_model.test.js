import test from "node:test";
import assert from "node:assert/strict";

import { DashboardModelError, bindingKey, createPage, emptyDashboard, normalizeDashboard } from "../js/lib/dashboard_model.js";
import { compactDashboard, createGroup, deleteGroup, duplicateItems, duplicatePage, addItems, moveGroups, moveItems, resizeGroup, resizeItem, resizeItems, ungroupItems } from "../js/lib/dashboard_commands.js";
import { firstAvailableLayout, projectScope } from "../js/lib/dashboard_layout.js";
import { dashboardCardHeight, projectedGroupRowSpan, recommendedControlRowSpan, recommendedGroupRowSpan } from "../js/lib/dashboard_sizing.js";

const binding = { provider: "generic-widget", hostId: "host-a", controlId: "steps", valueType: "number" };
const modelWithPage = () => { const model = emptyDashboard(); const page = createPage("Generation"); model.pages.push(page); return { model, page }; };

test("page tone survives normalization and falls back to null when unknown", () => {
	const page = createPage("Docs");
	assert.equal(page.tone, null);
	page.tone = "green";
	let model = emptyDashboard(); model.pages.push(page);
	model = normalizeDashboard(model);
	assert.equal(model.pages[0].tone, "green");
	model.pages[0].tone = "neon";
	model = normalizeDashboard(model);
	assert.equal(model.pages[0].tone, null);
});

test("Dashboard V2 pages directly own grid control cards", () => {
	const { model, page } = modelWithPage();
	const next = addItems(model, page.id, [{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } }]);
	assert.equal(next.version, 2); assert.equal(next.pages[0].gridColumns, 12); assert.equal(next.pages[0].items.length, 2); assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 12 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 12 },
	]);
});

test("source-grouped controls create and reuse one layout group", () => {
	const { model, page } = modelWithPage();
	const sourceGroup = { source: { provider: "aaalice-parameter", hostId: "panel-a" }, name: "Sampler", tone: "blue" };
	let next = addItems(model, page.id, [
		{ label: "Steps", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a" } },
		{ label: "CFG", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "cfg" } },
	], { sourceGroup });
	const group = next.pages[0].groups[0];
	assert.equal(group.name, "Sampler"); assert.equal(group.tone, "blue"); assert.deepEqual(group.source, sourceGroup.source);
	assert.ok(next.pages[0].items.every((item) => item.groupId === group.id));
	next = addItems(next, page.id, [{ label: "Seed", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "seed", valueType: "number" } }], {
		sourceGroup: { ...sourceGroup, name: "Renamed panel", tone: "red" },
	});
	assert.equal(next.pages[0].groups.length, 1);
	assert.equal(next.pages[0].groups[0].name, "Sampler"); assert.equal(next.pages[0].groups[0].tone, "blue");
	assert.ok(next.pages[0].items.every((item) => item.groupId === group.id));
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 12 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 12 }, { row: 12, column: 0, columnSpan: 6, rowSpan: 12 },
	]);
});

test("a first single source control joins a group when a later source control arrives", () => {
	const { model, page } = modelWithPage();
	const sourceGroup = { source: { provider: "aaalice-parameter", hostId: "panel-a" }, name: "Sampler", tone: "blue" };
	const panelBinding = { ...binding, provider: "aaalice-parameter", hostId: "panel-a" };
	let next = addItems(model, page.id, [{ label: "Steps", binding: panelBinding }], { sourceGroup });
	assert.equal(next.pages[0].groups.length, 0); assert.equal(next.pages[0].items[0].groupId, null);
	next = addItems(next, page.id, [{ label: "CFG", binding: { ...panelBinding, controlId: "cfg" } }], { sourceGroup });
	assert.equal(next.pages[0].groups.length, 1); assert.equal(next.pages[0].groups[0].name, "Sampler");
	assert.ok(next.pages[0].items.every((item) => item.groupId === next.pages[0].groups[0].id));
});

test("legacy groups are reused when their members identify the same control source", () => {
	const { model, page } = modelWithPage();
	const panelBinding = { ...binding, provider: "aaalice-parameter", hostId: "panel-a" };
	let next = addItems(model, page.id, [
		{ label: "Steps", binding: panelBinding },
		{ label: "CFG", binding: { ...panelBinding, controlId: "cfg" } },
	]);
	next = createGroup(next, page.id, next.pages[0].items.map((item) => item.id), { name: "Custom group" });
	const group = next.pages[0].groups[0]; assert.equal(group.source, undefined);
	next = addItems(next, page.id, [{ label: "Seed", binding: { ...panelBinding, controlId: "seed" } }], {
		sourceGroup: { source: { provider: "aaalice-parameter", hostId: "panel-a" }, name: "Sampler", tone: "blue" },
	});
	assert.equal(next.pages[0].groups.length, 1); assert.equal(next.pages[0].groups[0].id, group.id); assert.equal(next.pages[0].groups[0].name, "Custom group");
	assert.ok(next.pages[0].items.every((item) => item.groupId === group.id));
});

test("separator-scoped controls create distinct groups, including singleton sections", () => {
	const { model, page } = modelWithPage();
	const panelBinding = { ...binding, provider: "aaalice-parameter", hostId: "panel-a" };
	const grouped = (scopeId, name) => ({
		source: { provider: "aaalice-parameter", hostId: "panel-a", ...(scopeId ? { scopeId } : {}) },
		name,
		tone: "blue",
		forceGroup: true,
	});
	const next = addItems(model, page.id, [
		{ label: "Model", binding: { ...panelBinding, controlId: "model" }, sourceGroup: grouped(null, "Panel") },
		{ label: "Steps", binding: panelBinding, sourceGroup: grouped("separator:sampling", "Sampling") },
		{ label: "CFG", binding: { ...panelBinding, controlId: "cfg" }, sourceGroup: grouped("separator:sampling", "Sampling") },
		{ label: "Width", binding: { ...panelBinding, controlId: "width" }, sourceGroup: grouped("separator:size", "Size") },
	]);
	const groups = Object.fromEntries(next.pages[0].groups.map((group) => [group.source?.scopeId || "root", group]));
	assert.deepEqual(Object.keys(groups).sort(), ["root", "separator:sampling", "separator:size"]);
	assert.equal(groups.root.name, "Panel");
	assert.equal(groups["separator:size"].name, "Size");
	assert.equal(next.pages[0].items.find((item) => item.binding.controlId === "model").groupId, groups.root.id);
	assert.equal(next.pages[0].items.find((item) => item.binding.controlId === "width").groupId, groups["separator:size"].id);
	assert.ok(next.pages[0].items.filter((item) => ["steps", "cfg"].includes(item.binding.controlId)).every((item) => item.groupId === groups["separator:sampling"].id));
});

test("separator group identity is stable across additions and preserves user naming", () => {
	const { model, page } = modelWithPage();
	const panelBinding = { ...binding, provider: "aaalice-parameter", hostId: "panel-a" };
	const sourceGroup = { source: { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:sampling" }, name: "Sampling", tone: "blue", forceGroup: true };
	let next = addItems(model, page.id, [{ label: "Steps", binding: panelBinding, sourceGroup }]);
	const groupId = next.pages[0].groups[0].id;
	next.pages[0].groups[0].name = "My sampler";
	next = addItems(next, page.id, [{ label: "CFG", binding: { ...panelBinding, controlId: "cfg" }, sourceGroup: { ...sourceGroup, name: "Renamed separator" } }]);
	assert.equal(next.pages[0].groups.length, 1);
	assert.equal(next.pages[0].groups[0].id, groupId);
	assert.equal(next.pages[0].groups[0].name, "My sampler");
	assert.ok(next.pages[0].items.every((item) => item.groupId === groupId));
	assert.deepEqual(next.pages[0].groups[0].source, sourceGroup.source);
});

test("separator-scoped controls are packed from the section origin", () => {
	const { model, page } = modelWithPage();
	const panelBinding = { ...binding, provider: "aaalice-parameter", hostId: "panel-a" };
	const source = (scopeId, name) => ({ source: { ...panelBinding, scopeId }, name, tone: "blue", forceGroup: true });
	const next = addItems(model, page.id, [
		{ label: "Negative", binding: { ...panelBinding, controlId: "negative", valueType: "boolean" }, rowSpan: 9, sourceGroup: source("separator:negative", "Negative") },
		{ label: "Positive", binding: { ...panelBinding, controlId: "positive", valueType: "boolean" }, rowSpan: 9, sourceGroup: source("separator:positive", "Positive") },
		{ label: "Rule", binding: { ...panelBinding, controlId: "rule" }, rowSpan: 12, sourceGroup: source("separator:positive", "Positive") },
		{ label: "Service", binding: { ...panelBinding, controlId: "service" }, rowSpan: 12, sourceGroup: source("separator:positive", "Positive") },
	]);
	const positive = next.pages[0].groups.find((group) => group.source.scopeId === "separator:positive");
	const members = next.pages[0].items.filter((item) => item.groupId === positive.id);
	assert.deepEqual(members.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 9 },
		{ row: 0, column: 6, columnSpan: 6, rowSpan: 12 },
		{ row: 9, column: 0, columnSpan: 6, rowSpan: 12 },
	]);
});

test("parameter section separators become stable top-level dashboard items", () => {
	const { model, page } = modelWithPage();
	const sourceGroup = {
		source: { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:sampling" },
		name: "Sampling", tone: "blue", forceGroup: true, separator: { label: "Sampling" },
	};
	let next = addItems(model, page.id, [{ label: "Steps", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a" }, sourceGroup }]);
	let separators = next.pages[0].items.filter((item) => item.kind === "separator");
	assert.equal(separators.length, 1);
	assert.equal(separators[0].label, "Sampling");
	assert.deepEqual(separators[0].source, sourceGroup.source);
	assert.equal(separators[0].groupId, null);
	assert.ok(separators[0].layout.row < next.pages[0].groups[0].layout.row);
	next = addItems(next, page.id, [{ label: "CFG", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "cfg" }, sourceGroup }]);
	separators = next.pages[0].items.filter((item) => item.kind === "separator");
	assert.equal(separators.length, 1);
});

test("scoped controls do not fall into an unscoped legacy source group", () => {
	const { model, page } = modelWithPage();
	const panelBinding = { ...binding, provider: "aaalice-parameter", hostId: "panel-a" };
	const legacySourceGroup = { source: { provider: "aaalice-parameter", hostId: "panel-a" }, name: "Panel", tone: "blue" };
	let next = addItems(model, page.id, [
		{ label: "Steps", binding: panelBinding },
		{ label: "CFG", binding: { ...panelBinding, controlId: "cfg" } },
	], { sourceGroup: legacySourceGroup });
	const legacyGroupId = next.pages[0].groups[0].id;
	next = addItems(next, page.id, [{
		label: "Width",
		binding: { ...panelBinding, controlId: "width" },
		sourceGroup: { source: { ...legacySourceGroup.source, scopeId: "separator:size" }, name: "Size", tone: "blue", forceGroup: true },
	}]);
	assert.equal(next.pages[0].groups.length, 2);
	assert.equal(next.pages[0].items.find((item) => item.binding.controlId === "width").groupId, next.pages[0].groups.find((group) => group.source?.scopeId === "separator:size").id);
	assert.equal(next.pages[0].items.find((item) => item.binding.controlId === "steps").groupId, legacyGroupId);
});

test("group source scopes survive normalization and reject empty identities", () => {
	const { model, page } = modelWithPage();
	let next = addItems(model, page.id, [
		{ label: "A", binding },
		{ label: "B", binding: { ...binding, controlId: "b" } },
	]);
	next = createGroup(next, page.id, next.pages[0].items.map((item) => item.id), {
		source: { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:advanced" },
	});
	assert.deepEqual(normalizeDashboard(next).pages[0].groups[0].source, { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:advanced" });
	next.pages[0].groups[0].source.scopeId = "";
	assert.throws(() => normalizeDashboard(next), (error) => error instanceof DashboardModelError && error.code === "invalid-group-source");
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

test("single-column groups reserve enough projected height for every stacked member", () => {
	const members = [
		{ id: "a", layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 12 } },
		{ id: "b", layout: { row: 0, column: 6, columnSpan: 6, rowSpan: 7 } },
		{ id: "c", layout: { row: 12, column: 0, columnSpan: 6, rowSpan: 9 } },
	];
	assert.equal(recommendedGroupRowSpan(members), 28);
	assert.equal(projectedGroupRowSpan(members, 1), 35);
	assert.equal(projectedGroupRowSpan(members, 12), 28);
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
		layout: { row, column, columnSpan: 6, rowSpan: 6 },
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
		layout: { row, column, columnSpan: 6, rowSpan: 6 },
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

test("moving groups across pages keeps the whole group unit with its members", () => {
	const first = createPage("First"); const second = createPage("Second"); let model = emptyDashboard(); model.pages.push(first, second);
	model = addItems(model, first.id, [{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "C", binding: { ...binding, controlId: "c" } }]);
	const [a, b, c] = model.pages[0].items.map((item) => item.id);
	model = createGroup(model, first.id, [a, b], { name: "G", tone: "blue" });
	const group = model.pages[0].groups[0];
	model = moveGroups(model, [group.id], second.id);
	assert.equal(model.pages[0].groups.length, 0);
	assert.deepEqual(model.pages[0].items.map((item) => item.id), [c]);
	assert.equal(model.pages[1].groups.length, 1);
	assert.equal(model.pages[1].groups[0].id, group.id);
	assert.equal(model.pages[1].groups[0].tone, "blue");
	const members = model.pages[1].items;
	assert.deepEqual(members.map((item) => item.id).sort(), [a, b].sort());
	assert.ok(members.every((item) => item.groupId === group.id));
	assert.ok(model.pages[1].groups[0].layout.rowSpan >= Math.max(...members.map((item) => item.layout.row + item.layout.rowSpan)));
	model = moveGroups(model, ["missing-group"], second.id);
	assert.equal(model.pages[1].groups.length, 1);
});

test("duplicating controls keeps the stable binding and assigns fresh item identities", () => {
	const { model, page } = modelWithPage();
	let next = addItems(model, page.id, [{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } }]);
	const [steps, cfg] = next.pages[0].items;
	next = duplicateItems(next, page.id, [steps.id, cfg.id]);
	const items = next.pages[0].items;
	assert.equal(items.length, 4);
	const copies = items.slice(2);
	assert.deepEqual(copies.map((item) => item.binding), [steps.binding, cfg.binding]);
	assert.ok(copies.every((item) => item.id !== steps.id && item.id !== cfg.id));
	assert.ok(copies.every((item) => item.label === steps.label || item.label === cfg.label));
	const occupied = new Set(items.flatMap((item) => { const cells = []; for (let row = item.layout.row; row < item.layout.row + item.layout.rowSpan; row++) for (let column = item.layout.column; column < item.layout.column + item.layout.columnSpan; column++) cells.push(`${row}:${column}`); return cells; }));
	assert.equal(occupied.size, items.reduce((total, item) => total + item.layout.rowSpan * item.layout.columnSpan, 0));
	next = duplicateItems(next, page.id, ["missing-item"]);
	assert.equal(next.pages[0].items.length, 4);
});

test("compaction packs group members and tightens the group frame before repacking the page", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "C", binding: { ...binding, controlId: "c" } },
	]);
	const [a, b, c] = next.pages[0].items.map((item) => item.id);
	next = createGroup(next, page.id, [a, b, c], { name: "G", tone: "blue" });
	next = addItems(next, page.id, [{ label: "D", binding: { ...binding, controlId: "d" } }]);
	// 摆出稀疏组内布局: 成员全部堆在左列并留空行, 组框被撑高, D 也被推到更下方。
	next.pages[0].items[1].layout = { row: 12, column: 0, columnSpan: 6, rowSpan: 12 };
	next.pages[0].items[2].layout = { row: 24, column: 0, columnSpan: 6, rowSpan: 12 };
	next.pages[0].items[3].layout = { row: 43, column: 0, columnSpan: 6, rowSpan: 12 };
	next = compactDashboard(next, page.id);
	const packed = next.pages[0];
	assert.deepEqual(packed.items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 12 },
		{ row: 0, column: 6, columnSpan: 6, rowSpan: 12 },
		{ row: 12, column: 0, columnSpan: 6, rowSpan: 12 },
		{ row: 31, column: 0, columnSpan: 6, rowSpan: 12 },
	]);
	assert.equal(packed.groups[0].layout.rowSpan, 31);
	assert.equal(packed.items[3].layout.row, packed.groups[0].layout.rowSpan);
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
		layout: { row, column, columnSpan: 6, rowSpan: 6 },
	});
	let model = normalizeDashboard({ version: 2, pages: [{ ...page, items: [
		makeItem("selected-a", 6, 0), makeItem("selected-b", 12, 6), makeItem("fixed", 30, 0),
	], groups: [] }] });
	model = createGroup(model, page.id, ["selected-a", "selected-b"], { name: "Selection" });
	const group = model.pages[0].groups[0]; const layouts = Object.fromEntries(model.pages[0].items.map((item) => [item.id, item.layout]));
	assert.equal(group.layout.row, 6);
	assert.equal(group.layout.columnSpan, 12);
	assert.deepEqual(layouts["selected-a"], { row: 0, column: 0, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts["selected-b"], { row: 6, column: 6, columnSpan: 6, rowSpan: 6 });
	assert.deepEqual(layouts.fixed, { row: 30, column: 0, columnSpan: 6, rowSpan: 6 });
});

test("groups derive their width from local member geometry and preserve fixed widths", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [{ label: "A", binding }]);
	const itemId = next.pages[0].items[0].id; next = createGroup(next, page.id, [itemId], { allowSingle: true });
	let group = next.pages[0].groups[0];
	assert.equal(group.layout.columnSpan, 6);
	assert.equal(group.widthMode, "auto");
	next = resizeGroup(next, group.id, { columnSpan: 12 }); group = next.pages[0].groups[0];
	assert.equal(group.layout.columnSpan, 12);
	assert.equal(group.widthMode, "fixed");
	next = resizeGroup(next, group.id, { columnSpan: 1 });
	assert.equal(next.pages[0].groups[0].layout.columnSpan, 6);
});

test("legacy full-width groups migrate once and resize collision moves only the group", () => {
	const page = createPage("P");
	const legacy = normalizeDashboard({ version: 2, pages: [{ ...page, items: [
		{ id: "member", kind: "control", label: "A", binding, groupId: "group", layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 12 } },
		{ id: "external", kind: "control", label: "C", binding: { ...binding, controlId: "c" }, groupId: null, layout: { row: 0, column: 6, columnSpan: 6, rowSpan: 12 } },
	], groups: [{ id: "group", name: "Legacy", tone: "blue", layout: { row: 0, column: 0, columnSpan: 12, rowSpan: 1 } }] }] });
	assert.equal(legacy.pages[0].groups[0].layout.columnSpan, 6);
	const resized = resizeGroup(legacy, "group", { columnSpan: 12 });
	assert.equal(resized.pages[0].groups[0].layout.columnSpan, 12);
	assert.equal(resized.pages[0].groups[0].layout.row, 12);
	assert.equal(resized.pages[0].items.find((item) => item.id === "external").layout.row, 0);
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
	assert.throws(() => normalizeDashboard({ ...base, pages: [{ ...page, items: [], groups: [{ id: "group", name: "Bad source", source: { provider: "aaalice-parameter" }, layout: { row: 0, column: 0, columnSpan: 12, rowSpan: 1 } }] }] }), /group source/);
	assert.throws(() => normalizeDashboard({ ...base, pages: [{ ...page, items: [{ id: "x", kind: "control", binding, groupId: null, layout: { row: 0, column: 0, columnSpan: 1 } }] }] }), /row span/);
});
