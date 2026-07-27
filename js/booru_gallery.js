/** Multi-site Booru Gallery with virtual masonry and immutable queue snapshots. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, currentLocale, t } from "./i18n.js";
import { defaultGalleryRatings, finalPrompt, galleryPayload, GALLERY_CATEGORIES, normalizeGalleryState, normalizeTagGroups, selectionFromDetail, selectionKey } from "./lib/booru_gallery_model.js";
import { streamTagTranslations } from "./lib/tag_translation.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import { mountVirtualList } from "./lib/virtual_list.js";
import { mountVirtualMasonry } from "./lib/virtual_masonry.js";
import { button, checkboxControl, createAnchoredPopover, createDialog, createTooltip, el, field, icon, iconButton, isolate, listboxControl, multiSelectControl, searchToggleButton, segmentedControl } from "./lib/ui.js";
import { createTagPillList } from "./lib/controls/tag_pills.js";

const NODE = "BooruGalleryNode";
const PROPERTY = "booruGalleryState";
const API = "/aaalice/booru-gallery";
const PROMPT_ASSISTANT_API = "/prompt-assistant/api";
let promptAssistantAvailable = false;
const DEFAULT_SIZE = [760, 720];
const MIN_SIZE = [620, 300];
const STATIC_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

let settings = null;
let capabilities = [];
let setupRequest = null;

function isGallery(node) { return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE); }
function stateFor(node) { node.properties ||= {}; node.properties[PROPERTY] = normalizeGalleryState(node.properties[PROPERTY], settings || {}); return node.properties[PROPERTY]; }
function capability(source) { return capabilities.find((item) => item.source === source); }
function label(key, fallback) { return t(`aaalice.gallery.${key}`, fallback); }
function dimensions(value) { return `${Math.max(0, Number(value?.width) || 0)}×${Math.max(0, Number(value?.height) || 0)}`; }
function fileSizeLabel(value) {
	const bytes = Math.max(0, Number(value) || 0);
	if (!bytes) return "—";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KiB`;
	return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MiB`;
}
function tagCount(groups) { return GALLERY_CATEGORIES.reduce((total, category) => total + (groups?.[category]?.length || 0), 0); }
function ratingKey(value) {
	const rating = String(value || "").trim().toLowerCase();
	return ({ g: "general", s: "sensitive", q: "questionable", e: "explicit" })[rating] || rating || "unknown";
}
function ratingTone(value) {
	const rating = ratingKey(value);
	return ["general", "safe", "sensitive", "questionable", "explicit"].includes(rating) ? rating : "unknown";
}
function ratingLabel(value) { const key = ratingKey(value); return label(`rating.${key}`, String(value || "—")); }

function createDetailImageViewer({ previewSrc, originalSrc, alt }) {
	const MIN_SCALE = 1; const MAX_SCALE = 8; const BUTTON_STEP = 1.35;
	let scale = MIN_SCALE; let offsetX = 0; let offsetY = 0; let activePointer = null; let dragX = 0; let dragY = 0; let loadToken = 0; let originalLoader = null; let destroyed = false;
	previewSrc ||= originalSrc;
	const image = el("img", { className: "aa-gallery-detail__image", attrs: { src: previewSrc, alt } }); image.dataset.quality = previewSrc === originalSrc ? "original" : "preview";
	const viewport = el("div", { className: "aa-gallery-detail__viewport", attrs: { tabindex: "0", role: "group", "aria-label": label("detail.viewer", "Image viewer. Scroll to zoom, then drag to move. Double-click to reset.") }, children: [image] });
	const zoomValue = el("output", { className: "aa-gallery-detail__zoom-value", text: "100%" });
	const clampOffsets = () => {
		const width = viewport.clientWidth; const height = viewport.clientHeight;
		if (!width || !height || !image.naturalWidth || !image.naturalHeight || scale <= MIN_SCALE) { offsetX = 0; offsetY = 0; return; }
		const fittedScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
		const fittedWidth = image.naturalWidth * fittedScale; const fittedHeight = image.naturalHeight * fittedScale;
		const maxX = Math.max(0, (fittedWidth * scale - width) / 2); const maxY = Math.max(0, (fittedHeight * scale - height) / 2);
		offsetX = Math.max(-maxX, Math.min(maxX, offsetX)); offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
	};
	let zoomOut; let zoomIn;
	const render = () => {
		clampOffsets();
		image.style.setProperty("--aa-gallery-detail-scale", String(scale));
		image.style.setProperty("--aa-gallery-detail-offset-x", `${offsetX}px`);
		image.style.setProperty("--aa-gallery-detail-offset-y", `${offsetY}px`);
		viewport.classList.toggle("is-zoomed", scale > MIN_SCALE);
		zoomValue.value = `${Math.round(scale * 100)}%`; zoomValue.textContent = zoomValue.value;
		if (zoomOut) zoomOut.disabled = scale <= MIN_SCALE; if (zoomIn) zoomIn.disabled = scale >= MAX_SCALE;
	};
	const setScale = (nextScale, clientX = null, clientY = null) => {
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
		if (next === scale) return;
		const rect = viewport.getBoundingClientRect();
		const pointerX = (clientX ?? (rect.left + rect.width / 2)) - rect.left - rect.width / 2;
		const pointerY = (clientY ?? (rect.top + rect.height / 2)) - rect.top - rect.height / 2;
		const ratio = next / scale;
		offsetX = pointerX - (pointerX - offsetX) * ratio; offsetY = pointerY - (pointerY - offsetY) * ratio; scale = next; render();
	};
	const reset = () => { scale = MIN_SCALE; offsetX = 0; offsetY = 0; render(); };
	zoomOut = iconButton({ iconName: "zoomOut", label: label("detail.zoomOut", "Zoom out"), variant: "ghost", onClick: () => setScale(scale / BUTTON_STEP) });
	const fit = iconButton({ iconName: "fit", label: label("detail.resetView", "Reset view"), variant: "ghost", onClick: reset });
	zoomIn = iconButton({ iconName: "zoomIn", label: label("detail.zoomIn", "Zoom in"), variant: "ghost", onClick: () => setScale(scale * BUTTON_STEP) });
	const controls = el("div", { className: "aa-gallery-detail__viewer-controls", attrs: { role: "group", "aria-label": label("detail.viewerControls", "Image view controls") }, children: [zoomOut, zoomValue, fit, zoomIn] });
	const statusIcon = el("span", { className: "aa-gallery-detail__media-status-icon", attrs: { "aria-hidden": "true" } });
	const statusText = el("span", "aa-gallery-detail__media-status-text");
	const retry = iconButton({ iconName: "refresh", label: label("detail.retryOriginal", "Retry original"), variant: "ghost" });
	const status = el("div", { className: "aa-gallery-detail__media-status", attrs: { role: "status", "aria-live": "polite" }, children: [statusIcon, statusText, retry] });
	const setLoadState = (state, text) => {
		status.hidden = state === "ready"; status.dataset.state = state; statusText.textContent = text || ""; retry.hidden = state !== "error";
		statusIcon.replaceChildren(icon(state === "error" ? "statusError" : "loading"));
	};
	const loadOriginal = () => {
		if (destroyed || !originalSrc) return;
		const token = ++loadToken;
		setLoadState("loading", label("detail.loadingOriginal", "Loading original…"));
		if (previewSrc === originalSrc) {
			image.dataset.quality = "original"; image.removeAttribute("src");
			requestAnimationFrame(() => { if (!destroyed && token === loadToken) image.src = originalSrc; });
			return;
		}
		if (originalLoader) originalLoader.src = "";
		const loader = new Image(); originalLoader = loader; loader.decoding = "async";
		loader.addEventListener("load", () => {
			if (destroyed || token !== loadToken) return;
			originalLoader = null; image.dataset.quality = "original"; image.src = originalSrc;
		}, { once: true });
		loader.addEventListener("error", () => {
			if (destroyed || token !== loadToken) return;
			originalLoader = null; setLoadState("error", label("detail.originalFailed", "Original image failed to load. Preview kept."));
		}, { once: true });
		loader.src = originalSrc;
	};
	retry.addEventListener("click", loadOriginal);
	viewport.addEventListener("wheel", (event) => { event.preventDefault(); setScale(scale * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY); }, { passive: false });
	viewport.addEventListener("pointerdown", (event) => {
		viewport.focus({ preventScroll: true });
		if (event.button !== 0 || scale <= MIN_SCALE) return;
		event.preventDefault(); activePointer = event.pointerId; dragX = event.clientX - offsetX; dragY = event.clientY - offsetY; viewport.setPointerCapture(event.pointerId); viewport.classList.add("is-dragging");
	});
	viewport.addEventListener("pointermove", (event) => { if (event.pointerId !== activePointer) return; offsetX = event.clientX - dragX; offsetY = event.clientY - dragY; render(); });
	const endDrag = (event) => { if (event.pointerId !== activePointer) return; activePointer = null; viewport.classList.remove("is-dragging"); if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId); };
	viewport.addEventListener("pointerup", endDrag); viewport.addEventListener("pointercancel", endDrag);
	viewport.addEventListener("dblclick", reset);
	viewport.addEventListener("keydown", (event) => {
		if (["+", "="].includes(event.key)) { event.preventDefault(); setScale(scale * BUTTON_STEP); return; }
		if (event.key === "-") { event.preventDefault(); setScale(scale / BUTTON_STEP); return; }
		if (event.key === "0") { event.preventDefault(); reset(); return; }
		const movement = { ArrowLeft: [36, 0], ArrowRight: [-36, 0], ArrowUp: [0, 36], ArrowDown: [0, -36] }[event.key];
		if (!movement || scale <= MIN_SCALE) return;
		event.preventDefault(); offsetX += movement[0]; offsetY += movement[1]; render();
	});
	image.addEventListener("load", () => { render(); if (image.dataset.quality === "original") setLoadState("ready"); });
	image.addEventListener("error", () => {
		if (image.dataset.quality !== "original") return;
		if (previewSrc && previewSrc !== originalSrc) { image.dataset.quality = "preview"; image.src = previewSrc; }
		setLoadState("error", label("detail.originalFailed", "Original image failed to load. Preview kept."));
	});
	image.draggable = false; render(); loadOriginal();
	return {
		root: el("div", { className: "aa-gallery-detail__media", children: [viewport, status, controls] }),
		destroy() { destroyed = true; loadToken += 1; if (originalLoader && !originalLoader.complete) originalLoader.src = ""; originalLoader = null; image.removeAttribute("src"); },
	};
}
function ratingIcon(value) { return ({ general: "ratingGeneral", safe: "ratingGeneral", sensitive: "ratingSensitive", questionable: "ratingQuestionable", explicit: "ratingExplicit" })[ratingTone(value)] || "statusIdle"; }
function sortLabel(value) { return label(`collection.${value}`, String(value)); }
const SELECTION_STAMPS = [
	"inspection", "approved", "pass", "qa", "audit", "certified", "verified", "selected", "quality", "accepted", "official", "checked", "pure", "crown",
	"inspectionDate", "inspectionReverse", "passDate", "qaDate", "reviewBadge", "birthday", "organic", "silverCapital", "visa", "hotPick", "soldOut", "hot", "nationwideShipping", "nationwideFlight",
	"sfShipping", "qualityGuarantee", "praise", "delicacySquare", "traditionVertical", "chinaCuisine", "ruyi", "snowCuisine", "traditionCircle", "delicacyWide", "traditionWide", "auspicious", "exclusiveCertification", "soldOutPostal", "quarantineQualified",
];
function selectionStampCopy(style) {
	return {
		inspection: ["NO.01", label("stamp.inspection", "INSPECTED"), label("stamp.approved", "APPROVED")], approved: ["APPROVED", label("stamp.approved", "APPROVED"), "PASS"],
		pass: ["QUALITY", "PASS", "NO.02"], qa: ["QA 01", label("stamp.quality", "QUALITY"), "PASS"], audit: ["AUDIT", label("stamp.audit", "AUDITED"), "OK"],
		certified: ["100%", label("stamp.certified", "CERTIFIED"), "PASS"], verified: ["CHECK", label("stamp.verified", "VERIFIED"), "OK"],
		selected: ["PICK", label("stamp.selected", "SELECTED"), "✓"], quality: ["QA", label("stamp.quality", "QUALITY"), "100%"],
		accepted: ["REVIEW", label("stamp.accepted", "ACCEPTED"), "PASS"], official: ["OFFICIAL", label("stamp.official", "OFFICIAL"), "SEAL"],
		checked: ["CHECK", label("stamp.checked", "CHECKED"), "✓"], pure: ["100%", label("stamp.pure", "PURE"), "PASS"],
		crown: ["♛", label("stamp.crown", "PREMIUM"), "PASS"],
		inspectionDate: ["检验01", "2020.03.10", "合格"], inspectionReverse: ["合格", "2020.03.10", "检01"], passDate: ["PASS", "2020.03.10", "检02"], qaDate: ["QA01", "2020.03.10", "PASS"],
		reviewBadge: ["", "审核通过", ""], birthday: ["HAPPY BIRTHDAY", "生日快乐", "HAPPY BIRTHDAY"], organic: ["百分百", "原生态", "100% PURE"],
		silverCapital: ["♛", "官银资本", "OFFICIAL"], visa: ["", "VISA", ""], hotPick: ["爆款推荐", "HOT SALE", "爆款推荐"], soldOut: ["100%", "今日已售罄", "SOLD OUT"],
		hot: ["", "爆", ""], nationwideShipping: ["全国", "全国包邮", "包邮"], nationwideFlight: ["全国", "全国可飞", "可飞"], sfShipping: ["顺丰", "顺丰包邮", "包邮"], qualityGuarantee: ["品质", "品质保证", "保证"],
		praise: ["好评", "好评如潮", "如潮"], delicacySquare: ["", "美味\n佳肴", ""], traditionVertical: ["", "传\n统\n文\n化", ""], chinaCuisine: ["", "中国\n美味", ""],
		ruyi: ["", "如\n意", ""], snowCuisine: ["", "雪尖\n美食", ""], traditionCircle: ["", "传统\n文化", ""], delicacyWide: ["", "美味佳肴", ""], traditionWide: ["", "传统文化", ""],
		auspicious: ["", "吉\n祥", ""], exclusiveCertification: ["", "专属认证", ""], soldOutPostal: ["", "", ""], quarantineQualified: ["", "", ""],
	}[style] || ["NO.01", label("stamp.inspection", "INSPECTED"), label("stamp.approved", "APPROVED")];
}
function selectionStampLabel(style) {
	if (style === "soldOutPostal") return label("stampSoldOutPostal", "Xianyu Sold Out Postmark");
	if (style === "quarantineQualified") return label("stampQuarantineQualified", "Quarantine Qualified");
	return label(`stamp.${style}`, style);
}
function soldOutPostalArt() {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 104 72"); svg.setAttribute("class", "aa-gallery-stamp__postal"); svg.setAttribute("aria-hidden", "true");
	svg.innerHTML = '<g class="aa-gallery-stamp__postal-ring"><circle cx="34" cy="36" r="27"/><circle cx="34" cy="36" r="22"/></g><g class="aa-gallery-stamp__postal-waves"><path d="M58 20c10-6 17 4 28-2 6-3 10-7 16-9"/><path d="M59 28c10-6 17 4 28-2 6-3 10-7 16-9"/><path d="M59 36c10-6 17 4 28-2 6-3 10-7 16-9"/><path d="M58 44c10-6 17 4 28-2 6-3 10-7 16-9"/></g><text class="aa-gallery-stamp__postal-xianyu" x="34" y="20">XIANYU</text><text class="aa-gallery-stamp__postal-sold" x="34" y="59">SOLD OUT</text><g class="aa-gallery-stamp__postal-board"><rect x="5" y="25" width="65" height="27" rx="3"/><rect x="8" y="28" width="59" height="21" rx="2"/><text x="37" y="44">卖掉了</text></g>';
	return svg;
}
function quarantineQualifiedArt() {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 64 64"); svg.setAttribute("class", "aa-gallery-stamp__quarantine"); svg.setAttribute("aria-hidden", "true");
	svg.innerHTML = '<g class="aa-gallery-stamp__quarantine-rings"><circle cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="25"/></g><g class="aa-gallery-stamp__quarantine-copy"><text x="32" y="25">检疫</text><text x="32" y="45">合格</text></g>';
	return svg;
}
const TRADITIONAL_SEAL_SPECS = Object.freeze({
	delicacySquare: { shape: "square", lines: ["美味", "佳肴"] },
	traditionVertical: { shape: "vertical", lines: ["传", "统", "文", "化"] },
	chinaCuisine: { shape: "square", lines: ["中国", "美味"] },
	ruyi: { shape: "vertical", lines: ["如", "意"] },
	snowCuisine: { shape: "square", lines: ["雪尖", "美食"] },
	traditionCircle: { shape: "circle", lines: ["传统", "文化"] },
	delicacyWide: { shape: "wide", lines: ["美味佳肴"] },
	traditionWide: { shape: "wide", lines: ["传统文化"] },
	auspicious: { shape: "vertical", lines: ["吉", "祥"] },
});
function traditionalSealArt(style) {
	const spec = TRADITIONAL_SEAL_SPECS[style];
	const dimensions = spec.shape === "vertical" ? [40, 68] : spec.shape === "wide" ? [76, 42] : [64, 64];
	const [width, height] = dimensions;
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.setAttribute("class", "aa-gallery-stamp__traditional"); svg.setAttribute("aria-hidden", "true");
	const outline = spec.shape === "circle"
		? `<circle cx="32" cy="32" r="29"/><circle class="aa-gallery-stamp__traditional-inset" cx="32" cy="32" r="25"/>`
		: `<rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="${spec.shape === "wide" ? 5 : 7}"/><rect class="aa-gallery-stamp__traditional-inset" x="5" y="5" width="${width - 10}" height="${height - 10}" rx="${spec.shape === "wide" ? 3 : 5}"/>`;
	const fontSize = spec.shape === "vertical" ? (spec.lines.length === 4 ? 13 : 19) : spec.shape === "wide" ? 16 : 20;
	const lineHeight = spec.shape === "vertical" && spec.lines.length === 4 ? 14 : fontSize + 3;
	const totalHeight = (spec.lines.length - 1) * lineHeight; const firstY = height / 2 - totalHeight / 2;
	const text = spec.lines.map((line, index) => `<text x="${width / 2}" y="${firstY + index * lineHeight}" font-size="${fontSize}">${line}</text>`).join("");
	svg.innerHTML = `<g class="aa-gallery-stamp__traditional-ink">${outline}${text}</g>`;
	return svg;
}
const SELECTION_STAMP_ART = Object.freeze({
	soldOutPostal: soldOutPostalArt,
	quarantineQualified: quarantineQualifiedArt,
	...Object.fromEntries(Object.keys(TRADITIONAL_SEAL_SPECS).map((style) => [style, () => traditionalSealArt(style)])),
});
function createSelectionStamp(initialStyle, { preview = false } = {}) {
	const top = el("span", "aa-gallery-stamp__top"); const main = el("span", "aa-gallery-stamp__main"); const bottom = el("span", "aa-gallery-stamp__bottom");
	const art = el("span", "aa-gallery-stamp__art");
	const root = el("span", { className: `aa-gallery-card__selection${preview ? " is-preview" : ""}`, attrs: { "aria-hidden": "true" }, children: [top, main, bottom, art] });
	const setStyle = (value) => {
		const style = SELECTION_STAMPS.includes(value) ? value : "inspection";
		root.dataset.stamp = style;
		[top.textContent, main.textContent, bottom.textContent] = selectionStampCopy(style);
		const createArt = SELECTION_STAMP_ART[style];
		art.replaceChildren(...(createArt ? [createArt()] : []));
	};
	setStyle(initialStyle); return { root, setStyle };
}
function effectivePrompt(node) {
	return { ...stateFor(node).prompt, excludedTags: [...(settings?.blacklist || [])] };
}

async function saveGlobalBlacklist(value) {
	const blacklist = Array.isArray(value) ? [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))] : tagLines(value);
	settings = await jsonRequest(`${API}/settings/save`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ blacklist }),
	});
	const searches = [];
	for (const galleryNode of app.graph?._nodes || []) {
		if (!isGallery(galleryNode)) continue;
		if (stateFor(galleryNode).selections.some((selection) => blacklist.some((tag) => selectionContainsTag(selection, tag)))) {
			transact(galleryNode, (state) => { state.selections = state.selections.filter((selection) => !blacklist.some((tag) => selectionContainsTag(selection, tag))); });
		}
		galleryNode._aaGalleryController?.renderSelected();
		galleryNode._aaGalleryController?.refreshCards();
		const request = galleryNode._aaGalleryController?.search({ reset: true, page: 1 });
		if (request) searches.push(request);
	}
	await Promise.all(searches);
	return blacklist;
}
function collectionOptions(source) {
	const cap = capability(source);
	const sortIcons = { latest: "statusIdle", new: "statusIdle", score: "statusCheck", favcount: "favorite", random: "refresh" };
	const options = (cap?.sortValues || ["latest"]).map((value) => ({ value: `sort:${value}`, label: sortLabel(value), iconName: sortIcons[value] || "layout" }));
	for (const period of cap?.rankingPeriods || []) options.push({ value: `ranking:${period}`, label: label(`collection.${period}Ranking`, `${period} ranking`), iconName: "statusIdle" });
	if (cap?.favoriteRead) options.push({ value: "favorites", label: label("collection.favorites", "Favorites"), iconName: "favorite" });
	return options;
}
function collectionValue(state) {
	if (state.filters.feed === "favorites") return "favorites";
	if (state.filters.feed === "ranking") return `ranking:${state.filters.period}`;
	return `sort:${state.filters.sort}`;
}
function hasSourceCredentials(source) {
	const fields = capability(source)?.authFields || [];
	const status = settings?.credentialStatus?.[source] || {};
	return fields.every((name) => status[`has${name[0].toUpperCase()}${name.slice(1)}`]);
}

function openGallerySettings() {
	void openSettingsDialog().catch((error) => {
		console.error("[Aaalice] Gallery settings failed", error);
		app.extensionManager?.toast?.add?.({ severity: "error", summary: label("settings.title", "Booru Gallery"), detail: error.message, life: 5000 });
	});
}

function showFavoriteNotice(source, reason) {
	const cap = capability(source); let dialog;
	const needsLogin = reason === "login";
	const body = el("div", { className: "aa-gallery-favorite-notice", children: [
		el("span", { children: [icon("favorite")] }),
		el("p", null, needsLogin
			? label("card.favoriteLoginBody", "Configure this source account before adding favorites.").replace("{source}", cap?.displayName || source)
			: label("card.favoriteReadOnlyBody", "This source currently supports reading favorites, but not adding them.").replace("{source}", cap?.displayName || source)),
	] });
	const close = button({ label: label("card.favoriteDismiss", "Got it"), variant: "ghost", onClick: () => dialog.close() });
	const actions = [close];
	if (needsLogin) actions.push(button({ label: label("card.favoriteConfigure", "Configure account"), iconName: "settings", variant: "primary", onClick: () => { dialog.close(); openGallerySettings(); } }));
	dialog = createDialog({ title: needsLogin ? label("card.favoriteLoginTitle", "Account required") : label("card.favoriteReadOnlyTitle", "Favorites are read-only"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: actions }), size: "compact" });
}

function canWriteFavorite(source) {
	const cap = capability(source);
	if (!cap?.favoriteWrite) { showFavoriteNotice(source, "readOnly"); return false; }
	if (!hasSourceCredentials(source)) { showFavoriteNotice(source, "login"); return false; }
	return true;
}

function sectionHeading(title, hint = "") {
	return el("header", { className: "aa-gallery-section-heading", children: [el("strong", null, title), ...(hint ? [el("small", null, hint)] : [])] });
}

async function jsonRequest(path, options = {}) {
	const response = await api.fetchApi(path, options); let data;
	try { data = await response.json(); } catch { throw new Error(`${path} returned invalid JSON`); }
	if (!response.ok) throw new Error(data.message || `${path} HTTP ${response.status}`);
	return data;
}

async function loadSetup({ force = false } = {}) {
	if (!force && settings && capabilities.length) return { settings, capabilities };
	if (!force && setupRequest) return setupRequest;
	setupRequest = Promise.all([
		jsonRequest(`${API}/settings`),
		jsonRequest(`${API}/sources`),
		api.fetchApi(`${PROMPT_ASSISTANT_API}/config/llm/masked`).then((response) => response.ok).catch(() => false),
	]).then(([nextSettings, sourceData, assistantAvailable]) => {
		settings = nextSettings; capabilities = sourceData.sources || []; promptAssistantAvailable = Boolean(assistantAvailable); return { settings, capabilities };
	}).finally(() => { setupRequest = null; });
	return setupRequest;
}

function transact(node, callback) {
	node.graph?.beforeChange?.();
	try { callback(stateFor(node)); }
	finally { node.graph?.afterChange?.(); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, true); }
}

function proxyUrl(source, url) { return `${API}/media?${new URLSearchParams({ source, url })}`; }
async function fetchMediaBlob(src) {
	const response = await api.fetchApi(src);
	if (!response.ok) throw new Error(label("error.media", "Image request failed (HTTP {status})").replace("{status}", String(response.status)));
	return response.blob();
}
function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
		reader.addEventListener("error", () => reject(reader.error || new Error("Failed to read image data")), { once: true });
		reader.readAsDataURL(blob);
	});
}
async function copyImageToClipboard(src) {
	const blob = await fetchMediaBlob(src);
	const bitmap = await createImageBitmap(blob);
	try {
		const canvas = document.createElement("canvas");
		canvas.width = bitmap.width; canvas.height = bitmap.height;
		canvas.getContext("2d").drawImage(bitmap, 0, 0);
		const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
		if (!png) throw new Error("Failed to encode image as PNG");
		await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
	} finally { bitmap.close(); }
}
function searchQuery(state) { return state.query.trim(); }
function tagLines(value) { return [...new Set(String(value || "").split(/\n/).map((tag) => tag.trim()).filter(Boolean))]; }

function selectionContainsTag(selection, tag) {
	const target = String(tag).toLocaleLowerCase();
	const groups = normalizeTagGroups(selection.originalTags || selection.editedTags);
	return GALLERY_CATEGORIES.some((category) => groups[category].some((value) => String(value).toLocaleLowerCase() === target));
}

async function addGlobalBlacklistTag(tag) {
	const value = String(tag || "").trim();
	if (!value) return;
	const current = settings?.blacklist || [];
	if (!current.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) await saveGlobalBlacklist([...current, value]);
}

function createSearchControl(node) {
	const root = el("div", "aa-gallery-search");
	const input = document.createElement("input"); input.type = "search"; input.className = "aa-gallery-search__input aa-ui-search-input";
	input.setAttribute("data-autocomplete-plus", "");
	input.placeholder = label("search.placeholder", "Search tags…"); input.setAttribute("aria-label", label("search.label", "Search posts"));
	const close = iconButton({ iconName: "arrowRight", label: label("search.close", "Close search"), className: "aa-ui-search-collapse", variant: "ghost", onClick: () => setOpen(false) });
	root.append(icon("search"), input, close);
	const toggle = searchToggleButton({ label: label("search.label", "Search posts"), onClick: () => setOpen(true) });
	let open = false; let composing = false;
	const submit = () => {
		transact(node, (state) => { state.query = input.value.trim(); state.filters.feed = "search"; state.filters.period = ""; state.navigation.page = 1; });
		toggle.setSearchValue(input.value.trim());
		node._aaGalleryCollection?.setValue(`sort:${stateFor(node).filters.sort}`);
		node._aaGalleryPage?.setPage(1);
		node._aaGalleryController?.search({ reset: true, page: 1 });
	};
	const setOpen = (next) => {
		open = Boolean(next);
		if (!open && input.value.trim() !== searchQuery(stateFor(node))) submit();
		root.classList.toggle("is-open", open); toggle.hidden = open; toggle.setSearchOpen(open); node._aaGalleryRoot?.classList.toggle("is-searching", open);
		if (open) queueMicrotask(() => { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); });
	};
	const addTag = (tag, maxTags = null) => {
		const value = String(tag || "").trim();
		if (!value) return false;
		setOpen(true);
		const terms = input.value.trim().match(/"[^"]+"|'[^']+'|\S+/g) || [];
		if (terms.some((term) => term.replace(/^(["'])|(["'])$/g, "").toLocaleLowerCase() === value.toLocaleLowerCase())) return true;
		if (Number.isInteger(maxTags) && terms.length >= maxTags) {
			app.extensionManager.toast.add({ severity: "warning", summary: label("search.limitTitle", "Search limit"), detail: label("search.tagLimit", "This source supports up to {count} tags per search.").replace("{count}", String(maxTags)), life: 4000 });
			return false;
		}
		input.value = [...terms, value].join(" ");
		submit();
		return true;
	};
	const syncInput = () => {
		toggle.setSearchValue(input.value);
		if (!composing && !input.value.trim() && searchQuery(stateFor(node))) submit();
	};
	input.addEventListener("input", syncInput);
	input.addEventListener("compositionstart", () => { composing = true; }); input.addEventListener("compositionend", () => { composing = false; syncInput(); });
	input.addEventListener("keydown", (event) => {
		// 补全候选面板打开时，导航、确认和关闭键全部让给 Autocomplete-Plus
		if (input.hasAttribute("data-autocomplete-plus-open")) return;
		if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
		else if (event.key === "Enter" && !composing && !event.isComposing) { event.preventDefault(); submit(); }
	});
	return { root, input, toggle, setOpen, addTag, sync: () => { if (document.activeElement !== input) input.value = stateFor(node).query; toggle.setSearchValue(input.value); } };
}

function openInterrogateResultDialog(detail, text) {
	let dialog;
	const copy = button({ label: t("aaalice.common.copy", "Copy"), iconName: "copy", variant: "primary", onClick: async () => {
		try {
			await navigator.clipboard.writeText(text);
			app.extensionManager.toast.add({ severity: "success", summary: label("interrogate.title", "Image interrogation"), detail: label("interrogate.copied", "Interrogated prompt copied to clipboard"), life: 3200 });
			dialog.close();
		} catch (error) {
			app.extensionManager.toast.add({ severity: "error", summary: label("interrogate.title", "Image interrogation"), detail: error.message, life: 5000 });
		}
	} });
	const close = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() });
	const body = el("div", { className: "aa-gallery-interrogate", children: [
		el("div", { className: "aa-gallery-interrogate__meta", children: [
			el("img", { className: "aa-gallery-interrogate__thumb", attrs: { src: proxyUrl(detail.source, detail.previewUrl), alt: "" } }),
			el("span", { attrs: { "data-source": detail.source }, text: detail.source }),
			el("strong", null, `#${detail.postId}`),
		] }),
		el("p", { className: "aa-gallery-interrogate__text", text }),
	] });
	dialog = createDialog({ title: label("interrogate.title", "Image interrogation"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: [close, copy] }), className: "aa-gallery-interrogate-dialog", confirmOnEnter: false });
}

function openClearSelectionDialog(node, controller) {
	if (!stateFor(node).selections.length) return;
	let dialog;
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() });
	const clear = button({ label: label("selected.clearAction", "Clear selection"), iconName: "delete", variant: "danger", onClick: () => {
		transact(node, (state) => { state.selections = []; });
		controller.renderSelected();
		controller.refreshCards();
		dialog.close();
	} });
	dialog = createDialog({
		title: label("selected.clearTitle", "Clear selected posts"),
		body: el("div", { className: "aa-gallery-clear-confirm", children: [icon("delete"), el("p", null, label("selected.clearConfirm", "Clear all selected posts?"))] }),
		footer: el("div", { className: "aa-gallery-dialog-actions", children: [cancel, clear] }),
		size: "compact",
		className: "aa-gallery-clear-confirm-dialog",
		confirmOnEnter: false,
	});
}

function installGalleryCardMotion(card) {
	const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
	let frame = 0; let pointer = null;
	const reset = () => {
		pointer = null;
		card.style.setProperty("--aa-gallery-tilt-x", "0deg");
		card.style.setProperty("--aa-gallery-tilt-y", "0deg");
		card.style.setProperty("--aa-gallery-glare-x", "50%");
		card.style.setProperty("--aa-gallery-glare-y", "50%");
		card.style.setProperty("--aa-gallery-glare-position", "50%");
	};
	const draw = () => {
		frame = 0;
		if (!pointer || !card.isConnected || reducedMotion?.matches) return;
		const rect = card.getBoundingClientRect();
		if (!(rect.width > 0) || !(rect.height > 0)) return;
		const x = Math.max(-1, Math.min(1, ((pointer.x - rect.left) / rect.width - 0.5) * 2));
		const y = Math.max(-1, Math.min(1, ((pointer.y - rect.top) / rect.height - 0.5) * 2));
		card.style.setProperty("--aa-gallery-tilt-x", `${(-y * 3.2).toFixed(2)}deg`);
		card.style.setProperty("--aa-gallery-tilt-y", `${(x * 4).toFixed(2)}deg`);
		card.style.setProperty("--aa-gallery-glare-x", `${((x + 1) * 50).toFixed(1)}%`);
		card.style.setProperty("--aa-gallery-glare-y", `${((y + 1) * 50).toFixed(1)}%`);
		card.style.setProperty("--aa-gallery-glare-position", `${((x + 1) * 50).toFixed(1)}%`);
	};
	const onPointerMove = (event) => {
		if (event.pointerType === "touch" || reducedMotion?.matches) return;
		pointer = { x: event.clientX, y: event.clientY };
		if (!frame) frame = requestAnimationFrame(draw);
	};
	const onPointerLeave = () => { if (frame) cancelAnimationFrame(frame); frame = 0; reset(); };
	card.addEventListener("pointermove", onPointerMove, { passive: true });
	card.addEventListener("pointerleave", onPointerLeave, { passive: true });
	reset();
	return () => {
		if (frame) cancelAnimationFrame(frame);
		card.removeEventListener("pointermove", onPointerMove);
		card.removeEventListener("pointerleave", onPointerLeave);
	};
}

function galleryCardActionLayout(width, height, count) {
	const buttonSize = 28; const gap = 4; const inset = 14;
	const availableWidth = Math.max(0, Number(width) - inset); const availableHeight = Math.max(0, Number(height) - inset);
	const linearSize = Math.max(1, count) * buttonSize + Math.max(0, count - 1) * gap;
	if (availableHeight >= linearSize && availableWidth >= buttonSize) return "vertical";
	if (availableWidth >= linearSize && availableHeight >= buttonSize) return "horizontal";
	return "hybrid";
}

function createGalleryCard(node, controller, post, index) {
	const card = el("article", { className: "aa-gallery-card", attrs: { tabindex: 0, "aria-label": `${post.source} #${post.postId}` } });
	const surface = el("div", "aa-gallery-card__surface");
	const image = document.createElement("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async"; image.fetchPriority = "low";
	image.width = Math.max(1, Number(post.width) || 1); image.height = Math.max(1, Number(post.height) || 1);
	image.addEventListener("load", () => { if (image.naturalWidth > 0 && image.naturalHeight > 0) controller.updateSize(post, image.naturalWidth, image.naturalHeight); });
	image.addEventListener("error", () => { void controller.recoverPreview(post, image); });
	image.src = proxyUrl(post.source, post.previewUrl);
	const selectionStamp = createSelectionStamp(settings?.selectionStamp);
	const selectedLayer = el("div", "aa-gallery-card__selected-layer");
	const hasRating = Boolean(post.rating) && Boolean(capability(post.source)?.ratings?.length);
	const rating = hasRating ? el("span", { className: "aa-gallery-card__rating", attrs: { "data-rating": ratingTone(post.rating) }, text: ratingLabel(post.rating) }) : null;
	const actions = el("div", { className: "aa-gallery-card__actions", attrs: { role: "group", "aria-label": label("card.actions", "Image actions") } });
	let selectionPending = false;
	const runSelection = async (event = null) => {
		if (selectionPending) return;
		controller.tooltip.hide();
		if (event?.type === "click") card.blur();
		selectionPending = true; card.classList.add("is-selection-pending");
		try { await controller.toggleSelection(post); }
		catch (error) { controller.showError(error); }
		finally { selectionPending = false; card.classList.remove("is-selection-pending"); }
	};
	const actionButton = (iconName, action, actionLabel, actionIndex, onClick) => {
		const control = iconButton({ iconName, label: actionLabel, variant: "ghost", className: `aa-gallery-card-action is-${action}`, onClick: (event) => { event?.stopPropagation?.(); onClick(event); if (event?.detail) control.blur(); } });
		control.style.setProperty("--aa-gallery-action-delay", `${actionIndex * 34}ms`);
		return control;
	};
	const editAction = actionButton("edit", "edit", label("card.edit", "Edit image tags"), 0, () => controller.openEditor(post).catch(controller.showError));
	let actionIndex = 1;
	const favoriteCapability = capability(post.source);
	const favoriteAction = (favoriteCapability?.favoriteRead || favoriteCapability?.favoriteWrite) ? actionButton("favorite", "favorite", post.favorite ? label("card.unfavorite", "Remove favorite") : label("card.favorite", "Favorite"), actionIndex++, async () => {
		if (!canWriteFavorite(post.source)) return;
		try { await controller.toggleFavorite(post); card._aaGalleryUpdate?.(); favoriteAction.classList.add("is-acknowledged"); }
		catch (error) { controller.showError(error); }
	}) : null;
	const copyPromptAction = actionButton("copy", "copyPrompt", label("card.copyPrompt", "Copy prompt"), actionIndex++, async () => {
		try { if (await controller.copyPostPrompt(post)) copyPromptAction.classList.add("is-acknowledged"); }
		catch (error) { controller.showError(error); }
	});
	const interrogateAction = promptAssistantAvailable ? actionButton("scan", "interrogate", label("card.interrogate", "Interrogate prompt"), actionIndex++, async () => {
		try { await controller.interrogatePost(post, card, interrogateAction); interrogateAction.classList.add("is-acknowledged"); }
		catch (error) { controller.showError(error); }
	}) : null;
	const detailAction = actionButton("note", "detail", label("card.detail", "View details"), actionIndex++, () => controller.openDetail(post).catch(controller.showError));
	const actionControls = [editAction, ...(favoriteAction ? [favoriteAction] : []), copyPromptAction, ...(interrogateAction ? [interrogateAction] : []), detailAction];
	actions.append(...actionControls);
	card._aaVirtualMasonryLayout = (width, height) => { card.dataset.actionsLayout = galleryCardActionLayout(width, height, actionControls.length); };
	surface.append(image, selectedLayer, el("div", { className: "aa-gallery-card__shade" }), el("div", { className: "aa-gallery-card__scan", attrs: { "aria-hidden": "true" } }), ...(rating ? [rating] : []), selectionStamp.root, actions);
	card.append(surface);
	const update = () => {
		const selected = stateFor(node).selections.some((item) => selectionKey(item) === `${post.source}:${post.postId}`);
		const previousSelected = card.dataset.selected;
		card.classList.toggle("is-selected", selected);
		selectionStamp.setStyle(settings?.selectionStamp);
		card.dataset.selected = String(selected);
		if (previousSelected != null && previousSelected !== String(selected)) card.classList.add("is-selection-feedback");
		if (favoriteAction) { favoriteAction.classList.toggle("is-active", Boolean(post.favorite)); favoriteAction.setAttribute("aria-label", post.favorite ? label("card.unfavorite", "Remove favorite") : label("card.favorite", "Favorite")); favoriteAction.title = favoriteAction.getAttribute("aria-label"); }
		card.setAttribute("aria-label", `${post.source} #${post.postId} · ${selected ? label("card.cancel", "Cancel selection") : label("card.select", "Select image")}`);
	};
	card._aaGalleryUpdate = update; update();
	card.addEventListener("animationend", (event) => {
		if (event.animationName === "aa-gallery-selection-feedback") card.classList.remove("is-selection-feedback");
		if (event.animationName === "aa-gallery-favorite-feedback") event.target.classList?.remove("is-acknowledged");
	});
	card.addEventListener("click", (event) => runSelection(event));
	card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runSelection(); } });
	let hoverTimer = 0;
	card.addEventListener("mouseenter", () => { if (!settings?.tooltip) return; hoverTimer = setTimeout(() => controller.showHover(card, post), 280); });
	card.addEventListener("mouseleave", () => { clearTimeout(hoverTimer); controller.tooltip.hide(); });
	const disposeMotion = installGalleryCardMotion(card);
	card._aaVirtualMasonryDispose = () => { clearTimeout(hoverTimer); disposeMotion(); };
	return card;
}

function moveSelectionIndex(from, insertBefore) {
	const source = Math.floor(Number(from));
	const target = Math.floor(Number(insertBefore));
	if (!Number.isInteger(source) || !Number.isInteger(target) || source < 0 || target < 0) return null;
	if (target === source || target === source + 1) return null;
	return target > source ? target - 1 : target;
}

function selectedDropEdge(row, clientY) {
	const rect = row.getBoundingClientRect();
	const before = clientY < rect.top + (rect.height / 2);
	const index = Math.floor(Number(row.dataset.index));
	if (!Number.isInteger(index) || index < 0) return null;
	return { row, before, index, insertBefore: before ? index : index + 1 };
}

function resolveSelectedDropTarget(listRoot, clientY) {
	const rows = [...listRoot.querySelectorAll(".aa-gallery-selected-row")];
	if (!rows.length) return null;
	for (const row of rows) {
		const rect = row.getBoundingClientRect();
		if (clientY < rect.top + (rect.height / 2)) return selectedDropEdge(row, rect.top);
		if (clientY <= rect.bottom) return selectedDropEdge(row, rect.bottom);
	}
	const last = rows.at(-1);
	return selectedDropEdge(last, last.getBoundingClientRect().bottom);
}

function selectedPromptTokens(selection, promptConfig) {
	const groups = selection.editedTags || selection.originalTags || {};
	const categories = new Set(promptConfig?.categories || []);
	const excluded = new Set(promptConfig?.excludedTags || []);
	const seen = new Set();
	const tokens = [];
	for (const category of GALLERY_CATEGORIES) {
		if (!categories.has(category)) continue;
		for (const tag of groups[category] || []) {
			if (seen.has(tag) || excluded.has(tag)) continue;
			seen.add(tag);
			let text = promptConfig?.replaceUnderscores ? tag.replaceAll("_", " ") : tag;
			if (promptConfig?.escapeParentheses) text = text.replaceAll("(", "\\(").replaceAll(")", "\\)");
			tokens.push({ category, raw: tag, text });
		}
	}
	return tokens;
}

function createGalleryTagPills(options = {}) {
	return createTagPillList({
		...options,
		labels: {
			menu: label("detail.tagMenu", "Tag actions"),
			menuHint: label("detail.tagActionsHint", "Click or right-click for tag actions"),
			editableMenuHint: label("detail.editableTagMenu", "Click to edit · Right-click for tag actions · {tag}"),
			editValue: label("selected.editTagValue", "Edit tag value"),
			edit: label("selected.edit", "Edit tag"),
			addToSearch: label("detail.addToSearch", "Add to search"),
			remove: label("selected.removeTag", "Remove {tag}"),
			...(options.labels || {}),
		},
	});
}
function selectedRowTagPreview(tokens) {
	return el("div", { className: "aa-gallery-selected-row__tags", attrs: { "aria-hidden": "true" }, children: [
		...tokens.map((token) => el("span", { attrs: { "data-category": token.category }, text: token.text })),
	] });
}

function selectedRowCopyContent(selection, promptConfig) {
	const promptText = finalPrompt(selection, promptConfig);
	const promptTokens = selectedPromptTokens(selection, promptConfig);
	const count = tagCount(selection.editedTags || selection.originalTags);
	return [
		el("div", { className: "aa-gallery-selected-row__title", children: [
			el("strong", null, `${selection.source} #${selection.postId}`),
			el("span", "aa-gallery-selected-row__format", selection.fileExt?.toUpperCase() || "IMAGE"),
		] }),
		el("small", { className: "aa-gallery-selected-row__meta", text: [
			dimensions(selection),
			selection.rating ? ratingLabel(selection.rating) : "",
			label("selected.tagCount", `${count} tags`).replace("{count}", String(count)),
		].filter(Boolean).join(" · ") }),
		promptTokens.length
			? selectedRowTagPreview(promptTokens)
			: el("p", { className: "aa-gallery-selected-row__prompt", text: promptText || label("selected.noPrompt", "No prompt tags in the current category selection") }),
	];
}

function createSelectedRow(node, controller, selection, index) {
	const promptConfig = effectivePrompt(node);
	const thumb = el("img", {
		className: "aa-gallery-selected-row__thumb",
		attrs: {
			src: proxyUrl(selection.source, selection.previewUrl),
			alt: "",
			loading: "lazy",
			decoding: "async",
		},
	});
	const copy = el("button", {
		className: "aa-gallery-selected-row__copy",
		attrs: {
			type: "button",
			"aria-label": label("card.detail", "View details"),
			title: label("card.detail", "View details"),
		},
		children: selectedRowCopyContent(selection, promptConfig),
	});
	const remove = iconButton({
		className: "aa-gallery-selected-row__remove",
		iconName: "delete",
		label: label("selected.remove", "Remove"),
		variant: "ghost",
		onClick: (event) => {
			event.stopPropagation();
			transact(node, (state) => state.selections.splice(index, 1));
			controller.renderSelected();
			controller.refreshCards();
		},
	});
	const actions = el("div", {
		className: "aa-gallery-selected-row__actions",
		attrs: { "aria-label": label("selected.remove", "Remove") },
		children: [remove],
	});
	const root = el("div", {
		className: "aa-gallery-selected-row",
		attrs: {
			"data-source": selection.source,
			"data-index": String(index),
			"data-rank": index < 3 ? String(index + 1) : "other",
			draggable: true,
			title: label("selected.reorder", "Drag to reorder"),
		},
		children: [
			thumb,
			copy,
			el("span", "aa-gallery-selected-row__order", String(index + 1)),
			actions,
		],
	});
	if (controller.selectedDragFrom === index) root.classList.add("is-dragging");
	let imageHoverTimer = 0;
	const clearImageHover = () => { clearTimeout(imageHoverTimer); imageHoverTimer = 0; };
	const hideHover = () => {
		clearImageHover();
		controller.tooltip.hide();
	};
	const openSelectedDetail = () => {
		hideHover();
		controller.openDetail(selection).catch(controller.showError);
	};
	thumb.addEventListener("mouseenter", () => {
		if (!settings?.tooltip) return;
		clearImageHover();
		imageHoverTimer = setTimeout(() => controller.showHover(thumb, selection), 280);
	});
	thumb.addEventListener("mouseleave", () => {
		clearImageHover();
		if (controller.tooltip.isOpenFor(thumb)) controller.tooltip.hide();
	});
	copy.addEventListener("click", (event) => {
		event.preventDefault();
		openSelectedDetail();
	});
	root.addEventListener("dragstart", (event) => {
		hideHover();
		event.dataTransfer.setData("text/x-aa-gallery-index", String(index));
		event.dataTransfer.effectAllowed = "move";
		try { event.dataTransfer.setData("text/plain", String(index)); } catch { /* some hosts only expose plain text */ }
		controller.beginSelectedDrag(index, root);
	});
	root.addEventListener("dragend", () => controller.endSelectedDrag());
	return root;
}

