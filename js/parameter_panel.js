/** ParameterPanel DOM controls, right-click editor, prompt injection and queue behavior. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { renderSafeMarkdown } from "./lib/safe_markdown.js";
import { badge, button, card, createDialog, el, emptyState, field, icon, iconButton, isolate } from "./lib/ui.js";
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

async function saveActiveWorkflow() {
	const command = app.extensionManager?.command;
	if (typeof command?.execute !== "function" || (typeof command.isRegistered === "function" && !command.isRegistered("Comfy.SaveWorkflow"))) {
		throw new Error(t("aaalice.pcp.error.workflowSaveUnavailable", "ComfyUI workflow save is unavailable."));
	}
	let failure = null;
	try {
		await command.execute("Comfy.SaveWorkflow", { errorHandler: (error) => { failure = error; } });
	} catch (error) {
		failure = error;
	}
	if (failure) throw failure;
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
		const body = el("div", "aaalice-modal-body");
		const dialogApi = createDialog({
			title: t("aaalice.pcp.image.title", "Choose image"),
			body,
			size: "sm",
			onRequestClose: () => { resolve(false); return true; },
		});
		const close = (value) => { resolve(value); dialogApi.close(value); };
		const filename = document.createElement("input");
		filename.type = "text";
		filename.value = parameter.value?.filename || "";
		const existing = button({ label: t("aaalice.pcp.image.useExisting", "Use input filename"), variant: "secondary" });
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
		body.append(field({ label: t("aaalice.pcp.image.existing", "Existing input image"), control: filename }), existing, field({ label: t("aaalice.pcp.image.upload", "Upload new image"), control: upload }));
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
	const resolveDescription = () => typeof description === "function" ? description() : description;
	trigger.tabIndex = 0;
	trigger.addEventListener("mouseenter", () => showTooltip(trigger, resolveDescription()));
	trigger.addEventListener("mouseleave", hideTooltip);
	trigger.addEventListener("focus", () => showTooltip(trigger, resolveDescription()));
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
	if (parameter.param_type === "seed") {
		const wrap = el("div", "aaalice-pcp-node-seed");
		const input = isolate(document.createElement("input"));
		input.type = "number";
		input.min = String(config.min ?? 0);
		input.max = String(config.max ?? Number.MAX_SAFE_INTEGER);
		input.value = String(parameter.value ?? 0);
		const modeLabel = () => parameter.config?.control_after_generate === "randomize"
			? t("aaalice.pcp.seedMode.unlocked", "Seed unlocked; click to lock")
			: t("aaalice.pcp.seedMode.locked", "Seed locked; click to unlock");
		const modeButton = isolate(iconButton({
			iconName: "lock",
			label: modeLabel(),
			variant: "ghost",
			className: "aaalice-pcp-seed-mode",
		}));
		modeButton.removeAttribute("title");
		const updateMode = () => {
			const locked = parameter.config?.control_after_generate !== "randomize";
			modeButton.replaceChildren(icon("lock"));
			modeButton.classList.toggle("is-locked", locked);
			modeButton.setAttribute("aria-label", modeLabel());
			modeButton.setAttribute("aria-pressed", String(locked));
		};
		modeButton.addEventListener("click", () => {
			parameter.config ||= {};
			parameter.config.control_after_generate = parameter.config.control_after_generate === "randomize" ? "fixed" : "randomize";
			updateMode();
			hideTooltip();
			persist();
		});
		attachDescription(modeButton, modeLabel);
		input.addEventListener("change", () => {
			const min = Number(input.min);
			const max = Number(input.max);
			const value = Number(input.value);
			parameter.value = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
			input.value = String(parameter.value);
			persist();
		});
		updateMode();
		wrap.append(input, modeButton);
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
		const selectWrap = el("div", "aaalice-pcp-select-wrap");
		const valid = (config.options || []).includes(parameter.value);
		if (!valid && parameter.value != null) {
			select.add(new Option(`${parameter.value} ⚠`, parameter.value, true, true));
			select.classList.add("invalid");
		}
		for (const option of config.options || []) select.add(new Option(option, option, false, option === parameter.value));
		const setSelectOpen = (open) => selectWrap.classList.toggle("is-open", open);
		select.addEventListener("pointerdown", () => setSelectOpen(!selectWrap.classList.contains("is-open")));
		select.addEventListener("keydown", (event) => {
			if (event.key === "Escape") setSelectOpen(false);
			else if (event.key === "Enter" || event.key === " " || (event.altKey && event.key === "ArrowDown")) setSelectOpen(!selectWrap.classList.contains("is-open"));
		});
		select.addEventListener("blur", () => setSelectOpen(false));
		select.addEventListener("change", () => { setSelectOpen(false); parameter.value = select.value; persist(); });
		selectWrap.append(select, icon("moveDown"));
		return selectWrap;
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
			const help = el("span", "aaalice-pcp-question");
			help.append(icon("note"));
			trigger.append(label, help);
			heading.append(trigger);
			attachDescription(trigger, parameter.description);
		}
		row.append(heading, valueControl(node, parameter));
		root.append(row);
	}
	if (!ensureParameters(node).length) root.append(el("div", "aaalice-pcp-empty", t("aaalice.pcp.empty", "No parameters. Use the node context menu to edit.")));
}

function nodeHeight(node) {
	return Math.max(66, 12 + ensureParameters(node).reduce((height, parameter) => {
		if (parameter.param_type === "separator") return height + 30;
		if (parameter.param_type === "string" && parameter.config?.multiline) return height + 96;
		return height + 66;
	}, 0));
}

function inspectorField(label, control) {
	return field({ label, control });
}

function renderInspector(editor, parameter, rerender) {
	const pane = editor.inspector;
	pane.replaceChildren();
	if (!parameter) {
		pane.append(emptyState({
			title: t("aaalice.pcp.editor.emptyTitle", "No parameter selected"),
			description: t("aaalice.pcp.editor.selectParameter", "Select a parameter to edit its settings."),
			iconName: "settings",
			className: "aaalice-editor-empty",
		}));
		return;
	}
	const description = document.createElement("textarea");
	description.rows = 5;
	description.value = parameter.description || "";
	description.addEventListener("input", () => { parameter.description = description.value; editor.dirty = true; editor.updateValidation?.(); });
	const generalBody = el("div", "aaalice-editor-field-stack");
	generalBody.append(inspectorField(t("aaalice.pcp.field.description", "Description (Markdown)"), description));
	pane.append(card({ title: t("aaalice.pcp.editor.general", "General"), meta: badge(parameter.param_type, { tone: "accent" }), body: generalBody, className: "aaalice-editor-group" }));
	if (["slider", "seed"].includes(parameter.param_type)) {
		const grid = el("div", "aaalice-pcp-grid2");
		for (const key of ["min", "max", ...(parameter.param_type === "slider" ? ["step"] : [])]) {
			const input = document.createElement("input");
			input.type = "number";
			input.value = String(parameter.config?.[key] ?? (key === "max" ? 100 : key === "step" ? 1 : 0));
			input.addEventListener("input", () => { parameter.config[key] = Number(input.value); editor.dirty = true; editor.updateValidation?.(); });
			grid.append(inspectorField(key, input));
		}
		const behaviorBody = el("div", "aaalice-editor-field-stack");
		behaviorBody.append(grid);
		if (parameter.param_type === "seed") {
			const behavior = selectInput(["fixed", "increment", "decrement", "randomize"], parameter.config?.control_after_generate || "randomize");
			behavior.addEventListener("change", () => { parameter.config.control_after_generate = behavior.value; editor.dirty = true; editor.updateValidation?.(); });
			behaviorBody.append(inspectorField(t("aaalice.pcp.field.seedBehavior", "After generate"), behavior));
		}
		pane.append(card({ title: t("aaalice.pcp.editor.valueRules", "Value rules"), body: behaviorBody, className: "aaalice-editor-group" }));
	}
	if (["dropdown", "enum"].includes(parameter.param_type)) {
		const source = selectInput(["custom", "sampler", "scheduler", "checkpoint", "lora", "controlnet", "upscale_model"], parameter.config?.source || "custom");
		const options = document.createElement("textarea");
		options.rows = 7;
		options.value = (parameter.config?.options || []).join("\n");
		const optionsField = inspectorField(t("aaalice.pcp.field.options", "Options (one per line)"), options);
		const syncOptionsField = () => { optionsField.hidden = source.value !== "custom"; };
		syncOptionsField();
		source.addEventListener("change", () => {
			if (source.value === "custom") delete parameter.config.source;
			else parameter.config.source = source.value;
			normalizeDynamicOptions([parameter]);
			options.value = (parameter.config.options || []).join("\n");
			syncOptionsField();
			editor.dirty = true;
			editor.updateValidation?.();
		});
		options.addEventListener("input", () => { parameter.config.options = options.value.split("\n").map((item) => item.trim()).filter(Boolean); editor.dirty = true; editor.updateValidation?.(); });
		const optionsBody = el("div", "aaalice-editor-field-stack");
		optionsBody.append(inspectorField(t("aaalice.pcp.field.source", "Source"), source), optionsField);
		pane.append(card({ title: t("aaalice.pcp.editor.optionsBehavior", "Options and behavior"), body: optionsBody, className: "aaalice-editor-group" }));
	}
	if (parameter.param_type === "string") {
		const multiline = document.createElement("input");
		multiline.type = "checkbox";
		multiline.checked = Boolean(parameter.config?.multiline);
		multiline.addEventListener("change", () => { parameter.config.multiline = multiline.checked; editor.dirty = true; editor.updateValidation?.(); });
		pane.append(card({ title: t("aaalice.pcp.editor.optionsBehavior", "Options and behavior"), body: inspectorField(t("aaalice.pcp.field.multiline", "Multiline"), multiline), className: "aaalice-editor-group" }));
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
		text.title = t("aaalice.pcp.editor.renameHint", "Double-click to rename");
		text.addEventListener("dblclick", (event) => {
			event.preventDefault();
			event.stopPropagation();
			const input = document.createElement("input");
			input.type = "text";
			input.className = "aaalice-editor-rename-input";
			input.value = displayName(parameter);
			let finished = false;
			const finish = (commit) => {
				if (finished) return;
				finished = true;
				const nextName = input.value.trim();
				if (commit && nextName && nextName !== displayName(parameter)) {
					setCustomName(parameter, nextName);
					editor.dirty = true;
				}
				rerender();
			};
			input.addEventListener("click", (inputEvent) => inputEvent.stopPropagation());
			input.addEventListener("dblclick", (inputEvent) => inputEvent.stopPropagation());
			input.addEventListener("keydown", (inputEvent) => {
				if (inputEvent.key === "Enter") finish(true);
				else if (inputEvent.key === "Escape") finish(false);
			});
			input.addEventListener("blur", () => finish(true));
			text.replaceChildren(input);
			input.focus();
			input.select();
		});
		const duplicate = iconButton({ iconName: "copy", label: t("aaalice.common.copy", "Copy"), variant: "ghost", className: "aaalice-editor-mini" });
		duplicate.addEventListener("click", () => {
			const copy = cloneData(parameter);
			copy.id = newParamId();
			setCustomName(copy, uniqueName(editor.parameters, `${displayName(parameter)} Copy`));
			editor.parameters.splice(editor.parameters.indexOf(parameter) + 1, 0, copy);
			editor.selectedId = copy.id;
			editor.dirty = true;
			rerender();
		});
		const remove = iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", className: "aaalice-editor-mini danger" });
		remove.addEventListener("click", () => {
			const index = editor.parameters.indexOf(parameter);
			editor.parameters.splice(index, 1);
			editor.selectedId = editor.parameters[Math.min(index, editor.parameters.length - 1)]?.id || null;
			editor.dirty = true;
			rerender();
		});
		row.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", parameter.id));
		row.addEventListener("click", (event) => {
			if (event.target.closest(".aaalice-editor-mini")) return;
			editor.selectedId = parameter.id;
			for (const candidate of editor.list.children) candidate.classList.toggle("selected", candidate.dataset.id === parameter.id);
			renderInspector(editor, parameter, rerender);
			editor.updateValidation?.();
		});
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
	const workspace = el("div", "aaalice-parameter-editor-workspace");
	const rail = el("aside", "aaalice-parameter-editor-rail");
	const addBar = el("div", "aaalice-editor-add");
	const type = selectInput(["slider", "seed", "switch", "string", "dropdown", "enum", "image", "taglist", "separator"], "slider");
	const add = button({ label: t("aaalice.pcp.editor.add", "Add parameter"), iconName: "add" });
	editor.list = el("div", "aaalice-editor-compact-list");
	addBar.append(type, add);
	rail.append(editor.list, addBar);
	editor.inspector = el("main", "aaalice-parameter-editor-inspector");
	workspace.append(rail, editor.inspector);
	const errors = el("div", { className: "aaalice-pcp-error", attrs: { role: "status", "aria-live": "polite" } });
	const footer = el("div", "aaalice-parameter-editor-footer");
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary" });
	const save = button({ label: t("aaalice.common.save", "Save") });
	footer.append(errors, cancel, save);
	let dialogApi;
	const requestDiscard = async () => !editor.dirty || confirmAction(t("aaalice.pcp.editor.discard", "Discard unsaved parameter changes?"));
	dialogApi = createDialog({
		title: t("aaalice.pcp.editor.title", "Edit parameters"),
		body: workspace,
		footer,
		size: "lg",
		className: "aaalice-parameter-editor",
		onRequestClose: requestDiscard,
	});
	editor.count = badge("", { tone: "neutral", className: "aaalice-editor-count" });
	const headerIntro = el("div", "aaalice-parameter-editor-heading");
	headerIntro.append(
		dialogApi.heading,
		el("p", null, t("aaalice.pcp.editor.subtitle", "Configure the panel structure and default values.")),
	);
	dialogApi.header.replaceChildren(headerIntro, editor.count);
	const rerender = (list = true) => {
		if (list) renderEditorList(editor, rerender);
		renderInspector(editor, editor.parameters.find((item) => item.id === editor.selectedId), rerender);
		editor.count.textContent = message("aaalice.pcp.editor.parameterCount", "{count} parameters", { count: editor.parameters.length });
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
	cancel.addEventListener("click", () => dialogApi.requestClose());
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
		notifyParameterChanged(node, { structure: true });
		markGraphChange(node, false);
		try {
			await saveActiveWorkflow();
		} catch (error) {
			toast("error", message("aaalice.pcp.error.workflowSaveFailed", "Parameters were applied, but workflow save failed: {reason}", { reason: error?.message || String(error) }));
		}
		dialogApi.close(true);
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
		return [{ content: t("aaalice.pcp.editor.menu", "⚙️ Edit Parameters…"), callback: () => openParameterEditor(node).catch((error) => toast("error", error.message || String(error))) }];
	},
	nodeCreated(node) { if (isParameterPanel(node)) setupParameterPanel(node, false); },
	loadedGraphNode(node) { if (isParameterPanel(node)) setupParameterPanel(node, true); },
	async setup() {
		installPromptHook();
		for (const node of app.graph?._nodes || []) if (isParameterPanel(node)) setupParameterPanel(node, true);
	},
});
