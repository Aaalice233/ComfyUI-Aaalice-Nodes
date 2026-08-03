/** Adapters for Aaalice composite widgets and compatible third-party controls. */

import { registerWidgetControlAdapter } from "./widget_control_adapters.js";

const RESOLUTION_NODE = "ResolutionPreset";
const PROMPT_SELECTOR_NODE = "PromptSelector";
const LORA_TEXT_WIDGET = "autocomplete_text_loras";

function nodeType(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].find(Boolean) || "";
}

function nodeTitle(node, fallback) {
	const title = typeof node?.getTitle === "function" ? node.getTitle() : node?.title;
	return String(title || fallback);
}

function resolutionWidget(node, widget) {
	return nodeType(node) === RESOLUTION_NODE && widget?.name === "aaalice_resolution_preset" && Boolean(node?._aaaliceResolutionControl);
}

function promptSelectorWidget(node, widget) {
	return nodeType(node) === PROMPT_SELECTOR_NODE && widget?.name === "aaalice_prompt_selector" && Boolean(node?._aaalicePromptSelectorControl);
}

function loraInputElement(widget) {
	return widget?.inputEl || widget?.element?.__widgetInputEl?.inputEl || null;
}

function loraWidgetValue(widget) {
	const input = loraInputElement(widget);
	if (input) return input.value;
	if (typeof widget?._pendingValue === "string") return widget._pendingValue;
	const current = typeof widget?.getValue === "function" ? widget.getValue() : null;
	return typeof current === "string" && current ? current : String(widget?.value || current || "");
}

function subscribeLoraValueChange(widget, listener) {
	if (typeof listener !== "function") return () => {};
	const target = typeof widget?.element?.addEventListener === "function" ? widget.element : loraInputElement(widget);
	if (!target) return () => {};
	const emit = () => listener(loraWidgetValue(widget), { source: "host" });
	target.addEventListener("input", emit);
	target.addEventListener("change", emit);
	return () => { target.removeEventListener("input", emit); target.removeEventListener("change", emit); };
}

registerWidgetControlAdapter({
	id: "aaalice-resolution-preset",
	priority: 900,
	matches({ node, widget, promoted }) {
		return !promoted && resolutionWidget(node, widget);
	},
	describe({ node, widget }) {
		const control = node._aaaliceResolutionControl;
		return {
			controlId: widget.name,
			label: nodeTitle(node, "Resolution"),
			kind: "resolution",
			valueType: "resolution",
			getValue: () => control.getValue(),
			options: {
				presets: control.getPresets(),
				alignments: control.getAlignments(),
				canvasLimits: control.getCanvasLimits(),
				createSidebarControl: control.createSidebarControl,
			},
			columnSpan: 12,
			rowSpan: 40,
			minRowSpan: 32,
			readPresetValue: () => control.getValue(),
			validatePresetValue: (entry) => control.validatePresetValue(entry),
			applyPresetValue: (entry) => control.setValue(entry.payload),
			setValue: (next) => control.setValue(next),
		};
	},
});

registerWidgetControlAdapter({
	id: "aaalice-prompt-selector",
	priority: 900,
	matches({ node, widget, promoted }) {
		return !promoted && promptSelectorWidget(node, widget);
	},
	describe({ node, widget }) {
		const control = node._aaalicePromptSelectorControl;
		return {
			controlId: widget.name,
			label: nodeTitle(node, "Prompt Selector"),
			kind: "prompt-selector",
			valueType: "prompt-selector",
			getValue: () => control.getValue(),
			columnSpan: 12,
			rowSpan: 64,
			minRowSpan: 52,
			options: { createSidebarControl: control.createSidebarControl },
			readPresetValue: () => control.getValue(),
			validatePresetValue: (entry) => control.validatePresetValue(entry),
			applyPresetValue: (entry) => control.setValue(entry.payload),
			setValue: (next) => control.setValue(next),
		};
	},
});

registerWidgetControlAdapter({
	id: "lora-manager-text",
	priority: 850,
	matches({ widget, promoted }) {
		return !promoted && String(widget?.type || "").trim().toLowerCase() === LORA_TEXT_WIDGET && widget?.name === "text";
	},
	describe({ widget }) {
		const value = loraWidgetValue(widget);
		return {
			controlId: widget.name,
			label: widget.label || "LoRA",
			kind: "text",
			valueType: "string",
			getValue: () => loraWidgetValue(widget),
			value,
			options: { multiline: true, ...(widget.options?.placeholder ? { placeholder: widget.options.placeholder } : {}) },
			subscribeValueChange: (listener) => subscribeLoraValueChange(widget, listener),
			rowSpan: 24,
			minRowSpan: 18,
		};
	},
});
