import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStyleEntry } from "./helpers/style_source.js";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = [
	"workspace.js",
	"workspace/dashboard_bindings.js", "workspace/dashboard_linking.js", "workspace/dashboard_unbinding.js", "workspace/dashboard_presets.js",
	"workspace/dashboard_view.js",
	"workspace/dashboard_batch_rebind.js",
	"workspace/component_note.js",
	"workspace/group_navigation.js", "workspace/group_navigation_wheel.js",
	"workspace/library.js",
	"workspace/dom_utils.js",
	"workspace/graph_signature.js",
	"workspace/labels.js",
	"workspace/numeric_range.js",
	"workspace/dashboard_scroll.js",
	"workspace/dashboard_source_groups.js",
	"workspace/sidebar_preferences.js",
	"workspace/value_profiles.js",
].map((path) => readFileSync(join(ROOT, "js", ...path.split("/")), "utf8")).join("\n");
const selector = readFileSync(join(ROOT, "js", "prompt_selector.js"), "utf8");
const providers = readFileSync(join(ROOT, "js", "lib", "control_providers.js"), "utf8");
const widgetAdapters = readFileSync(join(ROOT, "js", "lib", "widget_control_adapters.js"), "utf8");
const workspaceControls = readFileSync(join(ROOT, "js", "lib", "workspace_controls.js"), "utf8");
const imageCompareControl = readFileSync(join(ROOT, "js", "lib", "controls", "image_compare.js"), "utf8");
const numericControl = readFileSync(join(ROOT, "js", "lib", "controls", "numeric.js"), "utf8");
const choiceControl = readFileSync(join(ROOT, "js", "lib", "controls", "choice.js"), "utf8");
const booleanControl = readFileSync(join(ROOT, "js", "lib", "controls", "boolean.js"), "utf8");
const taglistControl = readFileSync(join(ROOT, "js", "lib", "controls", "taglist.js"), "utf8");
const textControl = readFileSync(join(ROOT, "js", "lib", "controls", "text.js"), "utf8");
const imageChoiceControl = readFileSync(join(ROOT, "js", "lib", "controls", "image_choice.js"), "utf8");
const markdownControl = readFileSync(join(ROOT, "js", "lib", "controls", "markdown.js"), "utf8");
const nativeOutputControls = readFileSync(join(ROOT, "js", "lib", "native_output_controls.js"), "utf8");
const imageOutputControl = readFileSync(join(ROOT, "js", "lib", "controls", "image_output.js"), "utf8");
const textOutputControl = readFileSync(join(ROOT, "js", "lib", "controls", "text_output.js"), "utf8");
const comfyControls = readFileSync(join(ROOT, "js", "lib", "controls", "comfy.js"), "utf8");
const quickGroupControl = readFileSync(join(ROOT, "js", "lib", "controls", "quick_group_manager.js"), "utf8");
const runtime = readFileSync(join(ROOT, "js", "lib", "quick_group_manager_runtime.js"), "utf8");
const controlRegistry = readFileSync(join(ROOT, "js", "lib", "controls", "registry.js"), "utf8");
const components = readFileSync(join(ROOT, "js", "lib", "workspace_components.js"), "utf8");
const uiSource = ["ui.js", "ui/primitives.js", "ui/transient_surfaces.js", "ui/overlays.js", "ui/controls.js"]
	.map((path) => readFileSync(join(ROOT, "js", "lib", ...path.split("/")), "utf8")).join("\n");
const dashboardModel = readFileSync(join(ROOT, "js", "lib", "dashboard_model.js"), "utf8");
const dashboardComponents = readFileSync(join(ROOT, "js", "lib", "dashboard_components.js"), "utf8");
const dashboardInteractions = readFileSync(join(ROOT, "js", "lib", "dashboard_interactions.js"), "utf8");
const dashboardCommands = readFileSync(join(ROOT, "js", "lib", "dashboard_commands.js"), "utf8");
const dashboardLayout = readFileSync(join(ROOT, "js", "lib", "dashboard_layout.js"), "utf8");
const dashboardSizing = readFileSync(join(ROOT, "js", "lib", "dashboard_sizing.js"), "utf8");
const dashboardSelection = readFileSync(join(ROOT, "js", "lib", "dashboard_selection.js"), "utf8");
const dashboardPresets = readFileSync(join(ROOT, "js", "lib", "dashboard_presets.js"), "utf8");
const dashboardPresetRuntime = readFileSync(join(ROOT, "js", "lib", "dashboard_preset_runtime.js"), "utf8");
const markdownEditor = readFileSync(join(ROOT, "js", "lib", "markdown_editor.js"), "utf8");
const groupNavigation = readFileSync(join(ROOT, "js", "lib", "group_navigation.js"), "utf8");
const groupNavigationModel = readFileSync(join(ROOT, "js", "lib", "group_navigation_model.js"), "utf8");
const groupNavigationWheelModel = readFileSync(join(ROOT, "js", "lib", "group_navigation_wheel_model.js"), "utf8");
const libraryStore = readFileSync(join(ROOT, "js", "lib", "library_store.js"), "utf8");
const imagePreview = readFileSync(join(ROOT, "js", "lib", "image_preview.js"), "utf8");
const imageAssetControl = readFileSync(join(ROOT, "js", "lib", "image_asset_control.js"), "utf8");
const imageAssets = readFileSync(join(ROOT, "js", "lib", "image_assets.js"), "utf8");
const virtualGrid = readFileSync(join(ROOT, "js", "lib", "virtual_grid.js"), "utf8");
const promptEntryDetails = readFileSync(join(ROOT, "js", "lib", "prompt_entry_details.js"), "utf8");
const categoryColor = readFileSync(join(ROOT, "js", "lib", "category_color.js"), "utf8");
const ui = uiSource;
const uiStyles = readFileSync(join(ROOT, "js", "lib", "ui.css"), "utf8");

