/**
 * ParameterControlPanel — node surface shared by classic mode and Nodes 2.0.
 *
 * The visible controls live in one DOM widget. State remains in node.properties,
 * while graphToPrompt injects parameters_json for the backend.
 */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	EVENT_PCP_CHANGED,
	EVENT_PCP_LIST,
	ensureParameters,
	loadParametersFromWidget,
	notifyPcpChanged,
	syncParametersToWidget,
} from "./lib/param_model.js";

const NODE = "ParameterControlPanel";
const WIDGET_NAME = "aaalice_parameter_panel";
const MIN_WIDTH = 280;
const MIN_CONTENT_HEIGHT = 92;

function isPcp(node) {
	if (!node) return false;
	const candidates = [
		node.comfyClass,
		node.type,
		node.constructor?.comfyClass,
		node.constructor?.type,
		node.constructor?.nodeData?.name,
	];
	return candidates.some((candidate) => candidate === NODE);
}

function el(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text != null) element.textContent = text;
	return element;
}

function isolateControl(element) {
	element.addEventListener("pointerdown", (event) => event.stopPropagation());
	element.addEventListener("wheel", (event) => event.stopPropagation());
	return element;
}

function stripLegacyJsonUi(node) {
	if (node.widgets) {
		for (let index = node.widgets.length - 1; index >= 0; index -= 1) {
			const widget = node.widgets[index];
			if (widget?.name !== "parameters_json") continue;
			widget.onRemove?.();
			node.widgets.splice(index, 1);
		}
	}
	if (node.inputs) {
		for (let index = node.inputs.length - 1; index >= 0; index -= 1) {
			if (node.inputs[index]?.name !== "parameters_json") continue;
			if (typeof node.removeInput === "function") node.removeInput(index);
			else node.inputs.splice(index, 1);
		}
	}
}

function contentHeight(parameters) {
	let height = 42;
	if (!parameters.length) return MIN_CONTENT_HEIGHT;
	for (const parameter of parameters) {
		height += parameter.param_type === "separator" ? 34 : 64;
	}
	return Math.max(MIN_CONTENT_HEIGHT, height + 8);
}

function sliderConfig(parameter) {
	const config = parameter.config || {};
	const min = Number(config.min ?? 0);
	const max = Number(config.max ?? 100);
	const step = Number(config.step ?? 1);
	return {
		min: Number.isFinite(min) ? min : 0,
		max: Number.isFinite(max) ? max : 100,
		step: Number.isFinite(step) && step > 0 ? step : 1,
	};
}

function normalizeSliderValue(parameter, rawValue) {
	const { min, max, step } = sliderConfig(parameter);
	let value = Number(rawValue);
	if (!Number.isFinite(value)) return null;
	value = Math.round((value - min) / step) * step + min;
	const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
	value = decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
	return Math.max(min, Math.min(max, value));
}

function renderSlider(parameter, persist) {
	const wrap = el("div", "aaalice-pcp-node-slider");
	const { min, max, step } = sliderConfig(parameter);
	const normalized = normalizeSliderValue(parameter, parameter.value ?? min) ?? min;
	parameter.value = normalized;

	const range = isolateControl(document.createElement("input"));
	range.type = "range";
	range.min = String(min);
	range.max = String(max);
	range.step = String(step);
	range.value = String(normalized);

	const number = isolateControl(document.createElement("input"));
	number.type = "number";
	number.min = String(min);
	number.max = String(max);
	number.step = String(step);
	number.value = String(normalized);

	range.addEventListener("input", () => {
		const value = normalizeSliderValue(parameter, range.value);
		if (value == null) return;
		parameter.value = value;
		number.value = String(value);
		persist();
	});
	number.addEventListener("input", () => {
		const value = normalizeSliderValue(parameter, number.value);
		if (value == null) {
			number.value = String(parameter.value ?? min);
			return;
		}
		parameter.value = value;
		range.value = String(value);
		number.value = String(value);
		persist();
	});

	wrap.append(range, number);
	return wrap;
}

