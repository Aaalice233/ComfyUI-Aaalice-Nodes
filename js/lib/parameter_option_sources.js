/** Registry and runtime availability for ParameterPanel dynamic option sources. */

const SAMPLER_FALLBACK_OPTIONS = Object.freeze([
	"euler", "euler_cfg_pp", "euler_ancestral", "euler_ancestral_cfg_pp", "heun", "heunpp2",
	"exp_heun_2_x0", "exp_heun_2_x0_sde", "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast",
	"dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_2s_ancestral_cfg_pp", "dpmpp_sde", "dpmpp_sde_gpu",
	"dpmpp_2m", "dpmpp_2m_cfg_pp", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu", "dpmpp_2m_sde_heun",
	"dpmpp_2m_sde_heun_gpu", "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ipndm",
	"ipndm_v", "deis", "res_multistep", "res_multistep_cfg_pp", "res_multistep_ancestral",
	"res_multistep_ancestral_cfg_pp", "gradient_estimation", "gradient_estimation_cfg_pp", "er_sde",
	"seeds_2", "seeds_3", "sa_solver", "sa_solver_pece", "ddim", "uni_pc", "uni_pc_bh2",
]);

const SCHEDULER_FALLBACK_OPTIONS = Object.freeze([
	"simple", "sgm_uniform", "karras", "exponential", "ddim_uniform", "beta", "normal",
	"linear_quadratic", "kl_optimal",
]);

const adapters = new Map();
let latestNodeDefs = null;

