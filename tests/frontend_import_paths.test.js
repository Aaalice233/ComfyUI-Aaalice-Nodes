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

function localModulePath(file, specifier) {
	if (!specifier.startsWith(".")) return null;
	const target = join(dirname(file), specifier);
	return target.endsWith(".js") ? target : `${target}.js`;
}

const namedExportCache = new Map();
function namedExports(file, stack = new Set()) {
	if (namedExportCache.has(file)) return namedExportCache.get(file);
	if (stack.has(file)) return new Set();
	const source = readFileSync(file, "utf8");
	const names = new Set();
	for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
	const nextStack = new Set(stack).add(file);
	for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}\s*(?:from\s*["']([^"']+)["'])?/g)) {
		const target = match[2] ? localModulePath(file, match[2]) : null;
		const targetNames = target && existsSync(target) ? namedExports(target, nextStack) : null;
		for (const raw of match[1].split(",")) {
			const token = raw.trim();
			if (!token) continue;
			const parts = token.split(/\s+as\s+/);
			const imported = parts[0].trim();
			const exported = (parts[1] || imported).trim();
			if (!target || targetNames?.has(imported)) names.add(exported);
		}
	}
	for (const match of source.matchAll(/export\s+\*\s+from\s*["']([^"']+)["']/g)) {
		const target = localModulePath(file, match[1]);
		if (target && existsSync(target)) for (const name of namedExports(target, nextStack)) names.add(name);
	}
	namedExportCache.set(file, names);
	return names;
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

test("local named imports resolve to exported bindings", () => {
	const failures = [];
	for (const file of javascriptFiles(JS_ROOT)) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g)) {
			const target = localModulePath(file, match[2]);
			if (!target || !existsSync(target)) continue;
			const available = namedExports(target);
			for (const raw of match[1].split(",")) {
				const token = raw.trim();
				if (!token) continue;
				const imported = token.split(/\s+as\s+/)[0].trim();
				if (!available.has(imported)) failures.push(`${relative(JS_ROOT, file)}: ${imported} from ${match[2]}`);
			}
		}
	}
	assert.deepEqual(failures, []);
});
