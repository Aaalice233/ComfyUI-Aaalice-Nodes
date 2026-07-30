/** Pluggable adapters that normalize third-party widgets for sidebar providers. */

import { createSeedPresetPayload, decodeSeedPresetEntry, SEED_AFTER_GENERATE_MODES, validateSeedPresetEntry } from "./seed_preset.js";
import { invalidateControlHost } from "./control_host_events.js";
import { DASHBOARD_MARKDOWN_ROW_SPAN } from "./dashboard_sizing.js";

const adapters = [];

const SIMPLE_NATIVE_WIDGETS = Object.freeze({
	int: { kind: "numeric", valueType: "number" }, float: { kind: "numeric", valueType: "number" }, number: { kind: "numeric", valueType: "number" },
	boolean: { kind: "boolean", valueType: "boolean" }, toggle: { kind: "boolean", valueType: "boolean" },
	string: { kind: "text", valueType: "string" }, text: { kind: "text", valueType: "string" }, customtext: { kind: "text", valueType: "string" },
	combo: { kind: "choice", valueType: "string" },
});
const KIND_VALUE_TYPES = Object.freeze({ numeric: "number", seed: "number", boolean: "boolean", choice: "string", text: "string" });
const AVAILABILITY_STATES = new Set(["ready", "empty", "unset", "unavailable", "error"]);
const INACTIVE_NATIVE_WIDGET_TYPES = new Set(["converted-widget", "hidden"]);
const imageCompareCallbacks = new WeakMap();

export function controlValueType(value) {
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "string") return "string";
	return null;
}

function normalizeAdapter(adapter) {
	if (!adapter || typeof adapter.id !== "string" || !adapter.id) throw new TypeError("Widget control adapter requires a stable id");
	if (typeof adapter.matches !== "function" || typeof adapter.describe !== "function") throw new TypeError(`Widget control adapter ${adapter.id} requires matches() and describe()`);
	return { ...adapter, priority: Number.isFinite(Number(adapter.priority)) ? Number(adapter.priority) : 0 };
}

export function registerWidgetControlAdapter(adapter) {
	const normalized = normalizeAdapter(adapter);
	if (adapters.some((item) => item.id === normalized.id)) throw new Error(`Duplicate widget control adapter: ${normalized.id}`);
	adapters.push(normalized); adapters.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
	return () => { const index = adapters.indexOf(normalized); if (index >= 0) adapters.splice(index, 1); };
}

export function registeredWidgetControlAdapters() { return adapters.map(({ id, priority }) => ({ id, priority })); }

function widgetType(widget) { return String(widget?.type || "").trim().toLowerCase(); }
function isLinkedWidget(widget) { const [base, linkedName] = widgetType(widget).split(":", 2); return Boolean(linkedName && SIMPLE_NATIVE_WIDGETS[base]); }
function isNativeValueControl(widget) {
	const values = Array.isArray(widget?.options?.values) ? widget.options.values.map(String) : [];
	return widgetType(widget) === "combo" && widget?.options?.serialize === false && widget?.options?.canvasOnly === true
		&& ["fixed", "increment", "decrement", "randomize"].every((mode) => values.includes(mode));
}
function isInactiveNativeWidget(node, widget) {
	if (INACTIVE_NATIVE_WIDGET_TYPES.has(widgetType(widget)) || isLinkedWidget(widget)) return true;
	return isNativeValueControl(widget) && (node?.widgets || []).some((owner) => owner !== widget && owner?.linkedWidgets?.includes(widget));
}
function simpleNativeWidgetDefinition(widget, { promoted = false } = {}) {
	// PromotedWidgetView is intentionally non-serializing: the interior widget
	// remains the state owner while the subgraph node only projects its control.
	if (!widget || (!promoted && (widget.serialize === false || widget.options?.serialize === false)) || typeof widget.name !== "string" || !widget.name) return null;
	return SIMPLE_NATIVE_WIDGETS[widgetType(widget)] || null;
}

