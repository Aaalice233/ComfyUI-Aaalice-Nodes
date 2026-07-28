import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/group_is_enabled.js", import.meta.url), "utf8");

test("package entry imports the GroupIsEnabled frontend", () => {
	assert.match(extension, /import "\.\/group_is_enabled\.js"/);
});

test("the group selector lists live groups with duplicate-safe labels", () => {
	assert.match(source, /node\.addWidget\("combo"/);
	assert.match(source, /values: \(\) => groupLabels\(currentGroups\(node\)\)/);
	assert.match(source, /recomputeInsideNodes/);
	assert.match(source, /`\$\{title\} \(\$\{count\}\)`/);
});

test("queue-time payload snapshots member modes and excludes the probe itself", () => {
	assert.match(source, /app\.graphToPrompt = async function/);
	assert.match(source, /group_state_payload/);
	assert.match(source, /classifyGroupNodes/);
	assert.match(source, /\.filter\(\(member\) => member !== node\)/);
	assert.match(source, /state: "missing"/);
});
