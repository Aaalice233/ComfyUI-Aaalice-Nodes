import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { t } from "../i18n.js";
import { promptLibraryStore } from "../lib/library_store.js";
import { createSelectableImagePreview } from "../lib/image_preview.js";
import { bindPromptEntryDetails } from "../lib/prompt_entry_details.js";
import { applyCategoryColor, categorySelectOption, nativeCategoryOption } from "../lib/category_color.js";
import { collectionDisplayName, isDefaultCollection } from "../lib/collection.js";
import { badge, button, closeTooltipWithin, createDialog, el, emptyState, field, icon, iconButton, listboxControl, multiSelectControl, segmentedControl, selectControl } from "../lib/ui.js";
import { mountVirtualList } from "../lib/virtual_list.js";
import { copyEntryPromptText, flashCopied } from "../lib/prompt_copy.js";
import { createCollapsibleSearch, createListRow, createTransferHero, createTransferResult, createTransferSection, createTransferStats, createWorkspaceToolbar, formatFileSize } from "../lib/workspace_components.js";
import { confirmAction, downloadUrl, pickFile, setActionBusy, setDialogFooter } from "./dom_utils.js";

let runtime = null;

export function configureLibraryWorkspace(dependencies) { runtime = dependencies; }

function defaultFavoritesLabel() { return t("aaalice.workspace.libraryUi.defaultFavorites", "Default favorites"); }
function favoriteFolderName(collection) { return collectionDisplayName(collection, defaultFavoritesLabel()); }

function transferEntryList(entries, { invalid = false } = {}) {
	return el("div", { className: "aa-transfer-entry-list", children: entries.map((item) => {
		const entry = invalid ? item.entry || {} : item;
		return el("div", { className: "aa-transfer-entry-row", children: [
			el("div", { children: [el("strong", null, entry.title || entry.id || t("aaalice.workspace.transfer.untitled", "Untitled entry")), el("small", null, invalid ? item.reason : entry.text || "")] }),
			...(invalid ? [badge(t("aaalice.workspace.libraryUi.invalid", "Invalid"), { className: "is-danger" })] : []),
		] });
	}) });
}

function libraryEntriesForScope(scope, { selected, categoryId, collectionId }) {
	if (scope === "selected") return promptLibraryStore.filterEntries({ entryIds: selected });
	if (scope === "filtered") return promptLibraryStore.filterEntries({ categoryId, collectionId });
	return promptLibraryStore.snapshot.entries;
}

function libraryExportPayload(scope, { selected, categoryId, collectionId }) {
	if (scope === "selected") return { entryIds: [...selected] };
	if (scope === "filtered") return { ...(categoryId ? { categoryId } : {}), ...(collectionId ? { collectionId } : {}) };
	return {};
}

