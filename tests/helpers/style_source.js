import { readFileSync } from "node:fs";

const IMPORT_PATTERN = /^\s*@import\s+url\(["'](.+?)["']\);\s*$/gm;

/** Read a CSS entry exactly as the browser resolves its local import cascade. */
export function readStyleEntry(entryUrl, visited = new Set()) {
	const url = entryUrl instanceof URL ? entryUrl : new URL(entryUrl, import.meta.url);
	if (visited.has(url.href)) throw new Error(`CSS import cycle: ${url.href}`);
	visited.add(url.href);
	const source = readFileSync(url, "utf8");
	const imports = [...source.matchAll(IMPORT_PATTERN)];
	if (!imports.length) return source;
	return imports.map((match) => readStyleEntry(new URL(match[1], url), visited)).join("\n");
}
