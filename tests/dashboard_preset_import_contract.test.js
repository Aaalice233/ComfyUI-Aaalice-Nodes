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
const dashboardView = source("js/workspace/dashboard_view.js");
const enLocale = source("locales/en/main.json");
const zhLocale = source("locales/zh/main.json");

test("sidebar preset import defaults to a named values-only copy and preserves the base preset", () => {
	assert.match(importUi, /parseDashboardPresetForImport/);
	assert.match(importUi, /let mode = initialState\.presets\.length \? "values" : "new"/);
	assert.match(importUi, /children: \[modeField, targetField, nameField\]/);
	assert.match(importUi, /targetField\.hidden = mode !== "values"/);
	assert.doesNotMatch(importUi, /nameField\.hidden/);
	assert.match(importUi, /if \(mode === "values" && targetPreset\) valuePlan = planDashboardPresetValueOverwrite/);
	assert.match(importUi, /else if \(mode === "new"\) fullPlan = planDashboardPresetApplication/);
	assert.match(importUi, /const nextState = createDashboardPreset\(state, importedPresetName, latestValues\.merged\)/);
	assert.match(importUi, /applyDashboardSnapshotPlan\(applicationPlan/);
	assert.match(importUi, /writeDashboard: \(next\) => \{ graph\.extra\[runtime\.dashboardExtraKey\] = normalizeDashboard\(next\); \}/);
	assert.match(importUi, /commit: \(\) => \{ graph\.extra\[runtime\.presetsExtraKey\] = nextState; runtime\.setActivePageId\(nextActivePageId\); \}/);
	assert.match(importUi, /rollbackCommit: \(\) => \{ restoreGraphExtra\(graph, runtime\.presetsExtraKey, previousPresetExtra\); runtime\.setActivePageId\(previousActivePageId\); \}/);
	assert.doesNotMatch(importUi, /prepareDashboardPresetSwitch\(targetId/);
	assert.doesNotMatch(importUi, /replaceDashboardPreset\(state, targetPreset\.id/);
	assert.match(importUi, /valueCopyHint/);
	assert.match(runtime, /pairUniqueCards/);
	assert.match(runtime, /match = "recovered"/);
	assert.doesNotMatch(runtime, /source(?:Entry|Binding|Card)s?\s*\[\s*(?:index|i)\s*\]/);
	assert.match(theme, /\.aa-dashboard-preset-transfer-form \{/);
	assert.match(theme, /\.aa-dashboard-preset-transfer-source \{/);
	for (const locale of [enLocale, zhLocale]) {
		assert.match(locale, /"valueCopyHint"/);
		assert.match(locale, /"newPresetWillBeCreated"/);
	}
});

test("full preset import still warns before creating a preset with broken bindings", () => {
	assert.match(importUi, /layoutBreakingPresetIssues/);
	assert.match(importUi, /entry\.status === "incompatible" && entry\.resolved\?\.status !== "ok"/);
	assert.match(importUi, /confirmUnsafeDashboardLayoutImport/);
	assert.match(importUi, /useValueOnly/);
	assert.match(theme, /\.aa-dashboard-import-risk-confirm \{/);
	assert.match(enLocale, /"layoutBreakWarningTitle"/);
	assert.match(zhLocale, /"layoutBreakWarningTitle"/);
});

test("dashboard toolbar and dialogs call the files presets instead of layouts", () => {
	for (const sourceText of [dashboardView, importUi]) {
		assert.match(sourceText, /Export preset/);
		assert.match(sourceText, /Import preset/);
	}
	for (const locale of [enLocale, zhLocale]) {
		const parsed = JSON.parse(locale);
		assert.doesNotMatch(parsed.aaalice.workspace.preset.export, /layout|布局/i);
		assert.doesNotMatch(parsed.aaalice.workspace.preset.import, /layout|布局/i);
	}
});

test("preset compatibility dialog names sidebar components instead of exposing binding ids", () => {
	assert.match(runtime, /export function dashboardPresetIssueLocations/);
	assert.match(importUi, /dashboardPresetIssueLocations\(dashboard, entry\)/);
	assert.match(importUi, /isModelResourceBinding\(entry\.binding, \(entry\.presetSaved \|\| entry\.saved\)\?\.payload/);
	assert.match(importUi, /latestPlan\.issues\.filter\(\(entry\) => entry\.applySaved === true\)/);
	assert.match(importUi, /confirmPartialDashboardPreset\(\{ \.\.\.latestPlan, issues: modelIssues \}/);
	assert.doesNotMatch(importUi, /entry\.binding\?\.controlId \|\| entry\.key/);
	assert.doesNotMatch(importUi, /reasons\[entry\.reason\] \|\| entry\.reason/);
	assert.doesNotMatch(importUi, /labels\[entry\.status\] \|\| entry\.status/);
	assert.match(workspaceTheme, /\.aa-value-preset-issue__location/);
	for (const locale of [enLocale, zhLocale]) {
		assert.match(locale, /"reasonMissingOption"/);
		assert.match(locale, /"reasonMissingModelOption"/);
		assert.match(locale, /"modelUnavailable"/);
		assert.match(locale, /"modelPathFound"/);
		assert.match(locale, /"modelPathAmbiguous"/);
		assert.match(locale, /"reasonAmbiguousModelOption"/);
		assert.match(locale, /"reasonModelPathMatch"/);
		assert.match(locale, /"applyPresetModels"/);
		assert.match(locale, /"locationPage"/);
		assert.match(locale, /"attention"/);
		assert.match(locale, /"removedComponent"/);
	}
});
