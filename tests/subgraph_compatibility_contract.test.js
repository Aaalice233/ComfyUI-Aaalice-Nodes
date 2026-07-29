import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
	return readFileSync(new URL(path, import.meta.url), "utf8");
}

const payloadInjectors = [
	"../js/parameter_panel.js",
	"../js/enum_switch.js",
	"../js/character_feature_swap.js",
	"../js/prompt_selector.js",
	"../js/resolution_preset.js",
	"../js/booru_gallery.js",
];

test("all queue-time payload injectors address root and nested execution ids", () => {
	for (const path of payloadInjectors) {
		const contents = source(path);
		assert.match(contents, /allGraphNodes\(app\.graph\)/, path);
		assert.match(contents, /promptNodesForGraphNode\(output, node\)/, path);
		assert.doesNotMatch(contents, /output\?\.\[String\(node\.id\)\]/, path);
	}
});

test("shared group probe injection supports nested graph execution ids", () => {
	const contents = source("../js/lib/group_probe.js");
	assert.match(contents, /allGraphNodes\(app\.graph\)/);
	assert.match(contents, /promptNodesForGraphNode\(output, node\)/);
	assert.doesNotMatch(contents, /output\?\.\[String\(node\.id\)\]/);
});

test("interactive setup scans nested subgraph definitions", () => {
	for (const path of [
		"../js/fetch_from_krita.js",
		"../js/group_is_enabled.js",
		"../js/group_logic_probe.js",
		"../js/quick_group_manager.js",
	]) {
		const contents = source(path);
		assert.match(contents, /allGraphNodes\(app\.graph\)/, path);
		assert.doesNotMatch(contents, /app\.graph\?\._nodes/, path);
	}
});

test("every interactive control module loads from the sole package entry", () => {
	const contents = source("../js/extension.js");
	assert.match(contents, /import "\.\/quick_group_manager\.js"/);
});

test("execution events resolve qualified subgraph node ids", () => {
	const contents = source("../js/fetch_from_krita.js");
	assert.match(contents, /findNodeByExecutionId\(app\.graph, value\)/);
	assert.doesNotMatch(contents, /app\.graph\?\.getNodeById/);
});
