/** Extensible registry that projects node controls without owning their values. */

import { api } from "../../../scripts/api.js";
import { normalizeImageReference } from "./image_reference.js";
import { displayName, ensureParameters, isParameterPanel, isTunable, notifyParameterChanged } from "./param_model.js";

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
			setValue(next, { transaction = true } = {}) {
				const apply = () => { parameter.value = next; notifyParameterChanged(node, { structure: false }); };
				return transaction ? graphTransaction(node, apply) : apply();
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

export function createControlElement(resolved, { onInput, onCommit } = {}) {
	if (resolved?.status !== "ok") return null;
	const { value, options = {} } = resolved;
	let control;
	if (resolved.control?.param_type === "image") {
		control = document.createElement("input"); control.type = "file"; control.accept = "image/*";
		control.addEventListener("change", async () => {
			const file = control.files?.[0]; if (!file) return;
			const body = new FormData(); body.append("image", file); body.append("type", "input");
			const response = await api.fetchApi("/upload/image", { method: "POST", body });
			if (!response.ok) throw new Error(`Image upload failed (${response.status})`);
			const reference = normalizeImageReference(await response.json());
			if (!reference) throw new Error("Image upload returned no filename");
			resolved.setValue(reference); onCommit?.(reference);
		});
	} else if (resolved.control?.param_type === "taglist" || Array.isArray(value)) {
		control = document.createElement("input"); control.type = "text"; control.value = (value || []).join(", ");
		control.addEventListener("change", () => { const next = control.value.split(",").map((item) => item.trim()).filter(Boolean); resolved.setValue(next); onCommit?.(next); });
	} else if (Array.isArray(options.values) || Array.isArray(options.options)) {
		control = document.createElement("select");
		for (const item of options.values || options.options) control.add(new Option(String(item), String(item), false, String(item) === String(value)));
		control.addEventListener("change", () => { resolved.setValue(control.value); onCommit?.(control.value); });
	} else if (typeof value === "boolean") {
		control = document.createElement("input"); control.type = "checkbox"; control.checked = value;
		control.addEventListener("change", () => { resolved.setValue(control.checked); onCommit?.(control.checked); });
	} else {
		control = document.createElement("input"); control.type = typeof value === "number" && (resolved.control?.type === "slider" || options.display === "slider") ? "range" : typeof value === "number" ? "number" : "text"; control.value = String(value ?? "");
		if (typeof value === "number") {
			if (Number.isFinite(Number(options.min))) control.min = String(options.min);
			if (Number.isFinite(Number(options.max))) control.max = String(options.max);
			if (Number.isFinite(Number(options.step))) control.step = String(options.step);
			let gestureOpen = false; let suppressNextChange = false;
			const beginGesture = () => { if (!gestureOpen) { resolved.node?.graph?.beforeChange?.(); gestureOpen = true; } };
			const finishGesture = () => { if (!gestureOpen) return; gestureOpen = false; resolved.node?.graph?.afterChange?.(); resolved.node?.graph?.setDirtyCanvas?.(true, true); onCommit?.(Number(control.value)); };
			control.addEventListener("pointerdown", beginGesture);
			control.addEventListener("input", () => { const next = Number(control.value); if (gestureOpen) resolved.setValue(next, { transaction: false }); onInput?.(next); });
			control.addEventListener("change", () => { const next = Number(control.value); if (gestureOpen) { resolved.setValue(next, { transaction: false }); finishGesture(); } else if (suppressNextChange) suppressNextChange = false; else { resolved.setValue(next); onCommit?.(next); } });
			control.addEventListener("pointerup", () => { if (gestureOpen) { finishGesture(); suppressNextChange = true; } });
			control.addEventListener("pointercancel", finishGesture);
			control.addEventListener("blur", finishGesture);
		} else {
			control.addEventListener("input", () => onInput?.(control.value));
			control.addEventListener("change", () => { resolved.setValue(control.value); onCommit?.(control.value); });
		}
	}
	control.setAttribute("aria-label", resolved.label);
	control.classList.add("aa-workspace-control-input");
	return control;
}
