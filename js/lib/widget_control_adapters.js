/** Pluggable adapters that normalize third-party widgets for sidebar providers. */

import { createSeedPresetPayload, decodeSeedPresetEntry, SEED_AFTER_GENERATE_MODES, validateSeedPresetEntry } from "./seed_preset.js";
import { invalidateControlHost } from "./control_host_events.js";
import { DASHBOARD_MARKDOWN_ROW_SPAN } from "./dashboard_sizing.js";

const adapters = [];
let adapterRevision = 0;
let adaptedWidgetIndexes = new WeakMap();
let definitionOwnerCache = new WeakMap();

const SIMPLE_NATIVE_WIDGETS = Object.freeze({
	int: { kind: "numeric", valueType: "number", numericDomain: "integer" }, float: { kind: "numeric", valueType: "number", numericDomain: "float" },
	number: { kind: "numeric", valueType: "number", numericDomain: null }, slider: { kind: "numeric", valueType: "number", numericDomain: null }, knob: { kind: "numeric", valueType: "number", numericDomain: null }, gradientslider: { kind: "numeric", valueType: "number", numericDomain: "float" },
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
	adapters.push(normalized); adapters.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)); adapterRevision += 1;
	return () => { const index = adapters.indexOf(normalized); if (index >= 0) { adapters.splice(index, 1); adapterRevision += 1; adaptedWidgetIndexes = new WeakMap(); } };
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

function optionValues(options = {}, context = null) {
	let source = options.values ?? options.options ?? [];
	if (typeof source === "function") source = source(context?.widget, context?.node) || [];
	if (!Array.isArray(source) && source && typeof source === "object") return Object.entries(source).map(([value, label]) => ({ value, label: String(label) }));
	return Array.isArray(source) ? source : [];
}

function normalizedChoiceOptions(options, context) {
	return { ...options, values: optionValues(options, context) };
}

function nativeWidgetCanvas(node) { return node?.graph?.list_of_graphcanvas?.[0] || null; }

function setNativeWidgetValue(node, widget, next) {
	const canvas = nativeWidgetCanvas(node);
	if (typeof widget?.setValue === "function" && canvas) return widget.setValue(next, { node, canvas });
	const oldValue = widget.value;
	if (Object.is(oldValue, next)) return;
	const value = widget.type === "number" || typeof oldValue === "number" ? Number(next) : next;
	widget.value = value;
	if (widget.options?.property && node?.properties?.[widget.options.property] !== undefined) node.setProperty?.(widget.options.property, value);
	const result = widget.callback?.(value, canvas, node, canvas?.graph_mouse, undefined);
	node?.onWidgetChanged?.(widget.name || "", value, oldValue, widget);
	node?.graph?.incrementVersion?.();
	return result;
}

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

function nativeNumericDomain(node, widget, definition) {
	if (definition?.numericDomain) return definition.numericDomain;
	const owner = resolveWidgetDefinitionOwner(node, widget);
	const inputs = { ...(owner.node?.constructor?.nodeData?.input?.required || {}), ...(owner.node?.constructor?.nodeData?.input?.optional || {}) };
	const input = inputs?.[owner.widget?.name];
	const type = String(Array.isArray(input) ? input[0] : input?.type || "").toUpperCase();
	if (type === "INT") return "integer";
	if (type === "FLOAT") return "float";
	if (widgetType(owner.widget) === "gradientslider" || Object.prototype.hasOwnProperty.call(owner.widget?.options || {}, "round")) return "float";
	if (Number(owner.widget?.options?.precision) === 0 && Number.isInteger(Number(owner.widget?.options?.step2))) return "integer";
	return null;
}

