/** PromptSelector node UI and execution payload injection. */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { installDomWidgetResizePassthrough, cleanupDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { applyCategoryColor } from "./lib/category_color.js";
import { categoryPicker } from "./lib/category_picker.js";
import { collectionDisplayName, collectionSelectOption, DEFAULT_COLLECTION_ID } from "./lib/collection.js";
import { allGraphNodes, promptNodesForGraphNode } from "./lib/graph_scope.js";
import { closeImagePreviewWithin, createImagePreview } from "./lib/image_preview.js";
import { promptLibraryStore } from "./lib/library_store.js";
import { bindPromptEntryDetails, closePromptEntryDetailsWithin } from "./lib/prompt_entry_details.js";
import {
	clearPromptSelections, countPromptSelectionsByCategory, materializePromptPayload,
	normalizePromptSelectorState, resolvePromptSelections, setPromptWeight,
	togglePromptSelection,
} from "./lib/prompt_selector_model.js";
import { button, createDialog, createTooltip, el, emptyState, field, icon, iconButton, isolate, searchToggleButton, selectControl } from "./lib/ui.js";
import { copyEntryPromptText, flashCopied } from "./lib/prompt_copy.js";
import { destroyVirtualLists, mountVirtualList } from "./lib/virtual_list.js";
import { observeDOMWidgetVisibility } from "./lib/dom_widget_visibility.js";
import { openPromptLibraryEntryEditor, openWorkspace } from "./workspace.js";

const NODE = "PromptSelector";
const PROPERTY = "promptSelectorState";
const DEFAULT_SIZE = [440, 560];
const MIN_WIDTH = 440;
const MIN_HEIGHT = 560;
const MIN_WIDGET_HEIGHT = 240;
const SELECTION_TOOLTIP_LIMIT = 12;
const selectionSummaryTooltip = createTooltip({ delay: 260, closeDelay: 80 });

function isSelector(node) { return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE); }
function stateFor(node) { node.properties ||= {}; node.properties[PROPERTY] = normalizePromptSelectorState(node.properties[PROPERTY]); return node.properties[PROPERTY]; }
function notifySidebarViews(node, except = null) {
	for (const update of node?._aaalicePromptSelectorSidebarViews || []) if (update !== except) update();
}
function defaultFavoritesLabel() { return t("aaalice.workspace.libraryUi.defaultFavorites", "Default favorites"); }
function favoriteFolderName(collection) { return collectionDisplayName(collection, defaultFavoritesLabel()); }

function mutate(node, callback) {
	const host = node._aaalicePromptSelectorHost || node;
	node.graph?.beforeChange?.();
	try { node.properties[PROPERTY] = normalizePromptSelectorState(callback(stateFor(node))); }
	finally { node.graph?.afterChange?.(); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, true); render(node, { syncHost: true }); }
	notifySidebarViews(host, node._aaalicePromptSelectorUpdate);
}

function filteredEntries(node, state) {
	const entries = promptLibraryStore.filterEntries({
		query: node._aaalicePromptQuery,
		categoryId: node._aaalicePromptCategory,
		collectionId: node._aaalicePromptCollection,
		recentFirst: node._aaalicePromptRecentFirst !== false,
	});
	if (!node._aaalicePromptSelectedOnly) return entries;
	const selectedIds = new Set(state.selections.map((item) => item.entryId));
	return entries.filter((entry) => selectedIds.has(entry.id));
}

function promptFilterOptions({ label, options, selectedCounts = null, totalSelected = 0 }) {
	const countedLabel = (text, count) => count > 0 ? `${text} (${count})` : text;
	return [
		{ label: countedLabel(label, totalSelected), value: "" },
		...options.map((option) => ({ label: countedLabel(option.name, selectedCounts?.get(option.id) || 0), value: option.id, color: option.color })),
	];
}

function promptFilterSelect({ label, value, options, onChange, selectedCounts = null, totalSelected = 0 }) {
	return selectControl({ ariaLabel: label, value, onChange, className: "aa-prompt-selector-filter", options: promptFilterOptions({ label, options, selectedCounts, totalSelected }) });
}

function bindSelectionSummary(trigger, content) {
	const show = (immediate) => {
		if (selectionSummaryTooltip.isOpenFor(trigger)) { selectionSummaryTooltip.cancelScheduledHide(); return; }
		selectionSummaryTooltip.show(trigger, content, { className: "aa-prompt-selection-tooltip", contentMode: "dom", immediate });
	};
	trigger.addEventListener("mouseenter", () => show(false));
	trigger.addEventListener("mouseleave", selectionSummaryTooltip.scheduleHide);
	trigger.addEventListener("focusin", () => show(true));
	trigger.addEventListener("focusout", selectionSummaryTooltip.scheduleHide);
	trigger.addEventListener("pointerdown", selectionSummaryTooltip.hide);
}

