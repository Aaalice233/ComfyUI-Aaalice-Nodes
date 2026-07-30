import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(ROOT, "js", "discord_share.js"), "utf8");
const clientSource = readFileSync(join(ROOT, "js", "lib", "discord_share_client.js"), "utf8");
const entrypoint = readFileSync(join(ROOT, "js", "extension.js"), "utf8");

test("Discord share is statically imported by the package frontend entrypoint", () => {
	assert.match(entrypoint, /import\s+"\.\/discord_share\.js";/);
});

test("share entry uses the current ComfyUI side toolbar and public action bar contract", () => {
	assert.match(source, /data-testid="side-toolbar"/);
	assert.match(source, /actionBarButtons/);
	assert.match(source, /icon-\[lucide--send\]/);
	assert.match(source, /MutationObserver/);
});

test("placement is one tri-state setting and both surfaces expose context menus", () => {
	assert.match(source, /Aaalice\.DiscordShare\.Placement/);
	assert.match(source, /\["sidebar",\s*"topbar",\s*"hidden"\]|value:\s*"sidebar"[\s\S]+value:\s*"topbar"[\s\S]+value:\s*"hidden"/);
	assert.match(source, /showEntryContextMenu\(event,\s*"sidebar"\)/);
	assert.match(source, /showEntryContextMenu\(event,\s*"topbar"\)/);
});

test("picker is latest-run only and requires a prompt before sending", () => {
	assert.match(source, /captureEvents\.latest/);
	assert.match(source, /send\.disabled\s*=\s*!hasPrompt/);
	assert.doesNotMatch(source, /navigator\.clipboard/);
});

test("OAuth handoff survives a severed popup opener without navigating into local ComfyUI", () => {
	assert.match(clientSource, /challenge/);
	assert.match(clientSource, /\/v1\/oauth\/result/);
	assert.match(clientSource, /event\.source !== popup/);
	assert.doesNotMatch(clientSource, /auth-complete|AUTH_RESULT_STORAGE_KEY/);
});
