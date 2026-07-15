/** Workflow-scoped, responsive Operation Panel controller. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	EVENT_OPERATION_CHANGED,
	EVENT_PARAMETER_LIST,
	cloneData,
	isParameterPanel,
	notifyParameterChanged,
} from "./lib/param_model.js";
import { deleteOperationPreset, loadOperationPresets, saveOperationPreset } from "./lib/operation_preset_store.js";
import { createSelectControl } from "./lib/parameter_controls.js";
import {
	OPERATION_DESIGN_PRESETS,
	expandViewportForFrames,
	findNearestFreeRect,
	frameFromRect,
	inferAnchor,
	resolveLayoutViewport,
} from "./lib/operation_layout.js";
import {
	createContentModule,
	createNodeModule,
	createOperationPage,
	consumeOperationResetVersion,
	findPage,
	moduleDescendants,
	operationState,
} from "./lib/operation_state.js";
import { getNodeAdapter, installOperationPanelApi } from "./lib/operation_registry.js";
import { createOperationEditor } from "./lib/operation_editor.js";
import { createOperationModuleRenderer, graphNodes, isSubgraphNode } from "./lib/operation_modules.js";
import { createOperationWorkspace } from "./lib/operation_workspace.js";
import { button, contextMenu, createDialog, el, emptyState } from "./lib/ui.js";

const SIDEBAR_ID = "aaalice-operation-panel";
const DEFAULT_CARD_SIZE = Object.freeze({ width: 360, height: 240 });
const GRID = 8;
const NODE_REMOVAL_PATCH = Symbol.for("aaalice.operation-panel.on-removed");

let activePageId = null;
let renderQueued = false;
let availableViewport = { width: 0, height: 0 };
let workspace = null;
let renderer = null;
let editor = null;

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({ severity, summary: t("aaalice.packageName", "Aaalice Nodes"), detail, life: 4500 });
}

async function promptText(title, value = "") {
	if (app.extensionManager?.dialog?.prompt) return app.extensionManager.dialog.prompt({ title, message: title, defaultValue: String(value) });
	return globalThis.prompt(title, String(value));
}

async function confirmAction(text) {
	if (app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({ title: t("aaalice.common.confirm", "Confirm"), message: text }));
	return globalThis.confirm(text);
}

function modal(title, render) {
	return new Promise((resolve) => {
		const body = el("div", "aaalice-modal-body");
		let settled = false;
		const dialog = createDialog({
			title,
			body,
			onRequestClose: () => {
				if (!settled) {
					settled = true;
					resolve(null);
				}
				return true;
			},
		});
		const close = (value) => {
			if (settled) return;
			settled = true;
			dialog.close(value);
			resolve(value);
		};
		render(body, close);
	});
}

function currentState(create = true) {
	return operationState(app.graph, create);
}

function currentPage(state = currentState()) {
	if (!activePageId || !state.pages.some((page) => page.id === activePageId)) activePageId = state.default_page_id;
	return findPage(state, activePageId);
}

function notifyChanged() {
	app.graph?.setDirtyCanvas?.(true, true);
	window.dispatchEvent(new CustomEvent(EVENT_OPERATION_CHANGED));
}

function commitMutation(mutator) {
	const graph = app.graph;
	if (!graph) return;
	graph.beforeChange?.();
	try {
		mutator(currentState());
		notifyChanged();
	} finally {
		graph.afterChange?.();
	}
	renderAll();
}

function scheduleRender() {
	if (renderQueued) return;
	renderQueued = true;
	requestAnimationFrame(() => {
		renderQueued = false;
		renderAll();
	});
}

function pageViewport(page) {
	const responsive = resolveLayoutViewport(page.design, availableViewport);
	return expandViewportForFrames(responsive, editor?.layoutItems(page) || [], GRID);
}

function ensureController() {
	if (workspace && renderer && editor) return;
	renderer = createOperationModuleRenderer({ onRender: scheduleRender });
	editor = createOperationEditor({
		getCanvas: () => workspace?.elements.canvas || null,
		getState: currentState,
		getViewport: pageViewport,
		commitMutation,
		render: scheduleRender,
		promptText,
		modal,
		renderer,
		toast,
	});
	workspace = createOperationWorkspace({
		sidebarId: SIDEBAR_ID,
		label: t("aaalice.operation.title", "Operation Panel"),
		onViewportChange(next) {
			availableViewport = next;
			scheduleRender();
		},
	});
}

function nodeModuleLocation(nodeId, state = currentState(false)) {
	if (!state) return null;
	for (const page of state.pages) {
		for (const module of Object.values(page.modules)) {
			if (module.type === "node" && module.node_id === String(nodeId)) return { page, module };
		}
	}
	return null;
}

function addNodeToPanel(node) {
	if (!node?.graph || nodeModuleLocation(node.id)) return false;
	ensureController();
	commitMutation((state) => {
		const page = currentPage(state);
		const viewport = pageViewport(page);
		const rect = findNearestFreeRect(
			{ x: 24, y: 24, width: Math.max(DEFAULT_CARD_SIZE.width, Number(getNodeAdapter(node.comfyClass || node.type)?.minWidth) || 0), height: DEFAULT_CARD_SIZE.height },
			editor.occupiedRects(page),
			viewport.width,
			GRID,
		);
		const module = createNodeModule(node.id, frameFromRect(rect, inferAnchor(rect, viewport), viewport));
		module.adapter = isSubgraphNode(node)
			? "comfy-subgraph"
			: isParameterPanel(node)
				? "aaalice-parameter-panel"
				: getNodeAdapter(node.comfyClass || node.type)
					? String(node.comfyClass || node.type)
					: "comfy-widgets";
		page.modules[module.id] = module;
		page.root_ids.push(module.id);
		editor.selectOnly(module.id);
		activePageId = page.id;
	});
	return true;
}

function pageNameUnique(state, name, exceptId = null) {
	const key = String(name).trim().toLocaleLowerCase();
	return key && !state.pages.some((page) => page.id !== exceptId && page.name.trim().toLocaleLowerCase() === key);
}

async function addPage() {
	const state = currentState();
	let currentName = currentPage(state).name;
	if (state.pages.length === 1 && !currentName) {
		currentName = await promptText(t("aaalice.operation.nameCurrentPage", "Name the current page"), "");
		if (!currentName?.trim()) return;
	}
	const name = await promptText(t("aaalice.operation.nameNewPage", "Name the new page"), "");
	if (!name?.trim()) return;
	if (!pageNameUnique(state, name)) return toast("warn", t("aaalice.operation.pageNameUnique", "Page names must be unique."));
	commitMutation(() => {
		if (state.pages.length === 1) state.pages[0].name = currentName.trim();
		const page = createOperationPage(name);
		page.order = state.pages.length;
		state.pages.push(page);
		activePageId = page.id;
		editor.clearSelection();
	});
}

async function renamePage(page) {
	const state = currentState();
	const name = await promptText(t("aaalice.operation.renamePage", "Rename page"), page.name);
	if (!name?.trim()) return;
	if (!pageNameUnique(state, name, page.id)) return toast("warn", t("aaalice.operation.pageNameUnique", "Page names must be unique."));
	commitMutation(() => { page.name = name.trim(); });
}

async function deletePage(page) {
	const state = currentState();
	if (state.pages.length === 1) return toast("warn", t("aaalice.operation.pageKeepOne", "At least one page is required."));
	if (!(await confirmAction(message("aaalice.operation.pageDeleteConfirm", "Delete page {name}? Its modules will be removed from Operation Panel.", { name: page.name })))) return;
	commitMutation(() => {
		state.pages = state.pages.filter((candidate) => candidate.id !== page.id);
		if (state.default_page_id === page.id) state.default_page_id = state.pages[0].id;
		activePageId = state.default_page_id;
		editor.clearSelection();
	});
}

function reorderPage(state, page, delta) {
	const ordered = [...state.pages].sort((a, b) => a.order - b.order);
	const index = ordered.findIndex((candidate) => candidate.id === page.id);
	const target = index + delta;
	if (index < 0 || target < 0 || target >= ordered.length) return;
	commitMutation(() => {
		[ordered[index], ordered[target]] = [ordered[target], ordered[index]];
		ordered.forEach((candidate, order) => { candidate.order = order; });
	});
}

function pageMenu(event, page) {
	if (!editor.editing) return;
	const state = currentState();
	contextMenu(event, [
		{ label: t("aaalice.operation.renamePage", "Rename page"), action: () => renamePage(page) },
		{ label: t("aaalice.operation.defaultPageAction", "Set as default page"), disabled: state.default_page_id === page.id, action: () => commitMutation(() => { state.default_page_id = page.id; }) },
		{ label: t("aaalice.operation.movePageLeft", "Move page left"), disabled: [...state.pages].sort((a, b) => a.order - b.order)[0]?.id === page.id, action: () => reorderPage(state, page, -1) },
		{ label: t("aaalice.operation.movePageRight", "Move page right"), disabled: [...state.pages].sort((a, b) => a.order - b.order).at(-1)?.id === page.id, action: () => reorderPage(state, page, 1) },
		"separator",
		{ label: t("aaalice.operation.deletePage", "Delete page"), danger: true, disabled: state.pages.length === 1, action: () => deletePage(page) },
	]);
}

async function addContentModule(page, type, point = { x: 24, y: 24 }) {
	const content = await modal(type === "heading" ? t("aaalice.operation.editHeading", "Edit heading") : t("aaalice.operation.editMarkdown", "Edit Markdown"), (body, close) => {
		const input = document.createElement("textarea");
		input.className = "aaalice-operation-content-editor";
		input.value = type === "heading" ? t("aaalice.operation.heading", "Heading") : "";
		input.placeholder = type === "heading" ? t("aaalice.operation.headingHint", "First line is the title; following lines are the description.") : t("aaalice.operation.markdownHint", "Safe Markdown; HTML is ignored.");
		const actions = el("div", "aaalice-modal-actions");
		actions.append(
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary", onClick: () => close(null) }),
			button({ label: t("aaalice.common.save", "Save"), onClick: () => close(input.value) }),
		);
		body.append(input, actions);
	});
	if (content == null) return;
	const viewport = pageViewport(page);
	const preferred = { x: point.x, y: point.y, width: type === "heading" ? 560 : 440, height: type === "heading" ? 96 : 220 };
	const rect = findNearestFreeRect(preferred, editor.occupiedRects(page), viewport.width, GRID);
	commitMutation(() => {
		const module = createContentModule(type, content, frameFromRect(rect, inferAnchor(rect, viewport), viewport));
		page.modules[module.id] = module;
		page.root_ids.push(module.id);
		editor.selectOnly(module.id);
	});
}

function canvasMenu(event, page) {
	if (!editor.editing || event.target.closest("[data-module-id]")) return;
	const canvas = workspace.elements.canvas;
	const bounds = canvas.getBoundingClientRect();
	const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
	contextMenu(event, [
		{ label: t("aaalice.operation.addHeading", "Add heading"), action: () => addContentModule(page, "heading", point) },
		{ label: t("aaalice.operation.addMarkdown", "Add Markdown"), action: () => addContentModule(page, "markdown", point) },
	]);
}

function setDesign(page, value) {
	const preset = OPERATION_DESIGN_PRESETS[value];
	commitMutation(() => {
		page.design = value === "current" ? { preset: "current" } : { preset: value, ...preset };
		editor.resolveRootCollisions(page, page.root_ids);
	});
}

function renderToolbar(toolbar, state, page) {
	toolbar.replaceChildren();
	const pageArea = el("div", "aaalice-operation-page-area");
	if (state.pages.length > 1) {
		const nav = el("nav", { className: "aaalice-operation-page-tabs", attrs: { role: "tablist", "aria-label": t("aaalice.operation.pagesAria", "Operation pages") } });
		for (const candidate of [...state.pages].sort((a, b) => a.order - b.order)) {
			const active = candidate.id === page.id;
			const tab = button({ label: candidate.name, variant: "ghost", size: "sm", className: `aaalice-operation-page-tab${active ? " is-active" : ""}` });
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-selected", String(active));
			tab.addEventListener("click", () => { activePageId = candidate.id; editor.clearSelection(); renderAll(); });
			tab.addEventListener("contextmenu", (event) => pageMenu(event, candidate));
			nav.append(tab);
		}
		pageArea.append(nav);
	}
	const actions = el("div", "aaalice-operation-toolbar-actions");
	const presetLabel = t("aaalice.operation.presets", "Presets");
	actions.append(button({ label: presetLabel, ariaLabel: presetLabel, title: presetLabel, iconName: "presets", variant: "secondary", size: "sm", onClick: presetMenu }));
	if (editor.editing) {
		const design = createSelectControl([
			{ label: t("aaalice.operation.design1440", "1440 × 900 minimum"), value: "1440x900" },
			{ label: t("aaalice.operation.design1920", "1920 × 1080 minimum"), value: "1920x1080" },
			{ label: t("aaalice.operation.currentWindow", "Adaptive window"), value: "current" },
		], page.design?.preset || "1440x900", { ariaLabel: t("aaalice.operation.designSize", "Design size"), onChange: (value) => setDesign(page, value) });
		design.classList.add("aaalice-operation-design-select");
		const addPageLabel = t("aaalice.operation.addPage", "Add page");
		actions.append(design, button({ label: addPageLabel, ariaLabel: addPageLabel, title: addPageLabel, iconName: "add", variant: "secondary", size: "sm", onClick: addPage }));
	}
	const editLabel = editor.editing ? t("aaalice.operation.finishEditing", "Done") : t("aaalice.operation.editLayout", "Edit layout");
	actions.append(button({
		label: editLabel,
		ariaLabel: editLabel,
		title: editLabel,
		iconName: editor.editing ? "done" : "edit",
		variant: editor.editing ? "primary" : "secondary",
		size: "sm",
		onClick: () => { editor.setEditing(!editor.editing); renderAll(); },
	}));
	toolbar.append(pageArea, actions);
}

function renderWorkspace() {
	if (!workspace?.elements.root) return;
	renderer.cleanup();
	editor.cleanupView();
	const { toolbar, canvas } = workspace.elements;
	const state = currentState();
	const page = currentPage(state);
	workspace.setEditing(editor.editing);
	renderToolbar(toolbar, state, page);
	canvas.replaceChildren();
	canvas.setAttribute("aria-label", page.name || t("aaalice.operation.title", "Operation Panel"));
	const viewport = pageViewport(page);
	canvas.style.width = `${viewport.width}px`;
	canvas.style.setProperty("--aaalice-operation-column-width", `${viewport.width / 12}px`);
	const contentBottom = Math.max(viewport.height, ...page.root_ids.map((id) => {
		const module = page.modules[id];
		if (!module) return 0;
		const rect = editor.moduleRect(page, module);
		return rect.y + rect.height + 24;
	}));
	canvas.style.height = `${contentBottom}px`;
	canvas.addEventListener("contextmenu", (event) => canvasMenu(event, page));
	canvas.addEventListener("pointerdown", (event) => {
		if (editor.editing && event.target === canvas) {
			editor.clearSelection();
			renderAll();
		}
	});
	for (const id of page.root_ids) if (page.modules[id]) canvas.append(editor.renderRootModule(page, page.modules[id]));
	workspace.setEmpty(!page.root_ids.length ? emptyState({
		title: t("aaalice.operation.emptyTitle", "This page is empty"),
		description: editor.editing
			? t("aaalice.operation.emptyEdit", "Right-click the canvas to add text, or right-click a workflow node to add its controls.")
			: t("aaalice.operation.empty", "Right-click a workflow node and choose Add to Operation Panel."),
		iconName: "layout",
		className: "aaalice-operation-empty",
	}) : null);
	if (app.graph && consumeOperationResetVersion(app.graph) != null) {
		toast("info", t("aaalice.operation.layoutReset", "Operation Panel uses a new layout format. The previous layout was not migrated."));
	}
	workspace.schedulePosition();
}

function slug(value) {
	return String(value || "card").trim().toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "card";
}

function nodeModulesInScope(page) {
	const roots = editor.selectedRootIds(page);
	const ids = roots.length ? roots.flatMap((id) => moduleDescendants(page, id)) : page.root_ids.flatMap((id) => moduleDescendants(page, id));
	return [...new Set(ids)].map((id) => page.modules[id]).filter((module) => module?.type === "node");
}

function presetItems(page) {
	const nodes = graphNodes();
	return nodeModulesInScope(page)
		.map((module) => ({ module, node: nodes.get(module.node_id) }))
		.filter((item) => item.node && renderer.presetControls(item.node, item.module).length);
}

async function ensurePresetKeys(items) {
	const used = new Set(items.map((item) => item.module.preset_key).filter(Boolean).map((key) => key.toLocaleLowerCase()));
	const assignments = [];
	for (const item of items) if (!item.module.preset_key) {
		const base = slug(renderer.cardTitle(item.node, item.module));
		let candidate = base;
		for (let index = 2; used.has(candidate.toLocaleLowerCase()); index += 1) candidate = `${base}-${index}`;
		assignments.push([item.module, candidate]);
		used.add(candidate.toLocaleLowerCase());
	}
	if (assignments.length) commitMutation(() => { for (const [module, key] of assignments) module.preset_key = key; });
	const duplicates = items.map((item) => item.module.preset_key.toLocaleLowerCase()).filter((key, index, keys) => keys.indexOf(key) !== index);
	if (duplicates.length) throw new Error(t("aaalice.operation.preset.keysUnique", "Preset keys must be unique within the selected scope."));
	return items;
}

async function savePreset() {
	const page = currentPage();
	const items = await ensurePresetKeys(presetItems(page));
	if (!items.length) return toast("warn", t("aaalice.operation.preset.noWritable", "The selected scope has no writable controls."));
	const name = await promptText(t("aaalice.operation.preset.name", "Preset name"), page.name || t("aaalice.operation.title", "Operation Panel"));
	if (!name?.trim()) return;
	const cards = items.map(({ node, module }) => ({
		key: module.preset_key,
		node_type: node.comfyClass || node.type,
		controls: Object.fromEntries(renderer.presetControls(node, module).map((control) => [control.key, cloneData(control.read())])),
	}));
	await saveOperationPreset({ name: name.trim(), cards });
	scheduleRender();
	toast("success", t("aaalice.operation.preset.saved", "Values saved."));
}

async function choosePreset(title) {
	const store = await loadOperationPresets();
	if (!store.presets.length) {
		toast("info", t("aaalice.operation.preset.empty", "No saved presets."));
		return null;
	}
	return modal(title, (body, close) => {
		for (const preset of store.presets) body.append(button({ label: preset.name, variant: "secondary", className: "aaalice-choice-btn", onClick: () => close(preset) }));
	});
}

async function loadPreset() {
	const preset = await choosePreset(t("aaalice.operation.preset.load", "Load values"));
	if (!preset) return;
	const items = await ensurePresetKeys(presetItems(currentPage()));
	const byKey = new Map(items.map((item) => [item.module.preset_key.toLocaleLowerCase(), item]));
	const changes = [];
	const differences = [];
	for (const card of preset.cards || []) {
		const item = byKey.get(String(card.key).toLocaleLowerCase());
		if (!item) {
			differences.push(`${card.key}: ${t("aaalice.operation.preset.missingCard", "missing card")}`);
			continue;
		}
		if (card.node_type && card.node_type !== (item.node.comfyClass || item.node.type)) {
			differences.push(`${card.key}: ${t("aaalice.operation.preset.nodeTypeMismatch", "node type differs")}`);
			continue;
		}
		const controls = new Map(renderer.presetControls(item.node, item.module).map((control) => [control.key, control]));
		for (const [key, value] of Object.entries(card.controls || {})) {
			const control = controls.get(key);
			if (!control) {
				differences.push(`${card.key}.${key}: ${t("aaalice.operation.preset.missingControl", "missing control")}`);
				continue;
			}
			const error = control.validate?.(value);
			if (error) differences.push(`${card.key}.${key}: ${error}`);
			else changes.push({ ...item, control, value: cloneData(value), previous: cloneData(control.read()) });
		}
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
			try { change.control.write(change.previous); }
			catch (rollbackError) { console.error("[Aaalice] Preset rollback failed", rollbackError); }
		}
		throw error;
	}
	for (const node of new Set(changes.map((change) => change.node))) if (isParameterPanel(node)) notifyParameterChanged(node, { structure: false });
	app.graph?.setDirtyCanvas?.(true, true);
	renderAll();
	toast("success", t("aaalice.operation.preset.applied", "Values applied."));
}

async function deletePreset() {
	const preset = await choosePreset(t("aaalice.operation.preset.delete", "Delete preset"));
	if (!preset || !(await confirmAction(message("aaalice.operation.preset.deleteConfirm", "Delete preset {name}?", { name: preset.name })))) return;
	await deleteOperationPreset(preset.name);
	toast("success", t("aaalice.operation.preset.deleted", "Preset deleted."));
}

async function presetMenu() {
	const action = await modal(t("aaalice.operation.presets", "Presets"), (body, close) => {
		for (const [value, label] of [
			["save", editor.selectionSize ? t("aaalice.operation.preset.saveSelection", "Save selected values") : t("aaalice.operation.preset.savePage", "Save page values")],
			["load", t("aaalice.operation.preset.load", "Load values")],
			["delete", t("aaalice.operation.preset.delete", "Delete preset")],
		]) body.append(button({ label, variant: "secondary", className: "aaalice-choice-btn", onClick: () => close(value) }));
	});
	if (action === "save") await savePreset();
	else if (action === "load") await loadPreset();
	else if (action === "delete") await deletePreset();
}

function mountWorkspace(container) {
	ensureController();
	workspace.mount(container);
	renderWorkspace();
}

function unmountWorkspace() {
	renderer?.cleanup();
	editor?.destroy();
	workspace?.unmount();
	availableViewport = { width: 0, height: 0 };
}

function renderAll() {
	if (workspace?.elements.root) renderWorkspace();
}

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
			try { mountWorkspace(container); }
			catch (error) {
				unmountWorkspace();
				console.error("[Aaalice] Operation Panel failed to mount", error);
				toast("error", error.message || String(error));
				container.replaceChildren(emptyState({
					title: t("aaalice.operation.title", "Operation Panel"),
					description: error.message || String(error),
					iconName: "layout",
				}));
			}
		},
		destroy: unmountWorkspace,
	});
}

function patchNodeRemoval(nodeType) {
	const prototype = nodeType?.prototype;
	if (!prototype || prototype[NODE_REMOVAL_PATCH]) return;
	const original = prototype.onRemoved;
	prototype.onRemoved = function () {
		try { return original?.apply(this, arguments); }
		finally { scheduleRender(); }
	};
	Object.defineProperty(prototype, NODE_REMOVAL_PATCH, { value: true });
}

app.registerExtension({
	name: "ComfyUI.Aaalice.OperationPanel",
	async init() { await ensureI18nReady(); },
	beforeRegisterNodeDef(nodeType) { patchNodeRemoval(nodeType); },
	nodeCreated() { scheduleRender(); },
	loadedGraphNode() { scheduleRender(); },
	afterConfigureGraph() { scheduleRender(); },
	getNodeMenuItems(node) {
		if (!node || !(app.graph?._nodes || []).includes(node) || (node.isVirtualNode && !isSubgraphNode(node)) || nodeModuleLocation(node.id)) return [];
		const localized = t("aaalice.operation.add", "🎛️ Add to Operation Panel");
		return [{ content: localized.startsWith("🎛️") ? localized : `🎛️ ${localized}`, callback: () => addNodeToPanel(node) }];
	},
	async setup() {
		ensureController();
		installOperationPanelApi(renderAll);
		registerSidebar();
		window.addEventListener(EVENT_OPERATION_CHANGED, scheduleRender);
		window.addEventListener(EVENT_PARAMETER_LIST, scheduleRender);
		for (const eventName of ["executed", "execution_success", "execution_error"]) api.addEventListener?.(eventName, scheduleRender);
	},
});
