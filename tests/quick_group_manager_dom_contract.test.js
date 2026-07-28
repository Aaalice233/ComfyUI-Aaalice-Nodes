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
	assert.match(source, /aaalice-qgm-utilities/);
	assert.match(styles, /\.aaalice-qgm-actions[\s\S]*grid-template-columns:\s*minmax\(132px, 1fr\) auto minmax\(132px, 1fr\)/);
	assert.match(styles, /\.aaalice-qgm-actions > \.aaalice-qgm-segmented[\s\S]*grid-column:\s*2[\s\S]*justify-self:\s*center/);
	assert.match(styles, /\.aaalice-qgm-utilities[\s\S]*grid-column:\s*3[\s\S]*justify-self:\s*end/);
	assert.doesNotMatch(source, /aaalice-qgm-title/);
	assert.doesNotMatch(source, /关闭方式|颜色过滤/);
	assert.match(ui, /role:\s*"radiogroup"/);
	assert.match(source, /role:\s*"switch"/);
	assert.match(source, /"aria-checked":\s*status === GROUP_STATE\.MIXED \? "mixed"/);
});

test("allows vertical growth while keeping content top-aligned and enforcing its minimum", () => {
	assert.match(source, /MIN_WIDTH\s*=\s*380/);
	assert.doesNotMatch(source, /DEFAULT_HEIGHT/);
	assert.match(source, /function scheduleInitialSize/);
	assert.match(source, /_aaaliceQuickConfigured/);
	assert.match(source, /function minimumBodyHeight/);
	assert.match(source, /GROUP_ROW_HEIGHT\s*=\s*42/);
	assert.match(source, /function enforceMinimumSize/);
	assert.match(source, /getMinHeight:\s*\(\)\s*=>\s*minimumBodyHeight\(node\)/);
	assert.match(source, /getMaxHeight:\s*\(\)\s*=>\s*minimumBodyHeight\(node\)/);
	assert.match(source, /minimumBodyHeight\(this\)/);
	assert.doesNotMatch(source, /Math\.max\(Number\(computed\[1\]\)\s*\|\|\s*0, minimumBodyHeight\(this\)\)/);
	assert.match(source, /node\.computeSize\s*=\s*function/);
	assert.match(source, /Math\.max\([\s\S]*Number\(computed\[0\]\)[\s\S]*MIN_WIDTH/);
	assert.match(source, /app\.canvas\?\.resizing_node === this/);
	assert.match(source, /node\.onResize = function \(size\)[\s\S]*size\[1\] = Math\.max\(minimumBodyHeight\(this\), Number\(size\[1\]\)[\s\S]*this\.size\[1\] = Math\.max\(minimumBodyHeight\(this\), Number\(this\.size\[1\]\)/);
	assert.match(source, /function beginResizePassthrough/);
	assert.match(source, /function beginPlacementPassthrough/);
	assert.match(source, /_aaaliceQuickPlacementCleanup/);
	assert.match(source, /node\.getWidgetOnPos\s*=/);
	assert.match(source, /findResizeDirection\?\.\(x, y\)/);
	assert.match(source, /app\.canvas\?\.pointer\?\.isDown/);
	const renderBody = source.slice(source.indexOf("function render(node)"), source.indexOf("function placeToolbarWidget"));
	assert.doesNotMatch(renderBody, /setSize/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*height:\s*100%/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*justify-content:\s*flex-start/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*border-radius:\s*0 0 10px 10px/);
	assert.match(styles, /\.aaalice-qgm-toolbar[\s\S]*height:\s*30px[\s\S]*min-height:\s*30px/);
	assert.match(styles, /\.aaalice-qgm-list[\s\S]*margin:\s*6px 6px 4px/);
	assert.match(styles, /\.aaalice-qgm-list[\s\S]*flex:\s*0 0 auto[\s\S]*justify-content:\s*flex-start[\s\S]*overflow:\s*hidden/);
	assert.match(styles, /\.aaalice-qgm-row[\s\S]*height:\s*42px[\s\S]*flex:\s*0 0 42px/);
	assert.match(styles, /\.aaalice-qgm-empty[\s\S]*height:\s*82px[\s\S]*flex:\s*0 0 82px[\s\S]*align-content:\s*center/);
	assert.match(styles, /\.aaalice-qgm\.is-resizing[\s\S]*pointer-events:\s*none/);
	assert.match(styles, /\.aaalice-qgm\.is-placing[\s\S]*pointer-events:\s*none/);
});

test("keeps the filter button neutral and lists selected colors in its tooltip", () => {
	assert.match(source, /createTooltip/);
	assert.match(source, /aaalice-qgm-filter-tooltip/);
	assert.match(source, /entry\.color[\s\S]*aaalice-qgm-color[\s\S]*el\("code", null, entry\.color\)/);
	assert.match(source, /filter\.removeAttribute\("title"\)/);
	assert.doesNotMatch(source, /quickGroup\.filter\.selected/);
	assert.doesNotMatch(source, /--qgm-filter-color/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-filter-button\.is-active/);
	assert.match(styles, /\.aaalice-qgm-filter-tooltip-row\s*\{[^}]*padding:\s*2px 1px/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-filter-tooltip-row\s*\{[^}]*background:/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-hover-tooltip/);
	const rowBody = source.slice(source.indexOf("function groupRow"), source.indexOf("function render(node)"));
	assert.doesNotMatch(rowBody, /aaalice-qgm-color/);
	assert.doesNotMatch(source, /stale \? el\("span", "aaalice-qgm-warning", "!"\) : null/);
});

test("keeps the toolbar filter popover open across queued body renders", () => {
	assert.match(source, /popup\.anchor\s*=\s*anchor/);
	assert.match(source, /if \(popoverAnchor && !toolbar\.contains\(popoverAnchor\)\) closePopover\(node\)/);
});

test("previews existing linkage rules only when a group has rules", () => {
	assert.match(source, /function showRuleTooltip/);
	assert.match(source, /aaalice-qgm-rule-tooltip/);
	assert.match(source, /if \(count\) \{[\s\S]*mouseenter[\s\S]*showRuleTooltip[\s\S]*focus[\s\S]*showRuleTooltip/);
	assert.match(source, /link\.removeAttribute\("title"\)/);
	assert.match(source, /whenEnabled[\s\S]*whenDisabled/);
	assert.match(styles, /\.aaalice-qgm-rule-tooltip-row[\s\S]*grid-template-columns/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-rule-tooltip-action\s*\{[^}]*border-radius:/);
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

test("offers a compact full-group navigation action on every managed row", () => {
	assert.match(source, /navigateToVisualGroup/);
	assert.match(source, /iconName: "fit"/);
	assert.match(source, /aaalice-qgm-locate/);
	assert.match(source, /row\.append\(drag, name, locate, link, toggle\)/);
	assert.match(styles, /\.aaalice-qgm-locate\.aa-ui-button/);
});
