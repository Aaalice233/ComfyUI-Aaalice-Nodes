import test from "node:test";
import assert from "node:assert/strict";

import { DashboardModelError, bindingKey, createPage, emptyDashboard, normalizeDashboard } from "../js/lib/dashboard_model.js";
import { addLinkedBinding, compactDashboard, createGroup, deleteGroup, duplicateItems, duplicatePage, addItems, moveGroup, moveGroups, moveItems, moveTopLevelSelection, resizeGroup, resizeItem, resizeItems, ungroupItems } from "../js/lib/dashboard_commands.js";
import { buildSourceSnapshot, planSourceGroupSync } from "../js/lib/dashboard_source_sync.js";
import { firstAvailableLayout, projectGroupScope, projectScope } from "../js/lib/dashboard_layout.js";
import { dashboardCardHeight, recommendedControlRowSpan, recommendedGroupRowSpan } from "../js/lib/dashboard_sizing.js";

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

test("group titles default to visible and preserve an explicit hidden setting", () => {
	const { model, page } = modelWithPage();
	page.groups.push({ id: "group-a", name: "Controls", tone: "neutral", widthMode: "auto", layout: { row: 0, column: 0, columnSpan: 12, rowSpan: 1 } });
	let next = normalizeDashboard(model);
	assert.equal(next.pages[0].groups[0].showTitle, true);
	next.pages[0].groups[0].showTitle = false;
	next = normalizeDashboard(next);
	assert.equal(next.pages[0].groups[0].showTitle, false);
});

test("new controls use two-column defaults and retain manual width resizing", () => {
	const { model, page } = modelWithPage();
	let next = addItems(model, page.id, [{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } }]);
	assert.equal(next.version, 4); assert.equal(next.pages[0].gridColumns, 12); assert.equal(next.pages[0].items.length, 2); assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 13 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 13 },
	]);
	const itemId = next.pages[0].items[0].id;
	next = resizeItem(next, itemId, { columnSpan: 3, rowSpan: 13 });
	assert.equal(next.pages[0].items.find((item) => item.id === itemId).layout.columnSpan, 3);
	next = resizeItem(next, itemId, { columnSpan: 12, rowSpan: 13 });
	assert.equal(next.pages[0].items.find((item) => item.id === itemId).layout.columnSpan, 12);
});