function selectionSummaryHeader(title, count) {
	return el("header", { children: [
		el("strong", null, title),
		el("span", null, `${count} ${t("aaalice.promptSelector.selected", "selected")}`),
	] });
}

function categorySelectionSummary(state) {
	const entriesById = new Map(promptLibraryStore.snapshot.entries.map((entry) => [entry.id, entry]));
	const counts = new Map();
	let missing = 0;
	for (const selection of state.selections) {
		const entry = entriesById.get(selection.entryId);
		if (!entry) { missing += 1; continue; }
		const categoryId = entry.categoryId || "";
		counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
	}
	const knownCategoryIds = new Set(promptLibraryStore.snapshot.categories.map((category) => category.id));
	const rows = promptLibraryStore.categoryRecords().filter((record) => counts.has(record.id)).map((record) => applyCategoryColor(el("div", { className: "aa-prompt-selection-category", children: [
		el("span", null, record.pathLabel),
		el("em", null, String(counts.get(record.id))),
	] }), record.category));
	const uncategorized = [...counts].reduce((total, [categoryId, count]) => total + (!categoryId || !knownCategoryIds.has(categoryId) ? count : 0), 0);
	if (uncategorized) rows.push(el("div", { className: "aa-prompt-selection-category", children: [
		el("span", null, t("aaalice.promptSelector.uncategorized", "Uncategorized")),
		el("em", null, String(uncategorized)),
	] }));
	if (missing) rows.push(el("div", { className: "aa-prompt-selection-category is-missing", children: [
		el("span", null, t("aaalice.promptSelector.missing", "Missing library entry")), el("em", null, String(missing)),
	] }));
	return el("article", { className: "aa-prompt-selection-summary", children: [
		selectionSummaryHeader(t("aaalice.promptSelector.categorySummary", "Selected by category"), state.selections.length),
		...(rows.length ? [el("div", { className: "aa-prompt-selection-categories", children: rows })] : [el("p", null, t("aaalice.promptSelector.emptySelected", "No prompts selected."))]),
	] });
}

function selectedPromptSummary(state) {
	const resolved = resolvePromptSelections(state, promptLibraryStore.snapshot.entries);
	const visible = resolved.slice(0, SELECTION_TOOLTIP_LIMIT);
	const remaining = resolved.length - visible.length;
	return el("article", { className: "aa-prompt-selection-summary is-queue", children: [
		selectionSummaryHeader(t("aaalice.promptSelector.outputQueue", "Selected output queue"), resolved.length),
		...(resolved.length ? [el("ol", { children: visible.map((item, index) => el("li", { className: item.missing ? "is-missing" : "", children: [
			el("span", { className: "aa-prompt-selection-index", text: String(index + 1) }),
			el("strong", null, item.entry?.title || t("aaalice.promptSelector.missing", "Missing library entry")),
			...(item.weight !== 1 ? [el("em", null, `×${item.weight}`)] : []),
		] })) }), ...(remaining ? [el("footer", { className: "aa-prompt-selection-more", children: [
			el("strong", null, `+${remaining}`), el("span", null, t("aaalice.promptSelector.moreSelected", "More selected prompts")),
		] })] : [])] : [el("p", null, t("aaalice.promptSelector.emptySelected", "No prompts selected."))]),
	] });
}

function libraryActionError(summary, error) {
	app.extensionManager.toast.add({ severity: "error", summary, detail: error.message });
}

async function removeEntryFromFavorites(entry) {
	const summary = t("aaalice.workspace.libraryUi.unfavorite", "Remove from favorites");
	try { await promptLibraryStore.updateEntry(entry.id, { collectionIds: [] }); }
	catch (error) { libraryActionError(summary, error); }
}

