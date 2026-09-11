import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createGalleryCards } from "../js/lib/booru_gallery_cards.js";
import { createGalleryControllerFactory } from "../js/lib/booru_gallery_controller.js";
import { defaultGalleryState, finalPrompt, galleryPayload, GALLERY_CATEGORIES, normalizeGalleryState } from "../js/lib/booru_gallery_model.js";
import { allGraphNodes, promptNodesForGraphNode } from "../js/lib/graph_scope.js";

const source = readFileSync(new URL("../js/booru_gallery.js", import.meta.url), "utf8");
function sourceBetween(start, end) {
	const from = source.indexOf(start); const to = source.indexOf(end, from);
	assert.ok(from >= 0 && to > from, `Gallery source boundary: ${start}`);
	return source.slice(from, to);
}

// Exercise the entry's real callbacks without loading the browser-only app module.
const loadPromptOptions = Function("dependencies", `
	const { app, settings, document, el, icon, label, checkboxControl, multiSelectControl,
		segmentedControl, createAnchoredPopover, normalizeGalleryState, galleryPayload,
		GALLERY_CATEGORIES, allGraphNodes, promptNodesForGraphNode } = dependencies;
	const NODE = "BooruGalleryNode";
	const PROPERTY = "booruGalleryState";
	${sourceBetween("function isGallery(", "function capability(")}
	${sourceBetween("function effectivePrompt(", "async function saveGlobalOutputFilter(")}
	${sourceBetween("function transact(", "function proxyUrl(")}
	${sourceBetween("function openPromptOptions(", "const createGallerySurface =")}
	${sourceBetween("function installPromptHook(", "function hookPrototype(")}
	return { openPromptOptions, stateFor, effectivePrompt, installPromptHook };
`);

function element(_tag, options = null, text = null) {
	return {
		className: typeof options === "string" ? options : options?.className || "",
		textContent: options?.text ?? text ?? "",
		children: [...(options?.children || [])],
		classList: { add() {}, remove() {} },
		setAttribute() {}, addEventListener() {},
		append(...children) { this.children.push(...children); },
	};
}

function harness({ nested = false, edited = false, empty = false } = {}) {
	const controls = new Map(); const transactions = [];
	const node = { id: 9, type: "BooruGalleryNode", properties: { booruGalleryState: defaultGalleryState() } };
	const state = node.properties.booruGalleryState;
	state.selections = empty ? [] : [{
		source: "danbooru", postId: "42", mediaUrl: "https://example.test/42.jpg",
		originalTags: { copyright: ["series_a"], character: ["hero_(a)"], general: ["blue_hair"] },
		...(edited ? { editedTags: { copyright: ["local_series"], character: ["local_(hero)"], general: ["green_hair"] } } : {}),
	}];
	const graph = {
		id: nested ? "inner" : "root", _nodes: [node],
		beforeChange() { transactions.push("before"); }, afterChange() { transactions.push("after"); },
		change() { transactions.push("change"); }, setDirtyCanvas() {},
	};
	node.graph = graph;
	const root = nested ? { id: "root", _nodes: [{ id: 2, subgraph: graph }, { id: 7, subgraph: graph }] } : graph;
	if (nested) graph.rootGraph = root;
	const executionIds = nested ? ["2:9", "7:9"] : ["9"];
	const app = {
		graph: root,
		async graphToPrompt() {
			return { output: Object.fromEntries(executionIds.map((id) => [id, { class_type: "BooruGalleryNode", inputs: {} }])) };
		},
	};
	const uiControl = (options) => {
		const control = { ...element("button"), ...options };
		controls.set(options.label || options.ariaLabel, control);
		return control;
	};
	const settings = { blacklist: [], outputFilterTags: [] };
	const runtime = loadPromptOptions({
		app, settings, document: { createElement: element }, el: element, icon: element,
		label: (key) => key, checkboxControl: uiControl, multiSelectControl: uiControl,
		segmentedControl: uiControl, createAnchoredPopover: () => ({ root: element("div"), reposition() {} }),
		normalizeGalleryState, galleryPayload, GALLERY_CATEGORIES, allGraphNodes, promptNodesForGraphNode,
	});
	const cards = createGalleryCards({
		GALLERY_CATEGORIES, effectivePrompt: runtime.effectivePrompt, el: element, finalPrompt,
		iconButton: () => element("button"), label: (_key, fallback) => fallback,
		dimensions: () => "", ratingLabel: (value) => value, proxyUrl: (_source, url) => url,
		tagCount: (groups) => Object.values(groups).flat().length,
	});
	const surfaces = ["node", "dashboard"].map((placement) => ({
		placement, rows: [], updates: 0, mode: "selected",
		tabs: { setValue() {} }, selectionMode: { setValue() {} }, emptySelected: {},
	}));
	const controller = createGalleryControllerFactory({
		stateFor: runtime.stateFor, createTooltip: () => ({ hide() {} }),
		label: (_key, fallback) => fallback,
	})(node, new Set(surfaces));
	node._aaGalleryController = controller;
	for (const surface of surfaces) surface.selectedList = {
		setItems(items, options) {
			assert.equal(options.preserveScroll, true);
			surface.rows = items.map((item, index) => cards.createSelectedRow(node, controller, item, index));
			surface.updates += 1;
		},
	};
	controller.renderSelected();
	runtime.installPromptHook();
	const open = () => runtime.openPromptOptions(node, element("button"));
	open();
	return { node, app, executionIds, controls, surfaces, transactions, open, stateFor: runtime.stateFor };
}

