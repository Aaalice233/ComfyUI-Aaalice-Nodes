import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(ROOT, ...path.split("/")), "utf8");
const importUi = source("js/workspace/dashboard_presets.js");
const runtime = source("js/lib/dashboard_preset_runtime.js");
const theme = source("js/lib/theme-library.css");
const workspaceTheme = source("js/lib/theme-workspace.css");
const enLocale = source("locales/en/main.json");
const zhLocale = source("locales/zh/main.json");

test("sidebar preset import warns before restoring a layout with broken bindings", () => {
	assert.match(importUi, /parseDashboardPresetForImport/);
	assert.match(importUi, /layoutBreakingPresetIssues/);
	assert.match(importUi, /entry\.status === "incompatible" && entry\.resolved\?\.status !== "ok"/);
	assert.match(importUi, /confirmUnsafeDashboardLayoutImport/);
	assert.match(importUi, /aa-dashboard-import-recommendation/);
	assert.match(importUi, /useValueOnly/);
	assert.match(runtime, /pairUniqueCards/);
	assert.match(runtime, /match = "recovered"/);
	assert.doesNotMatch(runtime, /source(?:Entry|Binding|Card)s?\s*\[\s*(?:index|i)\s*\]/);
	assert.match(theme, /\.aa-dashboard-import-recommendation \{/);
	assert.match(theme, /\.aa-dashboard-import-risk-confirm \{/);
	assert.match(enLocale, /"layoutBreakWarningTitle"/);
	assert.match(zhLocale, /"layoutBreakWarningTitle"/);
});

test("preset compatibility dialog names sidebar components instead of exposing binding ids", () => {
	assert.match(runtime, /export function dashboardPresetIssueLocations/);
	assert.match(importUi, /dashboardPresetIssueLocations\(dashboard, entry\)/);
	assert.match(importUi, /isModelResourceBinding\(entry\.binding, entry\.saved\?\.payload/);
	assert.doesNotMatch(importUi, /entry\.binding\?\.controlId \|\| entry\.key/);
	assert.doesNotMatch(importUi, /reasons\[entry\.reason\] \|\| entry\.reason/);
	assert.doesNotMatch(importUi, /labels\[entry\.status\] \|\| entry\.status/);
	assert.match(workspaceTheme, /\.aa-value-preset-issue__location/);
	for (const locale of [enLocale, zhLocale]) {
		assert.match(locale, /"reasonMissingOption"/);
		assert.match(locale, /"reasonMissingModelOption"/);
		assert.match(locale, /"modelUnavailable"/);
		assert.match(locale, /"locationPage"/);
		assert.match(locale, /"attention"/);
		assert.match(locale, /"removedComponent"/);
	}
});
