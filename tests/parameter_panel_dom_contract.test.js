import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function ruleBody(source, selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] || "";
}

test("parameter enum segments stay inside the 32px control track", () => {
	const themeSource = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");
	const groupRule = ruleBody(themeSource, ".aaalice-pcp-segmented");
	const segmentRule = ruleBody(themeSource, ".aaalice-pcp-segment");

	assert.match(groupRule, /box-sizing:\s*border-box/);
	assert.match(groupRule, /height:\s*32px/);
	assert.match(segmentRule, /box-sizing:\s*border-box/);
	assert.match(segmentRule, /height:\s*100%/);
});
