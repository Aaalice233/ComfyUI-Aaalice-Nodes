import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/simple_notify.js", import.meta.url), "utf8");

test("package entry imports the SimpleNotify frontend", () => {
	assert.match(extension, /import "\.\/simple_notify\.js"/);
});

test("execution and explicit node-menu paths are both installed", () => {
	assert.match(source, /beforeRegisterNodeDef/);
	assert.match(source, /originalOnExecuted\?\.apply/);
	assert.match(source, /aaalice_simple_notify\?\.\[0\]/);
	assert.match(source, /getNodeMenuItems/);
	assert.match(source, /Notification\.requestPermission|requestPermission/);
	assert.match(source, /browser user activation is preserved/);
});

test("errors use the native ComfyUI toast instead of custom DOM", () => {
	assert.match(source, /extensionManager\?\.toast\?\.add/);
	assert.match(source, /reportedErrors\.has\(code\)/);
	assert.match(source, /reportedErrors\.add\(code\)/);
	assert.doesNotMatch(source, /document\.createElement/);
});
