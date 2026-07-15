/** Anchored, workflow-scoped Operation Panel workspace. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	EVENT_OPERATION_CHANGED,
	EVENT_PARAMETER_LIST,
	cloneData,
	displayName,
	ensureParameters,
	isParameterPanel,
	notifyParameterChanged,
	notifyParameterListChanged,
} from "./lib/param_model.js";
import { deleteOperationPreset, loadOperationPresets, saveOperationPreset } from "./lib/operation_preset_store.js";
import { createParameterControl, createSelectControl, createSwitchControl } from "./lib/parameter_controls.js";
import { renderSafeMarkdown } from "./lib/safe_markdown.js";
import {
	OPERATION_ANCHORS,
	OPERATION_DESIGN_PRESETS,
	commandBarInsets,
	distributeRects,
	findNearestFreeRect,
	frameFromRect,
	inferAnchor,
	rectsOverlap,
	resolveFrame,
	snapValue,
} from "./lib/operation_layout.js";
import {
	MODULE_STYLES,
	createContainerModule,
	createContentModule,
	createNodeModule,
	createOperationPage,
	findPage,
	moduleDescendants,
	operationState,
	removeModule,
	validateContainerDepth,
} from "./lib/operation_state.js";
import { getNodeAdapter, installOperationPanelApi } from "./lib/operation_registry.js";
import { button, contextMenu, createDialog, el, emptyState, iconButton } from "./lib/ui.js";

const SIDEBAR_ID = "aaalice-operation-panel";
const WORKSPACE_SELECTOR = `[data-aaalice-operation-workspace="${SIDEBAR_ID}"]`;
const BACKDROP_SELECTOR = `[data-aaalice-operation-backdrop="${SIDEBAR_ID}"]`;
const DEFAULT_CARD_SIZE = Object.freeze({ width: 360, height: 240 });
const GRID = 8;

let sidebarContainer = null;
let workspaceRoot = null;
let workspaceBackdrop = null;
let workspacePositionCleanup = null;
let workspacePositionFrame = 0;
let sidebarCollapseFrame = 0;
let canvasElement = null;
let activePageId = null;
let editMode = false;
let selection = new Set();
let selectionAnchorId = null;
let renderQueued = false;
const measuredHeights = new Map();
const carouselPages = new Map();
const adapterCleanups = new Set();
const viewCleanups = new Set();
const collapsedSidebarElements = new Set();
const resetNotices = new WeakSet();
const pendingCollisionPages = new Set();

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

function graphNodes() {
	return new Map((app.graph?._nodes || []).map((node) => [String(node.id), node]));
}

function isSubgraphNode(node) {
	return Boolean(node?.isSubgraphNode?.());
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

function cleanupAdapters() {
	for (const cleanup of adapterCleanups) {
		try { cleanup(); } catch (error) { console.error("[Aaalice] Operation adapter cleanup failed", error); }
	}
	adapterCleanups.clear();
	for (const cleanup of viewCleanups) cleanup();
	viewCleanups.clear();
}

function pageViewport(page) {
	return { width: Number(page.design?.width) || 1440, height: Number(page.design?.height) || 900 };
}

function moduleHeight(moduleId) {
	return measuredHeights.get(moduleId) || DEFAULT_CARD_SIZE.height;
}

function moduleRect(page, module) {
	return resolveFrame(module.frame, pageViewport(page), moduleHeight(module.id));
}

function occupiedRects(page, excluded = new Set()) {
	return page.root_ids
		.filter((id) => !excluded.has(id) && page.modules[id])
		.map((id) => ({ id, ...moduleRect(page, page.modules[id]) }));
}

function resolveRootCollisions(page, priorityIds = []) {
	const viewport = pageViewport(page);
	const priority = new Set(priorityIds);
	const ordered = [...page.root_ids.filter((id) => priority.has(id)), ...page.root_ids.filter((id) => !priority.has(id))];
	const occupied = [];
	for (const id of ordered) {
		const module = page.modules[id];
		if (!module) continue;
		const rect = moduleRect(page, module);
		const free = findNearestFreeRect(rect, occupied, viewport.width, GRID);
		if (free.x !== rect.x || free.y !== rect.y) module.frame = frameFromRect(free, inferAnchor(free, viewport), viewport);
		occupied.push({ id, ...free });
	}
}

function pageHasOverlap(page) {
	const rects = page.root_ids.filter((id) => page.modules[id]).map((id) => moduleRect(page, page.modules[id]));
	return rects.some((rect, index) => rects.slice(index + 1).some((other) => rectsOverlap(rect, other)));
}

function scheduleCollisionReflow(pageId) {
	if (pendingCollisionPages.has(pageId)) return;
	pendingCollisionPages.add(pageId);
	requestAnimationFrame(() => {
		pendingCollisionPages.delete(pageId);
		const state = currentState(false);
		const page = state?.pages.find((candidate) => candidate.id === pageId);
		if (page && pageHasOverlap(page)) commitMutation(() => resolveRootCollisions(page, page.root_ids));
	});
}

function nodeModuleLocation(nodeId, state = currentState(false)) {
	if (!state) return null;
	for (const page of state.pages) {
		for (const module of Object.values(page.modules)) if (module.type === "node" && module.node_id === String(nodeId)) return { page, module };
	}
	return null;
}

function addNodeToPanel(node) {
	if (!node?.graph || nodeModuleLocation(node.id)) return false;
	commitMutation((state) => {
		const page = currentPage(state);
		const viewport = pageViewport(page);
		const rect = findNearestFreeRect(
			{ x: 24, y: 24, width: Math.max(DEFAULT_CARD_SIZE.width, Number(getNodeAdapter(node.comfyClass || node.type)?.minWidth) || 0), height: DEFAULT_CARD_SIZE.height },
			occupiedRects(page),
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
		selection = new Set([module.id]);
		activePageId = page.id;
	});
	return true;
}

function setWidget(widget, value, node) {
	widget.value = value;
	widget.callback?.(value, app.canvas, node, app.canvas?.graph_mouse);
	node.graph?.setDirtyCanvas?.(true, true);
}

function supportedWidgets(node, module) {
	const filter = module?.widgets;
	return (node.widgets || []).filter((widget) => {
		if (!widget?.name || widget.serialize === false || widget.type === "button") return false;
		if (Array.isArray(filter) && !filter.includes(widget.name)) return false;
		if (widget.computedDisabled) return false;
		return isSubgraphNode(node)
			|| ["number", "slider", "toggle", "combo", "text", "string", "converted-widget", "BOOLEAN", "INT", "FLOAT", "STRING", "COMBO"].includes(widget.type)
			|| widget.options?.values;
	});
}

function parameterControl(parameter, node) {
	const update = () => notifyParameterChanged(node, { structure: false });
	if (parameter.param_type === "image") {
		const input = document.createElement("input");
		input.value = parameter.value?.filename || "";
		input.addEventListener("change", () => {
			parameter.value = input.value.trim() ? { filename: input.value.trim(), subfolder: "", type: "input" } : null;
			update();
		});
		return input;
	}
	return createParameterControl({ parameter, mode: "sidebar", onChange: update, labels: { input: displayName(parameter), select: displayName(parameter), switch: displayName(parameter) } });
}

function renderParameterPanel(container, node) {
	const parameters = ensureParameters(node);
	for (const parameter of parameters) {
		if (parameter.param_type === "separator") {
			container.append(el("div", "aaalice-operation-section-label", displayName(parameter)));
			continue;
		}
		const row = el("label", "aaalice-operation-row");
		const label = el("span", "aaalice-operation-label", displayName(parameter));
		if (parameter.description) label.title = parameter.description;
		row.append(label, parameterControl(parameter, node));
		container.append(row);
	}
	if (!parameters.length) container.append(emptyState({ description: t("aaalice.operation.emptyPanel", "This parameter panel is empty."), iconName: "settings" }));
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

function renderGenericControls(container, node, module) {
	for (const widget of supportedWidgets(node, module)) {
		const row = el("label", "aaalice-operation-row");
		row.append(el("span", "aaalice-operation-label", widget.label || widget.name));
		const options = widget.options?.values || (Array.isArray(widget.options) ? widget.options : null);
		let control;
		if (options) control = createSelectControl(options, widget.value, { ariaLabel: widget.label || widget.name, onChange: (value) => setWidget(widget, value, node) });
		else if (["toggle", "BOOLEAN"].includes(widget.type) || typeof widget.value === "boolean") control = createSwitchControl(widget.value, { ariaLabel: widget.label || widget.name, onChange: (value) => setWidget(widget, value, node) });
		else {
			control = document.createElement("input");
			control.type = typeof widget.value === "number" ? "number" : "text";
			control.value = widget.value ?? "";
			control.addEventListener("change", () => setWidget(widget, control.type === "number" ? Number(control.value) : control.value, node));
		}
		row.append(control);
		container.append(row);
	}
}

function renderGeneric(container, node, module) {
	renderGenericControls(container, node, module);
	renderNodeResults(container, node);
}

function renderAdapter(container, node, module) {
	const adapter = getNodeAdapter(node.comfyClass || node.type);
	if (!adapter || ![adapter.render, adapter.renderControls, adapter.renderResults].some((renderer) => typeof renderer === "function")) return false;
	const controller = new AbortController();
	const context = {
		container,
		node,
		module,
		components: globalThis.aaaliceOperationPanel?.v1?.components,
		signal: controller.signal,
		app,
		t,
		markDirty: () => { node.graph?.setDirtyCanvas?.(true, true); scheduleRender(); },
	};
	const cleanups = [];
	try {
		if (adapter.render) cleanups.push(adapter.render(context));
		else {
			if (adapter.renderControls) cleanups.push(adapter.renderControls(context));
			else renderGenericControls(container, node, module);
			if (adapter.renderResults) cleanups.push(adapter.renderResults(context));
			else renderNodeResults(container, node);
		}
		adapterCleanups.add(() => {
			controller.abort();
			for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
		});
		return true;
	} catch (error) {
		controller.abort();
		for (const cleanup of cleanups) {
			try { if (typeof cleanup === "function") cleanup(); }
			catch (cleanupError) { console.error("[Aaalice] Operation adapter cleanup failed after render error", cleanupError); }
		}
		console.error(`[Aaalice] Operation adapter render failed for ${node.type}`, error);
		container.append(el("div", "aaalice-operation-error", message("aaalice.operation.adapterError", "Adapter error: {error}", { error: error.message || error })));
		return true;
	}
}

function cardTitle(node, module) {
	const adapterTitle = getNodeAdapter(node.comfyClass || node.type)?.title;
	return module.label_override
		|| (typeof adapterTitle === "function" ? adapterTitle({ node, module, app, t }) : adapterTitle)
		|| (isSubgraphNode(node) ? node.subgraph?.name : null)
		|| node.getTitle?.()
		|| node.title
		|| node.type
		|| message("aaalice.operation.nodeFallback", "Node {id}", { id: node.id });
}

function presetControls(node, module) {
	const adapter = getNodeAdapter(node.comfyClass || node.type);
	const controls = adapter?.getPresetControls?.({ node, module, app, t });
	if (controls) return validatePresetControls(controls, node);
	if (isParameterPanel(node)) return validatePresetControls(ensureParameters(node)
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
		})), node);
	return validatePresetControls(supportedWidgets(node, module).map((widget) => ({
		key: widget.name,
		label: widget.label || widget.name,
		read: () => cloneData(widget.value),
		validate: (value) => {
			const options = widget.options?.values || (Array.isArray(widget.options) ? widget.options : null);
			if (options && !options.map(String).includes(String(value))) return t("aaalice.operation.preset.invalidOption", "Option is unavailable.");
			if (typeof widget.value === "number" && !Number.isFinite(Number(value))) return t("aaalice.operation.preset.invalidNumber", "Value must be numeric.");
			return null;
		},
		write: (value) => setWidget(widget, cloneData(value), node),
	})), node);
}

function validatePresetControls(controls, node) {
	if (!Array.isArray(controls)) throw new Error(`Operation adapter preset controls for ${node.type} must be an array`);
	const keys = new Set();
	for (const control of controls) {
		if (!control?.key || typeof control.read !== "function" || typeof control.write !== "function") throw new Error(`Operation adapter preset control for ${node.type} needs key, read and write`);
		if (keys.has(control.key)) throw new Error(`Operation adapter ${node.type} has duplicate preset key: ${control.key}`);
		keys.add(control.key);
	}
	return controls;
}

function renderNodeBody(container, node, module) {
	if (renderAdapter(container, node, module)) return;
	if (isParameterPanel(node)) renderParameterPanel(container, node);
	else renderGeneric(container, node, module);
}

function moduleName(page, module) {
	if (module.type === "node") {
		const node = graphNodes().get(module.node_id);
		return node ? cardTitle(node, module) : t("aaalice.operation.missingNode", "Missing node");
	}
	if (module.title) return module.title;
	if (module.type === "heading") return String(module.content || t("aaalice.operation.heading", "Heading")).split("\n")[0];
	if (module.type === "markdown") return t("aaalice.operation.markdown", "Markdown");
	return module.type === "group" ? t("aaalice.operation.group", "Group") : t("aaalice.operation.carousel", "Carousel");
}

function renderNodeModule(module) {
	const node = graphNodes().get(module.node_id);
	const body = el("div", "aaalice-operation-card-body");
	if (!node) body.append(emptyState({ description: t("aaalice.operation.missingNode", "The workflow node no longer exists."), iconName: "close" }));
	else renderNodeBody(body, node, module);
	const root = el("article", `aaalice-operation-card aaalice-operation-style-${module.style}`);
	const header = el("header", "aaalice-operation-card-header");
	header.append(el("strong", null, node ? cardTitle(node, module) : t("aaalice.operation.missingNode", "Missing node")));
	if (node) header.append(el("span", "aaalice-operation-node-id", isSubgraphNode(node) ? t("aaalice.operation.subgraph", "Subgraph") : `#${node.id}`));
	root.append(header, body);
	return root;
}

function renderContentModule(module) {
	if (module.type === "heading") {
		const [title, ...description] = String(module.content || "").split("\n");
		const root = el("header", `aaalice-operation-heading-module aaalice-operation-style-${module.style}`);
		root.append(el("h2", null, title || t("aaalice.operation.heading", "Heading")));
		if (description.length) root.append(el("p", null, description.join("\n")));
		return root;
	}
	const root = el("article", `aaalice-operation-markdown aaalice-operation-style-${module.style}`);
	root.append(renderSafeMarkdown(module.content || ""));
	return root;
}

function renderGroup(page, module) {
	const root = el("section", `aaalice-operation-group aaalice-operation-style-${module.style}`);
	if (module.title) root.append(el("h3", "aaalice-operation-container-title", module.title));
	const body = el("div", "aaalice-operation-group-body");
	for (const childId of module.children) {
		const child = page.modules[childId];
		if (!child) continue;
		const childElement = renderModuleContent(page, child);
		childElement.classList.add("aaalice-operation-group-item");
		body.append(childElement);
	}
	root.append(body);
	return root;
}

function renderCarousel(page, module) {
	const root = el("section", `aaalice-operation-carousel aaalice-operation-style-${module.style}`);
	const active = module.children.includes(carouselPages.get(module.id))
		? carouselPages.get(module.id)
		: module.default_child_id || module.children[0];
	carouselPages.set(module.id, active);
	const nav = el("div", "aaalice-operation-carousel-nav");
	const move = (delta) => {
		const index = module.children.indexOf(carouselPages.get(module.id));
		carouselPages.set(module.id, module.children[(index + delta + module.children.length) % module.children.length]);
		renderAll();
	};
	nav.append(iconButton({ iconName: "chevronLeft", label: t("aaalice.operation.previous", "Previous"), variant: "ghost", onClick: () => move(-1) }));
	const dots = el("div", { className: "aaalice-operation-carousel-dots", attrs: { role: "tablist" } });
	for (const childId of module.children) {
		const child = page.modules[childId];
		if (!child) continue;
		const activeDot = childId === active;
		const dot = button({ label: moduleName(page, child), variant: "ghost", size: "sm", className: `aaalice-operation-carousel-dot${activeDot ? " is-active" : ""}` });
		dot.setAttribute("role", "tab");
		dot.setAttribute("aria-selected", String(activeDot));
		dot.addEventListener("click", () => { carouselPages.set(module.id, childId); renderAll(); });
		dots.append(dot);
	}
	nav.append(dots, iconButton({ iconName: "chevronRight", label: t("aaalice.operation.next", "Next"), variant: "ghost", onClick: () => move(1) }));
	const slides = el("div", "aaalice-operation-carousel-slides");
	for (const childId of module.children) {
		const child = page.modules[childId];
		if (!child) continue;
		const slide = el("div", `aaalice-operation-carousel-slide${childId === active ? " is-active" : ""}`);
		slide.dataset.childId = childId;
		slide.append(renderModuleContent(page, child));
		slides.append(slide);
	}
	let wheelX = 0;
	slides.addEventListener("wheel", (event) => {
		if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 8) return;
		event.preventDefault();
		wheelX += event.deltaX;
		if (Math.abs(wheelX) >= 48) {
			move(wheelX > 0 ? 1 : -1);
			wheelX = 0;
		}
	}, { passive: false });
	let touchStartX = null;
	slides.addEventListener("pointerdown", (event) => { if (event.pointerType === "touch") touchStartX = event.clientX; });
	slides.addEventListener("pointerup", (event) => {
		if (touchStartX == null || event.pointerType !== "touch") return;
		const distance = event.clientX - touchStartX;
		touchStartX = null;
		if (Math.abs(distance) >= 48) move(distance < 0 ? 1 : -1);
	});
	root.addEventListener("keydown", (event) => {
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			move(event.key === "ArrowLeft" ? -1 : 1);
		}
	});
	root.tabIndex = 0;
	root.append(nav, slides);
	requestAnimationFrame(() => {
		const height = Math.max(0, ...[...slides.children].map((slide) => slide.scrollHeight));
		if (height) slides.style.height = `${height}px`;
	});
	return root;
}

function renderModuleContent(page, module) {
	if (module.type === "node") return renderNodeModule(module);
	if (["heading", "markdown"].includes(module.type)) return renderContentModule(module);
	if (module.type === "group") return renderGroup(page, module);
	return renderCarousel(page, module);
}

function selectModule(page, moduleId, event) {
	const roots = page.root_ids;
	if (event.shiftKey && selectionAnchorId && roots.includes(selectionAnchorId)) {
		const start = roots.indexOf(selectionAnchorId);
		const end = roots.indexOf(moduleId);
		selection = new Set(roots.slice(Math.min(start, end), Math.max(start, end) + 1));
	} else if (event.ctrlKey || event.metaKey) {
		if (selection.has(moduleId)) selection.delete(moduleId);
		else selection.add(moduleId);
		selectionAnchorId = moduleId;
	} else {
		selection = new Set([moduleId]);
		selectionAnchorId = moduleId;
	}
}

function selectedRootIds(page, fallbackId = null) {
	const selected = page.root_ids.filter((id) => selection.has(id));
	if (!selected.length && fallbackId && page.root_ids.includes(fallbackId)) return [fallbackId];
	return selected;
}

function beginMove(event, page, module, element) {
	if (!editMode || event.button !== 0 || event.target.closest("button, input, select, textarea, .aaalice-operation-resize")) return;
	event.preventDefault();
	selectModule(page, module.id, event);
	const ids = selectedRootIds(page, module.id);
	const elements = new Map(ids.map((id) => [id, canvasElement?.querySelector(`[data-module-id="${CSS.escape(id)}"]`)]));
	const start = { x: event.clientX, y: event.clientY };
	let moved = false;
	const pointerMove = (moveEvent) => {
		const dx = moveEvent.clientX - start.x;
		const dy = moveEvent.clientY - start.y;
		moved ||= Math.abs(dx) > 2 || Math.abs(dy) > 2;
		for (const target of elements.values()) if (target) target.style.transform = `translate(${dx}px, ${dy}px)`;
		const anchor = inferAnchor({ ...moduleRect(page, module), x: moduleRect(page, module).x + dx, y: moduleRect(page, module).y + dy }, pageViewport(page));
		canvasElement?.setAttribute("data-anchor-preview", anchor);
	};
	const pointerUp = (upEvent) => {
		document.removeEventListener("pointermove", pointerMove);
		document.removeEventListener("pointerup", pointerUp);
		canvasElement?.removeAttribute("data-anchor-preview");
		for (const target of elements.values()) if (target) target.style.transform = "";
		if (!moved) {
			renderAll();
			return;
		}
		const dx = upEvent.clientX - start.x;
		const dy = upEvent.clientY - start.y;
		commitMutation(() => moveModules(page, ids, dx, dy, upEvent.altKey));
	};
	document.addEventListener("pointermove", pointerMove);
	document.addEventListener("pointerup", pointerUp, { once: true });
}

function moveModules(page, ids, dx, dy, disableSnap) {
	const viewport = pageViewport(page);
	const idSet = new Set(ids);
	const movedRects = [];
	for (const id of ids) {
		const module = page.modules[id];
		if (!module) continue;
		const before = moduleRect(page, module);
		const rect = { ...before, x: before.x + dx, y: before.y + dy };
		if (!disableSnap) {
			rect.x = snapValue(rect.x, GRID);
			rect.y = snapValue(rect.y, GRID);
		}
		module.frame = frameFromRect(rect, inferAnchor(rect, viewport), viewport);
		movedRects.push({ id, ...rect });
	}
	const occupied = [...movedRects];
	for (const id of page.root_ids) {
		if (idSet.has(id) || !page.modules[id]) continue;
		const module = page.modules[id];
		const rect = moduleRect(page, module);
		const free = findNearestFreeRect(rect, occupied, viewport.width, GRID);
		if (free.x !== rect.x || free.y !== rect.y) module.frame = frameFromRect(free, inferAnchor(free, viewport), viewport);
		occupied.push({ id, ...free });
	}
}

function beginResize(event, page, module) {
	event.preventDefault();
	event.stopPropagation();
	const startX = event.clientX;
	const startWidth = moduleRect(page, module).width;
	const target = event.currentTarget.closest("[data-module-id]");
	const pointerMove = (moveEvent) => { target.style.width = `${Math.max(240, startWidth + moveEvent.clientX - startX)}px`; };
	const pointerUp = (upEvent) => {
		document.removeEventListener("pointermove", pointerMove);
		document.removeEventListener("pointerup", pointerUp);
		const width = Math.max(240, snapValue(startWidth + upEvent.clientX - startX, GRID));
		commitMutation(() => {
			const viewport = pageViewport(page);
			const rect = { ...moduleRect(page, module), width };
			module.frame = frameFromRect(rect, module.frame.anchor, viewport);
			resolveRootCollisions(page, [module.id]);
		});
	};
	document.addEventListener("pointermove", pointerMove);
	document.addEventListener("pointerup", pointerUp, { once: true });
}

function setFrames(page, ids, transform) {
	const viewport = pageViewport(page);
	const rects = ids.map((id) => moduleRect(page, page.modules[id]));
	const next = transform(rects);
	ids.forEach((id, index) => { page.modules[id].frame = frameFromRect(next[index], inferAnchor(next[index], viewport), viewport); });
}

function alignSelection(page, kind) {
	const ids = selectedRootIds(page);
	if (ids.length < 2) return;
	commitMutation(() => {
		setFrames(page, ids, (rects) => {
			const reference = rects[0];
			return rects.map((rect) => {
				if (kind === "left") return { ...rect, x: reference.x };
				if (kind === "right") return { ...rect, x: reference.x + reference.width - rect.width };
				if (kind === "top") return { ...rect, y: reference.y };
				if (kind === "bottom") return { ...rect, y: reference.y + reference.height - rect.height };
				return rect;
			});
		});
		resolveRootCollisions(page, ids);
	});
}

function distributeSelection(page, axis) {
	const ids = selectedRootIds(page);
	if (ids.length < 3) return;
	commitMutation(() => {
		setFrames(page, ids, (rects) => distributeRects(rects, axis));
		resolveRootCollisions(page, ids);
	});
}

function equalWidth(page) {
	const ids = selectedRootIds(page);
	if (ids.length < 2) return;
	const width = moduleRect(page, page.modules[ids[0]]).width;
	commitMutation(() => {
		const viewport = pageViewport(page);
		for (const id of ids) {
			const module = page.modules[id];
			const rect = { ...moduleRect(page, module), width };
			module.frame = frameFromRect(rect, module.frame.anchor, viewport);
		}
		resolveRootCollisions(page, ids);
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

function groupSelection(page, type) {
	const ids = selectedRootIds(page);
	if (!validateContainerDepth(page, type, ids)) {
		toast("warn", type === "group"
			? t("aaalice.operation.groupInvalid", "Select at least two ungrouped cards. Groups cannot be nested.")
			: t("aaalice.operation.carouselInvalid", "Select at least two cards or groups. Carousels cannot be nested."));
		return;
	}
	const viewport = pageViewport(page);
	const rects = ids.map((id) => moduleRect(page, page.modules[id]));
	const bounds = {
		x: Math.min(...rects.map((rect) => rect.x)),
		y: Math.min(...rects.map((rect) => rect.y)),
		width: Math.max(...rects.map((rect) => rect.x + rect.width)) - Math.min(...rects.map((rect) => rect.x)),
		height: Math.max(...rects.map((rect) => rect.y + rect.height)) - Math.min(...rects.map((rect) => rect.y)),
	};
	commitMutation(() => {
		const container = createContainerModule(type, ids, frameFromRect(bounds, inferAnchor(bounds, viewport), viewport));
		page.modules[container.id] = container;
		for (const id of ids) page.modules[id].parent_id = container.id;
		const firstIndex = Math.min(...ids.map((id) => page.root_ids.indexOf(id)));
		page.root_ids = page.root_ids.filter((id) => !ids.includes(id));
		page.root_ids.splice(firstIndex, 0, container.id);
		resolveRootCollisions(page, [container.id]);
		selection = new Set([container.id]);
		selectionAnchorId = container.id;
	});
}

function ungroup(page, module) {
	if (!["group", "carousel"].includes(module.type)) return;
	const base = moduleRect(page, module);
	const viewport = pageViewport(page);
	commitMutation(() => {
		const rootIndex = page.root_ids.indexOf(module.id);
		const children = [...module.children];
		page.root_ids = page.root_ids.filter((id) => id !== module.id);
		children.forEach((id, index) => {
			const child = page.modules[id];
			child.parent_id = null;
			const rect = { x: base.x + index * 24, y: base.y + index * 24, width: child.frame.width, height: moduleHeight(id) };
			child.frame = frameFromRect(rect, inferAnchor(rect, viewport), viewport);
		});
		page.root_ids.splice(Math.max(0, rootIndex), 0, ...children);
		delete page.modules[module.id];
		resolveRootCollisions(page, children);
		selection = new Set(children);
	});
}

function setAnchor(page, ids, anchor) {
	const viewport = pageViewport(page);
	commitMutation(() => {
		for (const id of ids) {
			const module = page.modules[id];
			if (module) module.frame = frameFromRect(moduleRect(page, module), anchor, viewport);
		}
	});
}

function moveToPage(page, ids, targetPage) {
	if (page.id === targetPage.id) return;
	commitMutation(() => {
		for (const id of ids) {
			const descendants = moduleDescendants(page, id);
			for (const descendant of descendants) targetPage.modules[descendant] = page.modules[descendant];
			targetPage.modules[id].parent_id = null;
			targetPage.root_ids.push(id);
			for (const descendant of descendants) delete page.modules[descendant];
		}
		page.root_ids = page.root_ids.filter((id) => !ids.includes(id));
		resolveRootCollisions(targetPage, ids);
		selection.clear();
	});
}

function removeSelected(page, ids) {
	commitMutation(() => {
		for (const id of ids) removeModule(page, id);
		selection.clear();
	});
}

async function renameModule(module) {
	const property = module.type === "node" ? "label_override" : module.type === "heading" ? "content" : "title";
	const value = await promptText(t("aaalice.operation.rename", "Rename"), module[property] || "");
	if (value == null) return;
	commitMutation(() => { module[property] = String(value).trim(); });
}

async function editContent(module) {
	const title = module.type === "heading" ? t("aaalice.operation.editHeading", "Edit heading") : t("aaalice.operation.editMarkdown", "Edit Markdown");
	const value = await modal(title, (body, close) => {
		const input = document.createElement("textarea");
		input.className = "aaalice-operation-content-editor";
		input.value = module.content || "";
		const actions = el("div", "aaalice-modal-actions");
		actions.append(
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary", onClick: () => close(null) }),
			button({ label: t("aaalice.common.save", "Save"), onClick: () => close(input.value) }),
		);
		body.append(input, actions);
	});
	if (value == null) return;
	commitMutation(() => { module.content = value; });
}

function moduleMenu(event, page, module) {
	if (!editMode) return;
	if (!selection.has(module.id)) selection = new Set([module.id]);
	const ids = selectedRootIds(page, module.id);
	const items = [
		{ label: t("aaalice.operation.rename", "Rename"), action: () => renameModule(module) },
		...(["heading", "markdown"].includes(module.type) ? [{ label: t("aaalice.operation.editContent", "Edit content"), action: () => editContent(module) }] : []),
		"separator",
		{ label: t("aaalice.operation.group", "Group"), disabled: ids.length < 2, action: () => groupSelection(page, "group") },
		{ label: t("aaalice.operation.carousel", "Group as carousel"), disabled: ids.length < 2, action: () => groupSelection(page, "carousel") },
		{ label: t("aaalice.operation.ungroup", "Ungroup"), disabled: ids.length !== 1 || !["group", "carousel"].includes(module.type), action: () => ungroup(page, module) },
		...(module.type === "carousel" ? [{
			label: t("aaalice.operation.defaultCarouselPage", "Use current slide as default"),
			disabled: !carouselPages.get(module.id) || carouselPages.get(module.id) === module.default_child_id,
			action: () => commitMutation(() => { module.default_child_id = carouselPages.get(module.id); }),
		}] : []),
		"separator",
		{ label: t("aaalice.operation.align", "Align"), children: [
			{ label: t("aaalice.operation.alignLeft", "Left"), disabled: ids.length < 2, action: () => alignSelection(page, "left") },
			{ label: t("aaalice.operation.alignRight", "Right"), disabled: ids.length < 2, action: () => alignSelection(page, "right") },
			{ label: t("aaalice.operation.alignTop", "Top"), disabled: ids.length < 2, action: () => alignSelection(page, "top") },
			{ label: t("aaalice.operation.alignBottom", "Bottom"), disabled: ids.length < 2, action: () => alignSelection(page, "bottom") },
		] },
		{ label: t("aaalice.operation.distribute", "Distribute"), children: [
			{ label: t("aaalice.operation.horizontal", "Horizontally"), disabled: ids.length < 3, action: () => distributeSelection(page, "x") },
			{ label: t("aaalice.operation.vertical", "Vertically"), disabled: ids.length < 3, action: () => distributeSelection(page, "y") },
		] },
		{ label: t("aaalice.operation.equalWidth", "Equal width"), disabled: ids.length < 2, action: () => equalWidth(page) },
		{ label: t("aaalice.operation.style", "Style"), children: MODULE_STYLES.map((style) => ({ label: t(`aaalice.operation.style_${style}`, style), action: () => commitMutation(() => { for (const id of ids) page.modules[id].style = style; }) })) },
		{ label: t("aaalice.operation.anchor", "Anchor"), children: Object.keys(OPERATION_ANCHORS).map((anchor) => ({ label: t(`aaalice.operation.anchor_${anchor}`, anchor), action: () => setAnchor(page, ids, anchor) })) },
		...(currentState().pages.length > 1 ? [{ label: t("aaalice.operation.moveToPage", "Move to page"), children: currentState().pages.filter((candidate) => candidate.id !== page.id).map((candidate) => ({ label: candidate.name, action: () => moveToPage(page, ids, candidate) })) }] : []),
		"separator",
		{ label: t("aaalice.operation.remove", "Remove from Operation Panel"), danger: true, action: () => removeSelected(page, ids) },
	];
	contextMenu(event, items);
}

function renderRootModule(page, module) {
	const wrapper = el("div", `aaalice-operation-module${selection.has(module.id) ? " is-selected" : ""}${editMode ? " is-editing" : ""}`);
	wrapper.dataset.moduleId = module.id;
	const rect = moduleRect(page, module);
	wrapper.style.left = `${rect.x}px`;
	wrapper.style.top = `${rect.y}px`;
	wrapper.style.width = `${rect.width}px`;
	wrapper.append(renderModuleContent(page, module));
	if (editMode) {
		wrapper.append(el("div", "aaalice-operation-drag-surface"));
		const resize = el("button", { className: "aaalice-operation-resize", attrs: { type: "button", "aria-label": t("aaalice.operation.resize", "Resize width") } });
		resize.addEventListener("pointerdown", (event) => beginResize(event, page, module));
		wrapper.append(resize);
	}
	wrapper.addEventListener("pointerdown", (event) => beginMove(event, page, module, wrapper));
	wrapper.addEventListener("contextmenu", (event) => moduleMenu(event, page, module));
	wrapper.addEventListener("dblclick", () => { if (editMode && ["heading", "markdown"].includes(module.type)) editContent(module); });
	const measure = () => {
		const height = Math.ceil(wrapper.scrollHeight);
		if (height && measuredHeights.get(module.id) !== height) {
			measuredHeights.set(module.id, height);
			scheduleCollisionReflow(page.id);
			scheduleRender();
		}
	};
	if (globalThis.ResizeObserver) {
		const observer = new ResizeObserver(measure);
		observer.observe(wrapper);
		viewCleanups.add(() => observer.disconnect());
	} else requestAnimationFrame(measure);
	return wrapper;
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
		selection.clear();
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
		selection.clear();
	});
}

function pageMenu(event, page) {
	if (!editMode) return;
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
			actions.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary", onClick: () => close(null) }), button({ label: t("aaalice.common.save", "Save"), onClick: () => close(input.value) }));
			body.append(input, actions);
		});
	if (content == null) return;
	const viewport = pageViewport(page);
	const preferred = { x: point.x, y: point.y, width: type === "heading" ? 560 : 440, height: type === "heading" ? 96 : 220 };
	const rect = findNearestFreeRect(preferred, occupiedRects(page), viewport.width, GRID);
	commitMutation(() => {
		const module = createContentModule(type, content, frameFromRect(rect, inferAnchor(rect, viewport), viewport));
		page.modules[module.id] = module;
		page.root_ids.push(module.id);
		selection = new Set([module.id]);
	});
}

function canvasMenu(event, page) {
	if (!editMode || event.target.closest("[data-module-id]")) return;
	const bounds = canvasElement.getBoundingClientRect();
	const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
	contextMenu(event, [
		{ label: t("aaalice.operation.addHeading", "Add heading"), action: () => addContentModule(page, "heading", point) },
		{ label: t("aaalice.operation.addMarkdown", "Add Markdown"), action: () => addContentModule(page, "markdown", point) },
	]);
}

function setDesign(page, value) {
	const preset = OPERATION_DESIGN_PRESETS[value];
	const hostRect = workspaceRoot?.getBoundingClientRect();
	commitMutation(() => {
		page.design = value === "current"
			? { preset: "current", width: Math.max(960, Math.round(hostRect?.width || 1440)), height: Math.max(640, Math.round(hostRect?.height || 900)) }
			: { preset: value, ...preset };
		resolveRootCollisions(page, page.root_ids);
	});
}

function renderToolbar(root, state, page) {
	const toolbar = el("header", "aaalice-operation-toolbar");
	const pageArea = el("div", "aaalice-operation-page-area");
	if (state.pages.length > 1) {
		const nav = el("nav", { className: "aaalice-operation-page-tabs", attrs: { role: "tablist", "aria-label": t("aaalice.operation.pagesAria", "Operation pages") } });
		for (const candidate of [...state.pages].sort((a, b) => a.order - b.order)) {
			const active = candidate.id === page.id;
			const tab = button({ label: candidate.name, variant: "ghost", size: "sm", className: `aaalice-operation-page-tab${active ? " is-active" : ""}` });
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-selected", String(active));
			tab.addEventListener("click", () => { activePageId = candidate.id; selection.clear(); renderAll(); });
			tab.addEventListener("contextmenu", (event) => pageMenu(event, candidate));
			nav.append(tab);
		}
		pageArea.append(nav);
	}
	const actions = el("div", "aaalice-operation-toolbar-actions");
	const presetsLabel = t("aaalice.operation.presets", "Presets");
	const presets = button({ label: presetsLabel, ariaLabel: presetsLabel, title: presetsLabel, iconName: "presets", variant: "secondary", size: "sm", onClick: () => presetMenu().catch((error) => toast("error", error.message || String(error))) });
	actions.append(presets);
	if (editMode) {
		const design = createSelectControl([
			{ label: "1440 × 900", value: "1440x900" },
			{ label: "1920 × 1080", value: "1920x1080" },
			{ label: t("aaalice.operation.currentWindow", "Current window"), value: "current" },
		], page.design?.preset || "1440x900", { ariaLabel: t("aaalice.operation.designSize", "Design size"), onChange: (value) => setDesign(page, value) });
		design.classList.add("aaalice-operation-design-select");
		const addPageLabel = t("aaalice.operation.addPage", "Add page");
		actions.append(design, button({ label: addPageLabel, ariaLabel: addPageLabel, title: addPageLabel, iconName: "add", variant: "secondary", size: "sm", onClick: addPage }));
	}
	const editLabel = editMode ? t("aaalice.operation.finishEditing", "Done") : t("aaalice.operation.editLayout", "Edit layout");
	actions.append(button({
		label: editLabel,
		ariaLabel: editLabel,
		title: editLabel,
		iconName: editMode ? "done" : "edit",
		variant: editMode ? "primary" : "secondary",
		size: "sm",
		onClick: () => { editMode = !editMode; selection.clear(); renderAll(); },
	}));
	toolbar.append(pageArea, actions);
	root.append(toolbar);
}

function renderWorkspace() {
	if (!workspaceRoot) return;
	cleanupAdapters();
	workspaceRoot.replaceChildren();
	const state = currentState();
	const page = currentPage(state);
	workspaceRoot.className = `aaalice-operation-workspace aaalice-operation aaalice-pcp${editMode ? " is-editing" : ""}`;
	renderToolbar(workspaceRoot, state, page);
	const scroll = el("div", "aaalice-operation-scroll");
	canvasElement = el("main", { className: "aaalice-operation-canvas", attrs: { "aria-label": page.name || t("aaalice.operation.title", "Operation Panel") } });
	const viewport = pageViewport(page);
	canvasElement.style.width = `${viewport.width}px`;
	canvasElement.style.setProperty("--aaalice-operation-column-width", `${viewport.width / 12}px`);
	const contentBottom = Math.max(viewport.height, ...page.root_ids.map((id) => {
		const module = page.modules[id];
		if (!module) return 0;
		const rect = moduleRect(page, module);
		return rect.y + rect.height + 24;
	}));
	canvasElement.style.height = `${contentBottom}px`;
	canvasElement.addEventListener("contextmenu", (event) => canvasMenu(event, page));
	canvasElement.addEventListener("pointerdown", (event) => {
		if (editMode && event.target === canvasElement) {
			selection.clear();
			renderAll();
		}
	});
	for (const id of page.root_ids) if (page.modules[id]) canvasElement.append(renderRootModule(page, page.modules[id]));
	const empty = !page.root_ids.length ? emptyState({
		title: t("aaalice.operation.emptyTitle", "This page is empty"),
		description: editMode
			? t("aaalice.operation.emptyEdit", "Right-click the canvas to add text, or right-click a workflow node to add its controls.")
			: t("aaalice.operation.empty", "Right-click a workflow node and choose Add to Operation Panel."),
		iconName: "layout",
		className: "aaalice-operation-empty",
	}) : null;
	scroll.append(canvasElement);
	workspaceRoot.append(scroll);
	if (empty) workspaceRoot.append(empty);
	if (state.reset_from_version != null && app.graph && !resetNotices.has(app.graph)) {
		resetNotices.add(app.graph);
		toast("info", t("aaalice.operation.layoutReset", "Operation Panel uses a new layout format. The previous layout was not migrated."));
	}
	positionWorkspace();
}

function slug(value) {
	return String(value || "card").trim().toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "card";
}

function nodeModulesInScope(page) {
	const roots = selectedRootIds(page);
	const ids = roots.length ? roots.flatMap((id) => moduleDescendants(page, id)) : page.root_ids.flatMap((id) => moduleDescendants(page, id));
	return [...new Set(ids)].map((id) => page.modules[id]).filter((module) => module?.type === "node");
}

function presetItems(page) {
	const nodes = graphNodes();
	return nodeModulesInScope(page)
		.map((module) => ({ module, node: nodes.get(module.node_id) }))
		.filter((item) => item.node && presetControls(item.node, item.module).length);
}

async function ensurePresetKeys(items) {
	const used = new Set(items.map((item) => item.module.preset_key).filter(Boolean).map((key) => key.toLocaleLowerCase()));
	const assignments = [];
	for (const item of items) if (!item.module.preset_key) {
		const base = slug(cardTitle(item.node, item.module));
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
		controls: Object.fromEntries(presetControls(node, module).map((control) => [control.key, cloneData(control.read())])),
	}));
	await saveOperationPreset({ name: name.trim(), cards });
	notifyChanged();
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
		const controls = new Map(presetControls(item.node, item.module).map((control) => [control.key, control]));
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
			try { change.control.write(change.previous); } catch (rollbackError) { console.error("[Aaalice] Preset rollback failed", rollbackError); }
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
			["save", selection.size ? t("aaalice.operation.preset.saveSelection", "Save selected values") : t("aaalice.operation.preset.savePage", "Save page values")],
			["load", t("aaalice.operation.preset.load", "Load values")],
			["delete", t("aaalice.operation.preset.delete", "Delete preset")],
		]) body.append(button({ label, variant: "secondary", className: "aaalice-choice-btn", onClick: () => close(value) }));
	});
	if (action === "save") await savePreset();
	else if (action === "load") await loadPreset();
	else if (action === "delete") await deletePreset();
}

function sideToolbar() {
	return document.querySelector('[data-testid="side-toolbar"]') || document.querySelector("nav.side-tool-bar-container");
}

function nativeToolbarParts(graphPanel) {
	const verticalSplitter = graphPanel?.parentElement;
	const centerPanel = verticalSplitter?.parentElement;
	const actionbar = centerPanel?.querySelector(".actionbar-container");
	const trailing = actionbar?.parentElement?.parentElement;
	const topRow = trailing?.parentElement;
	const leading = topRow?.firstElementChild?.firstElementChild;
	return { actionbar, centerPanel, leading, trailing };
}

function setPortalBounds(element, bounds) {
	if (!element) return;
	element.style.left = `${bounds.left}px`;
	element.style.right = `${Math.max(0, innerWidth - bounds.right)}px`;
	element.style.top = `${bounds.top}px`;
	element.style.bottom = `${Math.max(0, innerHeight - bounds.bottom)}px`;
}

function nativeLeadingRect(element) {
	if (!element) return null;
	const controls = [...element.querySelectorAll("button, a, [role='button']")]
		.filter((control) => control.getClientRects().length)
		.map((control) => control.getBoundingClientRect());
	if (!controls.length) return null;
	return { right: Math.max(...controls.map((rect) => rect.right)) };
}

function positionWorkspace() {
	if (!workspaceRoot?.isConnected) return;
	const toolbar = sideToolbar();
	const graphPanel = document.querySelector(".graph-canvas-panel");
	const toolbarRect = toolbar?.getBoundingClientRect();
	const graphRect = graphPanel?.getBoundingClientRect();
	const sidebarOnLeft = !toolbarRect || toolbarRect.left < innerWidth / 2;
	const bounds = {
		left: sidebarOnLeft ? Math.max(0, toolbarRect?.right || 0) : 0,
		right: sidebarOnLeft ? innerWidth : Math.max(0, toolbarRect?.left || innerWidth),
		top: Math.max(0, toolbarRect?.top ?? graphRect?.top ?? 0),
		bottom: Math.max(0, graphRect?.bottom || innerHeight),
	};
	setPortalBounds(workspaceBackdrop, bounds);
	setPortalBounds(workspaceRoot, bounds);
	workspaceRoot.style.setProperty("--aaalice-operation-native-chrome-height", `${Math.max(0, (graphRect?.top || 0) - bounds.top)}px`);
	const { leading, trailing } = nativeToolbarParts(graphPanel);
	const leadingRect = nativeLeadingRect(leading);
	const trailingRect = trailing?.getClientRects().length ? trailing.getBoundingClientRect() : null;
	const insets = commandBarInsets(bounds, leadingRect, trailingRect);
	workspaceRoot.style.setProperty("--aaalice-operation-command-left", `${insets.left}px`);
	workspaceRoot.style.setProperty("--aaalice-operation-command-right", `${insets.right}px`);
	workspaceRoot.classList.toggle("is-command-compact", insets.width < 620);
	workspaceRoot.classList.toggle("is-command-hidden", insets.width < 180);
}

function scheduleWorkspacePosition() {
	if (workspacePositionFrame) cancelAnimationFrame(workspacePositionFrame);
	workspacePositionFrame = requestAnimationFrame(() => {
		workspacePositionFrame = 0;
		positionWorkspace();
	});
}

function observeWorkspaceBounds() {
	workspacePositionCleanup?.();
	const graphPanel = document.querySelector(".graph-canvas-panel");
	const native = nativeToolbarParts(graphPanel);
	const observed = [sideToolbar(), graphPanel, native.leading, native.trailing].filter(Boolean);
	const observer = globalThis.ResizeObserver ? new ResizeObserver(scheduleWorkspacePosition) : null;
	for (const element of observed) observer?.observe(element);
	window.addEventListener("resize", scheduleWorkspacePosition);
	workspacePositionCleanup = () => {
		observer?.disconnect();
		window.removeEventListener("resize", scheduleWorkspacePosition);
		if (workspacePositionFrame) cancelAnimationFrame(workspacePositionFrame);
		workspacePositionFrame = 0;
		workspacePositionCleanup = null;
	};
}

function restoreSidebarHost() {
	for (const element of collapsedSidebarElements) element.classList.remove("aaalice-operation-sidebar-collapsed");
	collapsedSidebarElements.clear();
}

function collapseSidebarHost() {
	restoreSidebarHost();
	const host = sidebarContainer?.closest?.(".side-bar-panel")
		|| [...document.querySelectorAll(".side-bar-panel")].find((element) => element.getClientRects().length);
	if (!host) return;
	const candidates = [host, host.previousElementSibling, host.nextElementSibling];
	for (const element of candidates) {
		if (!(element instanceof HTMLElement)) continue;
		if (element !== host && !element.classList.contains("p-splitter-gutter")) continue;
		element.classList.add("aaalice-operation-sidebar-collapsed");
		collapsedSidebarElements.add(element);
	}
}

function scheduleSidebarHostCollapse() {
	if (sidebarCollapseFrame) cancelAnimationFrame(sidebarCollapseFrame);
	sidebarCollapseFrame = requestAnimationFrame(() => {
		sidebarCollapseFrame = 0;
		collapseSidebarHost();
		scheduleWorkspacePosition();
	});
}

function mountWorkspace() {
	// The sidebar tab remains the native toggle, but its SplitterPanel must not
	// reserve a second layout shell while the body-level workspace is visible.
	collapseSidebarHost();
	scheduleSidebarHostCollapse();
	if (sidebarContainer) sidebarContainer.hidden = true;
	if (workspaceRoot?.isConnected) {
		renderWorkspace();
		scheduleWorkspacePosition();
		return;
	}
	document.querySelectorAll(`${WORKSPACE_SELECTOR}, ${BACKDROP_SELECTOR}`).forEach((element) => element.remove());
	workspaceBackdrop = el("div", {
		className: "aaalice-operation-backdrop aaalice-pcp",
		attrs: { "aria-hidden": "true", "data-aaalice-operation-backdrop": SIDEBAR_ID },
	});
	workspaceRoot = el("section", {
		className: "aaalice-operation-workspace",
		attrs: {
			role: "region",
			"aria-label": t("aaalice.operation.title", "Operation Panel"),
			"data-aaalice-operation-workspace": SIDEBAR_ID,
		},
	});
	document.body.append(workspaceBackdrop, workspaceRoot);
	renderWorkspace();
	observeWorkspaceBounds();
	scheduleWorkspacePosition();
}

function unmountWorkspace() {
	cleanupAdapters();
	workspacePositionCleanup?.();
	if (sidebarCollapseFrame) cancelAnimationFrame(sidebarCollapseFrame);
	sidebarCollapseFrame = 0;
	restoreSidebarHost();
	if (sidebarContainer) sidebarContainer.hidden = false;
	document.querySelectorAll(`${WORKSPACE_SELECTOR}, ${BACKDROP_SELECTOR}`).forEach((element) => element.remove());
	workspaceRoot = null;
	workspaceBackdrop = null;
	canvasElement = null;
	selection.clear();
	editMode = false;
}

function renderAll() {
	if (workspaceRoot) renderWorkspace();
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
			sidebarContainer = container;
			try { mountWorkspace(); }
			catch (error) {
				console.error(error);
				toast("error", error.message || String(error));
				throw error;
			}
		},
		destroy() {
			unmountWorkspace();
			sidebarContainer = null;
		},
	});
}

app.registerExtension({
	name: "ComfyUI.Aaalice.OperationPanel",
	async init() { await ensureI18nReady(); },
	getNodeMenuItems(node) {
		if (!node || !(app.graph?._nodes || []).includes(node) || (node.isVirtualNode && !isSubgraphNode(node)) || nodeModuleLocation(node.id)) return [];
		const localized = t("aaalice.operation.add", "🎛️ Add to Operation Panel");
		return [{ content: localized.startsWith("🎛️") ? localized : `🎛️ ${localized}`, callback: () => addNodeToPanel(node) }];
	},
	async setup() {
		installOperationPanelApi(renderAll);
		registerSidebar();
		window.addEventListener(EVENT_OPERATION_CHANGED, scheduleRender);
		window.addEventListener(EVENT_PARAMETER_LIST, scheduleRender);
		for (const eventName of ["executed", "execution_success", "execution_error"]) api.addEventListener?.(eventName, scheduleRender);
		const graph = app.graph;
		if (graph && !graph.__aaaliceOperationPatched) {
			graph.__aaaliceOperationPatched = true;
			const add = graph.add;
			graph.add = function () {
				const result = add.apply(this, arguments);
				setTimeout(notifyParameterListChanged, 0);
				return result;
			};
			const remove = graph.remove;
			graph.remove = function () {
				const result = remove.apply(this, arguments);
				setTimeout(notifyParameterListChanged, 0);
				return result;
			};
		}
	},
});
