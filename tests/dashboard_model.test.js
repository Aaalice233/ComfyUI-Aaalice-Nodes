import test from "node:test";
import assert from "node:assert/strict";

import { addControls, createPage, createSection, exportDashboardPreset, moveItem, normalizeDashboard, preflightDashboardPreset } from "../js/lib/dashboard_model.js";

const binding = { provider: "generic-widget", hostId: "host-a", controlId: "steps", valueType: "number" };

test("manual pages, sections and control cards serialize and reorder", () => {
	const page = createPage("Generation"); const section = createSection("Sampling"); page.sections.push(section);
	let model = normalizeDashboard({ pages: [page] });
	model = addControls(model, page.id, section.id, [{ label: "Steps", binding }, { label: "Steps mirror", binding }]);
	model = moveItem(model, model.pages[0].sections[0].items[1].id, page.id, section.id, 0);
	assert.equal(model.pages[0].sections[0].items[0].label, "Steps mirror");
	assert.equal(normalizeDashboard(model).version, 1);
});

test("control cards move across pages and append when no index is specified", () => {
	const first = createPage("First"); const source = createSection("Source"); first.sections.push(source);
	const second = createPage("Second"); const target = createSection("Target"); second.sections.push(target);
	let model = addControls({ pages: [first, second] }, first.id, source.id, [{ label: "Steps", binding }]);
	const itemId = model.pages[0].sections[0].items[0].id;
	model = moveItem(model, itemId, second.id, target.id);
	assert.equal(model.pages[0].sections[0].items.length, 0);
	assert.equal(model.pages[1].sections[0].items.at(-1).id, itemId);
});

test("preset carries current values and preflights missing or incompatible bindings", () => {
	const page = createPage("Page"); const section = createSection("Section"); page.sections.push(section);
	const model = addControls({ pages: [page] }, page.id, section.id, [{ label: "Steps", binding }]);
	const preset = exportDashboardPreset(model, () => ({ status: "ok", value: 30 }));
	assert.equal(Object.values(preset.values)[0].value, 30);
	assert.equal(preflightDashboardPreset(preset, () => ({ status: "missing" })).bindings[0].status, "missing");
	preset.values[Object.keys(preset.values)[0]].valueType = "string";
	assert.equal(preflightDashboardPreset(preset, () => ({ status: "ok" })).bindings[0].status, "incompatible");
});

test("corrupt items cannot become hidden state truth", () => {
	const model = normalizeDashboard({ pages: [{ name: "P", sections: [{ title: "S", items: [{ kind: "control", binding: { provider: "x" } }] }] }] });
	assert.equal(model.pages[0].sections[0].items.length, 0);
});