export function openLibraryEntryEditor(entry = null) {
	const title = document.createElement("input"); title.value = entry?.title || "";
	const text = document.createElement("textarea"); text.value = entry?.text || "";
	const note = document.createElement("textarea"); note.value = entry?.note || "";
	const category = listboxControl({
		ariaLabel: t("aaalice.workspace.libraryUi.category", "Category"),
		value: entry?.categoryId || "",
		options: [
			{ label: t("aaalice.workspace.libraryUi.noCategory", "No category"), value: "" },
			...promptLibraryStore.snapshot.categories.map(categorySelectOption),
		],
	});
	const collections = multiSelectControl({
		ariaLabel: t("aaalice.workspace.libraryUi.collections", "Favorite folders"),
		values: (entry?.collections || []).map((membership) => membership.collectionId),
		options: promptLibraryStore.snapshot.collections.map((item) => ({ label: favoriteFolderName(item), value: item.id })),
	});
	const tags = document.createElement("input"); tags.value = promptLibraryStore.tagNames(entry?.tagIds || []).join(", ");
	const preview = document.createElement("input"); preview.type = "file"; preview.accept = "image/png,image/jpeg,image/gif,image/webp"; preview.setAttribute("aria-label", t("aaalice.workspace.libraryUi.choosePreview", "Choose preview image"));
	const previewMedia = el("div", "aa-library-entry-preview-media");
	const previewFileName = el("span", "aa-library-entry-preview-name");
	const previewAction = el("div", "aa-library-entry-preview-action");
	const previewFooter = el("div", { className: "aa-library-entry-preview-footer", children: [previewFileName, previewAction] });
	const previewPicker = el("label", { className: "aa-library-entry-preview-picker", children: [
		preview,
		previewMedia,
		el("span", { className: "aa-library-entry-preview-overlay", children: [icon("upload"), el("strong", null, t("aaalice.workspace.libraryUi.choosePreview", "Choose preview image"))] }),
	] });
	const existingPreviewUrl = entry?.previewHash ? api.apiURL(`/aaalice/prompt-library/assets/${entry.previewHash}`) : "";
	let selectedPreviewUrl = "";
	let removePreviewRequested = false;
	const releaseSelectedPreview = () => {
		if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
		selectedPreviewUrl = "";
	};
	const renderPreview = () => {
		const file = preview.files?.[0];
		const imageUrl = selectedPreviewUrl || (!removePreviewRequested ? existingPreviewUrl : "");
		previewMedia.replaceChildren();
		if (imageUrl) {
			const image = document.createElement("img"); image.src = imageUrl; image.alt = title.value || entry?.title || ""; previewMedia.append(image);
		} else {
			previewMedia.append(el("span", { className: "aa-library-entry-preview-empty", children: [icon("note"), el("span", null, t("aaalice.workspace.libraryUi.previewEmptyHint", "Click to choose a preview image"))] }));
		}
		previewPicker.classList.toggle("has-image", Boolean(imageUrl));
		previewFileName.textContent = file?.name || (imageUrl ? t("aaalice.workspace.libraryUi.currentPreview", "Current preview image") : "");
		previewAction.replaceChildren();
		if (file) {
			previewAction.append(button({ label: t("aaalice.workspace.libraryUi.clearPreviewSelection", "Clear selected image"), iconName: "delete", variant: "ghost", size: "sm", className: "aa-library-entry-preview-remove", onClick: () => { preview.value = ""; releaseSelectedPreview(); renderPreview(); } }));
		} else if (existingPreviewUrl) {
			previewAction.append(button({
				label: removePreviewRequested ? t("aaalice.workspace.libraryUi.undoRemovePreview", "Keep current image") : t("aaalice.workspace.libraryUi.removePreview", "Remove current preview"),
				iconName: removePreviewRequested ? "refresh" : "delete", variant: "ghost", size: "sm", className: `aa-library-entry-preview-remove${removePreviewRequested ? " is-undo" : ""}`,
				onClick: () => { removePreviewRequested = !removePreviewRequested; renderPreview(); },
			}));
		}
		previewFooter.hidden = !(file || existingPreviewUrl);
	};
	preview.addEventListener("change", () => {
		releaseSelectedPreview();
		const file = preview.files?.[0];
		if (file) { selectedPreviewUrl = URL.createObjectURL(file); removePreviewRequested = false; }
		renderPreview();
	});
	renderPreview();
	const contentSection = el("section", { className: "aa-library-entry-section is-content", children: [
		el("h3", null, t("aaalice.workspace.libraryUi.contentDetails", "Prompt content")),
		field({ label: t("aaalice.workspace.libraryUi.title", "Title"), control: title }),
		field({ label: t("aaalice.workspace.libraryUi.prompt", "Prompt"), control: text, className: "aa-library-entry-prompt-field" }),
	] });
	const organizeSection = el("section", { className: "aa-library-entry-section is-organize", children: [
		el("h3", null, t("aaalice.workspace.libraryUi.organization", "Organization")),
		el("div", { className: "aa-library-entry-organize-grid", children: [
			field({ label: t("aaalice.workspace.libraryUi.category", "Category"), control: category }),
			field({ label: t("aaalice.workspace.libraryUi.tags", "Tags"), control: tags }),
		] }),
		field({ label: t("aaalice.workspace.libraryUi.collections", "Favorite folders"), control: collections, className: "aa-library-entry-favorites-field" }),
		field({ label: t("aaalice.workspace.libraryUi.note", "Note"), control: note, className: "aa-library-entry-note-field" }),
	] });
	const previewSection = el("section", { className: "aa-library-entry-section is-preview", children: [
		el("h3", null, t("aaalice.workspace.libraryUi.preview", "Preview image")),
		el("div", { className: "aa-library-entry-preview-card", children: [previewPicker, previewFooter] }),
	] });
	const body = el("div", { className: "aa-library-entry-form", children: [contentSection, el("div", { className: "aa-library-entry-lower", children: [organizeSection, previewSection] })] });
	const footer = el("div"); const dialog = createDialog({
		title: entry ? t("aaalice.workspace.libraryUi.editEntry", "Edit prompt entry") : t("aaalice.workspace.libraryUi.addEntry", "Add prompt entry"),
		body, footer, size: "md", className: "aa-library-entry-dialog", onRequestClose: () => { releaseSelectedPreview(); return true; },
	});
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => { releaseSelectedPreview(); dialog.close(); } }), button({ label: t("aaalice.common.save", "Save"), iconName: "statusCheck", onClick: async () => {
		const data = { title: title.value.trim(), text: text.value, note: note.value, categoryId: category.value || null, collectionIds: collections.values(), tags: tags.value.split(",").map((item) => item.trim()).filter(Boolean) };
		try {
			const saved = entry ? await promptLibraryStore.updateEntry(entry.id, data) : await promptLibraryStore.createEntry(data);
			if (removePreviewRequested && !preview.files?.[0]) await promptLibraryStore.deletePreview(saved.id);
			if (preview.files?.[0]) await promptLibraryStore.uploadPreview(saved.id, preview.files[0]);
			releaseSelectedPreview(); dialog.close();
		} catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message }); }
	} }));
}

