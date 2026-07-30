import test from "node:test";
import assert from "node:assert/strict";

import {
	nativeOutputDefinition,
	nativeOutputNodeClass,
	previewAnyUsesMarkdown,
	previewAnyValue,
	previewImageReferences,
	previewImageUrls,
} from "../js/lib/native_output_model.js";

test("built-in output nodes expose stable read-only control identities", () => {
	assert.equal(nativeOutputNodeClass({ comfyClass: "PreviewImage" }), "PreviewImage");
	assert.equal(nativeOutputNodeClass({ constructor: { comfyClass: "PreviewAny" } }), "PreviewAny");
	assert.equal(nativeOutputNodeClass({ comfyClass: "SaveImage" }), null);
	assert.deepEqual(nativeOutputDefinition({ type: "PreviewImage" }), {
		controlId: "preview_images",
		kind: "image-output",
		valueType: "image-output-view",
		columnSpan: 12,
		rowSpan: 36,
		minRowSpan: 24,
	});
});

test("image preview prefers the latest execution references and supports loaded image fallback", () => {
	const node = {
		images: [{ filename: "restored.png", type: "temp", subfolder: "" }],
		imgs: [{ src: "blob:loaded-preview" }],
	};
	const output = { images: [{ filename: "latest.png", type: "temp", subfolder: "batch" }] };
	assert.equal(previewImageReferences(node, output), output.images);
	assert.deepEqual(previewImageUrls(node, output, (reference) => `/view/${reference.subfolder}/${reference.filename}`), ["/view/batch/latest.png"]);
	assert.equal(previewImageReferences(node, null), node.images);
	assert.deepEqual(previewImageReferences({ imgs: node.imgs }, null), ["blob:loaded-preview"]);
});

test("PreviewAny mirrors execution text, restored widget text, and Markdown mode", () => {
	const node = { widgets: [
		{ name: "preview_text", value: "restored" },
		{ name: "preview_mode", value: true },
	] };
	assert.equal(previewAnyValue(node, { text: ["first", "second"] }), "first\n\nsecond");
	assert.equal(previewAnyValue(node, null), "restored");
	assert.equal(previewAnyUsesMarkdown(node), true);
	assert.equal(previewAnyUsesMarkdown({ widgets: [] }), false);
});