function buildController(node, elements) {
	let posts = []; let pageSegments = []; let nextCursor = null; let ended = false; let loading = false; let requestController = null; let generation = 0; let detailDialogGeneration = 0; let destroyed = false; let activeDetailDialog = null; const sessionEdits = new Map();
	const detailCache = new Map(); const previewCache = new Map(); let previewGeneration = 0; let previewPrefetchActive = 0; const previewPrefetchQueue = []; const previewPrefetchPending = new Set(); const prefetchedPreviewSources = new Map();
	const touchCache = (cache, key, value) => { cache.delete(key); cache.set(key, value); return value; };
	const trimCache = (cache, maximum) => { while (cache.size > maximum) cache.delete(cache.keys().next().value); };
	const trimPreviewCache = () => { while (previewCache.size > 16) { const key = previewCache.keys().next().value; const entry = previewCache.get(key); if (!entry.ready) entry.loader.src = ""; previewCache.delete(key); } };
	const rotatePreviewCache = () => {
		previewGeneration += 1;
		previewPrefetchQueue.length = 0; previewPrefetchPending.clear(); prefetchedPreviewSources.clear();
		for (const entry of previewCache.values()) if (!entry.ready) entry.loader.src = "";
		previewCache.clear();
	};
	const cacheImage = (src) => {
		if (!src) return null;
		const cached = previewCache.get(src); if (cached) return touchCache(previewCache, src, cached);
		const cacheGeneration = previewGeneration; const loader = new Image(); loader.decoding = "async";
		const entry = { loader, ready: false, promise: null };
		entry.promise = new Promise((resolve, reject) => {
			loader.addEventListener("load", () => resolve(src), { once: true });
			loader.addEventListener("error", () => reject(new Error(`Gallery preview failed: ${src}`)), { once: true });
			loader.src = src;
		}).then((value) => { if (cacheGeneration === previewGeneration && previewCache.get(src) === entry) entry.ready = true; return value; })
			.catch((error) => { if (previewCache.get(src) === entry) previewCache.delete(src); throw error; });
		previewCache.set(src, entry); trimPreviewCache(); return entry;
	};
	let selectedDragFrom = null;
	let selectedDropInsertBefore = null;
	const tooltip = createTooltip({ delay: 0, closeDelay: 120 });
	let errorTimer = 0;
	const showError = (error) => {
		elements.errorLabel.textContent = error?.message || String(error); elements.error.hidden = false; console.error("[Aaalice] Booru Gallery", error);
		clearTimeout(errorTimer);
		errorTimer = setTimeout(() => { elements.error.hidden = true; }, 6000);
	};
	const clearError = () => { clearTimeout(errorTimer); errorTimer = 0; elements.error.hidden = true; elements.errorLabel.textContent = ""; };
	const setLoading = (value) => { loading = value; elements.loading.hidden = !value; };
	const addTagToSearch = (tag) => {
		const source = stateFor(node).source;
		const cap = capability(source);
		if (!cap?.tagSearch) return false;
		const maxTags = source === "danbooru" && hasSourceCredentials(source) ? null : cap.maxSearchTags;
		return elements.searchControl.addTag(tag, maxTags);
	};
	const refreshCards = () => elements.masonry.querySelectorAll(".aa-gallery-card").forEach((card) => card._aaGalleryUpdate?.());
	const hideSelectedDropIndicator = () => {
		selectedDropInsertBefore = null;
		const indicator = elements.selectedDropIndicator;
		if (!indicator) return;
		indicator.hidden = true;
		indicator.classList.remove("is-visible");
		indicator.style.removeProperty("left");
		indicator.style.removeProperty("width");
		indicator.style.removeProperty("top");
	};
	const clearSelectedDragClasses = () => {
		elements.selectedListRoot?.querySelectorAll(".aa-gallery-selected-row.is-dragging, .aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
			.forEach((row) => row.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
	};
	const endSelectedDrag = () => {
		selectedDragFrom = null;
		hideSelectedDropIndicator();
		clearSelectedDragClasses();
		elements.selectedListRoot?.classList.remove("is-reordering");
	};
	const beginSelectedDrag = (index, row) => {
		selectedDragFrom = index;
		selectedDropInsertBefore = null;
		elements.selectedListRoot?.classList.add("is-reordering");
		clearSelectedDragClasses();
		row?.classList.add("is-dragging");
		hideSelectedDropIndicator();
	};
	const showSelectedDropIndicator = (target) => {
		const indicator = elements.selectedDropIndicator;
		if (!indicator || !target?.row) {
			hideSelectedDropIndicator();
			return;
		}
		const rect = target.row.getBoundingClientRect();
		const y = target.before ? rect.top : rect.bottom;
		indicator.hidden = false;
		indicator.classList.add("is-visible");
		indicator.style.left = `${Math.round(rect.left + 10)}px`;
		indicator.style.width = `${Math.max(48, Math.round(rect.width - 20))}px`;
		indicator.style.top = `${Math.round(y - 1.5)}px`;
		elements.selectedListRoot?.querySelectorAll(".aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
			.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
		target.row.classList.toggle("is-drop-before", target.before);
		target.row.classList.toggle("is-drop-after", !target.before);
	};
	const handleSelectedDragOver = (event) => {
		if (selectedDragFrom == null || !elements.selectedListRoot) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		const target = resolveSelectedDropTarget(elements.selectedListRoot, event.clientY);
		if (!target) {
			hideSelectedDropIndicator();
			return;
		}
		const dest = moveSelectionIndex(selectedDragFrom, target.insertBefore);
		selectedDropInsertBefore = dest == null ? null : target.insertBefore;
		if (dest == null) {
			hideSelectedDropIndicator();
			elements.selectedListRoot.querySelectorAll(".aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
				.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
			return;
		}
		showSelectedDropIndicator(target);
	};
	const handleSelectedDrop = (event) => {
		if (selectedDragFrom == null || !elements.selectedListRoot) return;
		event.preventDefault();
		const rawFrom = event.dataTransfer.getData("text/x-aa-gallery-index") || event.dataTransfer.getData("text/plain");
		const from = Number.isInteger(selectedDragFrom) ? selectedDragFrom : Number(rawFrom);
		const target = resolveSelectedDropTarget(elements.selectedListRoot, event.clientY);
		const insertBefore = target?.insertBefore ?? selectedDropInsertBefore;
		const dest = moveSelectionIndex(from, insertBefore);
		endSelectedDrag();
		if (dest == null) return;
		transact(node, (state) => {
			if (from < 0 || from >= state.selections.length || dest < 0 || dest >= state.selections.length) return;
			const [item] = state.selections.splice(from, 1);
			state.selections.splice(dest, 0, item);
		});
		renderSelected();
		refreshCards();
	};
	const handleSelectedDragLeave = (event) => {
		if (!elements.selectedListRoot || selectedDragFrom == null) return;
		if (elements.selectedListRoot.contains(event.relatedTarget)) return;
		hideSelectedDropIndicator();
		elements.selectedListRoot.querySelectorAll(".aa-gallery-selected-row.is-drop-before, .aa-gallery-selected-row.is-drop-after")
			.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
	};
	const renderSelected = () => {
		tooltip.hide();
		if (selectedDragFrom == null) endSelectedDrag();
		const count = stateFor(node).selections.length;
		elements.selectedList.setItems(stateFor(node).selections, { preserveScroll: true });
		elements.tabs.setValue(elements.mode);
		if (elements.selectedCount) {
			elements.selectedCount.textContent = String(count);
			elements.selectedCount.setAttribute("aria-label", label("selected.outputHint", "{count} outputs").replace("{count}", String(count)));
		}
		if (elements.selectedClear) elements.selectedClear.disabled = count === 0;
		elements.emptySelected.hidden = count > 0;
	};
	const setMode = (mode, { persist = true } = {}) => {
		mode = mode === "selected" ? "selected" : "browse";
		if (elements.mode === mode) return;
		tooltip.hide();
		endSelectedDrag();
		elements.mode = mode;
		elements.root.dataset.mode = mode;
		if (persist) transact(node, (state) => { state.view = mode; });
		renderSelected();
	};
	const rememberPage = (page) => {
		const value = Math.max(1, Math.floor(Number(page) || 1));
		const state = stateFor(node); if (state.navigation.page === value) return;
		state.navigation.page = value; elements.pageControl?.setPage(value); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, false);
	};
	const search = async ({ reset = false, page = null } = {}) => {
		if ((!reset && loading) || (ended && !reset)) return;
		const requestedPage = reset ? Math.max(1, Math.floor(Number(page ?? stateFor(node).navigation.page) || 1)) : null;
		// Mark the request active before clearing the masonry. setItems() draws synchronously
		// and may report near-end; that callback must not start a competing first-page request.
		setLoading(true);
		if (reset) { requestController?.abort(); requestController = new AbortController(); generation += 1; rotatePreviewCache(); posts = []; pageSegments = []; nextCursor = null; ended = false; elements.masonryController.setItems([], { preserveScroll: false }); clearError(); rememberPage(requestedPage); }
		else requestController ||= new AbortController();
		const currentGeneration = generation; const state = stateFor(node);
		if (capability(state.source)?.authRequired && !hasSourceCredentials(state.source)) {
			showError(new Error(label("error.credentialsRequired", "This source requires account credentials. Click here to open Gallery settings.")));
			setLoading(false);
			return;
		}
		try {
			const favorites = state.filters.feed === "favorites";
			const params = new URLSearchParams({ source: state.source, limit: "60" });
			if (!favorites) { params.set("query", searchQuery(state)); params.set("sort", state.filters.sort); for (const rating of state.filters.ratings) params.append("rating", rating); }
			if (requestedPage != null) params.set("page", String(requestedPage)); else if (nextCursor) params.set("cursor", nextCursor);
			const endpoint = favorites ? "favorites" : state.filters.feed === "ranking" ? "ranking" : "search";
			if (state.filters.feed === "ranking") { params.delete("query"); params.delete("sort"); params.set("period", state.filters.period); }
			const resultPage = await jsonRequest(`${API}/${endpoint}?${params}`, { signal: requestController.signal });
			if (currentGeneration !== generation || requestController.signal.aborted) return;
			const knownPostKeys = new Set(posts.map((post) => `${post.source}:${post.postId}`));
			const additions = (resultPage.posts || []).filter((post) => {
				if (!post.previewUrl?.startsWith("https://")) return false;
				const key = `${post.source}:${post.postId}`; if (knownPostKeys.has(key)) return false; knownPostKeys.add(key); return true;
			});
			const start = posts.length; posts.push(...additions); pageSegments.push({ page: Math.max(1, Number(resultPage.page) || requestedPage || pageSegments.at(-1)?.page + 1 || 1), start, end: posts.length }); elements.masonryController.append(additions);
			nextCursor = resultPage.nextCursor || null; ended = Boolean(resultPage.ended || !nextCursor); elements.end.hidden = !ended; clearError();
		} catch (error) { if (error.name !== "AbortError") showError(error); }
		finally { if (currentGeneration === generation) setLoading(false); }
	};
	const visibleIndexChanged = (index) => {
		const segment = pageSegments.find((item) => index >= item.start && index < item.end);
		if (segment) rememberPage(segment.page);
	};
	const getDetail = (post) => {
		const key = `${post.source}:${post.postId}`; const cached = detailCache.get(key); if (cached) return touchCache(detailCache, key, cached);
		const request = jsonRequest(`${API}/detail?${new URLSearchParams({ source: post.source, postId: post.postId })}`).then((response) => {
			if (!response.mediaUrl || !STATIC_EXTENSIONS.has(String(response.fileExt).toLowerCase())) throw new Error(label("error.staticOnly", "Only static JPG, PNG, WebP, and GIF posts can be selected."));
			return response;
		}).catch((error) => { if (detailCache.get(key) === request) detailCache.delete(key); throw error; });
		detailCache.set(key, request); trimCache(detailCache, 128); return request;
	};
	const drainPreviewPrefetch = () => {
		while (!destroyed && previewPrefetchActive < 4 && previewPrefetchQueue.length) {
			const task = previewPrefetchQueue.shift();
			if (task.generation !== previewGeneration) { previewPrefetchPending.delete(task.key); continue; }
			previewPrefetchActive += 1;
			void getDetail(task.post).then((detail) => {
				if (destroyed || task.generation !== previewGeneration) return;
				const sampleUrl = detail.sampleUrl || detail.previewUrl;
				if (!sampleUrl) return;
				const sampleSrc = proxyUrl(detail.source, sampleUrl); prefetchedPreviewSources.set(task.key, sampleSrc);
				return cacheImage(sampleSrc)?.promise;
			}).catch(() => {
				if (task.generation === previewGeneration) prefetchedPreviewSources.delete(task.key);
			}).finally(() => {
				previewPrefetchActive -= 1; previewPrefetchPending.delete(task.key); drainPreviewPrefetch();
			});
		}
	};
	const prefetchVisible = (visiblePosts) => {
		for (const post of visiblePosts.slice(0, 12)) {
			const key = `${post.source}:${post.postId}`; const prefetchedSrc = prefetchedPreviewSources.get(key);
			if (previewPrefetchPending.has(key) || (prefetchedSrc && previewCache.has(prefetchedSrc))) continue;
			previewPrefetchPending.add(key); previewPrefetchQueue.push({ key, post, generation: previewGeneration });
		}
		drainPreviewPrefetch();
	};
	const recoverPreview = async (post, image) => {
		if (post.source !== "aitag" || image.dataset.previewRecovery) return;
		image.dataset.previewRecovery = "pending";
		try {
			const detail = await getDetail(post);
			if (!detail.previewUrl || detail.previewUrl === post.previewUrl) return;
			post.previewUrl = detail.previewUrl;
			post.width = detail.width;
			post.height = detail.height;
			image.dataset.previewRecovery = "done";
			image.src = proxyUrl(detail.source, detail.previewUrl);
		} catch (error) {
			image.dataset.previewRecovery = "failed";
			console.error(`[Aaalice] AI TAG preview recovery failed for ${post.postId}:`, error);
		}
	};
	const toggleSelection = async (post) => {
		const key = `${post.source}:${post.postId}`; const index = stateFor(node).selections.findIndex((item) => selectionKey(item) === key);
		if (index >= 0) transact(node, (state) => state.selections.splice(index, 1));
		else { const detail = await getDetail(post); const selection = selectionFromDetail(detail, sessionEdits.get(key)); if (!selection) throw new Error(label("error.incomplete", "The post detail is incomplete.")); transact(node, (state) => state.selections.push(selection)); }
		renderSelected(); refreshCards();
	};
	const toggleFavorite = async (post) => {
		const previous = Boolean(post.favorite); const response = await jsonRequest(`${API}/favorite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: post.source, postId: post.postId, favorite: !previous }) });
		post.favorite = Boolean(response.favorite); return post.favorite;
	};
	const copyPostPrompt = async (post) => {
		const key = `${post.source}:${post.postId}`;
		const detail = await getDetail(post);
		const selection = selectionFromDetail(detail, sessionEdits.get(key));
		if (!selection) throw new Error(label("error.incomplete", "The post detail is incomplete."));
		const text = finalPrompt(selection, effectivePrompt(node)).trim();
		if (!text) {
			app.extensionManager.toast.add({ severity: "warning", summary: label("card.copyPrompt", "Copy prompt"), detail: label("selected.noPrompt", "No prompt tags in the current category selection"), life: 4000 });
			return false;
		}
		await navigator.clipboard.writeText(text);
		app.extensionManager.toast.add({ severity: "success", summary: label("card.copyPrompt", "Copy prompt"), detail: label("card.promptCopied", "Prompt copied to clipboard"), life: 3200 });
		return true;
	};
	const interrogatePost = async (post, card, control) => {
		card.classList.add("is-interrogating");
		if (control) control.disabled = true;
		try {
			const detail = await getDetail(post);
			const mediaSrc = detail.mediaUrl || detail.sampleUrl || detail.previewUrl;
			if (!mediaSrc) throw new Error(label("error.incomplete", "The post detail is incomplete."));
			const imageData = await blobToDataUrl(await fetchMediaBlob(proxyUrl(detail.source, mediaSrc)));
			const result = await jsonRequest(`${PROMPT_ASSISTANT_API}/vlm/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: imageData, request_id: crypto.randomUUID() }) });
			if (!result?.success) throw new Error(result?.error || label("interrogate.failed", "Interrogation failed."));
			if (destroyed) return;
			openInterrogateResultDialog(detail, String(result.data?.description || ""));
		} finally {
			card.classList.remove("is-interrogating");
			if (control) control.disabled = false;
		}
	};
	const showHover = (anchor, post) => {
		const previewSrc = proxyUrl(post.source, post.previewUrl);
		let usingPreview = true;
		const image = el("img", { attrs: { src: previewSrc, alt: "", decoding: "async" } });
		const previewHeight = (item) => {
			const ratio = Number(item.width) > 0 && Number(item.height) > 0 ? Number(item.width) / Number(item.height) : 1;
			return Math.max(150, Math.min(420, 320 / ratio));
		};
		const resolution = el("dd", null, dimensions(post));
		const format = el("dd", null, "—");
		const size = el("dd", null, "—");
		const tags = el("dd", null, "—");
		const hasRating = Boolean(post.rating) && Boolean(capability(post.source)?.ratings?.length);
		const rating = hasRating ? el("span", { className: "aa-gallery-hover__rating", attrs: { "data-rating": ratingTone(post.rating) }, text: ratingLabel(post.rating) }) : null;
		const loading = el("span", { className: "aa-gallery-hover__loading", attrs: { role: "status", "aria-label": label("hover.loading", "Loading larger preview…") }, children: [icon("loading")] });
		const facts = [
			[label("detail.resolution", "Resolution"), resolution], [label("detail.format", "Format"), format],
			[label("detail.fileSize", "File size"), size], [label("detail.tags", "Tags"), tags],
		];
		const tagRows = Object.fromEntries(["artist", "character", "copyright"].map((category) => {
			const row = el("div", { className: `aa-gallery-hover__tag-row is-${category}`, attrs: { hidden: true }, children: [
				el("span", null, label(`category.${category}`, category)), el("p"),
			] });
			return [category, row];
		}));
		const info = el("div", { className: "aa-gallery-hover__info", children: [
				el("dl", { children: facts.map(([term, value]) => el("div", { children: [el("dt", null, term), value] })) }),
				el("div", { className: "aa-gallery-hover__tags", children: Object.values(tagRows) }),
			] });
		const content = el("div", { className: "aa-gallery-hover", children: [
			el("div", { className: "aa-gallery-hover__media", children: [image, loading, ...(rating ? [rating] : []), info] }),
		] });
		content.style.setProperty("--aa-gallery-hover-image-height", `${previewHeight(post)}px`);
		let waitingForLargerPreview = true;
		image.addEventListener("load", () => { if (!usingPreview) waitingForLargerPreview = false; loading.hidden = !waitingForLargerPreview; tooltip.reposition(); });
		image.addEventListener("error", () => { waitingForLargerPreview = false; loading.hidden = true; if (!usingPreview) { usingPreview = true; image.src = previewSrc; } });
		tooltip.show(anchor, content, { className: "aa-gallery-hover-tooltip", immediate: true, interactive: false, placement: "side" });
		void getDetail(post).then((detail) => {
			if (!content.isConnected || !tooltip.isOpenFor(anchor)) return;
			resolution.textContent = dimensions(detail); format.textContent = detail.fileExt?.toUpperCase() || "—";
			size.textContent = fileSizeLabel(detail.fileSize); tags.textContent = String(tagCount(detail.tags));
			if (rating) { rating.dataset.rating = ratingTone(detail.rating); rating.textContent = ratingLabel(detail.rating); }
			content.style.setProperty("--aa-gallery-hover-image-height", `${previewHeight(detail)}px`);
			for (const [category, row] of Object.entries(tagRows)) {
				const values = detail.tags?.[category] || [];
				row.hidden = !values.length;
				row.querySelector("p").textContent = values.slice(0, 2).join(" · ");
			}
			const sampleUrl = detail.sampleUrl || detail.previewUrl;
			if (sampleUrl && sampleUrl !== post.previewUrl) {
				const sampleSrc = proxyUrl(detail.source, sampleUrl); const cachedImage = cacheImage(sampleSrc);
				const showSample = () => { if (!content.isConnected || !tooltip.isOpenFor(anchor)) return; usingPreview = false; waitingForLargerPreview = false; loading.hidden = true; image.src = sampleSrc; tooltip.reposition(); };
				if (cachedImage?.ready) showSample();
				else { loading.hidden = false; void cachedImage?.promise.then(showSample).catch(() => { waitingForLargerPreview = false; loading.hidden = true; }); }
			}
			else { waitingForLargerPreview = false; loading.hidden = true; }
			tooltip.reposition();
		}).catch(() => { waitingForLargerPreview = false; loading.hidden = true; });
	};
	const openDetail = async (post) => {
		const openGeneration = ++detailDialogGeneration; activeDetailDialog?.close(); activeDetailDialog = null;
		const detail = await getDetail(post); const key = `${post.source}:${post.postId}`; const selected = stateFor(node).selections.some((item) => selectionKey(item) === key);
		if (destroyed || openGeneration !== detailDialogGeneration) return;
		const selectedSnapshot = stateFor(node).selections.find((item) => selectionKey(item) === key);
		const detailDrafts = normalizeTagGroups(selectedSnapshot?.editedTags || sessionEdits.get(key) || detail.tags);
		const detailCounts = {};
		const detailPillLists = {};
		const translationAbort = new AbortController();
		const detailTokens = (category) => detailDrafts[category].map((tag) => ({ category, raw: tag, text: tag }));
		const mutateDetailTag = (category, mutation) => {
			if (mutation.type !== "rename") return null;
			const index = detailDrafts[category].indexOf(mutation.raw);
			const value = String(mutation.value || "").trim();
			if (index < 0 || !value) return null;
			detailDrafts[category][index] = value;
			detailDrafts[category] = [...new Set(detailDrafts[category])];
			const editedTags = normalizeTagGroups(detailDrafts);
			if (selectedSnapshot) transact(node, (state) => { const current = state.selections.find((item) => selectionKey(item) === key); if (current) current.editedTags = editedTags; });
			else sessionEdits.set(key, editedTags);
			if (detailCounts[category]) detailCounts[category].textContent = String(detailDrafts[category].length);
			renderSelected();
			return detailTokens(category);
		};
		const previewUrl = detail.sampleUrl || detail.previewUrl || post.previewUrl || detail.mediaUrl;
		const viewer = createDetailImageViewer({ previewSrc: proxyUrl(detail.source, previewUrl), originalSrc: proxyUrl(detail.source, detail.mediaUrl), alt: `${detail.source} #${detail.postId}` });
		const actions = [];
		let dialog; actions.push(button({ className: `aa-gallery-detail__action is-selection${selected ? " is-selected" : ""}`, label: selected ? label("detail.remove", "Remove selection") : label("detail.select", "Select"), variant: selected ? "danger" : "primary", onClick: async () => { await toggleSelection(detail); dialog.close(); } }));
		actions.push(button({ className: "aa-gallery-detail__action is-source", label: label("detail.source", "Open source"), iconName: "link", variant: "ghost", onClick: () => window.open(detail.postUrl, "_blank", "noopener") }));
		actions.push(button({ className: "aa-gallery-detail__action is-original", label: label("detail.original", "Open original"), iconName: "download", variant: "ghost", onClick: () => window.open(proxyUrl(detail.source, detail.mediaUrl), "_blank", "noopener") }));
		actions.push(button({ className: "aa-gallery-detail__action is-copy-image", label: label("detail.copyImage", "Copy image"), iconName: "copy", variant: "ghost", onClick: async (event) => {
			const control = event.currentTarget; control.disabled = true;
			try {
				await copyImageToClipboard(proxyUrl(detail.source, detail.mediaUrl));
				app.extensionManager.toast.add({ severity: "success", summary: label("detail.copyImage", "Copy image"), detail: label("detail.imageCopied", "Image copied to clipboard"), life: 3200 });
			} catch (error) { showError(error); }
			finally { control.disabled = false; }
		} }));
		const cap = capability(detail.source);
		if (cap?.favoriteRead || cap?.favoriteWrite) actions.push(button({ className: `aa-gallery-detail__action is-favorite${detail.favorite ? " is-active" : ""}`, label: detail.favorite ? label("detail.unfavorite", "Remove favorite") : label("detail.favorite", "Favorite"), iconName: "favorite", variant: "ghost", onClick: async (event) => { if (!canWriteFavorite(detail.source)) return; const control = event.currentTarget; const previous = Boolean(detail.favorite); detail.favorite = !previous; control.disabled = true; try { await jsonRequest(`${API}/favorite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: detail.source, postId: detail.postId, favorite: detail.favorite }) }); control.classList.toggle("is-active", detail.favorite); control.querySelector(".aa-ui-button__label").textContent = detail.favorite ? label("detail.unfavorite", "Remove favorite") : label("detail.favorite", "Favorite"); } catch (error) { detail.favorite = previous; showError(error); } finally { control.disabled = false; } } }));
		const tagTotal = tagCount(detail.tags);
		const facts = [
			["resolution", label("detail.resolution", "Resolution"), dimensions(detail)],
			["format", label("detail.format", "Format"), detail.fileExt?.toUpperCase() || "—"],
			...(detail.rating && cap?.ratings?.length ? [[`rating-${ratingTone(detail.rating)}`, label("detail.rating", "Rating"), ratingLabel(detail.rating)]] : []),
			["tags", label("detail.tags", "Tags"), String(tagTotal)],
		];
		const inspector = el("aside", { className: "aa-gallery-detail__inspector", children: [
			el("header", { className: "aa-gallery-detail__header", children: [el("span", { className: "aa-gallery-detail__source", attrs: { "data-source": detail.source }, text: detail.source }), el("strong", null, `#${detail.postId}`)] }),
			el("dl", { className: "aa-gallery-detail__facts", children: facts.map(([fact, term, value]) => el("div", { attrs: { "data-fact": fact }, children: [el("dt", null, term), el("dd", null, value)] })) }),
			el("div", { className: "aa-gallery-detail__tag-groups", children: GALLERY_CATEGORIES.map((category) => {
				const heading = sectionHeading(label(`category.${category}`, category), String(detailDrafts[category].length));
				detailCounts[category] = heading.querySelector("small");
				const pills = createGalleryTagPills({
					tokens: detailTokens(category),
					ariaLabel: label(`category.${category}`, category),
					emptyText: label("detail.noTags", "No tags"),
					onMutate: (mutation) => mutateDetailTag(category, mutation),
					contextMenuItems: (token, { edit }) => [
						{ label: label("detail.editTag", "Edit tag"), iconName: "edit", onSelect: edit },
						{ label: label("detail.copyTag", "Copy tag"), iconName: "copy", onSelect: async () => {
							try { await navigator.clipboard.writeText(token.raw); pills.flashToken(token.raw); }
							catch (error) { showError(error); }
						} },
						{ label: label("detail.addToSearch", "Add to search"), iconName: "search", disabled: !cap?.tagSearch, onSelect: () => addTagToSearch(token.raw) },
						{ label: label("detail.blockTag", "Block tag"), iconName: "filter", danger: true, onSelect: async () => {
							dialog.close();
							try {
								await addGlobalBlacklistTag(token.raw);
								app.extensionManager.toast.add({ severity: "success", summary: label("settings.blacklist", "Content blacklist"), detail: label("detail.blacklistAdded", "Posts tagged {tag} are now hidden").replace("{tag}", token.raw), life: 4000 });
							} catch (error) { showError(error); }
						} },
					],
				});
				detailPillLists[category] = pills;
				return el("section", { className: "aa-gallery-detail__tag-group", attrs: { "data-category": category }, children: [heading, pills] });
			}) }),
		] });
		const body = el("div", { className: "aa-gallery-detail", children: [viewer.root, inspector] });
		dialog = createDialog({ title: label("detail.title", "Post details"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: actions }), size: "lg", className: "aa-gallery-detail-dialog", confirmOnEnter: false, onClose: () => { viewer.destroy(); translationAbort.abort(); if (activeDetailDialog === dialog) activeDetailDialog = null; } });
		activeDetailDialog = dialog;
		if (currentLocale() === "zh") {
			const translationTags = [];
			for (const category of GALLERY_CATEGORIES) for (const tag of detailDrafts[category]) translationTags.push({ name: tag, category });
			void streamTagTranslations({
				locale: "zh",
				tags: translationTags,
				signal: translationAbort.signal,
				onChunk: ({ translations }) => {
					if (destroyed || openGeneration !== detailDialogGeneration || !Object.keys(translations).length) return;
					for (const pills of Object.values(detailPillLists)) pills.setSecondary(translations);
				},
			});
		}
	};
	const openEditor = async (target) => {
		const selectedIndex = typeof target === "number" ? target : stateFor(node).selections.findIndex((item) => selectionKey(item) === `${target.source}:${target.postId}`);
		let selection = selectedIndex >= 0 ? stateFor(node).selections[selectedIndex] : null; const key = selection ? selectionKey(selection) : `${target.source}:${target.postId}`;
		if (!selection) { const detail = await getDetail(target); selection = selectionFromDetail(detail, sessionEdits.get(key)); }
		if (!selection) throw new Error(label("error.incomplete", "The post detail is incomplete.")); const groups = normalizeTagGroups(selection.editedTags || selection.originalTags);
		const drafts = normalizeTagGroups(groups);
		const counts = {};
		const pillLists = {};
		const tokensFor = (category) => drafts[category].map((tag) => ({ category, raw: tag, text: tag }));
		const updateCount = (category) => {
			const next = String(drafts[category].length);
			if (!counts[category] || counts[category].textContent === next) return;
			counts[category].textContent = next;
			counts[category].classList.remove("is-updated");
			void counts[category].offsetWidth;
			counts[category].classList.add("is-updated");
		};
		const mutateDraft = (category, mutation) => {
			const values = [...drafts[category]];
			if (mutation.type === "add") values.push(...mutation.values);
			else {
				const index = values.indexOf(mutation.raw);
				if (index < 0) return null;
				if (mutation.type === "remove") values.splice(index, 1);
				else if (mutation.type === "rename") values[index] = mutation.value;
				else return null;
			}
			drafts[category] = [...new Set(values.map((tag) => String(tag).trim()).filter(Boolean))];
			updateCount(category);
			return tokensFor(category);
		};
		const categoryViews = GALLERY_CATEGORIES.map((category) => {
			counts[category] = el("span", "aa-gallery-tag-editor__count", String(groups[category].length));
			counts[category].addEventListener("animationend", () => counts[category].classList.remove("is-updated"));
			pillLists[category] = createGalleryTagPills({
				tokens: tokensFor(category),
				editable: true,
				allowAdd: true,
				category,
				ariaLabel: label(`category.${category}`, category),
				addPlaceholder: label("editor.addPlaceholder", "+ Add tag"),
				onSearchTag: addTagToSearch,
				searchDisabled: !capability(stateFor(node).source)?.tagSearch,
				onMutate: (mutation) => mutateDraft(category, mutation),
			});
			const panel = el("section", { className: "aa-gallery-tag-editor__category", attrs: { "data-category": category, role: "tabpanel" }, children: [el("header", { children: [el("strong", null, label(`category.${category}`, category)), el("small", null, label("editor.pillHint", "Click to edit · Right-click to remove · Enter to add"))] }), pillLists[category]] });
			const tab = button({ className: "aa-gallery-tag-editor__category-tab", label: label(`category.${category}`, category), variant: "ghost", size: "sm" });
			const categoryId = `aa-gallery-editor-${category}`; tab.id = `${categoryId}-tab`; panel.id = `${categoryId}-panel`; tab.dataset.category = category; tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", panel.id); panel.setAttribute("aria-labelledby", tab.id); tab.prepend(el("span", { className: "aa-gallery-tag-editor__category-dot", attrs: { "aria-hidden": "true" } })); tab.append(counts[category]);
			return { category, panel, tab };
		});
		const categoryNav = el("div", { className: "aa-gallery-tag-editor__categories", attrs: { role: "tablist", "aria-label": label("editor.categories", "Tag categories") }, children: categoryViews.map(({ tab }) => tab) });
		const categoryPanels = el("div", { className: "aa-gallery-tag-editor__panels", children: categoryViews.map(({ panel }) => panel) });
		const setCategory = (category) => { for (const view of categoryViews) { const active = view.category === category; view.panel.hidden = !active; view.tab.classList.toggle("is-active", active); view.tab.setAttribute("aria-selected", String(active)); view.tab.tabIndex = active ? 0 : -1; } };
		for (const view of categoryViews) view.tab.addEventListener("click", () => setCategory(view.category));
		categoryNav.addEventListener("keydown", (event) => { if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const current = Math.max(0, categoryViews.findIndex(({ tab }) => tab === document.activeElement)); const next = event.key === "Home" ? 0 : event.key === "End" ? categoryViews.length - 1 : (current + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + categoryViews.length) % categoryViews.length; setCategory(categoryViews[next].category); categoryViews[next].tab.focus({ preventScroll: true }); });
		setCategory(groups.general?.length ? "general" : categoryViews.find(({ category }) => groups[category]?.length)?.category || "general");
		const editorContext = el("header", { className: "aa-gallery-tag-editor__context", children: [el("img", { attrs: { src: proxyUrl(selection.source, selection.previewUrl), alt: "" } }), el("div", { children: [el("div", { className: "aa-gallery-tag-editor__identity", children: [el("span", { attrs: { "data-source": selection.source }, text: selection.source }), el("strong", null, `#${selection.postId}`)] }), el("small", null, label("editor.hint", "Changes stay in this workflow selection."))] })] });
		const body = el("div", { className: "aa-gallery-tag-editor", children: [editorContext, el("div", { className: "aa-gallery-tag-editor__workspace", children: [categoryNav, categoryPanels] })] }); let dialog;
		const values = () => normalizeTagGroups(drafts);
		const restore = button({ label: label("editor.restore", "Restore original"), iconName: "refresh", variant: "ghost", onClick: () => { for (const category of GALLERY_CATEGORIES) { drafts[category] = [...selection.originalTags[category]]; pillLists[category].setTokens(tokensFor(category)); updateCount(category); } } });
		const copy = button({ label: label("editor.copy", "Copy prompt"), iconName: "copy", variant: "ghost", onClick: () => navigator.clipboard.writeText(finalPrompt({ ...selection, editedTags: values() }, effectivePrompt(node))) });
		const save = button({ label: label("editor.save", "Save local tags"), variant: "primary", onClick: () => { const edited = values(); if (selectedIndex >= 0) transact(node, (state) => { state.selections[selectedIndex].editedTags = edited; }); else sessionEdits.set(key, edited); renderSelected(); dialog.close(); } });
		dialog = createDialog({ title: label("editor.title", "Edit local tags"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: [restore, copy, save] }), size: "lg", className: "aa-gallery-tag-editor-dialog", confirmOnEnter: false });
	};
	return {
		tooltip,
		get selectedDragFrom() { return selectedDragFrom; },
		beginSelectedDrag,
		endSelectedDrag,
		handleSelectedDragOver,
		handleSelectedDrop,
		handleSelectedDragLeave,
		search,
		jumpToPage(page) { return search({ reset: true, page }); },
		visibleIndexChanged,
		prefetchVisible,
		toggleSelection,
		toggleFavorite,
		copyPostPrompt,
		interrogatePost,
		recoverPreview,
		showHover,
		openDetail,
		openEditor,
		renderSelected,
		refreshCards,
		setMode,
		showError,
		updateSize(post, width, height) { elements.masonryController.updateItemSize(`${post.source}:${post.postId}`, width, height); },
		destroy() {
			destroyed = true; generation += 1; detailDialogGeneration += 1;
			requestController?.abort();
			activeDetailDialog?.close(); activeDetailDialog = null;
			endSelectedDrag();
			elements.selectedDropIndicator?.remove();
			tooltip.destroy();
			elements.masonryController.destroy();
			elements.selectedList.destroy();
			detailCache.clear(); rotatePreviewCache();
		},
	};
}

