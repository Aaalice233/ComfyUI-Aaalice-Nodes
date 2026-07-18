/** Extensible registry that projects node controls without owning their values. */

import { displayName, ensureParameters, isParameterPanel, isTunable, notifyParameterChanged } from "./param_model.js";
import { recommendedControlRowSpan } from "./dashboard_sizing.js";
import { controlValueType, listAdaptedWidgetControls } from "./widget_control_adapters.js";

export const HOST_ID_PROPERTY = "aaaliceControlHostId";

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
}

export const controlProviders = new ProviderRegistry();

controlProviders.register({
	id: "aaalice-parameter",
	supportsNode: (node) => isParameterPanel(node),
	list(node) {
		const hostId = ensureHostId(node);
		return ensureParameters(node).filter(isTunable).map((parameter) => ({
			label: displayName(parameter, parameter.id),
			binding: { provider: this.id, hostId, controlId: parameter.id, valueType: controlValueType(parameter.value) || (Array.isArray(parameter.value) ? "string-list" : "reference") },
			rowSpan: recommendedControlRowSpan({ value: parameter.value, options: parameter.config, paramType: parameter.param_type }),
		}));
	},
	resolve(node, binding) {
		const parameter = ensureParameters(node).find((item) => item.id === binding.controlId && isTunable(item));
		if (!parameter) return { status: "missing", node };
		const currentType = controlValueType(parameter.value) || (Array.isArray(parameter.value) ? "string-list" : "reference");
		if (currentType !== binding.valueType) return { status: "incompatible", node, currentType };
		return {
			status: "ok", family: "aaalice", controlId: binding.controlId, node, control: parameter, label: displayName(parameter, parameter.id), value: parameter.value,
			options: parameter.config || {},
			setValue(next, { transaction = true, transient = false, workspaceRedraw = true } = {}) {
				const apply = () => {
					parameter.value = next;
					if (transient) { node._aaaliceParameterRedraw?.(); node.setDirtyCanvas?.(true, true); }
					else notifyParameterChanged(node, { structure: false, workspaceRedraw });
				};
				return transaction ? graphTransaction(node, apply) : apply();
			},
			flushValue() { notifyParameterChanged(node, { structure: false }); },
			setSeedLocked(locked) {
				return graphTransaction(node, () => {
					parameter.config ||= {}; parameter.config.control_after_generate = locked ? "fixed" : "randomize";
					notifyParameterChanged(node, { structure: false });
				});
			},
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
			rowSpan: recommendedControlRowSpan({ value: adapted.value, options: adapted.options, paramType: adapted.kind || adapted.control?.param_type || adapted.control?.type }),
		}));
	},
	resolve(node, binding) {
		const adapted = listAdaptedWidgetControls(node, { promoted, adapterId: binding.adapterId || null })
			.find((candidate) => candidate.controlId === binding.controlId);
		if (!adapted) return { status: "missing", node };
		const currentType = adapted.valueType;
		if (currentType !== binding.valueType) return { status: "incompatible", node, currentType };
		return {
			status: "ok", family: "comfy", kind: adapted.kind, controlId: adapted.controlId, node, control: adapted.control, label: adapted.label, value: adapted.value, options: adapted.options, availability: adapted.availability,
			setValue(next, { transaction = true } = {}) {
				const apply = () => { adapted.setValue(next); node.setDirtyCanvas?.(true, true); };
				return transaction ? graphTransaction(node, apply) : apply();
			},
			setSeedLocked(locked) {
				return graphTransaction(node, () => { adapted.setSeedLocked(locked); node.setDirtyCanvas?.(true, true); });
			},
		};
	},
});

controlProviders.register(widgetProvider("subgraph-widget", true));
controlProviders.register(widgetProvider("generic-widget", false));
