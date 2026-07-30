/** Pure projection helpers for ComfyUI's built-in execution preview nodes. */

export const NATIVE_OUTPUT_CONTROL_DEFINITIONS = Object.freeze({
	PreviewImage: Object.freeze({
		controlId: "preview_images",
		kind: "image-output",
		valueType: "image-output-view",
		columnSpan: 12,
		rowSpan: 36,
		minRowSpan: 24,
	}),
	PreviewAny: Object.freeze({
		controlId: "preview_text",
		kind: "text-output",
		valueType: "text-output-view",
		columnSpan: 12,
		rowSpan: 28,
		minRowSpan: 12,
	}),
});

export function nativeOutputNodeClass(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass]
		.find((value) => typeof value === "string" && NATIVE_OUTPUT_CONTROL_DEFINITIONS[value]) || null;
}

export function nativeOutputDefinition(node) {
	const nodeClass = nativeOutputNodeClass(node);
	return nodeClass ? NATIVE_OUTPUT_CONTROL_DEFINITIONS[nodeClass] : null;
}

export function previewImageReferences(node, executionOutput = null) {
	const references = executionOutput?.images ?? node?.images;
	if (Array.isArray(references) && references.length) return references;
	return (node?.imgs || []).map((image) => image?.src).filter(Boolean);
}

export function previewImageUrls(node, executionOutput, buildReferenceUrl) {
	return previewImageReferences(node, executionOutput)
		.map((reference) => {
			if (typeof reference === "string") return reference;
			return reference && typeof reference === "object" ? buildReferenceUrl(reference) : "";
		})
		.filter(Boolean);
}

export function previewAnyValue(node, executionOutput = null) {
	const output = executionOutput?.text;
	if (Array.isArray(output)) return output.join("\n\n");
	if (output != null) return String(output);
	const widget = (node?.widgets || []).find((candidate) => candidate?.name === "preview_text");
	return String(widget?.value ?? "");
}

export function previewAnyUsesMarkdown(node) {
	const widget = (node?.widgets || []).find((candidate) => candidate?.name === "preview_mode");
	return Boolean(widget?.value);
}
