/** Native-shaped image field: asset browser on the left, local upload on the right. */

import { api } from "../../../scripts/api.js";
import { loadImageAssets } from "./image_assets.js";
import { bindImagePreview, closeImagePreview } from "./image_preview.js";
import { imageAssetKey } from "./image_asset_model.js";
import { imageReferenceViewPath, normalizeImageReference } from "./image_reference.js";
import { bindImageDropTarget, uploadImageFile } from "./image_upload.js";
import { createAnchoredPopover, el, emptyState, icon, iconButton, segmentedControl } from "./ui.js";

function assetSource(reference) {
	const path = imageReferenceViewPath(reference);
	return path ? api.apiURL(path) : "";
}

function createAssetBrowser({ anchor, ariaLabel, labels, values, current, defaultType, onSelect, onClose }) {
	const popover = createAnchoredPopover({
		anchor,
		ariaLabel,
		className: "aa-image-assets",
		width: 420,
		focusOnOpen: false,
		onClose,
	});
	let assets = [];
	let tab = "all";
	let query = "";
	let view = "grid";
	let ascending = false;
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
	const sort = iconButton({ iconName: "arrowUpDown", label: labels.sort || "Change sort order", variant: "ghost", className: "aa-image-assets__tool" });
	const viewToggle = iconButton({ iconName: "list", label: labels.list || "List view", variant: "ghost", className: "aa-image-assets__tool" });
	const results = el("div", { className: "aa-image-assets__results is-grid", attrs: { role: "listbox", "aria-label": ariaLabel } });
	const status = el("div", { className: "aa-image-assets__status", text: labels.loading || "Loading images…", attrs: { role: "status", "aria-live": "polite" } });

	function renderResults() {
		const lowered = query.trim().toLocaleLowerCase();
		const visible = assets
			.filter((asset) => tab === "all" || asset.source === tab)
			.filter((asset) => !lowered || asset.label.toLocaleLowerCase().includes(lowered))
			.sort((left, right) => (ascending ? 1 : -1) * left.label.localeCompare(right.label, undefined, { numeric: true }));
		results.classList.toggle("is-grid", view === "grid");
		results.classList.toggle("is-list", view === "list");
		results.replaceChildren();
		if (!visible.length) {
			results.append(emptyState({ iconName: "image", description: labels.empty || "No images found", className: "aa-image-assets__empty" }));
			return;
		}
		for (const asset of visible) {
			const selected = imageAssetKey(asset.reference) === imageAssetKey(current);
			const thumbnail = document.createElement("img");
			thumbnail.src = assetSource(asset.reference);
			thumbnail.alt = "";
			thumbnail.loading = "lazy";
			thumbnail.decoding = "async";
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
			results.append(option);
		}
	}

	searchInput.addEventListener("input", () => { query = searchInput.value; renderResults(); });
	sort.addEventListener("click", () => { ascending = !ascending; sort.classList.toggle("is-active", ascending); renderResults(); });
	viewToggle.addEventListener("click", () => {
		view = view === "grid" ? "list" : "grid";
		viewToggle.replaceChildren(icon(view === "grid" ? "list" : "layoutGrid"));
		viewToggle.setAttribute("aria-label", view === "grid" ? labels.list : labels.grid);
		viewToggle.title = view === "grid" ? labels.list : labels.grid;
		renderResults();
	});
	const toolbar = el("div", { className: "aa-image-assets__toolbar", children: [search, sort, viewToggle] });
	popover.root.append(tabs, toolbar, status, results);
	void loadImageAssets({ values, current, defaultType }).then(({ assets: loaded, errors }) => {
		if (!popover.root.isConnected) return;
		assets = loaded;
		status.hidden = !errors.length;
		status.textContent = errors.length ? labels.loadFailed || "Some images could not be loaded." : "";
		status.classList.toggle("is-error", Boolean(errors.length));
		renderResults();
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
	const viewSource = () => reference ? { source: assetSource(reference), title: `${label} · ${reference.filename}` } : null;
	const sync = (next) => {
		reference = normalizeImageReference(next);
		name.textContent = reference?.filename || labels.none || "Choose image";
		select.classList.toggle("has-image", Boolean(reference));
		clear.hidden = !reference;
		if (reference) thumbnail.src = assetSource(reference);
		else thumbnail.removeAttribute("src");
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
	bindImagePreview(select, "", "", { immediate: true, resolve: viewSource });
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
		destroy() { popover?.close(); closeImagePreview(); },
	};
}