function openTaxonomyManager() {
	let kind = "categories"; let editingId = null; let dialog;
	const list = el("div", "aa-taxonomy-list");
	const summary = el("div", "aa-taxonomy-summary");
	const addInput = document.createElement("input"); addInput.type = "text";
	const addButton = button({ label: t("aaalice.workspace.libraryUi.add", "Add"), iconName: "add", onClick: () => addItem() });
	const tabs = segmentedControl({
		value: kind, ariaLabel: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), className: "aa-taxonomy-tabs",
		options: [
			{ value: "categories", label: t("aaalice.workspace.libraryUi.categories", "Categories"), iconName: "layout" },
			{ value: "collections", label: t("aaalice.workspace.libraryUi.collections", "Favorite folders"), iconName: "favorite" },
		],
		onChange: (value) => { kind = value; editingId = null; draw(); },
	});
	const showError = (error) => app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), detail: error.message });
	const usageCount = (item) => promptLibraryStore.usage(kind, item.id);
	const reorder = async (items, index, offset) => {
		const target = index + offset; if (target < 0 || target >= items.length) return;
		const ids = items.map((item) => item.id); [ids[index], ids[target]] = [ids[target], ids[index]];
		try { await promptLibraryStore.reorder({ kind, orderedIds: ids }); draw(); } catch (error) { showError(error); }
	};
	const saveItem = async (item, input, colorInput = null, isCategory = false) => {
		const name = input.value.trim(); if (!name) return;
		try {
			if (isCategory) await promptLibraryStore.updateCategory(item.id, { name, color: colorInput.value }); else await promptLibraryStore.updateCollection(item.id, { name });
			editingId = null; draw();
		} catch (error) { showError(error); }
	};
	const remove = async (item, isCategory) => {
		const title = isCategory ? t("aaalice.workspace.libraryUi.deleteCategoryTitle", "Delete category") : t("aaalice.workspace.libraryUi.deleteCollectionTitle", "Delete favorite folder");
		const consequence = isCategory ? t("aaalice.workspace.libraryUi.deleteCategoryHint", "Entries in this category will become uncategorized. This cannot be undone.") : t("aaalice.workspace.libraryUi.deleteCollectionHint", "This favorite membership will be removed from its entries. This cannot be undone.");
		if (!await confirmAction(`${isCategory ? item.name : favoriteFolderName(item)}\n\n${consequence}`, { title, confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
		try {
			if (isCategory) await promptLibraryStore.deleteCategory(item.id); else await promptLibraryStore.deleteCollection(item.id);
			draw();
		} catch (error) { showError(error); }
	};
	const draw = () => {
		const isCategory = kind === "categories"; const items = promptLibraryStore.snapshot[kind];
		const noun = isCategory ? t("aaalice.workspace.libraryUi.categories", "Categories") : t("aaalice.workspace.libraryUi.collections", "Favorite folders");
		const hint = isCategory ? t("aaalice.workspace.libraryUi.categoriesHint", "Each entry belongs to one category for its primary organization.") : t("aaalice.workspace.libraryUi.collectionsHint", "Favorite folders group entries across categories for flexible reuse.");
		summary.replaceChildren(el("div", { children: [el("strong", null, noun), el("p", null, hint)] }), badge(String(items.length), { className: "aa-taxonomy-count" }));
		addInput.placeholder = isCategory ? t("aaalice.workspace.libraryUi.newCategory", "New category name") : t("aaalice.workspace.libraryUi.newCollection", "New favorite-folder name");
		addInput.setAttribute("aria-label", addInput.placeholder);
		list.replaceChildren();
		if (!items.length) list.append(emptyState({ iconName: isCategory ? "layout" : "favorite", className: "aa-taxonomy-empty", title: isCategory ? t("aaalice.workspace.libraryUi.noCategories", "No categories yet") : t("aaalice.workspace.libraryUi.noCollections", "No favorite folders yet"), description: t("aaalice.workspace.libraryUi.taxonomyEmptyHint", "Create one below to start organizing your prompt entries.") }));
		items.forEach((item, index) => {
			if (editingId === item.id) {
				const input = document.createElement("input"); input.type = "text"; input.value = item.name; input.setAttribute("aria-label", t("aaalice.workspace.libraryUi.name", "Name"));
				const colorInput = isCategory ? document.createElement("input") : null;
				if (colorInput) { colorInput.type = "color"; colorInput.value = item.color || "#7C3AED"; colorInput.setAttribute("aria-label", t("aaalice.workspace.libraryUi.categoryColor", "Category color")); }
				const row = el("div", { className: `aa-taxonomy-row is-editing${isCategory ? " is-category" : ""}`, children: [input, ...(colorInput ? [colorInput] : []), el("div", { className: "aa-taxonomy-row-actions", children: [
					button({ label: t("aaalice.common.save", "Save"), iconName: "statusCheck", size: "sm", className: "aa-taxonomy-save-action", onClick: () => saveItem(item, input, colorInput, isCategory) }),
					iconButton({ iconName: "close", label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => { editingId = null; draw(); } }),
				] })] });
				input.addEventListener("keydown", (event) => { if (event.key === "Enter") saveItem(item, input, colorInput, isCategory); else if (event.key === "Escape") { editingId = null; draw(); } });
				list.append(row); queueMicrotask(() => { input.focus(); input.select(); }); return;
			}
			const defaultFavorite = !isCategory && isDefaultCollection(item);
			const actions = el("div", { className: "aa-taxonomy-row-actions", children: [
				iconButton({ iconName: "moveDown", label: t("aaalice.workspace.libraryUi.moveUp", "Move up"), className: "aa-taxonomy-move-up", variant: "ghost", disabled: index === 0, onClick: () => reorder(items, index, -1) }),
				iconButton({ iconName: "moveDown", label: t("aaalice.workspace.libraryUi.moveDown", "Move down"), variant: "ghost", disabled: index === items.length - 1, onClick: () => reorder(items, index, 1) }),
				button({ label: isCategory ? t("aaalice.workspace.libraryUi.editCategory", "Edit category") : t("aaalice.workspace.libraryUi.rename", "Rename"), iconName: "settings", size: "sm", className: "aa-taxonomy-edit-action", variant: "ghost", onClick: () => { editingId = item.id; draw(); } }),
				iconButton({ iconName: "delete", label: defaultFavorite ? t("aaalice.workspace.libraryUi.defaultFavoriteCannotDelete", "The default favorite folder cannot be deleted") : t("aaalice.common.delete", "Delete"), className: "aa-taxonomy-delete-action", variant: "ghost", disabled: defaultFavorite, onClick: () => remove(item, isCategory) }),
			] });
			const leading = isCategory ? applyCategoryColor(el("span", { className: "aa-taxonomy-color-swatch", attrs: { "aria-hidden": "true" } }), item) : null;
			const count = usageCount(item); list.append(createListRow({ title: isCategory ? item.name : favoriteFolderName(item), description: `${count} ${t("aaalice.workspace.libraryUi.entriesCount", "entries")}`, leading, actions: [actions] }));
		});
	};
	const addItem = async () => {
		const name = addInput.value.trim(); if (!name || addButton.disabled) return;
		addButton.disabled = true;
		try {
			if (kind === "categories") await promptLibraryStore.createCategory({ name }); else await promptLibraryStore.createCollection({ name });
			addInput.value = ""; draw(); addInput.focus();
		} catch (error) { showError(error); }
		finally { addButton.disabled = false; }
	};
	const body = el("div", { className: "aa-taxonomy-manager", children: [tabs, summary, list] });
	const footer = el("div", { className: "aa-taxonomy-footer", children: [addInput, addButton, button({ label: t("aaalice.workspace.done", "Done"), variant: "secondary", onClick: () => dialog.close() })] });
	addInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } });
	dialog = createDialog({ title: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), body, footer, size: "md", className: "aa-taxonomy-dialog" });
	draw();
}

