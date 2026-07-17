/** ParameterPanel DOM controls, right-click editor, prompt injection and queue behavior. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { closeImagePreview } from "./lib/image_preview.js";
import { createImageUploadControl } from "./lib/image_upload.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import {
	cleanupDomWidgetResizePassthrough,
	growClassicDomWidgetNode,
	installDomWidgetResizePassthrough,
} from "./lib/dom_widget_resize.js";
import { badge, button, createDialog, createTooltip, el, emptyState, field, icon, iconButton, isolate } from "./lib/ui.js";
import {
	parameterPanelKjMenuItem,
	registerParameterPanelKj,
} from "./parameter_panel_kj.js";
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
import { createNumericEditor, createParameterControl, createSeedModeControl } from "./lib/parameter_controls.js";

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

function parameterTypeLabel(value) {
	return t(`aaalice.pcp.types.${value}`, value);
}

function parameterTypeOptions() {
	return ["slider", "seed", "switch", "string", "dropdown", "enum", "image", "taglist", "separator"]
		.map((value) => ({ value, label: parameterTypeLabel(value) }));
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

const descriptionTooltip = createTooltip();

function attachDescription(trigger, description) {
	const resolveDescription = () => typeof description === "function" ? description() : description;
	trigger.tabIndex = 0;
	const showOrKeep = (immediate) => {
		if (descriptionTooltip.isOpenFor(trigger)) {
			descriptionTooltip.cancelScheduledHide();
			return;
		}
		descriptionTooltip.show(trigger, resolveDescription, {
			className: "aaalice-parameter-tooltip",
			contentMode: "markdown",
			immediate,
			interactive: true,
		});
	};
	trigger.addEventListener("mouseenter", () => showOrKeep(false));
	trigger.addEventListener("mouseleave", descriptionTooltip.scheduleHide);
	trigger.addEventListener("focus", () => showOrKeep(true));
	trigger.addEventListener("blur", descriptionTooltip.scheduleHide);
	trigger.addEventListener("keydown", (event) => {
		if (event.key !== "Tab" || event.shiftKey || !descriptionTooltip.isOpenFor(trigger)) return;
		if (descriptionTooltip.focusFirstInteractive()) event.preventDefault();
	});
}

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	closeImagePreview();
});

function openInlineNumberInput(anchor, value, min, max, step, onCommit) {
	createNumericEditor(anchor, { value, min, max, step, onCommit });
}

function numericDisplay(label, parameter, config, onCommit) {
	const value = isolate(el("button", "aaalice-pcp-value-display", String(parameter.value ?? 0)));
	value.type = "button";
	value.dataset.parameterId = String(parameter.id || "");
	value.dataset.aaaliceValueField = "true";
	value.setAttribute("aria-label", `${displayName(parameter)}: ${t("aaalice.pcp.inline.editValue", "Edit value")}`);
	value.addEventListener("click", () => openInlineNumberInput(
		value,
		parameter.value,
		Number(config.min ?? 0),
		Number(config.max ?? Number.MAX_SAFE_INTEGER),
		Number(config.step ?? 1),
		onCommit,
	));
	return value;
}

function valueControl(node, parameter, heading = null) {
	const config = parameter.config || {};
	const persist = (detail = {}) => notifyParameterChanged(node, { structure: false, ...detail });
	if (parameter.param_type === "slider") {
		const wrap = el("div", "aaalice-pcp-node-slider");
		const range = isolate(document.createElement("input"));
		range.type = "range";
		range.classList.add("aa-shared-range");
		range.min = String(config.min ?? 0);
		range.max = String(config.max ?? 100);
		range.step = String(config.step ?? 1);
		range.value = String(parameter.value ?? 0);
		range.setAttribute("aria-label", displayName(parameter));
		const display = numericDisplay("", parameter, config, (value) => {
			parameter.value = value;
			range.value = String(value);
			updateProgress();
			persist();
		});
		display.classList.add("aaalice-pcp-slider-value");
		const updateProgress = () => {
			const min = Number(range.min);
			const max = Number(range.max);
			const progress = max > min ? Math.min(100, Math.max(0, ((Number(range.value) - min) / (max - min)) * 100)) : 0;
			range.style.setProperty("--aa-shared-range-progress", `${progress}%`);
			display.textContent = String(parameter.value ?? range.value);
		};
		range.addEventListener("input", () => {
			parameter.value = Number(range.value);
			updateProgress();
		});
		range.addEventListener("change", persist);
		updateProgress();
		if (heading) heading.append(display);
		else wrap.append(display);
		wrap.append(range);
		return wrap;
	}
	if (parameter.param_type === "seed") {
		const wrap = el("div", "aaalice-pcp-node-seed");
		const display = numericDisplay("", parameter, config, (value) => { parameter.value = value; persist(); });
		const lockedLabel = t("aaalice.pcp.seedMode.locked", "Seed locked; click to unlock");
		const unlockedLabel = t("aaalice.pcp.seedMode.unlocked", "Seed unlocked; click to lock");
		const modeButton = isolate(createSeedModeControl({ locked: parameter.config?.control_after_generate !== "randomize", lockedLabel, unlockedLabel, ariaLabelPrefix: displayName(parameter), className: "aaalice-pcp-seed-mode", onChange: (locked) => {
			parameter.config ||= {}; parameter.config.control_after_generate = locked ? "fixed" : "randomize";
			wrap.classList.toggle("is-locked", locked); descriptionTooltip.hide(); persist();
		} }));
		modeButton.removeAttribute("title");
		attachDescription(modeButton, modeButton.currentLabel);
		wrap.classList.toggle("is-locked", modeButton.isLocked());
		wrap.append(display, modeButton);
		return wrap;
	}
	if (parameter.param_type === "switch") {
		const switchButton = isolate(el("button", `aaalice-pcp-node-switch${parameter.value ? " active" : ""}`));
		switchButton.type = "button";
		switchButton.setAttribute("aria-label", displayName(parameter));
		switchButton.setAttribute("aria-pressed", String(Boolean(parameter.value)));
		switchButton.append(
			el("span", { className: "aaalice-pcp-switch-track", children: [el("span", "aaalice-pcp-switch-thumb")] }),
			el("span", "aaalice-pcp-switch-label", parameter.value ? t("aaalice.common.enabled", "Enabled") : t("aaalice.common.disabled", "Disabled")),
		);
		switchButton.addEventListener("click", () => {
			parameter.value = !parameter.value;
			switchButton.classList.toggle("active", parameter.value);
			switchButton.setAttribute("aria-pressed", String(Boolean(parameter.value)));
			switchButton.querySelector(".aaalice-pcp-switch-label").textContent = parameter.value ? t("aaalice.common.enabled", "Enabled") : t("aaalice.common.disabled", "Disabled");
			persist();
		});
		return switchButton;
	}
	if (["dropdown", "enum"].includes(parameter.param_type)) {
		const options = (config.options || []).map(String);
		if (options.length > 0 && options.length <= 4) {
			const segmented = el("div", { className: "aaalice-pcp-segmented", attrs: { role: "radiogroup", "aria-label": parameter.name || parameter.id } });
			const indicator = el("span", { className: "aaalice-pcp-segment-indicator", attrs: { "aria-hidden": "true" } });
			const choices = [];
			const positionIndicator = (choice, animate = true) => {
				if (!choice?.isConnected) return;
				indicator.classList.toggle("is-initializing", !animate);
				indicator.style.width = `${choice.offsetWidth}px`;
				indicator.style.height = `${choice.offsetHeight}px`;
				indicator.style.transform = `translate3d(${choice.offsetLeft}px, ${choice.offsetTop}px, 0)`;
				indicator.classList.add("is-ready");
				if (!animate) requestAnimationFrame(() => indicator.classList.remove("is-initializing"));
			};
			segmented.append(indicator);
			for (const option of options) {
				const choice = isolate(el("button", `aaalice-pcp-segment${option === parameter.value ? " active" : ""}`, option));
				choice.type = "button";
				choice.setAttribute("role", "radio");
				choice.setAttribute("aria-checked", String(option === parameter.value));
				choice.addEventListener("click", () => {
					parameter.value = option;
					for (const candidate of choices) {
						candidate.classList.toggle("active", candidate === choice);
						candidate.setAttribute("aria-checked", String(candidate === choice));
					}
					positionIndicator(choice);
					// The segmented control already reflects the new value. Rebuilding the
					// panel here would replace the indicator before its transition can run.
					persist({ redraw: false });
				});
				choices.push(choice);
				segmented.append(choice);
			}
			requestAnimationFrame(() => positionIndicator(choices.find((choice) => choice.classList.contains("active")), false));
			if (typeof ResizeObserver === "function") {
				const observer = new ResizeObserver(() => positionIndicator(choices.find((choice) => choice.classList.contains("active")), false));
				observer.observe(segmented);
				segmented._aaaliceResizeObserver = observer;
			}
			return segmented;
		}
		const select = isolate(document.createElement("select"));
		select.setAttribute("aria-label", displayName(parameter));
		const selectWrap = el("div", "aaalice-pcp-select-wrap");
		const valid = options.includes(String(parameter.value));
		if (!valid && parameter.value != null) {
			select.add(new Option(`${parameter.value} ⚠`, parameter.value, true, true));
			select.classList.add("invalid");
		}
		for (const option of options) select.add(new Option(option, option, false, option === String(parameter.value)));
		const setSelectOpen = (open) => selectWrap.classList.toggle("is-open", open);
		let pointerToggled = false;
		select.addEventListener("pointerdown", () => {
			pointerToggled = true;
			setSelectOpen(!selectWrap.classList.contains("is-open"));
			setTimeout(() => { pointerToggled = false; }, 0);
		});
		select.addEventListener("focus", () => { if (!pointerToggled) setSelectOpen(true); });
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
		return isolate(createImageUploadControl({
			reference: parameter.value,
			label: displayName(parameter),
			emptyLabel: t("aaalice.pcp.image.none", "Choose image"),
			dropLabel: t("aaalice.pcp.image.drop", "Drop image here"),
			clearLabel: t("aaalice.pcp.image.clear", "Clear selected image"),
			className: "aaalice-pcp-node-image-control",
			onSelected: (reference) => {
				parameter.value = reference;
				toast("success", message("aaalice.pcp.image.uploaded", "Image uploaded: {filename}", { filename: reference.filename }));
				persist();
			},
			onClear: () => { parameter.value = null; persist(); },
			onError: (error) => {
				if (error?.code === "file-type") toast("error", t("aaalice.pcp.error.imageFileType", "Choose an image file."));
				else if (error?.code === "response") toast("error", t("aaalice.pcp.error.imageUploadResponse", "The server response did not include an image filename."));
				else toast("error", message("aaalice.pcp.error.imageUpload", "Image upload failed: {reason}", { reason: error?.message || String(error) }));
			},
		}));
	}
	return isolate(createParameterControl({ parameter, onChange: persist, labels: { input: displayName(parameter) } }));
}

function disconnectSegmentObservers(root) {
	for (const segmented of root.querySelectorAll(".aaalice-pcp-segmented")) segmented._aaaliceResizeObserver?.disconnect();
}

function renderNode(node, root) {
	closeImagePreview();
	disconnectSegmentObservers(root);
	root.replaceChildren();
	const parameters = ensureParameters(node);
	const layout = computeParameterLayout(node);
	root.classList.toggle("aaalice-pcp-canvas-static", app.canvas?.vueNodesMode !== true);
	root.style.setProperty("--aaalice-output-column-width", `${layout.outputColumn.width}px`);
	root.style.setProperty("--aaalice-node-content-height", `${layout.height}px`);
	for (const parameter of parameters) {
		if (parameter.param_type === "separator") {
			const section = el("div", "aaalice-pcp-node-section", displayName(parameter));
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
			attachDescription(trigger, parameter.description);
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
		inspectorGrid.append(inspectorSection(t("aaalice.pcp.editor.optionsBehavior", "Options and behavior"), optionsBody));
	}
	if (parameter.param_type === "string") {
		const multiline = document.createElement("input");
		multiline.type = "checkbox";
		multiline.checked = Boolean(parameter.config?.multiline);
		multiline.addEventListener("change", () => { parameter.config.multiline = multiline.checked; editor.dirty = true; editor.updateValidation?.(); });
		inspectorGrid.append(inspectorSection(t("aaalice.pcp.editor.optionsBehavior", "Options and behavior"), inspectorField(t("aaalice.pcp.field.multiline", "Multiline"), multiline)));
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

async function openParameterEditor(node) {
	const original = ensureParameters(node);
	const editor = { parameters: cloneData(original), selectedId: original[0]?.id || null, dirty: false, list: null, inspector: null };
	const workspace = el("div", "aaalice-parameter-editor-workspace");
	const rail = el("aside", "aaalice-parameter-editor-rail");
	const railHeader = el("header", "aaalice-editor-rail-header");
	const railHeading = el("div", "aaalice-editor-rail-heading");
	railHeading.append(
		el("strong", null, t("aaalice.pcp.editor.parameters", "Parameters")),
		el("span", null, t("aaalice.pcp.editor.reorderHint", "Drag to reorder · Double-click to rename")),
	);
	railHeader.append(railHeading);
	const addBar = el("div", "aaalice-editor-add");
	const addControl = el("div", "aaalice-editor-add-control");
	const type = selectInput(parameterTypeOptions(), "slider");
	type.setAttribute("aria-label", t("aaalice.pcp.editor.parameterType", "Parameter type"));
	const add = iconButton({ iconName: "add", label: t("aaalice.pcp.editor.add", "Add parameter"), variant: "primary", className: "aaalice-editor-add-button" });
	editor.list = el("div", "aaalice-editor-compact-list");
	addControl.append(type, add);
	addBar.append(addControl);
	rail.append(railHeader, addBar, editor.list);
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
	dialogApi.header.replaceChildren(dialogApi.heading, editor.count);
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
		toast("warn", t("aaalice.pcp.editor.saveWorkflowReminder", "Save the workflow to keep these parameter changes; otherwise they will be lost."));
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
	const widget = node.addDOMWidget("aaalice_parameter_panel", "custom", root, {
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
		if (event.detail?.nodeId != null && String(event.detail.nodeId) !== String(node.id)) return;
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
		disconnectSegmentObservers(root);
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
		const nodes = (app.graph?._nodes || []).filter(isParameterPanel);
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of nodes) {
			const promptNode = output?.[String(node.id)];
			if (!promptNode) continue;
			normalizeDynamicOptions(ensureParameters(node));
			promptNode.inputs ||= {};
			promptNode.inputs.parameters_json = JSON.stringify(materializeParameters(ensureParameters(node)));
			promptNode.inputs.validate_dynamic_values = Boolean(node.outputs?.some((output) => output?.links?.length));
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
		for (const node of app.graph?._nodes || []) if (isParameterPanel(node)) setupParameterPanel(node, true);
	},
});
