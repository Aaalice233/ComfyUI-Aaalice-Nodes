/** Pure preflight for model-valued ParameterPanel choices. */

import {
	parameterOptionSourceAdapter,
	parameterOptionSourceOptions,
} from "./parameter_option_sources.js";

function hasLinks(output) {
	return Array.isArray(output?.links) ? output.links.length > 0 : Boolean(output?.links);
}

function panelHasOutputLinks(node) {
	return (node?.outputs || []).some(hasLinks);
}

function outputParameterIds(node) {
	return new Set(
		(node?.outputs || [])
			.map((output) => output?._aaaliceParamId)
			.filter((id) => typeof id === "string" && id),
	);
}

/**
 * Return model reference issues for panels that will emit a value in this prompt.
 * The caller supplies all graph nodes so graph traversal stays at the graph boundary.
 */
export function findParameterSourceIssues(nodes, {
	getSourceAdapter = parameterOptionSourceAdapter,
	getSourceOptions = parameterOptionSourceOptions,
	kinds = ["model"],
} = {}) {
	const allowedKinds = new Set(kinds);
	const issues = [];
	for (const node of Array.isArray(nodes) ? nodes : []) {
		if (!panelHasOutputLinks(node)) continue;
		const parameters = node?.properties?.parameters;
		if (!Array.isArray(parameters)) continue;
		const outputIds = outputParameterIds(node);
		for (const parameter of parameters) {
			if (!outputIds.has(parameter?.id)) continue;
			if (!(parameter?.param_type === "dropdown" || parameter?.param_type === "enum")) continue;
			const source = String(parameter?.config?.source || "");
			if (!source) continue;
			const adapter = getSourceAdapter(source);
			if (!adapter || !allowedKinds.has(adapter.kind)) continue;

			if (adapter.resolved !== true) {
				issues.push({
					panel: node,
					parameterId: parameter.id,
					name: String(parameter.name || parameter.id),
					source,
					value: String(parameter.value ?? ""),
					status: "source_unverified",
				});
				continue;
			}

			const options = getSourceOptions(source);
			if (!options.length) {
				issues.push({
					panel: node,
					parameterId: parameter.id,
					name: String(parameter.name || parameter.id),
					source,
					value: String(parameter.value ?? ""),
					status: "source_unavailable",
				});
				continue;
			}

			const value = String(parameter.value ?? "");
			if (!options.includes(value)) {
				issues.push({
					panel: node,
					parameterId: parameter.id,
					name: String(parameter.name || parameter.id),
					source,
					value,
					status: "missing",
				});
			}
		}
	}
	return issues;
}

export function findParameterModelIssues(nodes, options = {}) {
	return findParameterSourceIssues(nodes, { ...options, kinds: ["model"] });
}
