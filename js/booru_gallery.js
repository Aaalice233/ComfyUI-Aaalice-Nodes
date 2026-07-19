/** Multi-site Booru Gallery with virtual masonry and immutable queue snapshots. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { finalPrompt, galleryPayload, GALLERY_CATEGORIES, normalizeGalleryState, normalizeTagGroups, selectionFromDetail, selectionKey } from "./lib/booru_gallery_model.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import { mountVirtualList } from "./lib/virtual_list.js";
import { mountVirtualMasonry } from "./lib/virtual_masonry.js";
import { button, checkboxControl, createAnchoredPopover, createDialog, createTooltip, el, field, icon, iconButton, isolate, listboxControl, multiSelectControl, segmentedControl } from "./lib/ui.js";

const NODE = "BooruGalleryNode";
const PROPERTY = "booruGalleryState";
const API = "/aaalice/booru-gallery";
const DEFAULT_SIZE = [760, 720];
const MIN_SIZE = [480, 300];
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
function sortLabel(value) { return label(`collection.${value}`, String(value)); }
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

async function openComfySettings() {
	const command = app.extensionManager?.command?.commands?.find?.((item) => item.id === "Comfy.ShowSettingsDialog");
	try {
		if (typeof command?.function === "function") { await command.function(); return true; }
		if (typeof app.ui?.settings?.show === "function") { await app.ui.settings.show(); return true; }
	} catch (error) {
		console.error("[Aaalice] Failed to open ComfyUI settings", error);
	}
	const detail = label("settings.pathHint", "Click the gear in the lower-left corner, then open Aaalice Nodes → Booru Gallery to configure accounts and Gallery settings.");
	if (app.extensionManager?.toast?.add) app.extensionManager.toast.add({ severity: "warn", summary: label("settings.openFailed", "Open ComfyUI settings"), detail });
	else window.alert(detail);
	return false;
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
	if (needsLogin) actions.push(button({ label: label("card.favoriteConfigure", "Configure account"), iconName: "settings", variant: "primary", onClick: () => { dialog.close(); void openComfySettings(); } }));
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
	setupRequest = Promise.all([jsonRequest(`${API}/settings`), jsonRequest(`${API}/sources`)]).then(([nextSettings, sourceData]) => {
		settings = nextSettings; capabilities = sourceData.sources || []; return { settings, capabilities };
	}).finally(() => { setupRequest = null; });
	return setupRequest;
}

function transact(node, callback) {
	node.graph?.beforeChange?.();
	try { callback(stateFor(node)); }
	finally { node.graph?.afterChange?.(); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, true); }
}

function proxyUrl(source, url) { return `${API}/media?${new URLSearchParams({ source, url })}`; }
function searchQuery(state) { return state.query.trim(); }
function tagLines(value) { return [...new Set(String(value || "").split(/\n/).map((tag) => tag.trim()).filter(Boolean))]; }

function createSearchControl(node) {
	const root = el("div", "aa-gallery-search");
	const input = document.createElement("input"); input.type = "search"; input.className = "aa-gallery-search__input";
	input.placeholder = label("search.placeholder", "Search tags…"); input.setAttribute("aria-label", label("search.label", "Search posts"));
	const close = iconButton({ iconName: "close", label: label("search.close", "Close search"), variant: "ghost", onClick: () => setOpen(false) });
	root.append(icon("search"), input, close);
	const toggle = iconButton({ iconName: "search", label: label("search.label", "Search posts"), variant: "ghost", onClick: () => setOpen(true) });
	let open = false; let composing = false;
	const setOpen = (next) => {
		open = Boolean(next); root.classList.toggle("is-open", open); toggle.hidden = open; node._aaGalleryRoot?.classList.toggle("is-searching", open);
		if (open) queueMicrotask(() => { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); });
	};
	input.addEventListener("compositionstart", () => { composing = true; }); input.addEventListener("compositionend", () => { composing = false; });
	input.addEventListener("keydown", (event) => {
		if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
		else if (event.key === "Enter" && !composing && !event.isComposing) { event.preventDefault(); transact(node, (state) => { state.query = input.value.trim(); state.filters.feed = "search"; state.filters.period = ""; state.navigation.page = 1; }); node._aaGalleryCollection?.setValue(`sort:${stateFor(node).filters.sort}`); node._aaGalleryPage?.setPage(1); node._aaGalleryController?.search({ reset: true, page: 1 }); }
	});
	return { root, input, toggle, setOpen, sync: () => { if (document.activeElement !== input) input.value = stateFor(node).query; } };
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
	const selectionOrder = el("span", "aa-gallery-card__selection-order");
	const badge = el("span", { className: "aa-gallery-card__selection", attrs: { "aria-hidden": "true" }, children: [icon("statusCheck"), selectionOrder] });
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
	const favoriteCapability = capability(post.source);
	const favoriteAction = (favoriteCapability?.favoriteRead || favoriteCapability?.favoriteWrite) ? actionButton("favorite", "favorite", post.favorite ? label("card.unfavorite", "Remove favorite") : label("card.favorite", "Favorite"), 1, async () => {
		if (!canWriteFavorite(post.source)) return;
		try { await controller.toggleFavorite(post); card._aaGalleryUpdate?.(); favoriteAction.classList.add("is-acknowledged"); }
		catch (error) { controller.showError(error); }
	}) : null;
	const detailAction = actionButton("note", "detail", label("card.detail", "View details"), favoriteAction ? 2 : 1, () => controller.openDetail(post).catch(controller.showError));
	const actionControls = [editAction, ...(favoriteAction ? [favoriteAction] : []), detailAction];
	actions.append(...actionControls);
	card._aaVirtualMasonryLayout = (width, height) => { card.dataset.actionsLayout = galleryCardActionLayout(width, height, actionControls.length); };
	surface.append(image, selectedLayer, el("div", { className: "aa-gallery-card__shade" }), ...(rating ? [rating] : []), badge, actions);
	card.append(surface);
	const update = () => {
		const order = stateFor(node).selections.findIndex((item) => selectionKey(item) === `${post.source}:${post.postId}`); const selected = order >= 0;
		const previousSelected = card.dataset.selected;
		card.classList.toggle("is-selected", selected); selectionOrder.textContent = selected ? String(order + 1) : "";
		card.dataset.selected = String(selected);
		if (previousSelected != null && previousSelected !== String(selected)) card.classList.add("is-selection-feedback");
		if (favoriteAction) { favoriteAction.classList.toggle("is-active", Boolean(post.favorite)); favoriteAction.setAttribute("aria-label", post.favorite ? label("card.unfavorite", "Remove favorite") : label("card.favorite", "Favorite")); favoriteAction.title = favoriteAction.getAttribute("aria-label"); }
		card.setAttribute("aria-label", `${post.source} #${post.postId} · ${selected ? label("card.cancel", "Cancel selection") : label("card.select", "Select image")}`);
	};
	card._aaGalleryUpdate = update; update();
	card.addEventListener("animationend", (event) => {
		if (event.animationName === "aa-gallery-selection-feedback") card.classList.remove("is-selection-feedback");
		if (event.animationName === "aa-gallery-favorite-feedback") favoriteAction?.classList.remove("is-acknowledged");
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

function createSelectedRow(node, controller, selection, index) {
	const promptText = finalPrompt(selection, stateFor(node).prompt);
	const root = el("div", { className: "aa-gallery-selected-row", attrs: { draggable: true }, children: [
		el("span", { className: "aa-gallery-selected-row__drag", attrs: { "aria-hidden": "true" }, children: [icon("drag")] }),
		el("span", "aa-gallery-selected-row__order", String(index + 1)),
		el("img", { className: "aa-gallery-selected-row__thumb", attrs: { src: proxyUrl(selection.source, selection.previewUrl), alt: "", loading: "lazy", decoding: "async" } }),
		el("div", { className: "aa-gallery-selected-row__copy", children: [
			el("div", { className: "aa-gallery-selected-row__title", children: [el("strong", null, `${selection.source} #${selection.postId}`), el("span", "aa-gallery-selected-row__format", selection.fileExt?.toUpperCase() || "IMAGE")] }),
			el("small", null, [dimensions(selection), selection.rating, label("selected.tagCount", `${tagCount(selection.editedTags || selection.originalTags)} tags`).replace("{count}", String(tagCount(selection.editedTags || selection.originalTags)))].filter(Boolean).join(" · ")),
			el("p", { className: "aa-gallery-selected-row__prompt", text: promptText || label("selected.noPrompt", "No prompt tags in the current category selection") }),
		] }),
		iconButton({ iconName: "edit", label: label("selected.edit", "Edit tags"), variant: "ghost", onClick: () => controller.openEditor(index) }),
		iconButton({ iconName: "delete", label: label("selected.remove", "Remove"), variant: "ghost", onClick: () => { transact(node, (state) => state.selections.splice(index, 1)); controller.renderSelected(); controller.refreshCards(); } }),
	] });
	root.addEventListener("dragstart", (event) => { event.dataTransfer.setData("text/x-aa-gallery-index", String(index)); event.dataTransfer.effectAllowed = "move"; });
	root.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; });
	root.addEventListener("drop", (event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/x-aa-gallery-index")); if (!Number.isInteger(from) || from === index) return; transact(node, (state) => { const [item] = state.selections.splice(from, 1); state.selections.splice(index, 0, item); }); controller.renderSelected(); controller.refreshCards(); });
	return root;
}

function buildController(node, elements) {
	let posts = []; let pageSegments = []; let nextCursor = null; let ended = false; let loading = false; let requestController = null; let generation = 0; const sessionEdits = new Map();
	const tooltip = createTooltip({ delay: 0, closeDelay: 120 });
	const showError = (error) => { elements.errorLabel.textContent = error?.message || String(error); elements.error.hidden = false; console.error("[Aaalice] Booru Gallery", error); };
	const clearError = () => { elements.error.hidden = true; elements.errorLabel.textContent = ""; };
	const setLoading = (value) => { loading = value; elements.loading.hidden = !value; };
	const refreshCards = () => elements.masonry.querySelectorAll(".aa-gallery-card").forEach((card) => card._aaGalleryUpdate?.());
	const renderSelected = () => { const count = stateFor(node).selections.length; elements.selectedList.setItems(stateFor(node).selections, { preserveScroll: true }); elements.tabs.setValue(elements.mode); elements.selectedMeta.textContent = label("selected.outputHint", `${count} ordered image and Prompt pairs`).replace("{count}", String(count)); elements.emptySelected.hidden = count > 0; };
	const setMode = (mode) => { if (elements.mode === mode) return; elements.mode = mode; elements.root.dataset.mode = mode; renderSelected(); };
	const rememberPage = (page) => {
		const value = Math.max(1, Math.floor(Number(page) || 1));
		const state = stateFor(node); if (state.navigation.page === value) return;
		state.navigation.page = value; elements.pageControl?.setPage(value); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, false);
	};
	const search = async ({ reset = false, page = null } = {}) => {
		if (loading || (ended && !reset)) return;
		const requestedPage = reset ? Math.max(1, Math.floor(Number(page ?? stateFor(node).navigation.page) || 1)) : null;
		if (reset) { requestController?.abort(); requestController = new AbortController(); generation += 1; posts = []; pageSegments = []; nextCursor = null; ended = false; elements.masonryController.setItems([], { preserveScroll: false }); clearError(); rememberPage(requestedPage); }
		else requestController ||= new AbortController();
		const currentGeneration = generation; const state = stateFor(node);
		if (capability(state.source)?.authRequired && !hasSourceCredentials(state.source)) {
			showError(new Error(label("error.credentialsRequired", "This source requires account credentials. Click here to open Gallery settings.")));
			return;
		}
		setLoading(true);
		try {
			const favorites = state.filters.feed === "favorites";
			const params = new URLSearchParams({ source: state.source, limit: "60" });
			if (!favorites) { params.set("query", searchQuery(state)); params.set("sort", state.filters.sort); for (const rating of state.filters.ratings) params.append("rating", rating); }
			if (requestedPage != null) params.set("page", String(requestedPage)); else if (nextCursor) params.set("cursor", nextCursor);
			const endpoint = favorites ? "favorites" : state.filters.feed === "ranking" ? "ranking" : "search";
			if (state.filters.feed === "ranking") { params.delete("query"); params.delete("sort"); params.delete("rating"); params.set("period", state.filters.period); }
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
	const getDetail = async (post) => {
		const response = await jsonRequest(`${API}/detail?${new URLSearchParams({ source: post.source, postId: post.postId })}`);
		if (!response.mediaUrl || !STATIC_EXTENSIONS.has(String(response.fileExt).toLowerCase())) throw new Error(label("error.staticOnly", "Only static JPG, PNG, WebP, and GIF posts can be selected."));
		return response;
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
			if (sampleUrl && sampleUrl !== post.previewUrl) { usingPreview = false; loading.hidden = false; image.src = proxyUrl(detail.source, sampleUrl); }
			else { waitingForLargerPreview = false; loading.hidden = true; }
			tooltip.reposition();
		}).catch(() => { waitingForLargerPreview = false; loading.hidden = true; });
	};
	const openDetail = async (post) => {
		const detail = await getDetail(post); const key = `${post.source}:${post.postId}`; const selected = stateFor(node).selections.some((item) => selectionKey(item) === key);
		const image = el("img", { className: "aa-gallery-detail__image", attrs: { src: proxyUrl(detail.source, detail.mediaUrl), alt: `${detail.source} #${detail.postId}` } });
		const actions = [];
		let dialog; actions.push(button({ className: `aa-gallery-detail__action is-selection${selected ? " is-selected" : ""}`, label: selected ? label("detail.remove", "Remove selection") : label("detail.select", "Select"), variant: selected ? "danger" : "primary", onClick: async () => { await toggleSelection(detail); dialog.close(); } }));
		actions.push(button({ className: "aa-gallery-detail__action is-source", label: label("detail.source", "Open source"), iconName: "link", variant: "ghost", onClick: () => window.open(detail.postUrl, "_blank", "noopener") }));
		actions.push(button({ className: "aa-gallery-detail__action is-original", label: label("detail.original", "Open original"), iconName: "download", variant: "ghost", onClick: () => window.open(proxyUrl(detail.source, detail.mediaUrl), "_blank", "noopener") }));
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
			el("header", { className: "aa-gallery-detail__header", children: [el("span", "aa-gallery-detail__source", detail.source), el("div", { children: [el("strong", null, `#${detail.postId}`), el("small", null, label("detail.localOnly", "Local selection and tag edits only"))] })] }),
			el("dl", { className: "aa-gallery-detail__facts", children: facts.map(([fact, term, value]) => el("div", { attrs: { "data-fact": fact }, children: [el("dt", null, term), el("dd", null, value)] })) }),
			el("div", { className: "aa-gallery-detail__tag-groups", children: GALLERY_CATEGORIES.map((category) => {
				const tags = detail.tags?.[category] || [];
				return el("section", { className: "aa-gallery-detail__tag-group", attrs: { "data-category": category }, children: [sectionHeading(label(`category.${category}`, category), String(tags.length)), el("div", { className: "aa-gallery-detail__tag-list", children: tags.length ? tags.map((tag) => el("span", null, tag)) : [el("small", null, label("detail.noTags", "No tags"))] })] });
			}) }),
		] });
		const body = el("div", { className: "aa-gallery-detail", children: [el("div", { className: "aa-gallery-detail__media", children: [image] }), inspector] });
		dialog = createDialog({ title: label("detail.title", "Post details"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: actions }), size: "lg", className: "aa-gallery-detail-dialog", confirmOnEnter: false });
	};
	const openEditor = async (target) => {
		const selectedIndex = typeof target === "number" ? target : stateFor(node).selections.findIndex((item) => selectionKey(item) === `${target.source}:${target.postId}`);
		let selection = selectedIndex >= 0 ? stateFor(node).selections[selectedIndex] : null; const key = selection ? selectionKey(selection) : `${target.source}:${target.postId}`;
		if (!selection) { const detail = await getDetail(target); selection = selectionFromDetail(detail, sessionEdits.get(key)); }
		if (!selection) throw new Error(label("error.incomplete", "The post detail is incomplete.")); const groups = normalizeTagGroups(selection.editedTags || selection.originalTags);
		const counts = {};
		const inputs = Object.fromEntries(GALLERY_CATEGORIES.map((category) => { const control = document.createElement("textarea"); control.className = "aa-ui-input aa-gallery-tag-editor__input"; control.value = groups[category].join("\n"); return [category, control]; }));
		const categoryViews = GALLERY_CATEGORIES.map((category) => {
			counts[category] = el("span", "aa-gallery-tag-editor__count", String(groups[category].length));
			counts[category].addEventListener("animationend", () => counts[category].classList.remove("is-updated"));
			inputs[category].addEventListener("input", () => { const next = String(inputs[category].value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).length); if (counts[category].textContent === next) return; counts[category].textContent = next; counts[category].classList.remove("is-updated"); void counts[category].offsetWidth; counts[category].classList.add("is-updated"); });
			const panel = el("section", { className: "aa-gallery-tag-editor__category", attrs: { "data-category": category, role: "tabpanel" }, children: [el("header", { children: [el("strong", null, label(`category.${category}`, category)), el("small", null, label("editor.lineHint", "One tag per line"))] }), inputs[category]] });
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
		const editorContext = el("header", { className: "aa-gallery-tag-editor__context", children: [el("img", { attrs: { src: proxyUrl(selection.source, selection.previewUrl), alt: "" } }), el("div", { children: [el("div", { className: "aa-gallery-tag-editor__identity", children: [el("span", null, selection.source), el("strong", null, `#${selection.postId}`)] }), el("small", null, label("editor.hint", "One tag per line. Changes stay in this workflow selection."))] })] });
		const body = el("div", { className: "aa-gallery-tag-editor", children: [editorContext, el("div", { className: "aa-gallery-tag-editor__workspace", children: [categoryNav, categoryPanels] })] }); let dialog;
		const values = () => Object.fromEntries(GALLERY_CATEGORIES.map((category) => [category, inputs[category].value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)]));
		const restore = button({ label: label("editor.restore", "Restore original"), iconName: "refresh", variant: "ghost", onClick: () => { for (const category of GALLERY_CATEGORIES) { inputs[category].value = selection.originalTags[category].join("\n"); inputs[category].dispatchEvent(new Event("input")); } } });
		const copy = button({ label: label("editor.copy", "Copy prompt"), iconName: "copy", variant: "ghost", onClick: () => navigator.clipboard.writeText(finalPrompt({ ...selection, editedTags: values() }, stateFor(node).prompt)) });
		const save = button({ label: label("editor.save", "Save local tags"), variant: "primary", onClick: () => { const edited = values(); if (selectedIndex >= 0) transact(node, (state) => { state.selections[selectedIndex].editedTags = edited; }); else sessionEdits.set(key, edited); renderSelected(); dialog.close(); } });
		dialog = createDialog({ title: label("editor.title", "Edit local tags"), body, footer: el("div", { className: "aa-gallery-dialog-actions", children: [restore, copy, save] }), size: "lg", className: "aa-gallery-tag-editor-dialog", confirmOnEnter: false });
	};
	return { tooltip, search, jumpToPage(page) { return search({ reset: true, page }); }, visibleIndexChanged, toggleSelection, toggleFavorite, recoverPreview, showHover, openDetail, openEditor, renderSelected, refreshCards, setMode, showError,
		updateSize(post, width, height) { elements.masonryController.updateItemSize(`${post.source}:${post.postId}`, width, height); },
		destroy() { generation += 1; requestController?.abort(); tooltip.destroy(); elements.masonryController.destroy(); elements.selectedList.destroy(); } };
}

function openFilter(node, anchor) {
	const state = stateFor(node); const cap = capability(state.source); const ratingOptions = cap?.ratings || [];
	anchor.classList.add("is-open"); anchor.setAttribute("aria-expanded", "true");
	const popover = createAnchoredPopover({ anchor, ariaLabel: label("filter.title", "Filters"), className: "aa-gallery-filter-popover", width: 300, onClose: () => { anchor.classList.remove("is-open"); anchor.setAttribute("aria-expanded", "false"); } });
	let selectedRatings = [...state.filters.ratings];
	const ratings = multiSelectControl({
		className: "aa-gallery-filter-ratings",
		options: ratingOptions.map((value) => ({ value, label: ratingLabel(value), attrs: { "data-rating": ratingTone(value) } })),
		values: selectedRatings,
		ariaLabel: label("filter.rating", "Rating"),
		onChange: (values) => { selectedRatings = values; },
	});
	const apply = button({ label: label("filter.apply", "Apply"), iconName: "statusCheck", variant: "primary", onClick: () => { transact(node, (current) => { current.filters.ratings = selectedRatings; current.filters.feed = "search"; current.filters.period = ""; current.navigation.page = 1; }); node._aaGalleryCollection?.setValue(`sort:${stateFor(node).filters.sort}`); node._aaGalleryPage?.setPage(1); popover.close(); node._aaGalleryController.search({ reset: true, page: 1 }); } });
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
		const popover = createAnchoredPopover({ anchor: control, ariaLabel: label("page.title", "Page navigation"), className: "aa-gallery-page-popover", width: 196, onClose: () => { control.classList.remove("is-open"); control.setAttribute("aria-expanded", "false"); } });
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
	const prompt = stateFor(node).prompt; anchor.classList.add("is-open"); anchor.setAttribute("aria-expanded", "true"); const popover = createAnchoredPopover({ anchor, ariaLabel: label("prompt.title", "Prompt processing"), className: "aa-gallery-prompt-popover", width: 360, onClose: () => { anchor.classList.remove("is-open"); anchor.setAttribute("aria-expanded", "false"); } });
	const categories = multiSelectControl({ className: "aa-gallery-prompt-categories", options: GALLERY_CATEGORIES.map((value) => ({ value, label: label(`category.${value}`, value), attrs: { "data-category": value } })), values: prompt.categories, ariaLabel: label("prompt.categories", "Categories"), onChange: (values) => transact(node, (state) => { state.prompt.categories = values; }) });
	const underscores = checkboxControl({ checked: prompt.replaceUnderscores, label: label("prompt.underscores", "Replace underscores with spaces"), onChange: (value) => transact(node, (state) => { state.prompt.replaceUnderscores = value; }) });
	const parentheses = checkboxControl({ checked: prompt.escapeParentheses, label: label("prompt.parentheses", "Escape parentheses"), onChange: (value) => transact(node, (state) => { state.prompt.escapeParentheses = value; }) });
	const excluded = document.createElement("textarea"); excluded.className = "aa-ui-input aa-gallery-prompt-excluded"; excluded.value = prompt.excludedTags.join("\n"); excluded.placeholder = label("prompt.excludePlaceholder", "e.g. watermark, text focus"); excluded.addEventListener("change", () => transact(node, (state) => { state.prompt.excludedTags = [...new Set(excluded.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]; }));
	const transformOption = (control, title, hint) => el("label", { className: "aa-gallery-prompt-transform", children: [control, el("span", { children: [el("strong", null, title), el("small", null, hint)] })] });
	const panels = {
		categories: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "categories" }, children: [categories] }),
		format: el("section", { className: "aa-gallery-prompt-panel", attrs: { "data-panel": "format" }, children: [el("div", { className: "aa-gallery-prompt-switches", children: [transformOption(underscores, label("prompt.underscores", "Replace underscores with spaces"), label("prompt.underscoresHint", "Makes tags read like normal words")), transformOption(parentheses, label("prompt.parentheses", "Escape parentheses"), label("prompt.parenthesesHint", "Keeps weighting syntax literal"))] })] }),
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
	const root = isolate(el("div", { className: "aa-gallery", attrs: { "data-mode": "browse" } }));
	root.dataset.source = stateFor(node).source;
	let collection = null;
	const source = listboxControl({ className: "aa-gallery-source-select", options: capabilities.map((item) => ({ value: item.source, label: item.displayName })), value: stateFor(node).source, ariaLabel: label("source", "Source"), onChange: (value) => { transact(node, (state) => { state.source = value; state.filters.ratings = settings?.defaultRatings?.[value] || []; state.filters.sort = capability(value)?.sortValues?.[0] || "latest"; state.filters.feed = "search"; state.filters.period = ""; state.navigation.page = 1; }); root.dataset.source = value; pageControl?.setPage(1); collection?.setOptions(collectionOptions(value), collectionValue(stateFor(node))); controller.search({ reset: true, page: 1 }); } });
	collection = listboxControl({ className: "aa-gallery-collection-select", options: collectionOptions(stateFor(node).source), value: collectionValue(stateFor(node)), ariaLabel: label("collection.label", "Gallery collection"), onChange: (value) => { transact(node, (state) => { if (value === "favorites") { state.filters.feed = "favorites"; state.filters.period = ""; } else if (value.startsWith("ranking:")) { state.filters.feed = "ranking"; state.filters.period = value.slice("ranking:".length); } else { state.filters.feed = "search"; state.filters.period = ""; state.filters.sort = value.slice("sort:".length); } state.navigation.page = 1; }); pageControl?.setPage(1); controller.search({ reset: true, page: 1 }); } });
	const tabs = segmentedControl({ className: "aa-gallery-view-switcher", value: "browse", options: [{ value: "browse", label: label("tab.browse", "Browse"), iconName: "layout" }, { value: "selected", label: label("tab.selected", "Selected"), iconName: "statusCheck" }], ariaLabel: label("tab.label", "Gallery view"), onChange: (value) => controller.setMode(value) });
	const filter = button({ className: "aa-gallery-toolbar-action is-filter", iconName: "filter", label: label("filter.title", "Filters"), title: label("filter.title", "Filters"), variant: "ghost", size: "sm", onClick: () => openFilter(node, filter) });
	const prompt = button({ className: "aa-gallery-toolbar-action is-prompt", iconName: "tag", label: label("prompt.short", "Prompt"), title: label("prompt.title", "Prompt processing"), variant: "ghost", size: "sm", onClick: () => openPromptOptions(node, prompt) });
	const pageControl = createPageControl(node);
	const searchControl = createSearchControl(node);
	let refreshing = false;
	const refresh = iconButton({ className: "aa-gallery-refresh", iconName: "refresh", label: label("reload", "Reload search"), variant: "ghost", onClick: async () => {
		if (refreshing) return;
		refreshing = true; refresh.disabled = true; refresh.classList.add("is-refreshing");
		refresh.setAttribute("aria-label", label("refreshing", "Refreshing…")); refresh.title = label("refreshing", "Refreshing…");
		try { await controller.search({ reset: true }); }
		finally { refreshing = false; refresh.disabled = false; refresh.classList.remove("is-refreshing"); refresh.setAttribute("aria-label", label("reload", "Reload search")); refresh.title = label("reload", "Reload search"); }
	} });
	const openSettings = iconButton({ className: "aa-gallery-open-settings", iconName: "settings", label: label("settings.openComfy", "Open ComfyUI settings"), variant: "ghost", onClick: () => { void openComfySettings(); } });
	const browseNavigation = el("div", { className: "aa-gallery-toolbar__navigation", children: [collection, pageControl] });
	const browseTools = el("div", { className: "aa-gallery-toolbar__tools", children: [filter, prompt] });
	const pageActions = el("div", { className: "aa-gallery-toolbar__page-actions", attrs: { role: "group", "aria-label": label("toolbarActions", "Browse tools") }, children: [browseNavigation, browseTools] });
	const utilityActions = el("div", { className: "aa-gallery-toolbar__utilities", children: [refresh, openSettings, searchControl.root, searchControl.toggle] });
	const toolbar = el("header", { className: "aa-gallery-toolbar", attrs: { role: "toolbar", "aria-label": label("toolbar", "Booru Gallery") }, children: [source, tabs, el("span", "aa-gallery-toolbar__spacer"), pageActions, utilityActions] });
	const masonry = el("div", { className: "aa-gallery-masonry", attrs: { tabindex: 0 } });
	const loading = el("div", { className: "aa-gallery-status is-loading", attrs: { role: "status", "aria-live": "polite" }, children: [icon("refresh"), el("span", null, label("loading", "Loading…"))] }); loading.hidden = true;
	const errorLabel = el("span");
	const error = el("button", { className: "aa-gallery-status is-error", attrs: { type: "button", "aria-live": "assertive" }, children: [icon("statusWarning"), errorLabel] }); error.hidden = true;
	const end = el("div", { className: "aa-gallery-status is-end", attrs: { role: "status" }, children: [icon("statusCheck"), el("span", null, label("end", "End of results"))] }); end.hidden = true;
	const selected = el("div", "aa-gallery-selected"); const selectedListRoot = el("div", "aa-gallery-selected__list");
	const emptySelected = el("div", { className: "aa-gallery-selected__empty", children: [el("span", { className: "aa-gallery-selected__empty-icon", children: [icon("statusCheck")] }), el("strong", null, label("selected.emptyTitle", "Build your output set")), el("p", null, label("selected.empty", "Select posts from the waterfall to build an ordered output."))] });
	const selectedMeta = el("small", "aa-gallery-selected__meta");
	const clear = button({ label: label("selected.clear", "Clear"), iconName: "delete", variant: "ghost", size: "sm", onClick: () => { if (!stateFor(node).selections.length || !confirm(label("selected.clearConfirm", "Clear all selected posts?"))) return; transact(node, (state) => { state.selections = []; }); controller.renderSelected(); controller.refreshCards(); } });
	selected.append(el("div", { className: "aa-gallery-selected__toolbar", children: [el("div", { children: [el("strong", null, label("selected.title", "Ordered selection")), selectedMeta] }), el("span", "aa-gallery-toolbar__spacer"), clear] }), selectedListRoot, emptySelected);
	root.append(toolbar, el("main", { className: "aa-gallery-browser", children: [masonry, loading, error, end] }), selected);
	let controller = null;
	const elements = { root, masonry, loading, error, errorLabel, end, tabs, selectedMeta, selectedList: null, emptySelected, mode: "browse", pageControl, masonryController: null };
	elements.masonryController = mountVirtualMasonry(masonry, { renderItem: (post, index) => createGalleryCard(node, controller, post, index), onNearEnd: () => controller?.search(), onVisibleIndexChange: (index) => controller?.visibleIndexChanged(index), minCardWidth: 144, gap: 6, maxColumns: 5 });
	elements.selectedList = mountVirtualList(selectedListRoot, { rowHeight: 96, gap: 7, overscan: 5, renderItem: (item, index) => createSelectedRow(node, controller, item, index) });
	controller = buildController(node, elements); node._aaGalleryController = controller; node._aaGalleryRoot = root; node._aaGallerySearch = searchControl; node._aaGalleryCollection = collection; node._aaGalleryPage = pageControl; node._aaGalleryAccent = bindNodeAccent(node, root);
	error.addEventListener("click", () => {
		const sourceName = stateFor(node).source;
		if (capability(sourceName)?.authRequired && !hasSourceCredentials(sourceName)) void openComfySettings();
		else controller.search();
	});
	node.addDOMWidget("aaalice_booru_gallery", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getMinHeight: () => MIN_SIZE[1], getValue: () => "", setValue: () => {} }); installDomWidgetResizePassthrough(node, root);
	const previousComputeSize = node.computeSize; node.computeSize = function () { const size = previousComputeSize?.apply(this, arguments) || DEFAULT_SIZE; return [Math.max(MIN_SIZE[0], Number(size[0]) || 0), MIN_SIZE[1]]; };
	const previousConfigure = node.onConfigure; node.onConfigure = function () { const result = previousConfigure?.apply(this, arguments); this.properties[PROPERTY] = normalizeGalleryState(this.properties?.[PROPERTY], settings || {}); searchControl.sync(); collection.setOptions(collectionOptions(stateFor(this).source), collectionValue(stateFor(this))); pageControl.setPage(stateFor(this).navigation.page); controller.renderSelected(); node._aaGalleryAccent?.sync?.(); return result; };
	const previousClone = node.clone; node.clone = function () { const cloned = previousClone?.apply(this, arguments); if (cloned?.properties?.[PROPERTY]) cloned.properties[PROPERTY] = structuredClone(cloned.properties[PROPERTY]); return cloned; };
	const previousRemoved = node.onRemoved; node.onRemoved = function () { controller.destroy(); cleanupDomWidgetResizePassthrough(this); this._aaGalleryAccent?.dispose?.(); root.remove(); return previousRemoved?.apply(this, arguments); };
	controller.renderSelected(); controller.search({ reset: true, page: stateFor(node).navigation.page }); if (initializeSize) node.setSize?.(DEFAULT_SIZE);
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
	await loadSetup({ force: true }); const sourceInputs = {}; const sourceClears = {}; const ratingDefaults = {};
	for (const cap of capabilities) {
		sourceClears[cap.source] = new Set();
		sourceInputs[cap.source] = Object.fromEntries((cap.authFields || []).map((name) => { const input = settingsInput(name.toLowerCase().includes("key") ? "password" : "text"); const statusName = `has${name[0].toUpperCase()}${name.slice(1)}`; input.placeholder = settings.credentialStatus?.[cap.source]?.[statusName] ? label("settings.keepCredential", "Configured; leave blank to keep") : name; return [name, input]; }));
		ratingDefaults[cap.source] = multiSelectControl({ className: "aa-gallery-settings__rating", options: (cap.ratings || []).map((value) => ({ value, label: ratingLabel(value), attrs: { "data-rating": ratingTone(value) } })), values: settings.defaultRatings?.[cap.source] || [], ariaLabel: `${cap.displayName} ${label("filter.rating", "Rating")}` });
	}
	const defaultSource = listboxControl({ options: capabilities.map((cap) => ({ value: cap.source, label: cap.displayName })), value: settings.defaultSource, ariaLabel: label("settings.defaultSource", "Default source") });
	const blacklist = document.createElement("textarea"); blacklist.className = "aa-ui-input aa-gallery-settings__blacklist-input"; blacklist.value = (settings.blacklist || []).join("\n"); blacklist.placeholder = label("settings.blacklistPlaceholder", "watermark\ntext\nmale_focus"); blacklist.setAttribute("aria-label", label("settings.blacklist", "Content blacklist"));
	const blacklistCount = el("span", { className: "aa-gallery-settings__blacklist-count", attrs: { "aria-live": "polite" } });
	const syncBlacklistCount = () => { const next = tagLines(blacklist.value).length; blacklistCount.textContent = label("settings.blacklistCount", "{count} blocked tags").replace("{count}", String(next)); blacklistCount.classList.toggle("is-active", next > 0); };
	blacklist.addEventListener("input", syncBlacklistCount); syncBlacklistCount();
	const excluded = document.createElement("textarea"); excluded.className = "aa-ui-input"; excluded.value = (settings.promptDefaults?.excludedTags || []).join("\n");
	const defaultCategories = multiSelectControl({ className: "aa-gallery-prompt-categories aa-gallery-settings__prompt-categories", options: GALLERY_CATEGORIES.map((value) => ({ value, label: label(`category.${value}`, value), attrs: { "data-category": value } })), values: settings.promptDefaults?.categories || [], ariaLabel: label("prompt.categories", "Categories") });
	const defaultUnderscores = checkboxControl({ checked: settings.promptDefaults?.replaceUnderscores, label: label("prompt.underscores", "Replace underscores with spaces") });
	const defaultParentheses = checkboxControl({ checked: settings.promptDefaults?.escapeParentheses, label: label("prompt.parentheses", "Escape parentheses") });
	const timeout = settingsInput("number", String(settings.timeout)); timeout.min = "3"; timeout.max = "300";
	const budget = settingsInput("number", String(settings.cacheBudgetMiB)); budget.min = "128"; budget.max = "32768";
	const tooltip = checkboxControl({ checked: settings.tooltip, label: label("settings.tooltip", "Show hover details") });
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
		const panel = el("section", { className: `aa-gallery-settings__source ${configured ? "is-configured" : authFields.length ? "needs-setup" : "is-public"}`, attrs: { role: "tabpanel", tabindex: "0" }, children: [
			el("header", { children: [el("div", { className: "aa-gallery-settings__source-identity", children: [el("span", { className: "aa-gallery-settings__source-mark", children: [icon(configured ? "statusCheck" : authFields.length ? "lock" : "statusIdle")] }), el("div", { children: [el("strong", null, cap.displayName), el("small", null, cap.source)] })] }), el("span", { className: "aa-gallery-settings__source-state", children: [el("i"), stateText] })] }),
			el("div", { className: "aa-gallery-settings__capabilities", children: (abilityLabels.length ? abilityLabels : [label("settings.publicOnly", "Public access")]).map((value) => el("span", null, value)) }),
			...(credentialFields.length ? [el("div", { className: "aa-gallery-settings__credentials", children: credentialFields })] : [el("p", { className: "aa-gallery-settings__public-note", text: label("settings.publicHint", "No account is required for this source.") })]),
			...((cap.ratings || []).length ? [field({ label: label("settings.defaultRating", "Default Rating"), control: ratingDefaults[cap.source] })] : []),
			el("div", { className: "aa-gallery-settings__actions", children: [test, status] }),
		] });
		const tab = button({ className: "aa-gallery-settings__source-tab", label: cap.displayName, iconName: configured ? "statusCheck" : authFields.length ? "lock" : "statusIdle", variant: "ghost", size: "sm" });
		const sourceId = cap.source.replace(/[^a-z0-9_-]/gi, "-"); tab.id = `aa-gallery-source-tab-${sourceId}`; panel.id = `aa-gallery-source-panel-${sourceId}`;
		tab.dataset.source = cap.source; tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", panel.id); panel.setAttribute("aria-labelledby", tab.id); tab.append(el("span", { className: "aa-gallery-settings__source-tab-state", text: stateText }));
		return { cap, panel, tab, configured };
	});
	let dialog; const status = el("span", { className: "aa-ui-field__hint", attrs: { role: "status" } });
	const clear = button({ className: "aa-gallery-settings__clear-cache", label: label("settings.clearCache", "Clear Gallery cache"), iconName: "delete", variant: "ghost", onClick: async () => { clear.disabled = true; try { await jsonRequest(`${API}/cache/clear`, { method: "POST" }); status.textContent = label("settings.cacheCleared", "Gallery cache cleared."); } catch (error) { status.textContent = error.message; } finally { clear.disabled = false; } } });
	const blacklistCard = el("section", { className: "aa-gallery-settings__blacklist-card", children: [
		el("header", { children: [el("span", { className: "aa-gallery-settings__blacklist-icon", children: [icon("lock")] }), el("strong", null, label("settings.blacklist", "Content blacklist")), blacklistCount] }),
		blacklist,
		el("footer", { children: [el("span", null, label("settings.blacklistScope", "Search · Rankings · Favorites")), el("small", null, label("settings.blacklistHint", "One exact site tag per line. This hides posts; it does not change generated prompts."))] }),
	] });
	const browsePanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "browse" }, children: [settingsSectionHeader("filter", label("settings.browseTitle", "Browsing defaults")), el("div", { className: "aa-gallery-settings__form-grid", children: [field({ label: label("settings.defaultSource", "Default source"), control: defaultSource }), el("div", { className: "aa-gallery-settings__toggle-card", children: [el("strong", null, label("settings.tooltip", "Show hover details")), tooltip] })] }), blacklistCard] });
	const promptPanel = el("section", { className: "aa-gallery-settings__page", attrs: { "data-page": "prompt" }, children: [settingsSectionHeader("tag", label("settings.promptTitle", "Prompt defaults")), field({ label: label("prompt.categories", "Categories"), control: defaultCategories }), el("div", { className: "aa-gallery-settings__switches", children: [el("label", { className: "aa-gallery-check-row", children: [defaultUnderscores, el("span", null, label("prompt.underscores", "Replace underscores with spaces"))] }), el("label", { className: "aa-gallery-check-row", children: [defaultParentheses, el("span", null, label("prompt.parentheses", "Escape parentheses"))] })] }), field({ label: label("settings.excluded", "Default excluded prompt tags"), hint: label("prompt.excludeHint", "Exact tag matches, separated by commas or lines"), control: excluded })] });
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
	const pages = { accounts: accountsPanel, browse: browsePanel, prompt: promptPanel, performance: performancePanel };
	const navItems = [
		{ value: "accounts", label: label("settings.navAccounts", "Accounts"), iconName: "lock" }, { value: "browse", label: label("settings.navBrowse", "Browsing"), iconName: "filter" },
		{ value: "prompt", label: label("settings.navPrompt", "Prompt"), iconName: "tag" }, { value: "performance", label: label("settings.navPerformance", "Storage"), iconName: "storage" },
	];
	const navButtons = new Map();
	const setPage = (value) => {
		for (const [name, panel] of Object.entries(pages)) { const active = name === value; panel.hidden = !active; panel.classList.toggle("is-active", active); }
		for (const [name, control] of navButtons) { const active = name === value; control.classList.toggle("is-active", active); control.setAttribute("aria-current", active ? "page" : "false"); }
	};
	const nav = el("nav", { className: "aa-gallery-settings__nav", attrs: { "aria-label": label("settings.navigation", "Settings sections") } });
	for (const item of navItems) { const control = button({ className: "aa-gallery-settings__nav-item", label: item.label, iconName: item.iconName, variant: "ghost", size: "sm", onClick: () => setPage(item.value) }); navButtons.set(item.value, control); nav.append(control); }
	browsePanel.hidden = true; promptPanel.hidden = true; performancePanel.hidden = true;
	const configuredCount = capabilities.filter(sourceIsConfigured).length;
	nav.append(el("div", { className: "aa-gallery-settings__nav-summary", children: [el("strong", null, label("settings.accountCount", "{count} accounts ready").replace("{count}", String(configuredCount)))] }));
	setPage("accounts");
	const body = el("div", { className: "aa-gallery-settings", children: [nav, el("div", { className: "aa-gallery-settings__pages", children: [accountsPanel, browsePanel, promptPanel, performancePanel] })] });
	const save = button({ label: label("settings.save", "Save"), variant: "primary", onClick: async () => { save.disabled = true; try { const previousBlacklist = JSON.stringify(settings.blacklist || []); settings = await jsonRequest(`${API}/settings/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultSource: defaultSource.value, defaultRatings: Object.fromEntries(Object.entries(ratingDefaults).map(([sourceName, control]) => [sourceName, control.values()])), blacklist: tagLines(blacklist.value), promptDefaults: { categories: defaultCategories.values(), replaceUnderscores: defaultUnderscores.getAttribute("aria-checked") === "true", escapeParentheses: defaultParentheses.getAttribute("aria-checked") === "true", excludedTags: excluded.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) }, tooltip: tooltip.getAttribute("aria-checked") === "true", timeout: Number(timeout.value), cacheBudgetMiB: Number(budget.value), credentials: Object.fromEntries(Object.entries(sourceInputs).map(([sourceName, fields]) => [sourceName, Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]))])), clearCredentials: Object.fromEntries(Object.entries(sourceClears).map(([sourceName, values]) => [sourceName, [...values]])) }) }); dialog.close(); if (previousBlacklist !== JSON.stringify(settings.blacklist || [])) { for (const galleryNode of app.graph?._nodes || []) { if (isGallery(galleryNode)) void galleryNode._aaGalleryController?.search({ reset: true, page: 1 }); } } } catch (error) { status.textContent = error.message; save.disabled = false; } } });
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
	app.graphToPrompt = async function (...args) { const result = await original(...args); const output = result?.output ?? result; for (const node of app.graph?._nodes || []) { if (!isGallery(node)) continue; const promptNode = output?.[String(node.id)]; if (!promptNode) continue; promptNode.inputs ||= {}; promptNode.inputs.gallery_payload = JSON.stringify(galleryPayload(stateFor(node))); } return result; };
}

function hookPrototype(nodeType) { if (!nodeType || nodeType.__aaaliceBooruGallery) return; nodeType.__aaaliceBooruGallery = true; const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); setupNodeSafely(this, { initializeSize: true }); return result; }; }

app.registerExtension({
	name: "ComfyUI.Aaalice.BooruGallery",
	async init() { await ensureI18nReady(); await loadSetup(); registerSettings(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isGallery(node)) setupNodeSafely(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isGallery(node)) setupNodeSafely(node); },
	setup() { installPromptHook(); for (const node of app.graph?._nodes || []) if (isGallery(node)) setupNodeSafely(node); },
});