function renderSwitch(parameter, persist) {
	const button = isolateControl(el("button", "aaalice-pcp-node-switch"));
	button.type = "button";
	const update = () => {
		const enabled = Boolean(parameter.value);
		button.classList.toggle("active", enabled);
		button.setAttribute("aria-pressed", String(enabled));
		button.textContent = enabled
			? t("aaalice.common.enabled", "Enabled")
			: t("aaalice.common.disabled", "Disabled");
	};
	button.addEventListener("click", () => {
		parameter.value = !Boolean(parameter.value);
		update();
		persist();
	});
	update();
	return button;
}

function renderDropdown(parameter, persist) {
	const select = isolateControl(document.createElement("select"));
	const options = Array.isArray(parameter.config?.options) ? parameter.config.options : [];
	for (const option of options) {
		const optionElement = document.createElement("option");
		optionElement.value = String(option);
		optionElement.textContent = String(option);
		select.appendChild(optionElement);
	}
	if (!options.includes(parameter.value) && options.length) parameter.value = options[0];
	select.value = parameter.value != null ? String(parameter.value) : "";
	select.addEventListener("change", () => {
		parameter.value = select.value;
		persist();
	});
	return select;
}

function renderString(parameter, persist) {
	const input = isolateControl(document.createElement("input"));
	input.type = "text";
	input.value = parameter.value != null ? String(parameter.value) : "";
	input.addEventListener("input", () => {
		parameter.value = input.value;
		persist();
	});
	return input;
}

function renderNodeSurface(node, root, persist) {
	root.replaceChildren();
	const parameters = ensureParameters(node);

	root.appendChild(
		el(
			"div",
			"aaalice-pcp-node-hint",
			t(
				"aaalice.pcp.node.structureHint",
				"Edit structure in the sidebar tab “Parameter Panel”.",
			),
		),
	);

	if (!parameters.length) {
		root.appendChild(
			el(
				"div",
				"aaalice-pcp-node-empty",
				t(
					"aaalice.pcp.node.empty",
					"No parameters yet — open the sidebar tab “Parameter Panel” to add some.",
				),
			),
		);
		return;
	}

	for (const parameter of parameters) {
		if (parameter.param_type === "separator") {
			root.appendChild(el("div", "aaalice-pcp-node-section", parameter.name || "—"));
			continue;
		}

		const row = el("div", "aaalice-pcp-node-row");
		const heading = el("div", "aaalice-pcp-node-row-heading");
		heading.append(
			el("span", "aaalice-pcp-node-name", parameter.name || parameter.id || "?"),
			el(
				"span",
				"aaalice-pcp-node-type",
				t(`aaalice.pcp.type.${parameter.param_type}`, parameter.param_type),
			),
		);
		row.appendChild(heading);

		if (parameter.param_type === "slider") row.appendChild(renderSlider(parameter, persist));
		else if (parameter.param_type === "switch") row.appendChild(renderSwitch(parameter, persist));
		else if (parameter.param_type === "dropdown") {
			row.appendChild(renderDropdown(parameter, persist));
		} else row.appendChild(renderString(parameter, persist));

		root.appendChild(row);
	}
}

