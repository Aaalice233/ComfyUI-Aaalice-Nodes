import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("removed sidebar file transfer has no entry points; internal presets remain", () => {
	for (const path of ["js/workspace.js", "js/workspace/dashboard_view.js", "js/workspace/dashboard_presets.js"]) {
		assert.doesNotMatch(source(path), /openDashboardExport|importDashboardPreset|planDashboardPresetValueOverwrite/);
	}
	assert.match(source("js/workspace/dashboard_presets.js"), /export async function applyDashboardPreset/);
});

test("override copies await commits and retain errors inside the dialog", () => {
	const dialog = source("js/workspace/dashboard_preset_duplicate.js");
	assert.match(dialog, /await onCommitSuccess/);
	assert.match(dialog, /catch \(cause\).*error.textContent/);
	assert.match(dialog, /planRules\(profile\?\.rules/);
	assert.match(source("js/workspace/dashboard_presets.js"), /planValueProfileCopy\(base, rules/);
	assert.match(source("js/workspace.js"), /configureDashboardPresets\(\{\s*controlTitle,\s*openValueProfiles,/);
});

test("first-time profile users can import without creating an empty profile", () => {
	const view = source("js/workspace/value_profiles.js");
	const empty = view.slice(view.indexOf("if (!profile) {"), view.indexOf("const candidates = collectCandidates();", view.indexOf("if (!profile) {")));
	assert.match(empty, /onClick: importProfiles/);
});
