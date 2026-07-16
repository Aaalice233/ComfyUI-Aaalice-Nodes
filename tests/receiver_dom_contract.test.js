import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("receiver hidden slots use a Vue-stable DOM attribute", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	assert.match(receiverSource, /data-aaalice-receiver-hidden/);
	assert.match(themeSource, /\[data-aaalice-receiver-hidden="true"\]\s*\{\s*display:\s*none\s*!important;/);
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

test("receiver keeps native resize corners and can shrink after growing", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	assert.match(receiverSource, /installDomWidgetResizePassthrough\(receiver, root\)/);
	assert.match(receiverSource, /receiver\.computeSize = function \(\) \{\s*return \[RECEIVER_LAYOUT\.minWidth, receiverNodeSize\(this\)\];/s);
	assert.match(receiverSource, /function syncReceiverResizeLayout/);
	assert.match(receiverSource, /receiver\.onResize = function \(\)[\s\S]*syncReceiverResizeLayout\(this\)/);
	assert.match(receiverSource, /syncReceiverLayout\(receiver, binding\(receiver\)\.slots\.length\)/);
	assert.doesNotMatch(receiverSource, /Math\.max\(RECEIVER_LAYOUT\.minWidth, Number\(this\.size/);
});

test("receiver hidden protocol slots cannot capture pointer hit tests", () => {
	const receiverSource = readFileSync(join(ROOT, "js", "parameter_receiver.js"), "utf8");
	const layoutSource = readFileSync(join(ROOT, "js", "lib", "receiver_layout.js"), "utf8");
	assert.match(receiverSource, /function installReceiverCanvasSlotHitTest/);
	assert.match(receiverSource, /canvas\._processNodeClick = function \([^)]*node\)[\s\S]*withVisibleReceiverSlots\(node/);
	assert.match(receiverSource, /installReceiverCanvasSlotHitTest\(\);/);
	assert.match(receiverSource, /\["getSlotInPosition", "getInputOnPos", "getOutputOnPos"\]/);
	assert.match(layoutSource, /\["inputs", "outputs", "_concreteInputs", "_concreteOutputs"\]/);
	assert.doesNotMatch(layoutSource, /hasConcrete/);
});
