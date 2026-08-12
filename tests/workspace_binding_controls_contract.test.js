import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStyleEntry } from "./helpers/style_source.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(ROOT, ...path.split("/")), "utf8");
const workspace = [
	"workspace.js", "workspace/dashboard_bindings.js", "workspace/dashboard_linking.js", "workspace/dashboard_unbinding.js",
	"workspace/dashboard_view.js", "workspace/dashboard_batch_rebind.js", "workspace/labels.js", "workspace/library.js", "workspace/value_profiles.js",
].map((path) => source(`js/${path}`)).join("\n");
const selector = source("js/prompt_selector.js");
const rebindMatch = source("js/lib/rebind_match.js");
const providers = source("js/lib/control_providers.js");
const workspaceControls = source("js/lib/workspace_controls.js");
const numericControl = source("js/lib/controls/numeric.js");
const textControl = source("js/lib/controls/text.js");
const taglistControl = source("js/lib/controls/taglist.js");
const components = source("js/lib/workspace_components.js");
const imagePreview = source("js/lib/image_preview.js");
const uiSource = ["ui.js", "ui/primitives.js", "ui/transient_surfaces.js", "ui/overlays.js", "ui/controls.js"]
	.map((path) => source(`js/lib/${path}`)).join("\n");
const ui = uiSource;
const uiStyles = source("js/lib/ui.css");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));

