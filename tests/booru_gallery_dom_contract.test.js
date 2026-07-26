import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../js/booru_gallery.js", import.meta.url), "utf8");
const tagPillsSource = fs.readFileSync(new URL("../js/lib/controls/tag_pills.js", import.meta.url), "utf8");
const extensionSource = fs.readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const theme = fs.readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");
const uiStyles = fs.readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");
const agents = fs.readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
const enLocale = JSON.parse(fs.readFileSync(new URL("../locales/en/main.json", import.meta.url), "utf8"));
const zhLocale = JSON.parse(fs.readFileSync(new URL("../locales/zh/main.json", import.meta.url), "utf8"));

test("package entry imports the Booru Gallery extension", () => {
	assert.match(extensionSource, /import\s+["']\.\/booru_gallery\.js["']/);
});

test("gallery has one toolbar with an in-place persistent search input", () => {
	assert.equal((source.match(/className: "aa-gallery-toolbar"/g) || []).length, 1);
	assert.match(source, /createSearchControl/); assert.match(source, /input\.type = "search"/); assert.match(source, /classList\.toggle\("is-open"/);
	assert.match(source, /searchToggleButton\(\{ label: label\("search\.label"/);
	assert.match(source, /input\.className = "aa-gallery-search__input aa-ui-search-input"/);
	assert.match(source, /input\.setAttribute\("data-autocomplete-plus", ""\)/);
	assert.match(source, /input\.hasAttribute\("data-autocomplete-plus-open"\)/);
	assert.match(source, /toggle\.setSearchValue\(input\.value/);
	assert.match(source, /iconName: "arrowRight"[^}]*className: "aa-ui-search-collapse"/);
	assert.match(source, /toggle\.hidden = open/);
	assert.match(source, /if \(!open && input\.value\.trim\(\) !== searchQuery\(stateFor\(node\)\)\) submit\(\)/);
	assert.match(source, /if \(!composing && !input\.value\.trim\(\) && searchQuery\(stateFor\(node\)\)\) submit\(\)/);
	assert.match(source, /_aaGalleryController\?\.search\(\{ reset: true, page: 1 \}\)/);
	assert.match(source, /children: \[refresh, openSettings, searchControl\.root, searchControl\.toggle\]/);
	assert.match(theme, /\.aa-gallery\.is-searching \.aa-gallery-toolbar__page-actions, \.aa-gallery\.is-searching \.aa-gallery-refresh, \.aa-gallery\.is-searching \.aa-gallery-open-settings \{ display: none; \}/);
	assert.match(theme, /\.aa-gallery\.is-searching \.aa-gallery-toolbar__spacer \{ display: none; \}/);
	assert.match(theme, /\.aa-gallery\.is-searching \.aa-gallery-search \{ width: 100%; max-width: none; flex: 1 1 auto; \}/);
	assert.match(uiStyles, /\.aa-ui-button\[hidden\] \{ display: none !important; \}/);
	assert.match(theme, /\.aa-gallery-search > \.aa-ui-button \{[^}]*width: 22px;[^}]*height: 22px;[^}]*border-radius: 50%;[^}]*transform: none;/s);
	assert.match(theme, /\.aa-gallery-search > \.aa-ui-button:hover:not\(:disabled\) \{[^}]*background: color-mix\([^}]*transform: none;/s);
	assert.match(theme, /\.aa-gallery-search \{[^}]*padding: 3px 3px 3px 9px;[^}]*overflow: hidden;/s);
});

test("gallery restores every workflow-owned browsing state after configuration", () => {
	assert.match(agents, /`onConfigure` 不是工作流恢复完成的可靠终点/);
	assert.match(agents, /必须在 `loadedGraphNode` 再以 `node\.properties` 为最终真源执行一次幂等恢复/);
	assert.match(source, /if \(persist\) transact\(node, \(state\) => \{ state\.view = mode; \}\)/);
	assert.match(source, /function restoreNode\(node\)/);
	assert.match(source, /node\._aaGallerySource\.setValue\(state\.source\)/);
	assert.match(source, /node\._aaGalleryController\.setMode\(state\.view, \{ persist: false \}\)/);
	assert.match(source, /node\._aaGalleryController\.search\(\{ reset: true, page: state\.navigation\.page \}\)/);
	assert.match(source, /loadedGraphNode\(node\) \{ if \(isGallery\(node\)\) \{ setupNodeSafely\(node\); restoreNode\(node\); \} \}/);
	assert.match(source, /if \(\(!reset && loading\) \|\| \(ended && !reset\)\) return/);
	assert.match(source, /setLoading\(true\);\s*if \(reset\) \{[^}]*masonryController\.setItems\(\[\]/s);
	assert.match(source, /credentialsRequired[\s\S]*setLoading\(false\);\s*return;/);
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
	assert.match(source, /className: "aa-gallery-refresh", iconName: "refresh"/);
	assert.match(source, /className: "aa-gallery-open-settings", iconName: "settings"/);
	assert.match(source, /className: "aa-gallery-open-settings"[^\n]*onClick: openGallerySettings/);
	assert.doesNotMatch(source, /Comfy\.ShowSettingsDialog|app\.ui\?\.settings\?\.show|openComfySettings/);
	assert.match(source, /children: \[refresh, openSettings, searchControl\.root, searchControl\.toggle\]/);
	assert.match(source, /className: "aa-gallery-toolbar__page-actions"/);
	assert.match(source, /className: "aa-gallery-toolbar__navigation", children: \[collection, pageControl\]/);
	assert.match(source, /className: "aa-gallery-toolbar__tools", children: \[filter, prompt\]/);
	assert.match(theme, /\.aa-gallery-collection-select \{ width: 82px;/);
	assert.match(theme, /\.aa-gallery-toolbar__page-actions \{[^}]*gap: 6px;/);
	assert.match(theme, /\.aa-gallery-toolbar__tools \{ gap: 5px; \}/);
	assert.doesNotMatch(theme, /\.aa-gallery-toolbar__tools \{[^}]*border-left:/);
	assert.match(theme, /\.aa-gallery \{[^}]*container-type: inline-size;/);
	assert.match(theme, /\.aa-gallery-toolbar__page-actions \{[^}]*flex: 0 0 auto;/);
	assert.match(theme, /@container \(max-width: 700px\)[^}]*\.aa-gallery-toolbar-action\.aa-ui-button \{ width: 28px;/);
	assert.match(theme, /@container \(max-width: 580px\)[^]*?\.aa-gallery-view-switcher button:has\(\.aa-ui-icon\) \{ width: 31px;/);
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
	assert.match(source, /refresh\.setAttribute\("aria-label", label\("refreshing", "Refreshing…"\)\)/);
	assert.match(source, /await controller\.search\(\{ reset: true \}\)/);
	assert.match(source, /finally \{ refreshing = false; refresh\.disabled = false; refresh\.classList\.remove\("is-refreshing"\)/);
	assert.match(theme, /\.aa-gallery-refresh\.is-refreshing \.aa-ui-icon \{ animation: aa-gallery-status-spin \.72s linear infinite; \}/);
	assert.match(source, /function openGallerySettings\(\) \{[^]*openSettingsDialog\(\)/);
	assert.match(source, /className: "aa-gallery-open-settings"[^\n]*onClick: openGallerySettings/);
	assert.doesNotMatch(source, /Comfy\.ShowSettingsDialog|app\.ui\?\.settings\?\.show|settings\.pathHint/);
});

test("browse and selected switcher states use distinct semantic colors", () => {
	assert.match(source, /className: "aa-gallery-view-switcher"/);
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
	assert.match(source, /iconName, action, actionLabel, actionIndex/);
	for (const action of ["edit", "favorite", "copyPrompt", "interrogate", "detail"]) assert.match(theme, new RegExp(`\\.aa-gallery-card-action\\.is-${action}`));
	assert.doesNotMatch(source, /actionButton\("statusCheck", "select"/);
	assert.doesNotMatch(theme, /\.aa-gallery-card-action\.is-select/);
	assert.match(source, /if \(event\?\.type === "click"\) card\.blur\(\)/);
	assert.match(source, /if \(event\?\.detail\) control\.blur\(\)/);
	assert.match(source, /function galleryCardActionLayout\(width, height, count\)/);
	assert.match(source, /availableWidth >= linearSize && availableHeight >= buttonSize/);
	assert.match(source, /availableHeight >= linearSize && availableWidth >= buttonSize/);
	assert.ok(source.indexOf("availableHeight >= linearSize") < source.indexOf("availableWidth >= linearSize"), "card actions must prefer a vertical column when both layouts fit");
	assert.match(source, /card\._aaVirtualMasonryLayout = \(width, height\) => \{ card\.dataset\.actionsLayout = galleryCardActionLayout\(width, height, actionControls\.length\); \}/);
	assert.match(theme, /\.aa-gallery-card\.aa-virtual-masonry__item \{[^}]*position: absolute;/);
	assert.match(theme, /\.aa-gallery-card__actions \{[^}]*top: 7px;[^}]*right: 7px;/);
	assert.doesNotMatch(theme, /\.aa-gallery-card__actions \{[^}]*top: 50%;/);
	assert.doesNotMatch(theme, /\.aa-gallery-card(?:\.[^{]+)? \{[^}]*container-type: inline-size/);
	assert.match(source, /--aa-gallery-action-delay", `\$\{actionIndex \* 34\}ms`/);
	assert.match(theme, /var\(--aa-gallery-action-delay\)/);
});

test("favorite entry stays visible before login and explains unavailable writes", () => {
	assert.match(source, /favoriteCapability\?\.favoriteRead \|\| favoriteCapability\?\.favoriteWrite/);
	assert.match(source, /if \(!hasSourceCredentials\(source\)\) \{ showFavoriteNotice\(source, "login"\); return false; \}/);
	assert.match(source, /label\("card\.favoriteConfigure", "Configure account"\)/);
	assert.match(source, /dialog\.close\(\); openGallerySettings\(\)/);
	assert.match(source, /if \(!cap\?\.favoriteWrite\) \{ showFavoriteNotice\(source, "readOnly"\); return false; \}/);
	assert.match(theme, /\.aa-gallery-favorite-notice \{/);
});

test("selected gallery cards use configurable approval stamps and a clear blue highlight", () => {
	assert.match(source, /el\("div", "aa-gallery-card__selected-layer"\)/);
	assert.match(source, /const SELECTION_STAMPS = \[[^\]]+"exclusiveCertification"/);
	assert.match(source, /function createSelectionStamp\(initialStyle, \{ preview = false \} = \{\}\)/);
	assert.match(source, /selectionStamp\.setStyle\(settings\?\.selectionStamp\)/);
	assert.match(source, /stateFor\(node\)\.selections\.some\(\(item\) => selectionKey\(item\) === `\$\{post\.source\}:\$\{post\.postId\}`\)/);
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
	assert.match(source, /image\.addEventListener\("error", \(\) => \{ void controller\.recoverPreview\(post, image\); \}\)/);
	assert.match(source, /if \(post\.source !== "aitag" \|\| image\.dataset\.previewRecovery\) return/);
	assert.match(source, /post\.previewUrl = detail\.previewUrl/);
	assert.match(source, /detail\.rating && cap\?\.ratings\?\.length/);
});

test("credential-required sources route the empty state to Gallery settings", () => {
	assert.match(source, /capability\(state\.source\)\?\.authRequired && !hasSourceCredentials\(state\.source\)/);
	assert.match(source, /error\.credentialsRequired/);
	assert.match(source, /if \(capability\(sourceName\)\?\.authRequired && !hasSourceCredentials\(sourceName\)\) openGallerySettings\(\)/);
});

test("gallery hover follows the launcher side-preview pattern without downloading the original", () => {
	const hoverSource = source.slice(source.indexOf("const showHover ="), source.indexOf("const openDetail ="));
	assert.match(source, /className: "aa-gallery-hover__media"/);
	assert.match(source, /className: "aa-gallery-hover__info"/);
	assert.match(source, /className: "aa-gallery-hover__tags"/);
	assert.match(source, /className: "aa-gallery-hover-tooltip"/);
	assert.match(source, /void getDetail\(post\)\.then/);
	assert.match(source, /if \(!content\.isConnected \|\| !tooltip\.isOpenFor\(anchor\)\) return/);
	assert.match(source, /placement: "side"/);
	assert.match(source, /detail\.sampleUrl \|\| detail\.previewUrl/);
	assert.match(source, /const detailCache = new Map\(\); const previewCache = new Map\(\); let previewGeneration = 0; let previewPrefetchActive = 0/);
	assert.match(source, /for \(const post of visiblePosts\.slice\(0, 12\)\)/);
	assert.match(source, /onVisibleItemsChange: \(items\) => controller\?\.prefetchVisible\(items\)/);
	assert.match(source, /while \(previewCache\.size > 16\)/);
	assert.match(source, /previewPrefetchActive < 4/);
	assert.match(source, /previewPrefetchPending\.has\(key\)/);
	assert.match(source, /prefetchedSrc && previewCache\.has\(prefetchedSrc\)/);
	assert.match(source, /previewPrefetchQueue\.length = 0; previewPrefetchPending\.clear\(\); prefetchedPreviewSources\.clear\(\)/);
	assert.match(source, /if \(cachedImage\?\.ready\) showSample\(\)/);
	assert.match(source, /generation \+= 1; rotatePreviewCache\(\); posts = \[\]/);
	assert.match(source, /className: "aa-gallery-hover__loading"[^]*children: \[icon\("loading"\)\]/);
	assert.match(source, /let waitingForLargerPreview = true/);
	assert.match(source, /else \{ waitingForLargerPreview = false; loading\.hidden = true; \}/);
	assert.doesNotMatch(source, /image\.src = proxyUrl\(detail\.source, detail\.mediaUrl\)/);
	assert.doesNotMatch(hoverSource, /capability\(post\.source\)\?\.displayName|`#\$\{post\.postId\}`/);
	assert.match(hoverSource, /children: \[image, loading, \.\.\.\(rating \? \[rating\] : \[\]\), info\]/);
	assert.match(theme, /\.aa-gallery-hover-tooltip\.aa-ui-tooltip \{[^}]*width: min\(320px/);
	assert.match(theme, /\.aa-gallery-hover__media \{[^}]*max-height: 420px/);
	assert.match(theme, /\.aa-gallery-hover__info \{[^}]*position: absolute;[^}]*bottom: 0;[^}]*linear-gradient/);
	assert.match(theme, /\.aa-gallery-hover__info dl \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
	assert.match(theme, /\.aa-gallery-hover__info dl > div \{[^}]*border: 0;[^}]*border-radius: 7px/);
	assert.match(theme, /\.aa-gallery-hover__info dt \{[^}]*font-size: 10px;[^}]*white-space: nowrap/);
	assert.match(theme, /\.aa-gallery-hover__info dd \{[^}]*font-size: 11px;/);
	assert.match(theme, /\.aa-gallery-hover__tags \{[^}]*display: grid;[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
	assert.match(theme, /\.aa-gallery-hover__tag-row > p \{[^}]*font-size: 10px;/);
	assert.match(theme, /\.aa-gallery-hover__tag-row\.is-character/);
	assert.match(theme, /\.aa-gallery-hover__loading \{[^}]*width: 24px;[^}]*height: 24px;[^}]*border: 0;[^}]*border-radius: 999px;[^}]*background: color-mix/);
	assert.match(theme, /\.aa-gallery-hover__rating \{[^}]*position: absolute;[^}]*top: 8px;[^}]*left: 8px;/);
	assert.match(theme, /\.aa-gallery-hover__loading \.aa-ui-icon \{[^}]*aa-gallery-loader-orbit/);
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
	assert.match(source, /function installGalleryCardMotion\(card\)/);
	assert.match(source, /if \(!frame\) frame = requestAnimationFrame\(draw\)/);
	assert.match(source, /--aa-gallery-tilt-x/);
	assert.match(source, /--aa-gallery-glare-position/);
	assert.match(source, /prefers-reduced-motion: reduce/);
	assert.match(source, /card\._aaVirtualMasonryDispose/);
	assert.match(theme, /\.aa-gallery-card__surface \{[^}]*transform-style: preserve-3d/);
	assert.match(theme, /rotateX\(var\(--aa-gallery-tilt-x\)\) rotateY\(var\(--aa-gallery-tilt-y\)\)/);
	assert.match(theme, /\.aa-gallery-card__surface::before \{[^}]*radial-gradient[^}]*linear-gradient/);
	assert.match(theme, /\.aa-gallery-card\.aa-virtual-masonry__item \{[^}]*contain: layout style;[^}]*transition: transform \.24s/);
});

test("gallery uses the shared styled listbox instead of native select controls", () => {
	assert.match(source, /listboxControl/);
	assert.doesNotMatch(source, /selectControl|document\.createElement\("select"\)/);
	assert.match(source, /sortIcons = \{ latest: "statusIdle", new: "statusIdle", score: "statusCheck", favcount: "favorite", random: "refresh" \}/);
	assert.match(source, /iconName: "statusIdle" \}\);/);
	assert.match(source, /value: "favorites"[^}]*iconName: "favorite"/);
	assert.match(theme, /\.aa-gallery-toolbar > \.aa-ui-listbox-select \{/);
	assert.match(theme, /\.aa-ui-listbox-select__trigger \{[^}]*border-radius: 9px;/);
});

