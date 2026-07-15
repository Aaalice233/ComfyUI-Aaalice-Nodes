/** Versioned workflow state for the modular Operation Panel. */
import { OPERATION_DESIGN_PRESETS, normalizeFrame } from "./operation_layout.js";

export const OPERATION_VERSION = 3;
const OPERATION_PROPERTY = "aaalice_operation_panel";
const resetVersions = new WeakMap();
export const MODULE_STYLES = Object.freeze(["default", "compact", "emphasis", "borderless"]);
const MODULE_TYPES = Object.freeze(["node", "group", "carousel", "heading", "markdown"]);

function newStableId(prefix) {
	return `${prefix}_${crypto.randomUUID()}`;
}

export function createOperationPage(name = "") {
	return {
		id: newStableId("page"),
		name: String(name || "").trim(),
		order: 0,
		design: { preset: "1440x900", width: 1440, height: 900 },
		modules: {},
		root_ids: [],
	};
}

export function createOperationState() {
	const page = createOperationPage();
	return { version: OPERATION_VERSION, default_page_id: page.id, pages: [page] };
}

function normalizeModule(module, id) {
	if (!module || !MODULE_TYPES.includes(module.type)) return null;
	module.id = String(module.id || id);
	module.parent_id = module.parent_id ? String(module.parent_id) : null;
	module.style = MODULE_STYLES.includes(module.style) ? module.style : "default";
	module.frame = normalizeFrame(module.frame);
	if (["group", "carousel"].includes(module.type)) module.children = Array.isArray(module.children) ? module.children.map(String) : [];
	if (module.type === "carousel") module.default_child_id = module.children.includes(module.default_child_id) ? module.default_child_id : module.children[0] || null;
	return module;
}

function normalizePage(page, index) {
	page.id = String(page.id || newStableId("page"));
	page.name = String(page.name || "").trim();
	page.order = Number.isFinite(Number(page.order)) ? Number(page.order) : index;
	const preset = page.design?.preset;
	page.design = preset === "current"
		? { preset: "current" }
		: { preset: OPERATION_DESIGN_PRESETS[preset] ? preset : "1440x900", ...(OPERATION_DESIGN_PRESETS[preset] || OPERATION_DESIGN_PRESETS["1440x900"]) };
	page.modules ||= {};
	for (const [id, module] of Object.entries(page.modules)) {
		const normalized = normalizeModule(module, id);
		if (normalized) page.modules[id] = normalized;
		else delete page.modules[id];
	}
	page.root_ids = (Array.isArray(page.root_ids) ? page.root_ids : Object.keys(page.modules))
		.map(String)
		.filter((id, position, values) => page.modules[id] && !page.modules[id].parent_id && values.indexOf(id) === position);
	for (const [id, module] of Object.entries(page.modules)) if (!module.parent_id && !page.root_ids.includes(id)) page.root_ids.push(id);
	return page;
}

export function operationState(graph, create = false) {
	if (!graph) return null;
	graph.extra ||= {};
	let state = graph.extra[OPERATION_PROPERTY];
	if (state?.version !== OPERATION_VERSION) {
		if (!create) return null;
		const previousVersion = state?.version ?? null;
		state = createOperationState();
		graph.extra[OPERATION_PROPERTY] = state;
		if (previousVersion != null) resetVersions.set(graph, previousVersion);
	}
	delete state.reset_from_version;
	state.pages = Array.isArray(state.pages) && state.pages.length ? state.pages : createOperationState().pages;
	state.pages.forEach(normalizePage);
	if (!state.pages.some((page) => page.id === state.default_page_id)) state.default_page_id = state.pages[0].id;
	return state;
}

export function consumeOperationResetVersion(graph) {
	const version = resetVersions.get(graph) ?? null;
	resetVersions.delete(graph);
	return version;
}

export function findPage(state, pageId) {
	return state.pages.find((page) => page.id === pageId) || state.pages[0];
}

export function moduleDescendants(page, moduleId) {
	const result = [];
	const visit = (id) => {
		const module = page.modules[id];
		if (!module) return;
		result.push(id);
		for (const child of module.children || []) visit(child);
	};
	visit(moduleId);
	return result;
}

export function removeModule(page, moduleId) {
	const module = page.modules[moduleId];
	if (!module) return [];
	const removed = moduleDescendants(page, moduleId);
	if (module.parent_id && page.modules[module.parent_id]) {
		const parent = page.modules[module.parent_id];
		parent.children = parent.children.filter((id) => id !== moduleId);
		if (parent.type === "carousel" && parent.default_child_id === moduleId) parent.default_child_id = parent.children[0] || null;
	} else page.root_ids = page.root_ids.filter((id) => id !== moduleId);
	for (const id of removed) delete page.modules[id];
	return removed;
}

export function createNodeModule(nodeId, frame) {
	const id = newStableId("module");
	return {
		id,
		type: "node",
		parent_id: null,
		style: "default",
		frame: normalizeFrame(frame),
		node_id: String(nodeId),
		label_override: "",
		adapter: null,
		preset_key: "",
	};
}

export function createContentModule(type, content, frame) {
	if (!["heading", "markdown"].includes(type)) throw new Error(`Unsupported Operation module type: ${type}`);
	const id = newStableId("module");
	return { id, type, parent_id: null, style: type === "heading" ? "borderless" : "default", frame: normalizeFrame(frame), content: String(content || "") };
}

export function createContainerModule(type, children, frame, title = "") {
	if (!["group", "carousel"].includes(type)) throw new Error(`Unsupported Operation container type: ${type}`);
	const id = newStableId("module");
	return {
		id,
		type,
		parent_id: null,
		style: "default",
		frame: normalizeFrame(frame),
		title: String(title || "").trim(),
		children: [...children],
		...(type === "carousel" ? { default_child_id: children[0] || null } : {}),
	};
}

export function validateContainerDepth(page, type, childIds) {
	if (!["group", "carousel"].includes(type)) return false;
	for (const id of childIds) {
		const child = page.modules[id];
		if (!child || child.parent_id) return false;
		if (type === "group" && child.type !== "node") return false;
		if (type === "carousel" && !["node", "group"].includes(child.type)) return false;
		if (type === "carousel" && child.type === "group" && child.children.some((nestedId) => ["group", "carousel"].includes(page.modules[nestedId]?.type))) return false;
	}
	return childIds.length >= 2;
}
