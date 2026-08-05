import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeNumericValue } from "../js/lib/controls/numeric.js";

const numericSource = readFileSync(new URL("../js/lib/controls/numeric.js", import.meta.url), "utf8");

test("float sidebar ranges preserve hundredths when the node source step is one", () => {
	const source = { type: "FLOAT", value: 2, options: { step: 1 } };
	const sidebarRange = { min: 0, max: 3, step: 0.01 };
	const preview = normalizeNumericValue(1.37, {
		min: sidebarRange.min,
		max: sidebarRange.max,
		precision: 2,
		fallback: source.value,
	});
	const committed = normalizeNumericValue(preview, {
		min: Number.MIN_SAFE_INTEGER,
		max: Number.MAX_SAFE_INTEGER,
		fallback: source.value,
	});
	assert.equal(committed, 1.37);
});

test("numeric normalization still rounds slider previews to the configured presentation precision", () => {
	assert.equal(normalizeNumericValue(1.376, { min: 0, max: 3, precision: 2, fallback: 2 }), 1.38);
	assert.equal(normalizeNumericValue(-1, { min: 0, max: 3, precision: 2, fallback: 2 }), 0);
	assert.equal(normalizeNumericValue(4, { min: 0, max: 3, precision: 2, fallback: 2 }), 3);
});

test("custom range synchronization does not reuse the source step as a precision limit", () => {
	const start = numericSource.indexOf("const normalizeIncoming = customRange");
	const end = numericSource.indexOf("const sync =", start);
	const customIncoming = numericSource.slice(start, end);
	assert.match(customIncoming, /normalizeNumericValue/);
	assert.doesNotMatch(customIncoming, /sourcePrecision|toFixed/);
});