test("gallery rating filter stays focused, localized, and semantically colored", () => {
	const filterSource = source.slice(source.indexOf("function openFilter"), source.indexOf("function createPageControl"));
	assert.match(filterSource, /className: "aa-gallery-filter-popover", width: 300/);
	assert.match(source, /className: "aa-gallery-prompt-popover", width: 360/);
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
	assert.match(promptSource, /className: "aa-gallery-prompt-popover", width: 360/);
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
	assert.match(theme, /\.aa-gallery-prompt-panel\[data-panel="exclude"\] \{[^}]*height: 128px/);
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
	assert.match(source, /className: "aa-gallery-status is-error"[^;]*icon\("statusWarning"\)/);
	assert.match(source, /className: "aa-gallery-status is-end"[^;]*icon\("statusCheck"\)/);
	assert.match(theme, /\.aa-gallery-status\[hidden\], \.aa-gallery-status:empty \{ display: none !important; \}/);
	assert.match(theme, /\.aa-gallery-masonry \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/);
});

test("gallery injects queue snapshots and cleans all event-driven resources", () => {
	assert.match(source, /graphToPrompt/); assert.match(source, /galleryPayload\(stateFor\(node\), settings\?\.blacklist\)/);
	assert.match(source, /requestController\?\.abort/); assert.match(source, /controller\.destroy\(\)/); assert.doesNotMatch(source, /setInterval/);
	assert.doesNotMatch(source, /queue-prompt|QueueButton|promptButton/);
});

