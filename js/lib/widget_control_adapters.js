/** Pluggable adapters that normalize third-party widgets for sidebar providers. */

import { createSeedPresetPayload, decodeSeedPresetEntry, SEED_AFTER_GENERATE_MODES, validateSeedPresetEntry } from "./seed_preset.js";
import { invalidateControlHost, notifyControlAdapterRegistryChanged } from "./control_host_events.js";
import { DASHBOARD_MARKDOWN_ROW_SPAN } from "./dashboard_sizing.js";
import { isPromotedWidget, promotedWidgetIdentity, resolvePromotedDefinitionOwner } from "./promoted_widget_source.js";

const adapters = [];
let adapterRevision = 0;
let adaptedWidgetIndexes = new WeakMap();
let definitionOwnerCache = new WeakMap();
let nativeFallbackCache = new WeakMap();

const SIMPLE_NATIVE_WIDGETS = Object.freeze({
	int: { kind: "numeric", valueType: "number", numericDomain: "integer" }, float: { kind: "numeric", valueType: "number", numericDomain: "float" },
	number: { kind: "numeric", valueType: "number", numericDomain: null }, slider: { kind: "numeric", valueType: "number", numericDomain: null }, knob: { kind: "numeric", valueType: "number", numericDomain: null }, gradientslider: { kind: "numeric", valueType: "number", numericDomain: "float" },
	boolean: { kind: "boolean", valueType: "boolean" }, toggle: { kind: "boolean", valueType: "boolean" },
	string: { kind: "text", valueType: "string" }, text: { kind: "text", valueType: "string" }, customtext: { kind: "text", valueType: "string" },
	combo: { kind: "choice", valueType: "string" },
});
const KIND_VALUE_TYPES = Object.freeze({ numeric: "number", seed: "number", boolean: "boolean", choice: "string", text: "string" });
const LABEL_POLICIES = new Set(["widget", "node-title"]);
// Built-in widget names describe the input slot, not the parameter's identity in a sidebar.
const GENERIC_NATIVE_WIDGET_LABELS = new Set(["value", "值", "数值", "text", "文本", "string", "字符串"]);
const AVAILABILITY_STATES = new Set(["ready", "empty", "unset", "unavailable", "error"]);
const INACTIVE_NATIVE_WIDGET_TYPES = new Set(["converted-widget", "hidden"]);
const MULTILINE_NATIVE_WIDGET_TYPES = new Set(["customtext", "multiline", "textarea"]);
const imageCompareCallbacks = new WeakMap();

export function controlValueType(value) {
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "string") return "string";
	return null;
}

function normalizeAdapter(adapter) {
	if (!adapter || typeof adapter.id !== "string" || !adapter.id) throw new TypeError("Widget control adapter requires a stable id");
	if (typeof adapter.describe !== "function") throw new TypeError(`Widget control adapter ${adapter.id} requires describe()`);
	const declaredTypes = adapter.widgetTypes == null ? null : (Array.isArray(adapter.widgetTypes) ? adapter.widgetTypes : [adapter.widgetTypes]);
	if (declaredTypes && (!declaredTypes.length || declaredTypes.some((type) => typeof type !== "string" || !type.trim()))) throw new TypeError(`Widget control adapter ${adapter.id} has invalid widgetTypes`);
	const typeSet = declaredTypes ? new Set(declaredTypes.map((type) => type.trim().toLowerCase())) : null;
	if (typeof adapter.matches !== "function" && !typeSet) throw new TypeError(`Widget control adapter ${adapter.id} requires matches() or widgetTypes`);
	const explicitMatches = adapter.matches;
	const matches = (context) => {
		if (typeSet && !typeSet.has(widgetType(context?.widget))) return false;
		return explicitMatches ? explicitMatches(context) : true;
	};
	const { matches: _matches, widgetTypes: _widgetTypes, ...definition } = adapter;
	return { ...definition, allowNativeFallback: adapter.allowNativeFallback === true, matches, priority: Number.isFinite(Number(adapter.priority)) ? Number(adapter.priority) : 0 };
}