function setupPcpNode(node) {
	if (!isPcp(node) || node._aaalicePcpDom) return;
	if (typeof node.addDOMWidget !== "function") {
		throw new Error("[Aaalice] ParameterControlPanel requires addDOMWidget");
	}
	node._aaalicePcpDom = true;

	loadParametersFromWidget(node);
	stripLegacyJsonUi(node);

	const root = el("div", "aaalice-pcp aaalice-pcp-node-root");
	let widget = null;
	let suppressOwnEvent = false;

	const desiredHeight = () => contentHeight(ensureParameters(node));
	const applySize = () => {
		const height = desiredHeight();
		root.style.setProperty("--comfy-widget-height", `${height}px`);
		root.style.setProperty("--comfy-widget-min-height", `${height}px`);
		if (widget) widget.computedHeight = height;
		const width = Math.max(node.size?.[0] || MIN_WIDTH, MIN_WIDTH);
		const nodeHeight = Math.max(node.size?.[1] || 0, height + 44);
		node.setSize([width, nodeHeight]);
	};
	const persist = () => {
		suppressOwnEvent = true;
		try {
			notifyPcpChanged(node);
		} finally {
			suppressOwnEvent = false;
		}
		node.setDirtyCanvas?.(true, true);
	};
	const redraw = () => {
		loadParametersFromWidget(node);
		stripLegacyJsonUi(node);
		renderNodeSurface(node, root, persist);
		syncParametersToWidget(node);
		applySize();
		node.setDirtyCanvas?.(true, true);
	};

	widget = node.addDOMWidget(WIDGET_NAME, "custom", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 8,
		getMinHeight: desiredHeight,
		getHeight: desiredHeight,
		getValue: () => "",
		setValue: () => {},
	});
	node._aaalicePcpWidget = widget;
	node._aaalicePcpRedraw = redraw;

	const onEvent = (event) => {
		if (event.detail?.nodeId != null && String(event.detail.nodeId) !== String(node.id)) return;
		if (suppressOwnEvent) return;
		redraw();
	};
	window.addEventListener(EVENT_PCP_CHANGED, onEvent);
	window.addEventListener(EVENT_PCP_LIST, onEvent);

	const previousRemove = node.onRemoved;
	node.onRemoved = function () {
		window.removeEventListener(EVENT_PCP_CHANGED, onEvent);
		window.removeEventListener(EVENT_PCP_LIST, onEvent);
		return previousRemove?.apply(this, arguments);
	};

	syncParametersToWidget(node);
	redraw();
	ensureI18nReady().then(redraw).catch((error) => {
		console.error("[Aaalice] Failed to refresh ParameterControlPanel i18n", error);
	});

	console.log("[Aaalice] PCP DOM surface ready", {
		id: node.id,
		comfyClass: node.comfyClass,
		type: node.type,
	});
}

function installPromptHook() {
	if (app._aaalicePcpPromptHook) return;
	app._aaalicePcpPromptHook = true;
	const originalGraphToPrompt = app.graphToPrompt?.bind(app);
	if (typeof originalGraphToPrompt !== "function") {
		throw new Error("[Aaalice] graphToPrompt is unavailable");
	}
	app.graphToPrompt = async function (...args) {
		const nodes = (app.graph?._nodes || []).filter(isPcp);
		for (const node of nodes) {
			loadParametersFromWidget(node);
			syncParametersToWidget(node);
		}
		const result = await originalGraphToPrompt(...args);
		const output = result?.output ?? result;
		if (output && typeof output === "object") {
			for (const node of nodes) {
				const promptNode = output[String(node.id)];
				if (!promptNode) continue;
				if (!promptNode.inputs) promptNode.inputs = {};
				promptNode.inputs.parameters_json = JSON.stringify(ensureParameters(node));
			}
		}
		return result;
	};
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaalicePcpHooked) return;
	nodeType.__aaalicePcpHooked = true;
	const previousCreated = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previousCreated?.apply(this, arguments);
		setupPcpNode(this);
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ParameterControlPanel",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== NODE) return;
		hookPrototype(nodeType);
	},

	nodeCreated(node) {
		if (isPcp(node)) setupPcpNode(node);
	},

	loadedGraphNode(node) {
		if (!isPcp(node)) return;
		setupPcpNode(node);
		node._aaalicePcpRedraw?.();
	},

	async setup() {
		installPromptHook();
		const types = globalThis.LiteGraph?.registered_node_types || {};
		for (const [key, nodeType] of Object.entries(types)) {
			if (key === NODE || nodeType?.comfyClass === NODE) hookPrototype(nodeType);
		}
		for (const node of app.graph?._nodes || []) {
			if (!isPcp(node)) continue;
			setupPcpNode(node);
			node._aaalicePcpRedraw?.();
		}
		console.log("[Aaalice] PCP DOM extension setup done");
	},
});
