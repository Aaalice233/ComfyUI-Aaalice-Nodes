/** Native-shaped image field: asset browser on the left, local upload on the right. */

import { api } from "../../../scripts/api.js";
import { loadImageAssets } from "./image_assets.js";
import { bindAsyncImagePreview, closeImagePreview, closeImagePreviewWithin } from "./image_preview.js";
import { imageAssetKey } from "./image_asset_model.js";
import { imageReferenceThumbnailPath, imageReferenceViewPath, normalizeImageReference } from "./image_reference.js";
import { bindImageDropTarget, uploadImageFile } from "./image_upload.js";
import { createAnchoredPopover, el, emptyState, icon, iconButton, segmentedControl } from "./ui.js";
import { mountVirtualGrid } from "./virtual_grid.js";

const imageSourceState = new WeakMap();

function releaseImageSource(image) {
	const state = imageSourceState.get(image);
	state?.controller?.abort();
	if (state?.objectUrl) URL.revokeObjectURL(state.objectUrl);
	imageSourceState.delete(image);
	image.removeAttribute("src");
}

async function resolveImagePreviewSource(reference, { signal = null } = {}) {
	const normalized = normalizeImageReference(reference);
	if (!normalized) return null;
	const route = imageReferenceViewPath(normalized);
	if (!normalized.filename.startsWith("blake3:")) return { source: api.apiURL(route) };
	const response = await api.fetchApi(route, { signal });
	if (!response.ok) throw new Error(`Image request failed (${response.status})`);
	const objectUrl = URL.createObjectURL(await response.blob());
	if (signal?.aborted) {
		URL.revokeObjectURL(objectUrl);
		const error = new Error("Image request aborted");
		error.name = "AbortError";
		throw error;
	}
	let active = true;
	return {
		source: objectUrl,
		release: () => {
			if (!active) return;
			active = false;
			URL.revokeObjectURL(objectUrl);
		},
	};
}

function assignImageSource(image, reference, { thumbnail = false, onError = null } = {}) {
	releaseImageSource(image);
	const normalized = normalizeImageReference(reference);
	if (!normalized) return;
	const route = thumbnail ? imageReferenceThumbnailPath(normalized) : imageReferenceViewPath(normalized);
	if (!normalized.filename.startsWith("blake3:")) {
		image.src = api.apiURL(route);
		return;
	}
	const controller = new AbortController();
	const state = { controller, objectUrl: null };
	imageSourceState.set(image, state);
	void api.fetchApi(route, { signal: controller.signal }).then(async (response) => {
		if (!response.ok) throw new Error(`Image request failed (${response.status})`);
		const objectUrl = URL.createObjectURL(await response.blob());
		if (controller.signal.aborted || imageSourceState.get(image) !== state || !image.isConnected) {
			URL.revokeObjectURL(objectUrl);
			return;
		}
		state.controller = null;
		state.objectUrl = objectUrl;
		const releaseObjectUrl = () => {
			if (imageSourceState.get(image)?.objectUrl !== objectUrl) return;
			URL.revokeObjectURL(objectUrl);
			state.objectUrl = null;
		};
		image.addEventListener("load", releaseObjectUrl, { once: true });
		image.addEventListener("error", releaseObjectUrl, { once: true });
		image.src = objectUrl;
	}).catch((error) => {
		if (error?.name !== "AbortError" && imageSourceState.get(image) === state) onError?.(error);
	});
}

