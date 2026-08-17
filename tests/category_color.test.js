import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCategoryColor } from "../js/lib/category_color.js";

test("category colors use a strict normalized transport format", () => {
	assert.equal(normalizeCategoryColor("#abcdef"), "#ABCDEF");
	assert.equal(normalizeCategoryColor("blue"), "");
	assert.equal(normalizeCategoryColor(null), "");
});
