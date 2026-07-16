import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/quick_group_manager.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");

test("mounts a synchronous non-serializing DOM widget across node lifecycles", () => {
	assert.match(source, /addDOMWidget\(WIDGET/);
	assert.match(source, /serialize:\s*false/);
	assert.match(source, /beforeRegisterNodeDef/);
	assert.match(source, /nodeCreated/);
	assert.match(source, /loadedGraphNode/);
	assert.match(source, /setup\(\)/);
	assert.match(source, /onConfigure/);
	assert.match(source, /onRemoved/);
});

test("uses graph events and animation-frame coalescing without polling", () => {
	assert.match(source, /addEventListener\("graphChanged"/);
	assert.match(source, /requestAnimationFrame/);
	assert.doesNotMatch(source, /setInterval\s*\(/);
});

test("keeps the compact header single-line without redundant visible labels", () => {
	assert.match(styles, /\.aaalice-qgm-header[\s\S]*white-space:\s*nowrap/);
	assert.match(styles, /min-width:\s*520px/);
	assert.doesNotMatch(source, /关闭方式|颜色过滤/);
	assert.match(source, /role:\s*"radiogroup"/);
	assert.match(source, /role:\s*"switch"/);
	assert.match(source, /"aria-checked":\s*status === GROUP_STATE\.MIXED \? "mixed"/);
});

test("provides filtered drag ordering, keyboard ordering and accessible popovers", () => {
	assert.match(source, /dragstart/);
	assert.match(source, /Alt\+Arrow/);
	assert.match(source, /event\.altKey/);
	assert.match(source, /aria-modal/);
	assert.match(source, /event\.key === "Escape"/);
	assert.match(source, /previousFocus\?\.focus/);
});

test("preflights cascade before writing node modes in one graph boundary", () => {
	const cascadeIndex = source.indexOf("planLinkageCascade({ sourceId");
	const preflightIndex = source.indexOf("planNodeModeChanges(cascade.assignments");
	const mutationIndex = source.indexOf("target.mode = mode", preflightIndex);
	assert.ok(cascadeIndex >= 0 && preflightIndex > cascadeIndex && mutationIndex > preflightIndex);
	assert.match(source, /beforeChange/);
	assert.match(source, /afterChange/);
});
