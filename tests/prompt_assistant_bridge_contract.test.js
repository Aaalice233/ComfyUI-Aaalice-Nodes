import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/prompt_assistant_bridge.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");

test("package entry imports the PromptAssistantBridge frontend", () => {
	assert.match(extension, /import "\.\/prompt_assistant_bridge\.js"/);
});

test("availability is judged once by the backend info route", () => {
	assert.match(source, /\/aaalice\/prompt-assistant-bridge\/info/);
	assert.match(source, /infoPromise \|\|=/);
});

test("settings shortcut opens both Prompt Assistant managers through dynamic imports", () => {
	assert.match(source, /modules\/rulesConfigManager\.js/);
	assert.match(source, /modules\/apiConfigManager\.js/);
	assert.match(source, /showRulesConfigModal/);
	assert.match(source, /showAPIConfigModal/);
	assert.match(source, /createAnchoredPopover/);
});

test("missing assistant keeps a visible warning and expansion failures toast natively", () => {
	assert.match(source, /aaalice-pa-bridge-warning/);
	assert.match(source, /extensionManager\?\.toast\?\.add/);
	assert.match(source, /aaalice_prompt_assistant_bridge/);
	assert.match(styles, /\.aaalice-pa-bridge-warning/);
	assert.match(styles, /var\(--aa-ui-warning\)/);
});
