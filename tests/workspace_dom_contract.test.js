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
const libraryStore = readFileSync(join(ROOT, "js", "lib", "library_store.js"), "utf8");
const imagePreview = readFileSync(join(ROOT, "js", "lib", "image_preview.js"), "utf8");
const ui = readFileSync(join(ROOT, "js", "lib", "ui.js"), "utf8");
const uiStyles = readFileSync(join(ROOT, "js", "lib", "ui.css"), "utf8");
const theme = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
const workspaceIcon = readFileSync(join(ROOT, "js", "assets", "aaalice-workspace.svg"), "utf8");

test("workspace is an official left sidebar with reusable component boundaries", () => {
	assert.match(workspace, /registerSidebarTab/);
	assert.match(workspace, /id: TAB_ID/);
	assert.match(workspace, /createWorkspaceShell/);
	assert.match(components, /segmentedControl/);
	assert.match(workspace, /createSectionCard/);
	assert.match(workspace, /createControlCard/);
	assert.match(workspace, /app\.graph\.extra|graph\.extra/);
});

test("shared dialogs mount immediately without obsolete open calls", () => {
	assert.match(ui, /document\.body\.append\(overlay\)/);
	assert.doesNotMatch(workspace, /dialog\.open\(\)/);
	assert.doesNotMatch(selector, /dialog\.open\(\)/);
	assert.match(workspace, /function openCardActions[\s\S]*?dialog = createDialog/);
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
	assert.match(selector, /createSelectableImagePreview/);
	assert.match(imagePreview, /input\.type = "checkbox"/);
	assert.match(selector, /openSelectedEditor/);
	assert.match(selector, /draggable: true/);
	assert.match(selector, /Prompt separator/);
	assert.match(selector, /openWorkspace\("library"\)/);
	assert.match(selector, /aa-prompt-selector-footer-actions/);
});

