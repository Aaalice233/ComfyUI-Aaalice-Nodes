import assert from "node:assert/strict";
import test from "node:test";

import { hasDuplicateOptions } from "../js/lib/parameter_options.js";

test("detects exact duplicate parameter options", () => {
	assert.equal(hasDuplicateOptions(["draft", "final", "draft"]), true);
});

test("keeps distinct option values valid", () => {
	assert.equal(hasDuplicateOptions(["draft", "Draft", "final"]), false);
	assert.equal(hasDuplicateOptions([]), false);
});
