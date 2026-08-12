/** Extensible registry that projects node controls without owning their values. */

import { listNativeOutputControls, resolveNativeOutputControl } from "./native_output_controls.js";
import { relocateOrphanedBinding } from "./binding_relocation.js";
import { DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, dashboardContentRowSpan, normalizeDashboardColumnSpan, normalizeDashboardRowSpan, recommendedControlRowSpan } from "./dashboard_sizing.js";
import { SEED_AFTER_GENERATE_MODES } from "./seed_preset.js";
import { adaptWidgetControl, listAdaptedWidgetControls, resolveAdaptedWidgetControl } from "./widget_control_adapters.js";
import { applyQuickGroupManagerPreset, isQuickGroupManager, quickGroupManagerPresetSnapshot, quickGroupManagerSnapshot, validateQuickGroupManagerPreset } from "./quick_group_manager_runtime.js";

export const HOST_ID_PROPERTY = "aaaliceControlHostId";

const QUICK_GROUP_MANAGER_CARD_PADDING = 15;
const QUICK_GROUP_MANAGER_HEADER_HEIGHT = 32;
const QUICK_GROUP_MANAGER_LIST_PADDING = 2;
const QUICK_GROUP_MANAGER_ROW_HEIGHT = 39;
const QUICK_GROUP_MANAGER_ROW_GAP = 4;
const QUICK_GROUP_MANAGER_EMPTY_HEIGHT = 70;

function quickGroupManagerRowSpan(snapshot) {
	const count = Array.isArray(snapshot?.visibleGroups) ? snapshot.visibleGroups.length : 0;
	const listHeight = count
		? (count * QUICK_GROUP_MANAGER_ROW_HEIGHT) + (Math.max(0, count - 1) * QUICK_GROUP_MANAGER_ROW_GAP) + QUICK_GROUP_MANAGER_LIST_PADDING
		: QUICK_GROUP_MANAGER_EMPTY_HEIGHT + QUICK_GROUP_MANAGER_LIST_PADDING;
	return dashboardContentRowSpan(QUICK_GROUP_MANAGER_CARD_PADDING + QUICK_GROUP_MANAGER_HEADER_HEIGHT + listHeight, { minimum: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN });
}