function openFilter(node, anchor) {
	const state = stateFor(node); const cap = capability(state.source); const ratingOptions = cap?.ratings || [];
	anchor.classList.add("is-open"); anchor.setAttribute("aria-expanded", "true");
	const popover = createAnchoredPopover({ anchor, ariaLabel: label("filter.title", "Filters"), className: "aa-gallery-filter-popover", width: 300, onClose: () => { anchor.classList.remove("is-open"); anchor.setAttribute("aria-expanded", "false"); } });
	let selectedRatings = [...state.filters.ratings];
	const ratings = multiSelectControl({
		className: "aa-gallery-filter-ratings",
		options: ratingOptions.map((value) => ({ value, label: ratingLabel(value), iconName: ratingIcon(value), attrs: { "data-rating": ratingTone(value) } })),
		values: selectedRatings,
		ariaLabel: label("filter.rating", "Rating"),
		onChange: (values) => { selectedRatings = values; transact(node, (current) => { current.filters.ratings = values; }); },
	});
	const apply = button({ label: label("filter.apply", "Apply"), iconName: "statusCheck", variant: "primary", onClick: () => { transact(node, (current) => { current.filters.ratings = selectedRatings; current.navigation.page = 1; }); node._aaGalleryCollection?.setValue(collectionValue(stateFor(node))); node._aaGalleryPage?.setPage(1); popover.close(); node._aaGalleryController.search({ reset: true, page: 1 }); } });
	const header = el("header", { className: "aa-gallery-filter-popover__header", children: [
		el("span", { className: "aa-gallery-filter-popover__icon", children: [icon("filter")] }),
		el("strong", null, label("filter.rating", "Rating")),
		el("span", { className: "aa-gallery-filter-popover__source", text: cap?.displayName || state.source }),
	] });
	const body = el("div", { className: "aa-gallery-filter-popover__body", children: ratingOptions.length ? [ratings] : [el("div", { className: "aa-gallery-popover-note", text: label("filter.noRating", "This source does not expose Rating filters.") })] });
	const footer = el("footer", { className: "aa-gallery-filter-popover__footer", children: [apply] });
	popover.root.append(header, body, footer); popover.reposition();
}