export function adaptWidgetControl(node, widget, { promoted = false, adapterId = null } = {}) {
	const context = { node, widget, promoted };
	const adapter = adapters.find((candidate) => (!adapterId || candidate.id === adapterId) && candidate.matches(context));
	if (!adapter) return null;
	const described = adapter.describe(context);
	if (!described) return null;
	if (typeof described !== "object" || typeof described.then === "function") throw new TypeError(`Widget control adapter ${adapter.id} must return a synchronous descriptor`);
	const currentValue = () => typeof described.getValue === "function" ? described.getValue(context) : ("value" in described ? described.value : widget.value);
	const value = currentValue();
	const kind = described.kind || null;
	const valueType = described.valueType || controlValueType(value) || KIND_VALUE_TYPES[kind] || null;
	if (!valueType) return null;
	if (typeof valueType !== "string") throw new TypeError(`Widget control adapter ${adapter.id} returned an invalid valueType`);
	if (kind != null && (typeof kind !== "string" || !kind)) throw new TypeError(`Widget control adapter ${adapter.id} returned an invalid kind`);
	const numericDomain = described.numericDomain ?? null;
	if (numericDomain != null && !["integer", "float"].includes(numericDomain)) throw new TypeError(`Widget control adapter ${adapter.id} returned an invalid numericDomain`);
	const controlId = String(described.controlId || widget.name || "");
	if (!controlId) throw new TypeError(`Widget control adapter ${adapter.id} returned an empty controlId`);
	const rawOptions = described.options || widget.options || {};
	const options = kind === "choice" ? normalizedChoiceOptions(rawOptions, context) : rawOptions;
	const availabilitySource = typeof described.getAvailability === "function" ? described.getAvailability(context) : described.availability;
	const availability = normalizeAvailability(availabilitySource, { kind, currentValue: value, options });
	const presetHooks = ["readPresetValue", "validatePresetValue", "applyPresetValue"]
		.map((hook) => typeof described[hook] === "function" || typeof adapter[hook] === "function");
	if (presetHooks.some(Boolean) && !presetHooks.every(Boolean)) throw new TypeError(`Widget control adapter ${adapter.id} must provide the complete preset codec`);
	const hasCustomPresetCodec = presetHooks.every(Boolean);
	const supportsSeedBehavior = kind === "seed" && hasCustomPresetCodec && (typeof described.setSeedBehavior === "function" || typeof adapter.setSeedBehavior === "function");
	const seedBehaviors = kind === "seed" ? optionValues({ values: described.seedBehaviors || options.behaviors || [] }).map(String) : [];
	return {
		adapterId: adapter.id,
		controlId,
		label: String(described.label || widget.label || widget.name || "Control"),
		value,
		valueType,
		kind,
		numericDomain,
		options,
		availability,
		presettable: described.presettable !== false,
		linkable: described.linkable === true || adapter.linkable === true,
		supportsSeedBehavior,
		seedBehaviors,
		columnSpan: Number.isFinite(Number(described.columnSpan)) ? Number(described.columnSpan) : null,
		rowSpan: Number.isFinite(Number(described.rowSpan)) ? Number(described.rowSpan) : null,
		minRowSpan: Number.isFinite(Number(described.minRowSpan)) ? Number(described.minRowSpan) : null,
		hasCustomPresetCodec,
		widget,
		control: described.control || widget,
		setValue(next) {
			if (typeof described.setValue === "function") return described.setValue(next, context);
			if (typeof adapter.setValue === "function") return adapter.setValue(next, context);
			return setNativeWidgetValue(node, widget, next);
		},
		readPresetValue() {
			if (typeof described.readPresetValue === "function") return described.readPresetValue(context);
			if (typeof adapter.readPresetValue === "function") return adapter.readPresetValue(context);
			return currentValue();
		},
		validatePresetValue(entry) {
			if (typeof described.validatePresetValue === "function") return described.validatePresetValue(entry, context);
			if (typeof adapter.validatePresetValue === "function") return adapter.validatePresetValue(entry, context);
			return true;
		},
		validateLinkedValue(next) {
			if (typeof described.validateLinkedValue === "function") return described.validateLinkedValue(next, context);
			if (typeof adapter.validateLinkedValue === "function") return adapter.validateLinkedValue(next, context);
			if (["image", "image-choice"].includes(kind) && valueType === "string") return typeof next === "string" ? true : "invalid-string";
			return this.validatePresetValue({ valueType, payload: next });
		},
		applyPresetValue(entry) {
			if (typeof described.applyPresetValue === "function") return described.applyPresetValue(entry, context);
			if (typeof adapter.applyPresetValue === "function") return adapter.applyPresetValue(entry, context);
			return this.setValue(entry.payload);
		},
		setSeedBehavior(behavior) {
			if (!SEED_AFTER_GENERATE_MODES.includes(behavior)) throw new TypeError(`Invalid seed behavior: ${behavior}`);
			if (typeof described.setSeedBehavior === "function") return described.setSeedBehavior(behavior, context);
			if (typeof adapter.setSeedBehavior === "function") return adapter.setSeedBehavior(behavior, context);
			throw new TypeError(`Widget control adapter ${adapter.id} does not support seed behavior changes`);
		},
	};
}

