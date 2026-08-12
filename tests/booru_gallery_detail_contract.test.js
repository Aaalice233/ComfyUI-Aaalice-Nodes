import assert from "node:assert/strict";
import fs from "node:fs";
import { readStyleEntry } from "./helpers/style_source.js";
import test from "node:test";

const sourcePaths = [
	"../js/booru_gallery.js",
	"../js/lib/booru_gallery_surface.js",
	"../js/lib/booru_gallery_media.js",
	"../js/lib/booru_gallery_cards.js",
	"../js/lib/booru_gallery_hover.js",
	"../js/lib/booru_gallery_controller.js",
	"../js/lib/booru_gallery_dialogs.js",
	"../js/lib/booru_gallery_settings.js",
];
const source = sourcePaths.map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const tagPillsSource = fs.readFileSync(new URL("../js/lib/controls/tag_pills.js", import.meta.url), "utf8");
const extensionSource = fs.readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));
const uiStyles = fs.readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");
const agents = fs.readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
const enLocale = JSON.parse(fs.readFileSync(new URL("../locales/en/main.json", import.meta.url), "utf8"));
const zhLocale = JSON.parse(fs.readFileSync(new URL("../locales/zh/main.json", import.meta.url), "utf8"));

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

test("hover preview keeps its media geometry stable while detail and larger media load", () => {
	const hoverSource = source.slice(source.indexOf("const showHover ="), source.indexOf("const openDetail ="));
	assert.match(hoverSource, /const anchorImage = anchor\.matches\?\.\("img"\) \? anchor : anchor\.querySelector\?\.\("img"\);/);
	assert.match(hoverSource, /const previewWidth = Number\(anchorImage\?\.naturalWidth\); const previewHeight = Number\(anchorImage\?\.naturalHeight\);/);
	assert.match(hoverSource, /const width = previewWidth > 0 && previewHeight > 0 \? previewWidth : postWidth;/);
	assert.match(hoverSource, /const hoverWidth = Math\.min\(320, Math\.max\(0, window\.innerWidth - 20\)\);/);
	assert.match(hoverSource, /const imageHeight = width > 0 && height > 0 \? Math\.max\(150, Math\.round\(hoverWidth \* height \/ width\)\) : 320;/);
	assert.match(hoverSource, /const maxInfoHeight = Math\.min\(240, Math\.max\(40, Math\.floor\(window\.innerHeight \* 0\.35\)\)\);/);
	assert.match(hoverSource, /const infoHeight = Math\.min\(maxInfoHeight, Math\.max\(40, Math\.ceil\(info\.scrollHeight\)\)\);/);
	assert.match(hoverSource, /content\.style\.setProperty\("--aa-gallery-hover-image-height", `\$\{imageHeight\}px`\)/);
	assert.match(hoverSource, /content\.style\.setProperty\("--aa-gallery-hover-info-height", `\$\{infoHeight\}px`\)/);
	assert.match(hoverSource, /content\.classList\.toggle\("is-tall-crop", imageHeight > Math\.max\(0, window\.innerHeight - 20 - infoHeight\)\)/);
	assert.doesNotMatch(hoverSource, /style: \{ "--aa-gallery-hover-image-height"/);
	assert.doesNotMatch(hoverSource, /applyHoverImageSize|transitionend[^\n]*tooltip\.reposition/);
	assert.match(theme, /\.aa-gallery-hover \{[^}]*grid-template-rows:/);
	assert.match(theme, /\.aa-gallery-hover__media > img \{[^}]*object-fit: contain/);
	assert.match(theme, /\.aa-gallery-hover\.is-tall-crop \.aa-gallery-hover__media \{[^}]*place-items: start center/);
	assert.match(theme, /\.aa-gallery-hover\.is-tall-crop \.aa-gallery-hover__media > img \{[^}]*height: auto/);
	assert.match(theme, /\.aa-gallery-hover \{[^}]*grid-template-rows:[^}]*var\(--aa-gallery-hover-info-height, 40px\)/);
	assert.doesNotMatch(theme, /\.aa-gallery-hover \{[^}]*grid-template-rows:[^}]*96px/);
	assert.match(theme, /\.aa-gallery-hover__info \{[^}]*min-height: 0;[^}]*overflow-y: auto/);
	assert.match(hoverSource, /window\.addEventListener\("resize", syncViewportGeometry\)/);
	assert.match(hoverSource, /geometryCleanup = \(\) => window\.removeEventListener\("resize", syncViewportGeometry\)/);
	assert.match(hoverSource, /syncGeometry\(\);\s*tooltip\.reposition\(\);\s*if \(currentLocale\(\) === "zh"/);
	assert.doesNotMatch(theme, /\.aa-gallery-hover__media \{[^}]*transition: height/);
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
	assert.match(toolbarSource, /children: \[source, tabs, selectionMode,/);
	assert.match(toolbarSource, /children: \[nodeMode, randomMode, refresh, clear, openSettings\]/);
	assert.match(source, /view\.selectedCount\.textContent = String\(count\)/);
	assert.match(theme, /\.aa-gallery-view-switcher__count \{[^}]*min-width: 18px;[^}]*border: 0;[^}]*font-size: 10px;[^}]*font-weight: 800/);
	assert.match(theme, /\.aa-gallery-node-mode\[data-value="mute"\]/);
	assert.match(theme, /\.aa-gallery-node-mode\[data-value="bypass"\]/);
	assert.match(theme, /\.aa-gallery-node-mode \{[^}]*pointer-events: none/);
	assert.match(theme, /\.aa-gallery-node-mode__label/);
	assert.match(theme, /\.aa-gallery--dashboard :is\(\.aa-gallery-toolbar-action, \.aa-gallery-toolbar-text-action\)\.aa-ui-button > \.aa-ui-button__label, \.aa-gallery--dashboard \.aa-gallery-random-mode__switch \{ display: none; \}/);
	const countStyle = theme.match(/\.aa-gallery-view-switcher__count \{([^}]*)\}/)?.[1] || "";
	assert.doesNotMatch(countStyle, /0 0 0 1px/);
	assert.match(theme, /\.aa-gallery\[data-mode="browse"\] \.aa-gallery-toolbar__selected-summary, \.aa-gallery\[data-mode="browse"\] \.aa-gallery-selected__clear \{ display: none; \}/);
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
	assert.match(source, /className: `aa-gallery aa-gallery--\$\{placement\}`[^\n]*"data-mode": stateFor\(node\)\.view, "data-capture-wheel": "true"/);
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
	assert.match(source, /const PROMPT_ASSISTANT_API_CANDIDATES = \["\/prompt-assistant\/api", "\/ComfyUI-Prompt-Assistant\/api"\]/);
	assert.match(source, /\$\{base\}\/config\/llm\/masked/);
	assert.match(source, /promptAssistantAvailable = Boolean\(assistantApi\)/);
	assert.match(source, /actionButton\("copy", "copyPrompt", 2, async \(\) =>/);
	assert.match(source, /copyPromptAction\.setAttribute\("aria-label", label\("card\.copyPrompt", "Copy prompt"\)\)/);
	assert.match(source, /interrogateAction\.style\.display = isPromptAssistantAvailable\(\) \? "" : "none"/);
	assert.match(source, /const copyPostPrompt = async \(post\) =>/);
	assert.match(source, /navigator\.clipboard\.writeText\(text\)/);
	assert.match(source, /label\("card\.promptCopied", "Prompt copied to clipboard"\)/);
	assert.match(source, /label\("selected\.noPrompt"/);
	assert.match(source, /const interrogatePost = async \(post, card, control\) =>/);
	assert.match(source, /card\.classList\.add\("is-interrogating"\)/);
	assert.match(source, /\$\{base\}\/vlm\/analyze/);
	assert.match(source, /request_id: crypto\.randomUUID\(\)/);
	assert.match(source, /openInterrogateResultDialog\(detail, String\(result\.data\?\.description/);
	assert.match(source, /className: "aa-gallery-card__scan"/);
	assert.match(theme, /\.aa-gallery-card\.is-interrogating \.aa-gallery-card__scan \{[^}]*animation: aa-gallery-card-scan/);
	assert.match(theme, /\.aa-gallery-card\.is-interrogating \.aa-gallery-card__surface \{[^}]*translate3d\(0, -4px, 12px\)[^}]*animation: aa-gallery-card-scan-glow/);
	assert.match(source, /actionControls = \[editAction, favoriteAction, copyPromptAction, interrogateAction, downloadAction, detailAction\]/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.card.copyPrompt, "string");
		assert.equal(typeof locale.aaalice.gallery.card.promptCopied, "string");
		assert.equal(typeof locale.aaalice.gallery.card.interrogate, "string");
		assert.equal(typeof locale.aaalice.gallery.interrogate.title, "string");
		assert.equal(typeof locale.aaalice.gallery.interrogate.copied, "string");
		assert.equal(typeof locale.aaalice.gallery.interrogate.failed, "string");
		assert.equal(typeof locale.aaalice.gallery.error.media, "string");
	}
	assert.match(source, /code === "credentials_required" \|\| code === "tls_certificate_error"/);
	assert.match(source, /errorTimer = setTimeout\(clearError, 6000\)/);
	assert.match(source, /label\("error\.media", "Image request failed \(HTTP \{status\}\)"\)/);
	assert.match(source, /life: 3200/);
	assert.match(source, /life: 5000/);
});

