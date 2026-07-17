import test from "node:test";
import assert from "node:assert/strict";

import { categorySelectOption, normalizeCategoryColor } from "../js/lib/category_color.js";

test("category colors use a strict normalized transport format", () => {
	assert.equal(normalizeCategoryColor("#abcdef"), "#ABCDEF");
	assert.equal(normalizeCategoryColor("blue"), "");
	assert.equal(normalizeCategoryColor(null), "");
});

test("category select options preserve stable identity and optional color", () => {
	assert.deepEqual(categorySelectOption({ id: "pose", name: "Pose", color: "#0d9488" }), {
		label: "Pose", value: "pose", color: "#0D9488",
	});
	assert.deepEqual(categorySelectOption({ id: "other", name: "Other" }), {
		label: "Other", value: "other", color: "",
	});
});