function createPageControl(node) {
	let currentPage = Math.max(1, stateFor(node).navigation.page);
	const control = button({ className: "aa-gallery-page-control", label: "", variant: "ghost", size: "sm" });
	const sync = () => { control.querySelector(".aa-ui-button__label").textContent = label("page.current", "Page {page}").replace("{page}", String(currentPage)); control.title = label("page.open", "Jump to a page"); };
	control.setPage = (page) => { currentPage = Math.max(1, Math.floor(Number(page) || 1)); sync(); };
	control.addEventListener("click", () => {
		control.classList.add("is-open"); control.setAttribute("aria-expanded", "true");
		const popover = createAnchoredPopover({ anchor: control, ariaLabel: label("page.title", "Page navigation"), className: "aa-gallery-page-popover", width: 224, onClose: () => { control.classList.remove("is-open"); control.setAttribute("aria-expanded", "false"); } });
		const input = document.createElement("input"); input.type = "text"; input.inputMode = "numeric"; input.pattern = "[0-9]*"; input.autocomplete = "off"; input.value = String(currentPage); input.className = "aa-gallery-page-popover__input"; input.setAttribute("aria-label", label("page.input", "Page number"));
		const jump = () => { const page = Math.max(1, Math.floor(Number(input.value) || 1)); control.setPage(page); popover.close(); void node._aaGalleryController?.jumpToPage(page); };
		input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); jump(); } });
		const previous = iconButton({ className: "aa-gallery-page-popover__step is-previous", label: label("page.previous", "Previous"), iconName: "moveDown", variant: "ghost", onClick: () => { input.value = String(Math.max(1, currentPage - 1)); jump(); } }); previous.disabled = currentPage <= 1;
		const next = iconButton({ className: "aa-gallery-page-popover__step is-next", label: label("page.next", "Next"), iconName: "moveDown", variant: "ghost", onClick: () => { input.value = String(currentPage + 1); jump(); } });
		const go = iconButton({ className: "aa-gallery-page-popover__go", label: label("page.go", "Go"), iconName: "arrowRight", variant: "ghost", onClick: jump });
		const field = el("div", { className: "aa-gallery-page-popover__field", children: [input, el("span", null, label("page.unit", "p.")), go] });
		popover.root.append(el("div", { className: "aa-gallery-page-popover__rail", children: [previous, field, next] })); popover.reposition();
		queueMicrotask(() => { input.focus({ preventScroll: true }); input.select(); });
	});
	sync(); return control;
}