function openFavoritePicker(entry) {
	const folders = promptLibraryStore.snapshot.collections;
	const target = document.createElement("select");
	const preferredId = folders.some((item) => item.id === DEFAULT_COLLECTION_ID) ? DEFAULT_COLLECTION_ID : folders[0]?.id;
	for (const folder of folders) target.add(collectionSelectOption(folder, defaultFavoritesLabel(), folder.id === preferredId));
	const body = el("div", { className: "aa-prompt-favorite-dialog", children: [
		el("p", null, t("aaalice.workspace.libraryUi.favoriteEntryHint", "Choose a favorite folder for this prompt entry.")),
		field({ label: t("aaalice.workspace.libraryUi.collections", "Favorite folders"), control: target }),
	] });
	const footer = el("div");
	let dialog;
	const confirm = button({
		label: t("aaalice.workspace.libraryUi.favorite", "Favorite"), iconName: "favorite", disabled: !folders.length,
		onClick: async () => {
			if (!target.value || confirm.disabled) return;
			confirm.disabled = true;
			try {
				await promptLibraryStore.batchEntries({ entryIds: [entry.id], addCollectionId: target.value });
				dialog.close();
			} catch (error) {
				confirm.disabled = false;
				libraryActionError(t("aaalice.workspace.libraryUi.favoriteEntry", "Favorite prompt entry"), error);
			}
		},
	});
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirm);
	dialog = createDialog({ title: `${t("aaalice.workspace.libraryUi.favoriteEntry", "Favorite prompt entry")} · ${entry.title}`, body, footer, size: "sm", className: "aa-prompt-favorite-dialog-shell" });
}

function closeSelectionSummaryWithin(container) { if (selectionSummaryTooltip.isAnchoredWithin(container)) selectionSummaryTooltip.hide(); }
function closePromptSurfaces(node) {
	const root = node._aaalicePromptSelectorRoot;
	if (!root) return;
	closeImagePreviewWithin(root);
	closePromptEntryDetailsWithin(root);
	closeSelectionSummaryWithin(root);
}

function promptWeightControl(node, entryId, weight) {
	const value = Number(weight);
	const hint = t("aaalice.promptSelector.weightHint", "Scroll or use arrow keys to adjust; click to reset to 1");
	const control = el("button", {
		className: `aa-prompt-selector-weight${value === 1 ? " is-default" : ""}`,
		attrs: { type: "button", "aria-label": `${t("aaalice.promptSelector.weight", "Weight")} ${value}. ${hint}`, title: hint },
		children: [el("span", null, "×"), el("strong", null, String(value))],
	});
	control.dataset.weightEntryId = entryId;
	const commit = (next, restoreFocus = false) => {
		const normalized = Math.round(Math.min(20, Math.max(0, next)) * 100) / 100;
		if (normalized === value) return;
		if (restoreFocus) node._aaalicePromptWeightFocusEntryId = entryId;
		mutate(node, (state) => setPromptWeight(state, entryId, normalized));
	};
	control.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); if (value !== 1) commit(1, true); });
	control.addEventListener("keydown", (event) => {
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
		event.preventDefault(); event.stopPropagation();
		commit(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? .01 : .1), true);
	});
	control.addEventListener("wheel", (event) => {
		event.preventDefault(); event.stopPropagation();
		const direction = event.deltaY < 0 ? 1 : event.deltaY > 0 ? -1 : 0;
		if (direction) commit(value + direction * (event.shiftKey ? .01 : .1));
	}, { passive: false });
	return control;
}