test("new source-bound controls and groups retain source label metadata", () => {
	const { model, page } = modelWithPage();
	const sourceGroup = { source: { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:sampling" }, name: "Sampling", tone: "blue", forceGroup: true };
	const next = addItems(model, page.id, [{ label: "Steps", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "steps" }, sourceGroup }]);
	assert.equal(next.pages[0].items[0].labelSource, "Steps");
	assert.equal(next.pages[0].items[0].labelOverride, undefined);
	assert.deepEqual(next.pages[0].items[0].groupSource, sourceGroup.source);
	assert.deepEqual(next.pages[0].groups[0].source, sourceGroup.source);
	assert.equal(next.pages[0].groups[0].nameSource, "Sampling");
});

test("parameter renames update source labels and preserve manual dashboard names", () => {
	const { model, page } = modelWithPage();
	const panelBinding = { ...binding, provider: "aaalice-parameter", hostId: "panel-a" };
	const sourceGroup = { source: { ...panelBinding, scopeId: "separator:sampling" }, name: "Sampling", tone: "blue", forceGroup: true };
	let next = addItems(model, page.id, [
		{ label: "Steps", binding: { ...panelBinding, controlId: "steps" }, sourceGroup },
		{ label: "Pinned", binding: { ...panelBinding, controlId: "cfg" }, sourceGroup },
	]);
	const steps = next.pages[0].items.find((item) => item.binding.controlId === "steps");
	const pinned = next.pages[0].items.find((item) => item.binding.controlId === "cfg");
	const group = next.pages[0].groups[0];
	delete pinned.labelSource;
	delete pinned.groupSource;
	steps.label = "Steps"; pinned.label = "Pinned"; group.name = "Sampling";
	const snapshot = buildSourceSnapshot([
		{ binding: { ...panelBinding, controlId: "steps", valueType: "number" }, label: "Iterations", sourceGroup: { source: sourceGroup.source, name: "Sampling options" } },
		{ binding: { ...panelBinding, controlId: "cfg", valueType: "number" }, label: "Guidance", sourceGroup: { source: sourceGroup.source, name: "Sampling options" } },
	], sourceGroup.source, { label: "Sampling options" });
	const migrated = planSourceGroupSync(next, page.id, group.id, snapshot).next;
	assert.equal(migrated.pages[0].items.find((item) => item.binding.controlId === "steps").label, "Iterations");
	assert.equal(migrated.pages[0].items.find((item) => item.binding.controlId === "steps").labelSource, "Iterations");
	assert.equal(migrated.pages[0].items.find((item) => item.binding.controlId === "cfg").label, "Pinned");
	assert.equal(migrated.pages[0].items.find((item) => item.binding.controlId === "cfg").labelOverride, "Pinned");
	assert.equal(migrated.pages[0].groups[0].name, "Sampling options");
	assert.equal(migrated.pages[0].groups[0].nameSource, "Sampling options");
});

test("legacy source titles migrate conservatively", () => {
	const { model, page } = modelWithPage();
	const source = { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:sampling" };
	let legacy = addItems(model, page.id, [{ label: "Old steps", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "steps" }, sourceGroup: { source, name: "Old section", tone: "blue", forceGroup: true } }]);
	delete legacy.pages[0].items[0].labelSource;
	delete legacy.pages[0].items[0].groupSource;
	delete legacy.pages[0].groups[0].nameSource;
	const preserved = planSourceGroupSync(legacy, page.id, legacy.pages[0].groups[0].id, buildSourceSnapshot([{ binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "steps", valueType: "number" }, label: "Steps", sourceGroup: { source, name: "Sampling" } }], source, { label: "Sampling" })).next;
	assert.equal(preserved.pages[0].items[0].label, "Old steps");
	assert.equal(preserved.pages[0].items[0].labelOverride, "Old steps");
	assert.equal(preserved.pages[0].groups[0].name, "Old section");
	assert.equal(preserved.pages[0].groups[0].nameOverride, "Old section");

	let matching = addItems(model, page.id, [{ label: "Steps", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "steps" }, sourceGroup: { source, name: "Sampling", tone: "blue", forceGroup: true } }]);
	delete matching.pages[0].items[0].labelSource;
	delete matching.pages[0].items[0].groupSource;
	delete matching.pages[0].groups[0].nameSource;
	matching = planSourceGroupSync(matching, page.id, matching.pages[0].groups[0].id, buildSourceSnapshot([{ binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "steps", valueType: "number" }, label: "Steps", sourceGroup: { source, name: "Sampling" } }], source, { label: "Sampling" })).next;
	assert.equal(matching.pages[0].items[0].labelSource, "Steps");
	assert.equal(matching.pages[0].groups[0].nameSource, "Sampling");
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
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 13 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 13 }, { row: 13, column: 0, columnSpan: 6, rowSpan: 13 },
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
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 13 },
		{ row: 0, column: 6, columnSpan: 6, rowSpan: 13 },
		{ row: 13, column: 0, columnSpan: 6, rowSpan: 13 },
	]);
});

