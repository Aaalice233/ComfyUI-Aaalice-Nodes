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
	const dynamicSource = readFileSync(join(ROOT, "js", "lib", "dynamic_slots.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "receiver_layout.js"), "utf8");
	assert.match(receiverSource, /presentationChanged \|\|= String\(nativeSlot\._aaaliceParamId \|\| ""\) !== String\(slot\?\.parameterId \|\| ""\)/);
	assert.match(receiverSource, /publishDynamicSlotState\(receiver, \{ inputs: true, outputs: true \}\)/);
	assert.match(dynamicSource, /node\[key\] = slots\.map\(cloneSlotForShallowConsumers\)/);
	assert.match(dynamicSource, /graph\?\.trigger\?\.\("node:slot-label:changed"/);
	assert.doesNotMatch(receiverSource, /receiver\._setConcreteSlots = function/);
	assert.doesNotMatch(layoutSource, /_concreteInputs|_concreteOutputs/);
});

test("ParameterPanel title tracking does not replace ComfyUI graph event handlers", () => {
	const kjSource = readFileSync(join(ROOT, "js", "parameter_panel_kj.js"), "utf8");
	assert.match(kjSource, /Object\.getOwnPropertyDescriptor\(panel, "title"\)/);
	assert.match(kjSource, /installTitleWatcher\(panel\)/);
	assert.doesNotMatch(kjSource, /graph\.onTrigger\s*=/);
});

test("receiver synchronization keeps managed KJ Gets in the receiver subgraph", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	assert.match(receiverSource, /targetGetGraph = selectManagedGetGraph\(receiver\.graph, existingGetGraphs, setGraphs\)/);
	assert.match(receiverSource, /targetGraph\.add\(getNode\)/);
	assert.match(receiverSource, /receiverGraphId: graphId\(receiver\.graph\)/);
	assert.match(receiverSource, /slot\.getGraphId = graphId\(getNode\.graph\)/);
	assert.match(receiverSource, /findNodeByGraphRef\(graph, slot\.getGraphId, slot\.getNodeId\)/);
	assert.match(receiverSource, /connectDescendantToAncestor\(/);
	assert.doesNotMatch(receiverSource, /app\.graph\.add\(getNode\)|app\.canvas\?\.graph\.add\(getNode\)/);
});

test("receiver verifies the complete stable-id commit before reporting sync success", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	assert.match(receiverSource, /function assertSynchronizationCommitted\(receiver, panel\)/);
	assert.match(receiverSource, /String\(input\?\._aaaliceParamId \|\| ""\) === String\(slot\.parameterId\)/);
	assert.match(receiverSource, /String\(output\?\._aaaliceParamId \|\| ""\) === String\(slot\.parameterId\)/);
	assert.match(receiverSource, /connectedGet === getNode/);
	assert.match(receiverSource, /ownerMatches\(getNode, receiver, slot\)/);
	assert.match(receiverSource, /setName === String\(slot\.setName\)/);
	assert.match(receiverSource, /getName === String\(slot\.setName\)/);
	assert.match(receiverSource, /syncSlotPresentation\(receiver\);\s*assertSynchronizationCommitted\(receiver, panel\);/);
	assert.match(receiverSource, /receiver\.properties\.receiverBinding = previousBinding/);
	assert.match(receiverSource, /nativeToast\("success"[\s\S]*return true/);
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

test("receiver coalesces deferred renders per node and cancels removal work", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	assert.match(receiverSource, /const pendingReceiverRenders = new WeakMap\(\)/);
	assert.match(receiverSource, /function scheduleReceiverRender\(receiver\) \{\s*if \(!mountedReceivers\.has\(receiver\) \|\| pendingReceiverRenders\.has\(receiver\)\) return;/s);
	assert.match(receiverSource, /pendingReceiverRenders\.set\(receiver, timer\)/);
	assert.match(receiverSource, /receiver\.onConnectionsChange = function \(\) \{[\s\S]*scheduleReceiverRender\(this\)/);
	assert.doesNotMatch(receiverSource, /onConnectionsChange = function \(\) \{[\s\S]*?setTimeout\(\(\) => render\(this\)/);
	assert.match(receiverSource, /receiver\.onRemoved = function \(\) \{\s*cancelScheduledReceiverRender\(this\);/s);
});

test("receiver batches one Nodes 2.0 DOM scan for all mounted instances", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	assert.match(receiverSource, /function isVueNodesMode\(\) \{\s*return globalThis\.LiteGraph\?\.vueNodesMode === true;\s*\}/s);
	assert.match(receiverSource, /function scheduleVueReceiverSlots\(\) \{\s*if \(!isVueNodesMode\(\) \|\| vueReceiverFrame/);
	assert.match(receiverSource, /vueReceiverFrame = requestAnimationFrame\(\(\) => \{\s*vueReceiverFrame = 0;\s*markVueReceiverSlots\(\);/s);
	assert.match(receiverSource, /const receiversById = new Map\(\);[\s\S]*for \(const receiver of mountedReceivers\)[\s\S]*receiversById\.set\(id, receiver\)/);
	assert.match(receiverSource, /for \(const element of document\.querySelectorAll\("\[data-node-id\]"\)\)[\s\S]*receiversById\.get\(element\.getAttribute\("data-node-id"\)\)/);
	assert.equal((receiverSource.match(/document\.querySelectorAll\("\[data-node-id\]"\)/g) || []).length, 1);
	assert.match(receiverSource, /function receiverMutationsNeedSync\(records\)/);
	assert.match(receiverSource, /new MutationObserver\(\(records\) => \{\s*if \(receiverMutationsNeedSync\(records\)\) scheduleVueReceiverSlots\(\);/s);
	assert.doesNotMatch(receiverSource, /markVueReceiverSlots\(receiver\)/);
});

test("receiver filters value-only and unrelated panel events before graph lookup", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const start = receiverSource.indexOf("const onPanelChange = (event) => {");
	const end = receiverSource.indexOf("window.addEventListener(EVENT_PARAMETER_CHANGED", start);
	assert.ok(start >= 0 && end > start);
	const handler = receiverSource.slice(start, end);
	const valueOnlyGuard = handler.indexOf("event.type === EVENT_PARAMETER_CHANGED && detail.structure === false");
	const bindingIdGuard = handler.indexOf("String(changedNodeId) !== String(current.panelNodeId)");
	const panelLookup = handler.indexOf("const source = panelFor(receiver);");
	assert.ok(valueOnlyGuard >= 0);
	assert.ok(bindingIdGuard > valueOnlyGuard);
	assert.ok(panelLookup > bindingIdGuard);
});

test("receiver allows host low-zoom DOM fallback", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	assert.match(receiverSource, /serialize:\s*false, hideOnZoom:\s*true, margin:\s*0/);
	assert.doesNotMatch(receiverSource, /hideOnZoom:\s*false/);
});
