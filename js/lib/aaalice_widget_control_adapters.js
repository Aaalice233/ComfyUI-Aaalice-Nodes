/** Adapters for Aaalice composite widgets and compatible third-party controls. */

import { DASHBOARD_STANDARD_CONTROL_ROW_SPAN } from "./dashboard_sizing.js";
import { resolveLoraPreview } from "./lora_preview.js";
import { registerWidgetControlAdapter } from "./widget_control_adapters.js";

const RESOLUTION_NODE = "ResolutionPreset";
const PROMPT_SELECTOR_NODE = "PromptSelector";
const BOORU_GALLERY_NODE = "BooruGalleryNode";
const LORA_TEXT_WIDGET = "autocomplete_text_loras";
const LORA_LIST_WIDGET = "loras";
const LORA_LIST_WIDGET_TYPE = "loras";
const LORA_LIST_ROW_SPAN = 36;
const LORA_LIST_MIN_ROW_SPAN = 28;

function nodeType(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].find(Boolean) || "";
}

function resolutionWidget(node, widget) {
	return nodeType(node) === RESOLUTION_NODE && widget?.name === "aaalice_resolution_preset" && Boolean(node?._aaaliceResolutionControl);
}

function promptSelectorWidget(node, widget) {
	return nodeType(node) === PROMPT_SELECTOR_NODE && widget?.name === "aaalice_prompt_selector" && Boolean(node?._aaalicePromptSelectorControl);
}

function booruGalleryWidget(node, widget) {
	return nodeType(node) === BOORU_GALLERY_NODE && widget?.name === "aaalice_booru_gallery" && Boolean(node?._aaGalleryRuntime?.createSidebarControl);
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

function loraWidgetMethod(widget, name) {
	if (typeof widget?.[name] === "function") return { owner: widget, method: widget[name], key: name };
	if (typeof widget?.options?.[name] === "function") return { owner: widget.options, method: widget.options[name], key: name };
	return null;
}

function loraListWidget(widget) {
	if (widget?.name !== LORA_LIST_WIDGET) return false;
	const type = String(widget?.type || "").trim().toLowerCase();
	if (type === LORA_LIST_WIDGET_TYPE) return true;
	return Boolean(loraWidgetMethod(widget, "getValue") && loraWidgetMethod(widget, "setValue"));
}

function readLoraList(widget) {
	const getter = loraWidgetMethod(widget, "getValue");
	const value = getter ? getter.method.call(widget) : widget?.value;
	return Array.isArray(value) ? value : [];
}

function copyLoraList(value, { includeSelection = false } = {}) {
	if (!Array.isArray(value)) return [];
	return value.map((entry) => {
		if (!entry || typeof entry !== "object") return entry;
		const copy = { ...entry };
		if (!includeSelection) delete copy.selected;
		return copy;
	});
}

function loraListValue(widget) {
	return copyLoraList(readLoraList(widget));
}

function validateLoraListPayload(payload) {
	if (!Array.isArray(payload)) return "invalid-lora-list";
	const names = new Set();
	for (const entry of payload) {
		if (!entry || typeof entry !== "object" || typeof entry.name !== "string" || !entry.name.trim()) return "invalid-lora-entry";
		if (names.has(entry.name)) return "duplicate-lora-name";
		names.add(entry.name);
	}
	return true;
}

const loraListSubscriptions = new WeakMap();

function enqueueLoraListChange(state, widget) {
	if (state.scheduled) return;
	state.scheduled = true;
	const enqueue = typeof queueMicrotask === "function" ? queueMicrotask : (callback) => Promise.resolve().then(callback);
	enqueue(() => {
		state.scheduled = false;
		const value = loraListValue(widget);
		for (const listener of state.listeners) listener(value, { source: "host" });
	});
}

function subscribeLoraListValueChange(widget, listener) {
	if (typeof listener !== "function") return () => {};
	let state = loraListSubscriptions.get(widget);
	if (!state) {
		const setter = loraWidgetMethod(widget, "setValue");
		state = { listeners: new Set(), scheduled: false, setter, wrappedSetter: null, observer: null };
		if (setter) {
			state.wrappedSetter = function (...args) {
				const result = state.setter.method.apply(this, args);
				enqueueLoraListChange(state, widget);
				return result;
			};
			setter.owner[setter.key] = state.wrappedSetter;
		}
		const element = widget?.element;
		if (typeof MutationObserver === "function" && element?.nodeType) {
			state.observer = new MutationObserver(() => enqueueLoraListChange(state, widget));
			state.observer.observe(element, { childList: true, subtree: true });
		}
		loraListSubscriptions.set(widget, state);
	}
	state.listeners.add(listener);
	return () => {
		state.listeners.delete(listener);
		if (state.listeners.size > 0) return;
		state.observer?.disconnect();
		if (state.setter && state.setter.owner[state.setter.key] === state.wrappedSetter) state.setter.owner[state.setter.key] = state.setter.method;
		loraListSubscriptions.delete(widget);
	};
}

function loraListCanvas(node) {
	return node?.graph?.list_of_graphcanvas?.[0] || null;
}

function setLoraListValue(node, widget, next) {
	const canvas = loraListCanvas(node);
	const value = Array.isArray(next) ? copyLoraList(next, { includeSelection: true }) : [];
	const result = typeof widget?.setValue === "function"
		? widget.setValue(value, { node, canvas })
		: (widget.value = value, undefined);
	if (result === false) return result;
	if (typeof widget?.callback !== "function") return result;
	const notify = () => {
		const callbackResult = widget.callback(widget.value, canvas, node, canvas?.graph_mouse, undefined);
		return callbackResult === undefined ? result : callbackResult;
	};
	return result && typeof result.then === "function" ? result.then(notify) : notify();
}

function hasLoraListWidget(node) {
	return (node?.widgets || []).some((widget) => loraListWidget(widget));
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
			label: "Resolution",
			labelPolicy: "node-title",
			kind: "resolution",
			valueType: "resolution",
			getValue: () => control.getValue(),
			options: {
				presets: control.getPresets(),
				alignments: control.getAlignments(),
				canvasLimits: control.getCanvasLimits(),
				createSidebarControl: control.createSidebarControl,
			},
			columnSpan: 6,
			rowSpan: 13,
			minRowSpan: 13,
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
			label: "Prompt Selector",
			labelPolicy: "node-title",
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
	id: "aaalice-booru-gallery",
	priority: 900,
	matches({ node, widget, promoted }) {
		return !promoted && booruGalleryWidget(node, widget);
	},
	describe({ node, widget }) {
		const runtime = node._aaGalleryRuntime;
		return {
			control: runtime,
			controlId: widget.name,
			label: "Booru Gallery",
			labelPolicy: "node-title",
			kind: "booru-gallery",
			valueType: "booru-gallery",
			getValue: () => node.properties?.booruGalleryState || null,
			columnSpan: 12,
			rowSpan: 90,
			minRowSpan: 50,
			options: { createSidebarControl: () => runtime.createSidebarControl() },
			readPresetValue: () => runtime.getPresetValue(),
			validatePresetValue: (entry) => entry?.valueType === "booru-gallery" ? runtime.validatePresetValue(entry.payload) : "type-mismatch",
			applyPresetValue: (entry) => runtime.applyPresetValue(entry.payload),
			setValue: (next) => runtime.applyPresetValue(next),
		};
	},
});

