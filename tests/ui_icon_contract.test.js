import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { hasIcon } from "../js/lib/ui.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS_ROOT = join(ROOT, "js");

function javascriptFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return javascriptFiles(path);
		return extname(entry.name) === ".js" ? [path] : [];
	});
}

function staticIconReferences(source) {
	const references = [];
	for (const match of source.matchAll(/\biconName\s*:\s*([^\n,}]+)/g)) {
		for (const literal of match[1].matchAll(/["']([^"']+)["']/g)) references.push(literal[1]);
	}
	for (const match of source.matchAll(/\bicon\s*\(\s*["']([^"']+)["']/g)) references.push(match[1]);
	return references;
}

test("all static UI icon references exist in the shared icon registry", () => {
	const references = javascriptFiles(JS_ROOT).flatMap((path) => {
		const names = staticIconReferences(readFileSync(path, "utf8"));
		return names.map((name) => ({ name, file: relative(ROOT, path).replaceAll("\\", "/") }));
	});

	assert.ok(references.length > 0, "the icon audit did not discover any static references");
	const unknown = references.filter(({ name }) => !hasIcon(name));
	assert.deepEqual(unknown, [], `unknown UI icons: ${unknown.map(({ name, file }) => `${name} (${file})`).join(", ")}`);
});