// 共享 tooltip 的 side 定位必须垂直居中对齐锚点并整体收进视口，防止边缘截断。
test("side tooltips center on the anchor and stay inside the viewport", () => {
	assert.match(ui, /const anchorCenter = anchorRect\.top \+ \(anchorRect\.height \/ 2\);/);
	assert.match(ui, /anchorCenter - \(tooltipRect\.height \/ 2\)\)/);
	assert.match(ui, /Math\.max\(margin, Math\.min\(window\.innerHeight - tooltipRect\.height - margin, anchorCenter - \(tooltipRect\.height \/ 2\)\)\)/);
	assert.match(ui, /function clampTooltipToViewport\(root, margin = 10\)/);
	assert.match(ui, /Math\.max\(margin, Math\.min\(window\.innerWidth - rect\.width - margin, rect\.left\)\)/);
	assert.match(ui, /placeTooltip\(root, anchor, preferredPlacement, cursorPoint\);\s*clampTooltipToViewport\(root\)/);
});
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));
const workspaceIcon = readFileSync(join(ROOT, "js", "assets", "aaalice-workspace.svg"), "utf8");
const enLocale = readFileSync(join(ROOT, "locales", "en", "main.json"), "utf8");
const zhLocale = readFileSync(join(ROOT, "locales", "zh", "main.json"), "utf8");

