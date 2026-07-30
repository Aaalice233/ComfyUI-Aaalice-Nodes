import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(ROOT, "js", "discord_share.js"), "utf8");
const clientSource = readFileSync(join(ROOT, "js", "lib", "discord_share_client.js"), "utf8");
const entrypoint = readFileSync(join(ROOT, "js", "extension.js"), "utf8");
const workspaceComponents = readFileSync(join(ROOT, "js", "lib", "workspace_components.js"), "utf8");
const workspaceSource = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");
const theme = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

test("Discord share is statically imported by the package frontend entrypoint", () => {
	assert.match(entrypoint, /import\s+"\.\/discord_share\.js";/);
});

test("share entry uses the compact Aaalice workspace footer and public action bar contract", () => {
	assert.match(workspaceComponents, /data-aa-workspace-footer-actions/);
	assert.match(workspaceComponents, /footerActions/);
	assert.match(workspaceSource, /footerActions:\s*\[pinButton\]/);
	assert.doesNotMatch(workspaceSource, /headerActions:\s*\[pinButton\]/);
	assert.match(source, /WORKSPACE_FOOTER_SELECTOR/);
	assert.match(source, /iconName:\s*"github"/);
	assert.match(source, /iconName:\s*"discord"/);
	assert.doesNotMatch(source, /data-testid="side-toolbar"/);
	assert.match(source, /actionBarButtons/);
	assert.match(source, /icon-\[lucide--send\]/);
	assert.match(source, /MutationObserver/);
	assert.match(theme, /\.aa-workspace-footer\s*\{[^}]*min-height:\s*42px;[^}]*justify-content:\s*space-between;/s);
	assert.match(theme, /\.aa-discord-share-entry\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*border-radius:\s*8px;/s);
	assert.doesNotMatch(theme, /\.aa-workspace-corner-actions/);
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

test("picker keeps the image dominant with an overlaid filmstrip and a dedicated prompt rail", () => {
	assert.match(source, /className: "aa-discord-share-picker__media"/);
	assert.match(source, /children: \[stage, filmstrip\]/);
	assert.match(theme, /\.aa-discord-share-dialog\s*>\s*\.aa-ui-dialog__body\s*\{[^}]*display:\s*grid;/s);
	assert.match(theme, /\.aa-discord-share-picker\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*clamp\(280px,\s*31%,\s*360px\);[^}]*grid-template-areas:\s*"media prompt";/s);
	assert.match(theme, /\.aa-discord-share-filmstrip\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*10px;[^}]*backdrop-filter:\s*blur\(16px\);/s);
	assert.match(theme, /\.aa-discord-share-picker__prompt-panel\s*\{[^}]*grid-area:\s*prompt;/s);
	assert.match(theme, /grid-template-areas:\s*"media"\s*"prompt";/s);
	assert.doesNotMatch(theme, /\.aa-discord-share-picker\s*\{[^}]*grid-template-rows:\s*minmax\(250px,\s*1fr\)\s*auto\s*minmax\(92px,\s*auto\);/s);
});

test("picker uses a compact scrollable resolution filmstrip and an interactive image viewer", () => {
	assert.doesNotMatch(source, /aa-discord-share-filmstrip__name/);
	assert.match(source, /children:\s*\[\s*el\("img"[\s\S]*meta,\s*\]/);
	assert.match(source, /filmstrip\.scrollLeft \+= event\.deltaY/);
	assert.match(source, /createShareImageViewer\(viewport,\s*stageImage\)/);
	assert.match(source, /const MAX_SCALE = 8/);
	assert.match(source, /Math\.exp\(-event\.deltaY \* 0\.0015\)/);
	assert.match(source, /viewport\.addEventListener\("pointerdown"/);
	assert.match(source, /viewport\.addEventListener\("dblclick", reset\)/);
	assert.match(source, /imageViewer\.reset\(\)/);
	assert.match(theme, /\.aa-discord-share-filmstrip__item\s*\{[^}]*width:\s*128px;[^}]*height:\s*50px;[^}]*grid-template-columns:\s*38px minmax\(0,\s*1fr\);/s);
	assert.match(theme, /\.aa-discord-share-picker__image\s*\{[^}]*scale\(var\(--aa-discord-share-zoom,\s*1\)\)/s);
});

test("first share click verifies Discord before requiring a latest run", () => {
	const flow = source.slice(source.indexOf("async function openShareFlow()"), source.indexOf("async function openConnectionManager()"));
	assert.ok(flow.indexOf("beginDiscordShareAuthentication") < flow.indexOf("const latest = captureEvents.latest"));
	assert.match(flow, /openMembershipRequiredDialog\(error,\s*shareConfig\)/);
});

test("OAuth handoff survives a severed popup opener without navigating into local ComfyUI", () => {
	assert.match(clientSource, /challenge/);
	assert.match(clientSource, /\/v1\/oauth\/result/);
	assert.match(clientSource, /event\.source !== popup/);
	assert.doesNotMatch(clientSource, /auth-complete|AUTH_RESULT_STORAGE_KEY/);
});
