/**
 * Shared Parameter Panel model helpers (frontend).
 * Single source: node.properties.parameters + parameters_json widget.
 */

export const MAX_TUNABLE = 32;
export const EVENT_PCP_CHANGED = "aaalice-pcp-changed";
export const EVENT_PCP_LIST = "aaalice-pcp-list-changed";

const TUNABLE = new Set(["slider", "switch", "string", "dropdown"]);

export function newParamId() {
	return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultValueForType(paramType, config = {}) {
	switch (paramType) {
		case "slider": {
			const min = Number(config.min ?? 0);
			const max = Number(config.max ?? 100);
			const step = Number(config.step ?? 1);
			const def = config.default;
			if (def != null && def !== "") return step === 1 ? Math.round(Number(def)) : Number(def);
			return step === 1 ? Math.round(min) : min;
		}
		case "switch":
			return Boolean(config.default ?? false);
		case "string":
			return String(config.default ?? "");
		case "dropdown": {
			const options = Array.isArray(config.options) ? config.options : [];
			return options[0] ?? "";
		}
		case "separator":
			return null;
		default:
			return null;
	}
}

export function createParameter(paramType, partial = {}) {
	const config = { ...(partial.config || {}) };
	if (paramType === "slider") {
		config.min = config.min ?? 0;
		config.max = config.max ?? 100;
		config.step = config.step ?? 1;
	}
	if (paramType === "dropdown") {
		if (!Array.isArray(config.options) || config.options.length === 0) {
			config.options = ["option_a", "option_b"];
		}
	}
	const name =
		partial.name != null && String(partial.name).trim()
			? String(partial.name).trim()
			: paramType === "separator"
				? "Section"
				: paramType;
	return {
		id: partial.id || newParamId(),
		name,
		param_type: paramType,
		value: partial.value !== undefined ? partial.value : defaultValueForType(paramType, config),
		config,
	};
}

export function isTunable(param) {
	return param && TUNABLE.has(param.param_type);
}

export function countTunable(parameters) {
	return (parameters || []).filter(isTunable).length;
}

export function ensureParameters(node) {
	if (!node.properties) node.properties = {};
	if (!Array.isArray(node.properties.parameters)) {
		node.properties.parameters = [];
	}
	return node.properties.parameters;
}

/** Persist list onto node.properties (workflow source of truth). */
export function syncParametersToWidget(node) {
	const params = ensureParameters(node);
	const json = JSON.stringify(params);
	node.properties = node.properties || {};
	node.properties.parameters = params;
	node.properties.parameters_json = json;
	return json;
}

/** Load list from properties (and optional legacy widget value). */
export function loadParametersFromWidget(node) {
	node.properties = node.properties || {};
	if (Array.isArray(node.properties.parameters) && node.properties.parameters.length) {
		return node.properties.parameters;
	}
	const raw = node.properties.parameters_json;
	if (raw == null || raw === "") {
		node.properties.parameters = node.properties.parameters || [];
		return ensureParameters(node);
	}
	try {
		const data = typeof raw === "string" ? JSON.parse(raw) : raw;
		node.properties.parameters = Array.isArray(data) ? data : [];
	} catch {
		node.properties.parameters = [];
	}
	return ensureParameters(node);
}

export function notifyPcpChanged(node) {
	syncParametersToWidget(node);
	if (node.graph?.setDirtyCanvas) {
		node.graph.setDirtyCanvas(true, true);
	}
	window.dispatchEvent(
		new CustomEvent(EVENT_PCP_CHANGED, {
			detail: { nodeId: node.id, node },
		}),
	);
	window.dispatchEvent(new CustomEvent(EVENT_PCP_LIST));
}

export function listPcpNodes(app) {
	const graph = app?.graph;
	if (!graph) return [];
	const nodes = graph._nodes || graph.nodes || [];
	return nodes.filter(
		(n) => n?.comfyClass === "ParameterControlPanel" || n?.type === "ParameterControlPanel",
	);
}

export function validateNameUnique(parameters, name, exceptId = null) {
	const n = String(name ?? "").trim();
	if (!n) return "Name is required";
	const clash = parameters.some((p) => p.id !== exceptId && p.name === n);
	if (clash) return "Name must be unique in this panel";
	return null;
}

export function canAddTunable(parameters) {
	return countTunable(parameters) < MAX_TUNABLE;
}

/** Meta for break labels / rebind: ordered tunable params */
export function tunableMeta(parameters) {
	return (parameters || []).filter(isTunable).map((p, order) => ({
		id: p.id,
		name: p.name,
		order,
		param_type: p.param_type,
	}));
}