test("native image comparison is a localized accessible sidebar media control", () => {
	assert.match(widgetAdapters, /id: "comfy-image-compare"/);
	assert.match(widgetAdapters, /presettable: false/);
	assert.match(imageCompareControl, /role: "slider"/);
	assert.match(imageCompareControl, /aria-valuenow/);
	assert.match(imageCompareControl, /beforeImages/);
	assert.match(imageCompareControl, /afterImages/);
	assert.match(imageCompareControl, /createDialog/);
	assert.match(imageCompareControl, /aa-image-compare-dialog/);
	assert.match(imageCompareControl, /iconName: "zoomIn"/);
	assert.match(imageCompareControl, /iconName: "zoomOut"/);
	assert.match(imageCompareControl, /viewport\.addEventListener\("click"/);
	assert.match(imageCompareControl, /draggable = false/);
	assert.match(imageCompareControl, /addEventListener\("dragstart", \(event\) => event\.preventDefault\(\)\)/);
	assert.match(imageCompareControl, /addEventListener\("wheel"/);
	assert.match(imageCompareControl, /addEventListener\("pointermove"/);
	assert.match(imageCompareControl, /MAX_ZOOM = 8/);
	assert.match(imageCompareControl, /destroy: \(\) => viewer\?\.requestClose/);
	assert.match(theme, /\.aa-image-compare__image\.is-before/);
	assert.match(theme, /clip-path: inset/);
	assert.doesNotMatch(imageCompareControl, /aa-image-compare__handle/);
	assert.doesNotMatch(theme, /\.aa-image-compare__handle/);
	assert.doesNotMatch(imageCompareControl, /aa-image-compare-viewer__handle/);
	assert.doesNotMatch(theme, /\.aa-image-compare-viewer__handle/);
	assert.match(imageCompareControl, /if \(event\.pointerType === "mouse"\) setPositionFromPointer\(event\)/);
	assert.match(imageCompareControl, /navigationGroup\(beforeCounter, beforeImages, "before"\)[\s\S]*?aa-image-compare-viewer__zoom[\s\S]*?navigationGroup\(afterCounter, afterImages, "after"\)/);
	assert.match(theme, /\.aa-image-compare-viewer__stage/);
	assert.match(theme, /--aa-image-compare-zoom/);
	assert.match(theme, /\.aa-image-compare-viewer__toolbar \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-image-compare-viewer__nav-group\.is-before \{ justify-self: start; \}/);
	assert.match(theme, /\.aa-image-compare-viewer__nav-group\.is-after \{ justify-self: end; \}/);
	assert.match(theme, /\.aa-image-compare-viewer__zoom \{[^}]*justify-self: center;/);
	assert.match(theme, /-webkit-user-drag: none/);
	for (const locale of [enLocale, zhLocale]) {
		assert.match(locale, /"imageCompare"/);
		assert.match(locale, /"slider"/);
		assert.match(locale, /"zoomIn"/);
		assert.match(locale, /"fit"/);
	}
});

test("built-in PreviewImage and PreviewAny are read-only sidebar execution views", () => {
	assert.match(providers, /id: "comfy-output"/);
	assert.match(providers, /listNativeOutputControls/);
	assert.ok(nativeOutputControls.includes("node.onExecuted = wrapper"));
	assert.ok(nativeOutputControls.includes("invalidateControlHost(node)"));
	assert.ok(nativeOutputControls.includes('bindWidgetInvalidation(node, "preview_mode")'));
	assert.match(nativeOutputControls, /presettable: false/);
	assert.ok(comfyControls.includes('"image-output": (spec) => renderImageOutputControl(spec)'));
	assert.ok(comfyControls.includes('"text-output": (spec) => renderTextOutputControl(spec)'));
	assert.match(imageOutputControl, /createDialog/);
	assert.match(imageOutputControl, /MAX_ZOOM = 8/);
	assert.match(imageOutputControl, /draggable = false/);
	assert.match(imageOutputControl, /addEventListener\("wheel"/);
	assert.ok(imageOutputControl.includes("destroy: () => viewer?.requestClose"));
	assert.match(textOutputControl, /renderSafeMarkdown/);
	assert.match(textOutputControl, /aa-text-output__plain/);
	assert.ok(textOutputControl.includes("spec.options?.markdown"));
	assert.match(textOutputControl, /root\.append\(body\)/);
	assert.match(textOutputControl, /headerAccessories: \[mode\]/);
	assert.doesNotMatch(textOutputControl, /aa-text-output__header/);
	assert.ok(theme.includes(".aa-image-output__viewport"));
	assert.ok(theme.includes(".aa-image-output-viewer__stage"));
	assert.ok(theme.includes(".aa-text-output__body"));
	assert.match(theme, /\.aa-text-output \{[^}]*display: flex;[^}]*flex-direction: column;/);
	assert.doesNotMatch(theme, /\.aa-text-output__header/);
	for (const locale of [enLocale, zhLocale]) {
		assert.match(locale, /"imageOutput"/);
		assert.match(locale, /"textOutput"/);
	}
});

test("workspace is an official left sidebar with reusable component boundaries", () => {
	assert.match(workspace, /registerSidebarTab/);
	assert.match(workspace, /title: t\("aaalice\.workspace\.sidebarTitle", "Aaalice"\)/);
	assert.match(workspace, /tooltip: t\("aaalice\.workspace\.title", "Aaalice Workspace"\)/);
	assert.match(workspace, /id: TAB_ID/);
	assert.match(workspace, /function installWorkspaceCanvasAutoClose/);
	assert.match(workspace, /canvas\.addEventListener\("click"/);
	assert.match(workspace, /!sidebarPinned && sidebar\.activeSidebarTabId === TAB_ID/);
	assert.match(workspace, /sidebar\.toggleSidebarTab\(TAB_ID\)/);
	assert.match(workspace, /createWorkspaceShell/);
	assert.match(components, /segmentedControl/);
	assert.match(components, /headerActions = \[\]/);
	assert.match(workspace, /const SIDEBAR_PIN_STORAGE_KEY = "aaalice\.workspace\.sidebarPinned"/);
	assert.match(workspace, /let sidebarPinned = loadSidebarPinned\(\)/);
	assert.match(workspace, /function loadBooleanPreference\(key, fallback, description\)/);
	assert.match(workspace, /localStorage\?\.getItem\(key\)/);
	assert.match(workspace, /function saveBooleanPreference\(key, value, description\)/);
	assert.match(workspace, /localStorage\?\.setItem\(key, String\(value\)\)/);
	assert.match(workspace, /saveSidebarPinned\(sidebarPinned\)/);
	assert.match(workspace, /className: "aa-workspace-pin"/);
	assert.match(workspace, /aria-pressed/);
	assert.match(workspace, /workspacePinTooltip\.show\(pinButton, pinLabel/);
	assert.match(theme, /\.aa-workspace-pin\.aa-ui-button\.is-active/);
	assert.match(workspace, /createDashboardGrid/);
	assert.match(workspace, /const model = dashboard\(\); const page = currentPage\(model\);\s*let activePageId = page\?\.id \|\| null;[\s\S]*?const fromPageId = previousTransition\?\.fromPageId \|\| activePageId;/);
	assert.match(workspace, /bindDashboardInteractions/);
	assert.match(workspace, /createControlCard/);
	assert.match(workspace, /app\.graph\.extra|graph\.extra/);
});

test("shared dialogs mount immediately without obsolete open calls", () => {
	assert.match(ui, /document\.body\.append\(overlay\)/);
	assert.match(ui, /const DEFAULT_DIALOG_SIZE = "compact"/);
	assert.match(ui, /size = DEFAULT_DIALOG_SIZE/);
	assert.match(ui, /confirmOnEnter = true/);
	assert.match(ui, /function dialogDefaultAction\(footer\)/);
	assert.match(ui, /data-aa-dialog-default/);
	assert.match(ui, /dialogAction\(footer, "\.aa-ui-button--primary"\)/);
	assert.match(ui, /dialogAction\(footer, "\.aa-ui-button--danger"\)/);
	assert.match(ui, /event\.key === "Enter" && confirmOnEnter/);
	assert.match(ui, /action\.click\(\)/);
	assert.match(ui, /event\.isComposing/);
	assert.match(ui, /textarea, select, \[contenteditable\]/);
	assert.match(ui, /event\.key === "Escape"/);
	assert.match(ui, /event\.key === "Escape" && open[\s\S]*?event\.stopPropagation\(\)[\s\S]*?setOpen\(false\)/);
	assert.match(ui, /requestClose\(null\)/);
	assert.match(ui, /onClose = null/);
	assert.match(ui, /try \{ onClose\?\.\(value\); \}/);
	assert.match(uiStyles, /\.aa-ui-dialog--compact \{ width: min\(420px, 96vw\); \}/);
	assert.doesNotMatch(workspace, /dialog\.open\(\)/);
	assert.doesNotMatch(selector, /dialog\.open\(\)/);
	assert.match(workspace, /function openCardActions[\s\S]*?dialog = createDialog/);
});

test("node context-menu add uses the official extension API exactly once and ignores layout edit mode", () => {
	assert.match(workspace, /getNodeMenuItems\(node\) \{ return buildNodeMenuItems\(node\); \}/);
	assert.equal((workspace.match(/getNodeMenuItems\(node\) \{ return buildNodeMenuItems\(node\); \}/g) || []).length, 1);
	assert.match(workspace, /📌 Add controls to sidebar/);
	assert.match(workspace, /const fallbackPageId = page\?\.id \|\| model\.pages\[0\]\?\.id \|\| ""[\s\S]*preferredDashboardPage\(model\.pages, dashboardPageMatchLabels\(node\), fallbackPageId\)/);
	const menuBody = workspace.match(/function nodeMenuItems[\s\S]*?export function getNodeMenuItems/)?.[0] || "";
	assert.doesNotMatch(menuBody, /editMode/);
	assert.doesNotMatch(workspace, /patchNodeMenu|installNodeControlMenu|getExtraMenuOptions/);
	assert.match(workspace, /editMode \?[^\n]*Done/);
});

test("integrates visual-group navigation into the existing workspace sidebar", () => {
	assert.match(workspace, /value: "groups"/);
	assert.match(workspace, /function renderGroupNavigation/);
	assert.match(workspace, /const GROUP_NAVIGATION_EXTRA_KEY = "aaaliceGroupNavigation"/);
	assert.match(workspace, /graph\.extra\[GROUP_NAVIGATION_EXTRA_KEY\] = next/);
	assert.match(workspace, /addGroupNavigationEntry/);
	assert.match(workspace, /openAddGroupNavigation/);
	assert.match(workspace, /navigateToVisualGroup\(app\.canvas, group, \{ offset, zoom \}\)/);
	assert.match(workspace, /aa-group-navigation-row/);
	assert.match(workspace, /openGroupNavigationSettings/);
	assert.match(workspace, /setGroupNavigationOffset/);
	assert.match(workspace, /setGroupNavigationZoom/);
	assert.match(workspace, /navigateFromWorkspace\(group, entry\.offset, entry\.zoom\)/);
	assert.match(workspace, /window\.addEventListener\("keydown", handleGroupNavigationShortcut, true\)/);
	assert.match(workspace, /window\.addEventListener\("keyup", handleGroupNavigationShortcutUp, true\)/);
	assert.match(workspace, /openGroupNavigationWheel/);
	assert.match(workspace, /aa-group-navigation-wheel-open/);
	assert.match(workspace, /aa-group-navigation-wheel-settings/);
	assert.match(workspace, /isGroupNavigationCanvasPointerEvent/);
	assert.match(workspace, /canvasElement: app\.canvas\?\.canvas/);
	assert.match(workspace, /elementFromPoint/);
	assert.match(workspace, /trigger === "keyboard"/);
	assert.match(theme, /aa-group-navigation-wheel-surface/);
	assert.match(theme, /--wheel-tilt-x/);
	assert.match(theme, /translateZ\(16px\)/);
	assert.match(groupNavigationModel, /wheelShortcut/);
	assert.match(groupNavigationModel, /wheelShortcutFromKeyboardEvent/);
	assert.doesNotMatch(groupNavigation, /shortcutFromKeyboardEvent/);
	assert.doesNotMatch(groupNavigationModel, /setGroupNavigationShortcut/);
	assert.match(workspace, /moveGroupNavigationEntry/);
	assert.match(workspace, /aa-group-navigation-drag/);
	assert.match(workspace, /scheduleStructuralRender\("groups"\)/);
	assert.match(groupNavigation, /fitToBounds/);
	assert.doesNotMatch(groupNavigation, /animateToBounds/);
	assert.match(groupNavigation, /centerOnNode/);
	assert.match(theme, /\.aa-group-navigation-marker/);
	assert.match(theme, /\.aa-group-navigation-wheel-root/);
	assert.match(uiStyles, /\.aa-group-navigation-wheel-root/);
	assert.match(groupNavigationWheelModel, /GROUP_NAVIGATION_WHEEL_PAGE_SIZE/);
	assert.match(enLocale, /"groupNavigation"/);
	assert.match(zhLocale, /"groupNavigation"/);
});

test("projects QuickGroupManager as one presettable sidebar control instead of a workspace page", () => {
	assert.match(providers, /id: "quick-group-manager"/);
	assert.match(providers, /function quickGroupManagerTitle\(node\)/);
	assert.match(providers, /typeof node\?\.getTitle === "function"/);
	assert.match(providers, /label: quickGroupManagerTitle\(node\)/);
	assert.match(workspace, /function controlTitle\(item, resolved\) \{[\s\S]*return resolved\.label \|\| item\.label \|\| bindingControlIdLabel\(item\.binding\)/);
	assert.match(providers, /valueType: "quick-group-manager"/);
	assert.match(providers, /quickGroupManagerPresetSnapshot/);
	assert.match(providers, /applyQuickGroupManagerPreset/);
	assert.match(comfyControls, /"quick-group-manager"/);
	assert.match(quickGroupControl, /renderQuickGroupManagerControl\(spec, port = \{\}\)/);
	assert.match(quickGroupControl, /toggleSwitch/);
	assert.match(quickGroupControl, /row\.addEventListener\("click"/);
	assert.match(quickGroupControl, /row\.addEventListener\("keydown"/);
	assert.doesNotMatch(quickGroupControl, /data-capture-wheel/);
	assert.doesNotMatch(quickGroupControl, /list\.addEventListener\("pointerenter"/);
	assert.match(quickGroupControl, /port\.onError/);
	assert.match(comfyControls, /"quick-group-manager": \(spec, port\) => renderQuickGroupManagerControl\(spec, port\)/);
	assert.match(quickGroupControl, /controlView/);
	assert.match(runtime, /quickGroupManagerPresetSnapshot/);
	assert.match(runtime, /applyQuickGroupManagerPreset/);
	assert.doesNotMatch(workspace, /value: "quickGroups"/);
	assert.doesNotMatch(workspace, /function renderQuickGroups/);
	assert.doesNotMatch(theme, /aa-quick-groups-card/);
	assert.match(theme, /\.aa-quick-group-control__list[\s\S]*flex: 0 0 auto[\s\S]*overflow: visible/);
	assert.doesNotMatch(quickGroupControl, /data-capture-wheel/);
	assert.doesNotMatch(quickGroupControl, /list\.addEventListener\("pointerenter"/);
	assert.match(theme, /\.aa-quick-group-control__row:hover, \.aa-quick-group-control__row:focus-visible \{[^}]*border-color: transparent;/);
	assert.match(theme, /\.aa-quick-group-control__row\.is-enabled \{[^}]*border-color: transparent;[^}]*box-shadow: inset 3px 0/);
	assert.match(theme, /\.aa-quick-group-control__row\.is-mixed \{[^}]*border-color: transparent;[^}]*box-shadow: inset 3px 0/);
	assert.match(theme, /\.aa-control-card\[data-control-kind="quick-group-manager"\][\s\S]*flex-direction: column/);
	assert.match(providers, /dashboardContentRowSpan/);
	assert.match(providers, /rowSpan: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN/);
	assert.match(providers, /layoutProjection: \{ rowSpan: quickGroupManagerRowSpan\(snapshot\) \}/);
	assert.match(workspace, /function resolvePageControls\(page\)/);
	assert.match(workspace, /resolved\.layoutProjection/);
	assert.match(workspace, /normalizeDashboardColumnSpan\(resolved\.layoutProjection\.columnSpan\)/);
	assert.match(workspace, /normalizeDashboardRowSpan\(resolved\.layoutProjection\.rowSpan, \{ minimum \}\)/);
	assert.match(workspace, /sizeProjections\.set\(item\.id, projection\)/);
	assert.match(workspace, /createDashboardGrid\(\{ page: resolvedPage, sizeProjections/);
	assert.match(workspace, /function observeDashboardViewport\(host, body, grid, page, controls\)/);
	assert.match(workspace, /const item = page\.items\.length === 1 && page\.groups\.length === 0 \? page\.items\[0\] : null/);
	assert.doesNotMatch(workspace, /!editMode && page\.items\.length === 1/);
	assert.match(workspace, /controls\.get\(item\.id\)\?\.kind === "booru-gallery"/);
	assert.match(workspace, /dashboardContentRowSpan\(body\.clientHeight\)/);
	assert.match(workspace, /dashboardViewportObservers\.get\(host\)\?\.disconnect\(\)/);
	assert.match(workspace, /observeDashboardViewport\(host, body, grid, resolvedPage, resolvedControls\)/);
	assert.doesNotMatch(workspace, /projectContentSizedControls|reflowContentSizedScope|liveControlRowSpan/);
	assert.doesNotMatch(enLocale, /"quickGroups"/);
	assert.doesNotMatch(zhLocale, /"quickGroups"/);
});

test("providers cover native and public subgraph widgets by stable host identity", () => {
	assert.match(providers, /HOST_ID_PROPERTY/);
	assert.match(providers, /generic-widget/);
	assert.match(providers, /subgraph-widget/);
	assert.match(providers, /listAdaptedWidgetControls/);
	assert.match(widgetAdapters, /registerWidgetControlAdapter/);
	assert.match(widgetAdapters, /comfy-native-widget/);
	assert.match(widgetAdapters, /valueType: kind === "choice" \? controlValueType\(widget\.value\)/);
	assert.match(widgetAdapters, /state: "empty", reason: "no-options"/);
	assert.doesNotMatch(widgetAdapters, /Boolean\(controlValueType\(widget\.value\)\)/);
	assert.match(widgetAdapters, /priority/);
	assert.match(widgetAdapters, /adapterId/);
	assert.match(providers, /ensureUniqueHostId/); assert.match(providers, /repairDuplicateHostIds/);
	assert.match(providers, /export function createControlHostIndex[\s\S]*nodes instanceof Map/);
	assert.match(workspace, /function dashboardUsesHost\(node\)[\s\S]*controlItemBindings\(item\)\.some[\s\S]*const hostIndex = createControlHostIndex\(graphNodes\(\)\)[\s\S]*resolveControlBindingSet\(item, resolvePageBinding\)[\s\S]*if \(!dashboardUsesHost\(node\)\) return;/);
	assert.match(providers, /sourceSnapshot\(source, nodes\)/);
	assert.match(providers, /Source provider or host is missing/);
	assert.match(providers, /listedGroup\?\.name/);
	assert.doesNotMatch(providers, /setInterval|setTimeout\([^)]*resolve/);
	assert.doesNotMatch(providers, /document\.|addEventListener|createNumericEditor|createImageUploadControl|selectControl|toggleSwitch/);
	assert.match(controlRegistry, /renderControlAvailability/);
	assert.match(theme, /\.aa-control-card\.is-unavailable/);
	assert.match(theme, /\.aa-control-availability \{/);
});

test("numeric control gestures preview live inside one graph history boundary", () => {
	assert.match(numericControl, /pointerdown/);
	assert.match(workspaceControls, /setValue\(next, \{ transaction: false, transient: true \}\)/);
	assert.match(providers, /flushValue/);
	assert.match(providers, /adapted\.setValue\(next\)/);
	assert.doesNotMatch(providers, /ParameterPanel|ParameterReceiver|EnumSwitch/);
	assert.match(numericControl, /pointerup/);
	assert.match(workspaceControls, /beforeChange/);
	assert.match(workspaceControls, /afterChange/);
	assert.match(workspaceControls, /createSharedControl\(spec/);
	assert.match(numericControl, /--aa-shared-range-progress/);
	assert.match(numericControl, /aa-shared-range aa-control-numeric-range/);
	assert.match(uiStyles, /\.aa-shared-range::\-webkit-slider-runnable-track/);
	assert.match(numericControl, /const accessories = \[valueButton\]/);
	assert.match(numericControl, /createNumericEditor/);
	assert.match(numericControl, /addEventListener\("wheel"/);
	assert.match(numericControl, /event\.shiftKey \? 10 : 1/);
	assert.match(numericControl, /presentation\?\.wheelAdjust !== false/);
	assert.match(numericControl, /inlineEditor\?\.destroy\?\.\(\)/);
	assert.match(numericControl, /if \(gestureOpen\) \{ gestureOpen = false; port\.endGesture\(current\); \}/);
	assert.match(workspaceControls, /wheelAdjust: false/);
	assert.match(numericControl, /passive: false/);
	assert.match(theme, /\.aa-control-numeric-value/);
	assert.match(uiStyles, /::-webkit-slider-runnable-track/);
	assert.match(components, /control\?\.headerAccessories/);
});

test("numeric sidebar cards persist a validated presentation-only range editor", () => {
	assert.match(dashboardModel, /export function normalizeNumericRange/);
	assert.match(dashboardModel, /\.\.\.\(numericRange \? \{ numericRange \} : \{\}\)/);
	assert.match(workspace, /function openNumericRangeSettings/);
	assert.match(workspace, /aaalice\.workspace\.numericRange\.menu/);
	assert.match(workspace, /function isConfigurableNumericControl/);
	assert.match(workspace, /resolvedControlSpec\(resolved\)\.kind === "numeric"/);
	assert.match(workspace, /numericRangeForControl\(resolved, item\.numericRange\)/);
	assert.match(workspace, /target\.numericRange = validation\.range/);
	assert.match(workspace, /delete target\.numericRange/);
	assert.match(workspaceControls, /numericRange = null/);
	assert.match(workspaceControls, /presentation: \{[^}]*numericRange/s);
	assert.match(numericControl, /const customRange = spec\.kind === "numeric" \? spec\.presentation\?\.numericRange : null/);
	assert.match(numericControl, /const rangeValue = Math\.min\(max, Math\.max\(min, current\)\)/);
	assert.match(theme, /\.aa-numeric-range-grid \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
	for (const locale of [enLocale, zhLocale]) {
		assert.match(locale, /"numericRange"/);
		assert.match(locale, /"minimum"/);
		assert.match(locale, /"maximum"/);
		assert.match(locale, /"step"/);
	}
});

test("every dashboard component supports persistent Markdown notes with explicit low-noise disclosure", () => {
	assert.match(dashboardModel, /const note = typeof sourceItem\.note === "string"/);
	assert.match(dashboardModel, /\.\.\.\(note \? \{ note \} : \{\}\)/);
	assert.match(workspace, /function openComponentNoteEditor/);
	assert.match(workspace, /COMPONENT_NOTE_FORMATS/);
	assert.match(workspace, /applyMarkdownFormat/);
	assert.match(workspace, /renderSafeMarkdown\(textarea\.value\)/);
	assert.match(workspace, /toggleSwitch\(\{/);
	assert.match(workspace, /target\.note = textarea\.value/);
	assert.match(workspace, /delete target\.note/);
	assert.match(workspace, /item\.note \? t\("aaalice\.workspace\.componentNote\.editMenu"/);
	assert.match(workspace, /createComponentNoteButton/);
	assert.match(components, /aa-component-note-badge/);
	assert.match(components, /iconName: "help"/); assert.match(components, /attachDescriptionTooltip\(control, \(\) => note/);
	assert.doesNotMatch(components, /control\.setAttribute\("aria-haspopup"/); assert.doesNotMatch(components, /onOpen\?\.\(control\)/); assert.match(workspace, /createComponentNoteButton\(\{ note: item\.note/);
	assert.match(markdownEditor, /unordered-list/);
	assert.match(markdownEditor, /ordered-list/);
	assert.match(markdownEditor, /task-list/);
	assert.match(markdownEditor, /code-block/);
	assert.match(markdownEditor, /horizontal-rule/);
	assert.match(theme, /\.aa-component-note-dialog\.aa-ui-dialog/);
	assert.match(theme, /\.aa-component-note-editor__toolbar/);
	assert.match(theme, /\.aa-component-note-editor__preview/);
	assert.match(theme, /\.aa-control-card-header \.aa-component-note-badge/); assert.match(theme, /\.aa-component-note-badge\.aa-ui-button \{[^}]*border-radius: 3px; background: transparent/); assert.match(theme, /\.aa-component-note-badge \.aa-ui-icon \{ width: 16px; height: 16px/);
	for (const locale of [enLocale, zhLocale]) {
		assert.match(locale, /"componentNote"/);
		assert.match(locale, /"switchMode"/);
		assert.match(locale, /"formats"/);
	}
});

test("image inputs share a native-shaped asset browser and separate upload action", () => {
	assert.match(comfyControls, /"image-choice": \(spec, port\) => renderImageChoiceControl\(spec, port\)/);
	assert.match(widgetAdapters, /id: "comfy-image-combo"/);
	assert.match(widgetAdapters, /options\.image_upload \|\| options\.animated_image_upload/);
	assert.match(widgetAdapters, /node\?\.constructor\?\.nodeData\?\.input/);
	assert.match(imageChoiceControl, /export function renderImageChoiceControl/);
	assert.match(imageChoiceControl, /createImageAssetControl/);
	assert.match(imageChoiceControl, /imageComboReference/);
	assert.match(imageChoiceControl, /imageReferenceComboValue/);
	assert.match(imageAssetControl, /className: "aa-image-asset-control__select"/);
	assert.match(imageAssetControl, /iconName: "folderSearch"/);
	assert.match(imageAssetControl, /createAssetBrowser/);
	assert.match(imageAssetControl, /mountVirtualGrid/);
	assert.match(imageAssetControl, /virtualGrid\.setItems\(visible/);
	assert.match(virtualGrid, /virtualGridRange/);
	assert.match(virtualGrid, /ResizeObserver/);
	assert.match(theme, /\.aa-image-assets \{[^}]*height: min\(620px, calc\(100vh - 16px\)\)[^}]*overflow: hidden/);
	assert.match(theme, /\.aa-image-assets__results \{[^}]*min-height: 0[^}]*overflow-y: auto[^}]*scrollbar-gutter: stable/);
	assert.match(imageAssetControl, /segmentedControl/);
	assert.match(imageAssetControl, /value: "all"/);
	assert.match(imageAssetControl, /value: "inputs"/);
	assert.match(imageAssetControl, /value: "outputs"/);
	assert.match(imageAssetControl, /type: "search"/);
	assert.match(imageAssetControl, /iconName: "arrowUpDown"/);
	assert.match(imageAssetControl, /iconName: "list"/);
	assert.match(imageAssetControl, /iconName: "layoutGrid"/);
	assert.match(imageAssetControl, /role: "menuitemradio"/);
	assert.match(imageAssetControl, /value: "default"/);
	assert.match(imageAssetControl, /value: "alphabetical"/);
	assert.match(imageAssetControl, /"arrowDownAZ" : "arrowUpDown"/);
	assert.match(imageAssetControl, /bindImageDropTarget\(root/);
	assert.match(imageAssets, /api\.internalURL\("\/files\/input"\)/);
	assert.match(imageAssets, /api\.getHistory\(200\)/);
	assert.match(imagePreview, /resolve = null/);
	assert.match(imagePreview, /resolve\?\.\(\)/);
	assert.match(widgetAdapters, /image_folder: imageOptions\.image_folder \|\| "input"/);
	assert.match(widgetAdapters, /upload_subfolder: imageOptions\.upload_subfolder \|\| ""/);
	assert.match(workspaceControls, /const imageLabels =/);
	assert.match(workspaceControls, /"image-choice": imageLabels/);
	assert.match(workspaceControls, /image: imageLabels/);
	assert.match(theme, /\.aa-virtual-grid__item/);
	assert.match(theme, /\.aa-image-assets__results\.is-list \.aa-image-assets__item/);
	assert.match(theme, /\.aa-image-asset-control\s*\{[^}]*gap:\s*0/s);
	assert.match(theme, /\.aa-image-asset-control__select\s*\{[^}]*border-radius:\s*8px 0 0 8px/s);
	assert.match(theme, /\.aa-image-asset-control__upload\.aa-ui-button\s*\{[^}]*border-radius:\s*0 8px 8px 0/s);
	assert.match(theme, /\.aa-image-assets__view-switch/);
	assert.match(theme, /\.aa-image-assets__sort-menu/);
	assert.doesNotMatch(theme, /\.aa-image-upload-|\.aa-control-image-choice__/);
});

test("markdown notes adapt between full rendering and a hover-to-read bar by height", () => {
	assert.match(widgetAdapters, /id: "comfy-markdown"/);
	assert.match(widgetAdapters, /widgetType\(widget\) === "markdown"/);
	assert.match(comfyControls, /markdown: \(spec, port\) => renderMarkdownControl\(spec, port\)/);
	assert.match(markdownControl, /export function renderMarkdownControl/);
	assert.match(markdownControl, /FULL_MIN_HEIGHT = 88/);
	assert.match(markdownControl, /new ResizeObserver/);
	assert.match(markdownControl, /observer\.observe\(root\)/);
	assert.match(markdownControl, /destroy: \(\) => observer\.disconnect\(\)/);
	assert.match(markdownControl, /renderSafeMarkdown\(markdown\)/);
	assert.match(markdownControl, /attachDescriptionTooltip\(bar, \(\) => markdown\)/);
	assert.match(workspaceControls, /markdown: \{ \.\.\.availabilityLabels, empty: labels\.markdownEmpty \}/);
	assert.doesNotMatch(workspace, /cardCompact|onToggleCompact|item\.compact/);
	assert.doesNotMatch(components, /onToggleCompact|is-compact" : ""/);
	assert.doesNotMatch(workspaceControls, /cardCompact/);
	assert.match(dashboardSizing, /DASHBOARD_MARKDOWN_ROW_SPAN = 28/);
	assert.doesNotMatch(theme, /aa-control-card\.is-compact/);
	assert.match(theme, /:is\(\.aa-description-tooltip, \.aa-control-markdown__body, \.aa-text-output__body, \.aa-markdown-surface\) h1/);
	assert.match(theme, /\.aa-control-card\[data-control-kind="markdown"\] \{[^}]*border-color: transparent/);
	assert.match(theme, /\.aa-control-markdown__body \{[^}]*overflow-y: auto[^}]*border: 0/);
	assert.match(theme, /\.aa-control-markdown__body:focus-visible \{[^}]*aa-ui-edge-shadow-inset/);
	assert.match(theme, /\.aa-control-markdown__bar \{[^}]*height: 32px[^}]*border: 0/);
	assert.match(theme, /\.aa-control-markdown__bar:hover/);
});

test("dashboard tag-list controls reuse the shared interactive chip editor", () => {
	assert.match(taglistControl, /createTagListControl\(\{/);
	assert.match(workspaceControls, /taglist: \{ \.\.\.availabilityLabels, \.\.\.\(labels\.taglist \|\| \{\}\) \}/);
	assert.match(workspaceControls, /createSharedControl\(spec/);
	assert.match(workspaceControls, /control\.dataset\.controlKind = view\.kind/);
	assert.match(theme, /\.aa-control-card \[data-control-tone\] \{ --aa-control-item-tone: var\(--aa-ui-accent\); \}/);
	assert.match(theme, /\.aa-taglist-control \{[^}]*display: flex;[^}]*height: 32px;[^}]*box-sizing: border-box;[^}]*overflow-x: auto;/);
	assert.match(theme, /\.aa-taglist-control::\-webkit-scrollbar \{ display: none; \}/);
	assert.match(theme, /\.aa-taglist-options \{ display: contents; \}/);
	assert.match(theme, /\.aa-taglist-chip\.is-selected/);
	assert.match(theme, /\.aa-taglist-chip\.is-disabled/);
	assert.match(theme, /\[data-control-tone="11"\]/);
	assert.match(taglistControl, /tagToneIndexes\(entries\)/);
	assert.match(taglistControl, /input\.setAttribute\("data-autocomplete-plus", ""\)/);
	assert.match(taglistControl, /input\.hasAttribute\("data-autocomplete-plus-open"\)/);
	assert.match(textControl, /input\.setAttribute\("data-autocomplete-plus", ""\)/);
	assert.match(textControl, /spec\.options\.multiline \? document\.createElement\("textarea"\) : document\.createElement\("input"\)/);
	assert.match(workspace, /window\.addEventListener\(CONTROL_HOST_INVALIDATED_EVENT/);
});

test("seed behavior reuses one four-mode shared control across the dashboard", () => {
	assert.match(numericControl, /export function createSeedModeControl/);
	assert.match(numericControl, /SEED_BEHAVIORS = Object\.freeze\(\["fixed", "increment", "decrement", "randomize"\]\)/);
	assert.match(numericControl, /createAnchoredPopover/);
	assert.match(numericControl, /control\.setBehavior/);
	assert.match(numericControl, /role: "radiogroup"/);
	assert.match(numericControl, /option\.setAttribute\("role", "radio"\)/);
	assert.match(workspaceControls, /createSharedControl\(spec/);
	assert.match(theme, /\.aa-control-seed-popover/);
	for (const behavior of ["fixed", "increment", "decrement", "randomize"]) {
		assert.match(theme, new RegExp(`data-seed-behavior="${behavior}"`));
	}
	assert.match(theme, /\.aa-control-seed-inline\[data-seed-behavior\]:not\(\[data-seed-behavior="randomize"\]\)/);
	assert.match(theme, /\.aa-control-card-header:has\(\.aa-control-seed-mode\[data-seed-behavior="fixed"\]\)/);
	assert.match(theme, /--aa-seed-field-tone/);
	assert.doesNotMatch(theme, /\.aa-control-seed-mode\.is-locked/);
});

test("dashboard enum and boolean controls reuse the shared themed controls", () => {
	assert.match(choiceControl, /selectControl\(\{/);
	assert.match(booleanControl, /toggleSwitch\(\{/);
	assert.match(booleanControl, /aa-control-boolean-dot/);
	assert.match(booleanControl, /aa-control-boolean-state/);
	assert.match(booleanControl, /root\.addEventListener\("click"/);
	assert.match(booleanControl, /toggle\.click\(\)/);
	assert.match(booleanControl, /root\.classList\.toggle\("is-on", current\)/);
	assert.match(booleanControl, /event\.target\.closest\("\.aa-ui-toggle"\)/);
	assert.match(booleanControl, /attrs: \{ "aria-hidden": "true" \}/);
	assert.doesNotMatch(controlRegistry, /AAALICE_CONTROL_RENDERERS/);
	assert.match(controlRegistry, /COMFY_CONTROL_RENDERERS/);
	assert.match(components, /root\.dataset\.controlKind/);
	assert.match(theme, /\.aa-control-choice-select/);
	assert.doesNotMatch(theme, /\.aa-control-card\[data-control-kind="choice"\] \{ --aa-dashboard-control-tone:/);
	assert.match(theme, /\.aa-control-card \.aa-control-choice-select \.aa-ui-select__native \{[^}]*font-size: 11px;[^}]*font-weight: 620;/);
	assert.match(theme, /\.aa-control-boolean/);
	assert.match(theme, /\.aa-control-boolean\.is-on \.aa-control-boolean-dot/);
	assert.match(theme, /\.aa-control-boolean:focus-within/);
});

test("control cards move management into an accessible context menu", () => {
	const cardBody = components.match(/export function createControlCard[\s\S]*?\n}/)?.[0] || "";
	assert.match(ui, /export function createContextMenu/);
	assert.match(ui, /role: "menu"/);
	assert.match(ui, /setAttribute\("role", checkable \? "menuitemradio" : "menuitem"\)/);
	assert.match(ui, /ArrowUp/);
	assert.match(ui, /window\.innerWidth - rect\.width/);
	assert.match(cardBody, /addEventListener\("contextmenu"/);
	assert.match(cardBody, /if \(description\) attachDescriptionTooltip\(titleElement, description\)/);
	assert.match(workspace, /description: resolved\.status === "ok" \? String\(resolved\.control\?\.description \|\| ""\) : ""/);
	assert.match(cardBody, /event\.key !== "ContextMenu"/);
	assert.match(cardBody, /preservesNativeEditing/);
	assert.doesNotMatch(cardBody, /iconButton\(/);
	assert.match(workspace, /function openCardActions/);
	assert.match(workspace, /createContextMenu\(\{ x, y/);
	assert.match(workspace, /danger: true/);
	assert.match(uiStyles, /\.aa-ui-context-menu__item\.is-danger/);
});