function openPromptOptions(node, anchor) {
	const prompt = effectivePrompt(node); anchor.classList.add("is-open"); anchor.setAttribute("aria-expanded", "true"); const popover = createAnchoredPopover({ anchor, ariaLabel: label("prompt.title", "Prompt processing"), className: "aa-gallery-prompt-popover", width: 360, onClose: () => { anchor.classList.remove("is-open"); anchor.setAttribute("aria-expanded", "false"); } });
	const categories = multiSelectControl({ className: "aa-gallery-prompt-categories", options: GALLERY_CATEGORIES.map((value) => ({ value, label: label(`category.${value}`, value), attrs: { "data-category": value } })), values: prompt.categories, ariaLabel: label("prompt.categories", "Categories"), onChange: (values) => transact(node, (state) => { state.prompt.categories = values; }) });
	const underscores = checkboxControl({ checked: prompt.replaceUnderscores, label: label("prompt.underscores", "Replace underscores with spaces"), onChange: (value) => transact(node, (state) => { state.prompt.replaceUnderscores = value; }) });
	const parentheses = checkboxControl({ checked: prompt.escapeParentheses, label: label("prompt.parentheses", "Escape parentheses"), onChange: (value) => transact(node, (state) => { state.prompt.escapeParentheses = value; }) });
	const excluded = document.createElement("textarea"); excluded.className = "aa-ui-input aa-gallery-prompt-excluded"; excluded.value = (settings?.blacklist || []).join("\n"); excluded.placeholder = label("prompt.excludePlaceholder", "e.g. watermark, text focus"); excluded.title = label("prompt.excludeHint", "Shared by every Gallery node and source");
	excluded.addEventListener("change", async () => {
		excluded.disabled = true;
		try { excluded.value = (await saveGlobalBlacklist(excluded.value)).join("\n"); excluded.setAttribute("aria-invalid", "false"); }
		catch (error) { excluded.setAttribute("aria-invalid", "true"); console.error("[Aaalice] Failed to save the global blacklist", error); }
		finally { excluded.disabled = false; }
	});
	const transformOption = (control, title) => el("label", { className: "aa-gallery-prompt-transform", children: [control, el("strong", null, title)] });
	const panels = {
		categories: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "categories" }, children: [categories] }),
		format: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "format" }, children: [el("div", { className: "aa-gallery-prompt-switches", children: [transformOption(underscores, label("prompt.underscores", "Replace underscores with spaces")), transformOption(parentheses, label("prompt.parentheses", "Escape parentheses"))] })] }),
		exclude: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "exclude" }, children: [excluded] }),
	};
	const showPanel = (value) => { for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== value; popover.reposition(); };
	const tabs = segmentedControl({ className: "aa-gallery-prompt-tabs", value: "categories", options: [
		{ value: "categories", label: label("prompt.categories", "Categories"), iconName: "tag" },
		{ value: "format", label: label("prompt.transformTitle", "Formatting"), iconName: "settings" },
		{ value: "exclude", label: label("prompt.exclude", "Excluded tags"), iconName: "filter" },
	], ariaLabel: label("prompt.sections", "Prompt setting sections"), onChange: showPanel });
	const header = el("header", { className: "aa-gallery-prompt-popover__header", children: [el("span", { className: "aa-gallery-prompt-popover__icon", children: [icon("tag")] }), el("strong", null, label("prompt.title", "Prompt processing")), el("span", { className: "aa-gallery-prompt-popover__live", children: [icon("statusCheck"), el("span", null, label("prompt.live", "Live"))] })] });
	const body = el("div", { className: "aa-gallery-prompt-popover__body", children: Object.values(panels) });
	showPanel("categories"); popover.root.append(header, tabs, body); popover.reposition();
}

