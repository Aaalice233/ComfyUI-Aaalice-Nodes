/** PromptSelector node UI and execution payload injection. */

import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { installDomWidgetResizePassthrough, cleanupDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { promptLibraryStore } from "./lib/library_store.js";
import {
	materializePromptPayload, normalizePromptSelectorState, reorderPromptSelection,
	resolvePromptSelections, setPromptWeight, togglePromptSelection,
} from "./lib/prompt_selector_model.js";
import { button, createDialog, el, emptyState, field, icon, iconButton, isolate } from "./lib/ui.js";

const NODE = "PromptSelector";
const PROPERTY = "promptSelectorState";
const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;

function isSelector(node) { return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE); }
function stateFor(node) { node.properties ||= {}; node.properties[PROPERTY] = normalizePromptSelectorState(node.properties[PROPERTY]); return node.properties[PROPERTY]; }

function mutate(node, callback) {
	node.graph?.beforeChange?.();
	try { node.properties[PROPERTY] = normalizePromptSelectorState(callback(stateFor(node))); }
	finally { node.graph?.afterChange?.(); node.graph?.setDirtyCanvas?.(true, true); render(node); }
}

function filteredEntries(node) {
	const query = String(node._aaalicePromptQuery || "").trim().toLocaleLowerCase();
	const category = node._aaalicePromptCategory || "";
	const collection = node._aaalicePromptCollection || "";
	return promptLibraryStore.snapshot.entries.filter((entry) => {
		if (category && entry.categoryId !== category) return false;
		if (collection && !(entry.collections || []).some((item) => item.collectionId === collection)) return false;
		return !query || `${entry.title}\n${entry.text}\n${entry.note || ""}`.toLocaleLowerCase().includes(query);
	});
}

function select(label, value, options, onChange) {
	const control = document.createElement("select"); control.setAttribute("aria-label", label);
	control.add(new Option(label, "", false, !value));
	for (const option of options) control.add(new Option(option.name, option.id, false, option.id === value));
	control.addEventListener("change", () => onChange(control.value)); return control;
}

function openSelectedEditor(node) {
	const body = el("div", "aa-prompt-selected-editor");
	const draw = () => {
		body.replaceChildren();
		const resolved = resolvePromptSelections(stateFor(node), promptLibraryStore.snapshot.entries);
		if (!resolved.length) { body.append(emptyState({ description: t("aaalice.promptSelector.emptySelected", "No prompts selected.") })); return; }
		resolved.forEach((item, index) => {
			const row = el("div", { className: `aa-prompt-selected-row${item.missing ? " is-missing" : ""}`, attrs: { draggable: true, "data-entry-id": item.entryId } });
			row.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", item.entryId));
			row.addEventListener("dragover", (event) => event.preventDefault());
			row.addEventListener("drop", (event) => {
				event.preventDefault(); const source = event.dataTransfer?.getData("text/plain");
				if (source) mutate(node, (state) => reorderPromptSelection(state, source, index)); draw();
			});
			row.append(el("span", { className: "aa-prompt-selected-drag", children: [icon("drag")] }), el("div", { className: "aa-prompt-selected-copy", children: [
				el("strong", null, item.entry?.title || t("aaalice.promptSelector.missing", "Missing library entry")),
				el("small", null, item.entry?.text || item.entryId),
			] }));
			const weight = document.createElement("input"); weight.type = "number"; weight.min = "0"; weight.max = "20"; weight.step = "0.01"; weight.value = String(item.weight); weight.setAttribute("aria-label", t("aaalice.promptSelector.weight", "Weight"));
			weight.addEventListener("change", () => { mutate(node, (state) => setPromptWeight(state, item.entryId, Number(weight.value))); draw(); });
			row.append(weight, iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", onClick: () => { mutate(node, (state) => togglePromptSelection(state, item.entryId, false)); draw(); } }));
			body.append(row);
		});
	};
	const footer = el("div", { children: [button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => dialog.close() })] });
	const dialog = createDialog({ title: t("aaalice.promptSelector.manage", "Manage selected prompts"), body, footer, size: "lg" });
	draw(); dialog.open();
}