test("search pages deduplicate stable post identities before masonry append", () => {
	assert.match(source, /const knownPostKeys = new Set\(posts\.map\(\(post\) => `\$\{post\.source\}:\$\{post\.postId\}`\)\)/);
	assert.match(source, /if \(knownPostKeys\.has\(key\)\) return false; knownPostKeys\.add\(key\)/);
});

test("synchronous masonry startup cannot call an uninitialized controller", () => {
	const declaration = source.indexOf("let controller = null");
	const masonryMount = source.indexOf("mountVirtualMasonry(masonry");
	const assignment = source.indexOf("controller = buildController");
	assert.ok(declaration >= 0 && declaration < masonryMount && masonryMount < assignment);
	assert.match(source, /onNearEnd:\s*\(\)\s*=>\s*controller\?\.search\(\)/);
});

test("gallery keeps both native bottom resize corners free and can shrink after growing", () => {
	assert.match(source, /const MIN_SIZE = \[620, 300\]/);
	assert.match(source, /getMinHeight: \(\) => MIN_SIZE\[1\]/);
	assert.match(source, /return \[Math\.max\(MIN_SIZE\[0\], Number\(size\[0\]\) \|\| 0\), MIN_SIZE\[1\]\]/);
	assert.match(source, /node\.onResize = function \(size\)[\s\S]*size\[0\] = Math\.max\(MIN_SIZE\[0\]/);
	assert.doesNotMatch(source, /root\.(?:scrollHeight|clientHeight)/);
	assert.match(theme, /\.dom-widget:has\(> \.aa-gallery\) \{ pointer-events: none !important; \}/);
	assert.match(theme, /\.aa-gallery\.is-resizing, \.aa-gallery\.is-resizing \* \{ pointer-events: none !important;/);
	assert.match(theme, /\.aa-gallery-masonry \{[^}]*inset: 0 10px 13px;[^}]*pointer-events: auto;/);
	assert.match(source, /installDomWidgetResizePassthrough\(node, root\)/);
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

test("post detail uses layered surfaces instead of line-based separators", () => {
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	assert.doesNotMatch(detailSource, /detail\.localOnly|aa-gallery-detail__header[\s\S]*el\("small"/);
	assert.match(theme, /\.aa-gallery-detail__header \{[^}]*border: 0;[^}]*border-radius: 11px;[^}]*box-shadow:/);
	assert.match(theme, /\.aa-gallery-detail__facts \{[^}]*gap: 5px;[^}]*border: 0;[^}]*border-radius: 12px;[^}]*box-shadow:/);
	assert.match(theme, /\.aa-gallery-detail__facts > div \{[^}]*border: 0;[^}]*border-radius: 8px;[^}]*box-shadow:/);
	assert.match(theme, /\.aa-gallery-detail__tag-group \{[^}]*border: 0;[^}]*border-radius: 12px;[^}]*box-shadow:/);
	const detailStyles = theme.slice(theme.indexOf(".aa-gallery-detail-dialog"), theme.indexOf(".aa-gallery-tag-editor-dialog"));
	assert.doesNotMatch(detailStyles, /border-(?:top|right|bottom|left):\s*1px/);
	assert.match(theme, /\.aa-gallery-detail__tag-group \.aa-gallery-tag-pill \{[^}]*border: 0;[^}]*background: color-mix\(in srgb, var\(--aa-gallery-category-tone\) 10%/);
	assert.match(theme, /\.aa-gallery-detail__tag-group \.aa-gallery-section-heading strong::before/);
	assert.match(theme, /\.aa-gallery-detail__action\.is-selection \{[^}]*order: 10/);
});

