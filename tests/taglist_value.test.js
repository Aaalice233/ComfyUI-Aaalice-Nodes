import test from "node:test";
import assert from "node:assert/strict";

import { formatTagListValue, parseTagListValue } from "../js/lib/taglist_value.js";

test("tag lists accept English commas, Chinese commas and line breaks", () => {
	assert.deepEqual(
		parseTagListValue("测试1, 测试2，测试3\r\n测试4\n\n测试5"),
		["测试1", "测试2", "测试3", "测试4", "测试5"],
	);
});

test("tag list parsing trims values and removes empty entries", () => {
	assert.deepEqual(parseTagListValue("  cat  ,,，\n blue eyes "), ["cat", "blue eyes"]);
});

test("tag list formatting uses one editable tag per line", () => {
	assert.equal(formatTagListValue(["cat", "blue eyes"]), "cat\nblue eyes");
	assert.equal(formatTagListValue(null), "");
});
