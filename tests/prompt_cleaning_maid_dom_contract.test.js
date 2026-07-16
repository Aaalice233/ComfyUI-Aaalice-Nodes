import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/prompt_cleaning_maid.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../js/lib/ui.js", import.meta.url), "utf8");
const uiStyles = readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");

test("mounts one synchronous non-serializing DOM widget across lifecycles", () => {
	assert.match(source, /addDOMWidget\(WIDGET/);
	assert.match(source, /serialize:\s*false/);
	assert.match(source, /beforeRegisterNodeDef/);
	assert.match(source, /nodeCreated/);
	assert.match(source, /loadedGraphNode/);
	assert.match(source, /onConfigure/);
	assert.match(source, /onRemoved/);
	assert.doesNotMatch(source, /setInterval\s*\(/);
});

test("injects internal config instead of exposing settings as schema widgets", () => {
	assert.match(source, /promptNode\.inputs\.config_json/);
	assert.match(source, /promptCleaningPayload/);
});

test("uses shared stable segmented, toggle and accessible popover controls", () => {
	assert.match(source, /segmentedControl\(\{/);
	assert.match(source, /toggleSwitch\(\{/);
	assert.match(source, /createAnchoredPopover\(\{/);
	assert.match(ui, /aa-ui-segmented__thumb/);
	assert.match(ui, /role:\s*"radiogroup"/);
	assert.match(ui, /role:\s*"switch"/);
	assert.match(ui, /event\.key === "Escape"/);
	assert.match(ui, /previousFocus\?\.focus/);
});

test("uses a three-position animated switcher with distinct theme-token colors", () => {
	assert.match(source, /PROMPT_MODE\.OFF, PROMPT_MODE\.NATURAL_LANGUAGE, PROMPT_MODE\.TAG_LIST/);
	assert.match(source, /settings\.disabled = disabled/);
	assert.match(ui, /--aa-ui-segment-count/);
	assert.match(ui, /--aa-ui-segment-index/);
	assert.match(uiStyles, /repeat\(var\(--aa-ui-segment-count/);
	assert.match(uiStyles, /translateX\(calc\(var\(--aa-ui-segment-index/);
	assert.match(styles, /aaalice-prompt-cleaner-segmented[\s\S]*--aa-prompt-mode-color:\s*var\(--aa-ui-muted\)/);
	assert.match(styles, /aaalice-prompt-cleaner-segmented\[data-value="natural_language"\][\s\S]*--aa-prompt-mode-color:\s*var\(--aa-ui-accent\)/);
	assert.match(styles, /aaalice-prompt-cleaner-segmented\[data-value="tag_list"\][\s\S]*--aa-prompt-mode-color:\s*var\(--aa-ui-warning\)/);
	assert.match(uiStyles, /aa-ui-segmented__thumb[\s\S]*transition:\s*transform/);
	assert.match(uiStyles, /prefers-reduced-motion:\s*reduce[\s\S]*aa-ui-segmented__thumb[\s\S]*transition:\s*none/);
});

test("commits immediate changes and keeps resize minimum content-derived", () => {
	assert.match(source, /beforeChange/);
	assert.match(source, /afterChange/);
	assert.match(source, /Math\.max\(DEFAULT_WIDTH, Number\(computed\[0\]\)/);
	assert.doesNotMatch(source, /this\.size/);
	assert.match(styles, /aaalice-prompt-cleaner-settings-button[\s\S]*32px/);
});

test("disables duplicate matching controls without discarding their values", () => {
	assert.match(source, /definition\?\.\[3\]/);
	assert.match(source, /control\.setDisabled/);
	assert.doesNotMatch(source, /delete state\.settings/);
});
