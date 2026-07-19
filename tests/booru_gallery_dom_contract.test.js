import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../js/booru_gallery.js", import.meta.url), "utf8");
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
	assert.match(source, /toggle\.hidden = open/);
	assert.match(source, /children: \[refresh, openSettings, searchControl\.root, searchControl\.toggle\]/);
	assert.match(theme, /\.aa-gallery\.is-searching \.aa-gallery-toolbar__page-actions, \.aa-gallery\.is-searching \.aa-gallery-refresh, \.aa-gallery\.is-searching \.aa-gallery-open-settings \{ display: none; \}/);
	assert.match(theme, /\.aa-gallery\.is-searching \.aa-gallery-toolbar__spacer \{ display: none; \}/);
	assert.match(theme, /\.aa-gallery\.is-searching \.aa-gallery-search \{ width: 100%; max-width: none; flex: 1 1 auto; \}/);
	assert.match(uiStyles, /\.aa-ui-button\[hidden\] \{ display: none !important; \}/);
	assert.match(theme, /\.aa-gallery-search > \.aa-ui-button \{[^}]*width: 22px;[^}]*height: 22px;[^}]*border-radius: 50%;[^}]*transform: none;/s);
	assert.match(theme, /\.aa-gallery-search > \.aa-ui-button:hover:not\(:disabled\) \{[^}]*background: color-mix\([^}]*transform: none;/s);
	assert.match(theme, /\.aa-gallery-search \{[^}]*padding: 3px 3px 3px 9px;[^}]*overflow: hidden;/s);
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
	assert.match(source, /className: "aa-gallery-page-popover", width: 196/);
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
	assert.match(theme, /\.aa-gallery-page-popover \{[^}]*padding: 7px;[^}]*border-radius: 11px;/);
	assert.match(theme, /\.aa-gallery-page-popover__rail \{[^}]*grid-template-columns: 30px minmax\(92px, 1fr\) 30px/);
	assert.match(theme, /\.aa-gallery-page-popover__field:focus-within/);
	assert.match(theme, /\.aa-gallery-page-popover__input \{[^}]*border: 0;[^}]*text-align: center;/);
	assert.match(theme, /\.aa-gallery-page-popover__go\.aa-ui-button \{[^}]*width: 26px;[^}]*border: 0;[^}]*border-radius: 999px;[^}]*background: var\(--aa-ui-node-accent-soft\)/);
});

