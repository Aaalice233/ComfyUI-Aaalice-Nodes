import assert from "node:assert/strict";
import fs from "node:fs";
import { readStyleEntry } from "./helpers/style_source.js";
import test from "node:test";

const ui = fs.readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));

test("shared UI exposes one edge-shadow surface vocabulary", () => {
	for (const token of ["edge-shadow", "edge-shadow-soft", "edge-shadow-inset", "edge-shadow-active"]) {
		assert.match(ui, new RegExp(`--aa-ui-${token}:`));
	}
	const tokenBlock = ui.slice(ui.indexOf("--aa-ui-edge-shadow:"), ui.indexOf("--aa-ui-accent:"));
	assert.doesNotMatch(tokenBlock, /(?:inset )?0 0 0 1px/);
	for (const selector of ["aa-ui-dialog", "aa-ui-popover", "aa-ui-segmented", "aa-ui-listbox-select__trigger", "aa-ui-input\\.aa-ui-input", "aa-ui-multiselect"]) {
		const start = ui.search(new RegExp(`\\.${selector} \\{`));
		assert.notEqual(start, -1, `${selector} must exist`);
		const rule = ui.slice(start, ui.indexOf("}", start) + 1);
		assert.match(rule, /border: 1px solid transparent/);
		assert.match(rule, /box-shadow: var\(--aa-ui-edge-shadow/);
	}
});

test("business surfaces inherit the centralized edge-shadow policy", () => {
	const policy = theme.slice(theme.indexOf("Shared surface policy"), theme.indexOf("@keyframes aa-gallery-search-in"));
	assert.match(policy, /\.aa-dashboard-group/);
	assert.match(policy, /\.aa-prompt-selector-footer/);
	assert.match(policy, /\.aa-gallery-selected-row/);
	assert.match(policy, /\.aa-gallery-tag-editor__categories/);
	assert.match(policy, /border-color: transparent/);
	assert.match(policy, /var\(--aa-ui-edge-shadow-soft\)/);
	assert.match(policy, /\.aa-gallery-tag-editor__category > \.aa-ui-tag-pills/);
	assert.match(policy, /var\(--aa-gallery-category-tone\)/);
	assert.doesNotMatch(policy, /(?:inset )?0 0 0 1px/);
});

test("numeric badges share one borderless tonal elevation policy", () => {
	const start = theme.indexOf("Numeric badges use tonal elevation");
	assert.notEqual(start, -1);
	const policy = theme.slice(start, theme.indexOf("@media", start));
	for (const selector of ["aa-ui-badge", "aa-prompt-selector-count", "aa-value-preset-count", "aa-add-controls-selection-count", "aa-gallery-view-switcher__count", "aa-gallery-tag-editor__count", "aa-gallery-settings__blacklist-count"]) {
		assert.match(policy, new RegExp(`\\.${selector}`));
	}
	assert.match(policy, /border: 0;/);
	assert.match(policy, /box-shadow: 0 3px 8px/);
	assert.doesNotMatch(policy, /0 0 0 1px/);
});

test("all Aaalice hover and focus states suppress colored borders globally", () => {
	assert.match(theme, /:is\(\[class\^="aa-"\],[^\n]+\[class\^="aaalice-"\][^\n]+:is\(:hover, :focus, :focus-visible, :focus-within\),[\s\S]*border-color: transparent !important/);
	assert.match(theme, /\.aaalice-qgm-rule-search:focus \{[^}]*box-shadow: var\(--aa-ui-edge-shadow-active\)/);
	assert.match(theme, /\.aa-ui-segmented__thumb \{[^}]*border-color: transparent !important/);
	assert.match(ui, /\.aa-ui-segmented button:focus-visible \{[^}]*outline: 0;[^}]*background: color-mix/);
	assert.match(theme, /:is\(\.aa-ui-button, \.aa-ui-input,[^}]*border-color: transparent !important/);
	assert.match(theme, /\.aa-gallery-settings__nav-item\.aa-ui-button\.is-active \{[^}]*box-shadow:/);
	assert.match(theme, /\.aa-gallery-settings__source-tab\.aa-ui-button\.is-active \{[^}]*box-shadow:/);
});

test("static icons use unboxed glyph styling while icon buttons retain hit surfaces", () => {
	assert.match(theme, /:is\(\[class\$="__icon"\], \[class\*="__icon "\]\):not\(\.aa-ui-icon, \.aa-ui-button\),[\s\S]*\.aa-gallery-clear-confirm > \.aa-ui-icon \{[^}]*padding: 0 !important;[^}]*border: 0 !important;[^}]*border-radius: 0 !important;[^}]*background: transparent !important;[^}]*box-shadow: none !important;[^}]*filter: drop-shadow/);
	assert.match(theme, /\.aa-gallery-settings__section-icon \{[^}]*width: 16px;[^}]*height: 16px;[^}]*filter: drop-shadow/);
	assert.doesNotMatch(theme, /\.aa-gallery-settings__section-icon \{[^}]*(?:border|border-radius|background):/);
	assert.match(theme, /\.aa-gallery-settings__source-mark > \.aa-ui-icon \{[^}]*stroke-width: 1\.85/);
	assert.match(theme, /:not\(\.aa-ui-icon, \.aa-ui-button\)/);
});

test("collapsed searches expose a readable applied-query state", () => {
	assert.match(ui, /\.aa-ui-search-toggle\.has-query \{[^}]*background: color-mix[^}]*box-shadow: var\(--aa-ui-edge-shadow-active\)/);
	assert.match(ui, /\.aa-ui-search-toggle\.has-query::after \{[^}]*border-radius: 50%/);
	assert.match(ui, /\.aa-ui-search-summary-tooltip\.aa-ui-tooltip \{[^}]*max-width: min\(360px/);
	assert.match(ui, /\.aa-ui-search-summary__query \{[^}]*overflow-wrap: anywhere/);
	assert.match(ui, /\.aa-ui-search-collapse\.aa-ui-button > \.aa-ui-icon \{[^}]*transition: transform/);
	assert.match(ui, /\.aa-ui-search-input::\-webkit-search-cancel-button \{[^}]*width: 20px;[^}]*cursor: pointer;[^}]*transition:/);
	assert.match(ui, /\.aa-ui-search-input::\-webkit-search-cancel-button:hover \{[^}]*background-color: color-mix[^}]*transform: scale\(1\.08\)/);
});

test("user-visible CSS never drops below the ten pixel readability floor", () => {
	for (const [name, css] of [["ui.css", ui], ["theme.css", theme]]) {
		const sizes = [...css.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)].map((match) => Number(match[1]));
		assert.ok(sizes.length > 0, `${name} should declare readable type sizes`);
		assert.equal(sizes.filter((size) => size < 10).length, 0, `${name} contains text below 10px`);
	}
});