registerWidgetControlAdapter({
	id: "lora-manager-list",
	priority: 900,
	matches({ widget, promoted }) {
		return !promoted && loraListWidget(widget);
	},
	describe({ node, widget }) {
		return {
			controlId: widget.name,
			label: "LoRA List",
			labelPolicy: "node-title",
			kind: "lora-list",
			valueType: "lora-list",
			getValue: () => loraListValue(widget),
			value: loraListValue(widget),
			options: { itemFields: ["name", "strength", "clipStrength", "active", "expanded"], previewResolver: resolveLoraPreview },
			columnSpan: 12,
			rowSpan: LORA_LIST_ROW_SPAN,
			minRowSpan: LORA_LIST_MIN_ROW_SPAN,
			readPresetValue: () => loraListValue(widget),
			validatePresetValue: (entry) => validateLoraListPayload(entry?.payload),
			applyPresetValue: (entry) => setLoraListValue(node, widget, entry?.payload),
			setValue: (next) => setLoraListValue(node, widget, next),
			subscribeValueChange: (listener) => subscribeLoraListValueChange(widget, listener),
		};
	},
});

registerWidgetControlAdapter({
	id: "lora-manager-text",
	priority: 850,
	matches({ node, widget, promoted }) {
		return !promoted && !hasLoraListWidget(node)
			&& String(widget?.type || "").trim().toLowerCase() === LORA_TEXT_WIDGET && widget?.name === "text";
	},
	describe({ node, widget }) {
		const value = loraWidgetValue(widget);
		return {
			controlId: widget.name,
			label: "LoRA",
			labelPolicy: "node-title",
			kind: "text",
			valueType: "string",
			getValue: () => loraWidgetValue(widget),
			value,
			options: { multiline: true, ...(widget.options?.placeholder ? { placeholder: widget.options.placeholder } : {}) },
			subscribeValueChange: (listener) => subscribeLoraValueChange(widget, listener),
			rowSpan: DASHBOARD_STANDARD_CONTROL_ROW_SPAN,
			minRowSpan: DASHBOARD_STANDARD_CONTROL_ROW_SPAN,
		};
	},
});