function preview(surface) {
	return surface.rows.map((row) => {
		const content = row.children.find((child) => child.className === "aa-gallery-selected-row__copy");
		const tags = content.children.find((child) => child.className === "aa-gallery-selected-row__tags");
		return tags ? tags.children.map((tag) => tag.textContent).join(", ") : "";
	});
}

for (const nested of [false, true]) {
	test(`prompt option callbacks immediately update all projections in ${nested ? "shared Subgraph" : "root graph"}`, () => {
		const h = harness({ nested });
		for (const surface of h.surfaces) assert.deepEqual(preview(surface), ["series_a, hero_(a), blue_hair"]);
		const assertChange = (key, value, expected) => {
			const previousUpdates = h.surfaces.map((surface) => surface.updates);
			h.controls.get(key).onChange(value);
			const state = h.stateFor(h.node);
			assert.equal(finalPrompt(state.selections[0], state.prompt), expected);
			for (const [index, surface] of h.surfaces.entries()) {
				assert.deepEqual(preview(surface), [expected], `${surface.placement} must show the current prompt`);
				assert.equal(surface.updates, previousUpdates[index] + 1);
			}
			assert.deepEqual(h.transactions.splice(0), ["before", "after", "change"]);
		};
		assertChange("prompt.underscores", true, "series a, hero (a), blue hair");
		assertChange("prompt.parentheses", true, "series a, hero \\(a\\), blue hair");
		assertChange("prompt.underscores", false, "series_a, hero_\\(a\\), blue_hair");
		assertChange("prompt.parentheses", false, "series_a, hero_(a), blue_hair");
		assertChange("prompt.categories", ["general"], "blue_hair");
		assertChange("prompt.categories", [], "");
	});

	test(`formatting survives save/load and copy without changing queued ${nested ? "Subgraph" : "root"} snapshots`, async () => {
		const h = harness({ nested, edited: true });
		const before = await h.app.graphToPrompt();
		h.controls.get("prompt.underscores").onChange(true);
		h.controls.get("prompt.parentheses").onChange(true);
		const saved = JSON.stringify(h.node.properties);
		const copy = { properties: JSON.parse(saved) };
		assert.deepEqual(h.stateFor(copy).prompt, h.stateFor(h.node).prompt);
		h.node.properties = JSON.parse(saved);
		h.open();
		assert.equal(h.controls.get("prompt.underscores").checked, true);
		assert.equal(h.controls.get("prompt.parentheses").checked, true);
		const after = await h.app.graphToPrompt();
		for (const id of h.executionIds) {
			assert.deepEqual(JSON.parse(before.output[id].inputs.gallery_payload).prompts, ["local_series, local_(hero), green_hair"]);
			const payload = JSON.parse(after.output[id].inputs.gallery_payload);
			assert.deepEqual(payload.prompts, ["local series, local \\(hero\\), green hair"]);
			assert.equal(payload.prompt.replaceUnderscores, true);
			assert.deepEqual(payload.selections[0].editedTags.general, ["green_hair"]);
		}
		for (const surface of h.surfaces) assert.deepEqual(preview(surface), ["local series, local \\(hero\\), green hair"]);
		h.controls.get("prompt.underscores").onChange(false);
		assert.equal(h.stateFor(copy).prompt.replaceUnderscores, true, "copies own independent formatting state");
	});
}

test("formatting an empty selection refreshes projections without adding outputs", async () => {
	const h = harness({ empty: true });
	h.controls.get("prompt.underscores").onChange(true);
	for (const surface of h.surfaces) {
		assert.deepEqual(preview(surface), []);
		assert.equal(surface.updates, 2);
		assert.equal(surface.emptySelected.hidden, false);
	}
	assert.deepEqual(JSON.parse((await h.app.graphToPrompt()).output["9"].inputs.gallery_payload).prompts, []);
});