test("dashboard cards can link and manage multiple compatible node controls", () => {
	assert.match(workspace, /export function openLinkControls/);
	assert.match(workspace, /createSearchableSelect/);
	assert.match(workspace, /badge: target\.broken/);
	assert.match(workspace, /commitRebind\(liveTarget\.item, liveSource\.binding, dialog\)/);
	assert.match(workspace, /addLinkedBinding\(dashboard\(\), liveTarget\.item\.id, liveSource\.binding\)/);
	assert.match(workspace, /function openManageLinkedBindings/);
	assert.match(workspace, /function openUnbindControls/); assert.match(workspace, /detachBinding\(next, entry\.item\.id, entry\.binding\)/); assert.match(workspace, /unbindMenu/);
	assert.match(workspace, /syncButton\.disabled = bindings\.length < 2 \|\| resolvedSet\.status !== "ok"/);
	assert.match(workspace, /issueBadge = issue \? badge/);
	assert.match(workspace, /detachBinding\(dashboard\(\), itemId, binding\)/);
	assert.match(workspace, /replacePrimaryBinding\(dashboard\(\), item\.id, binding\)/);
	assert.match(workspace, /synchronizeFromPrimary/);
	assert.match(workspace, /entries: \[[\s\S]*binding\.linkMenu[\s\S]*binding\.menu/);
	assert.match(rebindMatch, /export function bindingLabelScore/);
	assert.match(rebindMatch, /export function bestRebindMatch/);
	assert.match(workspace, /repairDuplicateHostIds\(graphNodes\(\)\)/);
	assert.match(workspace, /const liveControls = controlProviders\.list\(node\)/);
	assert.match(workspace, /const liveTarget = compatibleCardTargets\(liveSource\.binding\)/);
	assert.match(workspace, /targets\.push\(\{ page, item, source, resolved: resolvedSet/);
	assert.match(workspace, /resolvedBindings\.set\(bindingKey\(liveSource\.binding\), liveTarget\.source\.resolved\)/);
	assert.match(workspace, /commitDashboardBindingSet\(next, liveTarget\.item\.id, \{ synchronize: true, resolvedBindings \}\)/);
	assert.match(workspace, /resolvedBindings\.has\(bindingKey\(binding\)\)/);
	assert.match(workspace, /error\?\.issues\?\.\[0\]\?\.error\?\.message/);
	assert.match(workspace, /controlLabel: label/);
	assert.match(workspace, /preferredBindingTarget\(source\?\.control\.label, targets\)/);
	assert.match(workspace, /linkableControlSources\(controls\)\.length > 0/);
	assert.match(workspace, /initialFocus: \(\) => syncButton\.disabled \? closeButton : syncButton/);
	assert.match(workspace, /installLinkedSeedQueueLifecycle/);
	assert.match(workspace, /synchronizeLinkedBindingSets\(model, \(binding\) => controlProviders\.resolve\(binding, nodes\), \{ kind: "seed", transaction: false \}\)/);
	assert.match(workspace, /createWorkspaceDialog/);
	assert.match(workspace, /closeWorkspaceDialogs\(element\)/);
	assert.match(ui, /returnFocus = null/);
	assert.match(workspace, /function controlBindingErrorDetail/);
	assert.match(ui, /initialFocus = null/);
	assert.match(components, /aa-control-card-binding-count/);
	assert.match(theme, /\.aa-control-card-binding-count/);
	assert.match(workspaceControls, /if \(onWriteError\) onWriteError\(error\)/);
});

test("header-only controls use a separate title row and value row", () => {
	assert.match(numericControl, /headerOnly: !hasRange/);
	assert.match(components, /control\?\.dataset\?\.headerOnly === "true"/);
	assert.doesNotMatch(workspace, /projectControlFootprints|projectedControlRowSpan|isHeaderOnlyControl/);
	assert.match(workspace, /enabled: t\("aaalice\.common\.enabled", "Enabled"\)/);
	assert.match(workspace, /disabled: t\("aaalice\.common\.disabled", "Disabled"\)/);
	assert.match(theme, /\.aa-dashboard-grid-v2, \.aa-dashboard-group-grid \{[^}]*grid-auto-rows: 4px;[^}]*align-items: stretch;/);
	assert.match(theme, /\.aa-control-card\.is-header-only \.aa-control-card-header \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*grid-template-rows: 16px 32px;/);
	assert.match(theme, /\.aa-control-card\.is-header-only \.aa-control-card-title \{[^}]*grid-column: 1;[^}]*grid-row: 1;/);
	assert.match(theme, /\.aa-control-card\.is-header-only \.aa-control-numeric-value \{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*grid-column: 1;[^}]*grid-row: 2;/);
	assert.match(theme, /\.aa-control-card\.is-header-only \.aa-control-boolean \{[^}]*grid-column: 1;[^}]*grid-row: 2;/);
	assert.match(theme, /\.aa-control-boolean \{[^}]*width: 100%;[^}]*height: 32px;/);
	assert.doesNotMatch(theme, /\.aa-control-card-header \.aa-control-boolean-status \{\s*display: none;/);
	assert.doesNotMatch(theme, /aaalice-pcp-node-root/);
	assert.match(components, /root\.append\(header, control/);
	assert.match(theme, /\.aa-control-card\.is-header-only\[data-control-kind="seed"\] \.aa-control-card-header \{[^}]*grid-template-columns: minmax\(0, 1fr\) 28px;[^}]*grid-template-rows: 16px 30px;/);
	assert.match(theme, /\.aa-control-card\.is-header-only\[data-control-kind="seed"\] \.aa-control-seed-mode\.aa-ui-button \{[^}]*grid-column: 2;[^}]*grid-row: 2;/);
	assert.match(theme, /\.aa-control-numeric-value \{[^}]*text-align: center;/);
});