function openMoveSelected(selected) {
	const entryIds = [...selected];
	if (!entryIds.length) return;
	const target = document.createElement("select");
	target.add(new Option(t("aaalice.workspace.libraryUi.chooseTargetCategory", "Choose a target category"), "__choose__", true, true));
	target.options[0].disabled = true;
	target.add(new Option(t("aaalice.workspace.libraryUi.noCategory", "No category"), "__none__"));
	for (const category of promptLibraryStore.snapshot.categories) target.add(nativeCategoryOption(category));
	const body = el("div", { className: "aa-library-move-dialog", children: [
		el("p", null, `${entryIds.length} ${t("aaalice.workspace.libraryUi.entriesSelectedForMove", "entries will be moved together.")}`),
		field({ label: t("aaalice.workspace.libraryUi.targetCategory", "Target category"), control: target }),
	] });
	const footer = el("div");
	let dialog;
	const confirm = button({
		label: t("aaalice.workspace.libraryUi.moveConfirm", "Move"), iconName: "move", disabled: true,
		onClick: async () => {
			if (target.value === "__choose__" || confirm.disabled) return;
			confirm.disabled = true;
			try {
				await promptLibraryStore.batchEntries({ entryIds, categoryId: target.value === "__none__" ? null : target.value });
				dialog.close();
			} catch (error) {
				confirm.disabled = false;
				app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.libraryUi.moveSelected", "Move selected entries"), detail: error.message });
			}
		},
	});
	target.addEventListener("change", () => { confirm.disabled = target.value === "__choose__"; });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirm);
	dialog = createDialog({ title: t("aaalice.workspace.libraryUi.moveSelected", "Move selected entries"), body, footer, size: "sm", className: "aa-library-move-dialog-shell" });
}

function openLibraryExport(context) {
	const hasSelection = context.selected.size > 0;
	const hasFilters = Boolean(context.categoryId || context.collectionId);
	let scope = hasSelection ? "selected" : hasFilters ? "filtered" : "all";
	const body = el("div", "aa-transfer-dialog-body");
	const footer = el("div");
	const scopeOptions = [
		{ value: "all", label: t("aaalice.workspace.transfer.entireLibrary", "Entire library"), description: t("aaalice.workspace.transfer.entireLibraryHint", "A complete portable backup of every prompt entry.") },
		...(hasFilters ? [{ value: "filtered", label: t("aaalice.workspace.transfer.currentFilter", "Current filter"), description: t("aaalice.workspace.transfer.currentFilterHint", "Only entries matching the active category and favorite-folder filters.") }] : []),
		...(hasSelection ? [{ value: "selected", label: `${t("aaalice.workspace.transfer.selectedEntries", "Selected entries")} (${context.selected.size})`, description: t("aaalice.workspace.transfer.selectedEntriesHint", "Only the entries you selected in the library.") }] : []),
	];
	const scopeList = el("div", { className: "aa-transfer-scope-list", attrs: { role: "radiogroup", "aria-label": t("aaalice.workspace.transfer.exportScope", "Export scope") } });
	const summary = el("div");
	const primary = button({ label: t("aaalice.workspace.libraryUi.export", "Export"), onClick: async () => {
		setActionBusy(primary, true, t("aaalice.workspace.libraryUi.export", "Export"), t("aaalice.workspace.transfer.exporting", "Exporting…"));
		try {
			const prepared = await promptLibraryStore.exportArchive(libraryExportPayload(scope, context));
			downloadUrl(prepared.url, "aaalice-prompt-library.zip");
			body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.exportComplete", "Export ready"), description: t("aaalice.workspace.transfer.exportCompleteHint", "The ZIP backup has been downloaded and can be imported on another ComfyUI installation."), count: libraryEntriesForScope(scope, context).length, countLabel: t("aaalice.workspace.transfer.entries", "entries") }));
			setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
		} catch (error) {
			body.prepend(createTransferResult({ title: t("aaalice.workspace.transfer.exportFailed", "Export failed"), description: error.message, tone: "error" }));
			setActionBusy(primary, false, t("aaalice.workspace.libraryUi.export", "Export"), "");
		}
	} });
	const draw = () => {
		scopeList.replaceChildren();
		for (const option of scopeOptions) {
			const input = document.createElement("input"); input.type = "radio"; input.name = "aa-library-export-scope"; input.value = option.value; input.checked = scope === option.value;
			input.addEventListener("change", () => { scope = option.value; draw(); });
			scopeList.append(el("label", { className: `aa-transfer-scope${scope === option.value ? " is-selected" : ""}`, children: [input, el("span", "aa-transfer-scope__indicator"), el("div", { children: [el("strong", null, option.label), el("small", null, option.description)] })] }));
		}
		const entries = libraryEntriesForScope(scope, context);
		const categoryIds = new Set(entries.map((entry) => entry.categoryId).filter(Boolean));
		const collectionIds = new Set(entries.flatMap((entry) => entry.collections.map((item) => item.collectionId)));
		const previewCount = entries.filter((entry) => entry.previewHash).length;
		summary.replaceChildren(createTransferStats([
			{ value: entries.length, label: t("aaalice.workspace.transfer.entries", "Entries"), tone: "primary" },
			{ value: categoryIds.size, label: t("aaalice.workspace.libraryUi.categories", "Categories") },
			{ value: collectionIds.size, label: t("aaalice.workspace.libraryUi.collections", "Favorite folders") },
			{ value: previewCount, label: t("aaalice.workspace.transfer.previews", "Previews") },
		]));
		primary.disabled = entries.length === 0;
	};
	body.append(
		createTransferHero({ iconName: "upload", eyebrow: t("aaalice.workspace.transfer.backup", "Portable backup"), title: t("aaalice.workspace.transfer.exportLibraryTitle", "Export prompt library"), description: t("aaalice.workspace.transfer.exportLibraryHint", "Choose what to include. Related categories, collections, tags and preview images are bundled automatically."), fileName: "aaalice-prompt-library.zip", fileMeta: t("aaalice.workspace.transfer.zipArchive", "ZIP archive"), tone: "library" }),
		el("section", { className: "aa-transfer-block", children: [el("h3", null, t("aaalice.workspace.transfer.exportScope", "Export scope")), scopeList] }), summary,
	);
	const dialog = createDialog({ title: t("aaalice.workspace.libraryUi.export", "Export prompt library"), body, footer, size: "md", className: "aa-transfer-dialog" });
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), primary);
	draw();
}

