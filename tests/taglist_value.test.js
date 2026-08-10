import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTagListValue, parseTagListValue, tagToneIndexes } from "../js/lib/taglist_value.js";
import { CONTROL_TONE_COUNT, stableToneIndexes } from "../js/lib/control_tones.js";

test("tag lists accept English commas, Chinese separators and line breaks", () => {
	assert.deepEqual(
		parseTagListValue("测试1, 测试2，测试3、测试4\r\n测试5\n\n测试6"),
		["测试1", "测试2", "测试3", "测试4", "测试5", "测试6"],
	);
});

test("tag list parsing trims values and removes empty entries", () => {
	assert.deepEqual(parseTagListValue("  cat  ,,，\n blue eyes "), ["cat", "blue eyes"]);
});

test("tag list normalization upgrades strings and preserves enabled state", () => {
	assert.deepEqual(normalizeTagListValue(["cat", { text: "blue eyes", enabled: false }, { text: "cat", enabled: true }]), [
		{ text: "cat", enabled: true },
		{ text: "blue eyes", enabled: false },
	]);
});

test("tag tones are deterministic and distinct within the palette capacity", () => {
	const first = tagToneIndexes(["cat", "blue eyes", "smile", "portrait"]);
	const reordered = tagToneIndexes(["portrait", "smile", "cat", "blue eyes"]);
	assert.deepEqual([...first], [...reordered]);
	assert.equal(new Set(first.values()).size, first.size);
	for (const tone of first.values()) assert.ok(tone >= 0 && tone < 12);
});

test("choice and tag controls share stable presentation-only tone assignment", () => {
	const first = stableToneIndexes(["option_a", "option_b", "option_c"]);
	const second = stableToneIndexes(["option_c", "option_a", "option_b"]);
	assert.deepEqual([...first], [...second]);
	assert.equal(new Set(first.values()).size, first.size);
	for (const tone of first.values()) assert.ok(tone >= 0 && tone < CONTROL_TONE_COUNT);
});
