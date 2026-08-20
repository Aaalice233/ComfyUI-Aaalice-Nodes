import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStyleEntry } from "./helpers/style_source.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePaths = [
	["entry", "discord_share.js"],
	["picker", "lib/discord_share_picker.js"],
	["viewer", "lib/discord_share_image_viewer.js"],
	["imagePrepare", "lib/discord_share_image_prepare.js"],
	["capture", "lib/discord_share_capture.js"],
	["targets", "lib/discord_share_target_picker.js"],
	["promptFile", "lib/discord_share_prompt_file.js"],
];
const sources = Object.fromEntries(sourcePaths.map(([name, path]) => [name, readFileSync(join(ROOT, "js", path), "utf8")]));
const source = Object.values(sources).join("\n");
const clientSource = readFileSync(join(ROOT, "js", "lib", "discord_share_client.js"), "utf8");
const entrypoint = readFileSync(join(ROOT, "js", "extension.js"), "utf8");
const workspaceComponents = readFileSync(join(ROOT, "js", "lib", "workspace_components.js"), "utf8");
const workspaceSource = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));

test("Discord share is statically imported by the package frontend entrypoint", () => {
	assert.match(entrypoint, /import\s+"\.\/discord_share\.js";/);
});

test("share entry uses the compact Aaalice workspace footer and public action bar contract", () => {
	assert.match(workspaceComponents, /data-aa-workspace-footer-actions/);
	assert.match(workspaceComponents, /footerActions/);
	assert.match(workspaceSource, /footerActions:\s*\[autoSaveControl,\s*pinButton\]/);
	assert.doesNotMatch(workspaceSource, /headerActions:\s*\[pinButton\]/);
	assert.match(source, /WORKSPACE_FOOTER_SELECTOR/);
	assert.match(source, /iconName:\s*"github"/);
	assert.match(source, /iconName:\s*"discord"/);
	assert.doesNotMatch(source, /data-testid="side-toolbar"/);
	assert.match(source, /actionBarButtons/);
	assert.match(source, /icon:\s*TOPBAR_ICON_CLASS/);
	assert.match(source, /icon\("send",\s*\{\s*className:\s*TOPBAR_ICON_CLASS\s*\}\)/);
	assert.match(source, /replaceWith\(shareIcon\)/);
	assert.match(source, /icon\("loading",[\s\S]*aa-discord-share-entry__icon--loading/);
	assert.match(source, /MutationObserver/);
	assert.match(theme, /\.aa-workspace-footer\s*\{[^}]*min-height:\s*42px;[^}]*justify-content:\s*space-between;/s);
	assert.match(theme, /\.aa-discord-share-entry:not\(\.aa-discord-share-entry--topbar\)\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*border-radius:\s*8px;/s);
	assert.match(source, /classList\.add\("aa-discord-share-entry",\s*"aa-discord-share-entry--topbar"\)/);
	assert.match(theme, /button\.aa-discord-share-entry--topbar\s*\{[^}]*padding:\s*6px;[^}]*border-radius:\s*4px;[^}]*background-color:\s*var\(--primary-bg\)\s*!important;[^}]*color:\s*var\(--aa-ui-on-media,\s*#fff\)\s*!important;/s);
	assert.doesNotMatch(theme, /button\.aa-discord-share-entry--topbar\s*\{[^}]*(?:width|min-width|height|min-height):/s);
	assert.match(theme, /\.aa-discord-share-entry--topbar\s+\.aa-discord-share-entry__icon\s*\{[^}]*display:\s*block;[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*color:\s*var\(--aa-ui-on-media,\s*#fff\)\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s);
	assert.match(theme, /\.aa-discord-share-entry\[data-flow-state="busy"\]\s+\.aa-discord-share-entry__icon--send\s*\{\s*display:\s*none;/);
	assert.match(theme, /\.aa-discord-share-entry\[data-flow-state="busy"\]\s+\.aa-discord-share-entry__icon--loading\s*\{[^}]*display:\s*block;[^}]*animation:\s*aa-discord-share-spin/s);
	assert.match(theme, /\.aa-discord-share-entry--topbar\s+\.aa-discord-share-entry__icon--loading\s*\{\s*display:\s*none;/);
	assert.match(theme, /\.aa-discord-share-entry--topbar\[data-flow-state="busy"\]\s+\.aa-discord-share-entry__icon--loading\s*\{\s*display:\s*block;/);
	assert.doesNotMatch(theme, /\.aa-discord-share-entry\[data-flow-state="busy"\]::before/);
	assert.match(theme, /button\.aa-discord-share-entry--topbar:hover:not\(:disabled\),[\s\S]*background-color:\s*var\(--primary-hover-bg\)\s*!important;/);
	assert.doesNotMatch(theme, /\.aa-workspace-corner-actions/);
});

test("placement is one tri-state setting and both surfaces expose context menus", () => {
	assert.match(source, /Aaalice\.DiscordShare\.Placement/);
	assert.match(source, /\["sidebar",\s*"topbar",\s*"hidden"\]|value:\s*"sidebar"[\s\S]+value:\s*"topbar"[\s\S]+value:\s*"hidden"/);
	assert.match(source, /showEntryContextMenu\(event,\s*"sidebar"\)/);
	assert.match(source, /showEntryContextMenu\(event,\s*"topbar"\)/);
	assert.match(source, /async function confirmHideEntry\(\)/);
	assert.match(source, /dialog\?\.confirm/);
	assert.match(source, /if \(await confirmHideEntry\(\)\) setPlacement\("hidden"\)/);
});

test("placement lookup uses the registered setting default without the deprecated fallback argument", () => {
	assert.match(source, /getSettingValue\(PLACEMENT_SETTING_ID\)/);
	assert.doesNotMatch(source, /getSettingValue\(PLACEMENT_SETTING_ID,\s*"sidebar"\)/);
});

test("picker is latest-run only and requires a prompt before sending", () => {
	assert.match(source, /captureEvents\.latest/);
	assert.match(source, /send\.disabled\s*=\s*promptEditing\s*\|\|/);
	assert.match(source, /aa-discord-share-picker__send-feedback/);
	assert.match(source, /role:\s*"alert"/);
	assert.match(source, /role:\s*"alert",\s*"aria-live":\s*"assertive",\s*hidden:\s*true/);
	assert.match(source, /showSendFeedback\(shareErrorMessage\(error\)\)/);
	assert.match(source, /normalizeSharePrompt\(promptValue\)/);
	assert.match(source, /promptEditor/);
	assert.match(source, /savePromptEdit/);
	assert.match(source, /discardPromptEdit/);
	assert.match(source, /prompt:\s*sharePrompt/);
	assert.match(theme, /\.aa-discord-share-picker__prompt-editor/);
	assert.match(theme, /\.aa-discord-share-picker__prompt-actions/);
	assert.match(theme, /\.aa-discord-share-picker__send-feedback/);
	assert.doesNotMatch(source, /navigator\.clipboard/);
});

test("picker exposes a persistent multi-target selector without receiving webhook URLs", () => {
	assert.match(source, /createShareTargetPicker\(targets,/);
	assert.match(source, /multiSelectControl\(/);
	assert.match(source, /targetPicker\.root/);
	assert.match(source, /targetIds:\s*\[\.\.\.selectedTargetIds\]/);
	assert.match(source, /chevronDown/);
	assert.match(source, /aria-expanded/);
	assert.match(source, /targets\.multiHint/);
	assert.match(clientSource, /\/v1\/targets/);
	assert.match(clientSource, /aaalice\.discord-share\.targets\.v1/);
	assert.match(clientSource, /body\.append\("target",\s*targetId\)/);
	assert.doesNotMatch(clientSource, /webhook/i);
	assert.match(theme, /\.aa-discord-share-target-trigger/);
	assert.match(theme, /\.aa-discord-share-target-popover/);
	assert.match(theme, /\.aa-discord-share-target-list/);
});

test("large images offer compression or original upload and sending continues after the picker closes", () => {
	assert.match(source, /shouldOfferShareCompression\(upload\.blob\.size\)/);
	assert.match(source, /choice === "compress"/);
	assert.match(source, /largeImage\.original/);
	assert.match(source, /largeImage\.compress/);
	assert.match(source, /closeActiveDialog\(\);\s*void sendInBackground\(backgroundRequest\)/s);
	assert.match(source, /pickerActive = false/);
	assert.match(source, /if \(!pickerActive\) return/);
	assert.match(source, /toast\("success"/);
	assert.match(source, /toast\("error"/);
	assert.match(clientSource, /upload \|\| await loadDiscordShareImage\(image\)/);
	assert.match(theme, /\.aa-discord-share-large-image/);
});

test("failed and interrupted runs preserve already executed images", () => {
	assert.match(sources.capture, /execution_error", finalizePartial/);
	assert.match(sources.capture, /execution_interrupted", finalizePartial/);
	assert.match(sources.capture, /preserveOnEmpty:\s*true/);
	assert.match(sources.capture, /snapshot\.images\.length === 0/);
	assert.match(sources.capture, /executedOutputs\.set\(promptId, new Map\(\)\)/);
});

test("long prompt file mode is persistent and auto-recommended only by selected target capability", () => {
	assert.match(source, /createLongPromptFileControl\(/);
	assert.match(source, /target\.preferPromptFile/);
	assert.match(source, /longPromptAsFile\s*=\s*recommended\s*\?\s*true\s*:\s*longPromptPreference/);
	assert.match(source, /setChecked\(longPromptAsFile,\s*\{\s*emit:\s*false\s*\}\)/);
	assert.doesNotMatch(source, /generation-chat|sfw-collection|nsfw-collection/);
	assert.match(source, /createTooltip\(/);
	assert.match(source, /longPromptAsFile/);
	assert.match(source, /split into consecutive messages with the image in the final message/);
	assert.match(clientSource, /aaalice\.discord-share\.long-prompt-as-file\.v1/);
	assert.match(clientSource, /DEFAULT_PROMPT_FILE_PREFERENCE\s*=\s*true/);
	assert.match(clientSource, /body\.append\("long_prompt_as_file"/);
	assert.match(theme, /\.aa-discord-share-prompt-file-notice/);
	assert.match(theme, /\.aa-discord-share-prompt-file-option/);
	assert.match(theme, /\.aa-discord-share-prompt-file-tooltip/);
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
	assert.match(source, /function compactImageMeta\(image\)/);
	assert.match(source, /`\$\{image\.width\}×\$\{image\.height\}`/);
	assert.match(source, /children:\s*\[\s*el\("img"[\s\S]*meta,\s*\]/);
	assert.match(source, /filmstrip\.scrollLeft \+= event\.deltaY/);
	assert.match(source, /createShareImageViewer\(viewport,\s*stageImage,\s*\{\s*label\s*\}\)/);
	assert.match(source, /const MAX_SCALE = 8/);
	assert.match(source, /Math\.exp\(-event\.deltaY \* 0\.0015\)/);
	assert.match(source, /viewport\.addEventListener\("pointerdown"/);
	assert.match(source, /viewport\.addEventListener\("dblclick", reset\)/);
	assert.match(source, /imageViewer\.reset\(\)/);
	assert.match(theme, /\.aa-discord-share-filmstrip__item\s*\{[^}]*width:\s*66px;[^}]*height:\s*72px;[^}]*grid-template-rows:\s*52px 11px;/s);
	assert.match(theme, /\.aa-discord-share-picker__stage\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/s);
	assert.match(theme, /\.aa-discord-share-picker__stage-meta\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*grid-row:\s*1;/s);
	assert.match(theme, /\.aa-discord-share-picker__filename\s*\{[^}]*line-height:\s*20px;/s);
	assert.match(theme, /\.aa-discord-share-picker__dimensions\s*\{[^}]*line-height:\s*20px;/s);
	assert.match(theme, /\.aa-discord-share-picker__image\s*\{[^}]*scale\(var\(--aa-discord-share-zoom,\s*1\)\)/s);
});

test("first share click verifies Discord before requiring a latest run", () => {
	const flow = source.slice(source.indexOf("async function openShareFlow()"), source.indexOf("async function openConnectionManager()"));
	assert.ok(flow.indexOf("beginDiscordShareAuthentication") < flow.indexOf("const latest = captureEvents.latest"));
	assert.match(flow, /openMembershipRequiredDialog\(error,\s*shareConfig\)/);
});

test("post-auth continuation loads current targets before opening the picker", () => {
	const continuations = [...source.matchAll(/const targets = await loadDiscordShareTargets\(shareConfig, session\);\s*await openSharePicker\(shareConfig, session, captureEvents\.latest, targets\);/g)];
	assert.equal(continuations.length, 2);
	assert.doesNotMatch(source, /openSharePicker\(shareConfig, session, captureEvents\.latest\);/);
});

test("OAuth handoff survives a severed popup opener without navigating into local ComfyUI", () => {
	assert.match(clientSource, /challenge/);
	assert.match(clientSource, /\/v1\/oauth\/result/);
	assert.match(clientSource, /event\.source !== popup/);
	assert.doesNotMatch(clientSource, /auth-complete|AUTH_RESULT_STORAGE_KEY/);
});

test("Discord share delegates picker, viewer, targets, and long-prompt controls to bounded modules", () => {
	for (const imported of ["discord_share_picker", "discord_share_image_viewer", "discord_share_target_picker", "discord_share_prompt_file"]) {
		assert.match(source, new RegExp(`from ["']\\./(?:lib/)?${imported}\\.js["']`));
	}
	assert.match(sources.picker, /export function createDiscordSharePicker/);
	assert.match(sources.viewer, /export function createShareImageViewer/);
	assert.match(sources.targets, /export function createShareTargetPicker/);
	assert.match(sources.promptFile, /export function createLongPromptFileControl/);
	for (const [name, contents] of Object.entries(sources)) {
		assert.ok(contents.split(/\r?\n/).length <= 800, `${name} module exceeds the source-size contract`);
	}
});
