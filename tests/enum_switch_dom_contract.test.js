import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/enum_switch.js", import.meta.url), "utf8");

test("sync status uses the shared accessible icon button", () => {
	assert.match(source, /iconButton\(\{/);
	assert.match(source, /title:\s*status\.text/);
	assert.match(source, /label:\s*status\.text/);
	assert.match(source, /getHeight:\s*\(\)\s*=>\s*0/);
	assert.match(source, /margin:\s*0/);
	assert.match(source, /NODE_TITLE_HEIGHT/);
});

test("prompt payload is injected instead of exposed as a schema widget", () => {
	assert.match(source, /promptNode\.inputs\.routes_json/);
	assert.match(source, /enumPromptPayload/);
});

test("classic and Nodes 2.0 lifecycle paths are both installed", () => {
	assert.match(source, /beforeRegisterNodeDef/);
	assert.match(source, /nodeCreated/);
	assert.match(source, /loadedGraphNode/);
	assert.match(source, /reshapeEnumBranchInputs/);
	assert.match(source, /reshapeEnumBranchInputsPreservingLinks/);
	assert.doesNotMatch(source, /withVisibleInputs|getSlotInPosition|data-aaalice-enum-hidden|markVueSlots|MutationObserver/);
	assert.match(source, /node\.widgets_up = true/);
	assert.match(source, /node\.widgets_start_y = -\(Number\(globalThis\.LiteGraph\?\.NODE_TITLE_HEIGHT\) \|\| 30\)/);
	assert.doesNotMatch(source, /node\._arrangeWidgets = function|placeStatusWidget/);
});

test("shared dialogs mount immediately without a second open call", () => {
	assert.match(source, /createDialog\(\{/);
	assert.doesNotMatch(source, /dialog\.open\s*\(/);
});