test("post detail image viewer supports zoom, pan, reset, and keyboard control", () => {
	const viewerSource = source.slice(source.indexOf("function createDetailImageViewer"), source.indexOf("function ratingIcon"));
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	assert.match(viewerSource, /const MIN_SCALE = 1; const MAX_SCALE = 8;/);
	assert.match(viewerSource, /addEventListener\("wheel"/);
	assert.match(viewerSource, /Math\.exp\(-event\.deltaY \* 0\.0015\), event\.clientX, event\.clientY/);
	assert.match(viewerSource, /\{ passive: false \}/);
	assert.match(viewerSource, /setPointerCapture\(event\.pointerId\)/);
	assert.match(viewerSource, /addEventListener\("pointermove"/);
	assert.match(viewerSource, /addEventListener\("dblclick", reset\)/);
	assert.match(viewerSource, /\["\+", "="\]\.includes\(event\.key\)/);
	assert.match(viewerSource, /ArrowLeft: \[36, 0\][^\n]*ArrowDown: \[0, -36\]/);
	assert.match(viewerSource, /fittedWidth \* scale - width/);
	assert.match(viewerSource, /function createDetailImageViewer\(\{ previewSrc, originalSrc, alt \}\)/);
	assert.match(detailSource, /detail\.sampleUrl \|\| detail\.previewUrl \|\| post\.previewUrl \|\| detail\.mediaUrl/);
	assert.match(detailSource, /createDetailImageViewer\(\{ previewSrc: proxyUrl\(detail\.source, previewUrl\), originalSrc: proxyUrl\(detail\.source, detail\.mediaUrl\)/);
	assert.match(viewerSource, /const loader = new Image\(\); originalLoader = loader/);
	assert.match(viewerSource, /setLoadState\("error", label\("detail\.originalFailed"/);
	assert.match(viewerSource, /retry\.addEventListener\("click", loadOriginal\)/);
	assert.match(detailSource, /onClose: \(\) => \{ viewer\.destroy\(\)/);
	assert.doesNotMatch(detailSource, /cacheImage\([^\n]*detail\.mediaUrl/);
	assert.match(theme, /\.aa-gallery-detail__viewport \{[^}]*position: absolute;[^}]*overflow: hidden;[^}]*touch-action: none/);
	assert.match(theme, /\.aa-gallery-detail__image \{[^}]*translate3d\(var\(--aa-gallery-detail-offset-x[^}]*scale\(var\(--aa-gallery-detail-scale/);
	assert.match(theme, /\.aa-gallery-detail__viewer-controls \{[^}]*position: absolute;[^}]*bottom: 10px;[^}]*left: 10px;[^}]*backdrop-filter: blur\(10px\)/);
	assert.match(theme, /\.aa-gallery-detail__media-status \{[^}]*position: absolute;[^}]*top: 10px;[^}]*left: 10px/);
	assert.match(theme, /\.aa-gallery-detail__media-status\[data-state="error"\]/);
	for (const locale of [enLocale, zhLocale]) {
		for (const key of ["viewer", "viewerControls", "zoomIn", "zoomOut", "resetView", "loadingOriginal", "originalFailed", "retryOriginal"]) assert.equal(typeof locale.aaalice.gallery.detail[key], "string");
	}
});

test("selected count and clear action live in the main toolbar", () => {
	const selectedSource = source.slice(source.indexOf("const emptySelected ="), source.indexOf("document.body.append(selectedDropIndicator)"));
	const toolbarSource = source.slice(source.indexOf("const tabs = segmentedControl"), source.indexOf("const masonry ="));
	assert.match(toolbarSource, /className: "aa-gallery-view-switcher__count"/);
	assert.match(toolbarSource, /tabs\.querySelector\('\[data-value="selected"\]'\)\?\.append\(selectedCount\)/);
	assert.match(toolbarSource, /children: \[source, tabs, clear,/);
	assert.match(source, /elements\.selectedCount\.textContent = String\(count\)/);
	assert.match(theme, /\.aa-gallery-view-switcher__count \{[^}]*min-width: 18px;[^}]*border: 0;[^}]*font-size: 10px;[^}]*font-weight: 800/);
	const countStyle = theme.match(/\.aa-gallery-view-switcher__count \{([^}]*)\}/)?.[1] || "";
	assert.doesNotMatch(countStyle, /0 0 0 1px/);
	assert.match(theme, /\.aa-gallery:not\(\[data-mode="selected"\]\) \.aa-gallery-selected__clear \{ display: none; \}/);
	assert.doesNotMatch(selectedSource, /aa-gallery-selected__toolbar|aa-gallery-selected__status|aa-gallery-selected__copy/);
	assert.doesNotMatch(theme, /\.aa-gallery-selected__toolbar|\.aa-gallery-selected__lead|\.aa-gallery-selected__status|\.aa-gallery-selected__copy/);
	assert.doesNotMatch(source, /\b(?:globalThis\.)?confirm\s*\(/);
	assert.match(source, /function openClearSelectionDialog\(node, controller\)/);
	assert.match(source, /className: "aa-gallery-clear-confirm"/);
	assert.match(source, /onClick: \(\) => openClearSelectionDialog\(node, controller\)/);
	for (const locale of [enLocale, zhLocale]) assert.equal(typeof locale.aaalice.gallery.selected.reorderHint, "string");
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.selected.clearTitle, "string");
		assert.equal(typeof locale.aaalice.gallery.selected.clearAction, "string");
	}
});

