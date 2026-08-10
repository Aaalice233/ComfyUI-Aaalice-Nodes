import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleEntry } from "./helpers/style_source.js";

const source = fs.readFileSync(new URL("../js/lib/booru_gallery_settings.js", import.meta.url), "utf8");
const gallerySource = fs.readFileSync(new URL("../js/booru_gallery.js", import.meta.url), "utf8");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));
const uiStyles = fs.readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");
const zhLocale = JSON.parse(fs.readFileSync(new URL("../locales/zh/main.json", import.meta.url), "utf8"));

test("gallery settings use focused sections and explicit account states", () => {
	const settingsEntrySource = source.slice(source.indexOf("function registerSettings"));
	assert.match(source, /value: "accounts"/);
	assert.match(source, /data-page": "accounts"/);
	assert.match(source, /data-page": "browse"/);
	assert.match(source, /data-page": "prompt"/);
	assert.match(source, /data-page": "performance"/);
	assert.match(source, /is-configured/);
	assert.match(source, /needs-setup/);
	assert.match(source, /is-testing/);
	assert.match(source, /className: "aa-gallery-settings__nav-item"/);
	assert.match(source, /className: `aa-gallery-settings__source-tab /);
	assert.match(source, /className: "aa-gallery-settings__source-workspace"/);
	assert.match(source, /function settingsSectionHeader\(iconName, title\)/);
	assert.doesNotMatch(source, /settingsSectionHeader\([^\n]*settings\.(?:sourcesHint|browseHint|promptHint|performanceHint)/);
	const settingsSource = source.slice(source.indexOf("async function openSettingsDialog"), source.indexOf("function registerSettings"));
	assert.doesNotMatch(settingsSource, /settings\.excluded|Default excluded prompt tags|promptDefaults\?\.excludedTags/);
	assert.match(settingsSource, /className: "aa-gallery-settings__page aa-gallery-settings__blacklist-page"/);
	assert.doesNotMatch(settingsSource, /defaultRatings|defaultRating|aa-gallery-settings__rating/);
	assert.match(settingsSource, /value: "blacklist", label: label\("settings\.blacklist"/);
	assert.match(settingsSource, /children: \[accountsPanel, browsePanel, blacklistPanel, promptPanel, performancePanel\]/);
	assert.doesNotMatch(settingsSource.slice(settingsSource.indexOf('data-page": "browse"'), settingsSource.indexOf('data-page": "blacklist"')), /blacklistCard/);
	assert.doesNotMatch(source, /className: "aa-gallery-settings__toggle-card"[^\n]*settings\.tooltipHint/);
	assert.doesNotMatch(source, /className: "aa-gallery-settings__blacklist-icon"[^\n]*settings\.blacklistIntro/);
	assert.match(source, /panel\.hidden = !active; tab\.classList\.toggle\("is-active", active\)/);
	assert.match(source, /\["ArrowUp", "ArrowDown", "Home", "End"\]/);
	assert.doesNotMatch(source, /aa-gallery-settings__hero|aa-gallery-settings__source-grid/);
	assert.match(theme, /aa-gallery-settings-page-in/);
	assert.match(theme, /\.aa-gallery-settings \{[^}]*grid-template-columns: 150px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-settings__source-workspace \{[^}]*grid-template-columns: 184px minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-gallery-settings__section-header strong \{[^}]*font-size: 13px/);
	assert.match(theme, /\.aa-gallery-settings__nav-item\.aa-ui-button \{[^}]*font-size: 12\.5px/);
	assert.match(theme, /\.aa-gallery-settings__source-tab \.aa-ui-button__label \{[^}]*font-size: 12\.5px/);
	assert.match(theme, /\.aa-gallery-settings__credential \.aa-ui-input \{[^}]*font-size: 12\.5px/);
	assert.match(theme, /\.aa-gallery-settings__page textarea \{[^}]*font-size: 11px/);
	assert.doesNotMatch(settingsSource, /aa-gallery-settings__blacklist-card[\s\S]*el\("footer"/);
	assert.match(theme, /\.aa-gallery-settings__blacklist-card \{[^}]*border: 0;[^}]*background: color-mix/);
	assert.doesNotMatch(theme, /aa-gallery-settings__hero|aa-gallery-settings__source-grid/);
	assert.match(settingsEntrySource, /cell\.append\(button\(\{ label: label\("settings\.open", "Configure Gallery…"\)/);
	assert.doesNotMatch(settingsEntrySource, /aa-gallery-settings-entry|settings\.introTitle|variant: "primary"/);
	assert.doesNotMatch(uiStyles, /aa-gallery-settings-entry/);
	assert.doesNotMatch(theme, /aa-gallery-settings-entry/);
	assert.equal(zhLocale.aaalice.gallery.settings.entry, "Booru 画廊");
	assert.equal(zhLocale.aaalice.gallery.settings.open, "配置画廊…");
	assert.doesNotMatch(JSON.stringify(zhLocale.aaalice.gallery), /图库/);
});

test("shared inputs override native beveled browser styling", () => {
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input \{[^}]*appearance: none;[^}]*-webkit-appearance: none;[^}]*border: 1px solid transparent;[^}]*border-radius: 8px;[^}]*box-shadow: var\(--aa-ui-edge-shadow-inset\)/s);
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input:focus[^}]*box-shadow: var\(--aa-ui-edge-shadow-active\), 0 0 0 3px/s);
	assert.match(uiStyles, /\.aa-ui-input\.aa-ui-input:-webkit-autofill[^}]*-webkit-text-fill-color: var\(--aa-ui-text\)/s);
});

test("content blacklist is a backend filter with visible settings feedback", () => {
	assert.match(source, /className: "aa-gallery-settings__blacklist-card"/);
	assert.match(source, /settings\.blacklistCount/);
	assert.doesNotMatch(source, /map\(\(tag\) => `-\$\{tag\}`\)/);
	assert.match(gallerySource, /function tagLines\(value\) \{ return \[\.\.\.new Set\(parseTagListValue\(value\)\)\]; \}/);
	assert.match(theme, /\.aa-gallery-settings__blacklist-card/);
});