test("gallery refresh and settings utilities expose their real state and destination", () => {
	assert.match(source, /refresh\.classList\.add\("is-refreshing"\)/);
	assert.match(source, /refresh\.setAttribute\("aria-label", label\("refreshing", "Refreshing…"\)\)/);
	assert.match(source, /await controller\.search\(\{ reset: true \}\)/);
	assert.match(source, /finally \{ refreshing = false; refresh\.disabled = false; refresh\.classList\.remove\("is-refreshing"\)/);
	assert.match(theme, /\.aa-gallery-refresh\.is-refreshing \.aa-ui-icon \{ animation: aa-gallery-status-spin \.72s linear infinite; \}/);
	assert.match(source, /item\.id === "Comfy\.ShowSettingsDialog"/);
	assert.match(source, /typeof app\.ui\?\.settings\?\.show === "function"/);
	assert.match(source, /settings\.pathHint/);
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
	for (const action of ["edit", "favorite", "detail"]) assert.match(theme, new RegExp(`\\.aa-gallery-card-action\\.is-${action}`));
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
	assert.match(source, /dialog\.close\(\); void openComfySettings\(\)/);
	assert.match(source, /if \(!cap\?\.favoriteWrite\) \{ showFavoriteNotice\(source, "readOnly"\); return false; \}/);
	assert.match(theme, /\.aa-gallery-favorite-notice \{/);
});

test("selected gallery cards use a centered confirmation mark and a full-image dim layer", () => {
	assert.match(source, /el\("div", "aa-gallery-card__selected-layer"\)/);
	assert.match(source, /className: "aa-gallery-card__selection"[^]*icon\("statusCheck"\)/);
	assert.match(source, /selectionOrder\.textContent = selected \? String\(order \+ 1\) : ""/);
	assert.match(theme, /\.aa-gallery-card__selected-layer \{[^}]*inset: 0;[^}]*opacity: 0;[^}]*background: color-mix/);
	assert.doesNotMatch(theme, /\.aa-gallery-card__selected-layer \{[^}]*backdrop-filter/);
	assert.match(theme, /\.aa-gallery-card__selection \{[^}]*top: 50%;[^}]*left: 50%;[^}]*opacity: 0;/);
	assert.match(theme, /\.aa-gallery-card__selection \{[^}]*width: 34px;[^}]*height: 34px/);
	assert.match(theme, /\.aa-gallery-card__selection-order \{[^}]*right: -6px;[^}]*bottom: -5px/);
	assert.match(theme, /\.aa-gallery-card\.is-selected \.aa-gallery-card__selection \{[^}]*opacity: 1;/);
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
	assert.match(theme, /\.aa-gallery-card \{[^}]*border-radius: 6px;/);
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
	assert.match(source, /if \(capability\(sourceName\)\?\.authRequired && !hasSourceCredentials\(sourceName\)\) void openComfySettings\(\)/);
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
	assert.match(source, /className: "aa-gallery-hover__loading"[^]*children: \[icon\("loading"\)\]/);
	assert.match(source, /let waitingForLargerPreview = true/);
	assert.match(source, /else \{ waitingForLargerPreview = false; loading\.hidden = true; \}/);
	assert.doesNotMatch(source, /image\.src = proxyUrl\(detail\.source, detail\.mediaUrl\)/);
	assert.doesNotMatch(hoverSource, /capability\(post\.source\)\?\.displayName|`#\$\{post\.postId\}`/);
	assert.match(hoverSource, /children: \[image, loading, \.\.\.\(rating \? \[rating\] : \[\]\), info\]/);
	assert.match(theme, /\.aa-gallery-hover-tooltip\.aa-ui-tooltip \{[^}]*width: min\(320px/);
	assert.match(theme, /\.aa-gallery-hover__media \{[^}]*max-height: 420px/);
	assert.match(theme, /\.aa-gallery-hover__info \{[^}]*position: absolute;[^}]*bottom: 0;[^}]*linear-gradient/);
	assert.match(theme, /\.aa-gallery-hover__info dl \{[^}]*display: flex/);
	assert.match(theme, /\.aa-gallery-hover__info dt \{ font-size: 8\.5px; \}/);
	assert.match(theme, /\.aa-gallery-hover__info dd \{[^}]*font-size: 9px;/);
	assert.match(theme, /\.aa-gallery-hover__tags \{[^}]*display: flex/);
	assert.match(theme, /\.aa-gallery-hover__tag-row > p \{[^}]*font-size: 8\.5px;/);
	assert.match(theme, /\.aa-gallery-hover__tag-row\.is-character/);
	assert.match(theme, /\.aa-gallery-hover__loading \{[^}]*width: 24px;[^}]*height: 24px;[^}]*border: 0;[^}]*border-radius: 999px;[^}]*background: color-mix/);
	assert.match(theme, /\.aa-gallery-hover__rating \{[^}]*position: absolute;[^}]*top: 8px;[^}]*left: 8px;/);
	assert.match(theme, /\.aa-gallery-hover__loading \.aa-ui-icon \{[^}]*aa-gallery-loader-orbit/);
	assert.match(theme, /@keyframes aa-gallery-loader-orbit/);
});

