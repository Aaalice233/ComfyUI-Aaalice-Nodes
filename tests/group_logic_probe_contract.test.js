import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/group_logic_probe.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");

test("package entry imports the GroupLogicProbe frontend", () => {
	assert.match(extension, /import "\.\/group_logic_probe\.js"/);
});

test("conditions combine groups with an AND/OR segmented gate", () => {
	assert.match(source, /segmentedControl\(\{[\s\S]*value: "and", label: t\("aaalice\.groupLogic\.and"/);
	assert.match(source, /value: "or", label: t\("aaalice\.groupLogic\.or"/);
	assert.match(source, /mode: source\.mode === "or" \? "or" : "and"/);
});

test("each row picks a live group and an enabled/disabled expectation", () => {
	assert.match(source, /listboxControl\(\{[\s\S]*className: "aa-group-logic__group"/);
	assert.match(source, /className: "aa-group-logic__expect"/);
	assert.match(source, /EXPECTS = \["enabled", "disabled"\]/);
	assert.match(source, /groupLabels\(currentGroups\(node\)\)/);
	assert.match(source, /is-missing/);
});

test("queue-time payload snapshots every referenced group", () => {
	assert.match(source, /registerProbePromptInjection/);
	assert.match(source, /group_logic_payload/);
	assert.match(source, /\.\.\.snapshotGroup\(node, condition\.label\)/);
	assert.match(styles, /\.aa-group-logic__rows \{[^}]*overflow-y: auto;/);
	assert.match(styles, /\.aa-group-logic__group\.is-missing/);
});
