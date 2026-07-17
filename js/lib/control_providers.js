/** Extensible registry that projects node controls without owning their values. */

import { displayName, ensureParameters, isParameterPanel, isTunable, notifyParameterChanged } from "./param_model.js";
import { recommendedControlRowSpan } from "./dashboard_sizing.js";

export const HOST_ID_PROPERTY = "aaaliceControlHostId";

function valueType(value) {
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "string") return "string";
	return null;
}

function isPromotedWidget(widget) {
	return widget && typeof widget.sourceNodeId !== "undefined" && typeof widget.sourceWidgetName === "string";
}

function compatibleWidget(widget) {
	if (!widget || widget.serialize === false || widget.options?.serialize === false || typeof widget.name !== "string") return false;
	if (["button", "custom", "image", "preview"].includes(String(widget.type || "").toLowerCase())) return false;
	return Boolean(valueType(widget.value));
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
			binding: { provider: this.id, hostId, controlId: parameter.id, valueType: valueType(parameter.value) || (Array.isArray(parameter.value) ? "string-list" : "reference") },
			rowSpan: recommendedControlRowSpan({ value: parameter.value, options: parameter.config, paramType: parameter.param_type }),
		}));
	},
	resolve(node, binding) {
		const parameter = ensureParameters(node).find((item) => item.id === binding.controlId && isTunable(item));
		if (!parameter) return { status: "missing", node };
		const currentType = valueType(parameter.value) || (Array.isArray(parameter.value) ? "string-list" : "reference");
		if (currentType !== binding.valueType) return { status: "incompatible", node, currentType };
		return {
			status: "ok", node, control: parameter, label: displayName(parameter, parameter.id), value: parameter.value,
			options: parameter.config || {},
			setValue(next, { transaction = true, transient = false } = {}) {
				const apply = () => {
					parameter.value = next;
					if (transient) { node._aaaliceParameterRedraw?.(); node.setDirtyCanvas?.(true, true); }
					else notifyParameterChanged(node, { structure: false });
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
		return promoted ? subgraph && node.widgets?.some((widget) => isPromotedWidget(widget) && compatibleWidget(widget))
			: !isParameterPanel(node) && !subgraph && node?.widgets?.some(compatibleWidget);
	},
	list(node) {
		const hostId = ensureHostId(node);
		return (node.widgets || []).filter((widget) => compatibleWidget(widget) && (promoted ? isPromotedWidget(widget) : true)).map((widget) => ({
			label: String(widget.label || widget.name),
			binding: { provider: id, hostId, controlId: widget.name, valueType: valueType(widget.value) },
			rowSpan: recommendedControlRowSpan({ value: widget.value, options: widget.options, paramType: widget.param_type || widget.type }),
		}));
	},
	resolve(node, binding) {
		const widget = (node.widgets || []).find((item) => item.name === binding.controlId && compatibleWidget(item) && (promoted ? isPromotedWidget(item) : true));
		if (!widget) return { status: "missing", node };
		const currentType = valueType(widget.value);
		if (currentType !== binding.valueType) return { status: "incompatible", node, currentType };
		return {
			status: "ok", node, control: widget, label: String(widget.label || widget.name), value: widget.value, options: widget.options || {},
			setValue(next, { transaction = true } = {}) {
				const apply = () => { widget.value = next; widget.callback?.(next); node.setDirtyCanvas?.(true, true); };
				return transaction ? graphTransaction(node, apply) : apply();
			},
		};
	},
});

controlProviders.register(widgetProvider("subgraph-widget", true));
controlProviders.register(widgetProvider("generic-widget", false));
