/** Multi-site Booru Gallery with virtual masonry and immutable queue snapshots. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, currentLocale, t } from "./i18n.js";
import { defaultGalleryRatings, finalPrompt, galleryPayload, GALLERY_CATEGORIES, normalizeGalleryState, normalizeTagGroups, selectionFromDetail, selectionKey } from "./lib/booru_gallery_model.js";
import { createBooruGalleryPreset, decodeBooruGalleryPreset, validateBooruGalleryPreset } from "./lib/booru_gallery_preset.js";
import { streamTagTranslations } from "./lib/tag_translation.js";
import { parseTagListValue } from "./lib/taglist_value.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { allGraphNodes, promptNodesForGraphNode } from "./lib/graph_scope.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import { createGallerySurfaceFactory, observeGalleryNodeMode } from "./lib/booru_gallery_surface.js";
import { button, checkboxControl, createAnchoredPopover, createDialog, createTooltip, el, field, icon, iconButton, listboxControl, multiSelectControl, searchToggleButton, segmentedControl } from "./lib/ui.js";
import { createTagPillList } from "./lib/controls/tag_pills.js";
import { createGalleryCards } from "./lib/booru_gallery_cards.js";
import { createGalleryControllerFactory } from "./lib/booru_gallery_controller.js";
import { createGalleryDialogs } from "./lib/booru_gallery_dialogs.js";
import { createGallerySettings } from "./lib/booru_gallery_settings.js";
import { createGalleryMedia } from "./lib/booru_gallery_media.js";

const NODE = "BooruGalleryNode";
const PROPERTY = "booruGalleryState";
const API = "/aaalice/booru-gallery";
// PromptAssistant 的 API 前缀随其安装目录名变化（旧版固定 /prompt-assistant/api），两个候选都要探。
const PROMPT_ASSISTANT_API_CANDIDATES = ["/prompt-assistant/api", "/ComfyUI-Prompt-Assistant/api"];
let promptAssistantAvailable = false;
let promptAssistantApi = null;
const DEFAULT_SIZE = [760, 760];
const MIN_SIZE = [620, 300];
const STATIC_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function clampGallerySize(size) {
	if (!Array.isArray(size)) return size;
	size[0] = Math.max(MIN_SIZE[0], Number(size[0]) || 0);
	size[1] = Math.max(MIN_SIZE[1], Number(size[1]) || 0);
	return size;
}

function applyInitialGallerySize(node, initializeSize) {
	const current = Array.isArray(node?.size) ? node.size : DEFAULT_SIZE;
	const next = clampGallerySize([...(initializeSize ? DEFAULT_SIZE : current)]);
	if (!initializeSize && current[0] === next[0] && current[1] === next[1]) return;
	if (typeof node?.setSize === "function") node.setSize(next);
	else node.size = next;
}

let settings = null;
let capabilities = [];
let setupRequest = null;

function isGallery(node) { return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE); }
function stateFor(node) { node.properties ||= {}; node.properties[PROPERTY] = normalizeGalleryState(node.properties[PROPERTY], settings || {}); return node.properties[PROPERTY]; }
function capability(source) { return capabilities.find((item) => item.source === source); }
function label(key, fallback) { return t(`aaalice.gallery.${key}`, fallback); }
function dimensions(value) { return `${Math.max(0, Number(value?.width) || 0)}×${Math.max(0, Number(value?.height) || 0)}`; }
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

const { createDetailImageViewer, createSelectionStamp, ratingIcon, SELECTION_STAMPS, selectionStampLabel, sortLabel } = createGalleryMedia({
	button, el, icon, iconButton, label, ratingTone,
});

function effectivePrompt(node) {
	return { ...stateFor(node).prompt, excludedTags: [...(settings?.blacklist || [])], outputFilterTags: [...(settings?.outputFilterTags || [])] };
}

// 输出过滤只影响组合出的提示词，不隐藏帖子，因此保存后只需刷新已选视图与提示词预览。
async function saveGlobalOutputFilter(value) {
	const outputFilterTags = Array.isArray(value) ? [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))] : tagLines(value);
	settings = await jsonRequest(`${API}/settings/save`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ outputFilterTags }),
	});
	for (const galleryNode of allGraphNodes(app.graph)) {
		if (!isGallery(galleryNode)) continue;
		galleryNode._aaGalleryController?.renderSelected();
	}
	return outputFilterTags;
}

async function addGlobalOutputFilterTag(tag) {
	const value = String(tag || "").trim();
	if (!value) return;
	const current = settings?.outputFilterTags || [];
	if (!current.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) await saveGlobalOutputFilter([...current, value]);
}

async function saveGlobalBlacklist(value) {
	const blacklist = Array.isArray(value) ? [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))] : tagLines(value);
	settings = await jsonRequest(`${API}/settings/save`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ blacklist }),
	});
	const searches = [];
	for (const galleryNode of allGraphNodes(app.graph)) {
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
	const sortIcons = { latest: "statusIdle", new: "statusIdle", score: "statusCheck", favcount: "favorite" };
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

function canWriteFavorite(source, targetFavorite = true) {
	const cap = capability(source);
	if (!cap?.favoriteWrite) {
		showFavoriteNotice(source, "readOnly");
		notifyFavorite(source, targetFavorite, label("card.favoriteReadOnlyBody", "This source currently supports reading favorites, but not adding them.").replace("{source}", cap?.displayName || source));
		return false;
	}
	if (!hasSourceCredentials(source)) {
		showFavoriteNotice(source, "login");
		notifyFavorite(source, targetFavorite, label("card.favoriteLoginBody", "Configure your {source} account before adding favorites.").replace("{source}", cap?.displayName || source));
		return false;
	}
	return true;
}

function notifyFavorite(source, targetFavorite, error = null) {
	const detail = error
		? label("card.favoriteFailed", "Could not update favorite: {reason}").replace("{reason}", error?.message || String(error))
		: label(targetFavorite ? "card.favoriteAdded" : "card.favoriteRemoved", targetFavorite ? "Added to favorites." : "Removed from favorites.");
	app.extensionManager?.toast?.add?.({
		severity: error ? "error" : "success",
		summary: `${capability(source)?.displayName || source} · ${targetFavorite ? label("card.favorite", "Favorite") : label("card.unfavorite", "Remove favorite")}`,
		detail,
		life: error ? 5000 : 3200,
	});
}

function sectionHeading(title, hint = "") {
	return el("header", { className: "aa-gallery-section-heading", children: [el("strong", null, title), ...(hint ? [el("small", null, hint)] : [])] });
}

async function jsonRequest(path, options = {}) {
	const response = await api.fetchApi(path, options); let data;
	try { data = await response.json(); } catch { throw new Error(`${path} returned invalid JSON`); }
	if (!response.ok) {
		const error = new Error(data.message || `${path} HTTP ${response.status}`);
		if (data.code) error.code = data.code;
		throw error;
	}
	return data;
}

async function detectPromptAssistantApi() {
	for (const base of PROMPT_ASSISTANT_API_CANDIDATES) {
		const ok = await api.fetchApi(`${base}/config/llm/masked`).then((response) => response.ok).catch(() => false);
		if (ok) return base;
	}
	return null;
}

async function loadSetup({ force = false } = {}) {
	if (!force && settings && capabilities.length) return { settings, capabilities };
	if (!force && setupRequest) return setupRequest;
	setupRequest = Promise.all([
		jsonRequest(`${API}/settings`),
		jsonRequest(`${API}/sources`),
		detectPromptAssistantApi(),
	]).then(([nextSettings, sourceData, assistantApi]) => {
		settings = nextSettings; capabilities = sourceData.sources || []; promptAssistantApi = assistantApi; promptAssistantAvailable = Boolean(assistantApi); return { settings, capabilities };
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
function tagLines(value) { return [...new Set(parseTagListValue(value))]; }

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

const {
	createSearchControl, openClearSelectionDialog, openGalleryErrorDialog, openInterrogateResultDialog, openSingleSelectionDialog,
} = createGalleryDialogs({
	app, button, createDialog, el, icon, iconButton, label, proxyUrl, searchQuery,
	searchToggleButton, stateFor, t, transact,
});

const {
	createGalleryCard, createGalleryTagPills, createSelectedRow,
	moveSelectionIndex, resolveSelectedDropTarget,
} = createGalleryCards({
	GALLERY_CATEGORIES, canWriteFavorite, capability, createSelectionStamp, createTagPillList,
	dimensions, effectivePrompt, el, finalPrompt, getSettings: () => settings, icon, iconButton,
	isPromptAssistantAvailable: () => promptAssistantAvailable, label, notifyFavorite, proxyUrl,
	ratingLabel, ratingTone, selectionKey, stateFor, tagCount, transact,
});

const buildController = createGalleryControllerFactory({
	API, GALLERY_CATEGORIES, STATIC_EXTENSIONS,
	addGlobalBlacklistTag, addGlobalOutputFilterTag, app, blobToDataUrl, button, canWriteFavorite, capability,
	copyImageToClipboard, createDetailImageViewer, createDialog, createGalleryTagPills,
	createTooltip, currentLocale, dimensions, effectivePrompt, el, fetchMediaBlob,
	finalPrompt, hasSourceCredentials, icon, jsonRequest, label,
	moveSelectionIndex, normalizeTagGroups, notifyFavorite, openInterrogateResultDialog,
	openSingleSelectionDialog, proxyUrl, ratingLabel, ratingTone, resolveSelectedDropTarget,
	searchQuery, sectionHeading, selectionFromDetail, selectionKey, stateFor,
	streamTagTranslations, tagCount, transact, promptAssistantApi: () => promptAssistantApi,
});

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
	const apply = button({ label: label("filter.apply", "Apply"), iconName: "statusCheck", variant: "primary", onClick: () => { transact(node, (current) => { current.filters.ratings = selectedRatings; current.navigation.page = 1; }); node._aaGalleryController.syncState(); popover.close(); node._aaGalleryController.search({ reset: true, page: 1 }); } });
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
	control.setBusy = (busy) => { control.classList.toggle("is-busy", busy); control.disabled = busy; };
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
	const prompt = effectivePrompt(node); anchor.classList.add("is-open"); anchor.setAttribute("aria-expanded", "true"); const popover = createAnchoredPopover({ anchor, ariaLabel: label("prompt.title", "Prompt processing"), className: "aa-gallery-prompt-popover", width: 440, onClose: () => { anchor.classList.remove("is-open"); anchor.setAttribute("aria-expanded", "false"); } });
	const categories = multiSelectControl({ className: "aa-gallery-prompt-categories", options: GALLERY_CATEGORIES.map((value) => ({ value, label: label(`category.${value}`, value), attrs: { "data-category": value } })), values: prompt.categories, ariaLabel: label("prompt.categories", "Categories"), onChange: (values) => transact(node, (state) => { state.prompt.categories = values; }) });
	const underscores = checkboxControl({ checked: prompt.replaceUnderscores, label: label("prompt.underscores", "Replace underscores with spaces"), onChange: (value) => transact(node, (state) => { state.prompt.replaceUnderscores = value; }) });
	const parentheses = checkboxControl({ checked: prompt.escapeParentheses, label: label("prompt.parentheses", "Escape parentheses"), onChange: (value) => transact(node, (state) => { state.prompt.escapeParentheses = value; }) });
	const excluded = document.createElement("textarea"); excluded.className = "aa-ui-input aa-gallery-prompt-excluded"; excluded.value = (settings?.blacklist || []).join("\n"); excluded.placeholder = label("prompt.excludePlaceholder", "e.g. watermark, text focus"); excluded.title = label("prompt.excludeHint", "Shared by every Gallery node and source");
	// Autocomplete-Plus 的外部输入 opt-in：装了补全扩展即自动接入，未安装时属性完全惰性。
	excluded.setAttribute("data-autocomplete-plus", "");
	excluded.setAttribute("data-autocomplete-plus-mode", "raw-tag");
	excluded.addEventListener("change", async () => {
		excluded.disabled = true;
		try { excluded.value = (await saveGlobalBlacklist(excluded.value)).join("\n"); excluded.setAttribute("aria-invalid", "false"); }
		catch (error) { excluded.setAttribute("aria-invalid", "true"); console.error("[Aaalice] Failed to save the global blacklist", error); }
		finally { excluded.disabled = false; }
	});
	const transformOption = (control, title) => el("label", { className: "aa-gallery-prompt-transform", children: [control, el("strong", null, title)] });
	const outputFilter = document.createElement("textarea"); outputFilter.className = "aa-ui-input aa-gallery-prompt-excluded"; outputFilter.value = (settings?.outputFilterTags || []).join("\n"); outputFilter.placeholder = label("prompt.outputFilterPlaceholder", "e.g. watermark, artist name"); outputFilter.title = label("prompt.outputFilterHint", "Shared by every Gallery node and source; removes the tags from output and copied prompts without hiding posts");
	outputFilter.setAttribute("data-autocomplete-plus", "");
	outputFilter.setAttribute("data-autocomplete-plus-mode", "raw-tag");
	outputFilter.addEventListener("change", async () => {
		outputFilter.disabled = true;
		try { outputFilter.value = (await saveGlobalOutputFilter(outputFilter.value)).join("\n"); outputFilter.setAttribute("aria-invalid", "false"); }
		catch (error) { outputFilter.setAttribute("aria-invalid", "true"); console.error("[Aaalice] Failed to save the output filter tags", error); }
		finally { outputFilter.disabled = false; }
	});
	const panels = {
		categories: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "categories" }, children: [categories] }),
		format: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "format" }, children: [el("div", { className: "aa-gallery-prompt-switches", children: [transformOption(underscores, label("prompt.underscores", "Replace underscores with spaces")), transformOption(parentheses, label("prompt.parentheses", "Escape parentheses"))] })] }),
		exclude: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "exclude" }, children: [excluded] }),
		outputFilter: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "outputFilter" }, children: [outputFilter] }),
	};
	const showPanel = (value) => { for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== value; popover.reposition(); };
	const tabs = segmentedControl({ className: "aa-gallery-prompt-tabs", value: "categories", options: [
		{ value: "categories", label: label("prompt.categories", "Categories"), iconName: "tag" },
		{ value: "format", label: label("prompt.transformTitle", "Formatting"), iconName: "settings" },
		{ value: "exclude", label: label("prompt.exclude", "Excluded tags"), iconName: "filter" },
		{ value: "outputFilter", label: label("prompt.outputFilter", "Output filter"), iconName: "delete" },
	], ariaLabel: label("prompt.sections", "Prompt setting sections"), onChange: showPanel });
	const header = el("header", { className: "aa-gallery-prompt-popover__header", children: [el("span", { className: "aa-gallery-prompt-popover__icon", children: [icon("tag")] }), el("strong", null, label("prompt.title", "Prompt processing")), el("span", { className: "aa-gallery-prompt-popover__live", children: [icon("statusCheck"), el("span", null, label("prompt.live", "Live"))] })] });
	const body = el("div", { className: "aa-gallery-prompt-popover__body", children: Object.values(panels) });
	showPanel("categories"); popover.root.append(header, tabs, body); popover.reposition();
}

const createGallerySurface = createGallerySurfaceFactory({
	capability, collectionOptions, collectionValue, createGalleryCard, createPageControl,
	createSearchControl, createSelectedRow, defaultGalleryRatings,
	getCapabilities: () => capabilities, hasSourceCredentials, icon, label,
	openClearSelectionDialog, openFilter, openGalleryErrorDialog, openGallerySettings,
	openPromptOptions, stateFor, transact,
});

function setupNode(node, { initializeSize = false } = {}) {
	if (!isGallery(node) || node._aaGalleryMounted) return;
	node._aaGalleryMounted = true; stateFor(node);
	const surfaces = new Set();
	const controller = buildController(node, surfaces);
	const runtime = { controller, surfaces, nodeSurface: null, accent: null, modeObserver: null };
	node._aaGalleryRuntime = runtime; node._aaGalleryController = controller;
	runtime.getPresetValue = () => createBooruGalleryPreset(stateFor(node), settings || {});
	runtime.setDashboardSearchOpen = (value) => {
		const searchOpen = Boolean(value);
		if (stateFor(node).dashboard.searchOpen === searchOpen) return;
		transact(node, (state) => { state.dashboard.searchOpen = searchOpen; });
		controller.syncState();
	};
	runtime.validatePresetValue = (value) => validateBooruGalleryPreset(value, settings || {});
	runtime.applyPresetValue = (value) => {
		const decoded = decodeBooruGalleryPreset(value, settings || {});
		node.properties[PROPERTY] = decoded.state;
		const state = stateFor(node);
		controller.syncState(); runtime.accent?.sync?.();
		void controller.search({ reset: true, page: state.navigation.page });
	};
	runtime.createSidebarControl = () => {
		const surface = createGallerySurface(node, controller, { placement: "dashboard" });
		controller.attachSurface(surface); runtime.accent?.sync?.();
		let destroyed = false;
		return {
			root: surface.root,
			update() { if (!destroyed) { controller.syncState(); runtime.accent?.sync?.(); } },
			destroy() { if (destroyed) return; destroyed = true; controller.detachSurface(surface); },
		};
	};
	const surface = createGallerySurface(node, controller);
	runtime.nodeSurface = surface; controller.attachSurface(surface);
	node._aaGalleryRoot = surface.root; node._aaGallerySource = surface.source; node._aaGallerySearch = surface.searchControl;
	node._aaGalleryCollection = surface.collection; node._aaGalleryPage = surface.pageControl;
	node._aaGalleryRandomMode = { setActive: (value) => { stateFor(node).randomMode = Boolean(value); controller.syncState(); } };
	node._aaGallerySelectionMode = surface.selectionMode;
	runtime.accent = bindNodeAccent(node, () => [...surfaces].flatMap((view) => [view.root, view.selectedDropIndicator]));
	runtime.modeObserver = observeGalleryNodeMode(node, () => { for (const view of surfaces) view.syncNodeMode(); });
	addLifecycleDOMWidget(node, "aaalice_booru_gallery", "custom", surface.root, { serialize: false, hideOnZoom: true, margin: 0, getMinHeight: () => MIN_SIZE[1], getValue: () => "", setValue: () => {} });
	installDomWidgetResizePassthrough(node, surface.root);
	const previousComputeSize = node.computeSize; node.computeSize = function () { const size = previousComputeSize?.apply(this, arguments) || DEFAULT_SIZE; return [Math.max(MIN_SIZE[0], Number(size[0]) || 0), MIN_SIZE[1]]; };
	const previousResize = node.onResize; node.onResize = function (size) { clampGallerySize(size); clampGallerySize(this.size); return previousResize?.apply(this, arguments); };
	const previousConfigure = node.onConfigure; node.onConfigure = function () { const result = previousConfigure?.apply(this, arguments); restoreNode(this); return result; };
	const previousClone = node.clone; node.clone = function () { const cloned = previousClone?.apply(this, arguments); if (cloned?.properties?.[PROPERTY]) cloned.properties[PROPERTY] = structuredClone(cloned.properties[PROPERTY]); return cloned; };
	const previousRemoved = node.onRemoved; node.onRemoved = function () {
		controller.destroy(); cleanupDomWidgetResizePassthrough(this); runtime.accent?.dispose?.(); runtime.modeObserver?.dispose?.();
		this._aaGalleryRuntime = null; this._aaGalleryController = null;
		return previousRemoved?.apply(this, arguments);
	};
	controller.search({ reset: true, page: stateFor(node).navigation.page }); applyInitialGallerySize(node, initializeSize);
}

function restoreNode(node) {
	if (!node?._aaGalleryMounted || !node._aaGalleryRuntime) return;
	node.properties[PROPERTY] = normalizeGalleryState(node.properties?.[PROPERTY], settings || {});
	const state = stateFor(node);
	node._aaGalleryController.syncState();
	void node._aaGalleryController.search({ reset: true, page: state.navigation.page });
	node._aaGalleryRuntime.accent?.sync?.();
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

const { openSettingsDialog, registerSettings } = createGallerySettings({
	API, GALLERY_CATEGORIES, SELECTION_STAMPS, allGraphNodes, app, button,
	checkboxControl, createDialog, createSelectionStamp, el, field,
	getCapabilities: () => capabilities, getSettings: () => settings, icon, iconButton,
	isGallery, jsonRequest, label, listboxControl, loadSetup, multiSelectControl,
	selectionStampLabel, setSettings: (value) => { settings = value; }, tagLines,
});

function installPromptHook() {
	if (app._aaGalleryPromptHook) return; app._aaGalleryPromptHook = true; const original = app.graphToPrompt?.bind(app); if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for BooruGalleryNode");
	app.graphToPrompt = async function (...args) {
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of allGraphNodes(app.graph)) {
			if (!isGallery(node)) continue;
			const payload = JSON.stringify(galleryPayload(stateFor(node), settings?.blacklist, settings?.outputFilterTags));
			for (const promptNode of promptNodesForGraphNode(output, node)) {
				promptNode.inputs ||= {};
				promptNode.inputs.gallery_payload = payload;
			}
		}
		return result;
	};
}

function hookPrototype(nodeType) { if (!nodeType || nodeType.__aaaliceBooruGallery) return; nodeType.__aaaliceBooruGallery = true; const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); setupNodeSafely(this, { initializeSize: true }); return result; }; }

app.registerExtension({
	name: "ComfyUI.Aaalice.BooruGallery",
	async init() { await ensureI18nReady(); await loadSetup(); registerSettings(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isGallery(node)) setupNodeSafely(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isGallery(node)) { setupNodeSafely(node); restoreNode(node); } },
	setup() { installPromptHook(); for (const node of allGraphNodes(app.graph)) if (isGallery(node)) setupNodeSafely(node); },
});
