/** ParameterPanel domain model. node.properties.parameters is the source of truth. */
import { t } from "../i18n.js";

export const MAX_TUNABLE = 32;
export const SEED_MAX = 0xffffffffffffffff;
export const EVENT_PARAMETER_CHANGED = "aaalice-parameter-panel-changed";
export const EVENT_PARAMETER_LIST = "aaalice-parameter-panel-list-changed";
export const EVENT_OPERATION_CHANGED = "aaalice-operation-panel-changed";
export const OPERATION_PROPERTY = "aaalice_operation_panel";

const TUNABLE = new Set(["slider", "seed", "switch", "string", "dropdown", "enum", "image", "taglist"]);
const sourceOptions = {
	sampler: ["euler"],
	scheduler: ["normal"],
	checkpoint: [],
	lora: [],
	controlnet: [],
	upscale_model: [],
};

export function newStableId(prefix) {
	if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newParamId() {
	return newStableId("param");
}

export function cloneData(value) {
	return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

export function displayName(item, fallback = "") {
	if (item?.name_custom) return String(item.name || fallback);
	if (item?.name_key) return t(item.name_key, item.name_fallback || item.name || fallback);
	return String(item?.name || fallback);
}

export function setCustomName(item, name) {
	item.name = String(name || "").trim();
	item.name_custom = true;
	delete item.name_key;
	delete item.name_fallback;
}

export function uniqueName(items, requested, exceptId = null) {
	const base = String(requested || "Parameter").trim() || "Parameter";
	const used = new Set((items || [])
		.filter((item) => item.id !== exceptId)
		.map((item) => displayName(item).trim().toLocaleLowerCase()));
	if (!used.has(base.toLocaleLowerCase())) return base;
	for (let index = 2; ; index += 1) {
		const candidate = `${base} ${index}`;
		if (!used.has(candidate.toLocaleLowerCase())) return candidate;
	}
}

export function refreshComfyOptions(nodeDefs) {
	const readOptions = (entry) => {
		if (Array.isArray(entry?.[0])) return entry[0].map(String);
		if (Array.isArray(entry?.options)) return entry.options.map(String);
		return [];
	};
	const required = (nodeName) => nodeDefs?.[nodeName]?.input?.required || nodeDefs?.[nodeName]?.inputs?.required || {};
	for (const [source, nodeName, inputName] of [
		["sampler", "KSampler", "sampler_name"],
		["scheduler", "KSampler", "scheduler"],
		["checkpoint", "CheckpointLoaderSimple", "ckpt_name"],
		["lora", "LoraLoader", "lora_name"],
		["controlnet", "ControlNetLoader", "control_net_name"],
		["upscale_model", "UpscaleModelLoader", "model_name"],
	]) {
		const options = readOptions(required(nodeName)[inputName]);
		if (options.length) sourceOptions[source] = options;
	}
}

export function dynamicOptions(source) {
	return [...(sourceOptions[source] || [])];
}

export function defaultValueForType(paramType, config = {}) {
	if (paramType === "slider") return Number(config.default ?? config.min ?? 0);
	if (paramType === "seed") return Number(config.default ?? 0);
	if (paramType === "switch") return Boolean(config.default ?? false);
	if (paramType === "string") return String(config.default ?? "");
	if (paramType === "dropdown" || paramType === "enum") return (config.options || dynamicOptions(config.source))[0] ?? "";
	if (paramType === "taglist") return [];
	if (paramType === "image") return null;
	return null;
}

export function createParameter(paramType, partial = {}) {
	const config = cloneData(partial.config || {});
	if (paramType === "slider") {
		config.min ??= 0;
		config.max ??= 100;
		config.step ??= 1;
	}
	if (paramType === "seed") {
		config.min ??= 0;
		config.max ??= SEED_MAX;
		config.control_after_generate ??= "fixed";
	}
	if (["dropdown", "enum"].includes(paramType)) {
		if (config.source) config.options = dynamicOptions(config.source);
		if (!Array.isArray(config.options) || !config.options.length) config.options = ["option_a", "option_b"];
	}
	const name = partial.name || (paramType === "separator" ? "Section" : paramType);
	return {
		id: partial.id || newParamId(),
		name,
		name_key: partial.name_key,
		name_fallback: partial.name_fallback,
		name_custom: Boolean(partial.name_custom),
		param_type: paramType,
		value: partial.value !== undefined ? cloneData(partial.value) : defaultValueForType(paramType, config),
		config,
		description: String(partial.description || ""),
	};
}

function builtin(id, fallback, paramType, value, config = {}) {
	return createParameter(paramType, {
		id,
		name: fallback,
		name_key: `aaalice.pcp.builtin.${id}`,
		name_fallback: fallback,
		value,
		config,
	});
}

export function createSamplerTemplateParameters() {
	return [
		builtin("steps", "Steps", "slider", 20, { min: 1, max: 10000, step: 1 }),
		builtin("cfg", "CFG", "slider", 8, { min: 0, max: 100, step: 0.1 }),
		builtin("sampler", "Sampler", "dropdown", sourceOptions.sampler[0], { source: "sampler", options: [...sourceOptions.sampler] }),
		builtin("scheduler", "Scheduler", "dropdown", sourceOptions.scheduler[0], { source: "scheduler", options: [...sourceOptions.scheduler] }),
		builtin("denoise", "Denoise", "slider", 1, { min: 0, max: 1, step: 0.01 }),
		builtin("seed", "Seed", "seed", 0, { min: 0, max: SEED_MAX, control_after_generate: "fixed" }),
	];
}

export function ensureParameters(node) {
	node.properties ||= {};
	if (!Array.isArray(node.properties.parameters)) node.properties.parameters = createSamplerTemplateParameters();
	return node.properties.parameters;
}

export function materializeParameters(parameters) {
	return (parameters || []).map((parameter) => ({
		...cloneData(parameter),
		name: displayName(parameter, parameter.param_type || "Parameter"),
	}));
}

export function normalizeDynamicOptions(parameters) {
	for (const parameter of parameters || []) {
		if (!parameter.config?.source) continue;
		parameter.config.options = dynamicOptions(parameter.config.source);
	}
}

export function isTunable(parameter) {
	return Boolean(parameter && TUNABLE.has(parameter.param_type));
}

export function countTunable(parameters) {
	return (parameters || []).filter(isTunable).length;
}

export function validateParametersDraft(parameters) {
	const errors = [];
	if (countTunable(parameters) > MAX_TUNABLE) {
		errors.push(message("aaalice.pcp.error.maxParameters", "At most {count} tunable parameters.", { count: MAX_TUNABLE }));
	}
	const ids = new Set();
	const names = new Set();
	for (const parameter of parameters || []) {
		if (!parameter.id || ids.has(parameter.id)) errors.push(t("aaalice.pcp.validation.parameterIdsUnique", "Parameter ids must be unique."));
		ids.add(parameter.id);
		const name = displayName(parameter).trim();
		const key = name.toLocaleLowerCase();
		if (!name || names.has(key)) errors.push(t("aaalice.pcp.validation.parameterNamesUnique", "Parameter names must be unique."));
		names.add(key);
		if (parameter.param_type === "slider") {
			const min = Number(parameter.config?.min);
			const max = Number(parameter.config?.max);
			const step = Number(parameter.config?.step);
			if (![min, max, step].every(Number.isFinite) || max < min || step <= 0) {
				errors.push(message("aaalice.pcp.validation.sliderRange", "{name}: invalid slider range.", { name }));
			}
		}
		if (["dropdown", "enum"].includes(parameter.param_type)
			&& (!Array.isArray(parameter.config?.options) || !parameter.config.options.length)) {
			errors.push(message("aaalice.pcp.validation.optionsRequired", "{name}: options are required.", { name }));
		}
	}
	return [...new Set(errors)];
}

export function tunableMeta(parameters) {
	return (parameters || []).filter(isTunable).map((parameter, order) => ({
		id: parameter.id,
		name: displayName(parameter, parameter.id),
		order,
		param_type: parameter.param_type,
	}));
}

export function isParameterPanel(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes("ParameterPanel");
}

export function listParameterPanels(app) {
	return (app?.graph?._nodes || []).filter(isParameterPanel);
}

export function notifyParameterChanged(node, detail = {}) {
	ensureParameters(node);
	node.graph?.setDirtyCanvas?.(true, true);
	window.dispatchEvent(new CustomEvent(EVENT_PARAMETER_CHANGED, { detail: { nodeId: node.id, node, ...detail } }));
	window.dispatchEvent(new CustomEvent(EVENT_OPERATION_CHANGED));
}

export function notifyParameterListChanged() {
	window.dispatchEvent(new CustomEvent(EVENT_PARAMETER_LIST));
	window.dispatchEvent(new CustomEvent(EVENT_OPERATION_CHANGED));
}

export function applySeedAfterQueue(node) {
	let changed = false;
	for (const parameter of ensureParameters(node)) {
		if (parameter.param_type !== "seed") continue;
		const behavior = parameter.config?.control_after_generate || "fixed";
		const current = Number(parameter.value) || 0;
		if (behavior === "increment") parameter.value = Math.min(SEED_MAX, current + 1);
		else if (behavior === "decrement") parameter.value = Math.max(0, current - 1);
		else if (behavior === "randomize") parameter.value = Math.floor(Math.random() * SEED_MAX);
		else continue;
		changed = true;
	}
	if (changed) notifyParameterChanged(node, { structure: false });
}