function openSeparatorEditor(node) {
	const input = document.createElement("input"); input.value = stateFor(node).separator;
	const body = el("div", { children: [field({ label: t("aaalice.promptSelector.separator", "Prompt separator"), control: input })] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.promptSelector.separator", "Prompt separator"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { mutate(node, (state) => ({ ...state, separator: input.value })); dialog.close(); } }));
	input.focus();
}

function mountPromptEntries(node, list, view, entries) {
	let selectionById = new Map(view.state.selections.map((item) => [item.entryId, item]));
	const virtualList = mountVirtualList(list, { rowHeight: 55, gap: 3, overscan: 5, onBeforeRender: () => closePromptSurfaces(node), renderItem: (entry) => {
		const isSelected = selectionById.has(entry.id);
		const row = el("div", `aa-prompt-selector-row${isSelected ? " is-selected" : ""}`);
		const quickEditHint = t("aaalice.promptSelector.thumbnailEditHint", "Double-click the thumbnail to edit this entry");
		const preview = createImagePreview({ source: entry.previewHash ? api.apiURL(`/aaalice/prompt-library/assets/${entry.previewHash}`) : "", title: entry.title, label: `${entry.title}. ${quickEditHint}`, hint: quickEditHint, className: "aa-prompt-selector-preview" });
		preview.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); closePromptSurfaces(node); void openPromptLibraryEntryEditor(entry.id); });
		const category = promptLibraryStore.category(entry.categoryId);
		const copy = el("button", { className: "aa-prompt-selector-copy", attrs: { type: "button", "aria-label": entry.title, "aria-pressed": String(isSelected) }, children: [
			el("span", { className: "aa-prompt-selector-title", children: [el("strong", null, entry.title), ...(category ? [applyCategoryColor(el("em", { attrs: { title: promptLibraryStore.categoryPath(category.id) }, text: promptLibraryStore.categoryPath(category.id) }), category)] : [])] }),
			el("small", null, entry.text),
		] });
		copy.addEventListener("click", () => mutate(node, (current) => togglePromptSelection(current, entry.id, !isSelected)));
		bindPromptEntryDetails(copy, entry);
		const isFavorite = (entry.collections || []).length > 0;
		const favoriteAction = iconButton({ iconName: "favorite", label: `${isFavorite ? t("aaalice.workspace.libraryUi.unfavorite", "Remove from favorites") : t("aaalice.workspace.libraryUi.favorite", "Favorite")} ${entry.title}`, className: `aa-prompt-selector-favorite${isFavorite ? " is-active" : ""}`, variant: "ghost", onClick: (event) => {
			event.preventDefault(); event.stopPropagation(); closePromptSurfaces(node);
			if (isFavorite) void removeEntryFromFavorites(entry); else openFavoritePicker(entry);
		} });
		const editAction = iconButton({ iconName: "edit", label: `${t("aaalice.workspace.libraryUi.edit", "Edit")} ${entry.title}`, className: "aa-prompt-selector-edit", variant: "ghost", onClick: (event) => {
			event.preventDefault(); event.stopPropagation(); closePromptSurfaces(node); void openPromptLibraryEntryEditor(entry.id);
		} });
		const copyAction = iconButton({ iconName: "copy", label: `${t("aaalice.promptSelector.copyEntry", "Copy prompt")} ${entry.title}`, className: "aa-prompt-selector-copy-action", variant: "ghost", onClick: (event) => {
			event.preventDefault(); event.stopPropagation(); closePromptSurfaces(node);
			const control = event.currentTarget;
			void copyEntryPromptText({ text: entry.text, title: t("aaalice.promptSelector.copyEntry", "Copy prompt"), app, copiedLabel: t("aaalice.promptSelector.entryCopied", "Prompt copied to clipboard"), failedLabel: t("aaalice.promptSelector.copyFailedDetail", "The clipboard rejected the copy operation.") }).then((ok) => { if (ok) flashCopied(control); });
		} });
		const weightAction = isSelected ? promptWeightControl(node, entry.id, selectionById.get(entry.id)?.weight ?? 1) : null;
		const actions = el("div", { className: "aa-prompt-selector-row-actions", children: [weightAction, favoriteAction, copyAction, editAction] });
		row.append(preview, copy, actions); return row;
	}, renderEmpty: () => emptyState({ iconName: "note", className: "aa-prompt-selector-empty", title: t("aaalice.promptSelector.noResultsTitle", "No prompts found"), description: t("aaalice.promptSelector.noResults", "No matching prompt entries.") }) });
	virtualList.setState = (state) => { view.state = state; selectionById = new Map(state.selections.map((item) => [item.entryId, item])); };
	virtualList.setItems(entries, { preserveScroll: false });
	return virtualList;
}

function updatePromptSelectorView(node, view, state, { resetScroll = false } = {}) {
	view.state = state;
	closePromptSurfaces(node);
	view.virtualList.setState?.(state);
	const selectedOnly = Boolean(node._aaalicePromptSelectedOnly);
	const selectedCategoryCounts = promptLibraryStore.index.categoryTree.aggregateCounts(countPromptSelectionsByCategory(state, promptLibraryStore.snapshot.entries));
	if (view.categoryFilter) {
		view.categoryFilter.setTree(promptLibraryStore.index.categoryTree, node._aaalicePromptCategory);
		view.categoryFilter.setCounts(selectedCategoryCounts);
	}
	if (view.collectionFilter) view.collectionFilter.setOptions(promptFilterOptions({
		label: t("aaalice.promptSelector.allCollections", "All favorite folders"),
		options: promptLibraryStore.snapshot.collections.map((item) => ({ ...item, name: favoriteFolderName(item) })),
	}), node._aaalicePromptCollection);
	if (view.searchToggle) view.searchToggle.setSearchValue(String(node._aaalicePromptQuery || ""));
	if (view.recentSort) {
		const recentFirst = node._aaalicePromptRecentFirst !== false;
		const label = recentFirst
			? t("aaalice.promptSelector.recentSortActive", "Recently used first; click for library order")
			: t("aaalice.promptSelector.recentSort", "Sort by recent use");
		view.recentSort.classList.toggle("is-active", recentFirst);
		view.recentSort.setAttribute("aria-pressed", String(recentFirst));
		view.recentSort.setAttribute("aria-label", label);
		view.recentSort.setAttribute("title", label);
	}
	const missing = resolvePromptSelections(state, promptLibraryStore.snapshot.entries).filter((item) => item.missing).length;
	const selectedLabel = selectedOnly ? t("aaalice.promptSelector.showAll", "Show all matching prompts") : t("aaalice.promptSelector.showSelected", "Show selected prompts only");
	view.summary.classList.toggle("is-active", selectedOnly);
	view.summary.classList.toggle("is-error", Boolean(missing));
	view.summary.disabled = !state.selections.length && !selectedOnly;
	view.summary.setAttribute("aria-pressed", String(selectedOnly));
	view.summary.setAttribute("aria-label", selectedLabel);
	view.summary.setAttribute("title", selectedLabel);
	view.summaryCount.textContent = String(state.selections.length);
	view.summaryMissing.textContent = missing ? `${missing} ${t("aaalice.promptSelector.missingShort", "missing")}` : "";
	view.summaryMissing.hidden = !missing;
	view.clearAction.hidden = !state.selections.length;
	if (resetScroll) view.list.scrollTop = 0;
	view.virtualList.setItems(filteredEntries(node, state), { preserveScroll: !resetScroll });
	view.virtualList.setActive?.(node._aaalicePromptSelectorViewportActive !== false);
}

