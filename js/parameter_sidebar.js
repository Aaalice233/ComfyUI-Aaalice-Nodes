/** Workflow-scoped Operation Panel with pages, sections, cards and page value presets. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	EVENT_OPERATION_CHANGED,
	EVENT_PARAMETER_LIST,
	OPERATION_PROPERTY,
	cloneData,
	displayName,
	ensureParameters,
	isParameterPanel,
	newStableId,
	notifyParameterChanged,
	notifyParameterListChanged,
} from "./lib/param_model.js";
import { deleteOperationPreset, loadOperationPresets, saveOperationPreset } from "./lib/operation_preset_store.js";
import { badge, button, card, createDialog, el, emptyState, field as uiField, iconButton, sectionHeader, tabs as tabList } from "./lib/ui.js";
import { createParameterControl, createSelectControl, createSwitchControl } from "./lib/parameter_controls.js";

const SIDEBAR_ID = "aaalice-operation-panel";
const adapters = new Map();
let sidebarRoot = null;
let fullscreenRoot = null;
let layoutMode = false;

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({ severity, summary: t("aaalice.packageName", "Aaalice Nodes"), detail, life: 4500 });
}

async function confirmAction(text) {
	if (app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({ title: t("aaalice.common.confirm", "Confirm"), message: text }));
	return globalThis.confirm(text);
}

async function promptText(title, value = "") {
	if (app.extensionManager?.dialog?.prompt) return app.extensionManager.dialog.prompt({ title, message: title, defaultValue: String(value) });
	return globalThis.prompt(title, String(value));
}

function modal(title, render) {
	return new Promise((resolve) => {
		const body = el("div", "aaalice-modal-body");
		let settled = false;
		const dialogApi = createDialog({
			title,
			body,
			size: "md",
			onRequestClose: () => { if (!settled) { settled = true; resolve(null); } return true; },
		});
		const close = (value) => {
			if (settled) return;
			settled = true;
			dialogApi.close(value);
			resolve(value);
		};
		render(body, close);
	});
}

function defaultState() {
	return {
		version: 2,
		active_page_id: "page_main",
		pages: [{ id: "page_main", name: t("aaalice.operation.defaultPage", "Main"), order: 0, sections: [{ id: "section_general", name: t("aaalice.operation.defaultSection", "General"), order: 0 }] }],
		nodes: {},
	};
}

function operationState(graph = app.graph, create = false) {
	if (!graph) return null;
	graph.extra ||= {};
	let state = graph.extra[OPERATION_PROPERTY];
	if (state?.version !== 2) {
		if (!create) return null;
		state = defaultState();
		graph.extra[OPERATION_PROPERTY] = state;
	}
	state.pages ||= [];
	state.nodes ||= {};
	if (!state.pages.length) state.pages = defaultState().pages;
	if (!state.pages.some((page) => page.id === state.active_page_id)) state.active_page_id = state.pages[0].id;
	for (const page of state.pages) {
		page.sections ||= [];
		if (!page.sections.length) page.sections.push({ id: newStableId("section"), name: t("aaalice.operation.defaultSection", "General"), order: 0 });
	}
	return state;
}

function activePage(state = operationState(app.graph, true)) {
	return state.pages.find((page) => page.id === state.active_page_id) || state.pages[0];
}

function nodeEntry(node, create = false) {
	const state = operationState(node?.graph, create);
	if (!state || node?.id == null) return null;
	let entry = state.nodes[String(node.id)];
	if (!entry && create) {
		const page = activePage(state);
		entry = {
			enabled: true,
			page_id: page.id,
			section_id: page.sections[0].id,
			order: Object.values(state.nodes).filter((item) => item.page_id === page.id).length,
			hidden: false,
			label_override: "",
			row: 0,
			col: 0,
			preset_key: "",
		};
		state.nodes[String(node.id)] = entry;
	}
	return entry || null;
}

function markDirty(node = null) {
	(node?.graph || app.graph)?.setDirtyCanvas?.(true, true);
	window.dispatchEvent(new CustomEvent(EVENT_OPERATION_CHANGED));
}

function cardTitle(item) {
	return item.entry.label_override || item.node.getTitle?.() || item.node.title || item.node.type || message("aaalice.operation.nodeFallback", "Node {id}", { id: item.node.id });
}

function collectItems(pageId = null) {
	const state = operationState(app.graph, true);
	const nodes = new Map((app.graph?._nodes || []).map((node) => [String(node.id), node]));
	return Object.entries(state.nodes)
		.map(([id, entry]) => ({ node: nodes.get(id), entry }))
		.filter((item) => item.node && item.entry.enabled && (!pageId || item.entry.page_id === pageId))
		.sort((a, b) => Number(a.entry.order || 0) - Number(b.entry.order || 0));
}

function registerNode(node, automatic = false) {
	const entry = nodeEntry(node, true);
	if (!entry) return false;
	entry.enabled = true;
	if (automatic && !entry.page_id) {
		const page = activePage();
		entry.page_id = page.id;
		entry.section_id = page.sections[0].id;
	}
	markDirty(node);
	renderAll();
	return true;
}

async function removeNode(node) {
	const entry = nodeEntry(node);
	if (!entry?.enabled) return;
	if (!(await confirmAction(t("aaalice.operation.removeConfirm", "Remove this node from Operation Panel?")))) return;
	entry.enabled = false;
	markDirty(node);
	renderAll();
}

function field(label, input) {
	return uiField({ label, control: input });
}

function setWidget(widget, value, node) {
	widget.value = value;
	widget.callback?.(value, app.canvas, node, app.canvas?.graph_mouse);
	markDirty(node);
}

function supportedWidgets(node, entry = nodeEntry(node)) {
	const filter = entry?.widgets;
	return (node.widgets || []).filter((widget) => {
		if (!widget?.name || widget.serialize === false || widget.type === "button") return false;
		if (Array.isArray(filter) && !filter.includes(widget.name)) return false;
		return ["number", "slider", "toggle", "combo", "text", "string", "converted-widget", "BOOLEAN", "INT", "FLOAT", "STRING", "COMBO"].includes(widget.type) || widget.options?.values;
	});
}

function parameterControl(parameter, node) {
	const update = () => notifyParameterChanged(node, { structure: false });
	if (parameter.param_type === "image") {
		const input = document.createElement("input");
		input.value = parameter.value?.filename || "";
		input.addEventListener("change", () => { parameter.value = input.value.trim() ? { filename: input.value.trim(), subfolder: "", type: "input" } : null; update(); });
		return input;
	}
	return createParameterControl({ parameter, mode: "sidebar", onChange: update, labels: { input: displayName(parameter), select: displayName(parameter), switch: displayName(parameter) } });
}

function renderParameterPanel(container, item) {
	for (const parameter of ensureParameters(item.node)) {
		if (parameter.param_type === "separator") {
			container.append(el("div", "aaalice-pcp-section", displayName(parameter)));
			continue;
		}
		const row = el("label", "aaalice-operation-row");
		const label = el("span", "aaalice-operation-label", displayName(parameter));
		if (parameter.description) label.title = parameter.description;
		row.append(label, parameterControl(parameter, item.node));
		container.append(row);
	}
	if (!ensureParameters(item.node).length) container.append(emptyState({ description: t("aaalice.operation.emptyPanel", "This parameter panel is empty."), iconName: "settings" }));
}

function renderNodeResults(container, node) {
	if (!node.imgs?.length) return;
	const results = el("div", "aaalice-operation-results");
	for (const source of node.imgs) {
		const image = document.createElement("img");
		image.src = source?.src || source?.url || String(source || "");
		image.alt = node.title || node.type || t("aaalice.operation.result", "Result");
		results.append(image);
	}
	container.append(results);
}

function renderGeneric(container, item) {
	const adapter = adapters.get(item.node.comfyClass || item.node.type);
	if (adapter) adapter.render(container, item, { app, markDirty, t });
	else for (const widget of supportedWidgets(item.node, item.entry)) {
		const row = el("label", "aaalice-operation-row");
		row.append(el("span", "aaalice-operation-label", widget.label || widget.name));
		let control;
		const options = widget.options?.values || (Array.isArray(widget.options) ? widget.options : null);
		if (options) {
			control = createSelectControl(options, widget.value, { ariaLabel: widget.label || widget.name, onChange: (value) => setWidget(widget, value, item.node) });
		} else if (["toggle", "BOOLEAN"].includes(widget.type) || typeof widget.value === "boolean") {
			control = createSwitchControl(widget.value, { ariaLabel: widget.label || widget.name, onChange: (value) => setWidget(widget, value, item.node) });
		} else {
			control = document.createElement("input");
			control.type = typeof widget.value === "number" ? "number" : "text";
			control.value = widget.value ?? "";
			control.addEventListener("change", () => setWidget(widget, control.type === "number" ? Number(control.value) : control.value, item.node));
		}
		row.append(control);
		container.append(row);
	}
	renderNodeResults(container, item.node);
}

function presetControls(item) {
	const adapter = adapters.get(item.node.comfyClass || item.node.type);
	if (adapter?.getPresetControls) return adapter.getPresetControls(item, { app, t }) || [];
	if (isParameterPanel(item.node)) return ensureParameters(item.node)
		.filter((parameter) => parameter.param_type !== "separator")
		.map((parameter) => ({
			key: parameter.id,
			label: displayName(parameter),
			read: () => cloneData(parameter.value),
			validate: (value) => {
				if (["slider", "seed"].includes(parameter.param_type) && !Number.isFinite(Number(value))) return t("aaalice.operation.preset.invalidNumber", "Value must be numeric.");
				if (parameter.param_type === "switch" && typeof value !== "boolean") return t("aaalice.operation.preset.invalidBoolean", "Value must be boolean.");
				if (parameter.param_type === "taglist" && !Array.isArray(value)) return t("aaalice.operation.preset.invalidList", "Value must be a list.");
				if (["dropdown", "enum"].includes(parameter.param_type) && !(parameter.config?.options || []).includes(value)) return t("aaalice.operation.preset.invalidOption", "Option is unavailable.");
				return null;
			},
			write: (value) => { parameter.value = cloneData(value); },
		}));
	return supportedWidgets(item.node, item.entry).map((widget) => ({
		key: widget.name,
		label: widget.label || widget.name,
		read: () => cloneData(widget.value),
		validate: (value) => {
			const options = widget.options?.values || (Array.isArray(widget.options) ? widget.options : null);
			if (options && !options.map(String).includes(String(value))) return t("aaalice.operation.preset.invalidOption", "Option is unavailable.");
			if (typeof widget.value === "number" && !Number.isFinite(Number(value))) return t("aaalice.operation.preset.invalidNumber", "Value must be numeric.");
			return null;
		},
		write: (value) => {
			widget.value = cloneData(value);
			widget.callback?.(widget.value, app.canvas, item.node, app.canvas?.graph_mouse);
		},
	}));
}

function renderLayoutEditor(card, item, state) {
	const editor = el("div", "aaalice-layout-editor");
	const select = (label, values, current, onChange) => {
		const input = createSelectControl(values, current, { ariaLabel: label, onChange: (value) => { onChange(value); markDirty(item.node); renderAll(); } });
		editor.append(field(label, input));
	};
	select(t("aaalice.operation.page", "Page"), state.pages.map((page) => ({ label: page.name, value: page.id })), item.entry.page_id, (value) => {
		item.entry.page_id = value;
		item.entry.section_id = state.pages.find((page) => page.id === value).sections[0].id;
	});
	const page = state.pages.find((candidate) => candidate.id === item.entry.page_id) || activePage(state);
	select(t("aaalice.operation.section", "Section"), page.sections.map((section) => ({ label: section.name, value: section.id })), item.entry.section_id, (value) => { item.entry.section_id = value; });
	for (const [label, key, type] of [
		[t("aaalice.operation.alias", "Alias"), "label_override", "text"],
		[t("aaalice.operation.presetKey", "Preset key"), "preset_key", "text"],
		[t("aaalice.operation.order", "Order"), "order", "number"],
		[t("aaalice.operation.row", "Row"), "row", "number"],
		[t("aaalice.operation.column", "Column"), "col", "number"],
	]) {
		const input = document.createElement("input");
		input.type = type;
		input.value = item.entry[key] ?? "";
		input.addEventListener("change", () => { item.entry[key] = type === "number" ? Number(input.value) : input.value.trim(); markDirty(item.node); renderAll(); });
		editor.append(field(label, input));
	}
	const hidden = document.createElement("input");
	hidden.type = "checkbox";
	hidden.checked = Boolean(item.entry.hidden);
	hidden.addEventListener("change", () => { item.entry.hidden = hidden.checked; markDirty(item.node); renderAll(); });
	editor.append(field(t("aaalice.operation.hidden", "Hidden"), hidden));
	card.append(editor);
}

function renderCard(item, fullscreen, state) {
	const body = el("div");
	if (!item.entry.hidden || layoutMode) {
		if (isParameterPanel(item.node)) renderParameterPanel(body, item);
		else renderGeneric(body, item);
	}
	const cardElement = card({
		title: cardTitle(item),
		meta: badge(`#${item.node.id}`),
		body: (!item.entry.hidden || layoutMode) ? body : null,
		className: `aaalice-operation-card${item.entry.hidden ? " hidden-card" : ""}`,
	});
	if (fullscreen) {
		if (Number(item.entry.row) > 0) cardElement.style.gridRow = String(Number(item.entry.row));
		if (Number(item.entry.col) > 0) cardElement.style.gridColumn = String(Number(item.entry.col));
	}
	if (layoutMode) renderLayoutEditor(cardElement, item, state);
	return cardElement;
}

function slug(value) {
	return String(value || "card").trim().toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "card";
}

async function ensurePresetKeys(items) {
	const writable = items.filter((item) => presetControls(item).length);
	if (!writable.length) return [];
	const suggested = new Map(writable.map((item) => [item, item.entry.preset_key || ""]));
	const used = new Set([...suggested.values()].filter(Boolean).map((value) => value.toLocaleLowerCase()));
	for (const item of writable) if (!suggested.get(item)) {
		const base = slug(cardTitle(item));
		let candidate = base;
		for (let index = 2; used.has(candidate.toLocaleLowerCase()); index += 1) candidate = `${base}-${index}`;
		suggested.set(item, candidate);
		used.add(candidate.toLocaleLowerCase());
	}
	const accepted = await modal(t("aaalice.operation.preset.keys", "Configure preset keys"), (body, close) => {
		const inputs = [];
		const errors = el("div", "aaalice-pcp-error");
		for (const item of writable) {
			const input = document.createElement("input");
			input.value = suggested.get(item);
			inputs.push({ item, input });
			body.append(field(cardTitle(item), input));
		}
		const footer = el("div", "aaalice-modal-actions");
		const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary" });
		const save = button({ label: t("aaalice.common.save", "Save") });
		cancel.addEventListener("click", () => close(false));
		save.addEventListener("click", () => {
			const keys = inputs.map(({ input }) => input.value.trim());
			if (keys.some((key) => !key) || new Set(keys.map((key) => key.toLocaleLowerCase())).size !== keys.length) {
				errors.textContent = t("aaalice.operation.preset.keysUnique", "Preset keys must be non-empty and unique on the page.");
				return;
			}
			for (const { item, input } of inputs) item.entry.preset_key = input.value.trim();
			close(true);
		});
		footer.append(cancel, save);
		body.append(errors, footer);
	});
	if (!accepted) return null;
	markDirty();
	return writable;
}

async function savePagePreset() {
	const state = operationState(app.graph, true);
	const page = activePage(state);
	const items = await ensurePresetKeys(collectItems(page.id));
	if (!items) return;
	if (!items.length) return toast("warn", t("aaalice.operation.preset.noWritable", "This page has no writable cards."));
	const name = await promptText(t("aaalice.operation.preset.name", "Preset name"), page.name);
	if (!name?.trim()) return;
	const cards = items.map((item) => ({
		key: item.entry.preset_key,
		node_type: item.node.comfyClass || item.node.type,
		controls: Object.fromEntries(presetControls(item).map((control) => [control.key, cloneData(control.read())])),
	}));
	await saveOperationPreset({ name: name.trim(), cards });
	toast("success", t("aaalice.operation.preset.saved", "Page values saved."));
}

async function choosePreset(title) {
	const store = await loadOperationPresets();
	if (!store.presets.length) {
		toast("info", t("aaalice.operation.preset.empty", "No saved page presets."));
		return null;
	}
	return modal(title, (body, close) => {
		for (const preset of store.presets) {
			const choice = button({ label: preset.name, variant: "secondary", className: "aaalice-choice-btn", onClick: () => close(preset) });
			body.append(choice);
		}
	});
}

async function loadPagePreset() {
	const preset = await choosePreset(t("aaalice.operation.preset.load", "Load page values"));
	if (!preset) return;
	const state = operationState(app.graph, true);
	const items = await ensurePresetKeys(collectItems(activePage(state).id));
	if (!items) return;
	const byKey = new Map(items.map((item) => [item.entry.preset_key.toLocaleLowerCase(), item]));
	const changes = [];
	const differences = [];
	for (const card of preset.cards || []) {
		const item = byKey.get(String(card.key).toLocaleLowerCase());
		if (!item) {
			differences.push(`${card.key}: ${t("aaalice.operation.preset.missingCard", "missing card")}`);
			continue;
		}
		const nodeType = item.node.comfyClass || item.node.type;
		if (card.node_type && card.node_type !== nodeType) {
			differences.push(`${card.key}: ${t("aaalice.operation.preset.nodeTypeMismatch", "node type differs")}`);
			continue;
		}
		const controls = new Map(presetControls(item).map((control) => [control.key, control]));
		for (const [key, value] of Object.entries(card.controls || {})) {
			const control = controls.get(key);
			if (!control) {
				differences.push(`${card.key}.${key}: ${t("aaalice.operation.preset.missingControl", "missing control")}`);
				continue;
			}
			const error = control.validate?.(value);
			if (error) differences.push(`${card.key}.${key}: ${error}`);
			else changes.push({ item, control, value: cloneData(value), previous: cloneData(control.read()) });
		}
	}
	const presetKeys = new Set((preset.cards || []).map((card) => String(card.key).toLocaleLowerCase()));
	for (const item of items) if (!presetKeys.has(item.entry.preset_key.toLocaleLowerCase())) {
		differences.push(`${item.entry.preset_key}: ${t("aaalice.operation.preset.notInPreset", "not present in preset")}`);
	}
	const summary = [message("aaalice.operation.preset.matchSummary", "{count} value(s) can be applied.", { count: changes.length }), ...differences].join("\n");
	if (!changes.length || !(await confirmAction(summary))) return;
	const applied = [];
	try {
		for (const change of changes) {
			change.control.write(change.value);
			applied.push(change);
		}
	} catch (error) {
		for (const change of applied.reverse()) {
			try { change.control.write(change.previous); } catch (rollbackError) { console.error("[Aaalice] Preset rollback failed", rollbackError); }
		}
		throw error;
	}
	for (const node of new Set(changes.map((change) => change.item.node))) {
		if (isParameterPanel(node)) notifyParameterChanged(node, { structure: false });
		else markDirty(node);
	}
	renderAll();
	toast("success", t("aaalice.operation.preset.applied", "Page values applied."));
}

async function deletePagePreset() {
	const preset = await choosePreset(t("aaalice.operation.preset.delete", "Delete page preset"));
	if (!preset || !(await confirmAction(message("aaalice.operation.preset.deleteConfirm", "Delete preset {name}?", { name: preset.name })))) return;
	await deleteOperationPreset(preset.name);
	toast("success", t("aaalice.operation.preset.deleted", "Preset deleted."));
}

async function presetMenu() {
	const action = await modal(t("aaalice.operation.presets", "Presets"), (body, close) => {
		for (const [value, label] of [
			["save", t("aaalice.operation.preset.save", "Save current page values")],
			["load", t("aaalice.operation.preset.load", "Load page values")],
			["delete", t("aaalice.operation.preset.delete", "Delete page preset")],
		]) {
			const choice = button({ label, variant: "secondary", className: "aaalice-choice-btn", onClick: () => close(value) });
			body.append(choice);
		}
	});
	if (action === "save") await savePagePreset();
	else if (action === "load") await loadPagePreset();
	else if (action === "delete") await deletePagePreset();
}

async function addPage() {
	const state = operationState(app.graph, true);
	const name = await promptText(t("aaalice.operation.pageAdd", "New page name"), t("aaalice.operation.defaultPage", "Main"));
	if (!name?.trim()) return;
	if (state.pages.some((page) => page.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return toast("warn", t("aaalice.operation.pageNameUnique", "Page names must be unique."));
	const page = { id: newStableId("page"), name: name.trim(), order: state.pages.length, sections: [{ id: newStableId("section"), name: t("aaalice.operation.defaultSection", "General"), order: 0 }] };
	state.pages.push(page);
	state.active_page_id = page.id;
	markDirty();
	renderAll();
}

async function renamePage(page) {
	const name = await promptText(t("aaalice.operation.pageRename", "Rename page"), page.name);
	if (!name?.trim()) return;
	const state = operationState(app.graph, true);
	if (state.pages.some((candidate) => candidate.id !== page.id && candidate.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return toast("warn", t("aaalice.operation.pageNameUnique", "Page names must be unique."));
	page.name = name.trim();
	markDirty();
	renderAll();
}

function moveOrdered(items, item, delta) {
	const ordered = [...items].sort((a, b) => Number(a.order) - Number(b.order));
	const index = ordered.findIndex((candidate) => candidate.id === item.id);
	const target = index + delta;
	if (index < 0 || target < 0 || target >= ordered.length) return;
	[ordered[index], ordered[target]] = [ordered[target], ordered[index]];
	ordered.forEach((candidate, order) => { candidate.order = order; });
	markDirty();
	renderAll();
}

async function deletePage(page) {
	const state = operationState(app.graph, true);
	if (state.pages.length === 1) return toast("warn", t("aaalice.operation.pageKeepOne", "At least one page is required."));
	if (!(await confirmAction(message("aaalice.operation.pageDeleteConfirm", "Delete page {name}? Its cards will move to another page.", { name: page.name })))) return;
	const target = state.pages.find((candidate) => candidate.id === "page_main" && candidate.id !== page.id) || state.pages.find((candidate) => candidate.id !== page.id);
	for (const entry of Object.values(state.nodes)) if (entry.page_id === page.id) {
		entry.page_id = target.id;
		entry.section_id = target.sections[0].id;
	}
	state.pages = state.pages.filter((candidate) => candidate.id !== page.id);
	state.active_page_id = target.id;
	markDirty();
	renderAll();
}

async function addSection(page) {
	const name = await promptText(t("aaalice.operation.sectionAdd", "New section name"), t("aaalice.operation.defaultSection", "General"));
	if (!name?.trim()) return;
	if (page.sections.some((section) => section.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return toast("warn", t("aaalice.operation.sectionNameUnique", "Section names must be unique within a page."));
	page.sections.push({ id: newStableId("section"), name: name.trim(), order: page.sections.length });
	markDirty();
	renderAll();
}

async function renameSection(page, section) {
	const name = await promptText(t("aaalice.operation.sectionRename", "Rename section"), section.name);
	if (!name?.trim()) return;
	if (page.sections.some((candidate) => candidate.id !== section.id && candidate.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return toast("warn", t("aaalice.operation.sectionNameUnique", "Section names must be unique within a page."));
	section.name = name.trim();
	markDirty();
	renderAll();
}

async function deleteSection(page, section) {
	if (page.sections.length === 1) return toast("warn", t("aaalice.operation.sectionKeepOne", "At least one section is required."));
	const target = page.sections.find((candidate) => candidate.id !== section.id);
	for (const entry of Object.values(operationState(app.graph, true).nodes)) if (entry.page_id === page.id && entry.section_id === section.id) entry.section_id = target.id;
	page.sections = page.sections.filter((candidate) => candidate.id !== section.id);
	markDirty();
	renderAll();
}

function renderOperation(root, fullscreen = false) {
	root.replaceChildren();
	root.className = `aaalice-pcp aaalice-operation${fullscreen ? " fullscreen-content" : ""}`;
	const state = operationState(app.graph, true);
	const page = activePage(state);
	const toolbar = el("div", "aaalice-operation-toolbar");
	const heading = el("div", "aaalice-operation-heading");
	heading.append(
		el("strong", null, t("aaalice.operation.title", "Operation Panel")),
		el("span", null, t("aaalice.operation.subtitle", "Tune the workflow without leaving its operating surface.")),
	);
	const actions = el("div", "aaalice-operation-actions");
	const presets = button({ label: t("aaalice.operation.presets", "Presets"), iconName: "presets", variant: "secondary", size: "sm" });
	presets.addEventListener("click", () => presetMenu().catch((error) => toast("error", error.message || String(error))));
	const layout = button({ label: t("aaalice.operation.layout", "Layout"), iconName: "layout", variant: "secondary", size: "sm", active: layoutMode });
	layout.setAttribute("aria-pressed", String(layoutMode));
	layout.addEventListener("click", () => { layoutMode = !layoutMode; renderAll(); });
	const full = button({ label: fullscreen ? t("aaalice.operation.exitFullscreen", "Exit fullscreen") : t("aaalice.operation.fullscreen", "Fullscreen"), iconName: "fullscreen", variant: "secondary", size: "sm" });
	full.addEventListener("click", () => fullscreen ? exitFullscreen() : enterFullscreen());
	actions.append(presets, layout, full);
	toolbar.append(heading, actions);
	root.append(toolbar);
	const orderedPages = [...state.pages].sort((a, b) => Number(a.order) - Number(b.order));
	const pages = tabList(orderedPages.map((candidate) => ({ id: candidate.id, label: candidate.name })), {
		activeId: page.id,
		ariaLabel: t("aaalice.operation.pagesAria", "Operation pages"),
		className: "aaalice-operation-pages",
		onSelect: (id) => { state.active_page_id = id; markDirty(); renderAll(); },
	});
	if (layoutMode) {
		pages.append(iconButton({ iconName: "add", label: t("aaalice.operation.pageAdd", "Add page"), variant: "ghost", onClick: addPage }));
	}
	root.append(pages);
	if (layoutMode) {
		root.append(el("div", "aaalice-operation-layout-banner", t("aaalice.operation.layoutHint", "Layout mode changes page organization only; workflow nodes and links stay untouched.")));
		const pageTools = el("div", "aaalice-operation-page-tools");
		for (const [label, action] of [
			[t("aaalice.operation.pageRename", "Rename page"), () => renamePage(page)],
			[t("aaalice.operation.moveLeft", "Move left"), () => moveOrdered(state.pages, page, -1)],
			[t("aaalice.operation.moveRight", "Move right"), () => moveOrdered(state.pages, page, 1)],
			[t("aaalice.operation.pageDelete", "Delete page"), () => deletePage(page)],
			[t("aaalice.operation.sectionAdd", "Add section"), () => addSection(page)],
		]) {
			pageTools.append(button({ label, variant: "secondary", size: "sm", onClick: action }));
		}
		root.append(pageTools);
	}
	const items = collectItems(page.id);
	if (!items.length) {
		root.append(emptyState({
			title: t("aaalice.operation.emptyTitle", "Nothing on this page yet"),
			description: t("aaalice.operation.empty", "Add a Parameter Panel or register another node from its context menu."),
			iconName: "layout",
		}));
		return;
	}
	for (const section of [...page.sections].sort((a, b) => Number(a.order) - Number(b.order))) {
		const sectionItems = items.filter((item) => item.entry.section_id === section.id && (!item.entry.hidden || layoutMode));
		if (!sectionItems.length && !layoutMode) continue;
		const wrapper = el("section", "aaalice-operation-section");
		const sectionActions = [];
		if (layoutMode) {
			sectionActions.push(
				iconButton({ iconName: "moveUp", label: t("aaalice.operation.moveUp", "Move up"), variant: "ghost", onClick: () => moveOrdered(page.sections, section, -1) }),
				iconButton({ iconName: "moveDown", label: t("aaalice.operation.moveDown", "Move down"), variant: "ghost", onClick: () => moveOrdered(page.sections, section, 1) }),
				iconButton({ iconName: "edit", label: t("aaalice.operation.sectionRename", "Rename section"), variant: "ghost", onClick: () => renameSection(page, section) }),
				iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "danger", onClick: () => deleteSection(page, section) }),
			);
		}
		const heading = sectionHeader(section.name, { eyebrow: t("aaalice.operation.section", "Section"), actions: sectionActions, className: "aaalice-operation-section-head" });
		wrapper.append(heading);
		const cards = el("div", fullscreen ? "aaalice-operation-grid" : "aaalice-operation-stack");
		for (const item of sectionItems) cards.append(renderCard(item, fullscreen, state));
		wrapper.append(cards);
		root.append(wrapper);
	}
}

function renderAll() {
	if (sidebarRoot) renderOperation(sidebarRoot, false);
	if (fullscreenRoot) renderOperation(fullscreenRoot, true);
}

function enterFullscreen() {
	if (fullscreenRoot) return;
	const overlay = el("div", "aaalice-operation-fullscreen");
	fullscreenRoot = el("div");
	overlay.append(fullscreenRoot);
	document.body.append(overlay);
	renderOperation(fullscreenRoot, true);
	document.addEventListener("keydown", fullscreenKey);
}

function exitFullscreen() {
	fullscreenRoot?.parentElement?.remove();
	fullscreenRoot = null;
	document.removeEventListener("keydown", fullscreenKey);
}

function fullscreenKey(event) { if (event.key === "Escape") exitFullscreen(); }

function registerSidebar() {
	const manager = app.extensionManager;
	if (!manager?.registerSidebarTab) throw new Error("[Aaalice] registerSidebarTab is unavailable");
	manager.registerSidebarTab({
		id: SIDEBAR_ID,
		icon: "pi pi-sliders-h",
		title: t("aaalice.operation.title", "Operation Panel"),
		tooltip: t("aaalice.operation.tooltip", "Workflow operation controls"),
		type: "custom",
		render(container) {
			sidebarRoot = container;
			container.style.height = "100%";
			container.style.overflow = "auto";
			renderOperation(container, false);
		},
		destroy() { sidebarRoot = null; },
	});
}

globalThis.aaaliceOperationPanel = Object.freeze({
	registerAdapter(nodeType, adapter) {
		if (!nodeType || typeof adapter?.render !== "function") throw new Error("Operation adapter needs nodeType and render()");
		if (adapter.getPresetControls && typeof adapter.getPresetControls !== "function") throw new Error("getPresetControls must be a function");
		adapters.set(nodeType, adapter);
		renderAll();
	},
});

app.registerExtension({
	name: "ComfyUI.Aaalice.OperationPanel",
	async init() { await ensureI18nReady(); },
	getNodeMenuItems(node) {
		if (!node || node.isVirtualNode) return [];
		const registered = Boolean(nodeEntry(node)?.enabled);
		return [{
			content: registered ? t("aaalice.operation.remove", "Remove from Operation Panel") : t("aaalice.operation.add", "Add to Operation Panel"),
			callback: () => (registered ? removeNode(node) : registerNode(node)),
		}];
	},
	nodeCreated(node) { if (isParameterPanel(node)) setTimeout(() => registerNode(node, true), 0); },
	loadedGraphNode(node) {
		if (isParameterPanel(node)) {
			const existing = nodeEntry(node);
			if (!existing) setTimeout(() => registerNode(node, true), 0);
		}
	},
	async setup() {
		registerSidebar();
		window.addEventListener(EVENT_OPERATION_CHANGED, renderAll);
		window.addEventListener(EVENT_PARAMETER_LIST, renderAll);
		for (const eventName of ["executed", "execution_success", "execution_error"]) api.addEventListener?.(eventName, renderAll);
		const graph = app.graph;
		if (graph) {
			const add = graph.add;
			graph.add = function (node) {
				const result = add.apply(this, arguments);
				setTimeout(() => {
					if (isParameterPanel(node) && !nodeEntry(node)) registerNode(node, true);
					notifyParameterListChanged();
				}, 0);
				return result;
			};
			const remove = graph.remove;
			graph.remove = function () { const result = remove.apply(this, arguments); setTimeout(notifyParameterListChanged, 0); return result; };
		}
		for (const node of graph?._nodes || []) if (isParameterPanel(node) && !nodeEntry(node)) registerNode(node, true);
	},
});
