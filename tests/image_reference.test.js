import test from "node:test";
import assert from "node:assert/strict";

import { imageComboReference, imageReferenceComboValue, imageReferenceViewPath, normalizeImageReference } from "../js/lib/image_reference.js";

test("normalizes the upload endpoint name into a saved filename", () => {
	assert.deepEqual(normalizeImageReference({ name: "cat image.png", subfolder: "refs", type: "input" }), {
		filename: "cat image.png",
		subfolder: "refs",
		type: "input",
	});
});

test("builds an encoded ComfyUI view path", () => {
	assert.equal(
		imageReferenceViewPath({ filename: "cat image.png", subfolder: "my refs", type: "input" }),
		"/view?filename=cat+image.png&subfolder=my+refs&type=input",
	);
});

test("rejects image references without a filename", () => {
	assert.equal(normalizeImageReference({ subfolder: "refs", type: "input" }), null);
	assert.equal(imageReferenceViewPath(null), "");
});

test("image combo references preserve output folders and explicit type markers", () => {
	assert.deepEqual(imageComboReference("ComfyUI_00030_.png", "output"), {
		filename: "ComfyUI_00030_.png",
		subfolder: "",
		type: "output",
	});
	assert.deepEqual(imageComboReference("preview/frame.png [temp]", "output"), {
		filename: "frame.png",
		subfolder: "preview",
		type: "temp",
	});
});

test("image references use ComfyUI's input-only implicit folder convention", () => {
	assert.equal(imageReferenceComboValue({ filename: "frame.png", subfolder: "uploads", type: "input" }), "uploads/frame.png");
	assert.equal(imageReferenceComboValue({ filename: "frame.png", subfolder: "uploads", type: "input" }, "output"), "uploads/frame.png");
	assert.equal(imageReferenceComboValue({ filename: "frame.png", subfolder: "results", type: "output" }, "output"), "results/frame.png [output]");
	assert.equal(imageReferenceComboValue({ filename: "frame.png", subfolder: "preview", type: "temp" }, "temp"), "preview/frame.png [temp]");
	assert.equal(imageReferenceComboValue(null), "");
});
