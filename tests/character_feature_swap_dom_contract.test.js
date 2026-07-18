import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/character_feature_swap.js", import.meta.url), "utf8");
const theme = readFileSync(new URL("../js/lib/theme.css", import.meta.url), "utf8");
const uiStyles = readFileSync(new URL("../js/lib/ui.css", import.meta.url), "utf8");
const tagListSource = readFileSync(new URL("../js/lib/controls/taglist.js", import.meta.url), "utf8");

test("reuses the shared tag-list control and serialization model", () => {
	assert.match(source, /import \{ createTagListControl \} from "\.\/lib\/controls\/taglist\.js"/);
	assert.match(source, /createTagListControl\(\{/);
	assert.match(source, /characterFeatureSwapPayload/);
	assert.doesNotMatch(source, /className:\s*"cfs-tag"/);
});

test("mounts a synchronous non-serializing DOM widget across supported lifecycles", () => {
	assert.match(source, /addDOMWidget\(WIDGET/);
	assert.match(source, /serialize:\s*false/);
	assert.match(source, /beforeRegisterNodeDef/);
	assert.match(source, /nodeCreated/);
	assert.match(source, /loadedGraphNode/);
	assert.match(source, /onConfigure/);
	assert.match(source, /onRemoved/);
	assert.doesNotMatch(source, /setInterval\s*\(/);
});

test("wraps feature chips while keeping the add-tag input visible", () => {
	assert.match(theme, /\.aaalice-character-swap \{[^}]*grid-template-rows: auto minmax\(0, 1fr\);/);
	assert.match(theme, /\.aaalice-character-swap \.aa-taglist-control \{[^}]*flex-wrap: wrap;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/);
	assert.match(theme, /\.aaalice-character-swap \.aa-taglist-control > input\.aa-taglist-input \{[^}]*min-width: 108px;[^}]*flex: 1 0 108px;/);
	assert.match(source, /const MIN_WIDGET_HEIGHT = 96/);
	assert.match(source, /getMinHeight: \(\) => MIN_WIDGET_HEIGHT/);
	assert.doesNotMatch(source, /root\.scrollHeight/);
	assert.doesNotMatch(source, /growClassicDomWidgetNode/);
});

test("uses stable per-tag color fills and keeps disabled tags visually distinct", () => {
	assert.match(uiStyles, /\.aaalice-character-swap,[\s\S]*--aa-ui-control:/);
	assert.match(theme, /\.aa-taglist-chip\.is-selected \{[^}]*background-color: color-mix\(in srgb, var\(--aa-tag-color\) 44%, var\(--aa-ui-control\)\)/);
	assert.match(theme, /\.aa-taglist-chip\.is-disabled \{[^}]*border-style: dashed;[^}]*opacity: \.58;/);
	assert.match(theme, /\.aaalice-character-swap \.aa-taglist-control > input\.aa-taglist-input \{[^}]*border: 1px dashed/);
	assert.match(tagListSource, /root\.scrollTop = root\.scrollHeight/);
	assert.match(tagListSource, /input\.addEventListener\("focus", revealInput\)/);
});

test("leaves native resize corners outside the interactive DOM surface", () => {
	assert.match(theme, /\.dom-widget:has\(> \.aaalice-character-swap\) \{[^}]*pointer-events: none !important;/);
	assert.match(theme, /\.aaalice-character-swap \{[^}]*pointer-events: none;/);
	assert.match(theme, /\.aaalice-character-swap \.aa-taglist-control \{[^}]*pointer-events: auto;/);
	assert.match(theme, /\.aaalice-character-swap\.is-resizing, \.aaalice-character-swap\.is-resizing \* \{ pointer-events: none !important; \}/);
	assert.match(source, /installDomWidgetResizePassthrough\(node, root\)/);
});

test("injects only feature state and config revision into the prompt", () => {
	assert.match(source, /promptNode\.inputs\.features_json/);
	assert.match(source, /promptNode\.inputs\.config_revision/);
	assert.doesNotMatch(source, /promptNode\.inputs\.api_key/);
	assert.doesNotMatch(source, /node\.properties[^\n]*api_key/);
});

test("registers one ComfyUI settings entry and uses the shared dialog", () => {
	assert.match(source, /app\.ui\.settings\.addSetting\(\{/);
	assert.match(source, /createDialog\(\{/);
	assert.match(source, /Aaalice\.CharacterFeatureSwap\.Configure/);
	assert.match(source, /thinking_mode: thinkingMode\.value/);
	assert.match(source, /\["disabled"/);
	assert.match(source, /\["high"/);
	assert.match(source, /\["max"/);
	assert.doesNotMatch(source, /OpenRouter|Provider preset|API Base URL|api_base_url/);
});

test("keeps related settings and their actions on compact responsive rows", () => {
	assert.match(source, /className: "aaalice-character-swap-settings-row"/);
	assert.match(source, /className: "aaalice-character-swap-settings-grid"/);
	assert.match(source, /className: "aaalice-character-swap-template-header"/);
	assert.match(source, /className: "aaalice-character-swap-settings-footer"/);
	assert.match(source, /size: "md", className: "aaalice-character-swap-settings-dialog"/);
	assert.match(theme, /\.aaalice-character-swap-settings-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
	assert.match(theme, /\.aaalice-character-swap-settings-grid \{[^}]*grid-template-columns: minmax\(150px, \.62fr\) minmax\(260px, 1\.38fr\);/);
	assert.match(theme, /\.aaalice-character-swap-settings-footer\.aa-ui-dialog__footer \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
	assert.match(theme, /@media \(max-width: 620px\) \{[\s\S]*\.aaalice-character-swap-settings-row, \.aaalice-character-swap-settings-grid \{ grid-template-columns: minmax\(0, 1fr\);/);
});