test("gallery cards and post details download originals with distinct open and download icons", () => {
	const cardSource = source.slice(source.indexOf("function buildGalleryCardView"), source.indexOf("function createSelectedRow"));
	const detailSource = source.slice(source.indexOf("const openDetail ="), source.indexOf("const openEditor ="));
	assert.match(cardSource, /actionButton\("download", "download", 4/);
	assert.match(cardSource, /label\("card\.download", "Download original"\)/);
	assert.match(cardSource, /downloadAction\.style\.display = favoriteCapability\?\.download \? "" : "none"/);
	assert.match(detailSource, /className: "aa-gallery-detail__action is-original"[\s\S]*iconName: "externalLink"/);
	assert.match(detailSource, /className: "aa-gallery-detail__action is-download"[\s\S]*label\("detail\.download", "Download original"\)[\s\S]*iconName: "download"/);
	assert.match(source, /const downloadOriginal = async \(post, control = null\)/);
	assert.match(source, /anchor\.href = proxyUrl\(detail\.source, detail\.mediaUrl\)/);
	assert.match(source, /anchor\.download = `\$\{safePart\(detail\.source, "gallery"\)\}-\$\{safePart\(detail\.postId, "image"\)\}\.\$\{extension\}`/);
	assert.match(source, /document\.body\.append\(anchor\);[\s\S]*anchor\.click\(\);[\s\S]*anchor\.remove\(\)/);
	assert.match(source, /control\?\._aaGalleryDownloadOperation === operation/);
	assert.match(cardSource, /downloadAction\._aaGalleryDownloadOperation = null;[\s\S]*downloadAction\.classList\.remove\("is-downloading"\)/);
	assert.match(theme, /\.aa-gallery-card-action\.is-download \{[^}]*--aa-gallery-action-tone/);
	assert.match(theme, /\.aa-gallery-detail__action\.is-download \{[^}]*--aa-gallery-detail-action-tone/);
	for (const locale of [enLocale, zhLocale]) {
		assert.equal(typeof locale.aaalice.gallery.card.download, "string");
		assert.equal(typeof locale.aaalice.gallery.detail.download, "string");
	}
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
	for (const action of ["is-source", "is-original", "is-download", "is-favorite"]) assert.match(detailSource, new RegExp(action));
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
