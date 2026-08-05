import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const implementation = readFileSync(new URL("../js/focus_on_open.js", import.meta.url), "utf8");
const model = readFileSync(new URL("../js/lib/focus_on_open_model.js", import.meta.url), "utf8");
const classicAndVueTheme = readFileSync(new URL("../js/lib/theme-focus-on-open.css", import.meta.url), "utf8");

function locale(language) {
	return JSON.parse(readFileSync(new URL(`../locales/${language}/main.json`, import.meta.url), "utf8"));
}

test("focus-on-open is an explicit package entry and uses the graph-scope boundary", () => {
	assert.match(extension, /import\s+["']\.\/focus_on_open\.js["']/);
	assert.match(implementation, /from ["']\.\/lib\/graph_scope\.js["']/);
	assert.match(implementation, /getNodeMenuItems\(node\)/);
	assert.match(implementation, /createAnchoredPopover/);
	assert.match(implementation, /nodeCreated\(node\)/);
	assert.match(implementation, /loadedGraphNode\(node\)/);
	assert.match(implementation, /beforeConfigureGraph\(\)/);
	assert.match(implementation, /afterConfigureGraph\(\)/);
});

test("focus-on-open persists only the node property and never adds one-time browser state", () => {
	assert.match(model, /aaaliceFocusOnOpen/);
	assert.doesNotMatch(implementation, /workflowId|guideId|localStorage|createDialog|toast/);
	assert.doesNotMatch(model, /workflowId|guideId|localStorage/);
	assert.doesNotMatch(`${implementation}\n${model}`, /First view|首次必看/);
});

test("load focus is one animation-frame action with official subgraph navigation", () => {
	assert.match(implementation, /createFocusOnOpenScheduler/);
	assert.match(implementation, /requestAnimationFrame/);
	assert.match(implementation, /canvas\.openSubgraph\?\./);
	assert.match(implementation, /canvas\.centerOnNode/);
	assert.match(implementation, /canvas\.ds\?\.fitToBounds/);
	assert.match(implementation, /setFocusOnOpenSettings/);
	assert.match(implementation, /beforeConfigureGraph\(\)[\s\S]*focusScheduler\.beforeConfigure/);
	assert.match(implementation, /new MutationObserver/);
	assert.match(implementation, /data-node-id/);
});

test("the marker has both Classic and Nodes 2.0 mount contracts without a layout row", () => {
	assert.match(implementation, /canvasOnly: true/);
	assert.match(implementation, /addLifecycleDOMWidget/);
	assert.match(implementation, /targetElement\.append\(root\)/);
	assert.match(implementation, /isolate\(buttonView\.button\)/);
	assert.match(classicAndVueTheme, /aa-focus-on-open__classic-root/);
	assert.doesNotMatch(classicAndVueTheme, /aa-focus-on-open__vue-root/);
	assert.match(classicAndVueTheme, /pointer-events: none/);
});

test("focus-on-open localization keeps the English and Simplified Chinese menu labels aligned", () => {
	const en = locale("en").aaalice.focusOnOpen;
	const zh = locale("zh").aaalice.focusOnOpen;
	assert.deepEqual(Object.keys(en), ["menu", "aria", "tooltip", "settings"]);
	assert.deepEqual(Object.keys(zh), ["menu", "aria", "tooltip", "settings"]);
	assert.equal(en.menu.set, "👁️ Focus on open");
	assert.equal(en.menu.settings, "⚙️ Focus view settings");
	assert.equal(en.menu.clear, "🚫 Cancel focus on open");
	assert.equal(zh.menu.set, "👁️ 打开时聚焦");
	assert.equal(zh.menu.settings, "⚙️ 打开时聚焦设置");
	assert.equal(zh.menu.clear, "🚫 取消打开时聚焦");
});