function openSeparatorEditor(node) {
	const input = document.createElement("input"); input.value = stateFor(node).separator;
	const body = el("div", { children: [field({ label: t("aaalice.promptSelector.separator", "Prompt separator"), control: input })] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.promptSelector.separator", "Prompt separator"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { mutate(node, (state) => ({ ...state, separator: input.value })); dialog.close(); } }));
	dialog.open(); input.focus();
}

function renderPromptEntries(node, list, state) {
	list.replaceChildren();
	const selected = new Set(state.selections.map((item) => item.entryId));
	for (const entry of filteredEntries(node)) {
		const isSelected = selected.has(entry.id);
		const label = el("label", `aa-prompt-selector-row${isSelected ? " is-selected" : ""}`);
		const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = selected.has(entry.id);
		checkbox.addEventListener("change", () => mutate(node, (current) => togglePromptSelection(current, entry.id, checkbox.checked)));
		const category = promptLibraryStore.snapshot.categories.find((item) => item.id === entry.categoryId)?.name;
		label.append(checkbox, el("span", { className: "aa-prompt-selector-copy", children: [
			el("span", { className: "aa-prompt-selector-title", children: [el("strong", null, entry.title), ...(category ? [el("em", null, category)] : [])] }),
			el("small", null, entry.text),
		] })); list.append(label);
	}
	if (!list.children.length) list.append(emptyState({ iconName: "note", className: "aa-prompt-selector-empty", title: t("aaalice.promptSelector.noResultsTitle", "No prompts found"), description: t("aaalice.promptSelector.noResults", "No matching prompt entries.") }));
}

function render(node) {
	const root = node._aaalicePromptSelectorRoot;
	if (!root) return;
	root.replaceChildren();
	const state = stateFor(node);
	const list = el("div", "aa-prompt-selector-list");
	const query = String(node._aaalicePromptQuery || "");
	const searchOpen = Boolean(node._aaalicePromptSearchOpen);
	const toolbar = el("div", { className: `aa-prompt-selector-toolbar${searchOpen ? " is-searching" : ""}`, attrs: { role: "search", "aria-label": t("aaalice.promptSelector.filters", "Prompt filters") } });
	if (searchOpen) {
		const search = document.createElement("input"); search.type = "search"; search.placeholder = t("aaalice.promptSelector.search", "Search prompt library"); search.value = query;
		search.addEventListener("input", () => { node._aaalicePromptQuery = search.value; renderPromptEntries(node, list, state); });
		search.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); node._aaalicePromptSearchOpen = false; render(node); } });
		const searchPanel = el("div", { className: "aa-prompt-selector-search", children: [icon("search"), search,
			iconButton({ iconName: "close", label: t("aaalice.promptSelector.collapseSearch", "Collapse search"), variant: "ghost", onClick: () => { node._aaalicePromptSearchOpen = false; render(node); } }),
		] });
		toolbar.append(searchPanel);
		if (node._aaalicePromptSearchShouldFocus) {
			node._aaalicePromptSearchShouldFocus = false;
			queueMicrotask(() => { if (search.isConnected) { search.focus({ preventScroll: true }); search.setSelectionRange(search.value.length, search.value.length); } });
		}
	} else {
		const searchLabel = query ? `${t("aaalice.promptSelector.search", "Search prompt library")}: ${query}` : t("aaalice.promptSelector.openSearch", "Open search");
		const searchButton = iconButton({ iconName: "search", label: searchLabel, active: Boolean(query), variant: "secondary", className: "aa-prompt-selector-search-toggle", onClick: () => { node._aaalicePromptSearchOpen = true; node._aaalicePromptSearchShouldFocus = true; render(node); } });
		searchButton.setAttribute("aria-pressed", String(Boolean(query)));
		toolbar.append(
			searchButton,
			select(t("aaalice.promptSelector.allCategories", "All categories"), node._aaalicePromptCategory, promptLibraryStore.snapshot.categories, (value) => { node._aaalicePromptCategory = value; render(node); }),
			select(t("aaalice.promptSelector.allCollections", "All collections"), node._aaalicePromptCollection, promptLibraryStore.snapshot.collections, (value) => { node._aaalicePromptCollection = value; render(node); }),
		);
	}
	renderPromptEntries(node, list, state);
	const missing = resolvePromptSelections(state, promptLibraryStore.snapshot.entries).filter((item) => item.missing).length;
	const footer = el("footer", "aa-prompt-selector-footer");
	const summary = el("span", { className: `aa-prompt-selector-summary${missing ? " is-error" : ""}`, children: [
		el("span", { className: "aa-prompt-selector-count", children: [el("strong", null, String(state.selections.length))] }),
		el("span", null, t("aaalice.promptSelector.selected", "selected")),
		...(missing ? [el("em", null, `${missing} ${t("aaalice.promptSelector.missingShort", "missing")}`)] : []),
	] });
	footer.append(summary, button({ label: t("aaalice.promptSelector.manageShort", "Manage"), iconName: "settings", variant: "ghost", size: "sm", disabled: !state.selections.length, onClick: () => openSelectedEditor(node) }));
	root.append(toolbar, list, footer);
}

