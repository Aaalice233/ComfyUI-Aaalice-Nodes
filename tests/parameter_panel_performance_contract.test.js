import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../js/parameter_panel.js", import.meta.url), "utf8");
const layout = readFileSync(new URL("../js/lib/parameter_layout.js", import.meta.url), "utf8");
const providers = readFileSync(new URL("../js/lib/control_providers.js", import.meta.url), "utf8");
const kj = readFileSync(new URL("../js/parameter_panel_kj.js", import.meta.url), "utf8");
const theme = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");

test("ParameterPanel keeps repeated canvas layout reads on an O(1) cache hit", () => {
	assert.match(layout, /const parameterLayouts = new WeakMap\(\)/);
	assert.match(layout, /cached\.width === width && cached\.contentTop === contentTop && cached\.source === source/);
	assert.match(layout, /return cached\.layout/);
	assert.match(panel, /invalidateParameterLayout\(node\)/);
	assert.match(panel, /hideOnZoom:\s*true/);
	assert.doesNotMatch(panel, /hideOnZoom:\s*false/);
});

test("ParameterPanel batches Nodes 2.0 slot marking into one document scan", () => {
	assert.match(panel, /function scheduleVueOutputs\(node\)/);
	assert.match(panel, /vueOutputObserver = new MutationObserver\(scheduleVueOutputsFromMutations\)/);
	assert.match(panel, /for \(const record of records\)[\s\S]*record\.addedNodes/);
	assert.equal((panel.match(/document\.querySelectorAll\("\[data-node-id\]"\)/g) || []).length, 1);
	assert.doesNotMatch(panel, /setTimeout\(\(\) => markVueOutputs/);
});

test("value changes update retained controls without rebuilding the panel or KJ names", () => {
	assert.match(panel, /_aaaliceParameterValueUpdate = \(parameterId = null\) => updateParameterControls/);
	assert.match(panel, /event\.detail\?\.structure === false[\s\S]*_aaaliceParameterValueUpdate/);
	assert.match(providers, /if \(transient\) \{ node\._aaaliceParameterValueUpdate\?\.\(parameter\.id\)/);
	assert.doesNotMatch(providers, /if \(transient\) \{ node\._aaaliceParameterRedraw/);
	assert.match(kj, /if \(event\.detail\?\.structure === false\) return/);
});

test("canvas image controls avoid a continuously composited backdrop blur", () => {
	const rule = theme.match(/\.aa-image-asset-control__select\.has-image \.aa-image-asset-control__name\s*\{([^}]+)\}/)?.[1] || "";
	assert.ok(rule);
	assert.doesNotMatch(rule, /backdrop-filter/);
});
