import assert from "node:assert/strict";
import fs from "node:fs";
import { readStyleEntry } from "./helpers/style_source.js";
import { filteredPageRefillAction } from "../js/lib/booru_gallery_controller.js";
import test from "node:test";

const sourcePaths = [
	"../js/booru_gallery.js",
	"../js/lib/booru_gallery_surface.js",
	"../js/lib/booru_gallery_media.js",
	"../js/lib/booru_gallery_cards.js",
	"../js/lib/booru_gallery_hover.js",
	"../js/lib/booru_gallery_controller.js",
	"../js/lib/booru_gallery_random.js",
	"../js/lib/booru_gallery_dialogs.js",
	"../js/lib/booru_gallery_settings.js",
];
const source = sourcePaths.map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const tagPillsSource = fs.readFileSync(new URL("../js/lib/controls/tag_pills.js", import.meta.url), "utf8");
const extensionSource = fs.readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const presetSource = fs.readFileSync(new URL("../js/lib/booru_gallery_preset.js", import.meta.url), "utf8");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));
const uiStyles = fs.readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");
const uiControls = fs.readFileSync(new URL("../js/lib/ui/controls.js", import.meta.url), "utf8");
const agents = fs.readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
const enLocale = JSON.parse(fs.readFileSync(new URL("../locales/en/main.json", import.meta.url), "utf8"));
const zhLocale = JSON.parse(fs.readFileSync(new URL("../locales/zh/main.json", import.meta.url), "utf8"));

