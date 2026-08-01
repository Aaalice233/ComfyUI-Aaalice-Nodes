import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const providers = readFileSync(new URL("../js/lib/control_providers.js", import.meta.url), "utf8");

test("QuickGroupManager keeps its canonical default and exposes live height through layoutProjection", () => {
	assert.match(providers, /function quickGroupManagerRowSpan\(snapshot\)/);
	assert.match(providers, /const count = Array\.isArray\(snapshot\?\.visibleGroups\) \? snapshot\.visibleGroups\.length : 0/);
	assert.match(providers, /rowSpan: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN/);
	assert.match(providers, /layoutProjection: \{ rowSpan: quickGroupManagerRowSpan\(snapshot\) \}/);
	assert.doesNotMatch(providers, /rowSpan: quickGroupManagerRowSpan\(snapshot\),/);
});