export function ensureHostId(node) {
	node.properties ||= {};
	if (!node.properties[HOST_ID_PROPERTY]) {
		node.properties[HOST_ID_PROPERTY] = `host_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
	}
	return node.properties[HOST_ID_PROPERTY];
}

export function ensureUniqueHostId(node) {
	const hostId = ensureHostId(node);
	const nodes = node?.graph?._nodes || [];
	const index = nodes.indexOf(node);
	if (index < 0 || !nodes.slice(0, index).some((candidate) => candidate?.properties?.[HOST_ID_PROPERTY] === hostId)) return hostId;
	delete node.properties[HOST_ID_PROPERTY];
	return ensureHostId(node);
}

export function repairDuplicateHostIds(nodes) {
	const seen = new Set();
	const repaired = [];
	for (const node of nodes || []) {
		const hostId = node?.properties?.[HOST_ID_PROPERTY];
		if (!hostId) continue;
		if (!seen.has(hostId)) { seen.add(hostId); continue; }
		delete node.properties[HOST_ID_PROPERTY];
		const next = ensureHostId(node);
		seen.add(next);
		repaired.push({ node, previous: hostId, current: next });
	}
	return repaired;
}

export function createControlHostIndex(nodes = []) {
	const index = new Map();
	for (const node of nodes) {
		const hostId = node?.properties?.[HOST_ID_PROPERTY];
		if (hostId && !index.has(hostId)) index.set(hostId, node);
	}
	return index;
}

function findControlHost(nodes, hostId) {
	return nodes instanceof Map
		? nodes.get(hostId)
		: (nodes || []).find((candidate) => candidate?.properties?.[HOST_ID_PROPERTY] === hostId);
}

function graphTransaction(node, callback) {
	const graph = node?.graph;
	graph?.beforeChange?.();
	try { return callback(); }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); }
}

function validatePresetPayload(entry, { valueType, options = {}, numericDomain = null } = {}) {
	if (!entry || entry.valueType !== valueType) return "type-mismatch";
	const value = entry.payload;
	if (valueType === "number") {
		if (typeof value !== "number" || !Number.isFinite(value)) return "invalid-number";
		if (numericDomain === "integer" && !Number.isInteger(value)) return "invalid-integer";
		if (Number.isFinite(Number(options.min)) && value < Number(options.min)) return "below-minimum";
		if (Number.isFinite(Number(options.max)) && value > Number(options.max)) return "above-maximum";
	}
	if (valueType === "boolean" && typeof value !== "boolean") return "invalid-boolean";
	if (valueType === "string" && typeof value !== "string") return "invalid-string";
	if (valueType === "string-list" && !Array.isArray(value)) return "invalid-list";
	if (valueType === "reference" && value !== null && typeof value !== "object") return "invalid-reference";
	const choices = Array.isArray(options.values) ? options.values : Array.isArray(options.options) ? options.options : null;
	if (valueType === "string" && choices?.length && !choices.some((choice) => String(typeof choice === "object" ? choice.value ?? choice.label : choice) === value)) return "missing-option";
	return true;
}

function quickGroupManagerTitle(node) {
	const title = typeof node?.getTitle === "function" ? node.getTitle() : node?.title;
	return String(title || node?.type || "⚡ Quick Group Manager");
}

function sameSource(left, right) {
	return Boolean(left?.provider && left.provider === right?.provider && left.hostId === right?.hostId && (left.scopeId || "") === (right?.scopeId || ""));
}

class ProviderRegistry {
	constructor() { this.providers = []; }
	register(provider) { this.providers.push(provider); return () => { this.providers = this.providers.filter((item) => item !== provider); }; }
	providerForNode(node) { return this.providers.find((provider) => provider.supportsNode(node)) || null; }
	provider(binding) { return this.providers.find((provider) => provider.id === binding?.provider) || null; }
	list(node) {
		if (!node || (typeof node !== "object" && typeof node !== "function")) return [];
		for (const provider of this.providers) {
			const controls = provider.list?.(node);
			if (Array.isArray(controls) && controls.length) return controls;
		}
		return [];
	}
	resolve(binding, nodes) {
		const provider = this.provider(binding);
		if (!provider) return { status: "missing" };
		const node = findControlHost(nodes, binding.hostId);
		if (node) return provider.resolve(node, binding);
		return relocateOrphanedBinding({ provider, binding, nodes, hostIdOf: (candidate) => candidate?.properties?.[HOST_ID_PROPERTY] });
	}
	resolveGroup(source, nodes) {
		const provider = this.provider(source);
		const node = findControlHost(nodes, source?.hostId);
		if (!provider?.resolveGroup || !node) return { status: "missing" };
		return provider.resolveGroup(node, source);
	}
	sourceSnapshot(source, nodes) {
		const provider = this.provider(source);
		const node = findControlHost(nodes, source?.hostId);
		if (!provider || !node) return { status: "missing-source", source, controls: [], reason: "Source provider or host is missing" };
		try {
			const group = provider.resolveGroup ? provider.resolveGroup(node, source) : { status: "ok", label: "" };
			if (group.status !== "ok") return { status: group.status === "missing" ? "missing-source" : "error", source, controls: [], label: "", reason: group.reason || "Source scope is unavailable" };
			const controls = provider.list(node);
			const listedGroup = controls.find((control) => control.sourceGroup?.source && sameSource(control.sourceGroup.source, source))?.sourceGroup;
			return { status: "ok", source, controls, label: group.label || listedGroup?.name || "", reason: "" };
		} catch (error) {
			return { status: "error", source, controls: [], reason: error?.message || String(error) };
		}
	}
}

export const controlProviders = new ProviderRegistry();

controlProviders.register({
	id: "quick-group-manager",
	supportsNode: (node) => isQuickGroupManager(node),
	list(node) {
		if (!isQuickGroupManager(node)) return [];
		const hostId = ensureUniqueHostId(node);
		return [{
			label: quickGroupManagerTitle(node),
			binding: { provider: this.id, hostId, controlId: "manager", valueType: "quick-group-manager" },
			columnSpan: 12,
			rowSpan: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
		}];
	},
	resolve(node, binding) {
		if (binding.controlId !== "manager" || binding.valueType !== "quick-group-manager") return { status: "missing", node };
		const snapshot = quickGroupManagerSnapshot(node);
		return {
			status: "ok", family: "comfy", kind: "quick-group-manager", controlId: "manager", node, control: node,
			label: quickGroupManagerTitle(node), value: snapshot.state, options: { manager: node },
			layoutProjection: { rowSpan: quickGroupManagerRowSpan(snapshot) },
			presettable: true, minRowSpan: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
			readPresetValue() { return quickGroupManagerPresetSnapshot(node); },
			validatePresetValue(entry) {
				if (!entry || entry.valueType !== binding.valueType) return "type-mismatch";
				return validateQuickGroupManagerPreset(entry.payload);
			},
			applyPresetValue(entry, { transaction = true } = {}) { return applyQuickGroupManagerPreset(node, entry.payload, { transaction }); },
			setValue(next) { return applyQuickGroupManagerPreset(node, next); },
			flushValue() {},
		};
	},
});

controlProviders.register({
	id: "comfy-output",
	supportsNode: (node) => listNativeOutputControls(node).length > 0,
	list(node) {
		const hostId = ensureUniqueHostId(node);
		return listNativeOutputControls(node).map((control) => ({
			label: control.label,
			availability: control.availability,
			binding: { provider: this.id, hostId, controlId: control.controlId, valueType: control.valueType },
			columnSpan: normalizeDashboardColumnSpan(control.columnSpan),
			rowSpan: normalizeDashboardRowSpan(control.rowSpan),
		}));
	},
	resolve(node, binding) {
		const control = resolveNativeOutputControl(node, binding.controlId);
		if (!control) return { status: "missing", node };
		if (control.valueType !== binding.valueType) return { status: "incompatible", node, currentType: control.valueType };
		return {
			status: "ok",
			family: "comfy",
			kind: control.kind,
			controlId: control.controlId,
			node,
			control: control.control,
			label: control.label,
			value: control.value,
			options: control.options,
			availability: control.availability,
			presettable: false,
			minRowSpan: control.minRowSpan,
		};
	},
});

const widgetProvider = (id, promoted) => ({
	id,
	supportsNode(node) {
		const subgraph = Boolean(node?.isSubgraphNode?.() || node?.subgraph);
		return promoted ? subgraph && listAdaptedWidgetControls(node, { promoted: true }).length > 0
			: !subgraph && listAdaptedWidgetControls(node).length > 0;
	},
	list(node) {
		const subgraph = Boolean(node?.isSubgraphNode?.() || node?.subgraph);
		if (promoted !== subgraph) return [];
		const hostId = ensureUniqueHostId(node);
		return listAdaptedWidgetControls(node, { promoted }).map((adapted) => ({
			label: adapted.label,
			availability: adapted.availability,
			binding: { provider: id, hostId, controlId: adapted.controlId, valueType: adapted.valueType, adapterId: adapted.adapterId },
			columnSpan: normalizeDashboardColumnSpan(adapted.columnSpan),
			rowSpan: normalizeDashboardRowSpan(adapted.rowSpan || recommendedControlRowSpan({ value: adapted.value, options: adapted.options, paramType: adapted.kind || adapted.control?.type })),
		}));
	},
	resolve(node, binding) {
		const requestedAdapterId = binding.adapterId || null;
		let adapted = resolveAdaptedWidgetControl(node, binding.controlId, { promoted, adapterId: requestedAdapterId });
		if (binding.adapterId === "comfy-native-widget") {
			const imageUpgrade = adapted?.widget
				? adaptWidgetControl(node, adapted.widget, { promoted, adapterId: "comfy-image-combo" })
				: null;
			if (imageUpgrade && imageUpgrade.valueType === binding.valueType) adapted = imageUpgrade;
		}
		if (!adapted) return { status: "missing", node };
		const currentType = adapted.valueType;
		if (currentType !== binding.valueType) return { status: "incompatible", node, currentType };
		return {
			status: "ok", family: "comfy", kind: adapted.kind, numericDomain: adapted.numericDomain, controlId: adapted.controlId, node, widget: adapted.widget, control: adapted.control, label: adapted.label, value: adapted.value, options: adapted.options, availability: adapted.availability,
			presettable: adapted.presettable, columnSpan: adapted.columnSpan, rowSpan: adapted.rowSpan, minRowSpan: adapted.minRowSpan, linkable: adapted.linkable, supportsSeedBehavior: adapted.supportsSeedBehavior, seedBehaviors: adapted.seedBehaviors, hasCustomPresetCodec: adapted.hasCustomPresetCodec,
			readPresetValue() { return structuredClone(adapted.readPresetValue ? adapted.readPresetValue() : adapted.value); },
			subscribeValueChange(listener) { return adapted.subscribeValueChange?.(listener) || (() => {}); },
			validatePresetValue(entry) {
				if (!entry || entry.valueType !== binding.valueType) return "type-mismatch";
				if (adapted.hasCustomPresetCodec) return adapted.validatePresetValue?.(entry) ?? true;
				return validatePresetPayload(entry, { valueType: binding.valueType, options: adapted.options, numericDomain: adapted.numericDomain });
			},
			validateLinkedValue(next) { return adapted.validateLinkedValue?.(next) ?? true; },
			applyPresetValue(entry, options = {}) {
				const apply = () => adapted.applyPresetValue ? adapted.applyPresetValue(structuredClone(entry)) : adapted.setValue(structuredClone(entry.payload));
				return options.transaction === false ? apply() : graphTransaction(node, apply);
			},
			setValue(next, { transaction = true, workspaceRedraw = true } = {}) {
				const apply = () => { const result = adapted.setValue(next); if (workspaceRedraw) node.setDirtyCanvas?.(true, true); return result; };
				return transaction ? graphTransaction(node, apply) : apply();
			},
			setSeedBehavior(behavior, { transaction = true, workspaceRedraw = true } = {}) {
				if (!SEED_AFTER_GENERATE_MODES.includes(behavior)) throw new TypeError(`Invalid seed behavior: ${behavior}`);
				const apply = () => { const result = adapted.setSeedBehavior(behavior); if (workspaceRedraw) node.setDirtyCanvas?.(true, true); return result; };
				return transaction ? graphTransaction(node, apply) : apply();
			},
		};
	},
});

controlProviders.register(widgetProvider("subgraph-widget", true));
controlProviders.register(widgetProvider("generic-widget", false));
