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
	steps.note = "Keep this parameter stable.";
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
	assert.equal(migrated.pages[0].items.find((item) => item.binding.controlId === "steps").note, "Keep this parameter stable.");
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

test("component Markdown notes survive normalization and layout copies", () => {
	const { model, page } = modelWithPage();
	let next = addItems(model, page.id, [{ label: "Steps", binding }]);
	const source = next.pages[0].items[0];
	source.note = "## Sampling\n\nUse **20–30** steps.";
	next = normalizeDashboard(next);
	assert.equal(next.pages[0].items[0].note, source.note);
	next = duplicateItems(next, page.id, [source.id]);
	assert.equal(next.pages[0].items[1].note, source.note);
	next = duplicatePage(next, page.id);
	assert.equal(next.pages[1].items[0].note, source.note);
	next.pages[0].items[0].note = "   \n";
	assert.equal(normalizeDashboard(next).pages[0].items[0].note, undefined);
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