function normalizedOptions(options) {
	const seen = new Set();
	const result = [];
	for (const option of Array.isArray(options) ? options : []) {
		const value = String(option);
		if (!value || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}

function requiredInputs(nodeDefs, nodeName) {
	const definition = nodeDefs?.[nodeName];
	return definition?.input?.required
		|| definition?.inputs?.required
		|| definition?.input?.required_inputs
		|| definition?.inputs?.required_inputs
		|| {};
}

export function readComfyComboOptions(entry) {
	if (Array.isArray(entry?.[0])) return normalizedOptions(entry[0]);
	if (Array.isArray(entry?.[1]?.options)) return normalizedOptions(entry[1].options);
	if (Array.isArray(entry?.options)) return normalizedOptions(entry.options);
	return [];
}

function resolveAdapterOptions(adapter, nodeDefs) {
	if (adapter.resolveOptions) return normalizedOptions(adapter.resolveOptions(nodeDefs, readComfyComboOptions));
	for (const input of adapter.inputs) {
		const options = readComfyComboOptions(requiredInputs(nodeDefs, input.nodeName)[input.inputName]);
		if (options.length) return options;
	}
	return [];
}

function resolveAdapter(adapter, nodeDefs) {
	adapter.options = resolveAdapterOptions(adapter, nodeDefs);
	adapter.available = adapter.options.length > 0;
	adapter.resolved = true;
}

export function registerParameterOptionSourceAdapter(definition) {
	const id = String(definition?.id || "");
	if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(`Invalid parameter option source id: ${id || "(empty)"}`);
	if (adapters.has(id)) throw new Error(`Parameter option source already registered: ${id}`);
	const inputs = Array.isArray(definition?.inputs)
		? definition.inputs.map((input) => ({
			nodeName: String(input?.nodeName || ""),
			inputName: String(input?.inputName || ""),
		}))
		: [];
	if (!inputs.every((input) => input.nodeName && input.inputName)) {
		throw new Error(`Parameter option source ${id} has an invalid input adapter`);
	}
	if (!inputs.length && typeof definition?.resolveOptions !== "function") {
		throw new Error(`Parameter option source ${id} needs an input adapter or resolver`);
	}
	const declaredKind = typeof definition?.kind === "string" ? definition.kind.trim() : "";
	const adapter = {
		id,
		labelKey: String(definition?.labelKey || ""),
		labelFallback: String(definition?.labelFallback || id),
		kind: declaredKind || null,
		inputs,
		resolveOptions: typeof definition?.resolveOptions === "function" ? definition.resolveOptions : null,
		fallbackOptions: normalizedOptions(definition?.fallbackOptions),
		options: [],
		available: false,
		resolved: false,
	};
	adapters.set(id, adapter);
	if (latestNodeDefs) resolveAdapter(adapter, latestNodeDefs);
	return () => {
		if (adapters.get(id) === adapter) adapters.delete(id);
	};
}

export function refreshParameterOptionSources(nodeDefs) {
	latestNodeDefs = nodeDefs && typeof nodeDefs === "object" ? nodeDefs : {};
	for (const adapter of adapters.values()) resolveAdapter(adapter, latestNodeDefs);
}

export function parameterOptionSourceOptions(id) {
	const adapter = adapters.get(String(id || ""));
	if (!adapter) return [];
	return [...(adapter.resolved ? adapter.options : adapter.fallbackOptions)];
}

export function parameterOptionSourceAdapter(id) {
	const adapter = adapters.get(String(id || ""));
	if (!adapter) return null;
	return {
		id: adapter.id,
		labelKey: adapter.labelKey,
		labelFallback: adapter.labelFallback,
		kind: adapter.kind,
		available: adapter.available,
		resolved: adapter.resolved,
	};
}

export function availableParameterOptionSourceAdapters() {
	return [...adapters.values()]
		.filter((adapter) => adapter.available)
		.map((adapter) => ({
			id: adapter.id,
			labelKey: adapter.labelKey,
			labelFallback: adapter.labelFallback,
			kind: adapter.kind,
			available: true,
			resolved: adapter.resolved,
		}));
}

for (const adapter of [
	{
		id: "sampler",
		labelKey: "aaalice.pcp.sources.sampler",
		labelFallback: "Sampler",
		kind: "sampler",
		inputs: [{ nodeName: "KSampler", inputName: "sampler_name" }],
		fallbackOptions: SAMPLER_FALLBACK_OPTIONS,
	},
	{
		id: "scheduler",
		labelKey: "aaalice.pcp.sources.scheduler",
		labelFallback: "Scheduler",
		kind: "scheduler",
		inputs: [{ nodeName: "KSampler", inputName: "scheduler" }],
		fallbackOptions: SCHEDULER_FALLBACK_OPTIONS,
	},
	{
		id: "checkpoint",
		labelKey: "aaalice.pcp.sources.checkpoint",
		labelFallback: "Checkpoint",
		kind: "model",
		inputs: [{ nodeName: "CheckpointLoaderSimple", inputName: "ckpt_name" }],
	},
	{
		id: "lora",
		labelKey: "aaalice.pcp.sources.lora",
		labelFallback: "LoRA",
		kind: "model",
		inputs: [{ nodeName: "LoraLoader", inputName: "lora_name" }],
	},
	{
		id: "controlnet",
		labelKey: "aaalice.pcp.sources.controlnet",
		labelFallback: "ControlNet",
		kind: "model",
		inputs: [{ nodeName: "ControlNetLoader", inputName: "control_net_name" }],
	},
	{
		id: "upscale_model",
		labelKey: "aaalice.pcp.sources.upscaleModel",
		labelFallback: "Upscale model",
		kind: "model",
		inputs: [{ nodeName: "UpscaleModelLoader", inputName: "model_name" }],
	},
	{
		id: "wd_timm_model",
		labelKey: "aaalice.pcp.sources.wdTimmModel",
		labelFallback: "WD Timm tagger model",
		kind: "model",
		inputs: [{ nodeName: "WDTimmTagger", inputName: "model_name" }],
	},
	{
		id: "prompt_expand_rule",
		labelKey: "aaalice.pcp.sources.promptExpandRule",
		labelFallback: "Prompt Assistant · Expand rule",
		kind: "rule",
		inputs: [{ nodeName: "PromptExpand", inputName: "rule" }],
	},
	{
		id: "prompt_llm_service",
		labelKey: "aaalice.pcp.sources.promptLlmService",
		labelFallback: "Prompt Assistant · LLM service",
		kind: "service",
		inputs: [{ nodeName: "PromptExpand", inputName: "llm_service" }],
	},
	{
		id: "prompt_vision_rule",
		labelKey: "aaalice.pcp.sources.promptVisionRule",
		labelFallback: "Prompt Assistant · Vision rule",
		kind: "rule",
		inputs: [{ nodeName: "ImageCaptionNode", inputName: "rule" }],
	},
	{
		id: "prompt_vlm_service",
		labelKey: "aaalice.pcp.sources.promptVlmService",
		labelFallback: "Prompt Assistant · VLM service",
		kind: "service",
		inputs: [{ nodeName: "ImageCaptionNode", inputName: "vlm_service" }],
	},
]) registerParameterOptionSourceAdapter(adapter);