export function renderLibrary(container, host) {
	const viewState = runtime.viewState;
	let query = viewState.query; const categoryId = viewState.categoryId; const collectionId = viewState.collectionId;
	const selected = viewState.selected;
	const searchOpen = viewState.searchOpen;
	const focusSearch = viewState.focusSearch && viewState.focusHost === host && runtime.isWorkspaceRootInteractive(host);
	if (focusSearch) { viewState.focusSearch = false; viewState.focusHost = null; }
	let drawEntries = () => {};
	const search = createCollapsibleSearch({
		open: searchOpen, value: query, focus: focusSearch,
		label: t("aaalice.workspace.search.library", "Search prompt library"), closeLabel: t("aaalice.workspace.search.close", "Close search"), placeholder: t("aaalice.workspace.search.library", "Search prompt library"),
		onToggle: (open) => { viewState.searchOpen = open; viewState.focusSearch = open; viewState.focusHost = open ? host : null; runtime.scheduleRender(); },
		onInput: (value) => { query = value; viewState.query = value; drawEntries(); },
	});
	const category = selectControl({ ariaLabel: t("aaalice.promptSelector.allCategories", "All categories"), value: categoryId, className: "aa-library-filter-select", options: [{ label: t("aaalice.promptSelector.allCategories", "All categories"), value: "" }, ...promptLibraryStore.snapshot.categories.map(categorySelectOption)], onChange: (value) => { viewState.categoryId = value; runtime.scheduleStructuralRender(); } });
	const collection = selectControl({ ariaLabel: t("aaalice.promptSelector.allCollections", "All favorite folders"), value: collectionId, className: "aa-library-filter-select", options: [{ label: t("aaalice.promptSelector.allCollections", "All favorite folders"), value: "" }, ...promptLibraryStore.snapshot.collections.map((item) => ({ label: favoriteFolderName(item), value: item.id }))], onChange: (value) => { viewState.collectionId = value; runtime.scheduleStructuralRender(); } });
	const libraryActions = [
		button({ label: t("aaalice.workspace.libraryUi.addEntry", "Add entry"), iconName: "add", size: "sm", onClick: () => openLibraryEntryEditor() }),
		button({ label: t("aaalice.workspace.libraryUi.manageAction", "Categories & favorites"), iconName: "settings", variant: "ghost", size: "sm", onClick: openTaxonomyManager }),
		iconButton({ iconName: "upload", label: selected.size ? `${t("aaalice.workspace.libraryUi.exportSelected", "Export selected")} (${selected.size})` : t("aaalice.workspace.libraryUi.export", "Export"), variant: "ghost", onClick: () => openLibraryExport({ selected, categoryId, collectionId }) }),
		iconButton({ iconName: "download", label: t("aaalice.workspace.libraryUi.import", "Import"), variant: "ghost", onClick: () => pickFile(".zip,.json,application/zip,application/json", importLibrary) }),
		search.toggle,
	];
	const toolbar = createWorkspaceToolbar(searchOpen ? [search.panel] : libraryActions, { className: `aa-library-toolbar${searchOpen ? " is-searching" : ""}`, label: t("aaalice.workspace.libraryUi.actions", "Library actions") });
	const list = el("div", "aa-library-list");
	let visibleEntries = [];
	let clearsSelection = false;
	const selectedCount = el("span", "aa-library-selection-count");
	const moveSelected = button({
		label: t("aaalice.workspace.libraryUi.moveAction", "Move"), iconName: "move", variant: "ghost", size: "sm", className: "aa-library-move-selected", disabled: selected.size === 0,
		onClick: () => openMoveSelected(selected),
	});
	const exportSelected = iconButton({
		iconName: "upload", label: t("aaalice.workspace.libraryUi.exportSelected", "Export selected"), variant: "ghost", className: "aa-library-export-selected", disabled: selected.size === 0,
		onClick: () => openLibraryExport({ selected, categoryId, collectionId }),
	});
	const deleteSelected = iconButton({
		iconName: "delete", label: t("aaalice.workspace.libraryUi.deleteSelected", "Delete selected"), variant: "ghost", className: "aa-library-delete-selected", disabled: selected.size === 0,
		onClick: async () => {
			const entryIds = [...selected];
			if (!entryIds.length) return;
			const message = `${entryIds.length} ${t("aaalice.workspace.libraryUi.deleteSelectedConfirm", "selected entries will be permanently deleted. PromptSelector references to them will become missing.")}`;
			if (!await confirmAction(message, { title: t("aaalice.workspace.libraryUi.deleteSelected", "Delete selected"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
			deleteSelected.disabled = true;
			try {
				await promptLibraryStore.deleteEntries(entryIds);
				selected.clear();
			} catch (error) {
				deleteSelected.disabled = false;
				app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.libraryUi.deleteSelected", "Delete selected"), detail: error.message });
			}
		},
	});
	const selectionToggle = button({
		label: t("aaalice.workspace.libraryUi.selectAll", "Select all"), iconName: "statusCheck", variant: "ghost", size: "sm", className: "aa-library-selection-toggle",
		onClick: () => {
			if (clearsSelection) selected.clear();
			else for (const entry of visibleEntries) selected.add(entry.id);
			drawEntries(false);
		},
	});
	const selectionActions = el("div", { className: "aa-library-selection-actions", children: [selectedCount, moveSelected, exportSelected, deleteSelected, selectionToggle] });
	container.append(toolbar, el("div", { className: "aa-library-filters", children: [category, collection] }), selectionActions, list);
	const renderEntry = (entry) => {
		const isSelected = selected.has(entry.id);
		const inputId = `aa-library-entry-${runtime.workspaceRootId(host)}-${entry.id}`;
		const row = el("article", `aa-library-entry${isSelected ? " is-selected" : ""}`);
		const preview = createSelectableImagePreview({
			source: entry.previewHash ? api.apiURL(`/aaalice/prompt-library/assets/${entry.previewHash}`) : "",
			title: entry.title,
			label: `${t("aaalice.workspace.libraryUi.select", "Select")} ${entry.title}`,
			className: "aa-library-entry-preview",
			selected: isSelected,
			inputId,
			onChange: (checked) => { if (checked) selected.add(entry.id); else selected.delete(entry.id); runtime.scheduleRender(); },
		});
		row.append(preview.root);
		const entryCategory = promptLibraryStore.category(entry.categoryId);
		const tagNames = promptLibraryStore.tagNames(entry.tagIds || []).slice(0, 3);
		const meta = el("div", "aa-library-entry-meta");
		if (entryCategory) meta.append(applyCategoryColor(el("span", "aa-library-chip is-category", entryCategory.name), entryCategory));
		for (const name of tagNames) meta.append(el("span", "aa-library-chip", name));
		const copy = el("label", { className: "aa-library-entry-copy", attrs: {
			for: inputId,
			tabindex: "0",
			role: "checkbox",
			"aria-checked": String(isSelected),
			"aria-label": `${isSelected ? t("aaalice.promptSelector.selected", "selected") : t("aaalice.workspace.libraryUi.select", "Select")} ${entry.title}`,
		}, children: [el("strong", null, entry.title), el("p", null, entry.text), meta] });
		copy.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			preview.input.click();
		});
		bindPromptEntryDetails(copy, entry);
		const actions = el("div", { className: "aa-library-entry-actions", children: [iconButton({ iconName: "copy", label: `${t("aaalice.workspace.libraryUi.copyEntry", "Copy prompt")} ${entry.title}`, className: "aa-library-entry-copy-action", variant: "ghost", onClick: (event) => {
			const control = event.currentTarget;
			void copyEntryPromptText({ text: entry.text, title: t("aaalice.workspace.libraryUi.copyEntry", "Copy prompt"), app, copiedLabel: t("aaalice.workspace.libraryUi.entryCopied", "Prompt copied to clipboard"), failedLabel: t("aaalice.workspace.libraryUi.copyFailedDetail", "The clipboard rejected the copy operation.") }).then((ok) => { if (ok) flashCopied(control); });
		} }), iconButton({ iconName: "settings", label: t("aaalice.workspace.libraryUi.edit", "Edit"), className: "aa-library-entry-edit", variant: "ghost", onClick: () => openLibraryEntryEditor(entry) }), iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), className: "aa-library-entry-delete", variant: "ghost", onClick: async () => { if (await confirmAction(t("aaalice.workspace.libraryUi.deleteEntryConfirm", "Delete this prompt entry?"))) { await promptLibraryStore.deleteEntry(entry.id); selected.delete(entry.id); } } })] });
		row.append(copy, actions); return row;
	};
	const virtualList = mountVirtualList(list, { rowHeight: 74, gap: 6, overscan: 5, onBeforeRender: () => closeTooltipWithin(list), renderItem: renderEntry, renderEmpty: () => {
		const isLibraryEmpty = promptLibraryStore.snapshot.entries.length === 0;
		return emptyState({ iconName: isLibraryEmpty ? "note" : "filter", className: "aa-workspace-empty aa-library-empty", title: isLibraryEmpty ? t("aaalice.workspace.libraryUi.emptyTitle", "Your library is empty") : t("aaalice.workspace.libraryUi.noMatchTitle", "No matching entries"), description: isLibraryEmpty ? t("aaalice.workspace.libraryUi.emptyDescription", "Add your first prompt entry to reuse it across selectors.") : t("aaalice.promptSelector.noResults", "No matching prompt entries."), actions: isLibraryEmpty ? [button({ label: t("aaalice.workspace.libraryUi.addEntry", "Add entry"), iconName: "add", onClick: () => openLibraryEntryEditor() })] : [] });
	} });
	list.addEventListener("scroll", () => { viewState.scrollTop = list.scrollTop; }, { passive: true });
	drawEntries = (reset = true) => {
		closeTooltipWithin(list);
		visibleEntries = promptLibraryStore.filterEntries({ query, categoryId, collectionId });
		selectedCount.textContent = `${selected.size} ${t("aaalice.workspace.libraryUi.selectedShort", "selected")}`;
		clearsSelection = selected.size > 0 && (!visibleEntries.length || visibleEntries.every((entry) => selected.has(entry.id)));
		const actionLabel = clearsSelection ? t("aaalice.workspace.libraryUi.clearAll", "Clear all") : t("aaalice.workspace.libraryUi.selectAll", "Select all");
		selectionToggle.replaceChildren(icon(clearsSelection ? "close" : "statusCheck"), el("span", "aa-ui-button__label", actionLabel));
		selectionToggle.classList.toggle("is-clear", clearsSelection);
		selectionToggle.disabled = !visibleEntries.length && selected.size === 0;
		moveSelected.disabled = selected.size === 0;
		exportSelected.disabled = selected.size === 0;
		deleteSelected.disabled = selected.size === 0;
		selectionToggle.setAttribute("aria-label", actionLabel);
		selectionToggle.title = actionLabel;
		selectionActions.classList.toggle("has-selection", selected.size > 0);
		virtualList.setItems(visibleEntries, { preserveScroll: !reset });
		if (reset) viewState.scrollTop = 0;
	};
	drawEntries(false); list.scrollTop = viewState.scrollTop || 0; virtualList.refresh();
}

