import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");
const selector = readFileSync(join(ROOT, "js", "prompt_selector.js"), "utf8");
const providers = readFileSync(join(ROOT, "js", "lib", "control_providers.js"), "utf8");
const workspaceControls = readFileSync(join(ROOT, "js", "lib", "workspace_controls.js"), "utf8");
const components = readFileSync(join(ROOT, "js", "lib", "workspace_components.js"), "utf8");
const dashboardComponents = readFileSync(join(ROOT, "js", "lib", "dashboard_components.js"), "utf8");
const dashboardInteractions = readFileSync(join(ROOT, "js", "lib", "dashboard_interactions.js"), "utf8");
const dashboardCommands = readFileSync(join(ROOT, "js", "lib", "dashboard_commands.js"), "utf8");
const dashboardLayout = readFileSync(join(ROOT, "js", "lib", "dashboard_layout.js"), "utf8");
const dashboardSizing = readFileSync(join(ROOT, "js", "lib", "dashboard_sizing.js"), "utf8");
const libraryStore = readFileSync(join(ROOT, "js", "lib", "library_store.js"), "utf8");
const imagePreview = readFileSync(join(ROOT, "js", "lib", "image_preview.js"), "utf8");
const imageUpload = readFileSync(join(ROOT, "js", "lib", "image_upload.js"), "utf8");
const promptEntryDetails = readFileSync(join(ROOT, "js", "lib", "prompt_entry_details.js"), "utf8");
const categoryColor = readFileSync(join(ROOT, "js", "lib", "category_color.js"), "utf8");
const ui = readFileSync(join(ROOT, "js", "lib", "ui.js"), "utf8");
const uiStyles = readFileSync(join(ROOT, "js", "lib", "ui.css"), "utf8");
const theme = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
const workspaceIcon = readFileSync(join(ROOT, "js", "assets", "aaalice-workspace.svg"), "utf8");