test("workspace uses event-driven refresh without polling", () => {
	assert.match(workspace, /addEventListener\("graphChanged"/);
	assert.match(workspace, /requestAnimationFrame/);
	assert.doesNotMatch(workspace, /setInterval/);
});

test("dashboard and library searches share a collapsible event-driven control", () => {
	assert.match(components, /export function createCollapsibleSearch/);
	assert.match(components, /aria-expanded/);
	assert.match(components, /event\.key === "Escape"/);
	assert.match(components, /queueMicrotask/);
	assert.match(workspace, /workspaceViewState = \{/);
	assert.match(workspace, /dashboard: \{ query: "", searchOpen: false, focusSearch: false \}/);
	assert.match(workspace, /viewState\.searchOpen = open; viewState\.focusSearch = open/);
	assert.doesNotMatch(workspace, /container\._aaalice(?:Dashboard|Library)(?:Query|SearchOpen|SearchShouldFocus)/);
	assert.match(workspace, /disabled: !page \|\| editMode/);
	assert.match(workspace, /sectionElement\.dataset\.searchText/);
	assert.match(workspace, /applyDashboardSearch\(value\)/);
	assert.match(workspace, /library: \{ query: "", searchOpen: false, focusSearch: false/);
	assert.match(workspace, /onInput: \(value\) => \{ query = value; viewState\.query = value; drawEntries\(\)/);
	assert.match(theme, /\.aa-workspace-search \{/);
	assert.match(workspace, /createWorkspaceToolbar\(searchOpen \? \[search\.panel\]/);
	assert.doesNotMatch(workspace, /container\.append\(toolbar, \.\.\.\(search\.panel/);
	assert.match(theme, /\.aa-dashboard-toolbar\.is-searching, \.aa-library-toolbar\.is-searching/);
	assert.match(theme, /@keyframes aa-workspace-search-open/);
	assert.match(theme, /\.aa-dashboard-body\.is-searching/);
});

test("PromptSelector can open the official sidebar directly on library management", () => {
	assert.match(workspace, /export function openWorkspace/);
	assert.match(workspace, /sidebar\.activeSidebarTabId = TAB_ID/);
	assert.match(workspace, /activeWorkspace = view/);
	assert.doesNotMatch(selector, /querySelector\([^\n]*sidebar|\.click\(\)/);
});

test("workspace visual hierarchy uses a compact shell, dedicated icon and active section rail", () => {
	assert.match(workspace, /icon: "aaalice-workspace-sidebar-icon"/);
	assert.match(workspace, /element\.classList\.add\("aa-workspace-host"\)/);
	assert.match(theme, /\.aa-workspace-host \{[^}]*height: 100%;[^}]*min-height: 0;[^}]*overflow: hidden;/);
	assert.match(theme, /\.aa-workspace \{[^}]*flex: 1;/);
	assert.match(theme, /\.aaalice-workspace-sidebar-icon[\s\S]*mask: url\("\.\.\/assets\/aaalice-workspace\.svg"\)/);
	assert.match(workspaceIcon, /viewBox="0 0 24 24"/);
	assert.match(workspaceIcon, /stroke-linecap="round"/);
	assert.doesNotMatch(workspaceIcon, /<circle/);
	assert.match(workspace, /IntersectionObserver/);
	assert.match(workspace, /_aaaliceSectionObserver\?\.disconnect/);
	assert.doesNotMatch(components, /aa-workspace-brand/);
	assert.match(components, /ariaLabel: title/);
	assert.match(components, /root\.dataset\.workspace = activeTab/);
	assert.match(components, /root\.dataset\.workspace = value/);
	assert.match(theme, /\.aa-workspace\[data-workspace="library"\] \{[^}]*--aa-ui-accent: var\(--aa-workspace-library-accent\)/);
	assert.match(theme, /--aa-ui-accent-soft: color-mix/);
	assert.match(theme, /--aa-ui-focus: var\(--aa-workspace-library-accent\)/);
	assert.match(theme, /\.aa-workspace-tabs\[data-value="library"\]/);
	assert.match(theme, /\.aa-workspace-tabs \{[^}]*display: grid;[^}]*overflow: hidden;/);
	assert.match(theme, /transform \.2s cubic-bezier/);
	assert.doesNotMatch(workspace.match(/function renderWorkspace[\s\S]*?\n}/)?.[0] || "", /scheduleRender/);
	assert.match(components, /aa-control-card-indicator/);
	assert.match(theme, /\.aa-dashboard-dot\.is-active/);
});

test("PromptSelector exposes scannable selected and category states", () => {
	assert.match(selector, /aa-prompt-selector-toolbar/);
	assert.match(selector, /aa-prompt-selector-search-toggle/);
	assert.match(selector, /aa-prompt-selector-search/);
	assert.match(selector, /queueMicrotask/);
	assert.match(selector, /mountPromptEntries/);
	assert.match(selector, /mountVirtualList/);
	assert.match(selector, /createSelectableImagePreview/);
	assert.match(imagePreview, /aa-image-preview-selection/);
	assert.match(imagePreview, /icon\("statusCheck"\)/);
	assert.match(selector, /aa-prompt-selector-title/);
	assert.match(selector, /aa-prompt-selector-summary/);
	assert.match(selector, /aa-prompt-selector-count/);
	assert.match(selector, /aa-prompt-selector-empty/);
	assert.match(selector, /isSelected \? " is-selected"/);
	assert.match(theme, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) 34px/);
	assert.match(theme, /\.aa-prompt-selector-toolbar\.is-searching \{ grid-template-columns: minmax\(0, 1fr\); \}/);
	assert.match(theme, /\.dom-widget:has\(> \.aa-prompt-selector\) \{[^}]*position: relative;[^}]*min-height: 240px;[^}]*overflow: hidden;[^}]*pointer-events: none !important;/);
	assert.match(theme, /\.aa-prompt-selector \{[^}]*position: absolute;[^}]*inset: 0;[^}]*min-height: 0;[^}]*overflow: hidden;/);
	assert.match(theme, /\.aa-prompt-selector-list \{[^}]*min-height: 0;[^}]*overflow: auto;/);
	assert.match(theme, /\.aa-prompt-selector\.is-resizing, \.aa-prompt-selector\.is-resizing \* \{ pointer-events: none !important; \}/);
	assert.match(theme, /\.aa-prompt-selector-row\.is-selected/);
	assert.match(theme, /\.aa-prompt-selector-preview:has\(input:checked\)/);
});

