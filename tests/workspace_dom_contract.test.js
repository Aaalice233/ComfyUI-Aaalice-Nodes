import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");
const selector = readFileSync(join(ROOT, "js", "prompt_selector.js"), "utf8");
const providers = readFileSync(join(ROOT, "js", "lib", "control_providers.js"), "utf8");
const components = readFileSync(join(ROOT, "js", "lib", "workspace_components.js"), "utf8");
const theme = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

test("workspace is an official left sidebar with reusable component boundaries", () => {
	assert.match(workspace, /registerSidebarTab/);
	assert.match(workspace, /id: TAB_ID/);
	assert.match(workspace, /createWorkspaceShell/);
	assert.match(workspace, /createSectionCard/);
	assert.match(workspace, /createControlCard/);
	assert.match(workspace, /app\.graph\.extra|graph\.extra/);
});

test("node context-menu add is independent from layout edit mode", () => {
	assert.match(workspace, /function patchNodeMenu/);
	assert.match(workspace, /📌 Add controls to sidebar/);
	const menuBody = workspace.match(/function patchNodeMenu[\s\S]*?\n}/)?.[0] || "";
	assert.doesNotMatch(menuBody, /editMode/);
	assert.match(workspace, /editMode \?[^\n]*Done/);
});

test("providers cover generic, Aaalice and public subgraph widgets by stable host identity", () => {
	assert.match(providers, /HOST_ID_PROPERTY/);
	assert.match(providers, /aaalice-parameter/);
	assert.match(providers, /generic-widget/);
	assert.match(providers, /subgraph-widget/);
	assert.match(providers, /isPromotedWidget/);
	assert.match(providers, /repairDuplicateHostIds/);
	assert.doesNotMatch(providers, /setInterval|setTimeout\([^)]*resolve/);
});

test("numeric control gestures preview live inside one graph history boundary", () => {
	assert.match(providers, /pointerdown/);
	assert.match(providers, /setValue\(next, \{ transaction: false \}\)/);
	assert.match(providers, /pointerup/);
	assert.match(providers, /beforeChange/);
	assert.match(providers, /afterChange/);
});

test("PromptSelector injects live library text and exposes list management", () => {
	assert.match(selector, /materializePromptPayload/);
	assert.match(selector, /selection_payload_json/);
	assert.match(selector, /type = "checkbox"/);
	assert.match(selector, /openSelectedEditor/);
	assert.match(selector, /draggable: true/);
	assert.match(selector, /Prompt separator/);
});

test("workspace uses event-driven refresh without polling", () => {
	assert.match(workspace, /addEventListener\("graphChanged"/);
	assert.match(workspace, /requestAnimationFrame/);
	assert.doesNotMatch(workspace, /setInterval/);
});

test("workspace visual hierarchy uses the dedicated sidebar icon and active section rail", () => {
	assert.match(workspace, /icon: "pi pi-objects-column"/);
	assert.match(workspace, /IntersectionObserver/);
	assert.match(workspace, /_aaaliceSectionObserver\?\.disconnect/);
	assert.match(components, /aa-workspace-brand-mark/);
	assert.match(components, /aa-control-card-indicator/);
	assert.match(theme, /\.aa-dashboard-dot\.is-active/);
});

test("PromptSelector exposes scannable selected and category states", () => {
	assert.match(selector, /aa-prompt-selector-toolbar/);
	assert.match(selector, /aa-prompt-selector-search-toggle/);
	assert.match(selector, /aa-prompt-selector-search/);
	assert.match(selector, /queueMicrotask/);
	assert.match(selector, /renderPromptEntries/);
	assert.match(selector, /aa-prompt-selector-title/);
	assert.match(selector, /aa-prompt-selector-summary/);
	assert.match(selector, /aa-prompt-selector-count/);
	assert.match(selector, /aa-prompt-selector-empty/);
	assert.match(selector, /isSelected \? " is-selected"/);
	assert.match(theme, /grid-template-columns: 34px repeat\(2, minmax\(0, 1fr\)\)/);
	assert.match(theme, /\.aa-prompt-selector-toolbar\.is-searching \{ grid-template-columns: minmax\(0, 1fr\); \}/);
	assert.match(theme, /\.dom-widget:has\(> \.aa-prompt-selector\) \{ pointer-events: none !important; \}/);
	assert.match(theme, /\.aa-prompt-selector\.is-resizing, \.aa-prompt-selector\.is-resizing \* \{ pointer-events: none !important; \}/);
	assert.match(theme, /\.aa-prompt-selector-row\.is-selected/);
});

test("workspace empty states and compact action bars keep narrow sidebars deliberate", () => {
	assert.match(components, /pages\.length \? "" : " is-empty"/);
	assert.match(workspace, /aa-dashboard-toolbar/);
	assert.match(workspace, /aa-library-toolbar/);
	assert.match(workspace, /iconName: "download"/);
	assert.match(workspace, /iconName: "upload"/);
	assert.match(workspace, /aa-workspace-empty aa-dashboard-empty/);
	assert.match(workspace, /aa-workspace-empty aa-library-empty/);
	assert.match(theme, /\.aa-dashboard-pages\.is-empty \{ display: none; \}/);
	assert.match(theme, /\.aa-library-filters > input \{ grid-column: 1 \/ -1; \}/);
});