function setupNode(node, { initializeSize = false } = {}) {
	if (!isGallery(node) || node._aaGalleryMounted) return; node._aaGalleryMounted = true; stateFor(node);
	const root = isolate(el("div", { className: "aa-gallery", attrs: { "data-mode": stateFor(node).view, "data-capture-wheel": "true" } }));
	// Nodes 2.0 宿主在捕获阶段先处理 wheel，滚动区必须在 pointerenter 提前拿到焦点；
	// 已在画廊内的焦点和外部文本编辑控件的焦点都不得抢夺。
	const focusScrollableOnPointerEnter = (target) => target.addEventListener("pointerenter", () => {
		const active = document.activeElement;
		if (active && root.contains(active)) return;
		if (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) return;
		target.focus({ preventScroll: true });
	});
	root.dataset.source = stateFor(node).source;
	let collection = null;
	const source = listboxControl({ className: "aa-gallery-source-select", options: capabilities.map((item) => ({ value: item.source, label: item.displayName })), value: stateFor(node).source, ariaLabel: label("source", "Source"), onChange: (value) => { transact(node, (state) => { state.source = value; state.filters.ratings = defaultGalleryRatings(value); state.filters.sort = capability(value)?.sortValues?.[0] || "latest"; state.filters.feed = "search"; state.filters.period = ""; state.navigation.page = 1; }); root.dataset.source = value; pageControl?.setPage(1); collection?.setOptions(collectionOptions(value), collectionValue(stateFor(node))); controller.search({ reset: true, page: 1 }); } });
	collection = listboxControl({ className: "aa-gallery-collection-select", options: collectionOptions(stateFor(node).source), value: collectionValue(stateFor(node)), ariaLabel: label("collection.label", "Gallery collection"), onChange: (value) => { transact(node, (state) => { if (value === "favorites") { state.filters.feed = "favorites"; state.filters.period = ""; } else if (value.startsWith("ranking:")) { state.filters.feed = "ranking"; state.filters.period = value.slice("ranking:".length); } else { state.filters.feed = "search"; state.filters.period = ""; state.filters.sort = value.slice("sort:".length); } state.navigation.page = 1; }); pageControl?.setPage(1); controller.search({ reset: true, page: 1 }); } });
	const tabs = segmentedControl({ className: "aa-gallery-view-switcher", value: stateFor(node).view, options: [{ value: "browse", label: label("tab.browse", "Browse"), iconName: "layout" }, { value: "selected", label: label("tab.selected", "Selected"), iconName: "statusCheck" }], ariaLabel: label("tab.label", "Gallery view"), onChange: (value) => controller.setMode(value) });
	const selectedCount = el("span", { className: "aa-gallery-view-switcher__count", attrs: { "aria-label": label("selected.outputHint", "{count} outputs").replace("{count}", "0") }, text: "0" });
	tabs.querySelector('[data-value="selected"]')?.append(selectedCount);
	const clear = iconButton({
		className: "aa-gallery-selected__clear",
		label: label("selected.clear", "Clear"),
		iconName: "delete",
		variant: "ghost",
		onClick: () => openClearSelectionDialog(node, controller),
	});
	const filter = button({ className: "aa-gallery-toolbar-action is-filter", iconName: "filter", label: label("filter.title", "Filters"), title: label("filter.title", "Filters"), variant: "ghost", size: "sm", onClick: () => openFilter(node, filter) });
	const prompt = button({ className: "aa-gallery-toolbar-action is-prompt", iconName: "tag", label: label("prompt.short", "Prompt"), title: label("prompt.title", "Prompt processing"), variant: "ghost", size: "sm", onClick: () => openPromptOptions(node, prompt) });
	const pageControl = createPageControl(node);
	const searchControl = createSearchControl(node);
	let refreshing = false;
	const refresh = iconButton({ className: "aa-gallery-refresh", iconName: "refresh", label: label("reload", "Reload search"), variant: "ghost", onClick: async () => {
		if (refreshing) return;
		refreshing = true; refresh.disabled = true; refresh.classList.add("is-refreshing");
		refresh.setAttribute("aria-label", label("refreshing", "Refreshing…")); refresh.title = label("refreshing", "Refreshing…");
		try { await controller.search({ reset: true, page: 1 }); }
		finally { refreshing = false; refresh.disabled = false; refresh.classList.remove("is-refreshing"); refresh.setAttribute("aria-label", label("reload", "Reload search")); refresh.title = label("reload", "Reload search"); }
	} });
	const openSettings = iconButton({ className: "aa-gallery-open-settings", iconName: "settings", label: label("settings.open", "Configure Gallery…"), variant: "ghost", onClick: openGallerySettings });
	const browseNavigation = el("div", { className: "aa-gallery-toolbar__navigation", children: [collection, pageControl] });
	const browseTools = el("div", { className: "aa-gallery-toolbar__tools", children: [filter, prompt] });
	const pageActions = el("div", { className: "aa-gallery-toolbar__page-actions", attrs: { role: "group", "aria-label": label("toolbarActions", "Browse tools") }, children: [browseNavigation, browseTools] });
	const utilityActions = el("div", { className: "aa-gallery-toolbar__utilities", children: [refresh, openSettings, searchControl.root, searchControl.toggle] });
	const toolbar = el("header", { className: "aa-gallery-toolbar", attrs: { role: "toolbar", "aria-label": label("toolbar", "Booru Gallery") }, children: [source, tabs, clear, el("span", "aa-gallery-toolbar__spacer"), pageActions, utilityActions] });
	const masonry = el("div", { className: "aa-gallery-masonry", attrs: { tabindex: 0 } });
	focusScrollableOnPointerEnter(masonry);
	const loading = el("div", { className: "aa-gallery-status is-loading", attrs: { role: "status", "aria-live": "polite" }, children: [icon("refresh"), el("span", null, label("loading", "Loading…"))] }); loading.hidden = true;
	const errorLabel = el("span");
	const error = el("button", { className: "aa-gallery-status is-error", attrs: { type: "button", "aria-live": "assertive" }, children: [icon("statusWarning"), errorLabel] }); error.hidden = true;
	const end = el("div", { className: "aa-gallery-status is-end", attrs: { role: "status" }, children: [icon("statusCheck"), el("span", null, label("end", "End of results"))] }); end.hidden = true;
	const selected = el("div", "aa-gallery-selected"); const selectedListRoot = el("div", { className: "aa-gallery-selected__list", attrs: { tabindex: 0 } });
	focusScrollableOnPointerEnter(selectedListRoot);
	const selectedDropIndicator = el("div", {
		className: "aa-gallery-selected-drop-indicator",
		attrs: {
			hidden: true,
			"aria-hidden": "true",
		},
		children: [
			el("span", "aa-gallery-selected-drop-indicator__cap"),
			el("span", "aa-gallery-selected-drop-indicator__line"),
			el("span", "aa-gallery-selected-drop-indicator__cap"),
		],
	});
	const emptySelected = el("div", { className: "aa-gallery-selected__empty", children: [el("span", { className: "aa-gallery-selected__empty-icon", children: [icon("statusCheck")] }), el("strong", null, label("selected.emptyTitle", "Build your output set")), el("p", null, label("selected.empty", "Select posts from the waterfall to build an ordered output."))] });
	selected.append(selectedListRoot, emptySelected);
	document.body.append(selectedDropIndicator);
	root.append(toolbar, el("main", { className: "aa-gallery-browser", children: [masonry, loading, error, end] }), selected);
	let controller = null;
	const elements = {
		root,
		masonry,
		loading,
		error,
		errorLabel,
		end,
		tabs,
		selectedCount,
		selectedClear: clear,
		selectedList: null,
		selectedListRoot,
		selectedDropIndicator,
		emptySelected,
		mode: stateFor(node).view,
		pageControl,
		searchControl,
		masonryController: null,
	};
	elements.masonryController = mountVirtualMasonry(masonry, { renderItem: (post, index) => createGalleryCard(node, controller, post, index), onNearEnd: () => controller?.search(), onVisibleIndexChange: (index) => controller?.visibleIndexChanged(index), onVisibleItemsChange: (items) => controller?.prefetchVisible(items), minCardWidth: 144, gap: 6, maxColumns: 5 });
	elements.selectedList = mountVirtualList(selectedListRoot, {
		rowHeight: 96,
		gap: 7,
		overscan: 5,
		onBeforeRender: () => controller?.tooltip?.hide(),
		renderItem: (item, index) => createSelectedRow(node, controller, item, index),
	});
	selectedListRoot.addEventListener("scroll", () => {
		controller?.tooltip?.hide();
		// Keep the drag session; only hide the stale fixed marker until the next dragover.
		if (controller?.selectedDragFrom != null) controller.handleSelectedDragLeave({ relatedTarget: null });
	}, { passive: true });
	selectedListRoot.addEventListener("dragover", (event) => controller?.handleSelectedDragOver(event));
	selectedListRoot.addEventListener("drop", (event) => controller?.handleSelectedDrop(event));
	selectedListRoot.addEventListener("dragleave", (event) => controller?.handleSelectedDragLeave(event));
	controller = buildController(node, elements); node._aaGalleryController = controller; node._aaGalleryRoot = root; node._aaGallerySource = source; node._aaGallerySearch = searchControl; node._aaGalleryCollection = collection; node._aaGalleryPage = pageControl; node._aaGalleryAccent = bindNodeAccent(node, [root, selectedDropIndicator]);
	error.addEventListener("click", () => {
		const sourceName = stateFor(node).source;
		if (capability(sourceName)?.authRequired && !hasSourceCredentials(sourceName)) openGallerySettings();
		else controller.search();
	});
	node.addDOMWidget("aaalice_booru_gallery", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getMinHeight: () => MIN_SIZE[1], getValue: () => "", setValue: () => {} }); installDomWidgetResizePassthrough(node, root);
	const previousComputeSize = node.computeSize; node.computeSize = function () { const size = previousComputeSize?.apply(this, arguments) || DEFAULT_SIZE; return [Math.max(MIN_SIZE[0], Number(size[0]) || 0), MIN_SIZE[1]]; };
	const previousResize = node.onResize; node.onResize = function (size) {
		if (Array.isArray(size)) size[0] = Math.max(MIN_SIZE[0], Number(size[0]) || 0);
		if (Array.isArray(this.size)) this.size[0] = Math.max(MIN_SIZE[0], Number(this.size[0]) || 0);
		return previousResize?.apply(this, arguments);
	};
	const previousConfigure = node.onConfigure; node.onConfigure = function () { const result = previousConfigure?.apply(this, arguments); restoreNode(this); return result; };
	const previousClone = node.clone; node.clone = function () { const cloned = previousClone?.apply(this, arguments); if (cloned?.properties?.[PROPERTY]) cloned.properties[PROPERTY] = structuredClone(cloned.properties[PROPERTY]); return cloned; };
	const previousRemoved = node.onRemoved; node.onRemoved = function () {
		controller.destroy();
		selectedDropIndicator.remove();
		cleanupDomWidgetResizePassthrough(this);
		this._aaGalleryAccent?.dispose?.();
		root.remove();
		return previousRemoved?.apply(this, arguments);
	};
	controller.renderSelected(); controller.search({ reset: true, page: stateFor(node).navigation.page }); if (initializeSize) node.setSize?.(DEFAULT_SIZE);
}