function createAssetBrowser({ anchor, ariaLabel, labels, values, current, defaultType, onSelect, onClose }) {
	let virtualGrid = null;
	let scrollIdle = 0;
	const popover = createAnchoredPopover({
		anchor,
		ariaLabel,
		className: "aa-image-assets",
		width: 420,
		focusOnOpen: false,
		onClose: () => {
			clearTimeout(scrollIdle);
			virtualGrid?.destroy();
			virtualGrid = null;
			onClose?.();
		},
	});
	let assets = [];
	let tab = "all";
	let query = "";
	let view = "grid";
	let sortMode = "default";
	const tabs = segmentedControl({
		value: tab,
		ariaLabel: labels.filter || ariaLabel,
		className: "aa-image-assets__tabs",
		options: [
			{ value: "all", label: labels.all || "All" },
			{ value: "inputs", label: labels.imported || "Imported" },
			{ value: "outputs", label: labels.generated || "Generated" },
		],
		onChange: (next) => { tab = next; renderResults(); },
	});
	const search = el("label", { className: "aa-image-assets__search", children: [
		icon("search"),
		el("input", { attrs: { type: "search", placeholder: labels.search || "Search images", "aria-label": labels.search || "Search images" } }),
	] });
	const searchInput = search.querySelector("input");
	const sort = iconButton({
		iconName: "arrowUpDown",
		label: labels.sort || "Sort images",
		variant: "ghost",
		className: "aa-image-assets__tool aa-image-assets__sort-trigger",
	});
	sort.setAttribute("aria-haspopup", "menu");
	sort.setAttribute("aria-expanded", "false");
	const listView = iconButton({ iconName: "list", label: labels.list || "List view", variant: "ghost", className: "aa-image-assets__view-option" });
	const gridView = iconButton({ iconName: "layoutGrid", label: labels.grid || "Grid view", variant: "ghost", className: "aa-image-assets__view-option" });
	const viewSwitch = el("div", { className: "aa-image-assets__view-switch", attrs: { role: "group", "aria-label": labels.view || "Image view" }, children: [listView, gridView] });
	const sortMenu = el("div", { className: "aa-image-assets__sort-menu", attrs: { role: "menu", "aria-label": labels.sort || "Sort images", hidden: true } });
	const results = el("div", { className: "aa-image-assets__results is-grid", attrs: { role: "listbox", "aria-label": ariaLabel } });
	const status = el("div", { className: "aa-image-assets__status", text: labels.loading || "Loading images…", attrs: { role: "status", "aria-live": "polite" } });
	let scrolling = false;
	const thumbnailReferences = new WeakMap();
	const loadThumbnail = (image) => {
		const reference = thumbnailReferences.get(image);
		if (!reference || !image.dataset.src) return;
		delete image.dataset.src;
		assignImageSource(image, reference, {
			thumbnail: true,
			onError: () => {
				image.classList.add("is-error");
				status.hidden = false;
				status.textContent = labels.loadFailed || "Some images could not be loaded.";
				status.classList.add("is-error");
			},
		});
	};
	const loadPendingThumbnails = () => {
		for (const image of results.querySelectorAll("img[data-src]")) loadThumbnail(image);
	};
	results.addEventListener("scroll", () => {
		scrolling = true;
		clearTimeout(scrollIdle);
		scrollIdle = setTimeout(() => {
			scrolling = false;
			loadPendingThumbnails();
		}, 120);
	}, { passive: true });

	function setSortMenuOpen(open) {
		sortMenu.hidden = !open;
		sort.setAttribute("aria-expanded", String(open));
		if (open) {
			sortMenu.style.left = `${sort.offsetLeft}px`;
			sortMenu.style.top = `${sort.offsetTop + sort.offsetHeight + 5}px`;
			sortMenu.querySelector(".is-selected")?.focus({ preventScroll: true });
		}
	}

	function syncSort() {
		const alphabetical = sortMode === "alphabetical";
		const currentLabel = alphabetical ? labels.sortAlphabetical || "A–Z" : labels.sortUnsorted || "Unsorted";
		sort.replaceChildren(icon(alphabetical ? "arrowDownAZ" : "arrowUpDown"));
		sort.setAttribute("aria-label", `${labels.sort || "Sort images"}: ${currentLabel}`);
		sort.title = `${labels.sort || "Sort images"}: ${currentLabel}`;
		for (const option of sortMenu.querySelectorAll(".aa-image-assets__sort-option")) {
			const selected = option.dataset.sort === sortMode;
			option.classList.toggle("is-selected", selected);
			option.setAttribute("aria-checked", String(selected));
			option.querySelector(".aa-image-assets__sort-check").hidden = !selected;
		}
	}

	function syncView() {
		for (const [button, value] of [[listView, "list"], [gridView, "grid"]]) {
			const selected = view === value;
			button.classList.toggle("is-selected", selected);
			button.setAttribute("aria-pressed", String(selected));
		}
	}

	const currentKey = imageAssetKey(current);
	const renderAsset = (asset) => {
		const selected = imageAssetKey(asset.reference) === currentKey;
		const thumbnail = document.createElement("img");
		thumbnail.dataset.src = "pending";
		thumbnailReferences.set(thumbnail, asset.reference);
		if (!scrolling) loadThumbnail(thumbnail);
		thumbnail.alt = "";
		thumbnail.loading = "lazy";
		thumbnail.decoding = "async";
		thumbnail.fetchPriority = "low";
		const option = el("button", {
			className: `aa-image-assets__item${selected ? " is-selected" : ""}`,
			attrs: { type: "button", role: "option", "aria-selected": String(selected), title: asset.label },
			children: [
				el("span", { className: "aa-image-assets__media", children: [thumbnail] }),
				el("span", "aa-image-assets__name", asset.label),
				el("span", `aa-image-assets__source is-${asset.source}`, asset.source === "inputs" ? labels.imported || "Imported" : labels.generated || "Generated"),
			],
		});
		option.addEventListener("click", () => { onSelect(asset.reference); popover.close(); });
		return option;
	};
	virtualGrid = mountVirtualGrid(results, {
		mode: view,
		renderItem: renderAsset,
		keyForItem: (asset) => imageAssetKey(asset.reference),
		disposeItem: (element) => {
			for (const image of element.querySelectorAll("img")) releaseImageSource(image);
		},
		empty: () => emptyState({ iconName: "image", description: labels.empty || "No images found", className: "aa-image-assets__empty" }),
		options: { gridMinWidth: 88, gridExtraHeight: 38, listHeight: 48, gap: 7, overscanRows: 2 },
	});

	function renderResults({ preserveScroll = false, revealCurrent = false } = {}) {
		const lowered = query.trim().toLocaleLowerCase();
		let visible = assets
			.filter((asset) => tab === "all" || asset.source === tab)
			.filter((asset) => !lowered || asset.label.toLocaleLowerCase().includes(lowered));
		if (sortMode === "alphabetical") visible = [...visible].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
		results.classList.toggle("is-grid", view === "grid");
		results.classList.toggle("is-list", view === "list");
		virtualGrid.setMode(view);
		virtualGrid.setItems(visible, { preserveScroll });
		if (revealCurrent && currentKey) virtualGrid.scrollToIndex(visible.findIndex((asset) => imageAssetKey(asset.reference) === currentKey));
	}

	searchInput.addEventListener("input", () => { query = searchInput.value; renderResults(); });
	for (const option of [
		{ value: "default", label: labels.sortUnsorted || "Unsorted" },
		{ value: "alphabetical", label: labels.sortAlphabetical || "A–Z" },
	]) {
		const check = el("span", { className: "aa-image-assets__sort-check", attrs: { "aria-hidden": "true" }, children: [icon("statusCheck")] });
		const button = el("button", {
			className: "aa-image-assets__sort-option",
			attrs: { type: "button", role: "menuitemradio", "aria-checked": "false" },
			children: [el("span", "aa-image-assets__sort-label", option.label), check],
		});
		button.dataset.sort = option.value;
		button.addEventListener("click", () => {
			sortMode = option.value;
			syncSort();
			setSortMenuOpen(false);
			renderResults();
			sort.focus({ preventScroll: true });
		});
		sortMenu.append(button);
	}
	sort.addEventListener("click", () => setSortMenuOpen(sortMenu.hidden));
	listView.addEventListener("click", () => { view = "list"; syncView(); renderResults({ preserveScroll: true }); });
	gridView.addEventListener("click", () => { view = "grid"; syncView(); renderResults({ preserveScroll: true }); });
	const toolbar = el("div", { className: "aa-image-assets__toolbar", children: [search, sort, viewSwitch] });
	popover.root.addEventListener("pointerdown", (event) => {
		if (!sortMenu.hidden && !sortMenu.contains(event.target) && !sort.contains(event.target)) setSortMenuOpen(false);
	});
	popover.root.append(tabs, toolbar, sortMenu, status, results);
	virtualGrid.refresh();
	syncSort();
	syncView();
	void loadImageAssets({ values, current, defaultType }).then(({ assets: loaded, errors }) => {
		if (!popover.root.isConnected) return;
		assets = loaded;
		status.hidden = !errors.length;
		status.textContent = errors.length ? labels.loadFailed || "Some images could not be loaded." : "";
		status.classList.toggle("is-error", Boolean(errors.length));
		renderResults({ revealCurrent: true });
		popover.reposition();
	}).catch((error) => {
		if (!popover.root.isConnected) return;
		status.textContent = `${labels.loadFailed || "Images could not be loaded."} ${error.message}`;
		status.classList.add("is-error");
		assets = [];
		renderResults();
		popover.reposition();
	});
	return popover;
}