function supportsNativeFallback(node, promoted) {
	if (promoted) return true;
	// A mixed node may rely on a custom panel as its real state owner. In that
	// case only an explicit higher-priority adapter may opt individual widgets in.
	return (node?.widgets || []).every((widget) => isInactiveNativeWidget(node, widget) || Boolean(simpleNativeWidgetDefinition(widget)));
}

function optionValues(options = {}) { return Array.isArray(options.values) ? options.values : Array.isArray(options.options) ? options.options : []; }

// ComfyUI 前端按旧约定把 widget 的 step 放大 10 倍存储（deprecated），step2 才是真实步长。
function realWidgetStep(options = {}) {
	const step2 = Number(options?.step2);
	if (Number.isFinite(step2) && step2 > 0) return step2;
	const legacy = Number(options?.step);
	return (Number.isFinite(legacy) && legacy > 0 ? legacy : 10) * 0.1;
}

function normalizeAvailability(value, { kind, currentValue, options } = {}) {
	let source = value;
	if (source == null) {
		if (kind === "choice" && optionValues(options).length === 0) source = { state: "empty", reason: "no-options" };
		else if (currentValue == null && kind !== "choice") source = { state: "unset", reason: "no-value" };
		else source = { state: "ready" };
	}
	if (typeof source === "string") source = { state: source };
	if (!source || typeof source !== "object" || !AVAILABILITY_STATES.has(source.state)) throw new TypeError(`Invalid widget control availability state: ${source?.state}`);
	return Object.freeze({ state: source.state, reason: String(source.reason || ""), message: String(source.message || "") });
}

function linkedSeedModeWidget(node, widget) {
	const linked = widget?.linkedWidgets?.find((candidate) => isNativeValueControl(candidate));
	if (linked) return linked;
	return (node?.widgets || []).find((candidate) => {
		const [, linkedName] = widgetType(candidate).split(":", 2);
		return candidate?.name === "control_after_generate" && linkedName === widget?.name;
	}) || null;
}

function seedBehaviorValues(widget) {
	const values = Array.isArray(widget?.options?.values) ? widget.options.values : Array.isArray(widget?.options?.options) ? widget.options.options : null;
	return values?.map((value) => String(typeof value === "object" ? value.value ?? value.label : value)) || SEED_AFTER_GENERATE_MODES;
}

export function adaptWidgetControl(node, widget, { promoted = false, adapterId = null } = {}) {
	const context = { node, widget, promoted };
	const adapter = adapters.find((candidate) => (!adapterId || candidate.id === adapterId) && candidate.matches(context));
	if (!adapter) return null;
	const described = adapter.describe(context);
	if (!described) return null;
	if (typeof described !== "object" || typeof described.then === "function") throw new TypeError(`Widget control adapter ${adapter.id} must return a synchronous descriptor`);
	const value = typeof described.getValue === "function" ? described.getValue(context) : ("value" in described ? described.value : widget.value);
	const kind = described.kind || null;
	const valueType = described.valueType || controlValueType(value) || KIND_VALUE_TYPES[kind] || null;
	if (!valueType) return null;
	if (typeof valueType !== "string") throw new TypeError(`Widget control adapter ${adapter.id} returned an invalid valueType`);
	if (kind != null && (typeof kind !== "string" || !kind)) throw new TypeError(`Widget control adapter ${adapter.id} returned an invalid kind`);
	const controlId = String(described.controlId || widget.name || "");
	if (!controlId) throw new TypeError(`Widget control adapter ${adapter.id} returned an empty controlId`);
	const options = described.options || widget.options || {};
	const availabilitySource = typeof described.getAvailability === "function" ? described.getAvailability(context) : described.availability;
	const availability = normalizeAvailability(availabilitySource, { kind, currentValue: value, options });
	const presetHooks = ["readPresetValue", "validatePresetValue", "applyPresetValue"]
		.map((hook) => typeof described[hook] === "function" || typeof adapter[hook] === "function");
	if (presetHooks.some(Boolean) && !presetHooks.every(Boolean)) throw new TypeError(`Widget control adapter ${adapter.id} must provide the complete preset codec`);
	const hasCustomPresetCodec = presetHooks.every(Boolean);
	return {
		adapterId: adapter.id,
		controlId,
		label: String(described.label || widget.label || widget.name || "Control"),
		value,
		valueType,
		kind,
		options,
		availability,
		presettable: described.presettable !== false,
		columnSpan: Number.isFinite(Number(described.columnSpan)) ? Number(described.columnSpan) : null,
		rowSpan: Number.isFinite(Number(described.rowSpan)) ? Number(described.rowSpan) : null,
		minRowSpan: Number.isFinite(Number(described.minRowSpan)) ? Number(described.minRowSpan) : null,
		hasCustomPresetCodec,
		widget,
		control: described.control || widget,
		setValue(next) {
			if (typeof described.setValue === "function") return described.setValue(next, context);
			if (typeof adapter.setValue === "function") return adapter.setValue(next, context);
			widget.value = next; widget.callback?.(next);
		},
		readPresetValue() {
			if (typeof described.readPresetValue === "function") return described.readPresetValue(context);
			if (typeof adapter.readPresetValue === "function") return adapter.readPresetValue(context);
			return value;
		},
		validatePresetValue(entry) {
			if (typeof described.validatePresetValue === "function") return described.validatePresetValue(entry, context);
			if (typeof adapter.validatePresetValue === "function") return adapter.validatePresetValue(entry, context);
			return true;
		},
		applyPresetValue(entry) {
			if (typeof described.applyPresetValue === "function") return described.applyPresetValue(entry, context);
			if (typeof adapter.applyPresetValue === "function") return adapter.applyPresetValue(entry, context);
			return this.setValue(entry.payload);
		},
		setSeedLocked(locked) { return described.setSeedLocked?.(Boolean(locked), context); },
	};
}

