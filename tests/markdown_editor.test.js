import test from "node:test";
import assert from "node:assert/strict";

import { applyMarkdownFormat } from "../js/lib/markdown_editor.js";

test("Markdown editor wraps inline selections and supplies useful placeholders", () => {
	assert.deepEqual(applyMarkdownFormat("hello", 0, 5, "bold"), { value: "**hello**", selectionStart: 2, selectionEnd: 7 });
	assert.deepEqual(applyMarkdownFormat("", 0, 0, "link"), { value: "[link text](https://)", selectionStart: 1, selectionEnd: 10 });
	assert.deepEqual(applyMarkdownFormat("", 0, 0, "image"), { value: "![image description](https://)", selectionStart: 2, selectionEnd: 19 });
});

test("Markdown editor prefixes multiline block syntax", () => {
	assert.deepEqual(applyMarkdownFormat("alpha\nbeta", 0, 10, "ordered-list"), { value: "1. alpha\n2. beta", selectionStart: 0, selectionEnd: 16 });
	assert.deepEqual(applyMarkdownFormat("alpha\nbeta", 0, 10, "task-list"), { value: "- [ ] alpha\n- [ ] beta", selectionStart: 0, selectionEnd: 22 });
	assert.equal(applyMarkdownFormat("alpha", 0, 5, "quote").value, "> alpha");
});

test("Markdown editor inserts GFM tables, fenced code and horizontal rules", () => {
	assert.match(applyMarkdownFormat("", 0, 0, "table").value, /\| Column 1 \| Column 2 \|/);
	assert.equal(applyMarkdownFormat("const a = 1;", 0, 12, "code-block").value, "```\nconst a = 1;\n```");
	assert.equal(applyMarkdownFormat("", 0, 0, "horizontal-rule").value, "---");
	assert.throws(() => applyMarkdownFormat("", 0, 0, "unknown"), /Unsupported Markdown format/);
});