test("parameter section groups do not create dashboard separators", () => {
	const { model, page } = modelWithPage();
	const sourceGroup = {
		source: { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:sampling" },
		name: "Sampling", tone: "blue", forceGroup: true,
	};
	let next = addItems(model, page.id, [{ label: "Steps", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a" }, sourceGroup }]);
	assert.equal(next.pages[0].items.filter((item) => item.kind === "separator").length, 0);
	assert.equal(next.pages[0].groups.length, 1);
	next = addItems(next, page.id, [{ label: "CFG", binding: { ...binding, provider: "aaalice-parameter", hostId: "panel-a", controlId: "cfg" }, sourceGroup }]);
	assert.equal(next.pages[0].items.filter((item) => item.kind === "separator").length, 0);
	assert.equal(next.pages[0].groups.length, 1);
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

test("Dashboard V2 two-column pages migrate once into Dashboard V4", () => {
	const legacy = { version: 2, pages: [{ id: "page", name: "Legacy", items: [
		{ id: "left", kind: "control", binding, groupId: null, layout: { row: 0, column: 0, columnSpan: 1, rowSpan: 12 } },
		{ id: "right", kind: "control", binding: { ...binding, controlId: "cfg" }, groupId: null, layout: { row: 0, column: 1, columnSpan: 1, rowSpan: 12 } },
	], groups: [] }] };
	const normalized = normalizeDashboard(legacy);
	assert.equal(normalized.version, 4);
	assert.equal(normalized.pages[0].gridColumns, 12);
	assert.deepEqual(normalized.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 13 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 13 },
	]);
});

test("Dashboard V3 integer-grid pages migrate to V4 without layout changes", () => {
	const model = normalizeDashboard({ version: 3, pages: [{ id: "page", name: "Integer grid", gridColumns: 12, tone: null, groups: [], items: [
		{ id: "left", kind: "control", binding, label: "Left", groupId: null, layout: { row: 0, column: 2, columnSpan: 5, rowSpan: 17 } },
		{ id: "right", kind: "control", binding: { ...binding, controlId: "cfg" }, label: "Right", groupId: null, layout: { row: 0, column: 7, columnSpan: 5, rowSpan: 19 } },
	] }] });
	assert.equal(model.version, 4);
	assert.deepEqual(model.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 2, columnSpan: 5, rowSpan: 17 },
		{ row: 0, column: 7, columnSpan: 5, rowSpan: 19 },
	]);
});

test("Dashboard V1 is rejected instead of migrated", () => {
	assert.throws(() => normalizeDashboard({ version: 1, pages: [] }), (error) => error instanceof DashboardModelError && error.code === "unsupported-version");
});

test("control footprints are stable presentation categories rather than DOM measurements", () => {
	assert.equal(recommendedControlRowSpan({ value: 30, options: { min: 1, max: 100 }, paramType: "slider" }), 13);
	assert.equal(recommendedControlRowSpan({ value: 0, options: { min: 0, max: 100, control_after_generate: "fixed" }, paramType: "seed" }), 13);
	assert.equal(recommendedControlRowSpan({ value: true }), 13);
	assert.equal(recommendedControlRowSpan({ value: ["cat"], paramType: "taglist" }), 13);
	assert.equal(recommendedGroupRowSpan([{ layout: { row: 6, rowSpan: 6 } }]), 19);
	assert.equal(dashboardCardHeight(5), 24);
	assert.equal(dashboardCardHeight(7), 36);
	assert.equal(dashboardCardHeight(9), 48);
	assert.equal(dashboardCardHeight(12), 66);
});

test("binding identity cannot collide when provider fields contain delimiters", () => {
	const left = { provider: "vendor:a", hostId: "b", controlId: "c", valueType: "number" };
	const right = { provider: "vendor", hostId: "a:b", controlId: "c", valueType: "number" };
	assert.notEqual(bindingKey(left), bindingKey(right));
});

test("third-party adapter identity survives normalization and preset keys", () => {
	const adapted = { ...binding, adapterId: "vendor-controls" };
	const { model, page } = modelWithPage();
	const next = addItems(model, page.id, [{ label: "Steps", binding: adapted }]);
	assert.equal(next.pages[0].items[0].binding.adapterId, "vendor-controls");
	assert.equal(bindingKey(adapted), JSON.stringify(["generic-widget", "host-a", "steps", "vendor-controls"]));
	assert.notEqual(bindingKey(adapted), bindingKey(binding));
});

test("card-specific numeric ranges survive normalization and copies without changing bindings", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [{ label: "Steps", binding }]);
	const source = next.pages[0].items[0]; source.numericRange = { min: 5, max: 50, step: 5 };
	next = normalizeDashboard(next);
	assert.deepEqual(next.pages[0].items[0].numericRange, { min: 5, max: 50, step: 5 });
	next = duplicateItems(next, page.id, [source.id]);
	assert.deepEqual(next.pages[0].items[1].numericRange, { min: 5, max: 50, step: 5 });
	next = duplicatePage(next, page.id);
	assert.ok(next.pages[1].items.every((item) => item.numericRange?.min === 5 && item.binding.hostId === binding.hostId));
});