function setup(node, loaded = false) {
	if (!isSelector(node) || node._aaalicePromptSelectorMounted) return;
	node._aaalicePromptSelectorMounted = true; stateFor(node);
	const root = isolate(el("div", "aa-prompt-selector")); node._aaalicePromptSelectorRoot = root;
	node.addDOMWidget("aaalice_prompt_selector", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getMinHeight: () => MIN_HEIGHT, getValue: () => "", setValue: () => {} });
	installDomWidgetResizePassthrough(node, root);
	const previousMenu = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (_canvas, options = []) {
		const result = previousMenu?.apply(this, arguments); const target = Array.isArray(result) ? result : options;
		const label = t("aaalice.promptSelector.separatorMenu", "⚙️ Set prompt separator…");
		if (!target.some((item) => item?.content === label)) target.push({ content: label, callback: () => openSeparatorEditor(this) });
		return result;
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () { const result = previousConfigure?.apply(this, arguments); stateFor(this); render(this); return result; };
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () { cleanupDomWidgetResizePassthrough(this); this._aaalicePromptSelectorRoot?.remove(); return previousRemoved?.apply(this, arguments); };
	const previousCompute = node.computeSize;
	node.computeSize = function () { const size = previousCompute?.apply(this, arguments) || [MIN_WIDTH, MIN_HEIGHT]; return [Math.max(MIN_WIDTH, size[0]), Math.max(MIN_HEIGHT, size[1])]; };
	render(node); if (!loaded) node.setSize?.(node.computeSize());
}

function installPromptHook() {
	if (app._aaalicePromptSelectorPromptHook) return; app._aaalicePromptSelectorPromptHook = true;
	const original = app.graphToPrompt?.bind(app); if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for PromptSelector");
	app.graphToPrompt = async function (...args) {
		const result = await original(...args); const output = result?.output ?? result;
		for (const node of (app.graph?._nodes || []).filter(isSelector)) {
			const promptNode = output?.[String(node.id)]; if (!promptNode) continue;
			promptNode.inputs ||= {}; promptNode.inputs.selection_payload_json = JSON.stringify(materializePromptPayload(stateFor(node), promptLibraryStore.snapshot.entries));
		}
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.PromptSelector",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name !== NODE) return; const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); setup(this, false); return result; }; },
	nodeCreated(node) { if (isSelector(node)) setup(node, false); }, loadedGraphNode(node) { if (isSelector(node)) setup(node, true); },
	setup() { installPromptHook(); promptLibraryStore.addEventListener("change", () => { for (const node of app.graph?._nodes || []) if (isSelector(node)) render(node); }); for (const node of app.graph?._nodes || []) if (isSelector(node)) setup(node, true); },
});
