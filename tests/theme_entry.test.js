import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { readStyleEntry } from "./helpers/style_source.js";

const ENTRY = new URL("../js/lib/theme.css", import.meta.url);
const EXPECTED_IMPORTS = [
	"theme-controls.css",
	"theme-quick-group-manager.css",
	"theme-prompt-selector.css",
	"theme-workspace.css",
	"theme-dashboard-layout.css",
	"theme-value-profiles.css",
	"theme-group-navigation-wheel.css",
	"theme-library.css",
	"theme-booru-gallery.css",
	"theme-booru-gallery-detail.css",
	"theme-resolution-preset.css",
	"theme-surface-policy.css",
	"theme-node-tools.css",
	"theme-discord-entry.css",
	"theme-discord-picker.css",
	"theme-discord-account.css",
	"theme-dashboard-quick-group.css",
	"theme-discord-motion.css",
	"theme-focus-on-open.css",
];

test("the sole feature style entry preserves the reviewed cascade order", () => {
	const source = readFileSync(ENTRY, "utf8");
	const imports = [...source.matchAll(/@import url\("\.\/(.+?)"\);/g)].map((match) => match[1]);
	assert.deepEqual(imports, EXPECTED_IMPORTS);
	for (const filename of imports) assert.equal(existsSync(new URL(filename, ENTRY)), true, filename);
});

test("the package entry injects only the shared UI and feature style manifests", () => {
	const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
	assert.match(extension, /\["ui\.css", "theme\.css"\]/);
	for (const filename of EXPECTED_IMPORTS) assert.doesNotMatch(extension, new RegExp(filename.replaceAll(".", "\\.")));
});

test("the resolved feature style cascade retains representative domain rules", () => {
	const styles = readStyleEntry(ENTRY);
	for (const selector of [
		".aa-control-numeric",
		".aaalice-qgm",
		".aa-prompt-selector",
		".aa-workspace",
		".aa-library-filters",
		".aa-gallery",
		".aa-resolution-preset",
		".aa-krita",
		".aa-discord-share-entry",
	]) assert.match(styles, new RegExp(selector.replaceAll(".", "\\.")));
});