test("filter dropdowns reuse the shared animated select control", () => {
	assert.match(ui, /export function selectControl/);
	assert.match(ui, /aria-expanded/);
	assert.match(ui, /icon\("moveDown"/);
	assert.match(selector, /promptFilterSelect/);
	assert.match(selector, /selectControl\(\{/);
	assert.match(workspace, /className: "aa-library-filter-select"/);
	assert.match(uiStyles, /\.aa-ui-select\.is-open \.aa-ui-select__arrow/);
	assert.match(uiStyles, /padding-right: 38px/);
});

test("workspace empty states and compact action bars keep narrow sidebars deliberate", () => {
	assert.match(components, /pages\.length \? "" : " is-empty"/);
	assert.match(workspace, /aa-dashboard-toolbar/);
	assert.match(workspace, /aa-library-toolbar/);
	assert.match(workspace, /iconName: "upload", label: t\("aaalice\.workspace\.preset\.export"/);
	assert.match(workspace, /iconName: "download", label: t\("aaalice\.workspace\.preset\.import"/);
	assert.match(workspace, /iconName: "upload", label: selected\.size[\s\S]*libraryUi\.export/);
	assert.match(workspace, /iconName: "download", label: t\("aaalice\.workspace\.libraryUi\.import"/);
	assert.match(workspace, /aa-workspace-empty aa-dashboard-empty/);
	assert.match(workspace, /aa-workspace-empty aa-library-empty/);
	assert.match(theme, /\.aa-dashboard-pages\.is-empty \{ display: none; \}/);
	assert.match(theme, /\.aa-library-filters \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
});

test("library rows keep a stable thumbnail column and distinguish entry actions", () => {
	assert.match(workspace, /createImagePreview/);
	assert.match(workspace, /mountVirtualList/);
	assert.match(workspace, /closeImagePreview/);
	assert.match(workspace, /className: "aa-library-entry-edit"/);
	assert.match(workspace, /className: "aa-library-entry-delete"/);
	assert.match(theme, /\.aa-library-entry \{[^}]*grid-template-columns: auto 48px minmax\(0, 1fr\) auto/);
	assert.match(theme, /\.aa-library-entry-copy \{[^}]*justify-content: center/);
	assert.match(theme, /\.aa-library-entry-edit:hover/);
	assert.match(theme, /\.aa-library-entry-delete:hover/);
	assert.match(theme, /\.aa-image-preview-large/);
});

test("taxonomy management is a complete single-dialog workspace", () => {
	assert.match(workspace, /function openTaxonomyManager/);
	assert.doesNotMatch(workspace, /function openTaxonomyChooser|function manageTaxonomy/);
	assert.match(workspace, /segmentedControl\(\{/);
	assert.match(workspace, /aa-taxonomy-list/);
	assert.match(workspace, /editingId === item\.id/);
	assert.match(workspace, /aa-taxonomy-footer/);
	assert.match(workspace, /usageCount\(item\)/);
	assert.match(theme, /\.aa-taxonomy-dialog/);
	assert.match(theme, /\.aa-taxonomy-tabs \{[^}]*margin-inline: auto/);
	assert.match(theme, /\.aa-taxonomy-tabs\[data-value="collections"\]/);
	assert.match(theme, /--aa-taxonomy-tab-color/);
	assert.match(theme, /\.aa-taxonomy-row\.is-editing/);
});

test("import and export use one reusable review flow with explicit outcomes", () => {
	assert.match(components, /export function createTransferHero/);
	assert.match(components, /export function createTransferStats/);
	assert.match(components, /export function createTransferSection/);
	assert.match(components, /export function createTransferResult/);
	assert.match(workspace, /function openLibraryExport/);
	assert.match(workspace, /function openDashboardExport/);
	assert.match(workspace, /createTransferSection\(\{ title: t\("aaalice\.workspace\.transfer\.conflictDecisions"/);
	assert.match(workspace, /disabled: groups\.invalid\.length > 0/);
	assert.match(workspace, /presetNeedsReview/);
	assert.match(workspace, /createTransferResult\(\{ title: t\("aaalice\.workspace\.transfer\.importComplete"/);
	assert.match(libraryStore, /importPreflight\(file, \{ signal \} = \{\}\)/);
	assert.match(libraryStore, /importApply\(token, resolutions = \{\}, \{ signal \} = \{\}\)/);
	assert.match(libraryStore, /discardImport\(token\)/);
	assert.match(libraryStore, /apiURL\(`\$\{ENDPOINT\}\/export\/\$\{encodeURIComponent\(result\.token\)\}`\)/);
	assert.doesNotMatch(workspace, /response\.blob\(\)/);
	assert.match(theme, /\.aa-transfer-scope\.is-selected/);
	assert.match(theme, /\.aa-transfer-section\[open\] > summary > \.aa-ui-icon/);
	assert.match(theme, /@keyframes aa-transfer-loading/);
});
