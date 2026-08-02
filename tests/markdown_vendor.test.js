import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { marked } from "../js/vendor/marked.esm.js";

test("vendored Markdown parser supports CommonMark and GFM block syntax", () => {
	const html = marked.parse([
		"# Heading",
		"",
		"---",
		"",
		"> Quote",
		"",
		"1. Ordered",
		"",
		"- [x] Task",
		"",
		"| A | B |",
		"| - | - |",
		"| 1 | 2 |",
		"",
		"**Bold** *italic* ~~strike~~ `code` [link](https://example.com) ![image](https://example.com/a.png)",
		"",
		"```js",
		"const value = 1;",
		"```",
	].join("\n"), { gfm: true });

	assert.match(html, /<h1>Heading<\/h1>/);
	assert.match(html, /<hr>/);
	assert.match(html, /<blockquote>/);
	assert.match(html, /<ol>/);
	assert.match(html, /<input[^>]*type="checkbox"[^>]*>/);
	assert.match(html, /<input[^>]*checked=""[^>]*>/);
	assert.match(html, /<input[^>]*disabled=""[^>]*>/);
	assert.match(html, /<table>/);
	assert.match(html, /<strong>Bold<\/strong>/);
	assert.match(html, /<em>italic<\/em>/);
	assert.match(html, /<del>strike<\/del>/);
	assert.match(html, /<code>code<\/code>/);
	assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/);
	assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="image">/);
	assert.match(html, /<pre><code class="language-js">/);
});

test("vendored Markdown dependency versions stay pinned", () => {
	const versions = JSON.parse(readFileSync(new URL("../js/vendor/versions.json", import.meta.url), "utf8"));
	assert.deepEqual(versions.marked, { version: "15.0.11", license: "MIT" });
	assert.deepEqual(versions.dompurify, { version: "3.4.12", license: "(MPL-2.0 OR Apache-2.0)" });
});