test("workspace is an official left sidebar with reusable component boundaries", () => {
	assert.match(workspace, /registerSidebarTab/);
	assert.match(workspace, /id: TAB_ID/);
	assert.match(workspace, /function installWorkspaceCanvasAutoClose/);
	assert.match(workspace, /canvas\.addEventListener\("click"/);
	assert.match(workspace, /sidebar\.activeSidebarTabId === TAB_ID/);
	assert.match(workspace, /sidebar\.toggleSidebarTab\(TAB_ID\)/);
	assert.match(workspace, /createWorkspaceShell/);
	assert.match(components, /segmentedControl/);
	assert.match(workspace, /createDashboardGrid/);
	assert.match(workspace, /bindDashboardInteractions/);
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
	assert.doesNotMatch(providers, /document\.|addEventListener|createNumericEditor|createImageUploadControl|selectControl|toggleSwitch/);
});

test("numeric control gestures preview live inside one graph history boundary", () => {
	assert.match(workspaceControls, /pointerdown/);
	assert.match(workspaceControls, /setValue\(next, \{ transaction: false, transient: true \}\)/);
	assert.match(providers, /flushValue/);
	assert.match(providers, /node\._aaaliceParameterRedraw\?\.\(\)/);
	assert.match(workspaceControls, /pointerup/);
	assert.match(workspaceControls, /beforeChange/);
	assert.match(workspaceControls, /afterChange/);
	assert.match(workspaceControls, /aa-workspace-numeric-control/);
	assert.match(workspaceControls, /--aa-shared-range-progress/);
	assert.match(workspaceControls, /range\.className = "aa-shared-range"/);
	assert.match(uiStyles, /\.aa-shared-range::\-webkit-slider-runnable-track/);
	assert.match(workspaceControls, /root\.headerAccessories = \[valueButton\]/);
	assert.match(workspaceControls, /createNumericEditor/);
	assert.match(workspaceControls, /addEventListener\("wheel"/);
	assert.match(workspaceControls, /event\.shiftKey \? 10 : 1/);
	assert.match(workspaceControls, /passive: false/);
	assert.match(theme, /\.aa-workspace-numeric-value/);
	assert.match(uiStyles, /::-webkit-slider-runnable-track/);
	assert.match(components, /control\?\.headerAccessories/);
});

test("dashboard image controls share upload, drop, thumbnail, and preview behavior", () => {
	assert.match(workspaceControls, /function createImageControl/);
	assert.match(workspaceControls, /aa-workspace-image-control/);
	assert.match(workspaceControls, /createImageUploadControl\(\{/);
	assert.match(workspaceControls, /resolved\.setValue\(null\)/);
	assert.match(imagePreview, /export function bindImagePreview/);
	assert.match(imageUpload, /export function isImageFile/);
	assert.match(imageUpload, /export async function uploadImageFile/);
	assert.match(imageUpload, /export function bindImageDropTarget/);
	assert.match(imageUpload, /export function createImageUploadControl/);
	assert.match(imageUpload, /bindImagePreview\(button, source,[^\n]*immediate: true/);
	assert.match(workspace, /notifyWorkspaceImageUpload/);
	assert.match(theme, /\.aa-image-upload-button > img\s*\{[^}]*object-fit:\s*cover/s);
	assert.match(theme, /\.aa-image-upload-button\.is-drop-target/);
	assert.match(theme, /\.aa-image-upload-control:hover \.aa-image-upload-clear/);
	assert.match(theme, /\.aa-image-upload-control\s*\{[^}]*height:\s*32px/s);
});

test("seed lock state reuses one shared control across the node and dashboard", () => {
	const parameterControls = readFileSync(join(ROOT, "js", "lib", "parameter_controls.js"), "utf8");
	const parameterPanel = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	assert.match(parameterControls, /export function createSeedModeControl/);
	assert.match(parameterControls, /control\.setLocked/);
	assert.match(parameterControls, /aria-pressed/);
	assert.match(parameterPanel, /createSeedModeControl\(\{/);
	assert.match(workspaceControls, /createSeedModeControl\(\{/);
	assert.match(providers, /control_after_generate = locked \? "fixed" : "randomize"/);
	assert.match(theme, /\.aa-workspace-seed-mode\.aa-ui-button\.is-locked/);
});

test("dashboard enum and boolean controls reuse the shared themed controls", () => {
	assert.match(workspaceControls, /selectControl\(\{/);
	assert.match(workspaceControls, /toggleSwitch\(\{/);
	assert.match(components, /root\.dataset\.controlKind/);
	assert.match(theme, /\.aa-workspace-enum-control/);
	assert.match(theme, /\.aa-workspace-boolean-control/);
});

test("control cards move management into an accessible context menu", () => {
	const cardBody = components.match(/export function createControlCard[\s\S]*?\n}/)?.[0] || "";
	assert.match(ui, /export function createContextMenu/);
	assert.match(ui, /role: "menu"/);
	assert.match(ui, /setAttribute\("role", "menuitem"\)/);
	assert.match(ui, /ArrowUp/);
	assert.match(ui, /window\.innerWidth - rect\.width/);
	assert.match(cardBody, /addEventListener\("contextmenu"/);
	assert.match(cardBody, /event\.key !== "ContextMenu"/);
	assert.match(cardBody, /preservesNativeEditing/);
	assert.doesNotMatch(cardBody, /iconButton\(/);
	assert.match(workspace, /function openCardActions/);
	assert.match(workspace, /createContextMenu\(\{ x, y/);
	assert.match(workspace, /danger: true/);
	assert.match(uiStyles, /\.aa-ui-context-menu__item\.is-danger/);
});

test("header-only seed controls do not stretch to the neighboring slider card", () => {
	assert.match(workspaceControls, /root\.dataset\.headerOnly = String\(!hasRange\)/);
	assert.match(components, /control\?\.dataset\?\.headerOnly === "true"/);
	assert.match(theme, /\.aa-dashboard-grid-v2, \.aa-dashboard-group-grid \{[^}]*grid-auto-rows: 4px;[^}]*align-items: stretch;/);
	assert.match(theme, /\.aa-control-card\.is-header-only \{[^}]*padding-block: 7px;/);
	assert.match(theme, /\.aa-control-card\.is-header-only \.aa-workspace-numeric-value \{[^}]*min-width: 64px;[^}]*flex: 1;/);
	assert.match(theme, /\.aa-workspace-numeric-value \{[^}]*text-align: center;/);
});

test("PromptSelector injects live library text and exposes inline weight management", () => {
	assert.match(selector, /materializePromptPayload/);
	assert.match(selector, /selection_payload_json/);
	assert.match(selector, /createSelectableImagePreview/);
	assert.match(imagePreview, /input\.type = "checkbox"/);
	assert.doesNotMatch(selector, /openSelectedEditor|aa-prompt-selected-editor|draggable: true/);
	assert.match(selector, /function promptWeightControl/);
	assert.match(selector, /event\.deltaY < 0/);
	assert.match(selector, /event\.shiftKey \? \.01 : \.1/);
	assert.match(selector, /if \(value !== 1\) commit\(1, true\)/);
	assert.match(selector, /_aaalicePromptWeightFocusEntryId/);
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
	assert.match(workspace, /dashboard: \{ query: "", searchOpen: false, focusSearch: false, pageRailExpanded: false, selectedItemIds: new Set\(\)/);
	assert.match(workspace, /viewState\.searchOpen = open; viewState\.focusSearch = open/);
	assert.doesNotMatch(workspace, /container\._aaalice(?:Dashboard|Library)(?:Query|SearchOpen|SearchShouldFocus)/);
	assert.match(workspace, /disabled: !page \|\| editMode/);
	assert.match(workspace, /item\.dataset\.searchText/);
	assert.match(workspace, /applyDashboardSearch\(value\)/);
	assert.match(workspace, /library: \{ query: "", searchOpen: false, focusSearch: false/);
	assert.match(workspace, /onInput: \(value\) => \{ query = value; viewState\.query = value; drawEntries\(\)/);
	assert.match(theme, /\.aa-workspace-search \{/);
	assert.match(workspace, /createWorkspaceToolbar\(searchOpen \? \[search\.panel\]/);
	assert.doesNotMatch(workspace, /container\.append\(toolbar, \.\.\.\(search\.panel/);
	assert.match(theme, /\.aa-dashboard-toolbar\.is-searching, \.aa-library-toolbar\.is-searching/);
	assert.match(theme, /@keyframes aa-workspace-search-open/);
	assert.match(workspace, /pageRail\.hidden = Boolean\(needle\)/);
});

test("PromptSelector can open the official sidebar directly on library management", () => {
	assert.match(workspace, /export function openWorkspace/);
	assert.match(workspace, /sidebar\.activeSidebarTabId = TAB_ID/);
	assert.match(workspace, /activeWorkspace = view/);
	assert.doesNotMatch(selector, /querySelector\([^\n]*sidebar|\.click\(\)/);
	assert.match(workspace, /export async function openPromptLibraryEntryEditor\(entryId\)/);
	assert.match(workspace, /snapshot\.entries\.find\(\(item\) => item\.id === entryId\)/);
	assert.match(workspace, /entryEditor\(entry\)/);
	assert.match(selector, /openPromptLibraryEntryEditor\(entry\.id\)/);
	assert.match(selector, /className: "aa-prompt-selector-edit"/);
	assert.match(selector, /className: `aa-prompt-selector-favorite\$\{isFavorite \? " is-active" : ""\}`/);
	assert.match(selector, /openFavoritePicker\(entry\)/);
	assert.match(selector, /updateEntry\(entry\.id, \{ collectionIds: \[\] \}\)/);
	assert.match(selector, /addCollectionId: target\.value/);
	assert.match(selector, /className: "aa-prompt-selector-row-actions"/);
	assert.match(selector, /event\.preventDefault\(\); event\.stopPropagation\(\); closePromptEntryDetails\(\)/);
	assert.match(theme, /\.aa-prompt-selector-row:hover \.aa-prompt-selector-row-actions \.aa-ui-button/);
	assert.match(theme, /\.aa-prompt-selector-edit \{ color: var\(--aa-ui-accent\); \}/);
	assert.match(theme, /\.aa-prompt-selector-favorite \{[^}]*color: var\(--aa-ui-warning\);/);
	assert.match(theme, /\.aa-prompt-selector-favorite\.is-active \{[^}]*background: transparent;[^}]*box-shadow: none;/);
	assert.match(theme, /\.aa-prompt-selector-favorite\.is-active \.aa-ui-icon \{ fill: currentColor; \}/);
});

test("workspace visual hierarchy uses a compact shell, dedicated icon and active page rail", () => {
	assert.match(workspace, /icon: "aaalice-workspace-sidebar-icon"/);
	assert.match(workspace, /element\.classList\.add\("aa-workspace-host"\)/);
	assert.match(theme, /\.aa-workspace-host \{[^}]*height: 100%;[^}]*min-height: 0;[^}]*overflow: hidden;/);
	assert.match(theme, /\.aa-workspace \{[^}]*flex: 1;/);
	assert.match(theme, /\.aaalice-workspace-sidebar-icon[\s\S]*mask: url\("\.\.\/assets\/aaalice-workspace\.svg"\)/);
	assert.match(workspaceIcon, /viewBox="0 0 24 24"/);
	assert.match(workspaceIcon, /stroke-linecap="round"/);
	assert.doesNotMatch(workspaceIcon, /<circle/);
	assert.match(components, /createPageRail/);
	assert.match(components, /aa-dashboard-page-cursor/);
	assert.match(components, /root\.update = update/);
	assert.match(components, /active\.offsetTop/);
	assert.match(components, /const items = new Map\(\)/);
	assert.doesNotMatch(components, /transitionFromId|\* 27|cursorOffset/);
	assert.match(workspace, /const dashboardPageRails = new WeakMap\(\)/);
	assert.match(workspace, /pageRail\.update\(\{/);
	assert.match(components, /requestAnimationFrame/);
	assert.match(components, /aria-current/);
	assert.match(components, /addEventListener\("wheel"/);
	assert.match(components, /passive: false/);
	assert.match(components, /ArrowUp/);
	assert.match(components, /PageDown/);
	assert.doesNotMatch(components, /aa-workspace-brand/);
	assert.match(components, /ariaLabel: title/);
	assert.match(components, /root\.dataset\.workspace = activeTab/);
	assert.match(components, /root\.dataset\.workspace = value/);
	assert.match(workspace, /className: "aa-dashboard-edit-toggle"/);
	assert.match(workspace, /variant: "ghost"/);
	assert.match(workspace, /active: editMode/);
	assert.match(theme, /\.aa-dashboard-edit-toggle\.aa-ui-button\.is-active/);
	assert.match(theme, /\.aa-workspace\[data-workspace="library"\] \{[^}]*--aa-ui-accent: var\(--aa-workspace-library-accent\)/);
	assert.match(theme, /--aa-ui-accent-soft: color-mix/);
	assert.match(theme, /--aa-ui-focus: var\(--aa-workspace-library-accent\)/);
	assert.match(theme, /\.aa-workspace-tabs\[data-value="library"\]/);
	assert.match(theme, /\.aa-workspace-tabs \{[^}]*display: grid;[^}]*overflow: hidden;/);
	assert.match(theme, /transform \.2s cubic-bezier/);
	assert.doesNotMatch(workspace.match(/function renderWorkspace[\s\S]*?\n}/)?.[0] || "", /scheduleRender/);
	assert.match(components, /aa-control-card-indicator/);
	assert.match(theme, /\.aa-dashboard-page-dot\.is-active/);
	assert.match(theme, /\.aa-dashboard-page-rail:hover \.aa-dashboard-page-dot/);
	assert.match(theme, /\.aa-dashboard-page-list/);
	assert.match(theme, /\.aa-dashboard-page-rail\.is-expanded/);
	assert.match(theme, /\.aa-dashboard-page-cursor/);
	assert.match(theme, /transform \.16s cubic-bezier/);
	assert.match(theme, /\.aa-dashboard-page-dot\.is-active/);
	assert.match(theme, /margin-right: auto/);
	assert.match(theme, /justify-content: space-between/);
	assert.match(theme, /backdrop-filter: blur\(12px\)/);
});

test("PromptSelector exposes scannable selected and category states", () => {
	assert.match(selector, /aa-prompt-selector-toolbar/);
	assert.match(selector, /aa-prompt-selector-search-toggle/);
	assert.match(selector, /aa-prompt-selector-search/);
	assert.match(selector, /queueMicrotask/);
	assert.match(selector, /list\._aaaliceVirtualList\?\.setItems\(filteredEntries\(node, stateFor\(node\)\), \{ preserveScroll: false \}\)/);
	assert.match(selector, /mountPromptEntries/);
	assert.match(selector, /mountVirtualList/);
	assert.match(selector, /root\.append\(toolbar, list, footer\);\s*list\.scrollTop = listScrollTop;\s*virtualList\.refresh\(\);/s);
	assert.match(selector, /createSelectableImagePreview/);
	assert.match(imagePreview, /aa-image-preview-selection/);
	assert.match(imagePreview, /icon\("statusCheck"\)/);
	assert.match(selector, /aa-prompt-selector-title/);
	assert.match(selector, /bindPromptEntryDetails\(copy, entry\)/);
	assert.match(promptEntryDetails, /promptDetailsTooltip = createTooltip/);
	assert.match(promptEntryDetails, /PROMPT_DETAILS_HOVER_DELAY = 600/);
	assert.match(selector, /selectionSummaryTooltip = createTooltip/);
	assert.match(selector, /bindSelectionSummary\(categoryFilter\.control/);
	assert.match(selector, /bindSelectionSummary\(summary/);
	assert.match(selector, /categorySelectionSummary/);
	assert.match(selector, /selectedPromptSummary/);
	assert.match(promptEntryDetails, /aa-prompt-entry-details-prompt/);
	assert.match(promptEntryDetails, /collectionItems\(entry\.collections/);
	assert.match(selector, /aa-prompt-selector-summary/);
	assert.match(selector, /aa-prompt-selector-count/);
	assert.match(selector, /_aaalicePromptSelectedOnly/);
	assert.match(selector, /"aria-pressed": String\(selectedOnly\)/);
	assert.match(selector, /entries\.filter\(\(entry\) => selectedIds\.has\(entry\.id\)\)/);
	assert.match(selector, /countPromptSelectionsByCategory/);
	assert.match(selector, /aa-prompt-selector-clear-action/);
	assert.match(selector, /state\.selections\.length \? button/);
	assert.match(selector, /mutate\(node, clearPromptSelections\)/);
	assert.match(selector, /aa-prompt-selector-empty/);
	assert.match(selector, /isSelected \? " is-selected"/);
	assert.match(theme, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) 34px/);
	assert.match(theme, /\.aa-prompt-selector-toolbar\.is-searching \{ grid-template-columns: minmax\(0, 1fr\); \}/);
	assert.match(theme, /\.dom-widget:has\(> \.aa-prompt-selector\) \{[^}]*position: relative;[^}]*min-height: 240px;[^}]*overflow: hidden;[^}]*pointer-events: none !important;/);
	assert.match(theme, /\.aa-prompt-selector \{[^}]*position: absolute;[^}]*inset: 0;[^}]*min-height: 0;[^}]*overflow: hidden;/);
	assert.match(theme, /\.aa-prompt-selector-list \{[^}]*min-height: 0;[^}]*overflow: auto;/);
	assert.match(theme, /\.aa-prompt-selector\.is-resizing, \.aa-prompt-selector\.is-resizing \* \{ pointer-events: none !important; \}/);
	assert.match(theme, /\.aa-prompt-selector-row\.is-selected/);
	assert.match(theme, /\.aa-prompt-selector-row \{[^}]*grid-template-columns: 38px minmax\(0, 1fr\);/);
	assert.match(theme, /\.aa-prompt-selector-row-actions \{[^}]*position: absolute;/);
	assert.match(theme, /--aa-prompt-row-surface: var\(--aa-ui-accent-soft\)/);
	assert.match(theme, /linear-gradient\(90deg, transparent, var\(--aa-prompt-row-surface\) 28%\)/);
	assert.doesNotMatch(theme, /aa-prompt-selector-row-actions \{ background:[^}]*aa-ui-surface/);
	assert.match(theme, /\.aa-prompt-selector-row:has\(\.aa-prompt-selector-favorite\.is-active\) \.aa-prompt-selector-copy \{ padding-right: 62px; \}/);
	assert.match(theme, /\.aa-prompt-selector-row\.is-selected:hover \.aa-prompt-selector-copy/);
	assert.match(theme, /\.aa-prompt-selector-weight \{[^}]*cursor: ns-resize;/);
	assert.match(theme, /\.aa-prompt-selector-summary\.is-active/);
	assert.match(uiStyles, /\.aa-image-preview-selectable:has\(input:checked\)/);
	assert.match(uiStyles, /\.aa-image-preview-selectable \.aa-image-preview-selection\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--aa-ui-accent\) 18%, transparent\)/s);
	assert.match(uiStyles, /\.aa-image-preview-selectable \.aa-image-preview-selection > \.aa-ui-icon\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*var\(--aa-ui-on-media\);[^}]*stroke-width:\s*2\.5/s);
	assert.match(uiStyles, /\.aa-image-preview-selectable:has\(input:checked\) \.aa-image-preview-media > img\s*\{[^}]*filter:\s*saturate\(\.92\) brightness\(\.9\)/s);
	assert.match(theme, /\.aa-prompt-entry-details-tooltip/);
	assert.match(theme, /\.aa-prompt-selection-tooltip/);
	assert.match(theme, /\.aa-prompt-selection-summary > ol/);
	assert.match(uiStyles, /\.aa-ui-tooltip\s*\{[^}]*pointer-events:\s*none/s);
	assert.doesNotMatch(theme.match(/\.aa-image-preview-tooltip\s*\{[^}]*\}/s)?.[0] || "", /pointer-events/);
	assert.doesNotMatch(theme.match(/\.aa-prompt-entry-details-tooltip\s*\{[^}]*\}/s)?.[0] || "", /pointer-events/);
	assert.doesNotMatch(promptEntryDetails, /aa-prompt-entry-details-tooltip[^\n]*interactive:\s*true/);
	assert.match(theme, /\.aa-prompt-entry-details-prompt > p, \.aa-prompt-entry-details-note > p\s*\{[^}]*white-space:\s*pre-wrap/s);
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
	assert.match(ui, /syncOptionColor/);
	assert.match(ui, /--aa-ui-select-option-color/);
	assert.match(categoryColor, /export function categorySelectOption/);
	assert.match(selector, /value: option\.id, color: option\.color/);
	assert.match(workspace, /categories\.map\(categorySelectOption\)/);
});

test("workspace empty states and compact action bars keep narrow sidebars deliberate", () => {
	assert.match(components, /aa-dashboard-page-rail/);
	assert.match(workspace, /aa-dashboard-toolbar/);
	assert.match(workspace, /aa-library-toolbar/);
	assert.match(workspace, /iconName: "upload", label: t\("aaalice\.workspace\.preset\.export"/);
	assert.match(workspace, /iconName: "download", label: t\("aaalice\.workspace\.preset\.import"/);
	assert.match(workspace, /iconName: "upload", label: selected\.size[\s\S]*libraryUi\.export/);
	assert.match(workspace, /iconName: "download", label: t\("aaalice\.workspace\.libraryUi\.import"/);
	assert.match(workspace, /aa-workspace-empty aa-dashboard-empty/);
	assert.match(workspace, /aa-workspace-empty aa-library-empty/);
	assert.match(theme, /\.aa-dashboard-page-rail\.is-empty \{ display: none; \}/);
	assert.match(theme, /\.aa-workspace-empty\[hidden\] \{ display: none; \}/);
	assert.match(theme, /\.aa-library-filters \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
});

test("dashboard toolbar identifies the current page in its available space", () => {
	assert.match(workspace, /className: "aa-dashboard-page-name"[^\n]+role: "heading"[^\n]+"aria-current": "page"/);
	assert.match(theme, /\.aa-dashboard-page-name \{[^}]*min-width: 0;[^}]*flex: 1;/);
	assert.match(theme, /\.aa-dashboard-page-name \{[^}]*border-left: 2px solid var\(--aa-ui-accent\);[^}]*font-size: 13px;[^}]*font-weight: 700;/);
	assert.match(theme, /\.aa-dashboard-page-name > span \{[^}]*text-overflow: ellipsis;/);
});

test("Dashboard V2 replaces mandatory sections with optional grid groups", () => {
	assert.match(workspace, /createGroup\(current, page\.id/);
	assert.match(dashboardComponents, /export function createDashboardGroup/);
	assert.match(dashboardComponents, /data-dashboard-group-id/);
	assert.match(dashboardComponents, /page\.items\.filter\(\(item\) => !item\.groupId\)/);
	assert.match(dashboardLayout, /export function firstAvailableLayout/);
	assert.match(dashboardCommands, /export function deleteGroup/);
	assert.doesNotMatch(workspace, /createSection|findSection|lastSectionId|\.sections/);
	assert.doesNotMatch(components, /createSectionCard/);
	assert.doesNotMatch(theme, /aa-dashboard-section/);
});

test("Dashboard footprints are stable model hints rather than DOM measurements", () => {
	assert.match(providers, /rowSpan: recommendedControlRowSpan/);
	assert.match(dashboardSizing, /export function recommendedControlRowSpan/);
	assert.match(dashboardSizing, /export function recommendedGroupRowSpan/);
	assert.doesNotMatch(dashboardSizing, /document|getComputedStyle|ResizeObserver/);
	assert.match(dashboardLayout, /layout\.row \+ layout\.rowSpan/);
});

test("Dashboard V2 layout editing uses transient pointer gestures and one command commit", () => {
	assert.match(dashboardInteractions, /pointerdown/);
	assert.match(dashboardInteractions, /setPointerCapture/);
	assert.match(dashboardInteractions, /translate3d/);
	assert.match(dashboardInteractions, /function gridTargetAt/);
	assert.match(dashboardInteractions, /aa-dashboard-drop-preview/);
	assert.match(dashboardInteractions, /style\.gridAutoRows/);
	assert.match(dashboardInteractions, /--aa-dashboard-row-span/);
	assert.match(dashboardInteractions, /grabRowOffset/);
	assert.match(dashboardInteractions, /rawTarget\.row - gesture\.grabRowOffset/);
	assert.match(dashboardInteractions, /event\.key === "Escape"/);
	assert.match(dashboardInteractions, /onDropItems/);
	assert.doesNotMatch(dashboardInteractions, /graph\.extra|beforeChange|afterChange/);
	assert.match(workspace, /onDropItems: \(ids, target\) => updateDashboard/);
	assert.match(theme, /\.aa-dashboard-scroll \{[^}]*display: flex;[^}]*flex-direction: column;/);
	assert.match(theme, /\.aa-dashboard-grid-v2 \{[^}]*flex: 1;/);
	assert.match(theme, /\.aa-dashboard-grid-v2\.is-editing \{[^}]*min-height: 100%;/);
	assert.match(theme, /grid-row: var\(--aa-dashboard-row\) \/ span var\(--aa-dashboard-row-span\)/);
});

test("workspace list selection reuses the shared checkbox control", () => {
	assert.match(components, /checkboxControl\(\{/);
	assert.match(components, /root\.selectionControl = checkbox/);
	assert.match(ui, /export function checkboxControl/);
	assert.match(uiStyles, /\.aa-ui-checkbox\.is-checked/);
	assert.doesNotMatch(uiStyles, /\.aa-ui-dialog input\[type="checkbox"\]/);
});

test("add-controls dialog uses a compact structured picker", () => {
	assert.match(workspace, /aa-add-controls-target-grid/);
	assert.match(workspace, /aa-add-controls-section aa-add-controls-picker/);
	assert.match(workspace, /aa-add-controls-selection-count/);
	assert.match(workspace, /const pageSelect = selectControl/);
	assert.doesNotMatch(workspace, /sectionSelect|target\.section|newSection/);
	assert.match(workspace, /aa-add-controls-select-all/);
	assert.match(workspace, /binding\.selectAll/);
	assert.match(workspace, /aa-add-controls-footer-count/);
	assert.match(workspace, /confirmButton\.disabled = selected\.size === 0/);
	assert.match(workspace, /size: "md", className: "aa-add-controls-dialog-shell"/);
	assert.match(theme, /\.aa-add-controls-list \{ display: grid;/);
	assert.match(theme, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("library rows keep a stable thumbnail column and distinguish entry actions", () => {
	assert.match(workspace, /createSelectableImagePreview/);
	assert.match(workspace, /aa-library-entry-preview/);
	assert.doesNotMatch(workspace, /checkbox\.type = "checkbox"/);
	assert.match(workspace, /mountVirtualList/);
	assert.match(workspace, /closeImagePreview/);
	assert.match(workspace, /className: "aa-library-entry-edit"/);
	assert.match(workspace, /className: "aa-library-entry-delete"/);
	assert.match(workspace, /el\("label", \{ className: "aa-library-entry-copy"/);
	assert.match(workspace, /for: `aa-library-entry-\$\{entry\.id\}`/);
	assert.match(workspace, /preview\.input\.click\(\)/);
	assert.match(workspace, /bindPromptEntryDetails\(copy, entry\)/);
	assert.match(workspace, /closePromptEntryDetails\(\)/);
	assert.match(theme, /\.aa-library-entry \{[^}]*grid-template-columns: 48px minmax\(0, 1fr\) auto/);
	assert.match(theme, /\.aa-library-entry\.is-selected/);
	assert.match(uiStyles, /\.aa-image-preview-selectable:has\(input:checked\) \.aa-image-preview-selection/);
	assert.match(theme, /\.aa-library-entry-copy \{[^}]*justify-content: center/);
	assert.match(theme, /\.aa-library-entry-edit:hover/);
	assert.match(theme, /\.aa-library-entry-delete:hover/);
	assert.match(theme, /\.aa-image-preview-large/);
	assert.match(theme, /\.aa-image-preview-large > img\s*\{[^}]*width:\s*auto[^}]*max-height:/s);
	assert.match(theme, /\.aa-image-preview-large > strong\s*\{[^}]*position:\s*absolute[^}]*background:\s*color-mix\([^}]*transparent\)/s);
	assert.match(imagePreview, /IMAGE_PREVIEW_HOVER_DELAY = 600/);
	assert.match(imagePreview, /addEventListener\("load", previewTooltip\.reposition/);
});

test("library selection actions operate on model data instead of rendered rows", () => {
	assert.doesNotMatch(workspace, /openBatchEdit|libraryUi\.batch|Edit selected entries/);
	assert.match(workspace, /className: "aa-library-selection-toggle"/);
	assert.match(workspace, /for \(const entry of visibleEntries\) selected\.add\(entry\.id\)/);
	assert.match(workspace, /if \(clearsSelection\) selected\.clear\(\)/);
	assert.match(workspace, /visibleEntries\.every\(\(entry\) => selected\.has\(entry\.id\)\)/);
	assert.match(workspace, /selectionToggle\.replaceChildren\(icon\(clearsSelection \? "close" : "statusCheck"\)/);
	assert.match(workspace, /selectionToggle\.classList\.toggle\("is-clear", clearsSelection\)/);
	assert.doesNotMatch(workspace, /querySelectorAll\([^\n]*aa-library-entry/);
	assert.match(theme, /\.aa-library-selection-actions/);
	assert.match(theme, /\.aa-library-selection-toggle\.is-clear:hover:not\(:disabled\)/);
	assert.match(workspace, /function openMoveSelected\(selected\)/);
	assert.match(workspace, /const entryIds = \[\.\.\.selected\]/);
	assert.match(workspace, /batchEntries\(\{ entryIds, categoryId: target\.value === "__none__" \? null : target\.value \}\)/);
	assert.match(workspace, /className: "aa-library-move-selected"/);
	assert.match(workspace, /moveSelected\.disabled = selected\.size === 0/);
	assert.match(theme, /\.aa-library-move-selected:hover:not\(:disabled\)/);
	assert.match(workspace, /className: "aa-library-export-selected"/);
	assert.match(workspace, /openLibraryExport\(\{ selected, categoryId, collectionId \}\)/);
	assert.match(workspace, /className: "aa-library-delete-selected"/);
	assert.match(workspace, /promptLibraryStore\.deleteEntries\(entryIds\)/);
	assert.match(workspace, /danger: true/);
	assert.match(theme, /\.aa-library-delete-selected:hover:not\(:disabled\)/);
});

test("prompt entry editor prioritizes prompt content and uses shared themed controls", () => {
	assert.match(workspace, /className: "aa-library-entry-dialog"/);
	assert.match(workspace, /size: "md"/);
	assert.match(workspace, /className: "aa-library-entry-section is-content"/);
	assert.match(workspace, /className: "aa-library-entry-lower"/);
	assert.match(workspace, /listboxControl\(\{/);
	assert.match(workspace, /multiSelectControl\(\{/);
	assert.match(workspace, /collectionIds: collections\.values\(\)/);
	assert.match(workspace, /className: "aa-library-entry-preview-card"/);
	assert.match(workspace, /previewFooter\.hidden = !\(file \|\| existingPreviewUrl\)/);
	assert.doesNotMatch(workspace, /libraryUi\.noPreview/);
	assert.match(workspace, /className: "aa-library-entry-preview-overlay"/);
	assert.match(workspace, /removePreviewRequested/);
	assert.match(workspace, /URL\.revokeObjectURL\(selectedPreviewUrl\)/);
	assert.match(ui, /export function listboxControl/);
	assert.match(ui, /role: "listbox"/);
	assert.match(ui, /role: "option"/);
	assert.match(ui, /export function multiSelectControl/);
	assert.match(ui, /role: "group"/);
	assert.match(ui, /setAttribute\("aria-pressed", String\(active\)\)/);
	assert.match(uiStyles, /\.aa-ui-multiselect__option\.is-selected/);
	assert.match(uiStyles, /\.aa-ui-listbox__option\.is-selected/);
	assert.match(theme, /\.aa-library-entry-dialog \{ width: min\(820px/);
	assert.match(theme, /\.aa-library-entry-dialog \.aa-library-entry-prompt-field textarea \{ min-height: 238px/);
	assert.match(theme, /\.aa-library-entry-dialog \.aa-library-entry-note-field \{[^}]*flex: 1;/);
	assert.match(theme, /\.aa-library-entry-dialog \.aa-library-entry-note-field textarea \{[^}]*flex: 1;/);
	assert.match(theme, /\.aa-library-entry-preview-footer\[hidden\] \{ display: none; \}/);
	assert.match(theme, /@media \(max-width: 720px\)[\s\S]*\.aa-library-entry-lower \{ grid-template-columns: 1fr;/);
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
	assert.match(workspace, /colorInput\.type = "color"/);
	assert.match(workspace, /updateCategory\(item\.id, \{ name, color: colorInput\.value \}\)/);
	assert.match(workspace, /aa-taxonomy-color-swatch/);
	assert.match(components, /leading = null/);
	assert.match(categoryColor, /export function applyCategoryColor/);
	assert.match(theme, /\.aa-taxonomy-color-swatch/);
	assert.match(theme, /\.is-category-colored/);
	assert.match(workspace, /className: "aa-taxonomy-edit-action"/);
	assert.match(workspace, /className: "aa-taxonomy-delete-action"/);
	assert.match(workspace, /deleteCategoryTitle/);
	assert.match(workspace, /confirmLabel: t\("aaalice\.common\.delete"/);
	assert.match(workspace, /variant: "danger"/);
	assert.match(uiStyles, /\.aa-ui-button--danger/);
	const saveBody = workspace.match(/const saveItem = async[\s\S]*?\n\t};/)?.[0] || "";
	assert.match(saveBody, /updateCategory/);
	assert.doesNotMatch(saveBody, /deleteCategory|deleteCollection/);
	const removeBody = workspace.match(/const remove = async[\s\S]*?\n\t};/)?.[0] || "";
	assert.match(removeBody, /deleteCategory/);
	assert.match(removeBody, /danger: true/);
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