test("package entry imports the Booru Gallery extension", () => {
	assert.match(extensionSource, /import\s+["']\.\/booru_gallery\.js["']/);
});
test("gallery settings link each credential form to its site account page", () => {
	assert.match(source, /cap\.credentialsUrl \? el\("a", \{ className: "aa-gallery-settings__credentials-link"/);
	assert.match(source, /target: "_blank", rel: "noopener noreferrer"/);
	assert.match(source, /settings\.credentialsHint["\s\S]*replace\("\{source\}", cap\.displayName\)/);
	assert.match(theme, /\.aa-gallery-settings__credentials-link \{[^}]*color: var\(--aa-ui-accent\);/);
	assert.equal(enLocale.aaalice.gallery.settings.credentialsHint, "Get these API credentials from your {source} account page");
	assert.equal(zhLocale.aaalice.gallery.settings.credentialsHint, "前往 {source} 账户页面获取 API Key");
});

test("gallery has one toolbar with an in-place persistent search input", () => {
	assert.equal((source.match(/className: "aa-gallery-toolbar"/g) || []).length, 1);
	assert.match(source, /function createSearchControl\(node, \{ defaultOpen = false, onOpenChange = null \} = \{\}\)/); assert.match(source, /input\.type = "search"/); assert.match(source, /classList\.toggle\("is-open"/);
	assert.match(source, /searchToggleButton\(\{ label: label\("search\.label"/);
	assert.match(source, /input\.className = "aa-gallery-search__input aa-ui-search-input"/);
	assert.match(source, /input\.setAttribute\("data-autocomplete-plus", ""\)/);
	assert.match(source, /input\.hasAttribute\("data-autocomplete-plus-open"\)/);
	assert.match(source, /toggle\.setSearchValue\(input\.value/);
	assert.match(source, /iconName: "arrowRight"[^}]*className: "aa-ui-search-collapse"/);
	assert.match(source, /toggle\.hidden = open/);
	assert.match(source, /if \(!open && submitChanges && input\.value\.trim\(\) !== searchQuery\(stateFor\(node\)\)\) submit\(\)/);
	assert.match(source, /const setOpen = \(next, \{ focus = true, submitChanges = true, notifyChange = true \} = \{\}\) =>/);
	assert.match(source, /setOpen\(defaultOpen, \{ focus: false, notifyChange: false \}\)/);
	assert.match(source, /defaultOpen: placement === "dashboard" \? stateFor\(node\)\.dashboard\.searchOpen : true/);
	assert.match(source, /node\._aaGalleryRuntime\?\.setDashboardSearchOpen\(open\)/);
	assert.match(source, /runtime\.setDashboardSearchOpen = \(value\) =>/);
	assert.match(source, /node\.graph\?\.change\?\.\(\)/);
	assert.match(source, /if \(!composing && !input\.value\.trim\(\) && searchQuery\(stateFor\(node\)\)\) submit\(\)/);
	assert.match(source, /input\.addEventListener\("blur", commitOnBlur\)/);
	assert.match(source, /const commitIfChanged = \(\) => \{ if \(input\.value\.trim\(\) !== searchQuery\(stateFor\(node\)\)\) submit\(\); \};/);
	assert.match(source, /if \(composing\) return;/);
	assert.match(source, /new MutationObserver\(\(\) => \{/);
	assert.match(source, /attributeFilter: \["data-autocomplete-plus-open"\]/);
	assert.match(source, /input\.addEventListener\("focus", \(\) => pendingBlurCommit\?\.cancel\(\)\)/);
	assert.match(source, /_aaGalleryController\?\.search\(\{ reset: true, page: 1 \}\)/);
	assert.match(source, /className: "aa-gallery-toolbar__search", children: \[searchControl\.root, searchControl\.toggle\]/);
	assert.match(theme, /\.aa-gallery-toolbar__search \{ min-width: 0; flex: 0 1 280px; \}/);
	assert.match(theme, /\.aa-gallery-toolbar__search:has\(\.aa-gallery-search:not\(\.is-open\)\) \{ flex: 0 0 auto; \}/);
	assert.doesNotMatch(source, /classList\.toggle\("is-searching"/);
	assert.doesNotMatch(theme, /\.aa-gallery\.is-searching/);
	assert.match(uiStyles, /\.aa-ui-button\[hidden\] \{ display: none !important; \}/);
	assert.match(theme, /\.aa-gallery-search > \.aa-ui-button \{[^}]*width: 22px;[^}]*height: 22px;[^}]*border-radius: 50%;[^}]*transform: none;/s);
	assert.match(theme, /\.aa-gallery-search > \.aa-ui-button:hover:not\(:disabled\) \{[^}]*background: color-mix\([^}]*transform: none;/s);
	assert.match(theme, /\.aa-gallery-search \{[^}]*padding: 3px 3px 3px 9px;[^}]*overflow: hidden;/s);
});

test("gallery presets own browsing, selection, and dashboard projection state", () => {
	assert.match(source, /runtime\.getPresetValue = \(\) => createBooruGalleryPreset\(stateFor\(node\), settings \|\| \{\}\)/);
	assert.match(source, /runtime\.applyPresetValue = \(value\) =>/);
	assert.match(source, /node\.properties\[PROPERTY\] = decoded\.state/);
	assert.doesNotMatch(source, /runtime\.componentState/);
	assert.match(source, /void controller\.search\(\{ reset: true, page: state\.navigation\.page \}\)/);
	assert.match(presetSource, /structuredClone\(normalizeGalleryState\(state, settings\)\)/);
	assert.match(presetSource, /snapshot\.dashboard\.searchOpen = Boolean\(componentState\.searchOpen\)/);
});

test("gallery restores every workflow-owned browsing state after configuration", () => {
	assert.match(agents, /`onConfigure` 不是工作流恢复完成的可靠终点/);
	assert.match(agents, /必须在 `loadedGraphNode` 再以 `node\.properties` 为最终真源执行一次幂等恢复/);
	assert.match(source, /if \(persist\) transact\(node, \(state\) => \{ state\.view = mode; \}\)/);
	assert.match(source, /function restoreNode\(node\)/);
	assert.match(source, /node\._aaGalleryController\.syncState\(\)/);
	assert.match(source, /node\._aaGalleryController\.search\(\{ reset: true, page: state\.navigation\.page \}\)/);
	assert.match(source, /loadedGraphNode\(node\) \{ if \(isGallery\(node\)\) \{ setupNodeSafely\(node\); restoreNode\(node\); \} \}/);
	assert.match(source, /if \(\(!reset && \(loading \|\| manualContinuation\)\) \|\| \(ended && !reset\)\) return/);
	assert.match(source, /setLoading\(true\);\s*if \(reset\) \{[^}]*for \(const masonry of masonryControllers\(\)\) masonry\.setItems\(\[\], \{ preserveScroll: false \}\)/s);
	assert.match(source, /credentialsRequired[\s\S]*setLoading\(false\);\s*return;/);
	assert.match(source, /needsCredentials = \(cap\?\.authRequired \|\| \(favoritesFeed && cap\?\.favoriteRead\)\) && !hasSourceCredentials\(state\.source\)/);
	assert.match(source, /\(cap\?\.authRequired \|\| \(state\.filters\.feed === "favorites" && cap\?\.favoriteRead\)\) && !hasSourceCredentials\(state\.source\)/);
});

test("gallery toolbar gives each action one clear visual responsibility", () => {
	assert.match(source, /className: "aa-gallery-collection-select"/);
	assert.match(source, /value: "favorites", label: label\("collection\.favorites"/);
	assert.match(source, /state\.filters\.feed === "ranking" \? "ranking" : "search"/);
	assert.match(source, /rankingPeriods/);
	assert.match(source, /className: "aa-gallery-page-control"/);
	assert.match(source, /jumpToPage\(page\)/);
	assert.match(source, /className: "aa-gallery-toolbar-action is-filter", iconName: "filter"/);
	assert.match(source, /className: "aa-gallery-toolbar-action is-prompt", iconName: "tag"/);
	assert.doesNotMatch(source, /iconName: "settings", label: label\("prompt/);
	assert.doesNotMatch(source, /iconName: "more"/);
	assert.match(source, /className: "aa-gallery-toolbar-text-action aa-gallery-refresh", iconName: "refresh", label: label\("refresh", "Refresh"\), ariaLabel: label\("reload", "Reload search"\)/);
	assert.match(source, /className: "aa-gallery-toolbar-text-action aa-gallery-selected__clear"[\s\S]*label: label\("selected\.clear", "Clear"\)/);
	assert.match(source, /className: "aa-gallery-toolbar-text-action aa-gallery-open-settings", iconName: "settings", label: label\("settings\.short", "Settings"\)/);
	assert.match(source, /className: "aa-gallery-toolbar-text-action aa-gallery-open-settings"[^\n]*onClick: openGallerySettings/);
	assert.doesNotMatch(source, /Comfy\.ShowSettingsDialog|app\.ui\?\.settings\?\.show|openComfySettings/);
	assert.match(source, /className: "aa-gallery-toolbar__utilities", children: \[nodeMode, randomMode, refresh, clear, openSettings\]/);
	assert.match(source, /placement === "dashboard" \? el\("span", \{ className: "aa-gallery-node-mode"/);
	assert.match(source, /attrs: \{ role: "status", "aria-live": "polite" \}/);
	assert.match(source, /nodeMode\.dataset\.value = value[\s\S]*nodeMode\.setAttribute\("aria-label"/);
	assert.doesNotMatch(source, /setGalleryNodeMode|node\.mode\s*=|onChange:[^\n]*nodeMode/);
	assert.match(source, /const events = node\.graph\?\.events/);
	assert.match(source, /events\.addEventListener\("node:property:changed", handleChange\)/);
	assert.match(source, /events\.removeEventListener\("node:property:changed", handleChange\)/);
	assert.doesNotMatch(source, /Object\.defineProperty\(node, "mode"/);
	assert.doesNotMatch(source, /setInterval|requestAnimationFrame\([^)]*syncNodeMode/);
	assert.match(source, /runtime\.modeObserver = observeGalleryNodeMode/);
	assert.equal(enLocale.aaalice.gallery.nodeMode.active, "Active");
	assert.equal(zhLocale.aaalice.gallery.nodeMode.bypass, "绕过");
	assert.match(source, /className: "aa-gallery-toolbar__row aa-gallery-toolbar__primary"/);
	assert.match(source, /className: "aa-gallery-toolbar__row aa-gallery-toolbar__context"/);
	assert.match(source, /className: "aa-gallery-toolbar__page-actions"/);
	assert.match(source, /className: "aa-gallery-toolbar__navigation", children: \[collection, pageControl\]/);
	assert.match(source, /className: "aa-gallery-toolbar__tools", children: \[filter, prompt\]/);
	assert.match(source, /code === "upstream_timeout"/);
	assert.match(source, /label\("error\.upstreamTimeout"/);
	assert.match(source, /if \(data\.code\) error\.code = data\.code;/);
	assert.match(theme, /\.aa-gallery-collection-select \{ width: auto; min-width: 82px; max-width: 132px;/);
	assert.match(theme, /\.aa-gallery-toolbar__page-actions \{[^}]*gap: 6px;/);
	assert.match(theme, /\.aa-gallery-toolbar__tools \{ gap: 5px; \}/);
	assert.doesNotMatch(theme, /\.aa-gallery-toolbar__tools \{[^}]*border-left:/);
	assert.match(theme, /\.aa-gallery \{[^}]*container-type: inline-size;/);
	assert.match(theme, /\.aa-gallery-toolbar__page-actions \{[^}]*flex: 0 0 auto;/);
	assert.match(theme, /@container \(max-width: 700px\)[^}]*\.aa-gallery-toolbar-action\.aa-ui-button \{ width: 28px;/);
	assert.match(theme, /@container \(max-width: 580px\)[^]*?\.aa-gallery-view-switcher button:has\(\.aa-ui-icon\), \.aa-gallery-selection-switcher button:has\(\.aa-ui-icon\) \{ width: 31px;/);
	assert.match(source, /const dashboardSwitcherOptions = placement === "dashboard" \? \{ activeLabelOnly: true \} : \{\};/);
	assert.match(source, /className: "aa-gallery-view-switcher"[^\r\n]*\.\.\.dashboardSwitcherOptions/);
	assert.match(source, /className: "aa-gallery-selection-switcher"[\s\S]*\.\.\.dashboardSwitcherOptions/);
	assert.match(uiControls, /activeLabelOnly = false/);
	assert.match(uiControls, /aa-ui-segmented--active-label/);
	assert.match(uiControls, /if \(activeLabelOnly\) root\.style\.gridTemplateColumns = options\.map/);
	assert.match(uiStyles, /\.aa-ui-segmented--active-label \.aa-ui-segmented__thumb \{[^}]*width: calc\(100% - var\(--aa-ui-segment-inactive-total\) - 4px\);[^}]*translateX\(calc\(var\(--aa-ui-segment-index, 0\) \* var\(--aa-ui-segment-compact-size\)\)\)/);
	assert.match(uiStyles, /\.aa-ui-segmented--active-label button:not\(\.is-active\) \.aa-ui-segmented__label \{ width: 0; opacity: 0; \}/);
	assert.doesNotMatch(theme, /transition: flex|aa-gallery-dashboard-switcher/);
	assert.match(theme, /@container aa-dashboard-card \(max-width: 580px\)[\s\S]*\.aa-gallery--dashboard \.aa-gallery-toolbar__primary \{ display: grid;/);
	assert.match(theme, /\.aa-gallery--dashboard \{ grid-template-rows: 76px minmax\(0, 1fr\); \}/);
	assert.match(theme, /\.aa-gallery--dashboard \.aa-gallery-toolbar \{[^}]*grid-template-rows: 30px 30px;/);
	assert.match(theme, /\.aa-gallery--dashboard \.aa-gallery-toolbar__primary \{[^}]*grid-template-rows: 30px;/);
	assert.match(theme, /\.aa-gallery--dashboard \.aa-gallery-selection-switcher \{[^}]*grid-column: 3; grid-row: 1;/);
	assert.match(theme, /\.aa-gallery--dashboard \.aa-gallery-toolbar__search \{[^}]*width: 30px;[^}]*grid-column: 4; grid-row: 1;/);
	assert.match(theme, /\.aa-gallery--dashboard \.aa-gallery-toolbar__search:has\(\.aa-gallery-search\.is-open\) \{[^}]*grid-column: 1 \/ -1;/);
	assert.match(theme, /\.aa-gallery--dashboard \.aa-gallery-toolbar-action\.aa-ui-button, \.aa-gallery--dashboard \.aa-gallery-toolbar-text-action\.aa-ui-button \{[^}]*width: 28px;[^}]*justify-content: center;/);
	assert.match(theme, /\.aa-gallery--dashboard :is\(\.aa-gallery-toolbar-action, \.aa-gallery-toolbar-text-action\)\.aa-ui-button > \.aa-ui-button__label, \.aa-gallery--dashboard \.aa-gallery-random-mode__switch \{ display: none; \}/);
	assert.match(source, /minCardWidth: placement === "dashboard" \? 108 : 144, gap: placement === "dashboard" \? 5 : 6, maxColumns: placement === "dashboard" \? 6 : 5/);
	assert.match(theme, /@container aa-dashboard-card \(max-width: 430px\) \{[\s\S]*\.aa-gallery--dashboard \.aa-gallery-node-mode__label \{ display: none; \}/);
	assert.match(theme, /\.aa-gallery-toolbar-text-action\.aa-ui-button \{[^}]*min-height: 26px;[^}]*padding: 4px 8px;[^}]*font-size: 11px;/);
	assert.match(theme, /@container \(max-width: 580px\) \{[^\n]*\.aa-gallery--node \.aa-gallery-toolbar-text-action \.aa-ui-button__label \{ display: none; \}/);
	assert.equal(enLocale.aaalice.gallery.refresh, "Refresh");
	assert.equal(zhLocale.aaalice.gallery.refresh, "刷新");
	assert.equal(enLocale.aaalice.gallery.settings.short, "Settings");
	assert.equal(zhLocale.aaalice.gallery.settings.short, "设置");
});

test("random draw mode is an explicit persistent switch with no redundant bottom banner", () => {
	assert.match(source, /className: "aa-gallery-toolbar-text-action aa-gallery-random-mode", iconName: "shuffle"/);
	assert.match(source, /randomMode\.setAttribute\("role", "switch"\)/);
	assert.match(source, /className: "aa-gallery-random-mode__switch"[^\n]*"aria-hidden": "true"/);
	assert.match(source, /transact\(node, \(state\) => \{ state\.randomMode = active; \}\)/);
	assert.match(source, /randomMode\.setAttribute\("aria-checked", String\(active\)\)/);
	assert.match(source, /pageControl\.hidden = active/);
	assert.match(source, /syncRandomModePresentation\(state\.randomMode\)/);
	assert.match(source, /if \(randomMode\) params\.set\("random", "1"\)/);
	assert.match(source, /randomSession\.take\(candidates\)/);
	assert.match(source, /randomMisses < RANDOM_UNIQUE_MISS_LIMIT \? "random" : null/);
	assert.doesNotMatch(source, /label\("random\.active"/);
	assert.doesNotMatch(source, /className: "aa-gallery-status is-random/);
	assert.match(theme, /\.aa-gallery-random-mode\.aa-ui-button\.is-active[^}]*linear-gradient[^}]*box-shadow:/s);
	assert.match(theme, /\.aa-gallery-random-mode\.aa-ui-button\.is-active \.aa-gallery-random-mode__thumb \{[^}]*transform: translateX\(11px\)/);
	assert.equal(enLocale.aaalice.gallery.random.on, "Random on");
	assert.equal(zhLocale.aaalice.gallery.random.on, "随机中");
	assert.equal(zhLocale.aaalice.gallery.random.draw, "再抽一组");
});

test("selection mode switcher persists workflow state and enforces single selection", () => {
	assert.match(source, /segmentedControl\(\{ className: "aa-gallery-selection-switcher"/);
	assert.match(source, /value: "single", label: label\("selectionMode\.single", "Single"\), iconName: "selectionSingle"/);
	assert.match(source, /value: "multi", label: label\("selectionMode\.multiple", "Multiple"\), iconName: "selectionMultiple"/);
	assert.match(source, /state\.selectionMode = mode/);
	assert.match(source, /node\.graph\?\.change\?\.\(\)/);
	assert.match(source, /state\.selectionMode === "single" \? \[selection\] : \[\.\.\.state\.selections, selection\]/);
	assert.match(source, /state\.selections = state\.selections\.slice\(0, 1\)/);
	assert.match(source, /openSingleSelectionDialog/);
	assert.match(theme, /\.aa-gallery-selection-switcher\[data-value="single"\]/);
	assert.match(theme, /\.aa-gallery\[data-mode="selected"\] \.aa-gallery-toolbar__page-actions, \.aa-gallery\[data-mode="selected"\] \.aa-gallery-random-mode, \.aa-gallery\[data-mode="selected"\] \.aa-gallery-refresh \{ display: none; \}/);
	assert.equal(enLocale.aaalice.gallery.selectionMode.single, "Single");
	assert.equal(zhLocale.aaalice.gallery.selectionMode.multiple, "多选");
});

test("page navigation uses a compact custom control instead of a native number form", () => {
	assert.match(source, /className: "aa-gallery-page-popover", width: 224/);
	assert.match(source, /input\.type = "text"; input\.inputMode = "numeric"; input\.pattern = "\[0-9\]\*"/);
	assert.doesNotMatch(source, /input\.type = "number"/);
	assert.doesNotMatch(source, /aa-gallery-page-popover__(?:hero-icon|header|heading|current|steps|jump)/);
	assert.match(source, /className: "aa-gallery-page-popover__step is-previous"[^]*iconName: "moveDown"/);
	assert.match(source, /className: "aa-gallery-page-popover__step is-next"[^]*iconName: "moveDown"/);
	assert.match(source, /className: "aa-gallery-page-popover__field"/);
	assert.match(source, /className: "aa-gallery-page-popover__go"[^]*iconName: "arrowRight"/);
	assert.match(source, /className: "aa-gallery-page-popover__rail", children: \[previous, field, next\]/);
	assert.match(source, /label\("page\.unit", "p\."\)/);
	assert.match(source, /queueMicrotask\(\(\) => \{ input\.focus/);
	assert.match(theme, /\.aa-gallery-page-popover \{[^}]*padding: 9px;[^}]*border-radius: 12px;/);
	assert.match(theme, /\.aa-gallery-page-popover__rail \{[^}]*grid-template-columns: 36px minmax\(116px, 1fr\) 36px/);
	assert.match(theme, /\.aa-gallery-page-popover__field:focus-within/);
	assert.match(theme, /\.aa-gallery-page-popover__input \{[^}]*font-size: 12px;[^}]*text-align: right;/);
	assert.match(theme, /\.aa-gallery-page-popover__go\.aa-ui-button \{[^}]*width: 30px;[^}]*border: 0;[^}]*border-radius: 999px;[^}]*background: var\(--aa-ui-node-accent-soft\)/);
});

test("gallery refresh and settings utilities expose their real state and destination", () => {
	assert.match(source, /refresh\.classList\.add\("is-refreshing"\)/);
	assert.match(source, /updateRefreshPresentation\(stateFor\(node\)\.randomMode \? label\("random\.drawing", "Drawing…"\) : label\("refreshing", "Refreshing…"\), undefined, "loading"\)/);
	assert.match(source, /refresh\.querySelector\("\.aa-ui-button__label"\)\.textContent = visibleText/);
	assert.match(source, /await controller\.search\(\{ reset: true, page: 1 \}\)/);
	assert.match(source, /finally \{ refreshing = false; refresh\.disabled = false; refresh\.classList\.remove\("is-refreshing"\); updateRefreshIdlePresentation\(\); \}/);
	assert.match(theme, /\.aa-gallery-refresh\.is-refreshing \.aa-ui-icon \{ animation: aa-gallery-status-spin \.72s linear infinite; \}/);
	assert.match(source, /function openGallerySettings\(\) \{[^]*openSettingsDialog\(\)/);
	assert.match(source, /className: "aa-gallery-toolbar-text-action aa-gallery-open-settings"[^\n]*onClick: openGallerySettings/);
	assert.doesNotMatch(source, /Comfy\.ShowSettingsDialog|app\.ui\?\.settings\?\.show|settings\.pathHint/);
});

test("browse and selected switcher states use distinct semantic colors", () => {
	assert.match(source, /segmentedControl\(\{ className: "aa-gallery-view-switcher"/);
	assert.match(source, /value: "browse", label: label\("tab\.browse", "Browse"\), iconName: "layout"/);
	assert.match(source, /value: "selected", label: label\("tab\.selected", "Selected"\), iconName: "statusCheck"/);
	assert.match(theme, /\.aa-gallery-view-switcher \{[^}]*--p-blue-400/);
	assert.match(theme, /\.aa-gallery-view-switcher\[data-value="selected"\] \{[^}]*--p-green-400/);
	assert.match(theme, /\.aa-gallery-view-switcher \.aa-ui-segmented__thumb \{[^}]*--aa-gallery-view-tone/);
	assert.match(theme, /\.aa-gallery-view-switcher button:has\(\.aa-ui-icon\) \{[^}]*gap: 5px;[^}]*padding-inline: 9px;/);
	assert.match(theme, /\.aa-gallery-view-switcher button\.is-active \.aa-ui-icon \{[^}]*color: var\(--aa-gallery-view-tone\);[^}]*transform: scale\(1\);/);
	assert.doesNotMatch(theme, /\.aa-gallery-selected-count/);
	assert.doesNotMatch(source, /aa-gallery-selected-count|selectionCountValue/);
});

test("gallery cards use direct selection and adaptive animated overlay actions", () => {
	assert.match(source, /card\.addEventListener\("click", \(event\) => runSelection\(event\)\)/);
	assert.match(source, /iconName, action, actionIndex, onClick/);
	for (const action of ["edit", "favorite", "copyPrompt", "interrogate", "detail"]) assert.match(theme, new RegExp(`\\.aa-gallery-card-action\\.is-${action}`));
	assert.match(theme, /\.aa-gallery-card-action\.is-favorite\.is-active \.aa-ui-icon \{[^}]*fill: currentColor/);
	assert.match(theme, /\.aa-gallery-detail__action\.is-favorite\.is-active \.aa-ui-icon \{[^}]*fill: currentColor/);
	assert.doesNotMatch(source, /actionButton\("statusCheck", "select"/);
	assert.doesNotMatch(theme, /\.aa-gallery-card-action\.is-select/);
	assert.match(source, /if \(event\?\.type === "click"\) restoreGalleryScrollFocus\(card, card, event\)/);
	assert.match(source, /restoreGalleryScrollFocus\(card, control, event\); onClick\(event\)/);
	assert.doesNotMatch(source, /(?:card|control)\.blur\(\)/);
	assert.match(source, /function galleryCardActionLayout\(width, height, count\)/);
	assert.match(source, /availableWidth >= linearSize && availableHeight >= buttonSize/);
	assert.match(source, /availableHeight >= linearSize && availableWidth >= buttonSize/);
	assert.ok(source.indexOf("availableHeight >= linearSize") < source.indexOf("availableWidth >= linearSize"), "card actions must prefer a vertical column when both layouts fit");
	assert.match(source, /card\._aaVirtualMasonryLayout = \(width, height\) => \{ card\.dataset\.actionsLayout = galleryCardActionLayout\(width, height, view\.visibleActions\); \}/);
	assert.match(theme, /\.aa-gallery-card\.aa-virtual-masonry__item \{[^}]*position: absolute;/);
	assert.match(theme, /\.aa-gallery-card__actions \{[^}]*top: 7px;[^}]*right: 7px;/);
	assert.doesNotMatch(theme, /\.aa-gallery-card__actions \{[^}]*top: 50%;/);
	assert.doesNotMatch(theme, /\.aa-gallery-card(?:\.[^{]+)? \{[^}]*container-type: inline-size/);
	assert.match(source, /--aa-gallery-action-delay", `\$\{actionIndex \* 34\}ms`/);
	assert.match(theme, /var\(--aa-gallery-action-delay\)/);
});

test("favorite entry stays visible before login and explains unavailable writes", () => {
	assert.match(source, /favoriteCapability\?\.favoriteRead \|\| favoriteCapability\?\.favoriteWrite/);
	assert.match(source, /if \(!hasSourceCredentials\(source\)\) \{[\s\S]*?showFavoriteNotice\(source, "login"\);[\s\S]*?return false;/);
	assert.match(source, /label\("card\.favoriteConfigure", "Configure account"\)/);
	assert.match(source, /dialog\.close\(\); openGallerySettings\(\)/);
	assert.match(source, /if \(!cap\?\.favoriteWrite\) \{[\s\S]*?showFavoriteNotice\(source, "readOnly"\);[\s\S]*?return false;/);
	assert.match(source, /function notifyFavorite\(source, targetFavorite, error = null\)/);
	assert.match(source, /app\.extensionManager\?\.toast\?\.add\?\.\(/);
	assert.match(source, /notifyFavorite\(post\.source, targetFavorite\)/);
	assert.match(source, /notifyFavorite\(post\.source, targetFavorite, error\)/);
	assert.match(source, /notifyFavorite\(detail\.source, targetFavorite\)/);
	assert.match(source, /notifyFavorite\(detail\.source, targetFavorite, error\)/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.card.favoriteAdded, "string");
		assert.equal(typeof locale.aaalice.gallery.card.favoriteRemoved, "string");
		assert.equal(typeof locale.aaalice.gallery.card.favoriteFailed, "string");
	}
	assert.match(theme, /\.aa-gallery-favorite-notice \{/);
});

test("selected gallery cards use configurable approval stamps and a clear blue highlight", () => {
	assert.match(source, /el\("div", "aa-gallery-card__selected-layer"\)/);
	assert.match(source, /const SELECTION_STAMPS = \[[^\]]+"exclusiveCertification"/);
	assert.match(source, /function createSelectionStamp\(initialStyle, \{ preview = false \} = \{\}\)/);
	assert.match(source, /selectionStamp\.setStyle\(getSettings\(\)\?\.selectionStamp\)/);
	assert.match(source, /stateFor\(view\.node\)\.selections\.some\(\(item\) => selectionKey\(item\) === `\$\{post\.source\}:\$\{post\.postId\}`\)/);
	assert.doesNotMatch(source, /selectionOrder|selection-order|selectionState|selection-state/);
	assert.match(theme, /\.aa-gallery-card__selected-layer \{[^}]*inset: 0;[^}]*opacity: 0;[^}]*var\(--p-blue-500[^}]*mix-blend-mode: screen/);
	assert.doesNotMatch(theme, /\.aa-gallery-card__selected-layer \{[^}]*backdrop-filter/);
	assert.match(theme, /\.aa-gallery-card__selection \{[^}]*top: 50%;[^}]*left: 50%;[^}]*opacity: 0;/);
	assert.match(theme, /\.aa-gallery-card__selection \{[^}]*width: 58px;[^}]*height: 58px;[^}]*border: 2px solid currentColor/);
	assert.match(theme, /\.aa-gallery-card\.is-selected \.aa-gallery-card__image \{ filter: brightness\(1\.08\) saturate\(1\.06\); \}/);
	assert.doesNotMatch(theme, /selection-order|selection-state/);
	assert.match(theme, /\.aa-gallery-card__selection \{[^}]*--aa-gallery-selection-mark-scale: 1\.18;/);
	assert.match(theme, /\.aa-gallery-card\.is-selected \.aa-gallery-card__selection \{[^}]*opacity: \.94;[^}]*scale\(var\(--aa-gallery-selection-mark-scale\)\)/);
	assert.doesNotMatch(theme, /\.aa-gallery-card\.is-selected \.aa-gallery-card__selection(?:\[|:|\s|\{)[^{}]*\{[^}]*scale\(1\)/);
	for (const style of ["approved", "pass", "qa", "audit", "certified", "verified", "selected", "quality", "accepted", "official", "checked", "pure", "crown"]) assert.match(theme, new RegExp(`data-stamp="${style}"`));
	for (const style of ["inspectionDate", "inspectionReverse", "passDate", "qaDate", "reviewBadge", "birthday", "organic", "silverCapital", "visa", "hotPick", "soldOut", "hot", "nationwideShipping", "nationwideFlight", "sfShipping", "qualityGuarantee", "praise", "delicacySquare", "traditionVertical", "chinaCuisine", "ruyi", "snowCuisine", "traditionCircle", "delicacyWide", "traditionWide", "auspicious", "exclusiveCertification"]) assert.match(source, new RegExp(`"${style}"`));
	assert.match(source, /function soldOutPostalArt\(\)/);
	assert.match(source, /XIANYU/); assert.match(source, /卖掉了/); assert.match(source, /SOLD OUT/);
	assert.match(source, /const SELECTION_STAMP_ART = Object\.freeze\(\{[^}]*soldOutPostal: soldOutPostalArt,[^}]*quarantineQualified: quarantineQualifiedArt,/s);
	assert.doesNotMatch(source, /anime100|animeStampArt|aa-gallery-stamp__anime/);
	assert.doesNotMatch(theme, /anime100|aa-gallery-stamp__anime/);
	assert.match(source, /const createArt = SELECTION_STAMP_ART\[style\];[^}]*art\.replaceChildren\(\.\.\.\(createArt \? \[createArt\(\)\] : \[\]\)\);/s);
	assert.doesNotMatch(source, /\.hidden = style !==/);
	assert.match(theme, /\.aa-gallery-stamp__art \{ display: contents; \}/);
	assert.match(theme, /data-stamp="soldOutPostal"[^}]*--aa-gallery-stamp: var\(--p-gray-500/);
	assert.match(source, /function quarantineQualifiedArt\(\)/);
	assert.match(source, /SELECTION_STAMPS\.includes\(settings\.selectionStamp\) \? settings\.selectionStamp : "quarantineQualified"/);
	assert.match(source, /aa-gallery-stamp__quarantine-copy[^']*<text x="32" y="25">检疫<\/text><text x="32" y="45">合格<\/text>/);
	assert.doesNotMatch(source, /aa-gallery-stamp__postal-board" transform="rotate/);
	assert.doesNotMatch(theme, /aa-gallery-(?:card__selection|stamp__main)[^{}]*\{[^}]*rotate\(/);
	assert.match(theme, /data-stamp="quarantineQualified"[^}]*border: 0;[^}]*drop-shadow/);
	assert.match(theme, /aa-gallery-stamp__quarantine text[^}]*font-size: 19px;[^}]*dominant-baseline: middle/);
	assert.match(source, /traditionVertical: \["", "传\\n统\\n文\\n化", ""\]/);
	assert.match(source, /ruyi: \["", "如\\n意", ""\]/);
	assert.match(source, /auspicious: \["", "吉\\n祥", ""\]/);
	assert.match(source, /const TRADITIONAL_SEAL_SPECS = Object\.freeze/);
	assert.match(source, /function traditionalSealArt\(style\)/);
	assert.match(source, /Object\.keys\(TRADITIONAL_SEAL_SPECS\).*traditionalSealArt\(style\)/);
	assert.doesNotMatch(source, /maskId|<mask|mask="url/);
	assert.doesNotMatch(theme, /mask-composite|stroke-dasharray|repeating-linear-gradient\(107deg/);
	assert.match(theme, /\.aa-gallery-stamp__traditional \{[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%/);
	assert.match(theme, /\.aa-gallery-stamp__traditional text \{[^}]*font-family: "Microsoft YaHei", "SimHei", sans-serif;[^}]*dominant-baseline: central;/);
	assert.match(theme, /\.aa-gallery-card__selection\[data-stamp="reviewBadge"\] \.aa-gallery-stamp__main,[^}]*width: calc\(100% - 4px\);[^}]*font-size: 10\.5px;/);
	assert.match(theme, /\.aa-gallery-settings__stamp-option \{[^}]*overflow: visible/);
	assert.match(theme, /\.aa-gallery-settings__stamp-option \{[^}]*min-height: 112px/);
	assert.match(theme, /\.aa-gallery-card__selection\.is-preview \{[^}]*scale\(1\.06\)/);
	assert.match(source, /className: "aa-gallery-settings__stamp-picker"/);
	assert.match(source, /selectionStamp: selectedStamp/);
});

test("project UI rules require visible features to be designed, not merely functional", () => {
	assert.match(agents, /功能逻辑完成不等于界面完成/);
	assert.match(agents, /视觉层级、比例、留白、对齐、色彩、状态辨识、空间占用、动效和主题适配/);
	assert.match(agents, /禁止用过大的实心标记、大面积高不透明度遮罩/);
	assert.match(agents, /多来源、多账户、多模型或多对象配置禁止把所有完整表单同时展开/);
	assert.match(agents, /一个界面只保留一套主要导航/);
	assert.match(agents, /默认只允许页面内容区承担主要纵向滚动/);
});

test("gallery cards receive icon plus iconButton from the entry", () => {
	assert.match(source, /effectivePrompt, el, finalPrompt, getSettings, icon, iconButton,/);
});

test("decoded preview pool only takes ownership when a mounted card is released", () => {
	assert.match(source, /image\._aaVirtualMasonryRelease = \(\) =>/);
	assert.match(source, /image\.getAttribute\("src"\)/);
	assert.match(source, /rememberPreviewImage\(loadedSrc, image, image\.naturalWidth, image\.naturalHeight\)/);
	assert.doesNotMatch(source, /image\.currentSrc \|\| src/);
	assert.doesNotMatch(source, /_aaGalleryKeepSrc/);
});

test("gallery cards omit visible post identity and keep only useful hover metadata", () => {
	assert.match(source, /const hasRating = Boolean\(post\.rating\) && Boolean\(capability\(post\.source\)\?\.ratings\?\.length\)/);
	assert.match(source, /\.\.\.\(rating \? \[rating\] : \[\]\)/);
	assert.match(source, /className: "aa-gallery-card__rating"/);
	assert.match(source, /attrs: \{ "data-rating": ratingTone\(post\.rating\) \}/);
	assert.doesNotMatch(source, /aa-gallery-card__identity/);
	assert.doesNotMatch(source, /aa-gallery-card__resolution/);
	assert.doesNotMatch(theme, /aa-gallery-card__resolution/);
	for (const rating of ["safe", "sensitive", "questionable", "explicit"]) assert.match(theme, new RegExp(`data-rating="${rating}"`));
	assert.match(theme, /\.aa-gallery-card \{[^}]*border-radius: 8px;/);
});

test("AI TAG cards recover an exact preview lazily and never render an empty rating pill", () => {
	assert.match(source, /image\.addEventListener\("error", \(\) => \{/);
	assert.match(source, /surface\.classList\.add\("is-error"\)/);
	assert.match(source, /markFailedPreview\(src\)/);
	assert.match(source, /void controller\.recoverPreview\(post, image\)/);
	assert.match(source, /failedAt && failedAt > Date\.now\(\)/);
	assert.match(source, /if \(post\.source !== "aitag" \|\| image\.dataset\.previewRecovery\) return/);
	assert.match(source, /post\.previewUrl = detail\.previewUrl/);
	assert.match(source, /detail\.rating && cap\?\.ratings\?\.length/);
});

test("credential-required sources route the empty state to Gallery settings", () => {
	assert.match(source, /needsCredentials = \(cap\?\.authRequired \|\| \(favoritesFeed && cap\?\.favoriteRead\)\) && !hasSourceCredentials\(state\.source\)/);
	assert.match(source, /error\.credentialsRequired/);
	assert.match(source, /\(cap\?\.authRequired \|\| \(state\.filters\.feed === "favorites" && cap\?\.favoriteRead\)\) && !hasSourceCredentials\(state\.source\)\) openGallerySettings\(\)/);
});

test("gallery hover copies the launcher preview card and translates its tag rows", () => {
	const hoverSource = source.slice(source.indexOf("const showHover ="), source.indexOf("const openDetail ="));
	for (const className of ["aa-gallery-hover__media", "aa-gallery-hover__info", "aa-gallery-hover__stats", "aa-gallery-hover__tags", "aa-gallery-hover-tooltip"]) assert.match(source, new RegExp(`className: "${className}"`));
	assert.match(source, /void getDetail\(post\)\.then/);
	assert.match(source, /if \(!content\.isConnected \|\| !tooltip\.isOpenFor\(anchor\)\) return/);
	assert.match(source, /placement: "side"/);
	assert.match(source, /post\.sampleUrl && post\.sampleUrl !== post\.previewUrl/);
	assert.match(source, /else if \(searchSampleSrc\) upgradeSample\(searchSampleSrc\)/);
	assert.match(source, /for \(const post of visiblePosts\.slice\(0, 12\)\)/);
	assert.match(source, /previewPrefetchActive < 4/);
	assert.match(source, /while \(previewCache\.size > 16\)/);
	assert.match(source, /const base = el\("img", \{ attrs: \{ src: readySampleSrc \|\| previewSrc/);
	assert.match(source, /const upgrade = el\("img", \{ className: "is-upgrade"/);
	assert.match(source, /upgrade\.classList\.add\("is-visible"\)/);
	assert.match(source, /base\.src = sampleSrc;/);
	assert.doesNotMatch(source, /image\.src = proxyUrl\(detail\.source, detail\.mediaUrl\)/);
	assert.doesNotMatch(hoverSource, /capability\(post\.source\)\?\.displayName|`#\$\{post\.postId\}`/);
	assert.match(hoverSource, /anchor\.querySelector\?\.\("img"\)/);
	assert.match(hoverSource, /previewWidth > 0 && previewHeight > 0 \? previewWidth : postWidth/);
	assert.match(hoverSource, /Math\.max\(150, Math\.round\(hoverWidth \* height \/ width\)\)/);
	assert.match(hoverSource, /Math\.min\(240, Math\.max\(40, Math\.floor\(window\.innerHeight \* 0\.35\)\)\)/);
	assert.match(hoverSource, /Math\.min\(maxInfoHeight, Math\.max\(40, Math\.ceil\(info\.scrollHeight\)\)\)/);
	assert.match(hoverSource, /content\.style\.setProperty\("--aa-gallery-hover-image-height", `\$\{imageHeight\}px`\)/);
	assert.match(hoverSource, /content\.style\.setProperty\("--aa-gallery-hover-info-height", `\$\{infoHeight\}px`\)/);
	assert.match(hoverSource, /content\.classList\.toggle\("is-tall-crop", imageHeight > Math\.max\(0, window\.innerHeight - 20 - infoHeight\)\)/);
	assert.doesNotMatch(hoverSource, /style: \{ "--aa-gallery-hover-image-height"/);
	assert.match(hoverSource, /\["artist", "brush", 3\], \["character", "person", 4\], \["copyright", "movie", 2\]/);
	assert.match(hoverSource, /stat\("image", resolution/);
	assert.match(hoverSource, /stat\("thumbUp", score/);
	assert.match(hoverSource, /stat\("favorite", favorites/);
	assert.match(hoverSource, /stat\("tag", tags, label\("hover\.tags", "Tags"\)\)/);
	assert.match(hoverSource, /tags\.textContent = String\(tagCount\(detail\.tags\)\)/);
	assert.match(hoverSource, /tag\.replaceAll\("_", " "\)/);
	assert.match(hoverSource, /streamTagTranslations\(\{/);
	assert.match(hoverSource, /translated \? `\$\{tag\.replaceAll\("_", " "\)\} \(\$\{translated\}\)`/);
	assert.match(hoverSource, /signal: currentTranslation\.signal/);
	assert.match(source, /tooltip\.hide = \(\) => \{[^}]*geometryCleanup\?\.\(\)/s);
	assert.match(theme, /\.aa-gallery-hover-tooltip\.aa-ui-tooltip \{[^}]*width: min\(320px[^}]*max-height: calc\(100vh - 20px\)[^}]*border: 0;[^}]*box-shadow: var\(--aa-ui-edge-shadow\), var\(--aa-ui-shadow\)/);
	assert.match(theme, /\.aa-gallery-hover \{[^}]*display: grid;[^}]*grid-template-rows: min\(var\(--aa-gallery-hover-image-height, 320px\), calc\(100vh - 20px - var\(--aa-gallery-hover-info-height, 40px\)\)\) var\(--aa-gallery-hover-info-height, 40px\);[^}]*border-radius: 14px/);
	assert.doesNotMatch(theme, /\.aa-gallery-hover \{[^}]*grid-template-rows:[^}]*96px/);
	assert.match(theme, /\.aa-gallery-hover__media \{[^}]*min-height: 0;[^}]*background: var\(--aa-ui-canvas\)/);
	assert.match(theme, /\.aa-gallery-hover__media > img \{[^}]*object-fit: contain/);
	assert.match(theme, /\.aa-gallery-hover\.is-tall-crop \.aa-gallery-hover__media \{[^}]*place-items: start center/);
	assert.match(theme, /\.aa-gallery-hover\.is-tall-crop \.aa-gallery-hover__media > img \{[^}]*height: auto/);
	assert.doesNotMatch(theme, /\.aa-gallery-hover\.is-tall-crop \.aa-gallery-hover__media > img \{[^}]*object-fit: fill/);
	assert.match(theme, /\.aa-gallery-hover__info \{[^}]*min-height: 0;[^}]*align-content: start;[^}]*padding: 9px 11px;[^}]*overflow-y: auto/);
	assert.match(theme, /\.aa-gallery-hover__stats \{[^}]*display: flex/);
	assert.match(theme, /\.aa-gallery-hover__tag-row > p \{[^}]*flex-wrap: wrap[^}]*font-size: 11px/);
	assert.match(theme, /\.aa-gallery-hover__loading \{[^}]*width: 24px;[^}]*height: 24px;[^}]*border-radius: 999px/);
	assert.match(theme, /@keyframes aa-gallery-loader-orbit/);
});

test("gallery micro-interactions acknowledge state without adding polling or card observers", () => {
	for (const animation of ["search-in", "view-in", "count-update", "selection-feedback", "favorite-feedback", "card-scan", "card-scan-glow", "media-in"]) assert.match(theme, new RegExp(`@keyframes aa-gallery-${animation}`));
	assert.match(source, /is-selection-feedback/);
	assert.match(source, /is-acknowledged/);
	assert.match(source, /aria-expanded", "true"/);
	assert.match(theme, /@media \(prefers-reduced-motion: reduce\) \{ \.aa-gallery \*/);
	assert.doesNotMatch(source, /setInterval/);
});

test("gallery cards use pointer-coalesced lift, tilt, and glare without moving the masonry root", () => {
	assert.match(source, /export function installMasonryCardMotion\(container\)/);
	assert.match(source, /if \(!frame\) frame = requestAnimationFrame\(draw\)/);
	assert.match(source, /--aa-gallery-tilt-x/);
	assert.match(source, /--aa-gallery-glare-position/);
	assert.match(source, /prefers-reduced-motion: reduce/);
	assert.match(source, /event\.target\.closest\("\.aa-gallery-card"\)/);
	assert.match(source, /card\._aaVirtualMasonryDispose/);
	assert.match(theme, /\.aa-gallery-card__surface \{[^}]*transform-style: preserve-3d/);
	assert.match(theme, /rotateX\(var\(--aa-gallery-tilt-x\)\) rotateY\(var\(--aa-gallery-tilt-y\)\)/);
	assert.match(theme, /\.aa-gallery-card__surface::before \{[^}]*radial-gradient[^}]*linear-gradient/);
	assert.match(theme, /\.aa-gallery-card\.aa-virtual-masonry__item \{[^}]*contain: layout style;[^}]*transition: transform \.24s/);
});

test("gallery uses the shared styled listbox instead of native select controls", () => {
	assert.match(source, /listboxControl/);
	assert.doesNotMatch(source, /selectControl|document\.createElement\("select"\)/);
	assert.match(source, /getCapabilities\(\)\.map\(\(item\) => \(\{ value: item\.source, label: item\.displayName, iconName: "globe" \}\)\)/);
	assert.match(source, /sortIcons = \{ latest: "statusIdle", new: "statusIdle", score: "statusCheck", favcount: "favorite" \}/);
	assert.equal(enLocale.aaalice.gallery.collection.random, undefined);
	assert.equal(zhLocale.aaalice.gallery.collection.random, undefined);
	assert.match(source, /iconName: "statusIdle" \}\);/);
	assert.match(source, /value: "favorites"[^}]*iconName: "favorite"/);
	assert.match(theme, /\.aa-gallery-toolbar__primary > \.aa-ui-listbox-select \{/);
	assert.match(theme, /\.aa-ui-listbox-select__trigger \{[^}]*border-radius: 9px;/);
});

test("gallery rating filter stays focused, localized, and semantically colored", () => {
	const filterSource = source.slice(source.indexOf("function openFilter"), source.indexOf("function createPageControl"));
	assert.match(filterSource, /className: "aa-gallery-filter-popover", width: 300/);
	assert.match(source, /className: "aa-gallery-prompt-popover", width: 440/);
	for (const iconName of ["ratingGeneral", "ratingSensitive", "ratingQuestionable", "ratingExplicit"]) assert.match(source, new RegExp(iconName));
	assert.match(theme, /\.aa-gallery-filter-ratings \.aa-ui-multiselect__leading-icon/);
	assert.doesNotMatch(filterSource, /galleryPopoverHeader|filter\.sort|sortPanel|listboxControl/);
	assert.match(filterSource, /label: ratingLabel\(value\), iconName: ratingIcon\(value\), attrs: \{ "data-rating": ratingTone\(value\) \}/);
	assert.match(filterSource, /onChange: \(values\) => \{ selectedRatings = values; transact\(node, \(current\) => \{ current\.filters\.ratings = values; \}\); \}/);
	assert.doesNotMatch(filterSource, /current\.filters\.feed = "search"|current\.filters\.period = ""/);
	assert.match(source, /if \(state\.filters\.feed === "ranking"\) \{ params\.delete\("query"\); params\.delete\("sort"\); params\.set\("period", state\.filters\.period\); \}/);
	assert.match(filterSource, /className: "aa-gallery-filter-popover__header"/);
	assert.match(filterSource, /className: "aa-gallery-filter-ratings"/);
	assert.match(source, /function ratingLabel\(value\)/);
	for (const rating of ["general", "safe", "sensitive", "questionable", "explicit"]) {
		assert.equal(typeof enLocale.aaalice.gallery.rating[rating], "string");
		assert.equal(typeof zhLocale.aaalice.gallery.rating[rating], "string");
		assert.match(theme, new RegExp(`\\.aa-gallery-filter-ratings \\.aa-ui-multiselect__option\\[data-rating="${rating}"\\]`));
	}
	assert.deepEqual(zhLocale.aaalice.gallery.rating, {
		general: "全龄", safe: "安全", sensitive: "敏感",
		questionable: "暗示", explicit: "露骨", unknown: "未知",
	});
	assert.match(theme, /\.aa-gallery-filter-popover__body \{ padding: 4px 10px 9px; \}/);
	assert.match(theme, /\.aa-gallery-filter-ratings\.aa-ui-multiselect \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
	assert.match(theme, /\.aa-gallery-filter-ratings \.aa-ui-multiselect__option\.is-selected \{[^}]*var\(--aa-gallery-rating-tone\)/);
});

test("gallery prompt settings use compact pages and category-specific colors", () => {
	const promptSource = source.slice(source.indexOf("function openPromptOptions"), source.indexOf("function setupNode"));
	assert.match(promptSource, /className: "aa-gallery-prompt-popover", width: 440/);
	assert.match(promptSource, /className: "aa-gallery-prompt-tabs"/);
	for (const panel of ["categories", "format", "exclude"]) assert.match(promptSource, new RegExp(`"data-panel": "${panel}"`));
	assert.match(promptSource, /panel\.hidden = name !== value/);
	assert.match(promptSource, /attrs: \{ "data-category": value \}/);
	assert.match(promptSource, /excluded\.value = \(settings\?\.blacklist \|\| \[\]\)\.join\("\\n"\)/);
	assert.match(promptSource, /saveGlobalBlacklist\(excluded\.value\)/);
	assert.doesNotMatch(promptSource, /state\.prompt\.excludedTags/);
	assert.doesNotMatch(promptSource, /underscoresHint|parenthesesHint|el\("small"/);
	assert.doesNotMatch(promptSource, /aa-gallery-tool-section|aa-gallery-prompt-layout__lower|aa-gallery-tool-popover__footer/);
	assert.match(theme, /\.aa-gallery-prompt-popover__body \{[^}]*min-height: 128px/);
	assert.match(theme, /\.aa-gallery-prompt-panel\[hidden\] \{ display: none !important; \}/);
	assert.match(theme, /\.aa-gallery-prompt-panel\[data-panel="exclude"\], \.aa-gallery-prompt-panel\[data-panel="outputFilter"\] \{[^}]*height: 128px/);
	assert.match(theme, /\.aa-gallery-prompt-excluded \{[^}]*width: 100%;[^}]*height: 100%/);
	assert.match(theme, /\.aa-gallery-prompt-transform strong \{[^}]*font-size: 11\.5px/);
	assert.doesNotMatch(theme, /\.aa-gallery-prompt-transform small/);
	assert.match(theme, /\.aa-gallery-prompt-categories\.aa-ui-multiselect \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
	for (const category of ["artist", "copyright", "character", "general", "meta"]) {
		assert.match(theme, new RegExp(`\\.aa-gallery-prompt-categories \\.aa-ui-multiselect__option\\[data-category="${category}"\\]`));
	}
});

test("gallery status cannot render as an unexplained empty capsule", () => {
	assert.match(source, /className: "aa-gallery-status is-loading"[^;]*icon\("refresh"\)/);
	assert.match(source, /classList\.toggle\("is-top", !posts\.length\)/);
	assert.match(theme, /\.aa-gallery-status\.is-error\.is-top \{ top: 14px; bottom: auto; \}/);
	assert.match(source, /className: "aa-gallery-status is-empty"/);
	assert.match(theme, /\.aa-gallery-status\.is-empty \{ top: 14px; bottom: auto;/);
	assert.match(theme, /\.aa-gallery-status\.is-empty > span \{ overflow: visible; text-overflow: clip; white-space: normal;/);
	assert.match(source, /className: "aa-gallery-status is-error"[^;]*icon\("statusWarning"\)/);
	assert.match(source, /className: "aa-gallery-status is-end"[^;]*icon\("statusCheck"\)/);
	assert.match(source, /className: "aa-gallery-status is-filtered"[^;]*continueFiltered/);
	assert.match(source, /MAX_AUTOMATIC_REFILL_PAGES = 4/);
	assert.match(source, /filteredPageRefillAction\(resultPage\.warnings, ended, masonryControllers\(\)\.some\(\(masonry\) => masonry\.needsMore\(\)\), automaticRefillPages, MAX_AUTOMATIC_REFILL_PAGES\)/);
	assert.match(source, /continueResults\.addEventListener\("click", \(\) => \{ continueResults\.hidden = true; void controller\.search\(\); \}\)/);
	assert.match(theme, /\.aa-gallery-status\.is-filtered \{[^}]*pointer-events: auto;/);
	assert.equal(enLocale.aaalice.gallery.continueFiltered, "Blocked posts were skipped. Continue searching");
	assert.equal(zhLocale.aaalice.gallery.continueFiltered, "已跳过多页屏蔽内容，继续查找");
	assert.match(theme, /\.aa-gallery-status\[hidden\], \.aa-gallery-status:empty \{ display: none !important; \}/);
	assert.match(theme, /\.aa-gallery-masonry \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/);
});

test("gallery preserves complete TLS diagnostics without disabling certificate verification", () => {
	assert.match(source, /code === "tls_certificate_error"/);
	assert.match(source, /lastError = \{ code, message, summary \}/);
	assert.match(source, /getLastError\(\) \{ return lastError; \}/);
	assert.match(source, /openGalleryErrorDialog\(currentError, \(\) => controller\.search\(\)\)/);
	assert.match(source, /navigator\.clipboard\.writeText\(message\)/);
	assert.match(source, /Gallery will not disable certificate verification/);
	assert.match(theme, /\.aa-gallery-status\.is-error > span \{ overflow: visible; text-overflow: clip; white-space: normal;/);
	assert.match(theme, /\.aa-gallery-error-details__raw \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.error.tlsCertificateSummary, "string");
		assert.equal(typeof locale.aaalice.gallery.error.tlsCertificate, "string");
		assert.equal(typeof locale.aaalice.gallery.error.copy, "string");
		assert.equal(typeof locale.aaalice.gallery.error.retry, "string");
	}
});

test("locally filtered pages refill within a fixed automatic budget", () => {
	const warning = ["local-blacklist-filtered"];
	assert.equal(filteredPageRefillAction(warning, false, true, 0, 4), "automatic");
	assert.equal(filteredPageRefillAction(warning, false, true, 3, 4), "automatic");
	assert.equal(filteredPageRefillAction(warning, false, true, 4, 4), "manual");
	assert.equal(filteredPageRefillAction(warning, true, true, 0, 4), "none");
	assert.equal(filteredPageRefillAction([], false, true, 0, 4), "none");
	assert.equal(filteredPageRefillAction(warning, false, false, 0, 4), "none");
});

test("tag inputs opt into Autocomplete-Plus and yield keys while its panel is open", () => {
	// 搜索框 + 排除标签 / 输出过滤（提示词浮层与画廊设置）都声明外部输入 opt-in。
	assert.equal(source.match(/setAttribute\("data-autocomplete-plus", ""\)/g)?.length ?? 0, 5);
	assert.equal(source.match(/setAttribute\("data-autocomplete-plus-mode", "raw-tag"\)/g)?.length ?? 0, 5);
	// 详情标签编辑与新增输入框：面板打开期间按键与失焦提交全部让位给补全插件。
	assert.equal(tagPillsSource.match(/setAttribute\("data-autocomplete-plus", ""\)/g)?.length ?? 0, 2);
	assert.equal(tagPillsSource.match(/setAttribute\("data-autocomplete-plus-mode", "raw-tag"\)/g)?.length ?? 0, 2);
	assert.match(tagPillsSource, /hasAttribute\("data-autocomplete-plus-open"\)\) return;/);
	assert.match(tagPillsSource, /attributeFilter: \["data-autocomplete-plus-open"\]/);
});

test("gallery injects queue snapshots and cleans all event-driven resources", () => {
	assert.match(source, /graphToPrompt/); assert.match(source, /galleryPayload\(stateFor\(node\), settings\?\.blacklist, settings\?\.outputFilterTags\)/);
	assert.match(source, /requestController\?\.abort/); assert.match(source, /controller\.destroy\(\)/); assert.doesNotMatch(source, /setInterval/);
	assert.doesNotMatch(source, /queue-prompt|QueueButton|promptButton/);
});

test("search pages deduplicate stable post identities before masonry append", () => {
	// 去重集合随会话持久维护，翻页不再线性重建，reset 时重建。
	assert.match(source, /let knownPostKeys = new Set\(\);/);
	assert.match(source, /knownPostKeys = new Set\(\); pageSegments = \[\]/);
	assert.match(source, /if \(knownPostKeys\.has\(key\)\) return false; knownPostKeys\.add\(key\)/);
});

test("synchronous masonry startup cannot call an uninitialized controller", () => {
	const assignment = source.indexOf("const controller = buildController");
	const surfaceMount = source.indexOf("createGallerySurface(node, controller");
	assert.ok(assignment >= 0 && assignment < surfaceMount);
	assert.match(source, /onNearEnd:\s*\(\)\s*=>\s*controller\.search\(\)/);
});

test("gallery keeps both native bottom resize corners free and can shrink after growing", () => {
	assert.match(source, /const DEFAULT_SIZE = \[760, 760\]/);
	assert.match(source, /const MIN_SIZE = \[620, 300\]/);
	assert.match(source, /getMinHeight: \(\) => MIN_SIZE\[1\]/);
	assert.match(source, /return \[Math\.max\(MIN_SIZE\[0\], Number\(size\[0\]\) \|\| 0\), MIN_SIZE\[1\]\]/);
	assert.match(source, /function clampGallerySize\(size\)[\s\S]*size\[0\] = Math\.max\(MIN_SIZE\[0\][\s\S]*size\[1\] = Math\.max\(MIN_SIZE\[1\]/);
	assert.match(source, /node\.onResize = function \(size\)[\s\S]*clampGallerySize\(size\)[\s\S]*clampGallerySize\(this\.size\)/);
	assert.match(source, /applyInitialGallerySize\(node, initializeSize\)/);
	assert.doesNotMatch(source, /root\.(?:scrollHeight|clientHeight)/);
	assert.match(theme, /\.dom-widget:has\(> \.aa-gallery\) \{ pointer-events: none !important; \}/);
	assert.match(theme, /\.aa-gallery\.is-resizing, \.aa-gallery\.is-resizing \* \{ pointer-events: none !important;/);
	assert.match(theme, /\.aa-gallery-masonry \{[^}]*inset: 0 10px 13px;[^}]*pointer-events: auto;/);
	assert.match(source, /installDomWidgetResizePassthrough\(node, surface\.root\)/);
});

test("selected clear action keeps text on the node and becomes an icon in the dashboard", () => {
	assert.match(theme, /\.aa-gallery-selected__clear\.aa-ui-button \{[^}]*width: auto;[^}]*min-width: 0;[^}]*padding: 4px 8px;/);
	assert.match(theme, /@container \(max-width: 580px\) \{[^\n]*\.aa-gallery--node \.aa-gallery-toolbar-text-action \.aa-ui-button__label \{ display: none; \}/);
	assert.match(theme, /\.aa-gallery--dashboard :is\(\.aa-gallery-toolbar-action, \.aa-gallery-toolbar-text-action\)\.aa-ui-button > \.aa-ui-button__label, \.aa-gallery--dashboard \.aa-gallery-random-mode__switch \{ display: none; \}/);
});

test("gallery redesign covers every primary surface", () => {
	for (const className of [
		"aa-gallery-selected-row__prompt", "aa-gallery-selected__empty-icon",
		"aa-gallery-detail__inspector", "aa-gallery-detail__facts", "aa-gallery-detail__tag-groups",
		"aa-gallery-tag-editor__context", "aa-gallery-tag-editor__workspace", "aa-gallery-tag-editor__categories", "aa-gallery-tag-editor__panels", "aa-gallery-filter-popover",
		"aa-gallery-prompt-popover", "aa-gallery-settings__nav", "aa-gallery-settings__source-workspace",
		"aa-gallery-settings__source-list", "aa-gallery-settings__source-detail", "aa-gallery-settings__blacklist-card", "aa-gallery-settings__cache-card",
		]) assert.match(source, new RegExp(className));
});