test("invalid card-specific numeric ranges fail visibly", () => {
	const { model, page } = modelWithPage(); const next = addItems(model, page.id, [{ label: "Steps", binding }]);
	const item = next.pages[0].items[0];
	for (const numericRange of [
		{ min: 10, max: 10, step: 1 },
		{ min: 10, max: 5, step: 1 },
		{ min: 0, max: 10, step: 0 },
		{ min: 0, max: 10, step: 11 },
		{ min: Number.NaN, max: 10, step: 1 },
	]) {
		item.numericRange = numericRange;
		assert.throws(() => normalizeDashboard(next), (error) => error instanceof DashboardModelError && error.code === "invalid-numeric-range");
	}
});

test("grid projection to one column does not mutate canonical layout", () => {
	const entries = [
		{ id: "a", layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 12 } },
		{ id: "b", layout: { row: 0, column: 6, columnSpan: 6, rowSpan: 7 } },
	];
	const projection = projectScope(entries, 1); assert.deepEqual(projection.get("a"), { row: 0, column: 0, columnSpan: 1, rowSpan: 12 }); assert.deepEqual(projection.get("b"), { row: 12, column: 0, columnSpan: 1, rowSpan: 7 }); assert.equal(entries[1].layout.row, 0);
});

test("grid projection moves later entries when a projected footprint grows", () => {
	const entries = [
		{ id: "a", layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 } },
		{ id: "b", layout: { row: 12, column: 0, columnSpan: 6, rowSpan: 12 } },
		{ id: "c", layout: { row: 24, column: 0, columnSpan: 6, rowSpan: 12 } },
	];
	const projection = projectScope(entries, 12);
	assert.equal(projection.get("a").row, 0);
	assert.equal(projection.get("b").row, 13);
	assert.equal(projection.get("c").row, 25);
	assert.equal(entries[1].layout.row, 12);
});

test("runtime size projections grow and shrink collision-free without changing canonical layouts", () => {
	const entries = [
		{ id: "a", layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 } },
		{ id: "b", layout: { row: 0, column: 6, columnSpan: 6, rowSpan: 13 } },
		{ id: "c", layout: { row: 13, column: 0, columnSpan: 6, rowSpan: 13 } },
	];
	const canonical = structuredClone(entries);
	const grown = projectScope(entries, 12, new Map([["a", { columnSpan: 9, rowSpan: 20 }]]));
	assert.deepEqual(grown.get("a"), { row: 0, column: 0, columnSpan: 9, rowSpan: 20 });
	assert.deepEqual(grown.get("b"), { row: 20, column: 6, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(grown.get("c"), { row: 20, column: 0, columnSpan: 6, rowSpan: 13 });
	const shrunk = projectScope(entries, 12, new Map([["a", { columnSpan: 3, rowSpan: 14 }]]));
	assert.deepEqual(shrunk.get("a"), { row: 0, column: 0, columnSpan: 3, rowSpan: 14 });
	assert.deepEqual(shrunk.get("b"), { row: 0, column: 6, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(shrunk.get("c"), { row: 14, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(entries, canonical);
});

test("group projection reserves height from the same collision-free member layout", () => {
	const members = [
		{ id: "a", layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 12 } },
		{ id: "b", layout: { row: 0, column: 6, columnSpan: 6, rowSpan: 7 } },
		{ id: "c", layout: { row: 12, column: 0, columnSpan: 6, rowSpan: 9 } },
	];
	assert.equal(recommendedGroupRowSpan(members), 28);
	assert.equal(recommendedGroupRowSpan(members, false), 24);
	assert.equal(projectGroupScope(members, 1).rowSpan, 35);
	assert.equal(projectGroupScope(members, 1, false).rowSpan, 31);
	assert.equal(projectGroupScope(members, 12).rowSpan, 28);
	assert.equal(projectGroupScope(members, 12, false).rowSpan, 24);
});

test("precise movement keeps the drop target and pushes only the colliding column", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "Tall", binding, rowSpan: 12 },
		{ label: "Top", binding: { ...binding, controlId: "top" }, rowSpan: 6 },
		{ label: "Bottom", binding: { ...binding, controlId: "bottom" }, rowSpan: 6 },
	]);
	const bottom = next.pages[0].items[2]; next = moveItems(next, [bottom.id], page.id, { row: 6, column: 6 });
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 13 },
		{ row: 19, column: 6, columnSpan: 6, rowSpan: 13 },
		{ row: 6, column: 6, columnSpan: 6, rowSpan: 13 },
	]);
});