export async function importLibrary(file) {
	const controller = new AbortController();
	const body = el("div", "aa-transfer-dialog-body");
	const footer = el("div");
	let importToken = "";
	let dialog;
	const discardStage = () => { if (!importToken) return; const token = importToken; importToken = ""; void promptLibraryStore.discardImport(token).catch(() => {}); };
	const close = () => { controller.abort(); discardStage(); dialog.close(); };
	dialog = createDialog({ title: t("aaalice.workspace.libraryUi.importTitle", "Import prompt library"), body, footer, size: "lg", className: "aa-transfer-dialog", onRequestClose: () => { controller.abort(); discardStage(); return true; } });
	body.append(
		createTransferHero({ iconName: "download", eyebrow: t("aaalice.workspace.transfer.preflight", "Safety check"), title: t("aaalice.workspace.transfer.readingFile", "Reading backup…"), description: t("aaalice.workspace.transfer.readingFileHint", "Checking the archive structure, entries and preview assets before anything is written."), fileName: file.name, fileMeta: formatFileSize(file.size), tone: "library" }),
		el("div", { className: "aa-transfer-loading", attrs: { role: "status" }, children: [el("span", "aa-transfer-loading__bar"), el("span", null, t("aaalice.workspace.transfer.preflighting", "Preparing import preview…"))] }),
	);
	setDialogFooter(footer, button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: close }));
	try {
		const result = await promptLibraryStore.importPreflight(file, { signal: controller.signal });
		importToken = result.token;
		const groups = result.preflight;
		const conflicts = [...groups.conflict.map((entry) => ({ ...entry, conflictKind: "conflict" })), ...groups.duplicate.map((entry) => ({ ...entry, conflictKind: "duplicate" }))];
		const resolutions = Object.fromEntries(conflicts.map((entry) => [entry.id, "local"]));
		const resolutionSelects = new Map();
		const conflictRows = el("div", "aa-transfer-conflicts");
		const policyOptions = () => [
			new Option(t("aaalice.workspace.libraryUi.keepLocal", "Keep local"), "local"),
			new Option(t("aaalice.workspace.libraryUi.useImport", "Use import"), "import"),
			new Option(t("aaalice.workspace.libraryUi.createDuplicate", "Create duplicate"), "duplicate"),
		];
		for (const entry of conflicts) {
			const select = document.createElement("select"); select.setAttribute("aria-label", entry.title || entry.id); select.append(...policyOptions());
			select.addEventListener("change", () => { resolutions[entry.id] = select.value; }); resolutionSelects.set(entry.id, select);
			conflictRows.append(el("div", { className: "aa-transfer-conflict-row", children: [
				el("div", { children: [el("strong", null, entry.title || entry.id), el("small", null, entry.conflictKind === "duplicate" ? t("aaalice.workspace.transfer.sameContent", "The same content already exists locally.") : t("aaalice.workspace.transfer.changedContent", "This entry has the same ID but different content."))] }), select,
			] }));
		}
		const bulkSelect = document.createElement("select"); bulkSelect.setAttribute("aria-label", t("aaalice.workspace.transfer.applyToAll", "Apply to all conflicts")); bulkSelect.append(new Option(t("aaalice.workspace.transfer.applyToAll", "Apply to all…"), ""), ...policyOptions());
		bulkSelect.addEventListener("change", () => { if (!bulkSelect.value) return; for (const [id, select] of resolutionSelects) { select.value = bulkSelect.value; resolutions[id] = bulkSelect.value; } bulkSelect.value = ""; });
		const total = groups.new.length + groups.update.length + groups.conflict.length + groups.duplicate.length;
		body.replaceChildren(
			createTransferHero({ iconName: groups.invalid.length ? "statusWarning" : conflicts.length ? "statusWarning" : "statusCheck", eyebrow: t("aaalice.workspace.transfer.review", "Import preview"), title: groups.invalid.length ? t("aaalice.workspace.transfer.cannotImport", "This backup needs attention") : conflicts.length ? t("aaalice.workspace.transfer.resolveConflicts", "Choose how to handle conflicts") : t("aaalice.workspace.transfer.readyToImport", "Ready to import"), description: groups.invalid.length ? t("aaalice.workspace.transfer.invalidBlocksImport", "Invalid entries must be fixed in the source backup before it can be imported.") : conflicts.length ? t("aaalice.workspace.transfer.resolveConflictsHint", "Nothing is changed until you confirm. Each conflicting entry starts with the safest option: keep local.") : t("aaalice.workspace.transfer.readyToImportHint", "The backup passed validation. Review the summary, then import it in one transaction."), fileName: file.name, fileMeta: `${formatFileSize(file.size)} · ${file.name.toLocaleLowerCase().endsWith(".json") ? t("aaalice.workspace.transfer.legacyJson", "Legacy JSON") : t("aaalice.workspace.transfer.zipArchive", "ZIP archive")}`, tone: groups.invalid.length ? "danger" : conflicts.length ? "warning" : "success" }),
			createTransferStats([
				{ value: groups.new.length, label: t("aaalice.workspace.libraryUi.new", "New"), tone: "success" },
				{ value: groups.update.length, label: t("aaalice.workspace.libraryUi.existing", "Updates"), tone: "info" },
				{ value: groups.conflict.length, label: t("aaalice.workspace.libraryUi.conflicts", "Conflicts"), tone: groups.conflict.length ? "warning" : "neutral" },
				{ value: groups.duplicate.length, label: t("aaalice.workspace.libraryUi.duplicates", "Duplicates"), tone: groups.duplicate.length ? "warning" : "neutral" },
				{ value: groups.invalid.length, label: t("aaalice.workspace.libraryUi.invalid", "Invalid"), tone: groups.invalid.length ? "danger" : "neutral" },
			]),
			...(conflicts.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.conflictDecisions", "Conflict decisions"), description: t("aaalice.workspace.transfer.conflictDecisionsHint", "Review individually or apply one policy to all."), count: conflicts.length, tone: "warning", open: true, children: [el("div", { className: "aa-transfer-bulk", children: [el("span", null, t("aaalice.workspace.transfer.bulkPolicy", "Bulk policy")), bulkSelect] }), conflictRows] })] : []),
			...(groups.invalid.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.invalidEntries", "Invalid entries"), description: t("aaalice.workspace.transfer.invalidEntriesHint", "These entries prevent a safe transactional import."), count: groups.invalid.length, tone: "danger", open: true, children: [transferEntryList(groups.invalid, { invalid: true })] })] : []),
			...(groups.new.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.newEntries", "New entries"), count: groups.new.length, tone: "success", children: [transferEntryList(groups.new)] })] : []),
			...(groups.update.length ? [createTransferSection({ title: t("aaalice.workspace.transfer.unchangedEntries", "Existing entries"), description: t("aaalice.workspace.transfer.unchangedEntriesHint", "These entries already match local content, so no action is required."), count: groups.update.length, tone: "info", children: [transferEntryList(groups.update)] })] : []),
		);
		const importLabel = t("aaalice.workspace.libraryUi.import", "Import");
		const primary = button({ label: importLabel, disabled: groups.invalid.length > 0, onClick: async () => {
			setActionBusy(primary, true, importLabel, t("aaalice.workspace.transfer.importing", "Importing…"));
			try {
				const applied = await promptLibraryStore.importApply(importToken, resolutions, { signal: controller.signal });
				importToken = "";
				body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.importComplete", "Import complete"), description: t("aaalice.workspace.transfer.importCompleteHint", "The library was updated successfully. PromptSelector nodes will use the latest entries immediately."), count: applied.imported, countLabel: t("aaalice.workspace.transfer.entriesImported", "entries imported") }));
				setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Done"), onClick: () => dialog.close() }));
			} catch (error) {
				if (error.name === "AbortError") return;
				body.prepend(createTransferResult({ title: t("aaalice.workspace.transfer.importFailed", "Import failed"), description: error.message, tone: "error" }));
				setActionBusy(primary, false, importLabel, "");
			}
		} });
		setDialogFooter(footer, el("span", "aa-transfer-footer-note", groups.invalid.length ? t("aaalice.workspace.transfer.importBlocked", "Import blocked by invalid entries") : `${total} ${t("aaalice.workspace.transfer.entriesReviewed", "entries reviewed")}`), button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: close }), primary);
	} catch (error) {
		if (error.name === "AbortError") return;
		body.replaceChildren(createTransferResult({ title: t("aaalice.workspace.transfer.preflightFailed", "Could not read this backup"), description: error.message, tone: "error" }));
		setDialogFooter(footer, button({ label: t("aaalice.workspace.done", "Close"), onClick: () => dialog.close() }));
	}
}
