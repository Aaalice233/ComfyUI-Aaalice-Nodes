/** Extensible registry that projects node controls without owning their values. */

import { displayName, ensureParameters, isParameterPanel, isTunable, notifyParameterChanged } from "./param_model.js";
import { partitionParameterSections } from "./parameter_sections.js";
import { listNativeOutputControls, resolveNativeOutputControl } from "./native_output_controls.js";
import { DASHBOARD_PANEL_CONTROL_ROW_SPAN, dashboardContentRowSpan, normalizeDashboardColumnSpan, normalizeDashboardRowSpan, recommendedControlRowSpan } from "./dashboard_sizing.js";
import { createSeedPresetPayload, decodeSeedPresetEntry, SEED_AFTER_GENERATE_MODES, validateSeedPresetEntry } from "./seed_preset.js";
import { controlValueType, listAdaptedWidgetControls } from "./widget_control_adapters.js";
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
	return dashboardContentRowSpan(QUICK_GROUP_MANAGER_CARD_PADDING + QUICK_GROUP_MANAGER_HEADER_HEIGHT + listHeight, { minimum: DASHBOARD_PANEL_CONTROL_ROW_SPAN });
}

export function ensureHostId(node) {
	node.properties ||= {};
	if (!node.properties[HOST_ID_PROPERTY]) {
		node.properties[HOST_ID_PROPERTY] = `host_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
	}
	return node.properties[HOST_ID_PROPERTY];
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

function graphTransaction(node, callback) {
	const graph = node?.graph;
	graph?.beforeChange?.();
	try { return callback(); }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); }
}

function validatePresetPayload(entry, { valueType, options = {} } = {}) {
	if (!entry || entry.valueType !== valueType) return "type-mismatch";
	const value = entry.payload;
	if (valueType === "number") {
		if (typeof value !== "number" || !Number.isFinite(value)) return "invalid-number";
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

function parameterPanelTitle(node) {
	return String(node?.title || node?.type || node?.comfyClass || "Parameter Panel");
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
	list(node) { return this.providerForNode(node)?.list(node) || []; }
	resolve(binding, nodes) {
		const provider = this.provider(binding);
		const node = (nodes || []).find((candidate) => candidate?.properties?.[HOST_ID_PROPERTY] === binding.hostId);
		if (!provider || !node) return { status: "missing" };
		return provider.resolve(node, binding);
	}
	resolveGroup(source, nodes) {
		const provider = this.provider(source);
		const node = (nodes || []).find((candidate) => candidate?.properties?.[HOST_ID_PROPERTY] === source?.hostId);
		if (!provider?.resolveGroup || !node) return { status: "missing" };
		return provider.resolveGroup(node, source);
	}
	sourceSnapshot(source, nodes) {
		const provider = this.provider(source);
		const node = (nodes || []).find((candidate) => candidate?.properties?.[HOST_ID_PROPERTY] === source?.hostId);
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
	id: "aaalice-parameter",
	supportsNode: (node) => isParameterPanel(node),
	list(node) {
		const hostId = ensureHostId(node);
		const sections = partitionParameterSections(ensureParameters(node))
			.map((section) => ({ ...section, parameters: section.parameters.filter(isTunable) }))
			.filter((section) => section.parameters.length);
		const sectioned = sections.some((section) => section.separator);
		return sections.flatMap((section) => {
			const source = {
				provider: this.id,
				hostId,
				...(section.separator ? { scopeId: `separator:${section.separator.id}` } : {}),
			};
			const sourceGroup = {
				source,
				name: section.separator ? displayName(section.separator, section.separator.id) : parameterPanelTitle(node),
				tone: "blue",
				forceGroup: sectioned,
			};
			return section.parameters.map((parameter) => ({
				label: displayName(parameter, parameter.id),
				binding: { provider: this.id, hostId, controlId: parameter.id, valueType: controlValueType(parameter.value) || (Array.isArray(parameter.value) ? "string-list" : "reference") },
				sourceGroup,
				rowSpan: recommendedControlRowSpan({ value: parameter.value, options: parameter.config, paramType: parameter.param_type }),
			}));
		});
	},
	resolveGroup(node, source) {
		if (!source.scopeId) return { status: "ok", label: parameterPanelTitle(node) };
		if (!source.scopeId.startsWith("separator:")) return { status: "missing", node };
		const separatorId = source.scopeId.slice("separator:".length);
		const separator = ensureParameters(node).find((item) => item.id === separatorId && item.param_type === "separator");
		return separator ? { status: "ok", label: displayName(separator, separator.id) } : { status: "missing", node };
	},
	resolve(node, binding) {
		const parameter = ensureParameters(node).find((item) => item.id === binding.controlId && isTunable(item));
		if (!parameter) return { status: "missing", node };
		const currentType = controlValueType(parameter.value) || (Array.isArray(parameter.value) ? "string-list" : "reference");
		if (currentType !== binding.valueType) return { status: "incompatible", node, currentType };
		const seed = parameter.param_type === "seed";
		return {
			status: "ok", family: "aaalice", kind: seed ? "seed" : null, controlId: binding.controlId, node, control: parameter, label: displayName(parameter, parameter.id), value: parameter.value,
			options: parameter.config || {},
			readPresetValue() { return seed ? createSeedPresetPayload(parameter.value, parameter.config?.control_after_generate) : structuredClone(parameter.value); },
			validatePresetValue(entry) {
				return seed ? validateSeedPresetEntry(entry, parameter.config || {}) : validatePresetPayload(entry, { valueType: binding.valueType, options: parameter.config || {} });
			},
			applyPresetValue(entry, { transaction = true, workspaceRedraw = true } = {}) {
				if (!seed) return this.setValue(structuredClone(entry.payload), { transaction, workspaceRedraw });
				const decoded = decodeSeedPresetEntry(entry, parameter.config?.control_after_generate || "randomize");
				const apply = () => {
					parameter.value = decoded.value; parameter.config ||= {}; parameter.config.control_after_generate = decoded.behavior;
					notifyParameterChanged(node, { structure: false, workspaceRedraw });
				};
				return transaction ? graphTransaction(node, apply) : apply();
			},
			setValue(next, { transaction = true, transient = false, workspaceRedraw = true } = {}) {
				const apply = () => {
					parameter.value = next;
					if (transient) { node._aaaliceParameterRedraw?.(); node.setDirtyCanvas?.(true, true); }
					else notifyParameterChanged(node, { structure: false, workspaceRedraw });
				};
				return transaction ? graphTransaction(node, apply) : apply();
			},
			flushValue() { notifyParameterChanged(node, { structure: false }); },
			setSeedBehavior(behavior) {
				if (!SEED_AFTER_GENERATE_MODES.includes(behavior)) throw new TypeError(`Invalid seed behavior: ${behavior}`);
				return graphTransaction(node, () => {
					parameter.config ||= {}; parameter.config.control_after_generate = behavior;
					notifyParameterChanged(node, { structure: false });
				});
			},
		};
	},
});

controlProviders.register({
	id: "quick-group-manager",
	supportsNode: (node) => isQuickGroupManager(node),
	list(node) {
		const hostId = ensureHostId(node);
		return [{
			label: quickGroupManagerTitle(node),
			binding: { provider: this.id, hostId, controlId: "manager", valueType: "quick-group-manager" },
			columnSpan: 12,
			rowSpan: normalizeDashboardRowSpan(DASHBOARD_PANEL_CONTROL_ROW_SPAN),
		}];
	},
	resolve(node, binding) {
		if (binding.controlId !== "manager" || binding.valueType !== "quick-group-manager") return { status: "missing", node };
		const snapshot = quickGroupManagerSnapshot(node);
		return {
			status: "ok", family: "comfy", kind: "quick-group-manager", controlId: "manager", node, control: node,
			label: quickGroupManagerTitle(node), value: snapshot.state, options: { manager: node },
			rowSpan: quickGroupManagerRowSpan(snapshot),
			presettable: true, minRowSpan: DASHBOARD_PANEL_CONTROL_ROW_SPAN,
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
		const hostId = ensureHostId(node);
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
		const subgraph = Boolean(node?.isSubgraphNode?.());
		return promoted ? subgraph && listAdaptedWidgetControls(node, { promoted: true }).length > 0
			: !isParameterPanel(node) && !subgraph && listAdaptedWidgetControls(node).length > 0;
	},
	list(node) {
		const hostId = ensureHostId(node);
		return listAdaptedWidgetControls(node, { promoted }).map((adapted) => ({
			label: adapted.label,
			availability: adapted.availability,
			binding: { provider: id, hostId, controlId: adapted.controlId, valueType: adapted.valueType, adapterId: adapted.adapterId },
			columnSpan: normalizeDashboardColumnSpan(adapted.columnSpan),
			rowSpan: normalizeDashboardRowSpan(adapted.rowSpan || recommendedControlRowSpan({ value: adapted.value, options: adapted.options, paramType: adapted.kind || adapted.control?.param_type || adapted.control?.type })),
		}));
	},
	resolve(node, binding) {
		// 旧看板可能把普通原生适配器固化在 binding 中。允许它升级到后来加入的
		// 专用适配器，否则图像上传 combo 会一直退化成没有缩略图的普通下拉框。
		const adapterId = binding.adapterId === "comfy-native-widget" ? null : binding.adapterId || null;
		const adapted = listAdaptedWidgetControls(node, { promoted, adapterId })
			.find((candidate) => candidate.controlId === binding.controlId);
		if (!adapted) return { status: "missing", node };
		const currentType = adapted.valueType;
		if (currentType !== binding.valueType) return { status: "incompatible", node, currentType };
		return {
			status: "ok", family: "comfy", kind: adapted.kind, controlId: adapted.controlId, node, control: adapted.control, label: adapted.label, value: adapted.value, options: adapted.options, availability: adapted.availability,
			presettable: adapted.presettable, minRowSpan: adapted.minRowSpan,
			readPresetValue() { return structuredClone(adapted.readPresetValue ? adapted.readPresetValue() : adapted.value); },
			validatePresetValue(entry) {
				if (!entry || entry.valueType !== binding.valueType) return "type-mismatch";
				if (adapted.hasCustomPresetCodec) return adapted.validatePresetValue?.(entry) ?? true;
				return validatePresetPayload(entry, { valueType: binding.valueType, options: adapted.options });
			},
			applyPresetValue(entry, options = {}) {
				const apply = () => adapted.applyPresetValue ? adapted.applyPresetValue(structuredClone(entry)) : adapted.setValue(structuredClone(entry.payload));
				return options.transaction === false ? apply() : graphTransaction(node, apply);
			},
			setValue(next, { transaction = true } = {}) {
				const apply = () => { adapted.setValue(next); node.setDirtyCanvas?.(true, true); };
				return transaction ? graphTransaction(node, apply) : apply();
			},
			setSeedBehavior(behavior) {
				if (!SEED_AFTER_GENERATE_MODES.includes(behavior)) throw new TypeError(`Invalid seed behavior: ${behavior}`);
				return graphTransaction(node, () => { adapted.setSeedBehavior(behavior); node.setDirtyCanvas?.(true, true); });
			},
		};
	},
});

controlProviders.register(widgetProvider("subgraph-widget", true));
controlProviders.register(widgetProvider("generic-widget", false));