export function registerWidgetControlAdapter(adapter) {
	const normalized = normalizeAdapter(adapter);
	if (adapters.some((item) => item.id === normalized.id)) throw new Error(`Duplicate widget control adapter: ${normalized.id}`);
	adapters.push(normalized); adapters.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)); adapterRevision += 1;
	nativeFallbackCache = new WeakMap();
	notifyControlAdapterRegistryChanged(adapterRevision);
	return () => { const index = adapters.indexOf(normalized); if (index >= 0) { adapters.splice(index, 1); adapterRevision += 1; adaptedWidgetIndexes = new WeakMap(); nativeFallbackCache = new WeakMap(); notifyControlAdapterRegistryChanged(adapterRevision); } };
}

export function registeredWidgetControlAdapters() { return adapters.map(({ id, priority }) => ({ id, priority })); }

function widgetType(widget) { return String(widget?.type || "").trim().toLowerCase(); }
function isLinkedWidget(widget) { const [base, linkedName] = widgetType(widget).split(":", 2); return Boolean(linkedName && SIMPLE_NATIVE_WIDGETS[base]); }
function isNativeValueControl(widget) {
	const values = Array.isArray(widget?.options?.values) ? widget.options.values.map(String) : [];
	return widgetType(widget) === "combo" && widget?.options?.serialize === false && widget?.options?.canvasOnly === true
		&& ["fixed", "increment", "decrement", "randomize"].every((mode) => values.includes(mode));
}
// ComfyUI injects non-parameter $$ preview widgets after execution; they must not change whether the host's real controls support fallback.
function isCanvasOnlyPseudoWidget(widget) {
	const name = widget?.name;
	if (typeof name !== "string" || !name.startsWith("$$")) return false;
	return widget.serialize === false || widget.options?.serialize === false || widget.options?.canvasOnly === true;
}
function isInactiveNativeWidget(node, widget) {
	if (INACTIVE_NATIVE_WIDGET_TYPES.has(widgetType(widget)) || isLinkedWidget(widget) || isCanvasOnlyPseudoWidget(widget)) return true;
	return isNativeValueControl(widget) && (node?.widgets || []).some((owner) => owner !== widget && owner?.linkedWidgets?.includes(widget));
}
function simpleNativeWidgetDefinition(widget, { promoted = false } = {}) {
	// PromotedWidgetView is intentionally non-serializing: the interior widget
	// remains the state owner while the subgraph node only projects its control.
	if (!widget || (!promoted && (widget.serialize === false || widget.options?.serialize === false)) || typeof widget.name !== "string" || !widget.name) return null;
	return SIMPLE_NATIVE_WIDGETS[widgetType(widget)] || null;
}

function hasExplicitNativeFallbackAdapter(node, widget) {
	const context = { node, widget, promoted: false };
	for (const adapter of adapters) {
		if (adapter.id === "comfy-native-widget" || !adapter.allowNativeFallback || !adapterMatches(adapter, context)) continue;
		const described = adapter.describe(context);
		if (described && typeof described.then === "function") throw new TypeError(`Widget control adapter ${adapter.id} must return a synchronous descriptor`);
		if (described) return true;
	}
	return false;
}