test("normalization migrates legacy footprints before inserting the operated card", () => {
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
	assert.deepEqual(layouts.moving, { row: 12, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["collision-a"], { row: 12, column: 6, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["collision-b"], { row: 25, column: 6, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts.neighbor, { row: 25, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["unrelated-gap"], { row: 38, column: 0, columnSpan: 6, rowSpan: 13 });
});

test("normalized multi-card movement preserves the selected footprint", () => {
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
	assert.deepEqual(layouts["selected-left"], { row: 12, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["selected-right"], { row: 12, column: 6, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["collision-left"], { row: 25, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["collision-right"], { row: 25, column: 6, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts.unrelated, { row: 38, column: 6, columnSpan: 6, rowSpan: 13 });
});

test("dragging a tall card ahead of shorter cards keeps the tall card at the requested row", () => {
	const page = createPage("P"); const makeItem = (id, row, column, rowSpan) => ({
		id, kind: "control", label: id, binding: { ...binding, controlId: id }, groupId: null,
		layout: { row, column, columnSpan: 6, rowSpan },
	});
	let model = normalizeDashboard({ version: 4, pages: [{ ...page, items: [
		makeItem("small", 0, 0, 13), makeItem("neighbor", 0, 6, 13),
		makeItem("following", 13, 0, 13), makeItem("tall", 26, 0, 26),
	], groups: [] }] });
	model = moveItems(model, ["tall"], page.id, { row: 0, column: 0 });
	const layouts = Object.fromEntries(model.pages[0].items.map((item) => [item.id, item.layout]));
	assert.equal(layouts.tall.row, 0);
	assert.equal(layouts.small.row, 26);
	assert.equal(layouts.following.row, 39);
	assert.equal(layouts.neighbor.row, 0);
});

test("groups own no duplicate member list and delete preserves controls", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "Steps", binding }, { label: "CFG", binding: { ...binding, controlId: "cfg" } },
	]);
	const ids = next.pages[0].items.map((item) => item.id); next = createGroup(next, page.id, ids, { name: "Sampling", tone: "blue" });
	const group = next.pages[0].groups[0]; assert.equal(group.name, "Sampling"); assert.equal("itemIds" in group, false); assert.ok(next.pages[0].items.every((item) => item.groupId === group.id));
	next = deleteGroup(next, page.id, group.id); assert.equal(next.pages[0].groups.length, 0); assert.equal(next.pages[0].items.length, 2); assert.ok(next.pages[0].items.every((item) => item.groupId === null));
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 13 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 13 },
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

test("dropping a loose card into a group keeps the group anchored and pushes the external collision chain", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } },
		{ label: "Loose", binding: { ...binding, controlId: "loose" } }, { label: "External", binding: { ...binding, controlId: "external" } },
	]);
	const [a, b, looseId] = next.pages[0].items.map((item) => item.id);
	next = createGroup(next, page.id, [a, b], { name: "Target" });
	const group = next.pages[0].groups[0]; const originalGroupRow = group.layout.row;
	next = moveItems(next, [looseId], page.id, { groupId: group.id });
	const movedPage = next.pages[0]; const movedGroup = movedPage.groups.find((entry) => entry.id === group.id);
	const loose = movedPage.items.find((item) => item.id === looseId); const external = movedPage.items.find((item) => item.binding.controlId === "external");
	assert.equal(movedGroup.layout.row, originalGroupRow);
	assert.equal(loose.groupId, group.id); assert.equal(loose.layout.row, 13);
	assert.equal(movedGroup.layout.rowSpan, 33); assert.equal(external.layout.row, 33);
});

