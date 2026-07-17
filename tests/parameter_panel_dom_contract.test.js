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
	assert.match(styles, /\.aa-ui-tooltip\s*\{[\s\S]*background:\s*var\(--aa-ui-tooltip-surface\)[\s\S]*box-shadow:\s*0 8px 22px/);
	assert.match(styles, /\.aa-ui-tooltip::before\s*\{[\s\S]*var\(--aa-ui-tooltip-arrow-x/);
	assert.match(styles, /\.aa-ui-tooltip\[data-placement="below"\]::before/);
	assert.match(styles, /inset 0 1px 0/);
	assert.doesNotMatch(styles, /aa-ui-tooltip-in[^}]*scale\(/);
	assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.aa-ui-tooltip/);
});

test("parameter enum segments stay inside the 32px control track", () => {
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	const groupRule = ruleBody(themeSource, ".aaalice-pcp-segmented");
	const segmentRule = ruleBody(themeSource, ".aaalice-pcp-segment");

	assert.match(groupRule, /box-sizing:\s*border-box/);
	assert.match(groupRule, /height:\s*32px/);
	assert.match(segmentRule, /box-sizing:\s*border-box/);
	assert.match(segmentRule, /height:\s*100%/);
});

test("parameter enum uses a sliding selection indicator", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /aaalice-pcp-segment-indicator/);
	assert.match(panelSource, /positionIndicator\(choice\)/);
	assert.match(panelSource, /persist\(\{\s*redraw:\s*false\s*\}\)/);
	assert.match(panelSource, /event\.detail\?\.redraw === false/);
	assert.match(panelSource, /_aaaliceResizeObserver\?\.disconnect\(\)/);
	assert.match(themeSource, /\.aaalice-pcp-segment-indicator\s*\{[^}]*transition:\s*[^;}]*transform/s);
});

test("parameter labels keep a small gap above their controls", () => {
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "parameter_layout.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(layoutSource, /rowHeight:\s*50/);
	assert.match(layoutSource, /top:\s*rowTop \+ 17/);
	assert.match(themeSource, /\.aaalice-pcp-node-root \.aaalice-pcp-node-row\s*\{[^}]*row-gap:\s*2px/s);
});

test("parameter descriptions use the shared tooltip shell with readable markdown", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	const markdownSource = readFileSync(join(ROOT, "js", "lib", "safe_markdown.js"), "utf8");

	assert.match(panelSource, /createTooltip/);
	assert.match(panelSource, /descriptionTooltip\.show\(trigger, resolveDescription/);
	assert.match(panelSource, /contentMode:\s*"markdown"/);
	assert.match(panelSource, /interactive:\s*true/);
	assert.doesNotMatch(panelSource, /import \{ renderSafeMarkdown \}/);
	assert.match(markdownSource, /import DOMPurify from "\.\.\/vendor\/purify\.es\.js"/);
	assert.match(markdownSource, /import \{ marked, Renderer \} from "\.\.\/vendor\/marked\.esm\.js"/);
	assert.match(markdownSource, /gfm:\s*true/);
	assert.match(markdownSource, /DOMPurify\.sanitize/);
	assert.match(markdownSource, /ALLOWED_TAGS/);
	assert.match(markdownSource, /"hr"/);
	assert.match(markdownSource, /"table"/);
	assert.match(markdownSource, /"blockquote"/);
	assert.match(panelSource, /className:\s*"aaalice-parameter-tooltip"/);
	assert.match(panelSource, /addEventListener\("focus", \(\) => showOrKeep\(true\)\)/);
	assert.match(panelSource, /addEventListener\("mouseleave", descriptionTooltip\.scheduleHide\)/);
	assert.match(panelSource, /descriptionTooltip\.cancelScheduledHide\(\)/);
	assert.match(panelSource, /descriptionTooltip\.focusFirstInteractive\(\)/);
	assert.match(markdownSource, /https\?:\\\/\\\//);
	assert.match(markdownSource, /target=\"_blank\" rel=\"noopener noreferrer\"/);
	assert.match(markdownSource, /template\.innerHTML = renderMarkdownToHtml\(markdown\)/);
	assert.doesNotMatch(panelSource, /function showTooltip|tooltipTimer/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip\s*\{[^}]*max-width:\s*min\(320px/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip h1\s*\{[^}]*font-size:\s*16px/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip h2\s*\{[^}]*font-size:\s*14px/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip h3\s*\{[^}]*font-size:\s*13px/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip li \+ li/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip hr\s*\{/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip table\s*\{/);
	assert.match(themeSource, /\.aaalice-parameter-tooltip blockquote\s*\{/);
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
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	const chooserSource = panelSource.match(/function chooseImage[\s\S]+?\r?\n}\r?\n\r?\nlet imagePreview/)?.[0] || "";

	assert.match(panelSource, /aaalice\.pcp\.image\.uploaded/);
	assert.match(chooserSource, /upload\.type = "file"/);
	assert.match(chooserSource, /upload\.click\(\)/);
	assert.doesNotMatch(chooserSource, /createDialog|type = "text"|useExisting/);
	assert.match(panelSource, /aaalice-pcp-node-image/);
	assert.match(panelSource, /aaalice-pcp-image-preview/);
	assert.match(panelSource, /aaalice-pcp-node-image-clear/);
	assert.match(panelSource, /parameter\.value = null/);
	assert.match(panelSource, /imageControl\.addEventListener\("mouseenter", showPreview\)/);
	assert.match(panelSource, /imageControl\.addEventListener\("mouseleave", hideImagePreview\)/);
	assert.match(panelSource, /showImagePreview\(imageButton, reference/);
	assert.match(themeSource, /\.aaalice-pcp-node-image\s*\{[^}]*background-position:\s*center;[^}]*background-size:\s*cover/s);
	assert.match(themeSource, /\.aaalice-pcp-node-image-control:hover \.aaalice-pcp-node-image-clear/);
	assert.match(themeSource, /\.aaalice-pcp-node-image-clear:hover:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(-50%\)/s);
	assert.match(themeSource, /\.aaalice-pcp-image-preview img\s*\{[^}]*object-fit:\s*contain/s);
});

test("image parameters upload dropped image files through the existing upload path", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /async function uploadImageFile/);
	assert.match(panelSource, /api\.fetchApi\("\/upload\/image"/);
	assert.match(panelSource, /function attachImageDropTarget/);
	assert.match(panelSource, /addEventListener\("dragenter"/);
	assert.match(panelSource, /addEventListener\("dragover"/);
	assert.match(panelSource, /addEventListener\("dragleave"/);
	assert.match(panelSource, /addEventListener\("drop"/);
	assert.match(panelSource, /event\.stopPropagation\(\)/);
	assert.match(panelSource, /event\.dataTransfer\.dropEffect = "copy"/);
	assert.match(panelSource, /files\.find\(isImageFile\)/);
	assert.match(themeSource, /\.aaalice-pcp-node-image\.is-drop-target\s*\{/);
});