export function listAdaptedWidgetControls(node, { promoted = false, adapterId = null } = {}) {
	return (node?.widgets || [])
		.map((widget) => adaptWidgetControl(node, widget, { promoted, adapterId }))
		.filter((adapted) => adapted && (!promoted || isPromotedWidget(adapted.widget)));
}

function isNativeImageCompareNode(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass].some((value) => value === "ImageCompare");
}

function bindImageCompareInvalidation(node, widget) {
	const installed = imageCompareCallbacks.get(widget);
	if (installed?.wrapper === widget.callback && installed.node === node) return;
	const original = widget.callback;
	const wrapper = function (...args) {
		const result = original?.apply(this, args);
		invalidateControlHost(node);
		return result;
	};
	imageCompareCallbacks.set(widget, { node, wrapper });
	widget.callback = wrapper;
}

// 图像上传 combo 在新前端只把标记留在节点定义的 input spec 里，旧路径则落在 widget.options 上，两处都要认。
function resolveWidgetDefinitionOwner(node, widget) {
	let currentNode = node;
	let currentWidget = widget;
	const visited = new Set();
	while (isPromotedWidget(currentWidget) && currentNode?.isSubgraphNode?.()) {
		const key = `${currentWidget.sourceNodeId}:${currentWidget.sourceWidgetName}`;
		if (visited.has(key)) break;
		visited.add(key);
		const interiorNode = currentNode.subgraph?.getNodeById?.(currentWidget.sourceNodeId);
		const interiorWidget = (interiorNode?.widgets || []).find((candidate) => candidate?.name === currentWidget.sourceWidgetName);
		if (!interiorNode || !interiorWidget) break;
		currentNode = interiorNode;
		currentWidget = interiorWidget;
	}
	return { node: currentNode, widget: currentWidget };
}

function imageUploadComboOptions(node, widget) {
	const owner = resolveWidgetDefinitionOwner(node, widget);
	const inputs = { ...(owner.node?.constructor?.nodeData?.input?.required || {}), ...(owner.node?.constructor?.nodeData?.input?.optional || {}) };
	const spec = inputs?.[owner.widget?.name];
	const definitionOptions = Array.isArray(spec) && spec[1] && typeof spec[1] === "object" ? spec[1] : {};
	return { ...definitionOptions, ...(owner.widget?.options || {}), ...(widget?.options || {}) };
}

