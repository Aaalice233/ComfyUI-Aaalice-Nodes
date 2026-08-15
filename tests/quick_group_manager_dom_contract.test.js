import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStyleEntry } from "./helpers/style_source.js";

const source = readFileSync(new URL("../js/quick_group_manager.js", import.meta.url), "utf8");
const controlSource = readFileSync(new URL("../js/lib/controls/quick_group_manager.js", import.meta.url), "utf8");
const popoverSource = readFileSync(new URL("../js/lib/quick_group_manager_popovers.js", import.meta.url), "utf8");
const styles = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));
const uiControls = readFileSync(new URL("../js/lib/ui/controls.js", import.meta.url), "utf8");
const uiOverlays = readFileSync(new URL("../js/lib/ui/overlays.js", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../js/lib/quick_group_manager_runtime.js", import.meta.url), "utf8");

function loadMinimumBodyHeightHelpers() {
	const start = source.indexOf("const MIN_BODY_HEIGHT");
	const end = source.indexOf("const mountedManagers", start);
	assert.ok(start >= 0 && end > start);
	return Function(`${source.slice(start, end)}\nreturn { cacheMinimumBodyHeight, minimumBodyHeight };`)();
}

test("mounts synchronous non-serializing DOM widgets with low-zoom fallback", () => {
	assert.match(source, /addLifecycleDOMWidget\(node, WIDGET/);
	const widgetSetup = source.slice(source.indexOf("addLifecycleDOMWidget(node, TOOLBAR_WIDGET"), source.indexOf("const previousComputeSize"));
	assert.equal(widgetSetup.match(/serialize:\s*false/g)?.length, 2);
	assert.equal(widgetSetup.match(/hideOnZoom:\s*true/g)?.length, 2);
	assert.doesNotMatch(widgetSetup, /hideOnZoom:\s*false/);
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

test("caches visible-group height outside per-frame sizing callbacks", () => {
	const { cacheMinimumBodyHeight, minimumBodyHeight } = loadMinimumBodyHeightHelpers();
	const node = {};
	assert.equal(minimumBodyHeight(node), 82);
	cacheMinimumBodyHeight(node, 3);
	assert.equal(minimumBodyHeight(node), 140);
	assert.equal(minimumBodyHeight(node), 140);
	cacheMinimumBodyHeight(node, 1);
	assert.equal(minimumBodyHeight(node), 82);

	const helperSource = source.slice(source.indexOf("const MIN_BODY_HEIGHT"), source.indexOf("const mountedManagers"));
	assert.doesNotMatch(helperSource, /quickGroupManagerSnapshot|quickGroupManagerGroups|groupsFor|orderedVisibleGroups/);
	const renderBody = source.slice(source.indexOf("function render(node)"), source.indexOf("function placeToolbarWidget"));
	assert.match(renderBody, /const \{ groups, state, visibleGroups \} = snapshot;\s*cacheMinimumBodyHeight\(node, visibleGroups\.length\)/);
	const hotPathSource = source.slice(source.indexOf("addLifecycleDOMWidget(node, WIDGET"), source.indexOf("const previousArrangeWidgets"));
	assert.doesNotMatch(hotPathSource, /quickGroupManagerSnapshot|quickGroupManagerGroups|groupsFor|orderedVisibleGroups/);
	assert.match(source, /if \(node\._aaaliceQuickMounted\) \{\s*stateFor\(node\);[\s\S]*?render\(node\);[\s\S]*?return;/);
	assert.match(source, /mountedManagers\.add\(node\);\s*cacheMinimumBodyHeight\(node, 0\)/);
	assert.match(source, /requestAnimationFrame\(\(\) => \{\s*render\(this\);\s*placeToolbarWidget\(this\);/);
});

test("keeps the compact header single-line without redundant visible labels", () => {
	assert.match(source, /TOOLBAR_WIDGET/);
	assert.match(source, /NODE_TITLE_HEIGHT/);
	assert.match(source, /getMaxHeight:\s*\(\)\s*=>\s*0/);
	assert.match(styles, /\.aaalice-qgm-toolbar[\s\S]*white-space:\s*nowrap/);
	assert.match(source, /aaalice-qgm-utilities/);
	assert.match(styles, /\.aaalice-qgm-actions[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto[\s\S]*column-gap:\s*4px/);
	assert.match(styles, /\.aaalice-qgm-actions > \.aaalice-qgm-segmented[\s\S]*grid-column:\s*2[\s\S]*justify-self:\s*end/);
	assert.match(styles, /\.aaalice-qgm-utilities[\s\S]*grid-column:\s*3[\s\S]*justify-self:\s*end/);
	assert.doesNotMatch(source, /aaalice-qgm-title/);
	assert.doesNotMatch(source, /关闭方式|颜色过滤/);
	assert.match(uiControls, /role:\s*"radiogroup"/);
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
	assert.match(source, /function syncVueManagerLayout/);
	assert.match(source, /element\.style\.setProperty\("min-width", `\$\{MIN_WIDTH\}px`\)/);
	assert.match(source, /widgetLayer\.classList\.add\("aaalice-qgm-widget-stack"\)/);
	assert.match(source, /function ensureVueManagerObserver/);
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
	assert.doesNotMatch(source, /app\.canvas\?\.pointer\?\.isDown/);
	const renderBody = source.slice(source.indexOf("function render(node)"), source.indexOf("function placeToolbarWidget"));
	assert.doesNotMatch(renderBody, /setSize/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*height:\s*100%/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*justify-content:\s*flex-start/);
	assert.match(styles, /\.aaalice-qgm-body[\s\S]*border-radius:\s*0 0 10px 10px/);
	assert.match(styles, /\.aaalice-quick-group-manager-node[\s\S]*min-width:\s*380px/);
	assert.match(styles, /\.aaalice-qgm-widget-stack[\s\S]*flex:\s*0 0 auto !important[\s\S]*grid-template-rows:\s*30px min-content !important[\s\S]*align-content:\s*start/);
	assert.match(styles, /\.aaalice-qgm-toolbar[\s\S]*height:\s*30px[\s\S]*min-height:\s*30px/);
	assert.match(styles, /\.aaalice-qgm-list[\s\S]*margin:\s*6px 6px 4px/);
	assert.match(styles, /\.aaalice-qgm-list[\s\S]*flex:\s*0 0 auto[\s\S]*justify-content:\s*flex-start[\s\S]*overflow:\s*hidden/);
	assert.match(styles, /\.aaalice-qgm-row[\s\S]*height:\s*42px[\s\S]*flex:\s*0 0 42px/);
	assert.match(styles, /\.aaalice-qgm-empty[\s\S]*height:\s*82px[\s\S]*flex:\s*0 0 82px[\s\S]*align-content:\s*center/);
	assert.match(styles, /\.aaalice-qgm\.is-resizing[\s\S]*pointer-events:\s*none/);
	assert.match(styles, /\.aaalice-qgm\.is-placing[\s\S]*pointer-events:\s*none/);
});

test("keeps the filter button neutral and lists selected colors in its tooltip", () => {
	assert.match(popoverSource, /createTooltip/);
	assert.match(popoverSource, /aaalice-qgm-filter-tooltip/);
	assert.match(popoverSource, /entry\.color[\s\S]*aaalice-qgm-color[\s\S]*el\("code", null, entry\.color\)/);
	assert.match(popoverSource, /QUICK_GROUP_COLOR_PALETTE/);
	assert.match(popoverSource, /normalizeHexColor/);
	assert.match(popoverSource, /type: "color"/);
	assert.match(popoverSource, /customColors/);
	assert.match(popoverSource, /aaalice-qgm-custom-preview/);
	assert.match(source, /filter\.removeAttribute\("title"\)/);
	assert.doesNotMatch(source, /quickGroup\.filter\.selected/);
	assert.doesNotMatch(source, /--qgm-filter-color/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-filter-button\.is-active/);
	assert.match(styles, /\.aaalice-qgm-filter-tooltip-row\s*\{[^}]*padding:\s*2px 1px/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-filter-tooltip-row\s*\{[^}]*background:/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-hover-tooltip/);
	assert.match(styles, /\.aaalice-qgm-filter-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
	assert.match(styles, /\.aaalice-qgm-color-preview\s*\{[^}]*width:\s*24px/);
	assert.match(styles, /\.aaalice-qgm-custom-editor-row\s*\{[^}]*grid-template-columns/);
	const rowBody = source.slice(source.indexOf("function groupRow"), source.indexOf("function render(node)"));
	assert.doesNotMatch(rowBody, /aaalice-qgm-color/);
	assert.doesNotMatch(popoverSource, /stale \? el\("span", "aaalice-qgm-warning", "!"\) : null/);
});

test("keeps the toolbar filter popover open across queued body renders", () => {
	assert.match(popoverSource, /popup\.anchor\s*=\s*anchor/);
	assert.match(source, /if \(popoverAnchor && !toolbar\.contains\(popoverAnchor\)\) popovers\.closePopover\(node\)/);
});

test("clears popover ownership through the shared close lifecycle", () => {
	const createPopoverBody = popoverSource.slice(
		popoverSource.indexOf("function createPopover"),
		popoverSource.indexOf("function filterEntries"),
	);
	assert.match(createPopoverBody, /createAnchoredPopover\(\{[\s\S]*onClose:\s*\(\)\s*=>\s*\{[\s\S]*node\._aaaliceQuickPopover\?\.root === popup\?\.root[\s\S]*node\._aaaliceQuickPopover = null/);
	assert.doesNotMatch(createPopoverBody, /popup\.close\s*=/);

	const sharedCloseBody = uiOverlays.slice(
		uiOverlays.indexOf("export function createAnchoredPopover"),
		uiOverlays.indexOf("let activeContextMenu"),
	);
	assert.match(sharedCloseBody, /const outside = \(event\) => \{[^}]*close\(\)/);
	assert.match(sharedCloseBody, /event\.key === "Escape"[^}]*close\(\)/);
	assert.match(sharedCloseBody, /onClose\?\.\(\)/);
	assert.match(popoverSource, /function closePopover\(node\)[\s\S]*node\._aaaliceQuickPopover\?\.close\?\.\(\)[\s\S]*node\._aaaliceQuickPopover = null/);
	assert.match(source, /node\.onRemoved = function \(\)[\s\S]*popovers\.closePopover\(this\)/);
});

test("previews existing linkage rules only when a group has rules", () => {
	assert.match(popoverSource, /function showRuleTooltip/);
	assert.match(popoverSource, /aaalice-qgm-rule-tooltip/);
	assert.match(source, /if \(count\) \{[\s\S]*mouseenter[\s\S]*showRuleTooltip[\s\S]*focus[\s\S]*showRuleTooltip/);
	assert.match(source, /link\.removeAttribute\("title"\)/);
	assert.match(popoverSource, /whenEnabled[\s\S]*whenDisabled/);
	assert.match(styles, /\.aaalice-qgm-rule-tooltip-row[\s\S]*grid-template-columns/);
	assert.doesNotMatch(styles, /\.aaalice-qgm-rule-tooltip-action\s*\{[^}]*border-radius:/);
});

test("animates and color-codes the mute/bypass mode switcher", () => {
	assert.match(controlSource, /iconName: "volumeOff"/);
	assert.match(controlSource, /iconName: "skipForward"/);
	assert.match(controlSource, /aa-quick-group-control__mode/);
	assert.match(styles, /\.aa-quick-group-control__mode\s*\{[\s\S]*height:\s*32px/);
	assert.match(styles, /\.aa-quick-group-control__mode\[data-value="bypass"\][\s\S]*--qgm-mode-color:\s*var\(--aa-ui-accent\)/);
	assert.match(styles, /\.aa-quick-group-control__mode \.aa-ui-segmented__thumb[\s\S]*transition:/);
	assert.match(source, /aaalice-qgm-segmented is-\$\{state\.offMode\}/);
	assert.match(source, /aaalice-qgm-segmented-thumb/);
	assert.match(source, /iconName:\s*"volumeOff"/);
	assert.match(source, /iconName:\s*"skipForward"/);
	assert.match(source, /function syncModeSwitcher/);
	assert.match(source, /function syncToolbar/);
	assert.match(source, /toolbar\.querySelector\("\.aaalice-qgm-actions"\)/);
	assert.match(source, /choice\.classList\.toggle\("is-active", active\)/);
	assert.match(source, /choice\.querySelector\("\.aa-ui-segmented__label"\)/);
	assert.match(source, /syncToolbar\(node, state\)/);
	assert.match(styles, /\.aaalice-qgm-segmented\s*\{[\s\S]*width:\s*150px[\s\S]*height:\s*26px/);
	assert.match(styles, /\.aaalice-qgm-segmented button \.aa-ui-icon\s*\{[\s\S]*width:\s*13px[\s\S]*height:\s*13px/);
	assert.match(styles, /\.aaalice-qgm-segmented\.is-bypass[\s\S]*--qgm-mode-color:\s*var\(--aa-ui-accent\)/);
	assert.match(styles, /\.aaalice-qgm-segmented\.is-bypass \.aaalice-qgm-segmented-thumb[\s\S]*translateX\(100%\)/);
	assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.aaalice-qgm/);
});

test("uses the Dashboard card as the single visual frame", () => {
	assert.match(styles, /\.aa-quick-group-control\s*\{[\s\S]*padding:\s*0[\s\S]*border:\s*0[\s\S]*background:\s*transparent[\s\S]*box-shadow:\s*none/);
});

test("keeps the manager title and right-aligned actions in one header row", () => {
	assert.match(controlSource, /headerAccessories:\s*\[headerTools\]/);
	assert.doesNotMatch(controlSource, /summary\.textContent|aa-quick-group-control__summary/);
	assert.doesNotMatch(controlSource, /aa-quick-group-control__toolbar/);
	assert.match(styles, /\.aa-control-card\[data-control-kind="quick-group-manager"\] \.aa-control-card-header[\s\S]*min-height:\s*32px/);
	assert.match(styles, /\.aa-quick-group-control__header-tools\s*\{[^}]*justify-content:\s*flex-end;[^}]*margin-left:\s*auto/);
	assert.doesNotMatch(styles, /\.aa-quick-group-control__header-tools\s*\{[^}]*position:\s*absolute/);
});

test("uses row brightness instead of status and node-count text", () => {
	assert.doesNotMatch(controlSource, /labels\.nodes|labels\.status|<small/);
	assert.match(styles, /\.aa-quick-group-control__row\.is-enabled[\s\S]*background:/);
	assert.match(styles, /\.aa-quick-group-control__row\.is-disabled[\s\S]*opacity:/);
	assert.match(styles, /\.aaalice-qgm-row\.is-enabled[\s\S]*background:/);
	assert.match(styles, /\.aaalice-qgm-row\.is-disabled[\s\S]*opacity:/);
});

test("makes each non-empty manager row a keyboard and pointer toggle target", () => {
	assert.match(source, /role: "group", tabindex: hasNodes \? "0" : "-1"/);
	assert.match(source, /row\.addEventListener\("click"/);
	assert.match(source, /event\.target\?\.closest\?\.\("button/);
	assert.match(source, /row\.addEventListener\("keydown"/);
	assert.match(source, /currentStatus === GROUP_STATE\.ENABLED \? "disable" : "enable"/);
	assert.match(styles, /\.aaalice-qgm-switch\s*\{[\s\S]*width:\s*42px[\s\S]*height:\s*26px/);
	assert.match(styles, /\.aa-quick-group-control__toggle\.aa-ui-toggle\s*\{[\s\S]*width:\s*42px[\s\S]*height:\s*24px/);
});

test("provides filtered drag ordering, keyboard ordering and accessible popovers", () => {
	assert.match(source, /dragstart/);
	assert.match(source, /Alt\+Arrow/);
	assert.match(source, /event\.altKey/);
	assert.match(uiOverlays, /aria-modal/);
	assert.match(uiOverlays, /event\.key === "Escape"/);
	assert.match(uiOverlays, /previousFocus\?\.focus/);
	assert.match(popoverSource, /className\.includes\("rules"\) \? 720/);
	assert.match(popoverSource, /Math\.min\(preferredWidth, window\.innerWidth - 16\)/);
	assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.aaalice-qgm-rule-content \{ grid-template-columns: minmax\(0, 1fr\)/);
});

test("shares cascade preflight and graph transaction logic with workspace", () => {
	assert.match(source, /applyQuickGroupManagerAction/);
	assert.match(source, /quickGroupManagerSnapshot/);
	const cascadeIndex = runtime.indexOf("planLinkageCascade({ sourceId");
	const preflightIndex = runtime.indexOf("planNodeModeChanges(cascade.assignments");
	const mutationIndex = runtime.indexOf("target.mode = mode", preflightIndex);
	assert.ok(cascadeIndex >= 0 && preflightIndex > cascadeIndex && mutationIndex > preflightIndex);
	assert.match(runtime, /beforeChange/);
	assert.match(runtime, /afterChange/);
	assert.doesNotMatch(runtime, /setInterval\s*\(/);
});

test("offers a compact full-group navigation action on every managed row", () => {
	assert.match(source, /navigateToVisualGroup/);
	assert.match(source, /iconName: "fit"/);
	assert.match(source, /aaalice-qgm-locate/);
	assert.match(source, /row\.append\(drag, name, locate, link, toggle\)/);
	assert.match(styles, /\.aaalice-qgm-locate\.aa-ui-button/);
});