export function listAdaptedWidgetControls(node, { promoted = false, adapterId = null } = {}) {
	const widgets = node?.widgets || [];
	const controls = widgets
		.map((widget) => adaptWidgetControl(node, widget, { promoted, adapterId }))
		.filter((adapted) => adapted && (!promoted || isPromotedWidget(adapted.widget)));
	cacheAdaptedWidgetIndex(node, widgets, controls, { promoted, adapterId });
	return controls;
}

function adaptedIndexKey({ promoted = false, adapterId = null } = {}) { return `${promoted ? "promoted" : "native"}:${adapterId || "*"}`; }
function sameWidgetSnapshot(left, right) { return left.length === right.length && left.every((widget, index) => widget === right[index]); }
function cacheAdaptedWidgetIndex(node, widgets, controls, options) {
	if (!node || (typeof node !== "object" && typeof node !== "function")) return;
	let indexes = adaptedWidgetIndexes.get(node);
	if (!indexes) { indexes = new Map(); adaptedWidgetIndexes.set(node, indexes); }
	const byControlId = new Map();
	for (const control of controls) if (!byControlId.has(control.controlId)) byControlId.set(control.controlId, control.widget);
	indexes.set(adaptedIndexKey(options), { adapterRevision, widgets: [...widgets], byControlId });
}

/** Resolve one bound control without rebuilding descriptors for every sibling widget. */
export function resolveAdaptedWidgetControl(node, controlId, { promoted = false, adapterId = null } = {}) {
	if (!node || (typeof node !== "object" && typeof node !== "function")) return null;
	const widgets = node?.widgets || [];
	const options = { promoted, adapterId };
	const cached = adaptedWidgetIndexes.get(node)?.get(adaptedIndexKey(options));
	if (cached?.adapterRevision === adapterRevision && sameWidgetSnapshot(cached.widgets, widgets)) {
		const widget = cached.byControlId.get(String(controlId));
		if (!widget) return null;
		const adapted = adaptWidgetControl(node, widget, options);
		if (adapted?.controlId === String(controlId) && (!promoted || isPromotedWidget(adapted.widget))) return adapted;
	}
	return listAdaptedWidgetControls(node, options).find((candidate) => candidate.controlId === String(controlId)) || null;
}

