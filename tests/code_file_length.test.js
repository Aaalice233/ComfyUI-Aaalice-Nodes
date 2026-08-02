import assert from "node:assert/strict";
import test from "node:test";

import {
	HARD_LIMIT_LINES,
	TARGET_LINES,
	classifyCodeFileLengths,
	countPhysicalLines,
	formatLengthEntry,
	isCheckedCodePath,
} from "../scripts/check_file_lengths.mjs";

test("physical line counting handles LF, CRLF, CR, empty files and final newlines", () => {
	assert.equal(countPhysicalLines(""), 0);
	assert.equal(countPhysicalLines("one"), 1);
	assert.equal(countPhysicalLines("one\ntwo\n"), 2);
	assert.equal(countPhysicalLines("one\r\ntwo\r\n"), 2);
	assert.equal(countPhysicalLines("one\rtwo"), 2);
});

test("the length gate covers first-party source, style, deploy, script and test code", () => {
	for (const path of [
		"js/workspace.js",
		"nodes/_lib/model.py",
		"deploy/worker.ts",
		"scripts/check.mjs",
		"tests/contract.test.js",
		"js/lib/theme.css",
		"ui/panel.vue",
		"ui/panel.scss",
	]) assert.equal(isCheckedCodePath(path), true, path);
	for (const path of [
		"js/vendor/marked.esm.js",
		"node_modules/pkg/index.js",
		"dist/bundle.js",
		"build/generated.js",
		"docs/design.md",
	]) assert.equal(isCheckedCodePath(path), false, path);
});

test("the modularity target warns while only the hard limit blocks", () => {
	assert.equal(TARGET_LINES, 600);
	assert.equal(HARD_LIMIT_LINES, 800);
	const result = classifyCodeFileLengths([
		{ path: "small.js", lines: 600 },
		{ path: "warning.js", lines: 601 },
		{ path: "boundary.js", lines: 800 },
		{ path: "blocked.js", lines: 801 },
	]);
	assert.deepEqual(result.warnings.map((entry) => entry.path), ["boundary.js", "warning.js"]);
	assert.deepEqual(result.violations.map((entry) => entry.path), ["blocked.js"]);
	assert.equal(formatLengthEntry(result.violations[0], HARD_LIMIT_LINES), "- blocked.js: 801 lines (limit 800, over 1)");
});
