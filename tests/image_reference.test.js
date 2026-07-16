import test from "node:test";
import assert from "node:assert/strict";

import { imageReferenceViewPath, normalizeImageReference } from "../js/lib/image_reference.js";

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
