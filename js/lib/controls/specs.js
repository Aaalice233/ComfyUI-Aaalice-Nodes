/** Adapters from ParameterPanel parameters and provider resolutions to shared specs. */

const PARAMETER_KIND = Object.freeze({
	slider: "numeric",
	seed: "seed",
	switch: "boolean",
	dropdown: "choice",
	enum: "choice",
	string: "text",
	taglist: "taglist",
	image: "image",
});

export function parameterControlSpec(parameter, { label, labels = {}, presentation = {} } = {}) {
	const kind = PARAMETER_KIND[parameter?.param_type];
	if (!kind) return null;
	return {
		id: parameter.id,
		family: "aaalice",
		kind,
		label: label || parameter.name || parameter.id,
		value: parameter.value,
		options: parameter.config || {},
		labels: labels[kind] || labels,
		presentation,
		availability: { state: "ready" },
	};
}

function resolvedKind(resolved) {
	const aliases = { number: "numeric", slider: "numeric", combo: "choice", dropdown: "choice", enum: "choice", toggle: "boolean", switch: "boolean", string: "text" };
	if (typeof resolved?.kind === "string" && resolved.kind) return aliases[resolved.kind] || resolved.kind;
	const type = resolved?.control?.param_type;
	if (type && PARAMETER_KIND[type]) return PARAMETER_KIND[type];
	const options = resolved?.options || {};
	if (Array.isArray(options.values) || Array.isArray(options.options)) return "choice";
	if (typeof resolved?.value === "boolean") return "boolean";
	if (typeof resolved?.value === "number") return "numeric";
	return "text";
}

export function resolvedControlSpec(resolved, { labels = {}, presentation = {} } = {}) {
	const kind = resolvedKind(resolved);
	return {
		id: resolved?.controlId || resolved?.control?.id || resolved?.control?.name || "",
		family: resolved?.family === "comfy" ? "comfy" : "aaalice",
		kind,
		label: resolved.label,
		value: resolved.value,
		options: resolved.options || {},
		labels: labels[kind] || labels,
		presentation,
		availability: resolved.availability || { state: "ready" },
	};
}