function render(node, { syncHost = false } = {}) {
	if (syncHost && node._aaalicePromptSelectorHost && node._aaalicePromptSelectorHost !== node) render(node._aaalicePromptSelectorHost);
	const root = node._aaalicePromptSelectorRoot;
	if (!root) return;
	const state = stateFor(node);
	const selectedOnly = Boolean(node._aaalicePromptSelectedOnly);
	const searchOpen = Boolean(node._aaalicePromptSearchOpen);
	const existingView = node._aaalicePromptSelectorView;
	if (existingView?.root === root && existingView.searchOpen === searchOpen) {
		const resetScroll = Boolean(node._aaalicePromptResetScroll);
		node._aaalicePromptResetScroll = false;
		updatePromptSelectorView(node, existingView, state, { resetScroll });
		if (node._aaalicePromptWeightFocusEntryId) {
			const entryId = node._aaalicePromptWeightFocusEntryId; node._aaalicePromptWeightFocusEntryId = null;
			queueMicrotask(() => [...root.querySelectorAll(".aa-prompt-selector-weight")].find((item) => item.dataset.weightEntryId === entryId)?.focus({ preventScroll: true }));
		}
		return;
	}
	const listScrollTop = node._aaalicePromptResetScroll ? 0 : root.querySelector(".aa-prompt-selector-list")?.scrollTop || 0;
	node._aaalicePromptResetScroll = false;
	closePromptSurfaces(node); destroyVirtualLists(root);
	root.replaceChildren();
	const visibleEntries = filteredEntries(node, state);
	const selectedCategoryCounts = promptLibraryStore.index.categoryTree.aggregateCounts(countPromptSelectionsByCategory(state, promptLibraryStore.snapshot.entries));
	const list = el("div", { className: "aa-prompt-selector-list", attrs: { tabindex: "0" } });
	const view = { root, searchOpen, state, list };
	list.addEventListener("pointerenter", () => {
		const active = document.activeElement;
		if (active && root.contains(active)) return;
		if (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) return;
		list.classList.add("is-wheel-capture-focused");
		list.focus({ preventScroll: true });
	});
	const clearWheelCaptureFocus = () => list.classList.remove("is-wheel-capture-focused");
	list.addEventListener("keydown", clearWheelCaptureFocus);
	list.addEventListener("blur", clearWheelCaptureFocus);
	const query = String(node._aaalicePromptQuery || "");
	const toolbar = el("div", { className: `aa-prompt-selector-toolbar${searchOpen ? " is-searching" : ""}`, attrs: { role: "search", "aria-label": t("aaalice.promptSelector.filters", "Prompt filters") } });
	if (searchOpen) {
		const search = document.createElement("input"); search.type = "search"; search.className = "aa-ui-search-input"; search.setAttribute("data-autocomplete-plus", ""); search.placeholder = t("aaalice.promptSelector.search", "Search prompt library"); search.value = query;
		view.searchInput = search;
		search.addEventListener("input", () => {
			node._aaalicePromptQuery = search.value;
			if (node._aaalicePromptFilterFrame) return;
			node._aaalicePromptFilterFrame = requestAnimationFrame(() => {
				node._aaalicePromptFilterFrame = 0;
				list._aaaliceVirtualList?.setItems(filteredEntries(node, stateFor(node)), { preserveScroll: false });
			});
		});
		search.addEventListener("keydown", (event) => {
			// 补全候选面板打开时按键让给 Autocomplete-Plus
			if (search.hasAttribute("data-autocomplete-plus-open")) return;
			if (event.key === "Escape") { event.preventDefault(); node._aaalicePromptSearchOpen = false; render(node); }
		});
		const searchPanel = el("div", { className: "aa-prompt-selector-search", children: [icon("search"), search,
			iconButton({ iconName: "arrowRight", label: t("aaalice.promptSelector.collapseSearch", "Collapse search"), className: "aa-ui-search-collapse", variant: "ghost", onClick: () => { node._aaalicePromptSearchOpen = false; render(node); } }),
		] });
		toolbar.append(searchPanel);
		if (node._aaalicePromptSearchShouldFocus) {
			node._aaalicePromptSearchShouldFocus = false;
			queueMicrotask(() => { if (search.isConnected) { search.focus({ preventScroll: true }); search.setSelectionRange(search.value.length, search.value.length); } });
		}
	} else {
		const searchButton = searchToggleButton({ label: t("aaalice.promptSelector.search", "Search prompt library"), value: query, className: "aa-prompt-selector-search-toggle", onClick: () => { node._aaalicePromptSearchOpen = true; node._aaalicePromptSearchShouldFocus = true; render(node); } });
		view.searchToggle = searchButton;
		searchButton.setAttribute("aria-pressed", String(Boolean(query)));
		const categoryFilter = categoryPicker({ tree: promptLibraryStore.index.categoryTree, value: node._aaalicePromptCategory, counts: selectedCategoryCounts, ariaLabel: t("aaalice.promptSelector.allCategories", "All categories"), emptyLabel: t("aaalice.promptSelector.allCategories", "All categories"), uncategorizedLabel: t("aaalice.promptSelector.uncategorized", "Uncategorized"), searchPlaceholder: t("aaalice.workspace.libraryUi.searchCategories", "Search categories"), className: "aa-prompt-selector-filter", onChange: (value) => { node._aaalicePromptCategory = value; node._aaalicePromptResetScroll = true; render(node); } });
		view.categoryFilter = categoryFilter;
		bindSelectionSummary(categoryFilter.control, () => categorySelectionSummary(stateFor(node)));
		const recentFirst = node._aaalicePromptRecentFirst !== false;
		const recentSort = iconButton({
			iconName: "statusIdle",
			label: recentFirst
				? t("aaalice.promptSelector.recentSortActive", "Recently used first; click for library order")
				: t("aaalice.promptSelector.recentSort", "Sort by recent use"),
			className: `aa-prompt-selector-recent-sort${recentFirst ? " is-active" : ""}`,
			variant: "ghost",
			onClick: () => { node._aaalicePromptRecentFirst = !(node._aaalicePromptRecentFirst !== false); node._aaalicePromptResetScroll = true; render(node); },
		});
		recentSort.setAttribute("aria-pressed", String(recentFirst));
		view.recentSort = recentSort;
		const collectionFilter = promptFilterSelect({ label: t("aaalice.promptSelector.allCollections", "All favorite folders"), value: node._aaalicePromptCollection, options: promptLibraryStore.snapshot.collections.map((item) => ({ ...item, name: favoriteFolderName(item) })), onChange: (value) => { node._aaalicePromptCollection = value; node._aaalicePromptResetScroll = true; render(node); } });
		view.collectionFilter = collectionFilter;
		toolbar.append(categoryFilter, collectionFilter, recentSort, searchButton);
	}
	const virtualList = mountPromptEntries(node, list, view, visibleEntries);
	view.virtualList = virtualList;
	node._aaalicePromptSelectorVirtualList = virtualList;
	virtualList.setActive?.(node._aaalicePromptSelectorViewportActive !== false);
	const missing = resolvePromptSelections(state, promptLibraryStore.snapshot.entries).filter((item) => item.missing).length;
	const footer = el("footer", "aa-prompt-selector-footer");
	const summaryCount = el("strong", null, String(state.selections.length));
	const summaryMissing = el("em", null, missing ? `${missing} ${t("aaalice.promptSelector.missingShort", "missing")}` : "");
	summaryMissing.hidden = !missing;
	const summary = el("button", { className: `aa-prompt-selector-summary${selectedOnly ? " is-active" : ""}${missing ? " is-error" : ""}`, attrs: {
		type: "button",
		"aria-pressed": String(selectedOnly),
		"aria-label": selectedOnly ? t("aaalice.promptSelector.showAll", "Show all matching prompts") : t("aaalice.promptSelector.showSelected", "Show selected prompts only"),
		title: selectedOnly ? t("aaalice.promptSelector.showAll", "Show all matching prompts") : t("aaalice.promptSelector.showSelected", "Show selected prompts only"),
	}, children: [
		el("span", { className: "aa-prompt-selector-count", children: [summaryCount] }),
		el("span", null, t("aaalice.promptSelector.selected", "selected")),
		summaryMissing,
	] });
	summary.disabled = !state.selections.length && !selectedOnly;
	summary.addEventListener("click", () => {
		node._aaalicePromptSelectedOnly = !Boolean(node._aaalicePromptSelectedOnly);
		node._aaalicePromptResetScroll = true;
		render(node);
	});
	bindSelectionSummary(summary, () => selectedPromptSummary(stateFor(node)));
	const clearAction = button({
		label: t("aaalice.promptSelector.clearAll", "Clear selected"),
		iconName: "close",
		variant: "ghost",
		size: "sm",
		className: "aa-prompt-selector-clear-action",
		onClick: () => mutate(node, clearPromptSelections),
	});
	clearAction.hidden = !state.selections.length;
	view.summary = summary;
	view.summaryCount = summaryCount;
	view.summaryMissing = summaryMissing;
	view.clearAction = clearAction;
	const manageLibrary = button({ label: t("aaalice.promptSelector.manageLibrary", "Manage library"), iconName: "note", variant: "ghost", size: "sm", onClick: () => openWorkspace("library") });
	const actions = el("div", { className: "aa-prompt-selector-footer-actions", children: [manageLibrary] });
	footer.append(summary, clearAction, actions);
	root.append(toolbar, list, footer);
	node._aaalicePromptSelectorView = view;
	list.scrollTop = listScrollTop;
	virtualList.refresh();
	if (node._aaalicePromptWeightFocusEntryId) {
		const entryId = node._aaalicePromptWeightFocusEntryId; node._aaalicePromptWeightFocusEntryId = null;
		queueMicrotask(() => [...root.querySelectorAll(".aa-prompt-selector-weight")].find((item) => item.dataset.weightEntryId === entryId)?.focus({ preventScroll: true }));
	}
}