test("dropping the last member into another group removes the empty source shell", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "Source", binding }, { label: "Target", binding: { ...binding, controlId: "target" } },
	]);
	const [sourceId, targetId] = next.pages[0].items.map((item) => item.id);
	next = createGroup(next, page.id, [sourceId], { name: "Source group", allowSingle: true });
	next = createGroup(next, page.id, [targetId], { name: "Target group", allowSingle: true });
	const targetGroup = next.pages[0].groups.find((group) => group.name === "Target group");
	next = moveItems(next, [sourceId], page.id, { groupId: targetGroup.id });
	assert.deepEqual(next.pages[0].groups.map((group) => group.id), [targetGroup.id]);
	assert.ok(next.pages[0].items.every((item) => item.groupId === targetGroup.id));
});

test("mixed top-level dragging preserves an existing group and its member coordinates", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "Loose", binding: { ...binding, controlId: "loose" } },
	]);
	const [a, b, looseId] = next.pages[0].items.map((item) => item.id);
	next = createGroup(next, page.id, [a, b], { name: "Keep", tone: "blue" });
	const beforePage = next.pages[0]; const beforeGroup = beforePage.groups[0]; const beforeLoose = beforePage.items.find((item) => item.id === looseId);
	const beforeMemberLayouts = Object.fromEntries(beforePage.items.filter((item) => item.groupId === beforeGroup.id).map((item) => [item.id, structuredClone(item.layout)]));
	const minimumRow = Math.min(beforeGroup.layout.row, beforeLoose.layout.row); const minimumColumn = Math.min(beforeGroup.layout.column, beforeLoose.layout.column);
	next = moveTopLevelSelection(next, page.id, [a, looseId], [], { row: 40, column: 0 });
	const movedPage = next.pages[0]; const movedGroup = movedPage.groups.find((group) => group.id === beforeGroup.id); const movedLoose = movedPage.items.find((item) => item.id === looseId);
	assert.ok(movedGroup); assert.equal(movedGroup.layout.row, 40 + beforeGroup.layout.row - minimumRow); assert.equal(movedGroup.layout.column, beforeGroup.layout.column - minimumColumn);
	assert.equal(movedLoose.groupId, null); assert.equal(movedLoose.layout.row, 40 + beforeLoose.layout.row - minimumRow);
	assert.ok(movedPage.items.filter((item) => [a, b].includes(item.id)).every((item) => item.groupId === movedGroup.id));
	assert.deepEqual(Object.fromEntries(movedPage.items.filter((item) => item.groupId === movedGroup.id).map((item) => [item.id, item.layout])), beforeMemberLayouts);
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
		{ row: 0, column: 0, columnSpan: 6, rowSpan: 13 },
		{ row: 0, column: 6, columnSpan: 6, rowSpan: 13 },
		{ row: 13, column: 0, columnSpan: 6, rowSpan: 13 },
		{ row: 33, column: 0, columnSpan: 6, rowSpan: 13 },
	]);
	assert.equal(packed.groups[0].layout.rowSpan, 33);
	assert.equal(packed.items[3].layout.row, packed.groups[0].layout.rowSpan);
});

test("width changes and explicit compaction remain deterministic", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "C", binding: { ...binding, controlId: "c" } },
	]);
	next = resizeItems(next, [next.pages[0].items[0].id], 12); next = compactDashboard(next, page.id);
	assert.deepEqual(next.pages[0].items.map((item) => item.layout), [
		{ row: 13, column: 0, columnSpan: 12, rowSpan: 13 }, { row: 0, column: 0, columnSpan: 6, rowSpan: 13 }, { row: 0, column: 6, columnSpan: 6, rowSpan: 13 },
	]); assert.deepEqual(firstAvailableLayout(next.pages[0], { columnSpan: 6, rowSpan: 12 }), { row: 26, column: 0, columnSpan: 6, rowSpan: 12 });
});

