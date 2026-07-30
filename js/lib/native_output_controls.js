/** Read-only adapters for ComfyUI execution previews that are not ordinary value widgets. */

import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";
import { invalidateControlHost } from "./control_host_events.js";
import { nativeOutputDefinition, nativeOutputNodeClass, previewAnyUsesMarkdown, previewAnyValue, previewImageReferences } from "./native_output_model.js";

const executionOutputs = new WeakMap();
const executionBindings = new WeakMap();
const imageUrlCaches = new WeakMap();
const widgetBindings = new WeakMap();

function bindExecutionInvalidation(node) {
	const installed = executionBindings.get(node);
	if (installed?.wrapper === node.onExecuted) return;
	const original = node.onExecuted;
	const wrapper = function (output) {
		const result = original?.call(this, output);
		executionOutputs.set(node, output || {});
		invalidateControlHost(node);
		return result;
	};
	executionBindings.set(node, { original, wrapper });
	node.onExecuted = wrapper;
}

function bindWidgetInvalidation(node, widgetName) {
	const widget = (node?.widgets || []).find((candidate) => candidate?.name === widgetName);
	if (!widget) return;
	const installed = widgetBindings.get(widget);
	if (installed?.wrapper === widget.callback && installed.node === node) return;
	const original = widget.callback;
	const wrapper = function (...args) {
		const result = original?.apply(this, args);
		invalidateControlHost(node);
		return result;
	};
	widgetBindings.set(widget, { node, original, wrapper });
	widget.callback = wrapper;
}

function imageReferenceUrl(reference) {
	const params = new URLSearchParams(reference);
	return api.apiURL(`/view?${params}${app.getRandParam?.() || ""}`);
}

function stablePreviewImageUrls(node, output) {
	const references = previewImageReferences(node, output);
	const cached = imageUrlCaches.get(node);
	if (cached?.references === references) return cached.urls;
	const urls = references.map((reference) => {
		if (typeof reference === "string") return reference;
		return reference && typeof reference === "object" ? imageReferenceUrl(reference) : "";
	}).filter(Boolean);
	imageUrlCaches.set(node, { references, urls });
	return urls;
}

export function describeNativeOutputControl(node) {
	const nodeClass = nativeOutputNodeClass(node);
	const definition = nativeOutputDefinition(node);
	if (!nodeClass || !definition) return null;
	bindExecutionInvalidation(node);
	if (nodeClass === "PreviewAny") bindWidgetInvalidation(node, "preview_mode");
	const output = executionOutputs.get(node) || null;
	const value = nodeClass === "PreviewImage"
		? stablePreviewImageUrls(node, output)
		: previewAnyValue(node, output);
	return {
		...definition,
		label: String(node?.title || node?.constructor?.title || (nodeClass === "PreviewImage" ? "Preview Image" : "Preview as Text")),
		value,
		options: nodeClass === "PreviewAny" ? { markdown: previewAnyUsesMarkdown(node) } : {},
		availability: { state: "ready" },
		presettable: false,
		control: node,
	};
}

export function listNativeOutputControls(node) {
	const described = describeNativeOutputControl(node);
	return described ? [described] : [];
}

export function resolveNativeOutputControl(node, controlId) {
	const described = describeNativeOutputControl(node);
	return described?.controlId === controlId ? described : null;
}