export function createPromptSelectorControl(node) {
	node.properties ||= {};
	const controller = {
		get graph() { return node.graph; },
		get properties() { node.properties ||= {}; return node.properties; },
		set properties(value) { node.properties = value; },
		_aaalicePromptSelectorHost: node,
		_aaalicePromptRecentFirst: true,
		_aaalicePromptSelectorViewportActive: true,
	};
	const root = isolate(el("div", { className: "aa-prompt-selector aa-control-prompt-selector", attrs: { "data-capture-wheel": "true" } }));
	controller._aaalicePromptSelectorRoot = root;
	controller._aaalicePromptSelectorVisibility = observeDOMWidgetVisibility(root, { onChange: (active) => {
		controller._aaalicePromptSelectorViewportActive = active;
		controller._aaalicePromptSelectorVirtualList?.setActive?.(active);
		if (active) render(controller);
	} });
	const update = () => render(controller);
	controller._aaalicePromptSelectorUpdate = update;
	render(controller);
	node._aaalicePromptSelectorSidebarViews ||= new Set();
	node._aaalicePromptSelectorSidebarViews.add(update);
	const onLibraryChange = update;
	promptLibraryStore.addEventListener("change", onLibraryChange);
	return {
		root,
		update: () => render(controller),
		destroy: () => {
			promptLibraryStore.removeEventListener("change", onLibraryChange);
			node._aaalicePromptSelectorSidebarViews?.delete(update);
			controller._aaalicePromptSelectorVisibility?.destroy?.();
			controller._aaalicePromptSelectorVisibility = null;
			controller._aaalicePromptSelectorView = null;
			closePromptSurfaces(controller); destroyVirtualLists(root); root.remove();
		},
	};
}

