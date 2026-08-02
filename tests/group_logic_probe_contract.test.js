import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStyleEntry } from "./helpers/style_source.js";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/group_logic_probe.js", import.meta.url), "utf8");
const styles = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));

function loadStateHelpers() {
	const stateStart = source.indexOf('const PROPERTY = "groupLogicProbe"');
	const stateEnd = source.indexOf("function commit(node, mutate)", stateStart);
	const heightStart = source.indexOf("function minHeightFor(node)");
	const heightEnd = source.indexOf("function setupProbe", heightStart);
	assert.ok(stateStart >= 0 && stateEnd > stateStart && heightStart >= 0 && heightEnd > heightStart);
	return Function(`${source.slice(stateStart, stateEnd)}\n${source.slice(heightStart, heightEnd)}\nreturn { stateFor, minHeightFor };`)();
}

test("package entry imports the GroupLogicProbe frontend", () => {
	assert.match(extension, /import "\.\/group_logic_probe\.js"/);
});

test("conditions combine groups with an AND/OR segmented gate", () => {
	assert.match(source, /segmentedControl\(\{[\s\S]*value: "and", label: t\("aaalice\.groupLogic\.and"/);
	assert.match(source, /value: "or", label: t\("aaalice\.groupLogic\.or"/);
	assert.match(source, /mode: source\.mode === "or" \? "or" : "and"/);
});

test("reuses normalized state and invalidates it when loaded state is replaced", () => {
	const { stateFor, minHeightFor } = loadStateHelpers();
	let mapReads = 0;
	const trackedConditions = (items) => new Proxy(items, {
		get(target, property, receiver) {
			if (property === "map") mapReads++;
			return Reflect.get(target, property, receiver);
		},
	});
	const node = { properties: { groupLogicProbe: { mode: "invalid", conditions: trackedConditions([{ label: 12, expect: "invalid" }]) } } };
	const first = stateFor(node);
	assert.equal(mapReads, 1);
	assert.deepEqual(first, { mode: "and", conditions: [{ label: "12", expect: "disabled" }] });
	assert.strictEqual(stateFor(node), first);
	assert.equal(minHeightFor(node), 116);
	assert.equal(minHeightFor(node), 116);
	assert.equal(mapReads, 1);

	node.properties.groupLogicProbe = { mode: "or", conditions: trackedConditions([{ label: "Loaded", expect: "enabled" }, { label: "Second", expect: "disabled" }]) };
	const loaded = stateFor(node);
	assert.notStrictEqual(loaded, first);
	assert.equal(mapReads, 2);
	assert.deepEqual(loaded, { mode: "or", conditions: [{ label: "Loaded", expect: "enabled" }, { label: "Second", expect: "disabled" }] });
	assert.strictEqual(stateFor(node), loaded);
	assert.equal(minHeightFor(node), 152);
	assert.equal(mapReads, 2);
	assert.deepEqual(JSON.parse(JSON.stringify(node.properties)), { groupLogicProbe: loaded });

	const heightBody = source.slice(source.indexOf("function minHeightFor(node)"), source.indexOf("function setupProbe"));
	assert.doesNotMatch(heightBody, /normalizeState|\.map\(|\[\.\.\.|\{\.\.\./);
	assert.match(source, /if \(node\._aaGroupLogicMounted\) \{\s*stateFor\(node\);\s*render\(node\);/);
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