export function invalidateWidgetControlAdapterCache(node = null) {
	if (node) { adaptedWidgetIndexes.delete(node); definitionOwnerCache.delete(node); }
	else { adaptedWidgetIndexes = new WeakMap(); definitionOwnerCache = new WeakMap(); }
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
	if (!isPromotedWidget(widget) || !node?.isSubgraphNode?.()) return { node, widget };
	let nodeCache = definitionOwnerCache.get(node);
	if (!nodeCache) { nodeCache = new WeakMap(); definitionOwnerCache.set(node, nodeCache); }
	const cached = nodeCache.get(widget);
	const source = [node.subgraph, widget.sourceNodeId, widget.sourceWidgetName, widget.disambiguatingSourceNodeId, widget.node];
	if (cached && cached.source.every((value, index) => value === source[index])) return cached.owner;
	let currentHost = node;
	let currentNodeId = widget.sourceNodeId;
	let currentWidgetName = widget.sourceWidgetName;
	let currentSourceNodeId = widget.disambiguatingSourceNodeId;
	const hostIds = new WeakMap(); const visited = new Set(); let nextHostId = 0;
	for (let depth = 0; depth < 100; depth++) {
		if (!hostIds.has(currentHost)) hostIds.set(currentHost, nextHostId++);
		const key = `${hostIds.get(currentHost)}:${currentNodeId}:${currentWidgetName}:${currentSourceNodeId || ""}`;
		if (visited.has(key)) break;
		visited.add(key);
		const interiorNode = currentHost.subgraph?.getNodeById?.(currentNodeId);
		if (!interiorNode) break;
		const interiorWidget = currentSourceNodeId
			? (interiorNode.widgets || []).find((candidate) => isPromotedWidget(candidate) && (candidate.disambiguatingSourceNodeId ?? candidate.sourceNodeId) === currentSourceNodeId && (candidate.sourceWidgetName === currentWidgetName || candidate.name === currentWidgetName))
			: (interiorNode.widgets || []).find((candidate) => candidate?.name === currentWidgetName);
		if (!interiorWidget) break;
		if (!isPromotedWidget(interiorWidget)) {
			const owner = { node: interiorNode, widget: interiorWidget };
			nodeCache.set(widget, { source, owner });
			return owner;
		}
		const nextHost = interiorWidget.node?.isSubgraphNode?.() ? interiorWidget.node : interiorNode?.isSubgraphNode?.() ? interiorNode : null;
		if (!nextHost) break;
		currentHost = nextHost;
		currentNodeId = interiorWidget.sourceNodeId;
		currentWidgetName = interiorWidget.sourceWidgetName;
		currentSourceNodeId = undefined;
	}
	const owner = { node, widget };
	nodeCache.set(widget, { source, owner });
	return owner;
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
	linkable: true,
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
	linkable: true,
	matches({ node, widget, promoted }) {
		return supportsNativeFallback(node, promoted) && Boolean(simpleNativeWidgetDefinition(widget, { promoted }));
	},
	describe({ node, widget, promoted }) {
		const definition = simpleNativeWidgetDefinition(widget, { promoted });
		const numericDomain = nativeNumericDomain(node, widget, definition);
		const seedMode = numericDomain !== "float" ? linkedSeedModeWidget(node, widget) : null;
		const kind = seedMode ? "seed" : definition.kind;
		const options = { ...(widget.options || {}) };
		if (kind === "numeric" || kind === "seed") options.step = realWidgetStep(widget.options);
		return {
			controlId: widget.name,
			label: widget.label || widget.name,
			value: widget.value,
			valueType: kind === "choice" ? controlValueType(widget.value) || definition.valueType : definition.valueType,
			kind,
			numericDomain: seedMode ? "integer" : numericDomain,
			options: { ...options, ...(seedMode ? { control_after_generate: seedMode.value, behaviors: seedBehaviorValues(seedMode) } : {}) },
			...(seedMode ? { seedBehaviors: seedBehaviorValues(seedMode) } : {}),
			...(seedMode ? {
				readPresetValue: () => createSeedPresetPayload(widget.value, seedMode.value),
				validatePresetValue: (entry) => validateSeedPresetEntry(entry, { ...(widget.options || {}), behaviors: seedBehaviorValues(seedMode) }),
				applyPresetValue: (entry) => {
					const decoded = decodeSeedPresetEntry(entry, seedMode.value);
					const valueResult = setNativeWidgetValue(node, widget, decoded.value);
					if (valueResult === false || valueResult?.ok === false || valueResult?.then) return valueResult;
					if (decoded.hasBehavior) return setNativeWidgetValue(node, seedMode, decoded.behavior);
					return valueResult;
				},
				setSeedBehavior: (behavior) => {
					if (!seedBehaviorValues(seedMode).includes(behavior)) throw new TypeError(`Seed behavior is not supported: ${behavior}`);
					return setNativeWidgetValue(node, seedMode, behavior);
				},
			} : {}),
		};
	},
});
