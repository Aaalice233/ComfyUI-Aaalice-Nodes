import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/quick_group_manager.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/lib/ui.js", import.meta.url), "utf8");

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
	assert.match(source, /TOOLBAR_WIDGET/);
	assert.match(source, /NODE_TITLE_HEIGHT/);
	assert.match(source, /getMaxHeight:\s*\(\)\s*=>\s*0/);
	assert.match(styles, /\.aaalice-qgm-toolbar[\s\S]*white-space:\s*nowrap/);
	assert.doesNotMatch(source, /aaalice-qgm-title/);
	assert.doesNotMatch(source, /关闭方式|颜色过滤/);
	assert.match(ui, /role:\s*"radiogroup"/);
	assert.match(source, /role:\s*"switch"/);
	assert.match(source, /"aria-checked":\s*status === GROUP_STATE\.MIXED \? "mixed"/);
});

test("keeps manual node sizing after the initial default size", () => {
	assert.match(source, /TITLE_ACTIONS_WIDTH\s*=\s*200/);
	assert.match(source, /DEFAULT_HEIGHT\s*=\s*190/);
	assert.match(source, /function scheduleInitialSize/);
	assert.match(source, /_aaaliceQuickConfigured/);
	assert.match(source, /function enforceMinimumWidth/);
	assert.match(source, /node\.computeSize\s*=\s*function/);
	assert.match(source, /Number\(computed\[0\]\)[\s\S]*TITLE_ACTIONS_WIDTH/);
	assert.match(source, /Number\(computed\[1\]\)\s*\|\|\s*MIN_BODY_HEIGHT/);
	assert.match(source, /app\.canvas\?\.resizing_node === this/);
	assert.match(source, /function beginResizePassthrough/);
	assert.match(source, /node\.getWidgetOnPos\s*=/);
	assert.match(source, /findResizeDirection\?\.\(x, y\)/);
	assert.match(source, /app\.canvas\?\.pointer\?\.isDown/);
	const renderBody = source.slice(source.indexOf("function render(node)"), source.indexOf("function placeToolbarWidget"));
	assert.doesNotMatch(renderBody, /setSize/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*height:\s*100%/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*border-radius:\s*0 0 10px 10px/);
	assert.match(styles, /\.aaalice-qgm-list[\s\S]*margin:\s*8px/);
	assert.match(styles, /\.aaalice-qgm-empty[\s\S]*height:\s*100%[\s\S]*align-content:\s*center/);
	assert.match(styles, /\.aaalice-qgm\.is-resizing[\s\S]*pointer-events:\s*none/);
});

test("animates and color-codes the mute/bypass mode switcher", () => {
	assert.match(source, /aaalice-qgm-segmented is-\$\{state\.offMode\}/);
	assert.match(source, /aaalice-qgm-segmented-thumb/);
	assert.match(source, /function syncModeSwitcher/);
	assert.match(source, /function syncToolbar/);
	assert.match(source, /toolbar\.querySelector\("\.aaalice-qgm-actions"\)/);
	assert.match(source, /choice\.classList\.toggle\("is-active", active\)/);
	assert.match(source, /syncToolbar\(node, state\)/);
	assert.match(styles, /\.aaalice-qgm-segmented\.is-bypass[\s\S]*--qgm-mode-color:\s*var\(--aa-ui-accent\)/);
	assert.match(styles, /\.aaalice-qgm-segmented\.is-bypass \.aaalice-qgm-segmented-thumb[\s\S]*translateX\(100%\)/);
	assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.aaalice-qgm/);
});

test("provides filtered drag ordering, keyboard ordering and accessible popovers", () => {
	assert.match(source, /dragstart/);
	assert.match(source, /Alt\+Arrow/);
	assert.match(source, /event\.altKey/);
	assert.match(ui, /aria-modal/);
	assert.match(ui, /event\.key === "Escape"/);
	assert.match(ui, /previousFocus\?\.focus/);
});

test("preflights cascade before writing node modes in one graph boundary", () => {
	const cascadeIndex = source.indexOf("planLinkageCascade({ sourceId");
	const preflightIndex = source.indexOf("planNodeModeChanges(cascade.assignments");
	const mutationIndex = source.indexOf("target.mode = mode", preflightIndex);
	assert.ok(cascadeIndex >= 0 && preflightIndex > cascadeIndex && mutationIndex > preflightIndex);
	assert.match(source, /beforeChange/);
	assert.match(source, /afterChange/);
});
