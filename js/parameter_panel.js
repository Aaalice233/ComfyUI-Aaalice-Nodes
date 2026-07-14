/** ParameterPanel DOM controls, right-click editor, prompt injection and queue behavior. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { renderSafeMarkdown } from "./lib/safe_markdown.js";
import {
	EVENT_PARAMETER_CHANGED,
	MAX_TUNABLE,
	applySeedAfterQueue,
	cloneData,
	countTunable,
	createParameter,
	displayName,
	ensureParameters,
	isParameterPanel,
	materializeParameters,
	newParamId,
	normalizeDynamicOptions,
	notifyParameterChanged,
	notifyParameterListChanged,
	refreshComfyOptions,
	setCustomName,
	uniqueName,
	validateParametersDraft,
} from "./lib/param_model.js";

const NODE = "ParameterPanel";
const MIN_WIDTH = 310;

function el(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text != null) element.textContent = text;
	return element;
}

function isolate(element) {
	for (const eventName of ["pointerdown", "mousedown", "wheel"]) element.addEventListener(eventName, (event) => event.stopPropagation());
	return element;
}

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({
		severity,
		summary: t(`aaalice.common.${severity === "error" ? "error" : "notice"}`, severity === "error" ? "Error" : "Notice"),
		detail,
		life: 4500,
	});
}

async function confirmAction(text) {
	if (app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({ title: t("aaalice.common.confirm", "Confirm"), message: text }));
	return globalThis.confirm(text);
}

function markGraphChange(node, before) {
	if (before) node.graph?.beforeChange?.();
	else {
		node.graph?.afterChange?.();
		node.graph?.setDirtyCanvas?.(true, true);
	}
}

function formField(label, control) {
	const field = el("label", "aaalice-form-field");
	field.append(el("span", null, label), control);
	return field;
}

function selectInput(options, value) {
	const select = document.createElement("select");
	for (const option of options) select.add(new Option(option, option, false, option === value));
	return select;
}

function applyOutputPresentation(node) {
	const output = node.outputs?.[0];
	if (!output) return;
	const styles = getComputedStyle(document.documentElement);
	const color = (...names) => names.map((name) => styles.getPropertyValue(name).trim()).find(Boolean) || "";
	output.name = "parameters";
	output.label = t("aaalice.pcp.output", "Param Pack");
	output.type = "AAALICE_PARAM_PACK";
	output.shape = globalThis.LiteGraph?.CIRCLE_SHAPE ?? 1;
	output.color_off = color("--descrip-text", "--p-text-muted-color") || globalThis.LiteGraph?.NODE_TEXT_COLOR || "#999";
	output.color_on = color("--p-primary-color", "--primary-color") || output.color_off;
}

function parameterLinkCount(node, parameterId) {
	let count = 0;
	for (const linkId of node.outputs?.[0]?.links || []) {
		const link = node.graph?.links?.[linkId];
		const target = node.graph?.getNodeById?.(link?.target_id);
		if (!target || ![target.comfyClass, target.type].includes("ParameterBreak")) continue;
		for (const output of target.outputs || []) if (output?._aaaliceParamId === parameterId) count += output.links?.length || 0;
	}
	return count;
}

async function chooseImage(parameter) {
	return new Promise((resolve) => {
		const overlay = el("div", "aaalice-modal-backdrop");
		const dialog = el("div", "aaalice-modal");
		const body = el("div", "aaalice-modal-body");
		const close = (value) => { overlay.remove(); resolve(value); };
		const filename = document.createElement("input");
		filename.type = "text";
		filename.value = parameter.value?.filename || "";
		const existing = el("button", "aaalice-pcp-btn secondary", t("aaalice.pcp.image.useExisting", "Use input filename"));
		existing.addEventListener("click", () => {
			if (!filename.value.trim()) return;
			parameter.value = { filename: filename.value.trim(), subfolder: "", type: "input" };
			close(true);
		});
		const upload = document.createElement("input");
		upload.type = "file";
		upload.accept = "image/*";
		upload.addEventListener("change", async () => {
			const file = upload.files?.[0];
			if (!file) return;
			const data = new FormData();
			data.append("image", file);
			data.append("type", "input");
			const response = await api.fetchApi("/upload/image", { method: "POST", body: data });
			if (!response.ok) {
				toast("error", message("aaalice.pcp.error.imageUpload", "Image upload failed: HTTP {status}", { status: response.status }));
				return;
			}
			parameter.value = await response.json();
			close(true);
		});
		body.append(formField(t("aaalice.pcp.image.existing", "Existing input image"), filename), existing, formField(t("aaalice.pcp.image.upload", "Upload new image"), upload));
		dialog.append(el("div", "aaalice-modal-title", t("aaalice.pcp.image.title", "Choose image")), body);
		overlay.append(dialog);
		document.body.append(overlay);
	});
}

let tooltip = null;
let tooltipTimer = null;
function hideTooltip() {
	clearTimeout(tooltipTimer);
	tooltipTimer = null;
	tooltip?.remove();
	tooltip = null;
}

function showTooltip(trigger, description) {
	hideTooltip();
	tooltipTimer = setTimeout(() => {
		tooltip = el("div", "aaalice-parameter-tooltip");
		tooltip.id = `aaalice-tooltip-${Math.random().toString(36).slice(2)}`;
		tooltip.role = "tooltip";
		tooltip.append(renderSafeMarkdown(description));
		document.body.append(tooltip);
		trigger.setAttribute("aria-describedby", tooltip.id);
		const anchor = trigger.getBoundingClientRect();
		const box = tooltip.getBoundingClientRect();
		let left = anchor.left;
		let top = anchor.bottom + 7;
		if (left + box.width > innerWidth - 10) left = innerWidth - box.width - 10;
		if (top + box.height > innerHeight - 10) top = anchor.top - box.height - 7;
		tooltip.style.left = `${Math.max(10, left)}px`;
		tooltip.style.top = `${Math.max(10, top)}px`;
	}, 220);
}

function attachDescription(trigger, description) {
	trigger.tabIndex = 0;
	trigger.addEventListener("mouseenter", () => showTooltip(trigger, description));
	trigger.addEventListener("mouseleave", hideTooltip);
	trigger.addEventListener("focus", () => showTooltip(trigger, description));
	trigger.addEventListener("blur", hideTooltip);
}

document.addEventListener("keydown", (event) => { if (event.key === "Escape") hideTooltip(); });

function valueControl(node, parameter) {
	const config = parameter.config || {};
	const persist = () => notifyParameterChanged(node, { structure: false });
	if (parameter.param_type === "slider") {
		const wrap = el("div", "aaalice-pcp-node-slider");
		const range = isolate(document.createElement("input"));
		range.type = "range";
		range.min = String(config.min ?? 0);
		range.max = String(config.max ?? 100);
		range.step = String(config.step ?? 1);
		range.value = String(parameter.value ?? 0);
		const number = isolate(document.createElement("input"));
		number.type = "number";
		number.value = range.value;
		const updateProgress = () => {
			const min = Number(range.min);
			const max = Number(range.max);
			const progress = max > min ? Math.min(100, Math.max(0, ((Number(range.value) - min) / (max - min)) * 100)) : 0;
			range.style.setProperty("--aaalice-range-progress", `${progress}%`);
		};
		const update = (raw, commit = true) => {
			const value = Number(raw);
			if (!Number.isFinite(value)) return;
			parameter.value = value;
			range.value = number.value = String(value);
			updateProgress();
			if (commit) persist();
		};
		updateProgress();
		range.addEventListener("input", () => update(range.value, false));
		range.addEventListener("change", persist);
		number.addEventListener("change", () => update(number.value));
		wrap.append(range, number);
		return wrap;
	}
	if (parameter.param_type === "switch") {
		const button = isolate(el("button", `aaalice-pcp-node-switch${parameter.value ? " active" : ""}`, parameter.value ? t("aaalice.common.enabled", "Enabled") : t("aaalice.common.disabled", "Disabled")));
		button.type = "button";
		button.addEventListener("click", () => { parameter.value = !parameter.value; persist(); });
		return button;
	}
	if (["dropdown", "enum"].includes(parameter.param_type)) {
		const select = isolate(document.createElement("select"));
		const valid = (config.options || []).includes(parameter.value);
		if (!valid && parameter.value != null) {
			select.add(new Option(`${parameter.value} ⚠`, parameter.value, true, true));
			select.classList.add("invalid");
		}
		for (const option of config.options || []) select.add(new Option(option, option, false, option === parameter.value));
		select.addEventListener("change", () => { parameter.value = select.value; persist(); });
		return select;
	}
	if (parameter.param_type === "image") {
		const button = isolate(el("button", "aaalice-pcp-node-value", parameter.value?.filename || t("aaalice.pcp.image.none", "Choose image")));
		button.addEventListener("click", async () => { if (await chooseImage(parameter)) persist(); });
		return button;
	}
	if (parameter.param_type === "taglist") {
		const input = isolate(document.createElement("input"));
		input.value = (parameter.value || []).join(", ");
		input.addEventListener("change", () => { parameter.value = input.value.split(",").map((item) => item.trim()).filter(Boolean); persist(); });
		return input;
	}
	const input = isolate(parameter.config?.multiline ? document.createElement("textarea") : document.createElement("input"));
	if (input.tagName === "INPUT") input.type = parameter.param_type === "seed" ? "number" : "text";
	input.value = parameter.value ?? "";
	input.addEventListener("change", () => {
		parameter.value = parameter.param_type === "seed" ? Math.max(0, Number(input.value) || 0) : input.value;
		persist();
	});
	return input;
}

function renderNode(node, root) {
	root.replaceChildren();
	for (const parameter of ensureParameters(node)) {
		if (parameter.param_type === "separator") {
			root.append(el("div", "aaalice-pcp-node-section", displayName(parameter)));
			continue;
		}
		const row = el("div", "aaalice-pcp-node-row");
		const heading = el("div", "aaalice-pcp-node-row-heading");
		const label = el("span", "aaalice-pcp-node-name", displayName(parameter));
		heading.append(label);
		if (parameter.description) {
			const trigger = el("span", "aaalice-pcp-description-trigger");
			trigger.append(label, el("span", "aaalice-pcp-question", "?"));
			heading.append(trigger);
			attachDescription(trigger, parameter.description);
		}
		row.append(heading, valueControl(node, parameter));
		root.append(row);
	}
	if (!ensureParameters(node).length) root.append(el("div", "aaalice-pcp-empty", t("aaalice.pcp.empty", "No parameters. Use the node context menu to edit.")));
}

function nodeHeight(node) {
	return Math.max(58, 12 + ensureParameters(node).reduce((height, parameter) => height + (parameter.param_type === "separator" ? 30 : 58), 0));
}

function inspectorField(label, control) {
	return formField(label, control);
}

function renderInspector(editor, parameter, rerender) {
	const pane = editor.inspector;
	pane.replaceChildren();
	if (!parameter) {
		pane.append(el("div", "aaalice-editor-empty", t("aaalice.pcp.editor.selectParameter", "Select a parameter to edit its settings.")));
		return;
	}
	const header = el("div", "aaalice-editor-inspector-head");
	header.append(el("span", "aaalice-pcp-badge", parameter.param_type));
	pane.append(header);
	const name = document.createElement("input");
	name.value = displayName(parameter);
	name.addEventListener("input", () => {
		setCustomName(parameter, name.value);
		editor.dirty = true;
		const listName = editor.list.querySelector(`[data-id="${CSS.escape(parameter.id)}"] strong`);
		if (listName) listName.textContent = name.value;
		editor.updateValidation?.();
	});
	pane.append(inspectorField(t("aaalice.pcp.field.name", "Name"), name));
	const description = document.createElement("textarea");
	description.rows = 5;
	description.value = parameter.description || "";
	description.addEventListener("input", () => { parameter.description = description.value; editor.dirty = true; editor.updateValidation?.(); });
	pane.append(inspectorField(t("aaalice.pcp.field.description", "Description (Markdown)"), description));
	if (["slider", "seed"].includes(parameter.param_type)) {
		const grid = el("div", "aaalice-pcp-grid2");
		for (const key of ["min", "max", ...(parameter.param_type === "slider" ? ["step"] : [])]) {
			const input = document.createElement("input");
			input.type = "number";
			input.value = String(parameter.config?.[key] ?? (key === "max" ? 100 : key === "step" ? 1 : 0));
			input.addEventListener("input", () => { parameter.config[key] = Number(input.value); editor.dirty = true; editor.updateValidation?.(); });
			grid.append(inspectorField(key, input));
		}
		pane.append(grid);
	}
	if (parameter.param_type === "seed") {
		const behavior = selectInput(["fixed", "increment", "decrement", "randomize"], parameter.config?.control_after_generate || "fixed");
		behavior.addEventListener("change", () => { parameter.config.control_after_generate = behavior.value; editor.dirty = true; editor.updateValidation?.(); });
		pane.append(inspectorField(t("aaalice.pcp.field.seedBehavior", "After generate"), behavior));
	}
	if (["dropdown", "enum"].includes(parameter.param_type)) {
		const source = selectInput(["custom", "sampler", "scheduler", "checkpoint", "lora", "controlnet", "upscale_model"], parameter.config?.source || "custom");
		const options = document.createElement("textarea");
		options.rows = 7;
		options.value = (parameter.config?.options || []).join("\n");
		options.disabled = source.value !== "custom";
		source.addEventListener("change", () => {
			if (source.value === "custom") delete parameter.config.source;
			else parameter.config.source = source.value;
			normalizeDynamicOptions([parameter]);
			options.disabled = source.value !== "custom";
			options.value = (parameter.config.options || []).join("\n");
			editor.dirty = true;
			editor.updateValidation?.();
		});
		options.addEventListener("input", () => { parameter.config.options = options.value.split("\n").map((item) => item.trim()).filter(Boolean); editor.dirty = true; editor.updateValidation?.(); });
		pane.append(inspectorField(t("aaalice.pcp.field.source", "Source"), source), inspectorField(t("aaalice.pcp.field.options", "Options (one per line)"), options));
	}
	if (parameter.param_type === "string") {
		const multiline = document.createElement("input");
		multiline.type = "checkbox";
		multiline.checked = Boolean(parameter.config?.multiline);
		multiline.addEventListener("change", () => { parameter.config.multiline = multiline.checked; editor.dirty = true; editor.updateValidation?.(); });
		pane.append(inspectorField(t("aaalice.pcp.field.multiline", "Multiline"), multiline));
	}
}

function renderEditorList(editor, rerender) {
	editor.list.replaceChildren();
	for (const parameter of editor.parameters) {
		const row = el("div", `aaalice-editor-list-row${editor.selectedId === parameter.id ? " selected" : ""}`);
		row.draggable = true;
		row.dataset.id = parameter.id;
		const handle = el("span", "aaalice-editor-drag", "⋮⋮");
		const text = el("button", "aaalice-editor-list-select");
		text.type = "button";
		text.append(el("strong", null, displayName(parameter)), el("small", null, parameter.param_type));
		text.addEventListener("click", () => { editor.selectedId = parameter.id; rerender(); });
		const duplicate = el("button", "aaalice-editor-mini", "⧉");
		duplicate.title = t("aaalice.common.copy", "Copy");
		duplicate.addEventListener("click", () => {
			const copy = cloneData(parameter);
			copy.id = newParamId();
			setCustomName(copy, uniqueName(editor.parameters, `${displayName(parameter)} Copy`));
			editor.parameters.splice(editor.parameters.indexOf(parameter) + 1, 0, copy);
			editor.selectedId = copy.id;
			editor.dirty = true;
			rerender();
		});
		const remove = el("button", "aaalice-editor-mini danger", "×");
		remove.title = t("aaalice.common.delete", "Delete");
		remove.addEventListener("click", () => {
			const index = editor.parameters.indexOf(parameter);
			editor.parameters.splice(index, 1);
			editor.selectedId = editor.parameters[Math.min(index, editor.parameters.length - 1)]?.id || null;
			editor.dirty = true;
			rerender();
		});
		row.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", parameter.id));
		row.addEventListener("dragover", (event) => { event.preventDefault(); row.classList.add("drop-target"); });
		row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
		row.addEventListener("drop", (event) => {
			event.preventDefault();
			row.classList.remove("drop-target");
			const sourceId = event.dataTransfer?.getData("text/plain");
			const from = editor.parameters.findIndex((item) => item.id === sourceId);
			const to = editor.parameters.indexOf(parameter);
			if (from < 0 || from === to) return;
			const [moved] = editor.parameters.splice(from, 1);
			editor.parameters.splice(to, 0, moved);
			editor.dirty = true;
			rerender();
		});
		row.append(handle, text, duplicate, remove);
		editor.list.append(row);
	}
}

async function openParameterEditor(node) {
	const original = ensureParameters(node);
	const editor = { parameters: cloneData(original), selectedId: original[0]?.id || null, dirty: false, list: null, inspector: null };
	const overlay = el("div", "aaalice-modal-backdrop");
	const dialog = el("div", "aaalice-modal aaalice-parameter-editor");
	const titleInput = document.createElement("input");
	titleInput.className = "aaalice-editor-title-input";
	const titleAtOpen = node.getTitle?.() || node.title || node.type || t("aaalice.pcp.title", "Parameter Panel");
	titleInput.value = titleAtOpen;
	const header = el("div", "aaalice-parameter-editor-header");
	header.append(el("span", null, t("aaalice.pcp.editor.title", "Edit parameters")), titleInput);
	const workspace = el("div", "aaalice-parameter-editor-workspace");
	const rail = el("aside", "aaalice-parameter-editor-rail");
	const addBar = el("div", "aaalice-editor-add");
	const type = selectInput(["slider", "seed", "switch", "string", "dropdown", "enum", "image", "taglist", "separator"], "slider");
	const add = el("button", "aaalice-pcp-btn", t("aaalice.pcp.editor.add", "Add parameter"));
	editor.list = el("div", "aaalice-editor-compact-list");
	addBar.append(type, add);
	rail.append(editor.list, addBar);
	editor.inspector = el("main", "aaalice-parameter-editor-inspector");
	workspace.append(rail, editor.inspector);
	const errors = el("div", "aaalice-pcp-error");
	const footer = el("div", "aaalice-parameter-editor-footer");
	const cancel = el("button", "aaalice-pcp-btn secondary", t("aaalice.common.cancel", "Cancel"));
	const save = el("button", "aaalice-pcp-btn", t("aaalice.common.save", "Save"));
	footer.append(errors, cancel, save);
	dialog.append(header, workspace, footer);
	overlay.append(dialog);
	document.body.append(overlay);
	const rerender = (list = true) => {
		if (list) renderEditorList(editor, rerender);
		renderInspector(editor, editor.parameters.find((item) => item.id === editor.selectedId), rerender);
		editor.updateValidation();
	};
	editor.updateValidation = () => {
		const validation = validateParametersDraft(editor.parameters);
		errors.textContent = validation.join(" · ");
		save.disabled = Boolean(validation.length);
	};
	add.addEventListener("click", () => {
		if (type.value !== "separator" && countTunable(editor.parameters) >= MAX_TUNABLE) {
			toast("warn", message("aaalice.pcp.error.maxParameters", "At most {count} tunable parameters.", { count: MAX_TUNABLE }));
			return;
		}
		const parameter = createParameter(type.value, { name: uniqueName(editor.parameters, type.value === "separator" ? "Section" : type.value), name_custom: true });
		editor.parameters.push(parameter);
		editor.selectedId = parameter.id;
		editor.dirty = true;
		rerender();
	});
	titleInput.addEventListener("input", () => { editor.dirty = true; });
	const close = async (force = false) => {
		if (!force && editor.dirty && !(await confirmAction(t("aaalice.pcp.editor.discard", "Discard unsaved parameter changes?")))) return;
		document.removeEventListener("keydown", onKey);
		overlay.remove();
	};
	const onKey = (event) => { if (event.key === "Escape") close(); };
	document.addEventListener("keydown", onKey);
	overlay.addEventListener("pointerdown", (event) => { if (event.target === overlay) close(); });
	cancel.addEventListener("click", () => close());
	save.addEventListener("click", async () => {
		const validation = validateParametersDraft(editor.parameters);
		if (validation.length) return;
		const liveIds = new Set(editor.parameters.map((item) => item.id));
		const affected = original.filter((item) => !liveIds.has(item.id)).map((item) => ({ name: displayName(item), links: parameterLinkCount(node, item.id) })).filter((item) => item.links);
		if (affected.length) {
			const detail = affected.map((item) => `${item.name}: ${item.links}`).join("\n");
			if (!(await confirmAction(`${t("aaalice.pcp.confirm.parameterLinks", "Downstream links will be disconnected.")}\n${detail}`))) return;
		}
		markGraphChange(node, true);
		node.properties.parameters = editor.parameters;
		const nextTitle = titleInput.value.trim();
		if (!nextTitle) delete node.title;
		else if (nextTitle !== titleAtOpen) node.title = nextTitle;
		notifyParameterChanged(node, { structure: true });
		markGraphChange(node, false);
		await close(true);
	});
	rerender();
}

function setupParameterPanel(node, loaded = false) {
	if (!isParameterPanel(node) || node._aaaliceParameterPanelMounted) return;
	node._aaaliceParameterPanelMounted = true;
	ensureParameters(node);
	normalizeDynamicOptions(node.properties.parameters);
	applyOutputPresentation(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] ParameterPanel requires addDOMWidget");
	const root = el("div", "aaalice-pcp aaalice-pcp-node-root");
	const height = () => nodeHeight(node);
	const widget = node.addDOMWidget("aaalice_parameter_panel", "custom", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 8,
		getMinHeight: height,
		getHeight: height,
		getValue: () => "",
		setValue: () => {},
	});
	node._aaaliceParameterRedraw = () => {
		renderNode(node, root);
		const desired = height();
		widget.computedHeight = desired;
		node.setSize([Math.max(node.size?.[0] || MIN_WIDTH, MIN_WIDTH), desired + 44]);
		applyOutputPresentation(node);
		node.setDirtyCanvas?.(true, true);
	};
	const onChange = (event) => {
		if (event.detail?.nodeId != null && String(event.detail.nodeId) !== String(node.id)) return;
		node._aaaliceParameterRedraw?.();
	};
	window.addEventListener(EVENT_PARAMETER_CHANGED, onChange);
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		window.removeEventListener(EVENT_PARAMETER_CHANGED, onChange);
		return previousRemoved?.apply(this, arguments);
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () {
		const value = previousConfigure?.apply(this, arguments);
		ensureParameters(this);
		setTimeout(() => this._aaaliceParameterRedraw?.(), 0);
		return value;
	};
	node._aaaliceParameterRedraw();
	notifyParameterListChanged();
}

function installPromptHook() {
	if (app._aaaliceParameterPanelPromptHook) return;
	app._aaaliceParameterPanelPromptHook = true;
	const original = app.graphToPrompt?.bind(app);
	if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable");
	app.graphToPrompt = async function (...args) {
		const nodes = (app.graph?._nodes || []).filter(isParameterPanel);
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of nodes) {
			const promptNode = output?.[String(node.id)];
			if (!promptNode) continue;
			normalizeDynamicOptions(ensureParameters(node));
			promptNode.inputs ||= {};
			promptNode.inputs.parameters_json = JSON.stringify(materializeParameters(ensureParameters(node)));
			promptNode.inputs.validate_dynamic_values = Boolean(node.outputs?.[0]?.links?.length);
		}
		return result;
	};
	const queue = app.queuePrompt?.bind(app);
	if (queue) app.queuePrompt = async function (...args) {
		const result = await queue(...args);
		for (const node of (app.graph?._nodes || []).filter(isParameterPanel)) applySeedAfterQueue(node);
		return result;
	};
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaaliceParameterPanel) return;
	nodeType.__aaaliceParameterPanel = true;
	const previous = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previous?.apply(this, arguments);
		setupParameterPanel(this, false);
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ParameterPanel",
	async init() {
		try { refreshComfyOptions(await api.getNodeDefs?.()); }
		catch (error) { console.warn("[Aaalice] Failed to load dynamic parameter options", error); }
		await ensureI18nReady();
	},
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	getNodeMenuItems(node) {
		if (!isParameterPanel(node)) return [];
		return [{ content: t("aaalice.pcp.editor.menu", "Edit Parameters…"), callback: () => openParameterEditor(node).catch((error) => toast("error", error.message || String(error))) }];
	},
	nodeCreated(node) { if (isParameterPanel(node)) setupParameterPanel(node, false); },
	loadedGraphNode(node) { if (isParameterPanel(node)) setupParameterPanel(node, true); },
	async setup() {
		installPromptHook();
		for (const node of app.graph?._nodes || []) if (isParameterPanel(node)) setupParameterPanel(node, true);
	},
});