export function createImageAssetControl({
	reference: value = null,
	values = [],
	defaultType = "input",
	uploadType = "input",
	uploadSubfolder = "",
	label,
	labels = {},
	onChange = null,
	onUploaded = null,
	onError = null,
} = {}) {
	let reference = normalizeImageReference(value);
	let popover = null;
	let uploading = false;
	const root = el("div", "aa-image-asset-control");
	const picker = el("input", { attrs: { type: "file", accept: "image/*", hidden: true } });
	const thumbnail = document.createElement("img");
	thumbnail.className = "aa-image-asset-control__thumb";
	thumbnail.alt = "";
	thumbnail.loading = "lazy";
	thumbnail.decoding = "async";
	thumbnail.fetchPriority = "low";
	const name = el("span", "aa-image-asset-control__name");
	const select = el("button", {
		className: "aa-image-asset-control__select",
		attrs: { type: "button", "aria-label": label, "aria-haspopup": "dialog", "aria-expanded": "false" },
		children: [thumbnail, name, icon("moveDown", { className: "aa-image-asset-control__arrow" })],
	});
	const upload = iconButton({
		iconName: "folderSearch",
		label: labels.upload || "Upload from device",
		variant: "ghost",
		className: "aa-image-asset-control__upload",
		onClick: () => picker.click(),
	});
	const clear = iconButton({
		iconName: "delete",
		label: labels.clear || "Clear selected image",
		variant: "ghost",
		className: "aa-image-asset-control__clear",
		onClick: (event) => {
			event.stopPropagation();
			closeImagePreview();
			popover?.close();
			sync(null);
			onChange?.(null, { source: "clear" });
		},
	});
	const viewSource = async ({ signal } = {}) => {
		const current = reference;
		if (!current) return null;
		const preview = await resolveImagePreviewSource(current, { signal });
		if (imageAssetKey(current) !== imageAssetKey(reference)) {
			preview?.release?.();
			return null;
		}
		return { ...preview, title: `${label} · ${current.filename}` };
	};
	const sync = (next) => {
		const nextReference = normalizeImageReference(next);
		if (imageAssetKey(nextReference) !== imageAssetKey(reference)) closeImagePreviewWithin(root);
		reference = nextReference;
		name.textContent = reference?.filename || labels.none || "Choose image";
		select.classList.toggle("has-image", Boolean(reference));
		clear.hidden = !reference;
		if (reference) assignImageSource(thumbnail, reference, { thumbnail: true, onError });
		else releaseImageSource(thumbnail);
	};
	const setUploading = (next) => {
		uploading = next;
		select.disabled = next;
		upload.disabled = next;
		clear.disabled = next;
		root.classList.toggle("is-uploading", next);
		if (next) root.setAttribute("aria-busy", "true"); else root.removeAttribute("aria-busy");
	};
	const uploadFile = async (file) => {
		if (uploading) return;
		setUploading(true);
		closeImagePreview();
		try {
			const next = await uploadImageFile(file, { type: uploadType, subfolder: uploadSubfolder });
			popover?.close();
			sync(next);
			onChange?.(next, { source: "upload" });
			onUploaded?.(next);
		} catch (error) {
			onError?.(error);
		} finally {
			setUploading(false);
			picker.value = "";
		}
	};
	const openBrowser = () => {
		if (popover || uploading) return;
		closeImagePreview();
		select.setAttribute("aria-expanded", "true");
		popover = createAssetBrowser({
			anchor: select,
			ariaLabel: label,
			labels,
			values,
			current: reference,
			defaultType,
			onSelect: (next) => { sync(next); onChange?.(next, { source: "asset" }); },
			onClose: () => { popover = null; select.setAttribute("aria-expanded", "false"); },
		});
	};
	sync(reference);
	const unbindPreview = bindAsyncImagePreview(select, viewSource, { delay: 0 });
	select.addEventListener("click", openBrowser);
	picker.addEventListener("change", () => { const file = picker.files?.[0]; if (file) void uploadFile(file); });
	bindImageDropTarget(root, {
		onActive: (active) => {
			if (active) closeImagePreview();
			select.classList.toggle("is-drop-target", active);
			name.textContent = active ? labels.drop || "Drop image here" : reference?.filename || labels.none || "Choose image";
		},
		onFile: (file) => { void uploadFile(file); },
	});
	root.append(select, clear, upload, picker);
	return {
		root,
		update(next) { sync(next?.reference ?? next); },
		destroy() { popover?.close(); unbindPreview(); closeImagePreviewWithin(root); releaseImageSource(thumbnail); },
	};
}
