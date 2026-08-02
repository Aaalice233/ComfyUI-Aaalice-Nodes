import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS_ROOT = join(ROOT, "js");
const PUBLIC_ROOT = "http://comfy.test/extensions/ComfyUI-Aaalice-Nodes/";
const STATIC_MODULE_SPECIFIER_PATTERN = /\b(?:import\s+(?:[^"'`]+?\s+from\s+)?|export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\})\s+from\s+)["']([^"']+)["']/g;

function javascriptFiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...javascriptFiles(path));
		else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
	}
	return files;
}

function staticModuleSpecifiers(source) {
	return [...source.matchAll(STATIC_MODULE_SPECIFIER_PATTERN)].map((match) => match[1]);
}

test("static module specifier discovery covers imports and barrel re-exports", () => {
	const source = `
		import "./side-effect.js";
		import value, { helper } from "./named.js";
		export * from "./all.js";
		export * as namespace from "./namespace.js";
		export {
			first,
			second as alias,
		} from "./named-export.js";
		const lazy = import("./dynamic.js");
	`;

	assert.deepEqual(staticModuleSpecifiers(source), [
		"./side-effect.js",
		"./named.js",
		"./all.js",
		"./namespace.js",
		"./named-export.js",
	]);
});

test("relative frontend imports and re-exports resolve inside the package or ComfyUI public scripts", () => {
	const failures = [];

	for (const file of javascriptFiles(JS_ROOT)) {
		const source = readFileSync(file, "utf8");
		const publicPath = relative(JS_ROOT, file).replaceAll("\\", "/");
		const baseUrl = new URL(publicPath, PUBLIC_ROOT);
		for (const specifier of staticModuleSpecifiers(source)) {
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
