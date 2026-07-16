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

test("parameter panel keeps native resize corners and a stable minimum width", () => {
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const resizeSource = readFileSync(join(ROOT, "js", "lib", "dom_widget_resize.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

	assert.match(panelSource, /installDomWidgetResizePassthrough\(node, root\)/);
	assert.match(panelSource, /node\.computeSize = function \(\) \{\s*return \[MIN_WIDTH, panelNodeSize\(this\)\];/s);
	assert.match(panelSource, /function syncParameterResizeLayout/);
	assert.match(panelSource, /node\.onResize = function \(\)[\s\S]*syncParameterResizeLayout\(this, root\)/);
	assert.match(panelSource, /syncNativeOutputLayout\(node, computeParameterLayout\(node\)\)/);
	assert.match(panelSource, /reshapeParameterOutputs\(node, meta\.length\)/);
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
	const chooserSource = panelSource.match(/function chooseImage[\s\S]+?\n}\n\nlet imagePreview/)?.[0] || "";

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