test("selected rows use the full available width for tag previews", () => {
	const previewSource = source.slice(source.indexOf("function selectedRowTagPreview"), source.indexOf("function selectedRowCopyContent"));
	assert.match(previewSource, /tokens\.map\(/);
	assert.doesNotMatch(previewSource, /slice\(0,\s*4\)|className: "is-more"/);
	assert.match(theme, /\.aa-gallery-selected-row__tags \{[^}]*overflow: hidden/);
});

test("selected row text reuses post details instead of opening a prompt tooltip", () => {
	const rowSource = source.slice(source.indexOf("function createSelectedRow"), source.indexOf("function buildController"));
	assert.match(rowSource, /controller\.openDetail\(selection\)\.catch\(controller\.showError\)/);
	assert.match(rowSource, /label\("card\.detail", "View details"\)/);
	assert.doesNotMatch(rowSource, /showPromptHover|promptHoverTimer|pointermove/);
	assert.doesNotMatch(source, /function selectedPromptHoverContent|aa-gallery-selected-prompt-tooltip/);
	assert.doesNotMatch(theme, /\.aa-gallery-selected-prompt/);
});

test("selected rows share one protected trailing slot between order and removal", () => {
	const rowSource = source.slice(source.indexOf("function createSelectedRow"), source.indexOf("function buildController"));
	assert.doesNotMatch(rowSource, /aa-gallery-selected-row__drag/);
	assert.match(rowSource, /className: "aa-gallery-selected-row"[\s\S]*draggable: true/);
	assert.match(rowSource, /"data-rank": index < 3 \? String\(index \+ 1\) : "other"/);
	assert.match(theme, /\.aa-gallery-selected-row \{[^}]*padding: 6px 44px 6px 8px/);
	assert.match(theme, /\.aa-gallery-selected-row__order \{[^}]*position: absolute;[^}]*right: 10px/);
	assert.match(theme, /\.aa-gallery-selected-row__order \{[^}]*border: 0;[^}]*box-shadow:/);
	for (const rank of ["1", "2", "3"]) assert.match(theme, new RegExp(`selected-row\\[data-rank="${rank}"\\] \\.aa-gallery-selected-row__order`));
	assert.match(theme, /\.aa-gallery-selected-row:hover \.aa-gallery-selected-row__order[^}]*opacity: 0/);
	assert.match(theme, /\.aa-gallery-selected-row__remove\.aa-ui-button \{[^}]*border-radius: 50%/);
});