function isImageUploadCombo(node, widget) {
	if (widgetType(widget) !== "combo") return false;
	const options = imageUploadComboOptions(node, widget);
	return Boolean(options.image_upload || options.animated_image_upload);
}

registerWidgetControlAdapter({
	id: "comfy-markdown",
	priority: 100,
	matches({ node, widget, promoted }) {
		return !promoted && widgetType(widget) === "markdown";
	},
	describe({ node, widget }) {
		return {
			controlId: widget.name,
			label: widget.label || node?.title || widget.name || "Note",
			kind: "markdown",
			valueType: "string",
			value: String(widget.value ?? ""),
			presettable: false,
			rowSpan: DASHBOARD_MARKDOWN_ROW_SPAN,
		};
	},
});

registerWidgetControlAdapter({
	id: "comfy-image-combo",
	priority: 100,
	matches({ node, widget }) {
		return isImageUploadCombo(node, widget);
	},
	describe({ node, widget }) {
		const imageOptions = imageUploadComboOptions(node, widget);
		const values = optionValues(imageOptions).map(String);
		return {
			controlId: widget.name,
			label: widget.label || widget.name,
			kind: "image-choice",
			valueType: "string",
			value: widget.value,
				options: {
					values,
					image_folder: imageOptions.image_folder || "input",
					upload_subfolder: imageOptions.upload_subfolder || "",
				},
			availability: values.length ? undefined : { state: "empty", reason: "no-options" },
		};
	},
});

registerWidgetControlAdapter({
	id: "comfy-image-compare",
	priority: 1000,
	matches({ node, widget, promoted }) {
		return !promoted && isNativeImageCompareNode(node) && widgetType(widget) === "imagecompare";
	},
	describe({ node, widget }) {
		bindImageCompareInvalidation(node, widget);
		return {
			controlId: widget.name || "compare_view",
			label: node?.title || node?.constructor?.title || widget.label || "Compare Images",
			kind: "image-compare",
			valueType: "image-compare-view",
			value: widget.value || { beforeImages: [], afterImages: [] },
			presettable: false,
			columnSpan: 12,
			rowSpan: 36,
			minRowSpan: 24,
		};
	},
});

function isPromotedWidget(widget) {
	return widget && typeof widget.sourceNodeId !== "undefined" && typeof widget.sourceWidgetName === "string";
}

registerWidgetControlAdapter({
	id: "comfy-native-widget",
	priority: -1000,
	matches({ node, widget, promoted }) {
		return supportsNativeFallback(node, promoted) && Boolean(simpleNativeWidgetDefinition(widget, { promoted }));
	},
	describe({ node, widget, promoted }) {
		const definition = simpleNativeWidgetDefinition(widget, { promoted });
		const seedMode = linkedSeedModeWidget(node, widget);
		const kind = seedMode ? "seed" : definition.kind;
		const options = { ...(widget.options || {}) };
		if (kind === "numeric" || kind === "seed") options.step = realWidgetStep(widget.options);
		return {
			controlId: widget.name,
			label: widget.label || widget.name,
			value: widget.value,
			valueType: definition.valueType,
			kind,
			options: { ...options, ...(seedMode ? { control_after_generate: seedMode.value } : {}) },
			...(seedMode ? {
				readPresetValue: () => createSeedPresetPayload(widget.value, seedMode.value),
				validatePresetValue: (entry) => validateSeedPresetEntry(entry, { ...(widget.options || {}), behaviors: seedBehaviorValues(seedMode) }),
				applyPresetValue: (entry) => {
					const decoded = decodeSeedPresetEntry(entry, seedMode.value);
					widget.value = decoded.value; widget.callback?.(widget.value);
					if (decoded.hasBehavior) { seedMode.value = decoded.behavior; seedMode.callback?.(seedMode.value); }
				},
				setSeedLocked: (locked) => { seedMode.value = locked ? "fixed" : "randomize"; seedMode.callback?.(seedMode.value); },
			} : {}),
		};
	},
});