test("gallery micro-interactions acknowledge state without adding polling or card observers", () => {
	for (const animation of ["search-in", "view-in", "count-update", "selection-feedback", "favorite-feedback", "media-in"]) assert.match(theme, new RegExp(`@keyframes aa-gallery-${animation}`));
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
	assert.doesNotMatch(filterSource, /galleryPopoverHeader|filter\.sort|sortPanel|listboxControl/);
	assert.match(filterSource, /label: ratingLabel\(value\), attrs: \{ "data-rating": ratingTone\(value\) \}/);
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
	assert.doesNotMatch(promptSource, /aa-gallery-tool-section|aa-gallery-prompt-layout__lower|aa-gallery-tool-popover__footer/);
	assert.match(theme, /\.aa-gallery-prompt-popover__body \{[^}]*min-height: 128px/);
	assert.match(theme, /\.aa-gallery-prompt-panel\[hidden\] \{ display: none !important; \}/);
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
	assert.match(source, /graphToPrompt/); assert.match(source, /JSON\.stringify\(galleryPayload/);
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
	assert.match(source, /const MIN_SIZE = \[480, 300\]/);
	assert.match(source, /getMinHeight: \(\) => MIN_SIZE\[1\]/);
	assert.match(source, /return \[Math\.max\(MIN_SIZE\[0\], Number\(size\[0\]\) \|\| 0\), MIN_SIZE\[1\]\]/);
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

test("post details use maintainable semantic color hooks", () => {
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	for (const fact of ["resolution", "format", "tags"]) assert.match(detailSource, new RegExp(`\\["${fact}",`));
	assert.match(detailSource, /`rating-\$\{ratingTone\(detail\.rating\)\}`/);
	assert.match(detailSource, /attrs: \{ "data-category": category \}/);
	for (const category of ["artist", "copyright", "character", "general", "meta"]) assert.match(theme, new RegExp(`tag-group\\[data-category="${category}"\\]`));
	for (const action of ["is-source", "is-original", "is-favorite"]) assert.match(detailSource, new RegExp(action));
});

test("local tag editor focuses one color-coded category without rebuilding inputs", () => {
	const editorSource = source.slice(source.indexOf("const openEditor ="), source.indexOf("return { tooltip, search"));
	assert.match(editorSource, /className: "aa-gallery-tag-editor__category-tab"/);
	assert.match(editorSource, /className: "aa-gallery-tag-editor__category"/);
	assert.match(editorSource, /view\.panel\.hidden = !active/);
	assert.match(editorSource, /\["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"\]/);
	assert.match(editorSource, /setCategory\(groups\.general\?\.length \? "general"/);
	assert.match(editorSource, /title: label\("editor\.title", "Edit local tags"\)/);
	assert.doesNotMatch(editorSource, /title: `\$\{label\("editor\.title"/);
	for (const category of ["artist", "copyright", "character", "general", "meta"]) assert.match(theme, new RegExp(`category-tab\\[data-category="${category}"\\]`));
	assert.match(theme, /\.aa-gallery-tag-editor__workspace \{[^}]*grid-template-columns: 158px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-tag-editor__input\.aa-ui-input \{[^}]*height: 100%;[^}]*resize: none/);
	assert.doesNotMatch(theme, /aa-gallery-tag-editor__grid|aa-gallery-tag-editor__hero/);
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
	assert.match(source, /className: "aa-gallery-settings__source-tab"/);
	assert.match(source, /className: "aa-gallery-settings__source-workspace"/);
	assert.match(source, /function settingsSectionHeader\(iconName, title\)/);
	assert.doesNotMatch(source, /settingsSectionHeader\([^\n]*settings\.(?:sourcesHint|browseHint|promptHint|performanceHint)/);
	assert.doesNotMatch(source, /className: "aa-gallery-settings__toggle-card"[^\n]*settings\.tooltipHint/);
	assert.doesNotMatch(source, /className: "aa-gallery-settings__blacklist-icon"[^\n]*settings\.blacklistIntro/);
	assert.match(source, /panel\.hidden = !active; tab\.classList\.toggle\("is-active", active\)/);
	assert.match(source, /\["ArrowUp", "ArrowDown", "Home", "End"\]/);
	assert.doesNotMatch(source, /aa-gallery-settings__hero|aa-gallery-settings__source-grid/);
	assert.match(theme, /aa-gallery-settings-page-in/);
	assert.match(theme, /\.aa-gallery-settings \{[^}]*grid-template-columns: 150px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-settings__source-workspace \{[^}]*grid-template-columns: 184px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-settings__rating\.aa-ui-multiselect \{[^}]*grid-template-columns: repeat\(2/);
	assert.match(theme, /\.aa-gallery-settings__section-header strong \{[^}]*font-size: 12px/);
	assert.match(theme, /\.aa-gallery-settings__blacklist-card > footer small \{[^}]*font-size: 9px/);
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
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input \{[^}]*appearance: none;[^}]*-webkit-appearance: none;[^}]*border: 1px solid[^}]*border-radius: 8px;[^}]*box-shadow: none;/s);
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input:focus[^}]*box-shadow: 0 0 0 3px/s);
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input:-webkit-autofill[^}]*-webkit-text-fill-color: var\(--aa-ui-text\)/s);
});

test("content blacklist is a backend filter with visible settings feedback", () => {
	assert.match(source, /className: "aa-gallery-settings__blacklist-card"/);
	assert.match(source, /settings\.blacklistCount/);
	assert.doesNotMatch(source, /map\(\(tag\) => `-\$\{tag\}`\)/);
	assert.match(theme, /\.aa-gallery-settings__blacklist-card/);
});
