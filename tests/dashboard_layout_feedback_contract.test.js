import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(ROOT, ...path.split("/")), "utf8");
const interactions = source("js/lib/dashboard_interactions.js");
const workspace = source("js/workspace/dashboard_view.js");
const theme = source("js/lib/theme-dashboard-layout.css");

test("layout editing keeps one stable selection and previews the committed insertion", () => {
	assert.match(interactions, /function canUsePreciseTarget/);
	assert.match(interactions, /target\.precise = canUsePreciseTarget\(gesture, target\)/);
	assert.match(interactions, /const precise = target\.precise !== false/);
	assert.match(interactions, /resolveMarqueeSelection/);
	assert.match(interactions, /collapseOnClick/);
	assert.match(interactions, /forceReplace/);
	assert.match(interactions, /insertionDisplacements/);
	assert.match(interactions, /requestAnimationFrame\(runAutoScroll\)/);
	assert.match(interactions, /const selectionEntries = \(\) => itemElements\(\)\.map/);
	assert.match(interactions, /const entries = selectionEntries\(\); const normalized = normalizeDragSelection/);
	assert.match(interactions, /nudgeSelectionTarget\(layouts, event\.key\.slice\(5\)\.toLowerCase\(\)/);
	assert.match(interactions, /is-drop-displaced/);
	assert.match(workspace, /flowDropLabel: t\("aaalice\.workspace\.layout\.autoPlace"/);
	assert.match(workspace, /is-selection-member/);
	assert.match(theme, /:is\(\.aa-control-card, \.aa-dashboard-separator\)\.is-selection-member/);
	assert.match(theme, /aa-dashboard-drop-preview__marker/);
});

test("Dashboard controls respond to the card's real width and height", () => {
	assert.match(theme, /@container aa-dashboard-card/);
	assert.match(theme, /container:\s*aa-dashboard-card\s*\/\s*size/);
	assert.match(theme, /has-multiline-control > \.aa-control-text\.is-multiline/);
	assert.match(theme, /data-control-kind="taglist"/);
	assert.match(theme, /aa-control-image-choice/);
});