test("free card resize snaps both axes to integers without moving neighboring cards", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } },
	]);
	const firstId = next.pages[0].items[0].id;
	next = resizeItem(next, firstId, { columnSpan: 9.4, rowSpan: 15.6 });
	assert.deepEqual(next.pages[0].items.find((item) => item.id === firstId).layout, { row: 13, column: 0, columnSpan: 9, rowSpan: 16 });
	assert.deepEqual(next.pages[0].items[1].layout, { row: 0, column: 6, columnSpan: 6, rowSpan: 13 });
	next = resizeItem(next, firstId, { columnSpan: 1, rowSpan: 2 });
	assert.equal(next.pages[0].items.find((item) => item.id === firstId).layout.columnSpan, 3);
	assert.equal(next.pages[0].items.find((item) => item.id === firstId).layout.rowSpan, 13);
});

test("resizing a grouped card refreshes its group without moving external cards", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [
		{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }, { label: "C", binding: { ...binding, controlId: "c" } },
	]);
	next = createGroup(next, page.id, next.pages[0].items.slice(0, 2).map((item) => item.id));
	const group = next.pages[0].groups[0]; const member = next.pages[0].items.find((item) => item.groupId === group.id);
	const externalRow = next.pages[0].items.find((item) => item.binding.controlId === "c").layout.row;
	next = resizeItem(next, member.id, { columnSpan: 12, rowSpan: 20 });
	const resizedGroup = next.pages[0].groups.find((item) => item.id === group.id);
	assert.equal(resizedGroup.layout.rowSpan, 40);
	assert.equal(next.pages[0].items.find((item) => item.binding.controlId === "c").layout.row, externalRow);
});