test("PromptSelector injects live library text and exposes inline weight management", () => {
	assert.match(selector, /materializePromptPayload/);
	assert.match(selector, /selection_payload_json/);
	assert.match(selector, /createImagePreview/);
	assert.doesNotMatch(selector, /createSelectableImagePreview/);
	assert.match(imagePreview, /input\.type = "checkbox"/);
	assert.doesNotMatch(selector, /openSelectedEditor|aa-prompt-selected-editor|draggable: true/);
	assert.match(selector, /function promptWeightControl/); assert.match(selector, /event\.deltaY < 0/);
	assert.match(selector, /event\.shiftKey \? \.01 : \.1/);
	assert.match(selector, /if \(value !== 1\) commit\(1, true\)/);
	assert.match(selector, /_aaalicePromptWeightFocusEntryId/);
	assert.match(selector, /Prompt separator/);
	assert.match(selector, /openWorkspace\("library"\)/);
	assert.match(selector, /aa-prompt-selector-footer-actions/); assert.match(selector, /recordUsage\(\[\.\.\.usedEntryIds\]\)/);
	assert.match(selector, /_aaalicePromptRecentFirst !== false/); assert.match(selector, /aa-prompt-selector-recent-sort/);
	assert.match(selector, /function updatePromptSelectorView[\s\S]*view\.virtualList\.setState\?\.\(state\)[\s\S]*view\.virtualList\.setItems\(filteredEntries\(node, state\)/);
	assert.match(selector, /existingView\?\.root === root && existingView\.searchOpen === searchOpen[\s\S]*observeDOMWidgetVisibility/);
});

test("broken binding cards explain the failure and rebind dialog offers fuzzy matching", () => {
	assert.match(workspace, /aa-control-card-broken/);
	assert.match(workspace, /binding\.brokenMissingTitle/);
	assert.match(workspace, /binding\.brokenMissingHint/);
	assert.match(workspace, /bindingControlIdLabel\(item\.binding\)/);
	assert.match(workspace, /createSearchableSelect\(\{[\s\S]*searchPlaceholder: t\("aaalice\.workspace\.binding\.searchParameter"/);
	assert.match(workspace, /onConfirm: commitSelection/);
	assert.match(workspace, /primaryEntry\.resolved\?\.status !== "ok"[\s\S]*broken: true/);
	assert.match(workspace, /badge: target\.broken \? t\("aaalice\.workspace\.binding\.brokenBadge"/);
	assert.match(workspace, /bestRebindMatch\(/);
	assert.match(workspace, /match \? options\[match\.index\]\.value : options\[0\]\.value/);
	assert.match(workspace, /selection\.revealSelected\(\)/);
	assert.match(uiStyles, /\.aa-searchable-select__option\.is-selected/);
	assert.match(theme, /\.aa-control-card-broken__action\.aa-ui-button/);
});

test("page menu offers batch rebinding with reviewable suggestions and one atomic commit", () => {
	assert.match(workspace, /brokenPageControls\(page\)\.length/);
	assert.match(workspace, /rebindAll\.menu[\s\S]*openPageRebind\(page\.id, host\)/);
	assert.match(workspace, /describeRebindCandidates\(item\)/);
	assert.match(workspace, /skipped: !match/);
	assert.match(workspace, /rebindAll\.exactBadge[\s\S]*rebindAll\.suggestedBadge[\s\S]*rebindAll\.unmatchedBadge/);
	assert.match(workspace, /row\.selectedValue = value; row\.manual = true; row\.skipped = false/);
	assert.match(workspace, /next = replacePrimaryBinding\(next, row\.item\.id, candidate\.binding\)/);
	assert.match(workspace, /commitDashboardBindingSet\(next, applied\.map\(\(row\) => row\.item\.id\), \{ synchronize \}\)/);
	assert.match(workspace, /if \(!confirmButton\) return;/);
	assert.match(workspace, /scheduleRelocatedBindingMigration/);
	assert.match(workspace, /binding\.hostId = migration\.hostId/);
	assert.match(providers, /relocateOrphanedBinding\(\{ provider, binding, nodes/);
	assert.match(theme, /\.aa-rebind-all__row\.is-skipped/);
	assert.match(theme, /\.aa-rebind-all__match\.is-empty/);
});

test("workspace UI stops clipboard events before ComfyUI canvas handlers see them", () => {
	const guard = source("js/lib/ui/clipboard_guard.js");
	assert.match(guard, /event\.stopPropagation\(\)/);
	assert.doesNotMatch(guard, /preventDefault\(/);
	assert.match(workspace, /guardClipboardEvents\(element\)/);
	assert.match(uiSource, /guardClipboardEvents\(dialog\)/);
	assert.match(uiSource, /guardClipboardEvents\(root\)/);
	assert.match(numericControl, /guardClipboardEvents\(input\)/);
	const domWidgetLifecycle = source("js/lib/dom_widget_lifecycle.js");
	assert.match(domWidgetLifecycle, /guardClipboardEvents\(element\)/);
});

test("adjustment profiles use source-grouped card rules and one stable scroll surface", () => {
	assert.doesNotMatch(workspace, /setValueProfilePageScope|classifyValueProfileMatches|aa-value-profiles__scope/);
	assert.match(workspace, /item\.kind !== "control" \|\| !item\.binding/);
	assert.match(workspace, /bindingKey\(item\.binding\)/);
	assert.match(workspace, /linkedCount: Math\.max\(0, controlItemBindings\(item\)\.length - 1\)/);
	assert.match(workspace, /controlItemBindings\(match\.candidate\.item\)/);
	assert.match(workspace, /available = candidates\.filter\(\(candidate\) => !taken\.has\(candidate\.key\)\)/);
	assert.match(workspace, /const groupMatches = \(matches\) =>/);
	assert.match(workspace, /aa-value-profile-group__header/);
	assert.match(workspace, /duplicateOrdinal/);
	assert.match(workspace, /data-search-text/);
	assert.match(workspace, /queryInput\.addEventListener\("input", filterRules\)/);
	assert.match(workspace, /removeRuleConfirm/);
	assert.match(workspace, /const nextState = mutator\(state\);[\s\S]*?saveValueProfiles\(nextState\);[\s\S]*?state = nextState/);
	assert.match(workspace, /applyCount/);
	assert.match(workspace, /resolved\.kind === "text" && typeof rule\.payload === "string"/);
	assert.match(theme, /\.aa-value-profile-rule__linked/);
	assert.match(theme, /\.aa-value-profiles__surface \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\)/);
	assert.match(theme, /\.aa-value-profile-rules \{[\s\S]*?overflow-y: auto;/);
	assert.match(theme, /\.aa-value-profile-group \{[\s\S]*?--aa-value-profile-tone:/);
	assert.match(theme, /\.aa-value-profile-rule \{[\s\S]*?grid-template-columns: minmax\(150px, 1fr\) minmax\(210px, \.76fr\) 68px;/);
	assert.match(theme, /@container \(max-width: 700px\)[\s\S]*?\.aa-value-profile-rule \{/);
	assert.match(workspace, /initialQuery: pickerSearch/);
	assert.match(workspace, /onSearchChange: \(query\) => \{ pickerSearch = query; \}/);
	assert.match(workspace, /let rulesScrollTop = 0/);
	assert.match(workspace, /const resetRulesScroll = \(\) => \{[\s\S]*?if \(list\) list\.scrollTop = 0/);
	assert.match(workspace, /if \(currentRules\) rulesScrollTop = currentRules\.scrollTop/);
	assert.match(workspace, /if \(list\) list\.scrollTop = rulesScrollTop/);
	assert.match(workspace, /if \(addPanelOpen\)[\s\S]*?aa-value-profiles__picker[\s\S]*?else \{[\s\S]*?aa-value-profile-rules/);
});

test("searchable select can restore and report the search query across host rebuilds", () => {
	const searchableSelect = source("js/lib/searchable_select.js");
	assert.match(searchableSelect, /initialQuery = "", onSearchChange = null/);
	assert.match(searchableSelect, /onSearchChange\?\.\(query\);/);
	assert.match(searchableSelect, /if \(initialQuery\) setQuery\(initialQuery\);/);
});

test("prompt-bearing text inputs opt into Autocomplete-Plus", () => {
	assert.match(workspace, /text\.setAttribute\("data-autocomplete-plus", ""\)/);
	assert.match(textControl, /input\.setAttribute\("data-autocomplete-plus", ""\)/);
	assert.match(taglistControl, /input\.setAttribute\("data-autocomplete-plus", ""\)/);
	assert.match(taglistControl, /hasAttribute\("data-autocomplete-plus-open"\)/);
});