function restoreNode(node) {
	if (!node?._aaGalleryMounted || !node._aaGalleryController) return;
	node.properties[PROPERTY] = normalizeGalleryState(node.properties?.[PROPERTY], settings || {});
	const state = stateFor(node);
	node._aaGalleryRoot.dataset.source = state.source;
	node._aaGallerySource.setValue(state.source);
	node._aaGallerySearch.sync();
	node._aaGalleryCollection.setOptions(collectionOptions(state.source), collectionValue(state));
	node._aaGalleryPage.setPage(state.navigation.page);
	node._aaGalleryController.setMode(state.view, { persist: false });
	node._aaGalleryController.renderSelected();
	void node._aaGalleryController.search({ reset: true, page: state.navigation.page });
	node._aaGalleryAccent?.sync?.();
}

function setupNodeSafely(node, options) {
	try {
		setupNode(node, options);
	} catch (error) {
		node._aaGalleryMounted = false;
		console.error(`[Aaalice] Booru Gallery mount failed: ${error?.stack || error}`);
		throw error;
	}
}

function settingsInput(type, value = "") { const control = document.createElement("input"); control.type = type; control.className = "aa-ui-input"; control.value = value; return control; }

function settingsSectionHeader(iconName, title) {
	return el("header", { className: "aa-gallery-settings__section-header", children: [
		el("span", { className: "aa-gallery-settings__section-icon", attrs: { "aria-hidden": "true" }, children: [icon(iconName)] }),
		el("strong", null, title),
	] });
}

function credentialLabel(name) { return label(`settings.credential.${name}`, name); }

