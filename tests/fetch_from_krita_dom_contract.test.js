import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/fetch_from_krita.js", import.meta.url), "utf8");
const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");
const sharedStyles = readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");

test("loads from the sole package entry and mounts one non-serializing widget", () => {
	assert.match(extension, /import "\.\/fetch_from_krita\.js"/);
	assert.match(source, /addDOMWidget\(WIDGET/);
	assert.match(source, /serialize:\s*false/);
	assert.match(source, /nodeCreated/);
	assert.match(source, /loadedGraphNode/);
	assert.match(source, /onConfigure/);
	assert.match(source, /setup\(\)/);
	assert.doesNotMatch(source, /setInterval\s*\(/);
	assert.doesNotMatch(source, /node\.properties/);
});

test("keeps status refresh separate from execution data", () => {
	assert.match(source, /jsonRequest\(`\$\{API\}\/status`\)/);
	assert.match(source, /aaalice_krita_snapshot/);
	assert.match(source, /onExecuted/);
	assert.match(source, /execution_error/);
	assert.match(source, /execution time/i);
	assert.doesNotMatch(source, /graphToPrompt/);
});

test("uses shared UI settings and explicit bridge maintenance", () => {
	assert.match(source, /app\.ui\.settings\.addSetting/);
	assert.match(source, /category:\s*\["Aaalice Nodes", "Krita"\]/);
	assert.match(source, /createDialog/);
	assert.match(source, /iconButton/);
	assert.match(source, /app\.extensionManager\?\.toast/);
	assert.match(source, /current\.installed && !enableOnly \? "repair" : "install"/);
	assert.match(source, /current\.krita_running \|\| current\.responding/);
	assert.match(source, /Install and enable Bridge/);
	assert.match(source, /Enable Bridge/);
	assert.match(source, /Bridge installed and enabled\. Start Krita to connect\./);
	assert.doesNotMatch(source, /Python Plugin Manager/);
});

test("uses a compact studio handoff surface and preserves native node interaction", () => {
	assert.match(styles, /\.aa-krita-document\s*\{/);
	assert.match(source, /aa-krita-document__facts/);
	assert.match(source, /aa-krita-footer__icon/);
	assert.match(source, /dataset\.availability/);
	assert.match(styles, /--aa-ui-node-accent/);
	assert.match(styles, /--aa-krita-tone/);
	assert.match(styles, /\.aa-krita-status\s*\{[^}]*background:/);
	assert.match(styles, /\.aa-krita-document\s*\{[^}]*linear-gradient/);
	assert.doesNotMatch(styles, /\.aa-krita-document::after/);
	assert.doesNotMatch(styles, /\.aa-krita-document\s*\{[^}]*var\(--aa-krita-tone\)[^}]*background:/);
	assert.match(styles, /\.aa-krita-document__facts/);
	assert.match(sharedStyles, /\.aa-krita,/);
	assert.match(sharedStyles, /\.aa-krita-settings,/);
	assert.match(sharedStyles, /\.aa-krita \*/);
	assert.match(styles, /\.dom-widget:has\(> \.aa-krita\) \{ pointer-events: none !important; \}/);
	assert.match(styles, /\.aa-krita\.is-resizing, \.aa-krita\.is-resizing \* \{ pointer-events: none !important;/);
	assert.match(styles, /\.aa-krita \{[^}]*min-height: 142px;[^}]*padding: 6px 8px 22px;/);
	assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.aa-krita/);
	assert.doesNotMatch(styles, /aa-krita[^}]*font-size:\s*[0-9](?:\.[0-9]+)?px/);
});