function setup(node, loaded = false) {
	if (!isSelector(node) || node._aaalicePromptSelectorMounted) return;
	node._aaalicePromptSelectorMounted = true; stateFor(node);
	node._aaalicePromptSelectorSidebarViews ||= new Set();
	node._aaalicePromptSelectorControl = {
		getValue: () => structuredClone(stateFor(node)),
		setValue: (next) => { node.properties[PROPERTY] = normalizePromptSelectorState(next); render(node); notifySidebarViews(node); },
		validatePresetValue: (entry) => {
			const value = entry?.payload;
			if (entry?.valueType !== "prompt-selector" || !value || value.version !== 1) return "type-mismatch";
			if (!Array.isArray(value.selections) || typeof value.separator !== "string") return "invalid-prompt-selector";
			const seen = new Set();
			for (const selection of value.selections) {
				if (!selection || typeof selection.entryId !== "string" || !selection.entryId || seen.has(selection.entryId) || typeof selection.weight !== "number" || !Number.isFinite(selection.weight) || selection.weight < 0 || selection.weight > 20) return "invalid-prompt-selector";
				seen.add(selection.entryId);
			}
			return true;
		},
		createSidebarControl: () => createPromptSelectorControl(node),
	};
	const root = isolate(el("div", { className: "aa-prompt-selector", attrs: { "data-capture-wheel": "true" } })); node._aaalicePromptSelectorRoot = root;
	node._aaalicePromptSelectorViewportActive = true;
	node._aaalicePromptSelectorVisibility = observeDOMWidgetVisibility(root, { onChange: (active) => {
		node._aaalicePromptSelectorViewportActive = active;
		node._aaalicePromptSelectorVirtualList?.setActive?.(active);
		if (active) render(node);
	} });
	addLifecycleDOMWidget(node, "aaalice_prompt_selector", "custom", root, { serialize: false, hideOnZoom: true, margin: 0, getMinHeight: () => MIN_WIDGET_HEIGHT, getValue: () => "", setValue: () => {} });
	installDomWidgetResizePassthrough(node, root);
	const previousMenu = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (_canvas, options = []) {
		const result = previousMenu?.apply(this, arguments); const target = Array.isArray(result) ? result : options;
		const label = t("aaalice.promptSelector.separatorMenu", "⚙️ Set prompt separator…");
		if (!target.some((item) => item?.content === label)) target.push({ content: label, callback: () => openSeparatorEditor(this) });
		return result;
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () { const result = previousConfigure?.apply(this, arguments); stateFor(this); render(this); notifySidebarViews(this); return result; };
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () { if (this._aaalicePromptFilterFrame) cancelAnimationFrame(this._aaalicePromptFilterFrame); this._aaalicePromptSelectorVisibility?.destroy?.(); this._aaalicePromptSelectorVisibility = null; this._aaalicePromptSelectorVirtualList = null; this._aaalicePromptSelectorView = null; this._aaalicePromptSelectorControl = null; this._aaalicePromptSelectorSidebarViews?.clear?.(); closePromptSurfaces(this); destroyVirtualLists(this._aaalicePromptSelectorRoot); cleanupDomWidgetResizePassthrough(this); this._aaalicePromptSelectorRoot?.remove(); return previousRemoved?.apply(this, arguments); };
	const previousCompute = node.computeSize;
	node.computeSize = function () { const size = previousCompute?.apply(this, arguments) || [MIN_WIDTH, MIN_HEIGHT]; return [Math.max(MIN_WIDTH, size[0]), Math.max(MIN_HEIGHT, size[1])]; };
	render(node); if (!loaded) node.setSize?.(DEFAULT_SIZE);
}

function installPromptHook() {
	if (app._aaalicePromptSelectorPromptHook) return; app._aaalicePromptSelectorPromptHook = true;
	const original = app.graphToPrompt?.bind(app); if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for PromptSelector");
	app.graphToPrompt = async function (...args) {
		const result = await original(...args); const output = result?.output ?? result;
		const usedEntryIds = new Set();
		for (const node of allGraphNodes(app.graph).filter(isSelector)) {
			const promptNodes = promptNodesForGraphNode(output, node); if (!promptNodes.length) continue;
			const payload = materializePromptPayload(stateFor(node), promptLibraryStore.snapshot.entries);
			const selectionPayloadJson = JSON.stringify(payload);
			for (const promptNode of promptNodes) { promptNode.inputs ||= {}; promptNode.inputs.selection_payload_json = selectionPayloadJson; }
			for (const selection of payload.selections) if (selection.text != null) usedEntryIds.add(selection.entryId);
		}
		if (usedEntryIds.size) void promptLibraryStore.recordUsage([...usedEntryIds]).catch((error) => libraryActionError(t("aaalice.promptSelector.recentUsageFailed", "Could not update recent prompts"), error));
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.PromptSelector",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name !== NODE) return; const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); setup(this, false); return result; }; },
	nodeCreated(node) { if (isSelector(node)) setup(node, false); }, loadedGraphNode(node) { if (isSelector(node)) setup(node, true); },
	setup() { installPromptHook(); let refreshFrame = 0; promptLibraryStore.addEventListener("change", () => { if (refreshFrame) return; refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; for (const node of allGraphNodes(app.graph)) if (isSelector(node) && node._aaalicePromptSelectorRoot?.isConnected) render(node); }); }); for (const node of allGraphNodes(app.graph)) if (isSelector(node)) setup(node, true); },
});
