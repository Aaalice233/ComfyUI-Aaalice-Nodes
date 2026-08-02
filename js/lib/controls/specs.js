/** Normalize provider resolutions to the shared control specification. */

function resolvedKind(resolved) {
	const aliases = { number: "numeric", slider: "numeric", combo: "choice", dropdown: "choice", enum: "choice", toggle: "boolean", switch: "boolean", string: "text" };
	if (typeof resolved?.kind === "string" && resolved.kind) return aliases[resolved.kind] || resolved.kind;
	const options = resolved?.options || {};
	if (options.values != null || options.options != null) return "choice";
	if (typeof resolved?.value === "boolean") return "boolean";
	if (typeof resolved?.value === "number") return "numeric";
	return "text";
}

export function resolvedControlSpec(resolved, { labels = {}, presentation = {} } = {}) {
	const kind = resolvedKind(resolved);
	return {
		id: resolved?.controlId || resolved?.control?.id || resolved?.control?.name || "",
		family: resolved?.family || "comfy",
		kind,
		label: resolved.label,
		value: resolved.value,
		options: resolved.options || {},
		labels: labels[kind] || labels,
		presentation: { ...resolved.presentation, ...presentation },
		availability: resolved.availability || { state: "ready" },
	};
}