test("grouping keeps the selected footprint and pushes the colliding page chain downward", () => {
	const page = createPage("P"); const makeItem = (id, row, column) => ({
		id, kind: "control", label: id, binding: { ...binding, controlId: id }, groupId: null,
		layout: { row, column, columnSpan: 6, rowSpan: 13 },
	});
	let model = normalizeDashboard({ version: 4, pages: [{ ...page, items: [
		makeItem("selected-left", 0, 0), makeItem("selected-right", 0, 6),
		makeItem("next-left", 13, 0), makeItem("next-right", 13, 6),
		makeItem("last-left", 26, 0), makeItem("last-right", 26, 6),
	], groups: [] }] });
	model = createGroup(model, page.id, ["selected-left", "selected-right"], { name: "Selection" });
	const group = model.pages[0].groups[0]; const layouts = Object.fromEntries(model.pages[0].items.map((item) => [item.id, item.layout]));
	assert.deepEqual(group.layout, { row: 0, column: 0, columnSpan: 12, rowSpan: 20 });
	assert.deepEqual(layouts["selected-left"], { row: 0, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["selected-right"], { row: 0, column: 6, columnSpan: 6, rowSpan: 13 });
	assert.equal(layouts["next-left"].row, 20); assert.equal(layouts["next-right"].row, 20);
	assert.equal(layouts["last-left"].row, 33); assert.equal(layouts["last-right"].row, 33);
});

test("grouping a partial-width selection preserves its page column without moving non-overlapping cards", () => {
	const page = createPage("P"); const makeItem = (id, row, column) => ({
		id, kind: "control", label: id, binding: { ...binding, controlId: id }, groupId: null,
		layout: { row, column, columnSpan: 6, rowSpan: 13 },
	});
	let model = normalizeDashboard({ version: 4, pages: [{ ...page, items: [
		makeItem("left-top", 0, 0), makeItem("right-top", 0, 6),
		makeItem("left-bottom", 13, 0), makeItem("right-bottom", 13, 6),
	], groups: [] }] });
	model = createGroup(model, page.id, ["right-top", "right-bottom"], { name: "Right" });
	const group = model.pages[0].groups[0]; const layouts = Object.fromEntries(model.pages[0].items.map((item) => [item.id, item.layout]));
	assert.deepEqual(group.layout, { row: 0, column: 6, columnSpan: 6, rowSpan: 33 });
	assert.deepEqual(layouts["left-top"], { row: 0, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["left-bottom"], { row: 13, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["right-top"], { row: 0, column: 0, columnSpan: 6, rowSpan: 13 });
	assert.deepEqual(layouts["right-bottom"], { row: 13, column: 0, columnSpan: 6, rowSpan: 13 });
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
	assert.equal(resized.pages[0].groups[0].layout.row, 13);
	assert.equal(resized.pages[0].items.find((item) => item.id === "external").layout.row, 0);
});

test("automatic layout compaction is idempotent", () => {
	const { model, page } = modelWithPage(); let sparse = addItems(model, page.id, [
		{ label: "A", binding, columnSpan: 5, rowSpan: 17 },
		{ label: "B", binding: { ...binding, controlId: "b" }, columnSpan: 7, rowSpan: 15 },
		{ label: "C", binding: { ...binding, controlId: "c" }, columnSpan: 4, rowSpan: 19 },
	]);
	sparse.pages[0].items[2].layout.row = 50;
	const compacted = compactDashboard(sparse, page.id);
	assert.deepEqual(compactDashboard(compacted, page.id), compacted);
	assert.ok(compacted.pages[0].items.every((item) => Number.isInteger(item.layout.columnSpan) && Number.isInteger(item.layout.rowSpan)));
});

test("moving a group preserves its requested integer column", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [{ label: "A", binding, columnSpan: 5, rowSpan: 17 }]);
	next = createGroup(next, page.id, [next.pages[0].items[0].id], { allowSingle: true });
	const groupId = next.pages[0].groups[0].id;
	next = moveGroup(next, page.id, groupId, 4, 5);
	assert.deepEqual(next.pages[0].groups[0].layout, { row: 4, column: 5, columnSpan: 5, rowSpan: 24 });
});

test("duplicating a page regenerates layout identities and preserves bindings", () => {
	const { model, page } = modelWithPage(); let next = addItems(model, page.id, [{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "b" } }]);
	next = createGroup(next, page.id, next.pages[0].items.map((item) => item.id)); next = duplicatePage(next, page.id);
	assert.equal(next.pages.length, 2); assert.notEqual(next.pages[0].id, next.pages[1].id); assert.notEqual(next.pages[0].groups[0].id, next.pages[1].groups[0].id); assert.notEqual(next.pages[0].items[0].id, next.pages[1].items[0].id); assert.deepEqual(next.pages[0].items[0].binding, next.pages[1].items[0].binding);
});

test("duplicating a source page isolates its source ownership", () => {
	const { model, page } = modelWithPage();
	const source = { provider: "aaalice-parameter", hostId: "panel-a", scopeId: "separator:sampling" };
	let next = addItems(model, page.id, [
		{ label: "Steps", binding: { ...binding, provider: source.provider, hostId: source.hostId }, sourceGroup: { source, name: "Sampling", forceGroup: true } },
		{ label: "CFG", binding: { ...binding, provider: source.provider, hostId: source.hostId, controlId: "cfg" }, sourceGroup: { source, name: "Sampling", forceGroup: true } },
	]);
	next = duplicatePage(next, page.id); const clone = next.pages[1];
	assert.equal(clone.groups[0].source, undefined);
	assert.ok(clone.items.every((item) => item.groupSource === undefined));
});

test("linked binding targets cannot be split across different dashboard cards", () => {
	const { model, page } = modelWithPage();
	let next = addItems(model, page.id, [{ label: "A", binding }, { label: "B", binding: { ...binding, controlId: "cfg" } }]);
	const first = next.pages[0].items[0]; const second = next.pages[0].items[1];
	next = addLinkedBinding(next, first.id, { ...binding, controlId: "shared" });
	assert.throws(() => addLinkedBinding(next, second.id, { ...binding, controlId: "shared" }), (error) => error instanceof DashboardModelError && error.code === "binding-overlap");
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