function supportsNativeFallback(node, promoted) {
	if (promoted) return true;
	// A mixed node may rely on a custom panel as its real state owner. In that
	// case only an explicit higher-priority adapter may opt individual widgets in.
	const widgets = node?.widgets || [];
	const cacheable = node && (typeof node === "object" || typeof node === "function");
	const cached = cacheable ? nativeFallbackCache.get(node) : null;
	if (cached && sameWidgetSnapshot(cached.widgets, widgets)) return cached.value;
	const value = widgets.every((widget) => isInactiveNativeWidget(node, widget)
		|| Boolean(simpleNativeWidgetDefinition(widget))
		|| hasExplicitNativeFallbackAdapter(node, widget));
	if (cacheable) nativeFallbackCache.set(node, { widgets: [...widgets], value });
	return value;
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

function normalizedTextOptions(widget, options) {
	// The V3 STRING path uses customtext as the widget type and does not copy multiline into options.
	if (options.multiline || MULTILINE_NATIVE_WIDGET_TYPES.has(widgetType(widget))) return { ...options, multiline: true };
	return options;
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

function resolveNodeDisplayTitle(node, fallback = "Control") {
	const title = typeof node?.getTitle === "function" ? node.getTitle() : node?.title;
	const value = String(title || "").trim();
	return value || fallback;
}

function nativeWidgetLabel(node, widget) {
	const label = String(widget?.label || widget?.name || "Control").trim();
	const normalized = label.toLocaleLowerCase().replace(/[:：]\s*$/, "");
	const title = resolveNodeDisplayTitle(node, "");
	return title && GENERIC_NATIVE_WIDGET_LABELS.has(normalized) ? title : label;
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

function adapterMatches(adapter, context) {
	const matched = adapter.matches(context);
	if (matched && typeof matched.then === "function") throw new TypeError(`Widget control adapter ${adapter.id} matches() must be synchronous`);
	return Boolean(matched);
}

function findWidgetAdapter(node, widget, { promoted = false, adapterId = null } = {}) {
	const context = { node, widget, promoted };
	return adapters.find((candidate) => (!adapterId || candidate.id === adapterId) && adapterMatches(candidate, context)) || null;
}

export function adaptWidgetControl(node, widget, { promoted = false, adapterId = null } = {}) {
	const context = { node, widget, promoted };
	const adapter = findWidgetAdapter(node, widget, { promoted, adapterId });
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
	const labelPolicy = described.labelPolicy || "widget";
	if (!LABEL_POLICIES.has(labelPolicy)) throw new TypeError(`Widget control adapter ${adapter.id} returned an invalid labelPolicy`);
	const controlId = controlIdForWidget(node, widget, described.controlId);
	if (!controlId) throw new TypeError(`Widget control adapter ${adapter.id} returned an empty controlId`);
	const rawOptions = described.options || widget.options || {};
	const options = kind === "choice" ? normalizedChoiceOptions(rawOptions, context) : kind === "text" ? normalizedTextOptions(widget, rawOptions) : rawOptions;
	const availabilitySource = typeof described.getAvailability === "function" ? described.getAvailability(context) : described.availability;
	const availability = normalizeAvailability(availabilitySource, { kind, currentValue: value, options });
	const presetHooks = ["readPresetValue", "validatePresetValue", "applyPresetValue"]
		.map((hook) => typeof described[hook] === "function" || typeof adapter[hook] === "function");
	if (presetHooks.some(Boolean) && !presetHooks.every(Boolean)) throw new TypeError(`Widget control adapter ${adapter.id} must provide the complete preset codec`);
	const hasCustomPresetCodec = presetHooks.every(Boolean);
	const supportsSeedBehavior = kind === "seed" && hasCustomPresetCodec && (typeof described.setSeedBehavior === "function" || typeof adapter.setSeedBehavior === "function");
	const seedBehaviors = kind === "seed" ? optionValues({ values: described.seedBehaviors || options.behaviors || [] }).map(String) : [];
	const fallbackLabel = String(described.label || widget.label || widget.name || "Control").trim();
	return {
		adapterId: adapter.id,
		controlId,
		label: labelPolicy === "node-title" ? resolveNodeDisplayTitle(node, fallbackLabel) : fallbackLabel,
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
		subscribeValueChange(listener) {
			const subscribe = described.subscribeValueChange || adapter.subscribeValueChange;
			if (typeof subscribe !== "function") return () => {};
			const unsubscribe = subscribe(listener, context);
			return typeof unsubscribe === "function" ? unsubscribe : () => {};
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

function assertUniqueControlIds(controls) {
	const owners = new Map();
	for (const control of controls) {
		const previous = owners.get(control.controlId);
		if (previous) throw new TypeError(`Duplicate widget controlId ${control.controlId} from adapters ${previous.adapterId} and ${control.adapterId}`);
		owners.set(control.controlId, control);
	}
}

export function listAdaptedWidgetControls(node, { promoted = false, adapterId = null } = {}) {
	const widgets = node?.widgets || [];
	const controls = widgets
		.map((widget) => adaptWidgetControl(node, widget, { promoted, adapterId }))
		.filter((adapted) => adapted && (!promoted || isPromotedWidget(node, adapted.widget)));
	assertUniqueControlIds(controls);
	cacheAdaptedWidgetIndex(node, widgets, controls, { promoted, adapterId });
	return controls;
}

function adaptedIndexKey({ promoted = false, adapterId = null } = {}) { return `${promoted ? "promoted" : "native"}:${adapterId || "*"}`; }
function sameWidgetSnapshot(left, right) { return left.length === right.length && left.every((widget, index) => widget === right[index]); }
function addLegacyControlAlias(aliases, alias, widget) {
	if (!alias) return;
	const key = String(alias);
	if (!aliases.has(key)) aliases.set(key, widget);
	else if (aliases.get(key) !== widget) aliases.set(key, null);
}

function legacyControlAliases(node, widget) {
	const identity = promotedWidgetIdentity(node, widget);
	if (!identity) return [];
	return [...new Set([widget.name, identity.sourceWidgetName].filter(Boolean).map(String))];
}

function cacheAdaptedWidgetIndex(node, widgets, controls, options) {
	if (!node || (typeof node !== "object" && typeof node !== "function")) return;
	let indexes = adaptedWidgetIndexes.get(node);
	if (!indexes) { indexes = new Map(); adaptedWidgetIndexes.set(node, indexes); }
	const byControlId = new Map(); const byLegacyControlId = new Map();
	for (const control of controls) {
		if (!byControlId.has(control.controlId)) byControlId.set(control.controlId, control.widget);
		for (const alias of legacyControlAliases(node, control.widget)) addLegacyControlAlias(byLegacyControlId, alias, control.widget);
	}
	indexes.set(adaptedIndexKey(options), { adapterRevision, widgets: [...widgets], byControlId, byLegacyControlId });
}

export function parsePromotedControlId(controlId) {
	const key = String(controlId ?? "");
	if (!key.startsWith("promoted:")) return null;
	try {
		const tuple = JSON.parse(key.slice("promoted:".length));
		return Array.isArray(tuple) && tuple.length >= 2 ? tuple : null;
	} catch {
		return null;
	}
}

function findAdaptedControl(node, controls, controlId, promoted) {
	const key = String(controlId);
	const exact = controls.find((candidate) => candidate.controlId === key);
	if (exact || !promoted) return exact || null;
	const legacy = controls.filter((candidate) => legacyControlAliases(node, candidate.widget).includes(key));
	if (legacy.length === 1) return legacy[0];
	// 子图内部重建会重排节点 Id，持久化元组中的 sourceNodeId 随之失效；
	// 此时按来源身份的唯一匹配回退解析，多个候选同名时宁可保持失效也不猜。
	const tuple = parsePromotedControlId(key);
	if (!tuple || typeof tuple[1] !== "string" || !tuple[1]) return null;
	const identityOf = (candidate) => promotedWidgetIdentity(node, candidate.widget);
	const byFullSource = controls.filter((candidate) => {
		const identity = identityOf(candidate);
		return identity && String(identity.sourceWidgetName) === tuple[1]
			&& String(identity.disambiguatingSourceNodeId ?? null) === String(tuple[2] ?? null);
	});
	if (byFullSource.length === 1) return byFullSource[0];
	const bySourceName = controls.filter((candidate) => identityOf(candidate)?.sourceWidgetName === tuple[1]);
	return bySourceName.length === 1 ? bySourceName[0] : null;
}

/** Resolve one bound control without rebuilding descriptors for every sibling widget. */
export function resolveAdaptedWidgetControl(node, controlId, { promoted = false, adapterId = null } = {}) {
	if (!node || (typeof node !== "object" && typeof node !== "function")) return null;
	const widgets = node?.widgets || [];
	const options = { promoted, adapterId };
	const key = String(controlId);
	const cached = adaptedWidgetIndexes.get(node)?.get(adaptedIndexKey(options));
	if (cached?.adapterRevision === adapterRevision && sameWidgetSnapshot(cached.widgets, widgets)) {
		const widget = cached.byControlId.get(key) || (promoted ? cached.byLegacyControlId.get(key) : null);
		if (!widget) {
			if (!promoted) return null;
			const fallbackKey = uniquePromotedFallbackKey(cached.byControlId.keys(), key);
			const fallbackWidget = fallbackKey ? cached.byControlId.get(fallbackKey) : null;
			return fallbackWidget ? adaptWidgetControl(node, fallbackWidget, options) : null;
		}
		const adapted = adaptWidgetControl(node, widget, options);
		if (adapted?.controlId === key || (promoted && adapted?.widget === widget)) return adapted;
	}
	return findAdaptedControl(node, listAdaptedWidgetControls(node, options), key, promoted);
}

/** 在已缓存的 canonical controlId 键上按来源名唯一匹配，避免为回退解析重建全部描述符。 */
function uniquePromotedFallbackKey(controlIds, requestedKey) {
	const tuple = parsePromotedControlId(requestedKey);
	if (!tuple || typeof tuple[1] !== "string" || !tuple[1]) return null;
	const parsed = [];
	for (const id of controlIds) {
		const candidate = parsePromotedControlId(id);
		if (candidate) parsed.push([id, candidate]);
	}
	const fullSource = parsed.filter(([, candidate]) => candidate[1] === tuple[1] && String(candidate[2] ?? null) === String(tuple[2] ?? null));
	if (fullSource.length === 1) return fullSource[0][0];
	const sourceName = parsed.filter(([, candidate]) => candidate[1] === tuple[1]);
	return sourceName.length === 1 ? sourceName[0][0] : null;
}

export function invalidateWidgetControlAdapterCache(node = null) {
	if (node) { adaptedWidgetIndexes.delete(node); definitionOwnerCache.delete(node); nativeFallbackCache.delete(node); }
	else { adaptedWidgetIndexes = new WeakMap(); definitionOwnerCache = new WeakMap(); nativeFallbackCache = new WeakMap(); }
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
	if (!isPromotedWidget(node, widget)) return { node, widget };
	let nodeCache = definitionOwnerCache.get(node);
	if (!nodeCache) { nodeCache = new WeakMap(); definitionOwnerCache.set(node, nodeCache); }
	const cached = nodeCache.get(widget);
	const identity = promotedWidgetIdentity(node, widget);
	const source = identity ? [String(identity.sourceNodeId), identity.sourceWidgetName, String(identity.disambiguatingSourceNodeId ?? "")] : null;
	if (cached && cached.source && source && cached.source.every((value, index) => value === source[index])) return cached.owner;
	const owner = resolvePromotedDefinitionOwner(node, widget);
	if (source) nodeCache.set(widget, { source, owner });
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

// 侧边栏资产列表实时拉取，可能包含页面加载后才加入 input/ 的文件；前端按
// “值必须在 options.values 里”判定缺图并把匹配不到的值显示为占位符。
// Nodes 2.0 进入/退出子图时还会从内部 widget 重建宿主投影，因此这里同时
// 同步内部值，避免重建后用空默认值覆盖侧边栏刚写入的媒体引用。
function prepareImageComboValue(node, widget, value) {
	if (typeof value !== "string") return;
	const owner = resolveWidgetDefinitionOwner(node, widget);
	const targets = new Set([widget, owner.widget]);
	if (value) {
		for (const target of targets) {
			const values = target?.options?.values;
			if (Array.isArray(values) && !values.includes(value)) values.push(value);
		}
	}
	if (owner.widget && owner.widget !== widget) owner.widget.value = value;
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
			getValue: () => String(widget.value ?? ""),
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
			getValue: () => widget.value,
			value: widget.value,
				options: {
					values,
					image_folder: imageOptions.image_folder || "input",
					upload_subfolder: imageOptions.upload_subfolder || "",
				},
			availability: values.length ? undefined : { state: "empty", reason: "no-options" },
			setValue(next) {
				prepareImageComboValue(node, widget, next);
				return setNativeWidgetValue(node, widget, next);
			},
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
			getValue: () => widget.value || { beforeImages: [], afterImages: [] },
			value: widget.value || { beforeImages: [], afterImages: [] },
			presettable: false,
			columnSpan: 12,
			rowSpan: 36,
			minRowSpan: 24,
		};
	},
});

function controlIdForWidget(node, widget, requestedControlId) {
	const identity = promotedWidgetIdentity(node, widget);
	if (!identity) return String(requestedControlId || widget?.name || "");
	const requested = requestedControlId == null ? "" : String(requestedControlId);
	if (!requested || requested === String(widget.name || "") || requested === String(identity.sourceWidgetName)) {
		return `promoted:${JSON.stringify([
			String(identity.sourceNodeId),
			String(identity.sourceWidgetName),
			identity.disambiguatingSourceNodeId == null ? null : String(identity.disambiguatingSourceNodeId),
		])}`;
	}
	return requested;
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
		// 新协议下宿主投影不带 linkedWidgets，宿主上也没有 control_after_generate，
		// 必须沿提升链到内部真实 widget 上检测种子行为控件。
		const owner = resolveWidgetDefinitionOwner(node, widget);
		const seedMode = numericDomain !== "float" ? linkedSeedModeWidget(owner.node, owner.widget) : null;
		const kind = seedMode ? "seed" : definition.kind;
		const options = { ...(widget.options || {}) };
		if (kind === "numeric" || kind === "seed") options.step = realWidgetStep(widget.options);
		const label = nativeWidgetLabel(node, widget);
		return {
			controlId: widget.name,
			label,
			getValue: () => widget.value,
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
