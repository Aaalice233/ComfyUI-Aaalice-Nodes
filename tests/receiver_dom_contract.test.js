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