test("gallery tag pills keep clean capsules and route operations through context menus", () => {
	const pillsSource = tagPillsSource;
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	assert.match(source, /import \{ createTagPillList \} from "\.\/lib\/controls\/tag_pills\.js"/);
	assert.match(pillsSource, /className: `aa-ui-tag-pill aa-gallery-tag-pill\$\{hasContextMenu/);
	assert.match(pillsSource, /"data-category": token\.category/);
	assert.match(pillsSource, /pill\.addEventListener\("click", beginEdit\)/);
	assert.match(pillsSource, /pill\.addEventListener\("contextmenu"/);
	assert.match(pillsSource, /type: "remove"/);
	assert.match(pillsSource, /createContextMenu\(\{ x, y/);
	assert.doesNotMatch(pillsSource, /dblclick|tag-pill__remove|tag-pill__action|icon\("lock"\)/);
	assert.match(detailSource, /createGalleryTagPills\(\{/);
	assert.doesNotMatch(detailSource, /editable: true/);
	assert.match(detailSource, /contextMenuItems: \(token, \{ edit \}\)/);
	assert.match(detailSource, /label\("detail\.editTag"/);
	assert.match(detailSource, /label\("detail\.blockTag"/);
	assert.match(detailSource, /label\("detail\.addToSearch"/);
	assert.match(detailSource, /disabled: !cap\?\.tagSearch/);
	assert.match(detailSource, /onMutate: \(mutation\) => mutateDetailTag/);
	assert.match(detailSource, /dialog\.close\(\);[\s\S]*addGlobalBlacklistTag\(token\.raw\)/);
	assert.match(pillsSource, /const pill = el\("div"/);
	for (const category of ["artist", "copyright", "character", "general", "meta"]) {
		assert.match(theme, new RegExp(`\\.aa-gallery-tag-pill\\[data-category="${category}"\\]`));
	}
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.selected.editTag, "string");
		assert.equal(typeof locale.aaalice.gallery.selected.removeTag, "string");
		assert.equal(typeof locale.aaalice.gallery.detail.editTag, "string");
		assert.equal(typeof locale.aaalice.gallery.detail.blockTag, "string");
		assert.equal(typeof locale.aaalice.gallery.detail.blacklistAdded, "string");
	}
});

test("gallery scroll areas follow the focused wheel-capture protocol", () => {
	assert.match(source, /className: "aa-gallery", attrs: \{ "data-mode": stateFor\(node\)\.view, "data-capture-wheel": "true" \}/);
	assert.match(source, /const masonry = el\("div", \{ className: "aa-gallery-masonry", attrs: \{ tabindex: 0 \} \}\);/);
	assert.match(source, /focusScrollableOnPointerEnter\(masonry\)/);
	assert.match(source, /className: "aa-gallery-selected__list", attrs: \{ tabindex: 0 \}/);
	assert.match(source, /focusScrollableOnPointerEnter\(selectedListRoot\)/);
	assert.match(source, /addEventListener\("pointerenter"/);
	assert.match(source, /active\.matches\('input, textarea, select, \[contenteditable="true"\]'\)/);
	assert.match(source, /target\.focus\(\{ preventScroll: true \}\)/);
	assert.doesNotMatch(source, /new WheelEvent|wheel[\s\S]{0,80}stopPropagation/);
});

test("gallery cards offer prompt copy and prompt-assistant interrogation", () => {
	assert.match(source, /const PROMPT_ASSISTANT_API = "\/prompt-assistant\/api"/);
	assert.match(source, /\$\{PROMPT_ASSISTANT_API\}\/config\/llm\/masked/);
	assert.match(source, /promptAssistantAvailable = Boolean\(assistantAvailable\)/);
	assert.match(source, /actionButton\("copy", "copyPrompt", label\("card\.copyPrompt", "Copy prompt"\)/);
	assert.match(source, /promptAssistantAvailable \? actionButton\("scan", "interrogate", label\("card\.interrogate", "Interrogate prompt"\)/);
	assert.match(source, /const copyPostPrompt = async \(post\) =>/);
	assert.match(source, /navigator\.clipboard\.writeText\(text\)/);
	assert.match(source, /label\("card\.promptCopied", "Prompt copied to clipboard"\)/);
	assert.match(source, /label\("selected\.noPrompt"/);
	assert.match(source, /const interrogatePost = async \(post, card, control\) =>/);
	assert.match(source, /card\.classList\.add\("is-interrogating"\)/);
	assert.match(source, /\$\{PROMPT_ASSISTANT_API\}\/vlm\/analyze/);
	assert.match(source, /request_id: crypto\.randomUUID\(\)/);
	assert.match(source, /openInterrogateResultDialog\(detail, String\(result\.data\?\.description/);
	assert.match(source, /className: "aa-gallery-card__scan"/);
	assert.match(theme, /\.aa-gallery-card\.is-interrogating \.aa-gallery-card__scan \{[^}]*animation: aa-gallery-card-scan/);
	assert.match(theme, /\.aa-gallery-card\.is-interrogating \.aa-gallery-card__surface \{[^}]*translate3d\(0, -4px, 12px\)[^}]*animation: aa-gallery-card-scan-glow/);
	assert.match(source, /actionControls = \[editAction, \.\.\.\(favoriteAction \? \[favoriteAction\] : \[\]\), copyPromptAction, \.\.\.\(interrogateAction \? \[interrogateAction\] : \[\]\), detailAction\]/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.card.copyPrompt, "string");
		assert.equal(typeof locale.aaalice.gallery.card.promptCopied, "string");
		assert.equal(typeof locale.aaalice.gallery.card.interrogate, "string");
		assert.equal(typeof locale.aaalice.gallery.interrogate.title, "string");
		assert.equal(typeof locale.aaalice.gallery.interrogate.copied, "string");
		assert.equal(typeof locale.aaalice.gallery.interrogate.failed, "string");
		assert.equal(typeof locale.aaalice.gallery.error.media, "string");
	}
	assert.match(source, /errorTimer = setTimeout\(\(\) => \{ elements\.error\.hidden = true; \}, 6000\)/);
	assert.match(source, /label\("error\.media", "Image request failed \(HTTP \{status\}\)"\)/);
	assert.match(source, /life: 3200/);
	assert.match(source, /life: 5000/);
});

test("post details offer copying the original image to the clipboard", () => {
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	assert.match(detailSource, /label\("detail\.copyImage", "Copy image"\)/);
	assert.match(detailSource, /copyImageToClipboard\(proxyUrl\(detail\.source, detail\.mediaUrl\)\)/);
	assert.match(source, /async function copyImageToClipboard\(src\)/);
	assert.match(source, /createImageBitmap\(blob\)/);
	assert.match(source, /canvas\.toBlob\(resolve, "image\/png"\)/);
	assert.match(source, /new ClipboardItem\(\{ "image\/png": png \}\)/);
	assert.match(theme, /\.aa-gallery-detail__action\.is-copy-image \{[^}]*--aa-gallery-detail-action-tone/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.detail.copyImage, "string");
		assert.equal(typeof locale.aaalice.gallery.detail.imageCopied, "string");
	}
});

test("post details stream three-layer tag translations into the pills", () => {
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	assert.match(source, /import \{ streamTagTranslations \} from "\.\/lib\/tag_translation\.js"/);
	assert.match(source, /import \{ ensureI18nReady, currentLocale, t \} from "\.\/i18n\.js"/);
	assert.match(detailSource, /currentLocale\(\) === "zh"/);
	assert.match(detailSource, /const translationAbort = new AbortController\(\)/);
	assert.match(detailSource, /translationAbort\.abort\(\)/);
	assert.match(detailSource, /void streamTagTranslations\(\{/);
	assert.match(detailSource, /signal: translationAbort\.signal/);
	assert.match(detailSource, /openGeneration !== detailDialogGeneration/);
	assert.match(detailSource, /pills\.setSecondary\(translations\)/);
	assert.match(detailSource, /label\("detail\.copyTag"/);
	assert.match(detailSource, /navigator\.clipboard\.writeText\(token\.raw\)/);
	assert.match(detailSource, /pills\.flashToken\(token\.raw\)/);
	const translationSource = fs.readFileSync(new URL("../js/lib/tag_translation.js", import.meta.url), "utf8");
	assert.match(translationSource, /import \{ api \} from "\.\.\/\.\.\/\.\.\/scripts\/api\.js"/);
	assert.match(translationSource, /\/autocomplete-plus\/translation\/resolve-stream/);
	assert.match(translationSource, /general: 0, artist: 1, copyright: 3, character: 4, meta: 5/);
	assert.match(translationSource, /response\.status === 404/);
	assert.match(tagPillsSource, /root\.setSecondary = /);
	assert.match(tagPillsSource, /root\.flashToken = /);
	assert.match(tagPillsSource, /else if \(hasContextMenu\) pill\.addEventListener\("click", \(\) => \{ if \(!pill\.classList\.contains\("is-editing"\)\) openAnchoredMenu\(\); \}\)/);
	assert.match(theme, /aa-gallery-tag-pill-in/);
	assert.match(theme, /aa-gallery-tag-pill-copied/);
	assert.match(theme, /aa-gallery-tag-pill-secondary-in/);
	assert.match(theme, /\.aa-gallery-detail__tag-group \.aa-gallery-tag-pill__secondary \{[^}]*color: color-mix\(in srgb, var\(--aa-gallery-category-tone\)/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.detail.copyTag, "string");
		assert.equal(typeof locale.aaalice.gallery.detail.tagActionsHint, "string");
	}
});

test("post details use maintainable semantic color hooks", () => {
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	for (const fact of ["resolution", "format", "tags"]) assert.match(detailSource, new RegExp(`\\["${fact}",`));
	assert.match(detailSource, /`rating-\$\{ratingTone\(detail\.rating\)\}`/);
	assert.match(detailSource, /attrs: \{ "data-category": category \}/);
	for (const category of ["artist", "copyright", "character", "general", "meta"]) assert.match(theme, new RegExp(`tag-group\\[data-category="${category}"\\]`));
	for (const action of ["is-source", "is-original", "is-favorite"]) assert.match(detailSource, new RegExp(action));
});

test("local tag editor focuses one color-coded category with reusable editable pills", () => {
	const editorStart = source.indexOf("const openEditor =");
	const editorSource = source.slice(editorStart, source.indexOf("\n\treturn {", editorStart));
	assert.match(editorSource, /className: "aa-gallery-tag-editor__category-tab"/);
	assert.match(editorSource, /className: "aa-gallery-tag-editor__category"/);
	assert.match(editorSource, /view\.panel\.hidden = !active/);
	assert.match(editorSource, /\["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"\]/);
	assert.match(editorSource, /setCategory\(groups\.general\?\.length \? "general"/);
	assert.match(editorSource, /title: label\("editor\.title", "Edit local tags"\)/);
	assert.doesNotMatch(editorSource, /title: `\$\{label\("editor\.title"/);
	assert.match(editorSource, /createGalleryTagPills\(\{/);
	assert.match(editorSource, /editable: true/);
	assert.match(editorSource, /allowAdd: true/);
	assert.match(editorSource, /mutation\.type === "add"/);
	assert.match(editorSource, /pillLists\[category\]\.setTokens/);
	assert.match(tagPillsSource, /input\.spellcheck = false/);
	assert.match(tagPillsSource, /className: "aa-ui-tag-pills__add-trigger aa-gallery-tag-pills__add-trigger"/);
	assert.match(tagPillsSource, /add\.replaceWith\(input\)/);
	assert.doesNotMatch(editorSource, /createElement\("textarea"\)|aa-gallery-tag-editor__input/);
	for (const category of ["artist", "copyright", "character", "general", "meta"]) assert.match(theme, new RegExp(`category-tab\\[data-category="${category}"\\]`));
	assert.match(theme, /\.aa-gallery-tag-editor__workspace \{[^}]*grid-template-columns: 158px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-tag-editor__category > \.aa-gallery-tag-pills \{[^}]*height: 100%;[^}]*overflow: auto/);
	assert.match(theme, /\.aa-gallery-tag-pills__add \{[^}]*width: 12ch;[^}]*flex: 0 0 auto;[^}]*border: 1px solid/);
	assert.match(theme, /\.aa-gallery-tag-pills__add-trigger\.aa-ui-button \{[^}]*width: 25px;[^}]*border-radius: 999px/);
	assert.match(theme, /\.aa-gallery-tag-pill\.is-editing,[^{]*\{[^}]*border-color: transparent !important;[^}]*box-shadow: inset/);
	assert.match(theme, /\.aa-gallery-tag-pill__input,[^{]*:focus-visible \{[^}]*border: 0 !important;[^}]*box-shadow: none !important/);
	assert.doesNotMatch(theme, /\.aa-gallery-tag-pill:focus-visible,[^{]*\{[^}]*0 0 0 2px/);
	assert.doesNotMatch(theme, /aa-gallery-tag-editor__grid|aa-gallery-tag-editor__hero/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.editor.pillHint, "string");
		assert.equal(typeof locale.aaalice.gallery.editor.addPlaceholder, "string");
	}
});

test("gallery settings use focused sections and explicit account states", () => {
	const settingsEntrySource = source.slice(source.indexOf("function registerSettings"), source.indexOf("function installPromptHook"));
	assert.match(source, /value: "accounts"/);
	assert.match(source, /data-page": "accounts"/);
	assert.match(source, /data-page": "browse"/);
	assert.match(source, /data-page": "prompt"/);
	assert.match(source, /data-page": "performance"/);
	assert.match(source, /is-configured/);
	assert.match(source, /needs-setup/);
	assert.match(source, /is-testing/);
	assert.match(source, /className: "aa-gallery-settings__nav-item"/);
	assert.match(source, /className: `aa-gallery-settings__source-tab /);
	assert.match(source, /className: "aa-gallery-settings__source-workspace"/);
	assert.match(source, /function settingsSectionHeader\(iconName, title\)/);
	assert.doesNotMatch(source, /settingsSectionHeader\([^\n]*settings\.(?:sourcesHint|browseHint|promptHint|performanceHint)/);
	const settingsSource = source.slice(source.indexOf("async function openSettingsDialog"), source.indexOf("app.registerExtension"));
	assert.doesNotMatch(settingsSource, /settings\.excluded|Default excluded prompt tags|promptDefaults\?\.excludedTags/);
	assert.match(settingsSource, /className: "aa-gallery-settings__page aa-gallery-settings__blacklist-page"/);
	assert.doesNotMatch(settingsSource, /defaultRatings|defaultRating|aa-gallery-settings__rating/);
	assert.match(settingsSource, /value: "blacklist", label: label\("settings\.blacklist"/);
	assert.match(settingsSource, /children: \[accountsPanel, browsePanel, blacklistPanel, promptPanel, performancePanel\]/);
	assert.doesNotMatch(settingsSource.slice(settingsSource.indexOf('data-page": "browse"'), settingsSource.indexOf('data-page": "blacklist"')), /blacklistCard/);
	assert.doesNotMatch(source, /className: "aa-gallery-settings__toggle-card"[^\n]*settings\.tooltipHint/);
	assert.doesNotMatch(source, /className: "aa-gallery-settings__blacklist-icon"[^\n]*settings\.blacklistIntro/);
	assert.match(source, /panel\.hidden = !active; tab\.classList\.toggle\("is-active", active\)/);
	assert.match(source, /\["ArrowUp", "ArrowDown", "Home", "End"\]/);
	assert.doesNotMatch(source, /aa-gallery-settings__hero|aa-gallery-settings__source-grid/);
	assert.match(theme, /aa-gallery-settings-page-in/);
	assert.match(theme, /\.aa-gallery-settings \{[^}]*grid-template-columns: 150px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-settings__source-workspace \{[^}]*grid-template-columns: 184px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-settings__section-header strong \{[^}]*font-size: 12px/);
	assert.doesNotMatch(settingsSource, /aa-gallery-settings__blacklist-card[\s\S]*el\("footer"/);
	assert.match(theme, /\.aa-gallery-settings__blacklist-card \{[^}]*border: 0;[^}]*background: color-mix/);
	assert.doesNotMatch(theme, /aa-gallery-settings__hero|aa-gallery-settings__source-grid/);
	assert.match(settingsEntrySource, /cell\.append\(button\(\{ label: label\("settings\.open", "Configure Gallery…"\)/);
	assert.doesNotMatch(settingsEntrySource, /aa-gallery-settings-entry|settings\.introTitle|variant: "primary"/);
	assert.doesNotMatch(uiStyles, /aa-gallery-settings-entry/);
	assert.doesNotMatch(theme, /aa-gallery-settings-entry/);
	assert.equal(zhLocale.aaalice.gallery.settings.entry, "Booru 画廊");
	assert.equal(zhLocale.aaalice.gallery.settings.open, "配置画廊…");
	assert.doesNotMatch(JSON.stringify(zhLocale.aaalice.gallery), /图库/);
});

test("shared inputs override native beveled browser styling", () => {
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input \{[^}]*appearance: none;[^}]*-webkit-appearance: none;[^}]*border: 1px solid transparent;[^}]*border-radius: 8px;[^}]*box-shadow: var\(--aa-ui-edge-shadow-inset\)/s);
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input:focus[^}]*box-shadow: var\(--aa-ui-edge-shadow-active\), 0 0 0 3px/s);
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input:-webkit-autofill[^}]*-webkit-text-fill-color: var\(--aa-ui-text\)/s);
});

test("content blacklist is a backend filter with visible settings feedback", () => {
	assert.match(source, /className: "aa-gallery-settings__blacklist-card"/);
	assert.match(source, /settings\.blacklistCount/);
	assert.doesNotMatch(source, /map\(\(tag\) => `-\$\{tag\}`\)/);
	assert.match(theme, /\.aa-gallery-settings__blacklist-card/);
});
