import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS_ROOT = join(ROOT, "js");
const PUBLIC_ROOT = "http://comfy.test/extensions/ComfyUI-Aaalice-Nodes/";

function javascriptFiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...javascriptFiles(path));
		else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
	}
	return files;
}

test("relative frontend imports resolve inside the package or ComfyUI public scripts", () => {
	const failures = [];
	const importPattern = /\bimport\s+(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g;

	for (const file of javascriptFiles(JS_ROOT)) {
		const source = readFileSync(file, "utf8");
		const publicPath = relative(JS_ROOT, file).replaceAll("\\", "/");
		const baseUrl = new URL(publicPath, PUBLIC_ROOT);
		for (const match of source.matchAll(importPattern)) {
			const specifier = match[1];
			if (!specifier.startsWith(".")) continue;
			const resolved = new URL(specifier, baseUrl);
			if (resolved.pathname.startsWith("/scripts/")) continue;
			const packagePrefix = "/extensions/ComfyUI-Aaalice-Nodes/";
			if (!resolved.pathname.startsWith(packagePrefix)) {
				failures.push(`${publicPath}: ${specifier} -> ${resolved.pathname}`);
				continue;
			}
			const localTarget = join(JS_ROOT, resolved.pathname.slice(packagePrefix.length));
			if (!existsSync(localTarget)) failures.push(`${publicPath}: ${specifier} -> missing ${localTarget}`);
		}
	}

	assert.deepEqual(failures, []);
});
