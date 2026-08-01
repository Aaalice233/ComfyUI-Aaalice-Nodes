import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/lib/parameter_layout.js", import.meta.url), "utf8");

test("parameter layout cache keys every geometry input and exposes explicit structure invalidation", () => {
	assert.match(source, /const parameterLayouts = new WeakMap\(\)/);
	assert.match(source, /cached\.width === width && cached\.contentTop === contentTop && cached\.source === source/);
	assert.match(source, /return cached\.layout/);
	assert.match(source, /parameterLayouts\.set\(node, \{ width, contentTop, source: node\.properties\.parameters, layout \}\)/);
	assert.match(source, /export function invalidateParameterLayout\(node\)/);
	assert.match(source, /parameterLayouts\.delete\(node\)/);
});

test("parameter static drawing reuses its theme token until the host theme changes", () => {
	assert.match(source, /parameterBorderColorCache/);
	assert.match(source, /new MutationObserver\(\(\) => \{ parameterBorderColorCache = null; \}\)/);
	assert.match(source, /attributeFilter: \["class", "style"\]/);
	assert.match(source, /const border = parameterBorderColor\(\)/);
});
