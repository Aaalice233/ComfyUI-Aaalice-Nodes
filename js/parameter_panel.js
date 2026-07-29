/** ParameterPanel DOM controls, right-click editor, prompt injection and queue behavior. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { closeImagePreview } from "./lib/image_preview.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import {
	cleanupDomWidgetResizePassthrough,
	growClassicDomWidgetNode,
	installDomWidgetResizePassthrough,
} from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { badge, button, createAnchoredPopover, createDialog, el, emptyState, field, icon, iconButton, isolate, toggleSwitch } from "./lib/ui.js";
import { attachDescriptionTooltip } from "./lib/description_tooltip.js";
import {
	parameterPanelKjMenuItem,
	parameterPanelReceiverMenuItems,
	registerParameterPanelKj,
} from "./parameter_panel_kj.js";
import { allGraphNodes, nodeExecutionIds } from "./lib/graph_scope.js";
import {
	EVENT_PARAMETER_CHANGED,
	MAX_TUNABLE,
	PARAMETER_TYPE_ORDER,
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
	refreshComfyOptions,
	setCustomName,
	tunableMeta,
	uniqueName,
	validateParametersDraft,
} from "./lib/param_model.js";
import {
	PARAMETER_NODE_LAYOUT,
	computeParameterLayout,
	drawParameterStaticLayer,
	syncNativeOutputLayout,
} from "./lib/parameter_layout.js";
import { reshapeParameterOutputsPreservingLinks } from "./lib/dynamic_slots.js";
import { createSharedControl, destroySharedControls } from "./lib/controls/registry.js";
import { parameterControlSpec } from "./lib/controls/specs.js";

const NODE = "ParameterPanel";
const MIN_WIDTH = PARAMETER_NODE_LAYOUT.minWidth;
const mountedParameterPanels = new Set();
let vueOutputObserver = null;
let vueOutputFrame = 0;

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

function confirmAction(text, { danger = false } = {}) {
	return new Promise((resolve) => {
		let settled = false;
		let dialog;
		const finish = (confirmed) => {
			if (settled) return;
			settled = true;
			dialog.close(confirmed);
			resolve(confirmed);
		};
		const body = el("div", {
			className: "aa-confirm-danger",
			children: [
				icon("statusWarning"),
				el("p", null, text),
			],
		});
		const footer = el("div", {
			children: [
				button({
					label: t("aaalice.common.cancel", "Cancel"),
					variant: "secondary",
					onClick: () => finish(false),
				}),
				button({
					label: t("aaalice.common.confirm", "Confirm"),
					iconName: danger ? "delete" : null,
					variant: danger ? "danger" : "primary",
					defaultAction: true,
					onClick: () => finish(true),
				}),
			],
		});
		dialog = createDialog({
			title: t("aaalice.common.confirm", "Confirm"),
			body,
			footer,
			size: "sm",
			className: danger ? "aa-danger-dialog" : "aa-confirm-dialog",
			onRequestClose: () => {
				finish(false);
				return false;
			},
		});
	});
}

function markGraphChange(node, before) {
	if (before) node.graph?.beforeChange?.();
	else {
		node.graph?.afterChange?.();
		node.graph?.setDirtyCanvas?.(true, true);
	}
}

function parameterTypeLabel(value) {
	return t(`aaalice.pcp.types.${value}`, value);
}

function optionSourceChoices() {
	return [
		{ value: "custom", label: t("aaalice.pcp.sources.custom", "Custom") },
		{ value: "sampler", label: t("aaalice.pcp.sources.sampler", "Sampler") },
		{ value: "scheduler", label: t("aaalice.pcp.sources.scheduler", "Scheduler") },
		{ value: "checkpoint", label: t("aaalice.pcp.sources.checkpoint", "Checkpoint") },
		{ value: "lora", label: t("aaalice.pcp.sources.lora", "LoRA") },
		{ value: "controlnet", label: t("aaalice.pcp.sources.controlnet", "ControlNet") },
		{ value: "upscale_model", label: t("aaalice.pcp.sources.upscaleModel", "Upscale model") },
		{ value: "prompt_expand_rule", label: t("aaalice.pcp.sources.promptExpandRule", "Prompt Assistant · Expand rule") },
		{ value: "prompt_llm_service", label: t("aaalice.pcp.sources.promptLlmService", "Prompt Assistant · LLM service") },
		{ value: "prompt_vision_rule", label: t("aaalice.pcp.sources.promptVisionRule", "Prompt Assistant · Vision rule") },
		{ value: "prompt_vlm_service", label: t("aaalice.pcp.sources.promptVlmService", "Prompt Assistant · VLM service") },
	];
}

function selectInput(options, value) {
	const select = document.createElement("select");
	for (const option of options) {
		const optionValue = typeof option === "string" ? option : option.value;
		const optionLabel = typeof option === "string" ? option : option.label;
		select.add(new Option(optionLabel, optionValue, false, optionValue === value));
	}
	return select;
}

function graphLink(node, linkId) {
	if (linkId == null || !node?.graph) return null;
	if (typeof node.graph.getLink === "function") return node.graph.getLink(linkId);
	if (typeof node.graph.links?.get === "function") return node.graph.links.get(linkId) || null;
	if (typeof node.graph._links?.get === "function") return node.graph._links.get(linkId) || null;
	return node.graph.links?.[linkId] || node.graph._links?.[linkId] || null;
}

function graphNode(node, nodeId) {
	if (typeof node?.graph?.getNodeById === "function") return node.graph.getNodeById(nodeId);
	if (typeof node?.graph?._nodes_by_id?.get === "function") return node.graph._nodes_by_id.get(nodeId) || null;
	return node?.graph?._nodes_by_id?.[nodeId] || null;
}

function storedSlotMeta(node) {
	return Array.isArray(node.properties?.slotMeta) ? node.properties.slotMeta : [];
}

function outputColor(names, fallback) {
	if (typeof document === "undefined") return fallback;
	const styles = getComputedStyle(document.documentElement);
	return names.map((name) => styles.getPropertyValue(name).trim()).find(Boolean) || fallback;
}

function parameterPanelMenuItems(node) {
	if (!isParameterPanel(node)) return [];
	const items = [{
		content: t("aaalice.pcp.editor.menu", "⚙️ Edit Parameters…"),
		callback: () => openParameterEditor(node).catch((error) => toast("error", error.message || String(error))),
	}];
	const kjItem = parameterPanelKjMenuItem(node);
	if (kjItem) items.push(kjItem);
	items.push(...parameterPanelReceiverMenuItems(node));
	return items;
}

function ensureParameterPanelMenu(node) {
	if (node._aaaliceParameterMenuPatched) return;
	node._aaaliceParameterMenuPatched = true;
	const previous = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (canvas, options = []) {
		const result = previous?.apply(this, arguments);
		const target = Array.isArray(result) ? result : options;
		if (Array.isArray(target)) {
			for (const item of parameterPanelMenuItems(this)) {
				if (!target.some((candidate) => candidate?.content === item.content)) target.push(item);
			}
		}
		return result;
	};
}

function markVueOutputs(node) {
	if (typeof document === "undefined") return;
	const id = String(node.id);
	for (const element of document.querySelectorAll("[data-node-id]")) {
		if (element.getAttribute("data-node-id") !== id) continue;
		const layout = node._aaaliceParameterLayout || computeParameterLayout(node);
		const rows = new Map(layout.rows.filter((row) => row.kind === "parameter").map((row) => [row.index, row]));
		const slots = [...element.querySelectorAll(".lg-slot--output")];
		if (!slots.length) continue;
		element.classList.add("aaalice-parameter-panel-node");
		element.style.setProperty("--aaalice-parameter-content-height", `${layout.height}px`);
		element.style.setProperty("--aaalice-output-column-width", `${layout.outputColumn.width}px`);
		element.style.setProperty("--aaalice-output-slot-height", `${PARAMETER_NODE_LAYOUT.outputSlotHeight}px`);
		const outputColumn = slots[0]?.parentElement;
		const slotLayer = outputColumn?.parentElement;
		const body = slotLayer?.parentElement;
		const widgets = body?.querySelector?.(".lg-node-widgets");
		outputColumn?.classList.add("aaalice-parameter-output-column");
		slotLayer?.classList.add("aaalice-parameter-slot-layer");
		body?.classList.add("aaalice-parameter-node-body");
		widgets?.classList.add("aaalice-parameter-widget-layer");
		for (let index = 0; index < slots.length; index += 1) {
			const slot = slots[index];
			const row = rows.get(index);
			slot.style.setProperty("--aaalice-output-top", `${Math.max(0, Number(row?.output?.top || 0) - PARAMETER_NODE_LAYOUT.outputSlotHeight / 2)}px`);
		}
	}
}

function ensureVueOutputObserver() {
	if (vueOutputObserver || typeof MutationObserver === "undefined" || !document.body) return;
	vueOutputObserver = new MutationObserver(() => {
		if (vueOutputFrame) return;
		vueOutputFrame = requestAnimationFrame(() => {
			vueOutputFrame = 0;
			for (const panel of mountedParameterPanels) if (panel?.graph) markVueOutputs(panel);
		});
	});
	vueOutputObserver.observe(document.body, { childList: true, subtree: true });
}

function syncPanelOutputs(node, nextMeta = tunableMeta(ensureParameters(node))) {
	const meta = nextMeta.slice(0, MAX_TUNABLE);
	const previous = storedSlotMeta(node);
	const shapeChanged = (node.outputs?.length || 0) !== meta.length;
	const orderChanged = previous.length !== meta.length || previous.some((item, index) => item?.id !== meta[index]?.id);
	const structureChanged = shapeChanged || orderChanged;
	const namesChanged = !structureChanged && previous.some((item, index) => item?.name !== meta[index]?.name);
	node.properties ||= {};
	node.properties.slotMeta = meta.map((item, order) => ({ id: item.id, name: item.name, order }));
	if (structureChanged) {
		node._aaaliceApplyingOutputMeta = true;
		try {
			reshapeParameterOutputsPreservingLinks(
				node,
				previous.length ? previous : meta,
				meta,
				(linkId) => graphLink(node, linkId),
				(nodeId) => graphNode(node, nodeId),
			);
		} finally {
			node._aaaliceApplyingOutputMeta = false;
		}
	}
	const muted = outputColor(["--descrip-text", "--p-text-muted-color"], globalThis.LiteGraph?.NODE_TEXT_COLOR || "#999");
	const accent = outputColor(["--p-primary-color", "--primary-color"], muted);
	for (let index = 0; index < (node.outputs?.length || 0); index += 1) {
		const output = node.outputs[index];
		if (!output) continue;
		output._aaaliceProtocolName ||= `output_${index + 1}`;
		output._aaaliceParamId = meta[index]?.id;
		output.name = output._aaaliceProtocolName;
		output.label = meta[index]?.name || "";
		output.localized_name = output.label;
		output.type = "*";
		output.shape = globalThis.LiteGraph?.CIRCLE_SHAPE ?? 1;
		// Unconnected sockets stay quiet like Quick Latent; native rendering uses
		// color_on after a real link is present, preserving the hit-test semantics.
		output.color_off = muted;
		output.color_on = accent;
		output.color = muted;
	}
	// ComfyUI 1.45 keeps outputs in a shallowReactive array: replacing the
	// array items is what invalidates NodeSlots.vue. Mutating label fields or
	// rebuilding LiteGraph's concrete slots alone does not trigger Vue.
	if (namesChanged && app.canvas?.vueNodesMode === true && Array.isArray(node.outputs)) {
		node.outputs = node.outputs.map((output) => Object.assign(
			Object.create(Object.getPrototypeOf(output)),
			output,
		));
		node._setConcreteSlots?.();
	}
	const layout = syncNativeOutputLayout(node, computeParameterLayout(node));
	node._aaaliceParameterLayout = layout;
	markVueOutputs(node);
	if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => markVueOutputs(node));
	setTimeout(() => markVueOutputs(node), 0);
	node.setDirtyCanvas?.(true, true);
}

function parameterLinkCount(node, parameterId) {
	const index = storedSlotMeta(node).findIndex((item) => item?.id === parameterId);
	return index < 0 ? 0 : (node.outputs?.[index]?.links?.length || 0);
}

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	closeImagePreview();
});

function valueControl(node, parameter, heading = null) {
	const persist = (detail = {}) => notifyParameterChanged(node, { structure: false, ...detail });
	const lockedLabel = t("aaalice.pcp.seedMode.locked", "Seed locked; click to unlock");
	const unlockedLabel = t("aaalice.pcp.seedMode.unlocked", "Seed unlocked; click to lock");
	const spec = parameterControlSpec(parameter, {
		label: displayName(parameter),
		labels: {
			seed: { locked: lockedLabel, unlocked: unlockedLabel },
			boolean: { enabled: t("aaalice.common.enabled", "Enabled"), disabled: t("aaalice.common.disabled", "Disabled") },
			taglist: {
				placeholder: t("aaalice.pcp.taglist.placeholder", "Enter tags and press Enter"), append: t("aaalice.pcp.taglist.append", "+ Add tag"),
				empty: t("aaalice.pcp.taglist.empty", "Press Enter to add tags"), input: t("aaalice.pcp.taglist.input", "Add tags"),
				enable: t("aaalice.pcp.taglist.enable", "Enable {tag}"), disable: t("aaalice.pcp.taglist.disable", "Disable {tag}"), remove: t("aaalice.pcp.taglist.remove", "Remove {tag}"),
			},
			image: { none: t("aaalice.pcp.image.none", "Choose image"), drop: t("aaalice.pcp.image.drop", "Drop image here"), clear: t("aaalice.pcp.image.clear", "Clear selected image") },
		},
		});
	let gestureOpen = false;
	const graphCommit = (callback, detail = {}) => {
		node.graph?.beforeChange?.();
		try { callback(); persist(detail); }
		finally { node.graph?.afterChange?.(); node.graph?.setDirtyCanvas?.(true, true); }
	};
	const view = createSharedControl(spec, {
		preview(next) { if (spec.kind === "numeric") { parameter.value = next; node.setDirtyCanvas?.(true, true); } },
		commit(next, detail = {}) { graphCommit(() => { parameter.value = next; }, detail.redraw === false ? { redraw: false } : {}); },
		beginGesture() { if (!gestureOpen) { gestureOpen = true; node.graph?.beforeChange?.(); } },
		endGesture(next) {
			if (!gestureOpen) return; gestureOpen = false; parameter.value = next; persist({ redraw: false });
			node.graph?.afterChange?.(); node.graph?.setDirtyCanvas?.(true, true);
		},
		setSeedLocked(locked) {
			graphCommit(() => { parameter.config ||= {}; parameter.config.control_after_generate = locked ? "fixed" : "randomize"; });
			descriptionTooltip.hide();
		},
		onSuccess(reference) { toast("success", message("aaalice.pcp.image.uploaded", "Image uploaded: {filename}", { filename: reference.filename })); },
		onError(error) {
			if (error?.code === "file-type") toast("error", t("aaalice.pcp.error.imageFileType", "Choose an image file."));
			else if (error?.code === "response") toast("error", t("aaalice.pcp.error.imageUploadResponse", "The server response did not include an image filename."));
			else toast("error", message("aaalice.pcp.error.imageUpload", "Image upload failed: {reason}", { reason: error?.message || String(error) }));
		},
	});
	isolate(view.root); for (const accessory of view.headerAccessories) isolate(accessory);
	if (spec.kind === "numeric" && heading) {
		view.headerAccessories[0]?.classList.add("aa-control-numeric-value--heading"); heading.append(...view.headerAccessories);
	} else if (spec.kind === "seed") {
		view.root.classList.add("aa-control-seed-inline"); view.root.append(...view.headerAccessories);
		const modeButton = view.headerAccessories[1]; modeButton?.removeAttribute("title"); if (modeButton) attachDescriptionTooltip(modeButton, modeButton.currentLabel);
	}
	return view.root;
}

function destroyRenderedControls(root) {
	destroySharedControls(root);
}

function renderNode(node, root) {
	closeImagePreview();
	destroyRenderedControls(root);
	root.replaceChildren();
	const parameters = ensureParameters(node);
	const layout = computeParameterLayout(node);
	root.classList.toggle("aaalice-pcp-canvas-static", app.canvas?.vueNodesMode !== true);
	root.style.setProperty("--aaalice-output-column-width", `${layout.outputColumn.width}px`);
	root.style.setProperty("--aaalice-node-content-height", `${layout.height}px`);
	for (const parameter of parameters) {
		if (parameter.param_type === "separator") {
			const label = displayName(parameter);
			const section = el("div", { className: "aaalice-pcp-node-section", attrs: { role: "separator", "aria-label": label }, children: [el("span", "aaalice-pcp-node-section-label", label)] });
			section.dataset.parameterId = parameter.id;
			root.append(section);
			continue;
		}
		const row = el("div", "aaalice-pcp-node-row");
		row.dataset.parameterId = parameter.id;
		const geometry = layout.rows.find((candidate) => candidate.id === parameter.id);
		if (geometry) row.style.minHeight = `${geometry.height}px`;
		const heading = el("div", "aaalice-pcp-node-row-heading");
		const label = el("span", "aaalice-pcp-node-name", displayName(parameter));
		if (parameter.description) {
			const trigger = el("span", "aaalice-pcp-description-trigger");
			const help = el("span", "aaalice-pcp-question");
			help.append(icon("note"));
			trigger.append(label, help);
			heading.append(trigger);
			attachDescriptionTooltip(trigger, parameter.description);
		} else heading.append(label);
		row.append(heading, valueControl(node, parameter, heading));
		root.append(row);
	}
	if (!parameters.length) root.append(el("div", "aaalice-pcp-empty", t("aaalice.pcp.empty", "No parameters. Use the node context menu to edit.")));
}

function syncParameterResizeLayout(node, root) {
	const layout = syncNativeOutputLayout(node, computeParameterLayout(node));
	root.style.setProperty("--aaalice-output-column-width", `${layout.outputColumn.width}px`);
	root.style.setProperty("--aaalice-node-content-height", `${layout.height}px`);
	markVueOutputs(node);
	node.setDirtyCanvas?.(true, true);
}

function nodeHeight(node) {
	return Math.max(66, computeParameterLayout(node).height);
}

function panelNodeSize(node) {
	const widgetStart = Number(node?.constructor?.slot_start_y) || 4;
	return Math.max(72, widgetStart + nodeHeight(node) + 12);
}

function inspectorField(label, control) {
	return field({ label, control });
}

function inspectorSection(title, body, className = "") {
	const section = el("section", {
		className: `aaalice-editor-section${className ? ` ${className}` : ""}`,
		attrs: { "aria-label": title },
	});
	section.append(body);
	return section;
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
	const inspectorGrid = el("div", "aaalice-editor-inspector-grid");
	pane.append(inspectorGrid);
	const description = document.createElement("textarea");
	description.className = "aaalice-editor-description";
	description.placeholder = t("aaalice.pcp.field.descriptionPlaceholder", "Markdown supported");
	description.rows = 4;
	description.value = parameter.description || "";
	description.addEventListener("input", () => { parameter.description = description.value; editor.dirty = true; editor.updateValidation?.(); });
	const generalBody = el("div", "aaalice-editor-field-stack");
	const descriptionField = inspectorField(t("aaalice.pcp.field.description", "Parameter description"), description);
	descriptionField.classList.add("aaalice-editor-description-field");
	generalBody.append(descriptionField);
	if (parameter.param_type !== "separator") {
		generalBody.append(el("p", "aaalice-editor-value-hint", t("aaalice.pcp.editor.valueHint", "Set the parameter value on the node after saving.")));
	}
	inspectorGrid.append(inspectorSection(t("aaalice.pcp.editor.general", "General"), generalBody, "aaalice-editor-section--description"));
	if (["slider", "seed"].includes(parameter.param_type)) {
		const ruleKeys = ["min", "max", ...(parameter.param_type === "slider" ? ["step"] : [])];
		const ruleLabels = {
			min: t("aaalice.pcp.field.minimum", "Minimum"),
			max: t("aaalice.pcp.field.maximum", "Maximum"),
			step: t("aaalice.pcp.field.step", "Step"),
		};
		const grid = el("div", `aaalice-editor-rules-grid aaalice-editor-rules-grid--${ruleKeys.length}`);
		for (const key of ruleKeys) {
			const input = document.createElement("input");
			input.type = "number";
			input.className = "aaalice-editor-number-input";
			input.value = String(parameter.config?.[key] ?? (key === "max" ? 100 : key === "step" ? 1 : 0));
			input.addEventListener("input", () => { parameter.config[key] = Number(input.value); editor.dirty = true; editor.updateValidation?.(); });
			grid.append(inspectorField(ruleLabels[key], input));
		}
		const behaviorBody = el("div", "aaalice-editor-field-stack aaalice-editor-rules-body");
		behaviorBody.append(grid);
		if (parameter.param_type === "seed") {
			const behavior = selectInput([
				{ value: "fixed", label: t("aaalice.pcp.seedBehavior.fixed", "Keep fixed") },
				{ value: "increment", label: t("aaalice.pcp.seedBehavior.increment", "Increment") },
				{ value: "decrement", label: t("aaalice.pcp.seedBehavior.decrement", "Decrement") },
				{ value: "randomize", label: t("aaalice.pcp.seedBehavior.randomize", "Randomize") },
			], parameter.config?.control_after_generate || "randomize");
			behavior.addEventListener("change", () => { parameter.config.control_after_generate = behavior.value; editor.dirty = true; editor.updateValidation?.(); });
			behaviorBody.append(inspectorField(t("aaalice.pcp.field.seedBehavior", "After generate"), behavior));
		}
		inspectorGrid.append(inspectorSection(t("aaalice.pcp.editor.valueRules", "Value rules"), behaviorBody));
	}
	if (["dropdown", "enum"].includes(parameter.param_type)) {
		const source = selectInput(optionSourceChoices(), parameter.config?.source || "custom");
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
		inspectorGrid.append(inspectorSection(t("aaalice.pcp.editor.optionsBehavior", "Options and behavior"), optionsBody));
	}
	if (parameter.param_type === "string") {
		const multilineLabel = t("aaalice.pcp.field.multiline", "Multiline");
		const multiline = toggleSwitch({
			checked: Boolean(parameter.config?.multiline),
			label: multilineLabel,
			onChange: (checked) => {
				parameter.config.multiline = checked;
				editor.dirty = true;
				editor.updateValidation?.();
			},
		});
		const multilineField = el("div", {
			className: "aaalice-editor-toggle-field",
			children: [el("span", "aa-ui-field__label", multilineLabel), multiline],
		});
		inspectorGrid.append(inspectorSection(t("aaalice.pcp.editor.optionsBehavior", "Options and behavior"), multilineField, "aaalice-editor-section--compact"));
	}
}

function renderEditorList(editor, rerender) {
	editor.list.replaceChildren();
	for (const parameter of editor.parameters) {
		const row = el("div", `aaalice-editor-list-row${editor.selectedId === parameter.id ? " selected" : ""}`);
		row.draggable = true;
		row.dataset.id = parameter.id;
		row.dataset.parameterType = parameter.param_type;
		const handle = el("span", "aaalice-editor-drag", "⋮⋮");
		const text = el("button", "aaalice-editor-list-select");
		text.type = "button";
		text.append(el("strong", null, displayName(parameter)), el("small", null, parameterTypeLabel(parameter.param_type)));
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
				if (inputEvent.key === "Enter") {
					inputEvent.preventDefault();
					inputEvent.stopPropagation();
					finish(true);
				} else if (inputEvent.key === "Escape") {
					inputEvent.preventDefault();
					inputEvent.stopPropagation();
					finish(false);
				}
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

function appendEditorParameter(editor, paramType, rerender) {
	if (paramType !== "separator" && countTunable(editor.parameters) >= MAX_TUNABLE) {
		toast("warn", message("aaalice.pcp.error.maxParameters", "At most {count} tunable parameters.", { count: MAX_TUNABLE }));
		return false;
	}
	const parameter = createParameter(paramType, {
		name: uniqueName(editor.parameters, paramType === "separator" ? "Section" : paramType),
		name_custom: true,
	});
	editor.parameters.push(parameter);
	editor.selectedId = parameter.id;
	editor.dirty = true;
	rerender();
	return true;
}

async function openParameterEditor(node) {
	const original = ensureParameters(node);
	const editor = { parameters: cloneData(original), selectedId: original[0]?.id || null, dirty: false, list: null, inspector: null };
	const workspace = el("div", "aaalice-parameter-editor-workspace");
	const rail = el("aside", "aaalice-parameter-editor-rail");
	editor.list = el("div", "aaalice-editor-compact-list");
	rail.append(editor.list);
	editor.inspector = el("main", "aaalice-parameter-editor-inspector");
	workspace.append(rail, editor.inspector);
	const errors = el("div", { className: "aaalice-pcp-error", attrs: { role: "status", "aria-live": "polite" } });
	editor.status = el("span", "aaalice-editor-save-status");
	const footerFeedback = el("div", "aaalice-editor-footer-feedback");
	footerFeedback.append(editor.status, errors);
	const footer = el("div", "aaalice-parameter-editor-footer");
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary" });
	const save = button({ label: t("aaalice.common.save", "Save") });
	footer.append(footerFeedback, cancel, save);
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
	editor.count = badge("", { className: "aaalice-editor-count" });
	const add = button({ label: t("aaalice.pcp.editor.add", "Add parameter"), iconName: "add", variant: "primary", className: "aaalice-editor-header-add" });
	add.setAttribute("aria-haspopup", "menu");
	add.setAttribute("aria-expanded", "false");
	const headerLead = el("div", "aaalice-editor-header-lead");
	headerLead.append(
		dialogApi.heading,
		el("span", "aaalice-editor-header-hint", t("aaalice.pcp.editor.reorderHint", "Drag to reorder · Double-click to rename")),
	);
	const headerActions = el("div", "aaalice-editor-header-actions");
	headerActions.append(editor.count, add);
	dialogApi.header.replaceChildren(headerLead, headerActions);
	let typePopover = null;
	const rerender = (list = true) => {
		if (list) renderEditorList(editor, rerender);
		renderInspector(editor, editor.parameters.find((item) => item.id === editor.selectedId), rerender);
		editor.count.textContent = message("aaalice.pcp.editor.parameterCount", "{count} parameters", { count: editor.parameters.length });
		editor.updateValidation();
	};
	editor.updateValidation = () => {
		const validation = validateParametersDraft(editor.parameters);
		errors.textContent = validation.join(" · ");
		errors.hidden = !validation.length;
		editor.status.textContent = editor.dirty
			? t("aaalice.pcp.editor.unsaved", "Unsaved changes")
			: t("aaalice.pcp.editor.noChanges", "No pending changes");
		editor.status.classList.toggle("is-dirty", editor.dirty);
		save.disabled = Boolean(validation.length);
	};
	add.addEventListener("click", () => {
		if (typePopover) { typePopover.close(); return; }
		typePopover = createAnchoredPopover({
			anchor: add,
			ariaLabel: t("aaalice.pcp.editor.parameterType", "Parameter type"),
			className: "aaalice-parameter-type-popover",
			width: 288,
			onClose: () => { typePopover = null; add.setAttribute("aria-expanded", "false"); },
		});
		add.setAttribute("aria-expanded", "true");
		const menuHeader = el("header", "aaalice-parameter-type-menu-header");
		menuHeader.append(
			el("strong", null, t("aaalice.pcp.editor.parameterType", "Parameter type")),
			el("span", null, t("aaalice.pcp.editor.chooseTypeHint", "Choose a type to create it immediately.")),
		);
		const menu = el("div", { className: "aaalice-parameter-type-menu", attrs: { role: "menu" } });
		const atLimit = countTunable(editor.parameters) >= MAX_TUNABLE;
		for (const paramType of PARAMETER_TYPE_ORDER) {
			const option = button({
				label: parameterTypeLabel(paramType),
				variant: "ghost",
				size: "sm",
				className: "aaalice-parameter-type-option",
				disabled: atLimit && paramType !== "separator",
				onClick: () => {
					typePopover?.close();
					appendEditorParameter(editor, paramType, rerender);
				},
			});
			option.dataset.parameterType = paramType;
			option.setAttribute("role", "menuitem");
			menu.append(option);
		}
		menu.addEventListener("keydown", (event) => {
			if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
			event.preventDefault();
			const options = [...menu.querySelectorAll("button:not(:disabled)")];
			const current = options.indexOf(document.activeElement);
			const next = event.key === "Home"
				? 0
				: event.key === "End"
					? options.length - 1
					: (Math.max(0, current) + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
			options[next]?.focus();
		});
		typePopover.root.append(menuHeader, menu);
		typePopover.reposition();
	});
	cancel.addEventListener("click", () => { typePopover?.close(); dialogApi.requestClose(); });
	save.addEventListener("click", async () => {
		const validation = validateParametersDraft(editor.parameters);
		if (validation.length) return;
		const liveIds = new Set(editor.parameters.map((item) => item.id));
		const affected = original.filter((item) => !liveIds.has(item.id)).map((item) => ({ name: displayName(item), links: parameterLinkCount(node, item.id) })).filter((item) => item.links);
		if (affected.length) {
			const detail = affected.map((item) => `${item.name}: ${item.links}`).join("\n");
			if (!(await confirmAction(`${t("aaalice.pcp.confirm.parameterLinks", "Downstream links will be disconnected.")}\n${detail}`, { danger: true }))) return;
		}
		markGraphChange(node, true);
		node.properties.parameters = editor.parameters;
		notifyParameterChanged(node, { structure: true });
		markGraphChange(node, false);
		toast("warn", t("aaalice.pcp.editor.saveWorkflowReminder", "Save the workflow to keep these parameter changes; otherwise they will be lost."));
		typePopover?.close();
		dialogApi.close(true);
	});
	rerender();
}

function setupParameterPanel(node, loaded = false) {
	if (!isParameterPanel(node)) return;
	ensureVueOutputObserver();
	registerParameterPanelKj(node);
	ensureParameterPanelMenu(node);
	mountedParameterPanels.add(node);
	if (node._aaaliceParameterPanelMounted) {
		node._aaaliceParameterAccent?.sync();
		syncPanelOutputs(node, tunableMeta(ensureParameters(node)));
		return;
	}
	node._aaaliceParameterPanelMounted = true;
	ensureParameters(node);
	normalizeDynamicOptions(node.properties.parameters);
	syncPanelOutputs(node, tunableMeta(ensureParameters(node)));
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] ParameterPanel requires addDOMWidget");
	// The controls and native outputs intentionally share the same vertical
	// region. Tell LiteGraph before adding the widget so its own measurement
	// takes max(slot height, widget height) instead of stacking both heights.
	node.widgets_up = true;
	node.widgets_start_y = Number(node.constructor?.slot_start_y) || 4;
	const root = el("div", "aaalice-pcp aaalice-pcp-node-root aaalice-pcp-node-hybrid");
	node._aaaliceParameterAccent = bindNodeAccent(node, root);
	const height = () => nodeHeight(node);
		const widget = addLifecycleDOMWidget(node, "aaalice_parameter_panel", "custom", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 0,
		getMinHeight: height,
		getValue: () => "",
		setValue: () => {},
	});
	installDomWidgetResizePassthrough(node, root);
	if (!node._aaaliceOutputPresentationPatched) {
		node._aaaliceOutputPresentationPatched = true;
		node.computeSize = function () {
			return [MIN_WIDTH, panelNodeSize(this)];
		};
		const previousResize = node.onResize;
		node.onResize = function () {
			const result = previousResize?.apply(this, arguments);
			syncParameterResizeLayout(this, root);
			return result;
		};
		const previousSetConcreteSlots = node._setConcreteSlots;
		if (typeof previousSetConcreteSlots === "function") {
			node._setConcreteSlots = function () {
				const value = previousSetConcreteSlots.apply(this, arguments);
				if (this._aaaliceParameterLayout) syncNativeOutputLayout(this, this._aaaliceParameterLayout);
				return value;
			};
		}
		const previousDrawForeground = node.onDrawForeground;
		node.onDrawForeground = function (ctx) {
			previousDrawForeground?.apply(this, arguments);
			drawParameterStaticLayer(ctx, this);
		};
	}
	node._aaaliceParameterRedraw = () => {
		node._aaaliceParameterAccent?.sync();
		renderNode(node, root);
		const desired = height();
		root.style.minHeight = `${desired}px`;
		widget.y = Number(node.constructor?.slot_start_y) || 4;
		syncPanelOutputs(node, tunableMeta(ensureParameters(node)));
		growClassicDomWidgetNode(node);
		node.setDirtyCanvas?.(true, true);
	};
	const onChange = (event) => {
		if (event.detail?.node && event.detail.node !== node) return;
		if (!event.detail?.node && event.detail?.nodeId != null && String(event.detail.nodeId) !== String(node.id)) return;
		if (event.detail?.redraw === false) return;
		node._aaaliceParameterRedraw?.();
	};
	window.addEventListener(EVENT_PARAMETER_CHANGED, onChange);
	const previousConnections = node.onConnectionsChange;
	node.onConnectionsChange = function () {
		const value = previousConnections?.apply(this, arguments);
		if (!this._aaaliceApplyingOutputMeta) setTimeout(() => {
			syncPanelOutputs(this, tunableMeta(ensureParameters(this)));
			this._aaaliceParameterRedraw?.();
		}, 0);
		return value;
	};
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		mountedParameterPanels.delete(this);
		this._aaaliceParameterAccent?.dispose();
		this._aaaliceParameterAccent = null;
		cleanupDomWidgetResizePassthrough(this);
		destroyRenderedControls(root);
		window.dispatchEvent(new CustomEvent(EVENT_PARAMETER_CHANGED, { detail: { nodeId: this.id, node: this, removed: true } }));
		window.removeEventListener(EVENT_PARAMETER_CHANGED, onChange);
		return previousRemoved?.apply(this, arguments);
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () {
		const value = previousConfigure?.apply(this, arguments);
		ensureParameters(this);
		this._aaaliceParameterAccent?.sync();
		setTimeout(() => {
			syncPanelOutputs(this, tunableMeta(ensureParameters(this)));
			this._aaaliceParameterRedraw?.();
		}, 0);
		return value;
	};
	if (!loaded) node.setSize?.(node.computeSize());
	node._aaaliceParameterRedraw();
}

function installPromptHook() {
	if (app._aaaliceParameterPanelPromptHook) return;
	app._aaaliceParameterPanelPromptHook = true;
	const original = app.graphToPrompt?.bind(app);
	if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable");
	app.graphToPrompt = async function (...args) {
		const nodes = allGraphNodes(app.graph).filter(isParameterPanel);
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of nodes) {
			normalizeDynamicOptions(ensureParameters(node));
			for (const executionId of nodeExecutionIds(node)) {
				const promptNode = output?.[executionId];
				if (!promptNode) continue;
				promptNode.inputs ||= {};
				promptNode.inputs.parameters_json = JSON.stringify(materializeParameters(ensureParameters(node)));
				promptNode.inputs.validate_dynamic_values = Boolean(node.outputs?.some((output) => output?.links?.length));
			}
		}
		return result;
	};
	const queue = app.queuePrompt?.bind(app);
	if (queue) app.queuePrompt = async function (...args) {
		const result = await queue(...args);
		for (const node of allGraphNodes(app.graph).filter(isParameterPanel)) applySeedAfterQueue(node);
		return result;
	};
}

async function loadComfyNodeDefs() {
	const response = await api.fetchApi("/object_info");
	if (!response?.ok) throw new Error(`object_info request failed (${response?.status || "unknown"})`);
	return response.json();
}

function refreshMountedDynamicOptions() {
	for (const node of mountedParameterPanels) {
		if (!isParameterPanel(node)) continue;
		normalizeDynamicOptions(ensureParameters(node));
		node._aaaliceParameterRedraw?.();
	}
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
		try {
			refreshComfyOptions(await loadComfyNodeDefs());
			refreshMountedDynamicOptions();
		}
		catch (error) { console.warn("[Aaalice] Failed to load dynamic parameter options", error); }
		await ensureI18nReady();
	},
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) {
		if (!isParameterPanel(node)) return;
		setupParameterPanel(node, false);
	},
	loadedGraphNode(node) { if (isParameterPanel(node)) setupParameterPanel(node, true); },
	async setup() {
		installPromptHook();
		for (const node of allGraphNodes(app.graph)) if (isParameterPanel(node)) setupParameterPanel(node, true);
	},
});
