import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function ruleBody(source, selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] || "";
}

test("shared tooltips own timing, viewport placement and accessible cleanup", () => {
	const uiSource = readFileSync(join(ROOT, "js", "lib", "ui.js"), "utf8");
	const styles = readFileSync(join(ROOT, "js", "lib", "ui.css"), "utf8");

	assert.match(uiSource, /export function createTooltip/);
	assert.match(uiSource, /preferredPlacement === "side"/);
	assert.match(uiSource, /root\.dataset\.placement = showRight \? "right" : "left"/);
	assert.match(uiSource, /import \{ renderSafeMarkdown \} from "\.\/safe_markdown\.js"/);
	assert.match(uiSource, /contentMode === "markdown"[\s\S]*renderSafeMarkdown\(content\)/);
	assert.match(uiSource, /contentMode === "text"/);
	assert.match(uiSource, /contentMode === "dom"/);
	assert.match(uiSource, /contentMode === "auto"/);
	assert.match(uiSource, /Unknown tooltip content mode/);
	assert.match(uiSource, /activeTooltip && activeTooltip !== controller/);
	assert.match(uiSource, /role:\s*interactive \? "dialog" : "tooltip"/);
	assert.match(uiSource, /updateDescribedBy\(anchor, root\.id, true\)/);
	assert.match(uiSource, /updateDescribedBy\(anchor, root\.id, false\)/);
	assert.match(uiSource, /setTimeout\(\(\) => mount/);
	assert.match(uiSource, /window\.addEventListener\("resize", schedulePosition\)/);
	assert.match(uiSource, /window\.addEventListener\("scroll", schedulePosition, true\)/);
	assert.match(uiSource, /--aa-ui-tooltip-arrow-x/);
	assert.match(uiSource, /tooltipRect\.width - 14/);
	assert.match(uiSource, /event\.key === "Escape"/);
	assert.match(styles, /\.aa-ui-tooltip\s*\{[\s\S]*max-width:\s*min\(320px,[\s\S]*pointer-events:\s*none/);
	assert.match(uiSource, /interactive \? "dialog" : "tooltip"/);
	assert.match(uiSource, /updateTokenAttribute\(anchor, "aria-controls", root\.id, true\)/);
	assert.match(uiSource, /mountedRoot\.addEventListener\("mouseenter", cancelScheduledHide\)/);
	assert.match(uiSource, /mountedRoot\.addEventListener\("mouseleave", scheduleHide\)/);
	assert.match(uiSource, /focusFirstInteractive/);
	assert.match(uiSource, /if \(!root\) \{\s*hide\(\);/);
	assert.match(styles, /\.aa-ui-tooltip\.is-interactive\s*\{[^}]*pointer-events:\s*auto/);
	assert.match(styles, /\.aa-ui-tooltip\.is-interactive a:focus-visible/);
	assert.match(styles, /\.aa-ui-tooltip\s*\{[\s\S]*background:\s*var\(--aa-ui-tooltip-surface\)[\s\S]*box-shadow:\s*var\(--aa-ui-edge-shadow\), 0 8px 22px/);
	assert.match(styles, /\.aa-ui-tooltip::before\s*\{[\s\S]*var\(--aa-ui-tooltip-arrow-x/);
	assert.match(styles, /\.aa-ui-tooltip\[data-placement="below"\]::before/);
	assert.match(styles, /\.aa-ui-tooltip\[data-placement="right"\]::before/);
	assert.match(styles, /\.aa-ui-tooltip\[data-placement="left"\]::before/);
	assert.match(styles, /\.aa-ui-tooltip\s*\{[\s\S]*border:\s*1px solid transparent/);
	assert.doesNotMatch(styles, /aa-ui-tooltip-in[^}]*scale\(/);
	assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.aa-ui-tooltip/);
});

test("parameter enum segments stay inside the 32px control track", () => {
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	const groupRule = ruleBody(themeSource, ".aa-control-choice-segmented");
	const segmentRule = ruleBody(themeSource, ".aa-control-choice-option");

	assert.match(groupRule, /box-sizing:\s*border-box/);
	assert.match(groupRule, /height:\s*32px/);
	assert.match(segmentRule, /box-sizing:\s*border-box/);
	assert.match(segmentRule, /height:\s*100%/);
});

test("parameter enum uses a sliding selection indicator", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const choiceSource = readFileSync(join(ROOT, "js", "lib", "controls", "choice.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /createSharedControl\(spec/);
	assert.match(themeSource, /\.aa-control-numeric-range\[hidden\] \{ display: none; \}/);
	assert.match(choiceSource, /aa-control-choice-indicator/);
	assert.match(choiceSource, /stableToneIndexes\(options\.map\(optionValue\)\)/);
	assert.match(choiceSource, /indicator\.dataset\.controlTone = activeChoice\.dataset\.controlTone/);
	assert.match(choiceSource, /"data-control-tone": String\(tones\.get\(value\)\)/);
	assert.match(choiceSource, /position\(activeChoice, animate\)/);
	assert.match(choiceSource, /port\.commit\(value, \{ redraw: false \}\)/);
	assert.match(choiceSource, /observer\?\.disconnect\(\)/);
	assert.match(themeSource, /\.aa-control-choice-indicator\s*\{[^}]*transition:\s*[^;}]*transform/s);
	assert.match(themeSource, /\.aa-control-choice-indicator\s*\{[^}]*var\(--aa-control-item-tone/s);
});

test("parameter panel deletion destroys shared controls without calling removed observer helpers", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");

	assert.match(panelSource, /node\.onRemoved = function \(\) \{[\s\S]*destroyRenderedControls\(root\)/);
	assert.doesNotMatch(panelSource, /disconnectSegmentObservers/);
});

test("parameter labels keep a small gap above their controls", () => {
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "parameter_layout.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(layoutSource, /rowHeight:\s*50/);
	assert.match(layoutSource, /top:\s*rowTop \+ 17/);
	assert.match(themeSource, /\.aaalice-pcp-node-root \.aaalice-pcp-node-row\s*\{[^}]*row-gap:\s*2px/s);
});

test("separator parameters use computed monochrome etched rules around a neutral title plate", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "parameter_layout.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /aaalice-pcp-node-section-label/);
	assert.match(panelSource, /aa-section-rule aa-section-rule--start/);
	assert.match(panelSource, /aa-section-rule aa-section-rule--end/);
	assert.match(panelSource, /role: "separator"/);
	assert.match(layoutSource, /sectionHeight:\s*24/);
	assert.match(themeSource, /--aa-section-core:\s*color-mix\(in srgb, var\(--aa-section-accent\) 62%, var\(--aaalice-node-value\)\)/);
	assert.match(themeSource, /\.aa-section-rule--start\s*\{[^}]*linear-gradient\(90deg, transparent 0%, var\(--aa-section-tail\) 34%, var\(--aa-section-accent\) 72%, var\(--aa-section-core\) 100%\)/s);
	assert.match(themeSource, /\.aa-section-rule--end\s*\{[^}]*linear-gradient\(90deg, var\(--aa-section-core\) 0%, var\(--aa-section-accent\) 28%, var\(--aa-section-tail\) 66%, transparent 100%\)/s);
	assert.match(themeSource, /\.aa-section-rule::after\s*\{[^}]*width:\s*14px[^}]*height:\s*1px[^}]*background:\s*var\(--aa-section-core\)/s);
	assert.doesNotMatch(themeSource, /aa-section-spectrum|calc\(h \+ (?:120|240)\)/);
	assert.match(themeSource, /\.aaalice-pcp-node-section-label,[\s\S]*background:\s*var\(--aa-section-surface\)[^}]*box-shadow:[^}]*text-align:\s*center/s);
	assert.match(themeSource, /\.aa-dashboard-separator-label/);
});

test("tag-list parameters use the shared interactive chip editor and explain where values are set", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const controlsSource = readFileSync(join(ROOT, "js", "lib", "controls", "taglist.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "parameter_layout.js"), "utf8");

	assert.match(panelSource, /aaalice\.pcp\.editor\.valueHint/);
	assert.match(controlsSource, /export function createTagListControl/);
	assert.match(controlsSource, /aa-taglist-chip-toggle/);
	assert.match(controlsSource, /aria-pressed/);
	assert.match(controlsSource, /dragstart/);
	assert.match(controlsSource, /entries\.splice\(index, 1\)/);
	assert.match(controlsSource, /parseTagListValue\(input\.value\)/);
	assert.match(controlsSource, /root\.append\(list, input\)/);
	assert.match(panelSource, /parameterControlSpec\(parameter/);
	assert.match(panelSource, /createSharedControl\(spec/);
	assert.doesNotMatch(layoutSource, /parameter\.param_type === "taglist"/);
});

test("parameter editor keeps the reorder hint in the dialog header", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /aaalice-editor-header-hint/);
	assert.match(panelSource, /headerLead\.append\([\s\S]*dialogApi\.heading[\s\S]*reorderHint/);
	assert.doesNotMatch(panelSource, /aaalice-editor-rail-header|aaalice-editor-rail-heading/);
	assert.match(themeSource, /\.aaalice-editor-header-lead\s*\{/);
});

test("parameter editor disables row dragging while renaming so text remains selectable", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /row\.draggable = false;\s*row\.classList\.add\("is-renaming"\)/);
	assert.match(panelSource, /input\.addEventListener\("pointerdown", \(inputEvent\) => inputEvent\.stopPropagation\(\)\)/);
	assert.match(panelSource, /row\.addEventListener\("dragstart", \(event\) => \{\s*if \(row\.classList\.contains\("is-renaming"\)\) \{\s*event\.preventDefault\(\)/);
	assert.match(themeSource, /\.aa-ui-dialog \.aaalice-editor-rename-input\s*\{[^}]*cursor:\s*text[^}]*user-select:\s*text[^}]*-webkit-user-select:\s*text/);
});

test("parameter renames publish ComfyUI's Nodes 2.0 slot-label event", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");

	assert.match(panelSource, /const namesChanged = !structureChanged && previous\.some\(\(item, index\) => item\?\.name !== meta\[index\]\?\.name\)/);
	assert.match(panelSource, /output\.label = meta\[index\]\?\.name \|\| ""/);
	assert.match(panelSource, /output\.localized_name = output\.label/);
	assert.match(panelSource, /if \(structureChanged \|\| namesChanged\) \{\s*node\.graph\?\.trigger\?\.\("node:slot-label:changed"/);
	assert.match(panelSource, /nodeId: node\.id,\s*slotType: globalThis\.LiteGraph\?\.OUTPUT \?\? 2/);
	assert.doesNotMatch(panelSource, /app\.canvas\?\.vueNodesMode === true && Array\.isArray\(node\.outputs\)/);
});

test("prompt assistant choices are sourced from its live node definitions", () => {
	const modelSource = readFileSync(join(ROOT, "js", "lib", "param_model.js"), "utf8");
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");

	assert.match(modelSource, /Array\.isArray\(entry\?\.\[1\]\?\.options\)/);
	assert.match(modelSource, /entry\[1\]\.options\.map\(String\)/);
	for (const contract of [
		["prompt_expand_rule", "PromptExpand", "rule"],
		["prompt_llm_service", "PromptExpand", "llm_service"],
		["prompt_vision_rule", "ImageCaptionNode", "rule"],
		["prompt_vlm_service", "ImageCaptionNode", "vlm_service"],
	]) {
		assert.match(modelSource, new RegExp(contract.map((part) => `"${part}"`).join(", ")));
		assert.match(panelSource, new RegExp(`value: "${contract[0]}"`));
	}
});

test("parameter editor keeps the left parameter rail independently scrollable", () => {
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(themeSource, /\.aaalice-parameter-editor-rail\s*\{[^}]*display:\s*flex[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
	assert.match(themeSource, /\.aaalice-editor-compact-list\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/);
});

test("string multiline setting uses the shared aligned switch row", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /toggleSwitch\(\{[\s\S]*checked: Boolean\(parameter\.config\?\.multiline\)[\s\S]*onChange: \(checked\)/);
	assert.match(panelSource, /className: "aaalice-editor-toggle-field"[\s\S]*children: \[el\("span", "aa-ui-field__label", multilineLabel\), multiline\]/);
	assert.doesNotMatch(panelSource, /multiline\.type\s*=\s*"checkbox"/);
	assert.match(themeSource, /\.aaalice-editor-section--compact\s*\{[^}]*align-self:\s*start/);
	assert.match(themeSource, /\.aaalice-editor-toggle-field\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto[^}]*align-items:\s*center/);
});

test("parameter editor assigns a maintainable theme tone to every parameter type", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const modelSource = readFileSync(join(ROOT, "js", "lib", "param_model.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	const types = ["slider", "seed", "switch", "string", "dropdown", "enum", "image", "taglist", "separator"];

	assert.match(modelSource, /export const PARAMETER_TYPE_ORDER = Object\.freeze/);
	assert.match(modelSource, /new Set\(PARAMETER_TYPE_ORDER\.filter/);
	assert.match(panelSource, /for \(const paramType of PARAMETER_TYPE_ORDER\)/);
	assert.match(panelSource, /row\.dataset\.parameterType = parameter\.param_type/);
	for (const type of types) {
		assert.match(themeSource, new RegExp(`data-parameter-type="${type}"`));
	}
	assert.match(themeSource, /--aaalice-parameter-type-tone/);
	assert.match(themeSource, /\.aaalice-editor-list-row::before/);
});

test("parameter editor creates parameters from a header add menu", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /className: "aaalice-editor-header-add"/);
	assert.match(panelSource, /createAnchoredPopover\(\{/);
	assert.match(panelSource, /for \(const paramType of PARAMETER_TYPE_ORDER\)/);
	assert.match(panelSource, /appendEditorParameter\(editor, paramType, rerender\)/);
	assert.match(panelSource, /role: "menu"/);
	assert.match(panelSource, /\["ArrowDown", "ArrowUp", "Home", "End"\]/);
	assert.doesNotMatch(panelSource, /aaalice-editor-add-control|parameterTypeOptions/);
	assert.match(themeSource, /\.aaalice-parameter-type-option/);
});

test("parameter editor keeps nested confirmations above its own modal", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");

	assert.match(panelSource, /function confirmAction\(text, \{ danger = false \} = \{\}\)/);
	assert.match(panelSource, /dialog = createDialog\(\{[\s\S]*className: danger \? "aa-danger-dialog" : "aa-confirm-dialog"/);
	assert.match(panelSource, /confirmAction\(`\$\{t\("aaalice\.pcp\.confirm\.parameterLinks"[\s\S]*\{ danger: true \}/);
	assert.doesNotMatch(panelSource, /extensionManager\?\.dialog\?\.confirm/);
});

test("parameter descriptions use the shared tooltip shell with readable markdown", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const tooltipSource = readFileSync(join(ROOT, "js", "lib", "description_tooltip.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	const markdownSource = readFileSync(join(ROOT, "js", "lib", "safe_markdown.js"), "utf8");

	assert.match(panelSource, /import \{ attachDescriptionTooltip \} from "\.\/lib\/description_tooltip\.js"/);
	assert.match(panelSource, /attachDescriptionTooltip\(trigger, parameter\.description\)/);
	assert.match(tooltipSource, /export function attachDescriptionTooltip/);
	assert.match(tooltipSource, /descriptionTooltip\.show\(trigger, resolveDescription/);
	assert.match(tooltipSource, /contentMode:\s*"markdown"/);
	assert.match(tooltipSource, /interactive:\s*true/);
	assert.doesNotMatch(panelSource, /import \{ renderSafeMarkdown \}/);
	assert.match(markdownSource, /import DOMPurify from "\.\.\/vendor\/purify\.es\.js"/);
	assert.match(markdownSource, /import \{ marked, Renderer \} from "\.\.\/vendor\/marked\.esm\.js"/);
	assert.match(markdownSource, /gfm:\s*true/);
	assert.match(markdownSource, /DOMPurify\.sanitize/);
	assert.match(markdownSource, /ALLOWED_TAGS/);
	assert.match(markdownSource, /"hr"/);
	assert.match(markdownSource, /"table"/);
	assert.match(markdownSource, /"blockquote"/);
	assert.match(tooltipSource, /className:\s*"aaalice-parameter-tooltip"/);
	assert.match(tooltipSource, /addEventListener\("focus", \(\) => showOrKeep\(true\)\)/);
	assert.match(tooltipSource, /addEventListener\("mouseleave", descriptionTooltip\.scheduleHide\)/);
	assert.match(tooltipSource, /descriptionTooltip\.cancelScheduledHide\(\)/);
	assert.match(tooltipSource, /descriptionTooltip\.focusFirstInteractive\(\)/);
	assert.match(markdownSource, /https\?:\\\/\\\//);
	assert.match(markdownSource, /target=\"_blank\" rel=\"noopener noreferrer\"/);
	assert.match(markdownSource, /template\.innerHTML = renderMarkdownToHtml\(markdown\)/);
	assert.doesNotMatch(panelSource, /function showTooltip|tooltipTimer/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip\s*\{[^}]*max-width:\s*min\(320px/);
	assert.match(themeSource, /:is\(\.aaalice-parameter-tooltip, \.aa-control-markdown__body\) h1\s*\{[^}]*font-size:\s*16px/);
	assert.match(themeSource, /:is\(\.aaalice-parameter-tooltip, \.aa-control-markdown__body\) h2\s*\{[^}]*font-size:\s*14px/);
	assert.match(themeSource, /:is\(\.aaalice-parameter-tooltip, \.aa-control-markdown__body\) h3\s*\{[^}]*font-size:\s*13px/);
	assert.match(themeSource, /:is\(\.aaalice-parameter-tooltip, \.aa-control-markdown__body\) li \+ li/);
	assert.match(themeSource, /:is\(\.aaalice-parameter-tooltip, \.aa-control-markdown__body\) hr\s*\{/);
	assert.match(themeSource, /:is\(\.aaalice-parameter-tooltip, \.aa-control-markdown__body\) table\s*\{/);
	assert.match(themeSource, /:is\(\.aaalice-parameter-tooltip, \.aa-control-markdown__body\) blockquote\s*\{/);
});

test("parameter panel keeps native resize corners and a stable minimum width", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const resizeSource = readFileSync(join(ROOT, "js", "lib", "dom_widget_resize.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /installDomWidgetResizePassthrough\(node, root\)/);
	assert.match(panelSource, /node\.computeSize = function \(\) \{\s*return \[MIN_WIDTH, panelNodeSize\(this\)\];/s);
	assert.match(panelSource, /function syncParameterResizeLayout/);
	assert.match(panelSource, /node\.onResize = function \(\)[\s\S]*syncParameterResizeLayout\(this, root\)/);
	assert.match(panelSource, /syncNativeOutputLayout\(node, computeParameterLayout\(node\)\)/);
	assert.match(panelSource, /reshapeParameterOutputsPreservingLinks\(/);
	assert.doesNotMatch(panelSource, /withVisibleConcreteOutputs|aaalice-parameter-output-hidden|_aaaliceDisplayHidden|_aaaliceRawIndex/);
	assert.doesNotMatch(themeSource, /aaalice-parameter-output-hidden/);
	assert.match(resizeSource, /node\.getWidgetOnPos = function/);
	assert.match(resizeSource, /findResizeDirection\?\.\(x, y\)/);
	assert.match(resizeSource, /app\.canvas\?\.pointer\?\.isDown/);
	assert.match(themeSource, /\.aaalice-pcp-node-root\.is-resizing[\s\S]*pointer-events:\s*none\s*!important/);
	assert.match(panelSource, /growClassicDomWidgetNode\(node\)/);
	assert.match(panelSource, /node\.widgets_up = true/);
	assert.match(panelSource, /node\.widgets_start_y = Number\(node\.constructor\?\.slot_start_y\) \|\| 4/);
	assert.doesNotMatch(panelSource, /node\._arrangeWidgets = function|node\.arrange = function/);
	assert.doesNotMatch(panelSource, /node\.expandToFitContent\?\.\(\)/);
	assert.doesNotMatch(panelSource, /applyCompactNodeSize|scheduleCompactNodeSize|_aaaliceParameterManualHeight|getHeight:/);
});

test("image parameters expose upload feedback, a cover thumbnail and a full preview", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const controlSource = readFileSync(join(ROOT, "js", "lib", "controls", "image.js"), "utf8");
	const uploadSource = readFileSync(join(ROOT, "js", "lib", "image_upload.js"), "utf8");
	const previewSource = readFileSync(join(ROOT, "js", "lib", "image_preview.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /aaalice\.pcp\.image\.uploaded/);
	assert.match(controlSource, /createImageUploadControl\(\{/);
	assert.match(controlSource, /className: "aa-control-image"/);
	assert.match(controlSource, /onClear: \(\) => port\.commit\(null\)/);
	assert.match(uploadSource, /picker\.type = "file"/);
	assert.match(uploadSource, /picker\.click\(\)/);
	assert.match(uploadSource, /thumbnail\.src = source/);
	assert.match(uploadSource, /bindImagePreview\(button, source,[^\n]*immediate: true/);
	assert.match(uploadSource, /className: "aa-image-upload-clear"/);
	assert.match(previewSource, /export function bindImagePreview/);
	assert.match(themeSource, /\.aa-image-upload-button > img\s*\{[^}]*object-fit:\s*cover/s);
	assert.match(themeSource, /\.aa-image-upload-control:hover \.aa-image-upload-clear/);
	assert.match(themeSource, /\.aa-image-upload-clear\.aa-ui-button:hover:not\(:disabled\)[^}]*translateY\(-50%\)/s);
	assert.match(themeSource, /\.aa-image-preview-large > img\s*\{[^}]*object-fit:\s*contain/s);
});

test("image parameters upload dropped image files through the existing upload path", () => {
	const controlSource = readFileSync(join(ROOT, "js", "lib", "controls", "image.js"), "utf8");
	const uploadSource = readFileSync(join(ROOT, "js", "lib", "image_upload.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(controlSource, /createImageUploadControl/);
	assert.match(uploadSource, /export async function uploadImageFile/);
	assert.match(uploadSource, /api\.fetchApi\("\/upload\/image"/);
	assert.match(uploadSource, /export function bindImageDropTarget/);
	assert.match(uploadSource, /addEventListener\("dragenter"/);
	assert.match(uploadSource, /addEventListener\("dragover"/);
	assert.match(uploadSource, /addEventListener\("dragleave"/);
	assert.match(uploadSource, /addEventListener\("drop"/);
	assert.match(uploadSource, /event\.stopPropagation\(\)/);
	assert.match(uploadSource, /event\.dataTransfer\.dropEffect = "copy"/);
	assert.match(uploadSource, /files\.find\(isImageFile\)/);
	assert.match(uploadSource, /bindImageDropTarget\(root/);
	assert.match(themeSource, /\.aa-image-upload-button\.is-drop-target\s*\{/);
});
