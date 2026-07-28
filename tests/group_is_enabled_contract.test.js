import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/group_is_enabled.js", import.meta.url), "utf8");
const probe = readFileSync(new URL("../js/lib/group_probe.js", import.meta.url), "utf8");

test("package entry imports the GroupIsEnabled frontend", () => {
	assert.match(extension, /import "\.\/group_is_enabled\.js"/);
});

test("the group selector lists live groups with duplicate-safe labels", () => {
	assert.match(source, /node\.addWidget\("combo"/);
	assert.match(source, /values: \(\) => groupLabels\(currentGroups\(node\)\)/);
	assert.match(probe, /recomputeInsideNodes/);
	assert.match(probe, /`\$\{title\} \(\$\{count\}\)`/);
});

test("queue-time payload snapshots member modes and excludes the probe itself", () => {
	assert.match(source, /registerProbePromptInjection/);
	assert.match(source, /group_state_payload/);
	assert.match(probe, /app\.graphToPrompt = async function/);
	assert.match(probe, /classifyGroupNodes/);
	assert.match(probe, /\.filter\(\(member\) => member !== node\)/);
	assert.match(probe, /state: "missing"/);
});
