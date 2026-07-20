import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/resolution_preset.js", import.meta.url), "utf8");
const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");

test("loads from the sole frontend entry and mounts one non-serializing DOM widget", () => {
	assert.match(extension, /import "\.\/resolution_preset\.js"/);
	assert.match(source, /addDOMWidget\(WIDGET/);
	assert.match(source, /serialize:\s*false/);
	assert.match(source, /nodeCreated/);
	assert.match(source, /loadedGraphNode/);
	assert.match(source, /onConfigure/);
	assert.match(source, /setup\(\)/);
	assert.doesNotMatch(source, /setInterval\s*\(/);
});

test("injects workflow-owned exact dimensions into the prompt", () => {
	assert.match(source, /promptNode\.inputs\.resolution_json/);
	assert.match(source, /resolutionPayload\(stateFor\(node\)\)/);
});

test("uses three real accessible handles and one graph history boundary per pointer gesture", () => {
	assert.match(source, /aa-resolution-handle--width/);
	assert.match(source, /aa-resolution-handle--height/);
	assert.match(source, /aa-resolution-handle--both/);
	assert.match(source, /setPointerCapture/);
	assert.match(source, /pointercancel/);
	assert.match(source, /graph\?\.beforeChange/);
	assert.match(source, /graph\?\.afterChange/);
	assert.match(source, /keyEvent\.key === "Escape"/);
});

test("uses shared popovers dialogs icon buttons and resize passthrough", () => {
	assert.match(source, /createAnchoredPopover/);
	assert.match(source, /createDialog/);
	assert.match(source, /\bel\s*,\s*field\s*,\s*iconButton/);
	assert.match(source, /iconName:\s*"swap"/);
	assert.match(source, /iconName:\s*"save"/);
	assert.match(source, /notify\("success", label\("preset\.saved"/);
	assert.match(source, /notify\("error", `\$\{label\("preset\.unavailable"/);
	assert.doesNotMatch(source, /_aaResolutionSave\.disabled/);
	assert.match(source, /installDomWidgetResizePassthrough\(node, root\)/);
});

test("keeps the stage compact theme-driven and motion-reduced", () => {
	assert.match(styles, /\.aa-resolution-preset\s*\{/);
	assert.match(styles, /--aa-ui-node-accent/);
	assert.match(source, /canvasDimensions\(stateFor\(node\), x, y, mode\)/);
	assert.match(source, /aa-resolution-artboard/);
	assert.match(source, /index < 352/);
	assert.match(styles, /grid-template-columns: repeat\(22/);
	assert.match(styles, /grid-template-rows: repeat\(16/);
	assert.match(source, /selectionFractions/);
	assert.match(styles, /\.aa-resolution-selection[\s\S]*bottom: 0;[\s\S]*left: 0;/);
	assert.doesNotMatch(styles, /\.aa-resolution-(?:stage|plane|selection)[^}]*gradient/);
	assert.match(styles, /\.aa-resolution-handle::before/);
	assert.match(styles, /\.aa-resolution-handle--height::before[^}]*--aa-ui-danger/);
	assert.match(styles, /\.aa-resolution-handle--both::before[^}]*--aa-ui-text/);
	assert.match(styles, /aa-resolution-selection[\s\S]*transition: width \.16s/);
	assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*aa-resolution-preset/);
	assert.doesNotMatch(styles, /aa-resolution[^}]*font-size:\s*[0-9](?:\.[0-9]+)?px/);
});

test("places compact manual inputs inside the drag stage footer", () => {
	assert.match(source, /aa-resolution-stage-editor/);
	assert.match(source, /setAttribute\("aria-label", label\(`input\.\$\{dimension\}`/);
	assert.match(source, /children: \[editor, ratio\]/);
	assert.match(source, /children: \[toolbar, stage\]/);
	assert.match(source, /aa-resolution-number-marker/);
	assert.match(source, /aa-resolution-number-feedback/);
	assert.match(styles, /\.aa-resolution-stage__summary \{[^}]*height: 24px;[^}]*background: transparent;[^}]*box-shadow: none;/);
	assert.match(styles, /\.aa-resolution-stage-field \.aa-resolution-number-input \{[^}]*width: 50px;[^}]*height: 20px;/);
	assert.match(styles, /\.aa-resolution-number-feedback\[hidden\] \{ display: none !important; \}/);
	assert.doesNotMatch(source, /aa-resolution-output-fields/);
});

test("reserves the bottom resize corners and keeps the preset trigger compact", () => {
	assert.match(styles, /\.dom-widget:has\(> \.aa-resolution-preset\) \{ pointer-events: none !important; \}/);
	assert.match(styles, /\.aa-resolution-preset\.is-resizing, \.aa-resolution-preset\.is-resizing \* \{ pointer-events: none !important;/);
	assert.match(styles, /\.aa-resolution-preset \{[^}]*padding: 7px 8px 22px;/);
	assert.match(source, /aa-resolution-toolbar[^\n]*preset, alignment, range, tools/);
	assert.doesNotMatch(source, /aa-resolution-stage__chips/);
	assert.match(source, /textContent = `\$\{state\.alignment\} px`/);
	assert.match(source, /textContent = `≤ \$\{state\.canvasMax\}`/);
	assert.match(source, /setAttribute\("aria-label", alignmentLabel\)/);
	assert.match(source, /setAttribute\("aria-label", rangeLabel\)/);
	assert.match(styles, /\.aa-resolution-toolbar \{[^}]*width: 100%;/);
	assert.match(styles, /\.aa-resolution-preset-trigger\.aa-ui-button \{[^}]*width: auto;[^}]*max-width: none;[^}]*flex: 1 1 auto;/);
	assert.match(styles, /\.aa-resolution-tool-action\.aa-ui-button \{[^}]*width: 32px;[^}]*height: 30px;/);
});