async function openSettingsDialog() {
	await loadSetup({ force: true }); const sourceInputs = {}; const sourceClears = {};
	for (const cap of capabilities) {
		sourceClears[cap.source] = new Set();
		sourceInputs[cap.source] = Object.fromEntries((cap.authFields || []).map((name) => { const input = settingsInput(name.toLowerCase().includes("key") ? "password" : "text"); const statusName = `has${name[0].toUpperCase()}${name.slice(1)}`; input.placeholder = settings.credentialStatus?.[cap.source]?.[statusName] ? label("settings.keepCredential", "Configured; leave blank to keep") : name; return [name, input]; }));
	}
	const defaultSource = listboxControl({ options: capabilities.map((cap) => ({ value: cap.source, label: cap.displayName })), value: settings.defaultSource, ariaLabel: label("settings.defaultSource", "Default source") });
	const blacklist = document.createElement("textarea"); blacklist.className = "aa-ui-input aa-gallery-settings__blacklist-input"; blacklist.value = (settings.blacklist || []).join("\n"); blacklist.placeholder = label("settings.blacklistPlaceholder", "watermark\ntext\nmale_focus"); blacklist.setAttribute("aria-label", label("settings.blacklist", "Content blacklist")); blacklist.title = label("prompt.excludeHint", "Global: hides matching posts and removes the tags from output prompts");
	const blacklistCount = el("span", { className: "aa-gallery-settings__blacklist-count", attrs: { "aria-live": "polite" } });
	const syncBlacklistCount = () => { const next = tagLines(blacklist.value).length; blacklistCount.textContent = label("settings.blacklistCount", "{count} blocked tags").replace("{count}", String(next)); blacklistCount.classList.toggle("is-active", next > 0); };
	blacklist.addEventListener("input", syncBlacklistCount); syncBlacklistCount();
	const defaultCategories = multiSelectControl({ className: "aa-gallery-prompt-categories aa-gallery-settings__prompt-categories", options: GALLERY_CATEGORIES.map((value) => ({ value, label: label(`category.${value}`, value), attrs: { "data-category": value } })), values: settings.promptDefaults?.categories || [], ariaLabel: label("prompt.categories", "Categories") });
	const defaultUnderscores = checkboxControl({ checked: settings.promptDefaults?.replaceUnderscores, label: label("prompt.underscores", "Replace underscores with spaces") });
	const defaultParentheses = checkboxControl({ checked: settings.promptDefaults?.escapeParentheses, label: label("prompt.parentheses", "Escape parentheses") });
	const timeout = settingsInput("number", String(settings.timeout)); timeout.min = "3"; timeout.max = "300";
	const budget = settingsInput("number", String(settings.cacheBudgetMiB)); budget.min = "128"; budget.max = "32768";
	const tooltip = checkboxControl({ checked: settings.tooltip, label: label("settings.tooltip", "Show hover details") });
	let selectedStamp = SELECTION_STAMPS.includes(settings.selectionStamp) ? settings.selectionStamp : "quarantineQualified";
	const stampButtons = new Map();
	const stampPicker = el("div", { className: "aa-gallery-settings__stamp-picker", attrs: { role: "radiogroup", "aria-label": label("settings.selectionStamp", "Selection stamp") } });
	const setStamp = (value) => { selectedStamp = value; for (const [style, control] of stampButtons) { const active = style === value; control.classList.toggle("is-active", active); control.setAttribute("aria-checked", String(active)); control.tabIndex = active ? 0 : -1; } };
	for (const style of SELECTION_STAMPS) {
		const preview = createSelectionStamp(style, { preview: true }).root;
		const control = el("button", { className: "aa-gallery-settings__stamp-option", attrs: { type: "button", role: "radio", "aria-label": selectionStampLabel(style) }, children: [preview, el("span", null, selectionStampLabel(style))] });
		control.addEventListener("click", () => setStamp(style)); stampButtons.set(style, control); stampPicker.append(control);
	}
	setStamp(selectedStamp);
	const sourceIsConfigured = (cap) => (cap.authFields || []).length > 0 && (cap.authFields || []).every((name) => settings.credentialStatus?.[cap.source]?.[`has${name[0].toUpperCase()}${name.slice(1)}`]);
	const sourceViews = capabilities.map((cap) => {
		const authFields = cap.authFields || [];
		const configured = sourceIsConfigured(cap);
		const stateText = !authFields.length ? label("settings.publicOnly", "Public access") : configured ? label("settings.configured", "Configured") : label("settings.notConfigured", "Not configured");
		const status = el("span", { className: "aa-gallery-settings__connection-status", attrs: { role: "status" } });
		const test = button({ className: "aa-gallery-settings__test", label: label("settings.test", "Test connection"), iconName: "refresh", variant: "ghost", size: "sm", onClick: async () => {
			test.disabled = true; test.classList.add("is-testing"); status.className = "aa-gallery-settings__connection-status is-testing"; status.textContent = label("settings.testing", "Testing…");
			try { await jsonRequest(`${API}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: cap.source, credentials: Object.fromEntries(Object.entries(sourceInputs[cap.source]).map(([name, input]) => [name, input.value])) }) }); status.className = "aa-gallery-settings__connection-status is-success"; status.textContent = label("settings.connected", "Connection succeeded."); }
			catch (error) { status.className = "aa-gallery-settings__connection-status is-error"; status.textContent = error.message; }
			finally { test.disabled = false; test.classList.remove("is-testing"); }
		} });
		const credentialFields = Object.entries(sourceInputs[cap.source]).map(([name, input]) => {
			const clearCredential = iconButton({ className: "aa-gallery-settings__credential-clear", iconName: "delete", label: label("settings.clearCredential", "Clear saved value"), variant: "ghost", size: "sm", onClick: () => { sourceClears[cap.source].add(name); input.value = ""; input.placeholder = label("settings.credentialWillClear", "Saved value will be cleared"); input.closest(".aa-gallery-settings__credential")?.classList.add("is-clearing"); } });
			return el("div", { className: "aa-gallery-settings__credential", children: [field({ label: credentialLabel(name), control: input }), clearCredential] });
		});
		const abilityLabels = [cap.favoriteRead ? label("settings.favoriteRead", "Favorite read") : "", cap.favoriteWrite ? label("settings.favoriteWrite", "Favorite write") : "", cap.categorizedTags ? label("settings.tagGroups", "Tag groups") : "", (cap.rankingPeriods || []).length ? label("settings.rankings", "Rankings") : ""].filter(Boolean);
		const panel = el("section", { className: `aa-gallery-settings__source ${configured ? "is-configured" : authFields.length ? "needs-setup" : "is-public"}`, attrs: { role: "tabpanel", tabindex: "0", "data-source": cap.source }, children: [
			el("header", { children: [el("div", { className: "aa-gallery-settings__source-identity", children: [el("span", { className: "aa-gallery-settings__source-mark", children: [icon(configured ? "statusCheck" : authFields.length ? "lock" : "statusIdle")] }), el("div", { children: [el("strong", null, cap.displayName), el("small", null, cap.source)] })] }), el("span", { className: "aa-gallery-settings__source-state", children: [el("i"), stateText] })] }),
			el("div", { className: "aa-gallery-settings__capabilities", children: (abilityLabels.length ? abilityLabels : [label("settings.publicOnly", "Public access")]).map((value) => el("span", null, value)) }),
			...(credentialFields.length ? [el("div", { className: "aa-gallery-settings__credentials", children: credentialFields })] : [el("p", { className: "aa-gallery-settings__public-note", text: label("settings.publicHint", "No account is required for this source.") })]),
			el("div", { className: "aa-gallery-settings__actions", children: [test, status] }),
		] });
		const tab = button({ className: `aa-gallery-settings__source-tab ${configured ? "is-configured" : authFields.length ? "needs-setup" : "is-public"}`, label: cap.displayName, iconName: configured ? "statusCheck" : authFields.length ? "lock" : "statusIdle", variant: "ghost", size: "sm" });
		const sourceId = cap.source.replace(/[^a-z0-9_-]/gi, "-"); tab.id = `aa-gallery-source-tab-${sourceId}`; panel.id = `aa-gallery-source-panel-${sourceId}`;
		tab.dataset.source = cap.source; tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", panel.id); panel.setAttribute("aria-labelledby", tab.id); tab.append(el("span", { className: "aa-gallery-settings__source-tab-state", text: stateText }));
		return { cap, panel, tab, configured };
	});
	let dialog; const status = el("span", { className: "aa-ui-field__hint", attrs: { role: "status" } });
	const clear = button({ className: "aa-gallery-settings__clear-cache", label: label("settings.clearCache", "Clear Gallery cache"), iconName: "delete", variant: "ghost", onClick: async () => { clear.disabled = true; try { await jsonRequest(`${API}/cache/clear`, { method: "POST" }); status.textContent = label("settings.cacheCleared", "Gallery cache cleared."); } catch (error) { status.textContent = error.message; } finally { clear.disabled = false; } } });
	const blacklistCard = el("section", { className: "aa-gallery-settings__blacklist-card", children: [
		el("header", { children: [el("span", { className: "aa-gallery-settings__blacklist-icon", children: [icon("lock")] }), el("strong", null, label("settings.blacklist", "Content blacklist")), blacklistCount] }),
		blacklist,
	] });
	const browsePanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "browse" }, children: [settingsSectionHeader("filter", label("settings.browseTitle", "Browsing defaults")), el("div", { className: "aa-gallery-settings__form-grid", children: [field({ label: label("settings.defaultSource", "Default source"), control: defaultSource }), el("div", { className: "aa-gallery-settings__toggle-card", children: [el("strong", null, label("settings.tooltip", "Show hover details")), tooltip] })] }), field({ label: label("settings.selectionStamp", "Selection stamp"), hint: label("settings.selectionStampHint", "Applied to selected cards in every Gallery node."), control: stampPicker })] });
	const blacklistPanel = el("section", { className: "aa-gallery-settings__page aa-gallery-settings__blacklist-page", attrs: { "data-page": "blacklist" }, children: [blacklistCard] });
	const promptPanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "prompt" }, children: [settingsSectionHeader("tag", label("settings.promptTitle", "Prompt defaults")), field({ label: label("prompt.categories", "Categories"), control: defaultCategories }), el("div", { className: "aa-gallery-settings__switches", children: [el("label", { className: "aa-gallery-check-row", children: [defaultUnderscores, el("span", null, label("prompt.underscores", "Replace underscores with spaces"))] }), el("label", { className: "aa-gallery-check-row", children: [defaultParentheses, el("span", null, label("prompt.parentheses", "Escape parentheses"))] })] })] });
	const performancePanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "performance" }, children: [settingsSectionHeader("refresh", label("settings.performanceTitle", "Network & storage")), el("div", { className: "aa-gallery-settings__form-grid", children: [field({ label: label("settings.timeout", "Request timeout (seconds)"), control: timeout }), field({ label: label("settings.cacheBudget", "Original cache budget (MiB)"), control: budget })] }), el("div", { className: "aa-gallery-settings__cache-card", children: [el("span", { children: [icon("delete")] }), el("div", { children: [el("strong", null, label("settings.clearCache", "Clear Gallery cache")), el("small", null, label("settings.clearCacheHint", "Removes cached originals and metadata; your selections are not affected."))] }), clear] })] });
	const sourceList = el("div", { className: "aa-gallery-settings__source-list", attrs: { role: "tablist", "aria-label": label("settings.sourcesTitle", "Sources & accounts") }, children: sourceViews.map(({ tab }) => tab) });
	const sourceDetail = el("div", { className: "aa-gallery-settings__source-detail", children: sourceViews.map(({ panel }) => panel) });
	const accountsPanel = el("section", { className: "aa-gallery-settings__page is-active", attrs: { "data-page": "accounts" }, children: [settingsSectionHeader("lock", label("settings.sourcesTitle", "Sources & accounts")), el("div", { className: "aa-gallery-settings__source-workspace", children: [sourceList, sourceDetail] })] });
	const setSource = (source) => {
		for (const { cap, panel, tab } of sourceViews) {
			const active = cap.source === source; panel.hidden = !active; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
		}
	};
	for (const { cap, tab } of sourceViews) tab.addEventListener("click", () => setSource(cap.source));
	sourceList.addEventListener("keydown", (event) => {
		if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || !sourceViews.length) return;
		event.preventDefault(); const current = Math.max(0, sourceViews.findIndex(({ tab }) => tab === document.activeElement));
		const next = event.key === "Home" ? 0 : event.key === "End" ? sourceViews.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + sourceViews.length) % sourceViews.length;
		setSource(sourceViews[next].cap.source); sourceViews[next].tab.focus({ preventScroll: true });
	});
	setSource(sourceViews.find(({ configured }) => configured)?.cap.source || sourceViews[0]?.cap.source);
	const pages = { accounts: accountsPanel, browse: browsePanel, blacklist: blacklistPanel, prompt: promptPanel, performance: performancePanel };
	const navItems = [
		{ value: "accounts", label: label("settings.navAccounts", "Accounts"), iconName: "lock" }, { value: "browse", label: label("settings.navBrowse", "Browsing"), iconName: "filter" },
		{ value: "blacklist", label: label("settings.blacklist", "Content blacklist"), iconName: "delete" },
		{ value: "prompt", label: label("settings.navPrompt", "Prompt"), iconName: "tag" }, { value: "performance", label: label("settings.navPerformance", "Storage"), iconName: "storage" },
	];
	const navButtons = new Map();
	const setPage = (value) => {
		for (const [name, panel] of Object.entries(pages)) { const active = name === value; panel.hidden = !active; panel.classList.toggle("is-active", active); }
		for (const [name, control] of navButtons) { const active = name === value; control.classList.toggle("is-active", active); control.setAttribute("aria-current", active ? "page" : "false"); }
	};
	const nav = el("nav", { className: "aa-gallery-settings__nav", attrs: { "aria-label": label("settings.navigation", "Settings sections") } });
	for (const item of navItems) { const control = button({ className: "aa-gallery-settings__nav-item", label: item.label, iconName: item.iconName, variant: "ghost", size: "sm", onClick: () => setPage(item.value) }); navButtons.set(item.value, control); nav.append(control); }
	browsePanel.hidden = true; blacklistPanel.hidden = true; promptPanel.hidden = true; performancePanel.hidden = true;
	const configuredCount = capabilities.filter(sourceIsConfigured).length;
	nav.append(el("div", { className: "aa-gallery-settings__nav-summary", children: [el("strong", null, label("settings.accountCount", "{count} accounts ready").replace("{count}", String(configuredCount)))] }));
	setPage("accounts");
	const body = el("div", { className: "aa-gallery-settings", children: [nav, el("div", { className: "aa-gallery-settings__pages", children: [accountsPanel, browsePanel, blacklistPanel, promptPanel, performancePanel] })] });
	const save = button({ label: label("settings.save", "Save"), variant: "primary", onClick: async () => { save.disabled = true; try { const previousBlacklist = JSON.stringify(settings.blacklist || []); settings = await jsonRequest(`${API}/settings/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultSource: defaultSource.value, blacklist: tagLines(blacklist.value), promptDefaults: { categories: defaultCategories.values(), replaceUnderscores: defaultUnderscores.getAttribute("aria-checked") === "true", escapeParentheses: defaultParentheses.getAttribute("aria-checked") === "true" }, tooltip: tooltip.getAttribute("aria-checked") === "true", selectionStamp: selectedStamp, timeout: Number(timeout.value), cacheBudgetMiB: Number(budget.value), credentials: Object.fromEntries(Object.entries(sourceInputs).map(([sourceName, fields]) => [sourceName, Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]))])), clearCredentials: Object.fromEntries(Object.entries(sourceClears).map(([sourceName, values]) => [sourceName, [...values]])) }) }); dialog.close(); for (const galleryNode of app.graph?._nodes || []) { if (!isGallery(galleryNode)) continue; galleryNode._aaGalleryController?.renderSelected(); galleryNode._aaGalleryController?.refreshCards(); if (previousBlacklist !== JSON.stringify(settings.blacklist || [])) void galleryNode._aaGalleryController?.search({ reset: true, page: 1 }); } } catch (error) { status.textContent = error.message; save.disabled = false; } } });
	dialog = createDialog({ title: label("settings.title", "Booru Gallery"), body, footer: el("div", { className: "aa-gallery-settings__footer", children: [status, save] }), size: "lg", className: "aa-gallery-settings-dialog", confirmOnEnter: false });
}

function registerSettings() {
	if (app._aaGallerySettingsRegistered) return; app._aaGallerySettingsRegistered = true;
	app.ui.settings.addSetting({ id: "Aaalice.BooruGallery.Configure", name: label("settings.entry", "Booru Gallery"), category: ["Aaalice Nodes", "Booru Gallery"], type: () => {
		const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 2;
		cell.append(button({ label: label("settings.open", "Configure Gallery…"), onClick: () => openSettingsDialog().catch((error) => console.error("[Aaalice] Gallery settings failed", error)) })); row.append(cell); return row;
	} });
}

function installPromptHook() {
	if (app._aaGalleryPromptHook) return; app._aaGalleryPromptHook = true; const original = app.graphToPrompt?.bind(app); if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for BooruGalleryNode");
	app.graphToPrompt = async function (...args) { const result = await original(...args); const output = result?.output ?? result; for (const node of app.graph?._nodes || []) { if (!isGallery(node)) continue; const promptNode = output?.[String(node.id)]; if (!promptNode) continue; promptNode.inputs ||= {}; promptNode.inputs.gallery_payload = JSON.stringify(galleryPayload(stateFor(node), settings?.blacklist)); } return result; };
}

function hookPrototype(nodeType) { if (!nodeType || nodeType.__aaaliceBooruGallery) return; nodeType.__aaaliceBooruGallery = true; const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); setupNodeSafely(this, { initializeSize: true }); return result; }; }

app.registerExtension({
	name: "ComfyUI.Aaalice.BooruGallery",
	async init() { await ensureI18nReady(); await loadSetup(); registerSettings(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isGallery(node)) setupNodeSafely(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isGallery(node)) { setupNodeSafely(node); restoreNode(node); } },
	setup() { installPromptHook(); for (const node of app.graph?._nodes || []) if (isGallery(node)) setupNodeSafely(node); },
});
