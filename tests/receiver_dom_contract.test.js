import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("receiver materializes only the slots in its binding", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "receiver_layout.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	assert.match(receiverSource, /reshapeReceiverSlots\(receiver, current\.slots\.length\)/);
	assert.match(layoutSource, /export function reshapeReceiverSlots/);
	assert.match(layoutSource, /node\.removeInput\(node\.inputs\.length - 1\)/);
	assert.match(layoutSource, /node\.addOutput\(`output_\$\{index \+ 1\}`/);
	assert.doesNotMatch(receiverSource, /data-aaalice-receiver-hidden|withVisibleReceiverSlots|installReceiverCanvasSlotHitTest|_aaaliceDisplayHidden|_aaaliceRawIndex|_aaaliceVisibleReceiverSlots/);
	assert.doesNotMatch(themeSource, /data-aaalice-receiver-hidden/);
});

test("receiver uses a compact actionable status icon", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "receiver_layout.js"), "utf8");
	assert.match(receiverSource, /iconButton\(\{/);
	assert.match(receiverSource, /label:\s*state\.text/);
	assert.match(receiverSource, /title:\s*state\.text/);
	assert.match(receiverSource, /state\.kind\s*!==\s*"success"/);
	assert.match(receiverSource, /openBindingDialog/);
	assert.doesNotMatch(layoutSource, /footerHeight|footerTop/);
});

test("panel and receiver menus expose reciprocal sync and navigation across subgraphs", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const panelSource = readFileSync(join(ROOT, "js", "parameter_panel.js"), "utf8");
	const kjSource = readFileSync(join(ROOT, "js", "parameter_panel_kj.js"), "utf8");
	assert.match(panelSource, /parameterPanelReceiverMenuItems/);
	assert.match(kjSource, /syncBoundReceivers/);
	assert.match(kjSource, /boundParameterReceivers/);
	assert.match(kjSource, /navigateToGraphNode/);
	assert.match(kjSource, /createLinkedKjSets[\s\S]*arrangeLinkedKjSets\(panel\)/);
	assert.match(receiverSource, /visiblePanels/);
	assert.match(receiverSource, /connectDescendantToAncestor/);
	assert.match(receiverSource, /panelGraphId/);
	assert.match(receiverSource, /getGraphId/);
});

test("receiver name refresh atomically reconciles slots and uses the KJ Get naming API", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const kjSource = readFileSync(join(ROOT, "js", "parameter_panel_kj.js"), "utf8");
	assert.match(receiverSource, /current\.slots = reconcileReceiverSlots\([\s\S]*?\)\.ordered;/);
	assert.match(receiverSource, /authoritativeSetNames\?\.\[String\(parameter\.id\)\]/);
	assert.match(receiverSource, /authoritativeSetNames\?\.\[String\(parameter\.id\)\][\s\S]*?\|\| desiredSetName\(panel, parameter\)/);
	assert.doesNotMatch(receiverSource, /authoritativeSetNames\?\.\[String\(parameter\.id\)\][\s\S]*?directSetNodes\(panel, index\)/);
	assert.match(receiverSource, /typeof getNode\?\.setName === "function"/);
	assert.match(receiverSource, /getNode\.setName\(name\)/);
	assert.match(kjSource, /detail: \{ nodeId: panel\.id, node: panel, updated, errors, setNames \}/);
});

test("receiver invalidates both Nodes 2.0 slot arrays after presentation changes", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	assert.match(receiverSource, /presentationChanged \|\|= String\(nativeSlot\._aaaliceParamId \|\| ""\) !== String\(slot\?\.parameterId \|\| ""\)/);
	assert.match(receiverSource, /globalThis\.LiteGraph\?\.INPUT \?\? 1/);
	assert.match(receiverSource, /globalThis\.LiteGraph\?\.OUTPUT \?\? 2/);
	assert.match(receiverSource, /receiver\.graph\?\.trigger\?\.\("node:slot-label:changed", \{\s*nodeId: receiver\.id,\s*slotType,/s);
});

test("receiver keeps native resize corners and can shrink after growing", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "receiver_layout.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	assert.match(receiverSource, /installDomWidgetResizePassthrough\(receiver, root\)/);
	assert.match(receiverSource, /receiver\.computeSize = function \(\) \{\s*return \[RECEIVER_LAYOUT\.minWidth, receiverNodeSize\(this\)\];/s);
	assert.match(receiverSource, /enforceReceiverWidth\(receiver, \{ initialize: !loaded \}\)/);
	assert.match(receiverSource, /initialize\s*\?\s*RECEIVER_LAYOUT\.defaultWidth/);
	assert.match(receiverSource, /element\.style\.setProperty\("min-width", `\$\{RECEIVER_LAYOUT\.minWidth\}px`\)/);
	assert.match(receiverSource, /size\[0\] = Math\.max\(RECEIVER_LAYOUT\.minWidth/);
	assert.match(layoutSource, /minWidth:\s*220/);
	assert.match(layoutSource, /defaultWidth:\s*280/);
	assert.match(themeSource, /\.aaalice-receiver-root\s*\{[^}]*min-width:\s*220px/s);
	assert.match(receiverSource, /function syncReceiverResizeLayout/);
	assert.match(receiverSource, /receiver\.onResize = function \(size\)[\s\S]*syncReceiverResizeLayout\(this\)/);
	assert.match(receiverSource, /syncReceiverLayout\(receiver, receiver\.inputs\?\.length \|\| 0\)/);
	assert.doesNotMatch(receiverSource, /Math\.max\(RECEIVER_LAYOUT\.minWidth, Number\(this\.size/);
	assert.match(receiverSource, /growClassicDomWidgetNode\(receiver\)/);
	assert.match(receiverSource, /receiver\.widgets_up = true/);
	assert.match(receiverSource, /receiver\.widgets_start_y = Number\(receiver\.constructor\?\.slot_start_y\) \|\| 4/);
	assert.doesNotMatch(receiverSource, /receiver\._arrangeWidgets = function|receiver\.arrange = function/);
	assert.doesNotMatch(receiverSource, /receiver\.expandToFitContent\?\.\(\)/);
	assert.doesNotMatch(receiverSource, /applyCompactReceiverSize|scheduleCompactReceiverSize|_aaaliceReceiverManualHeight|getHeight:/);
});

test("receiver does not keep protocol-only slots in the canvas arrays", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "receiver_layout.js"), "utf8");
	assert.match(receiverSource, /reshapeReceiverSlots\(receiver, reconciliation\.ordered\.length\)/);
	assert.match(receiverSource, /reshapeReceiverSlots\(receiver, current\.slots\.length\)/);
	assert.match(receiverSource, /function disconnectReceiverInputs/);
	assert.match(receiverSource, /function disconnectReceiverOutputs/);
	assert.doesNotMatch(receiverSource, /index < 32/);
	assert.match(receiverSource, /receiverSlotsShareStablePrefix/);
	assert.match(receiverSource, /if \(!preserveStablePrefix\) \{[\s\S]*disconnectReceiverInputs\(receiver\);[\s\S]*disconnectReceiverOutputs\(receiver\);/);
	assert.match(receiverSource, /getMinHeight:\s*\(\) => computeReceiverLayout\(receiver, receiver\.inputs\?\.length \|\| 0\)\.height/);
	assert.doesNotMatch(receiverSource, /_processNodeClick|getInputPos", "getOutputPos|-1e6/);
	assert.doesNotMatch(layoutSource, /_aaaliceAllReceiver|withVisibleReceiverSlots/);
});
