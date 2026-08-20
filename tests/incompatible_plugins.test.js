import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const extensionSource = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const detectorSource = readFileSync(new URL("../js/incompatible_plugins.js", import.meta.url), "utf8");
const en = JSON.parse(readFileSync(new URL("../locales/en/main.json", import.meta.url), "utf8"));
const zh = JSON.parse(readFileSync(new URL("../locales/zh/main.json", import.meta.url), "utf8"));
const zhTw = JSON.parse(readFileSync(new URL("../locales/zh-TW/main.json", import.meta.url), "utf8"));

function conflictCatalog(catalog) {
	return catalog.aaalice.incompatiblePlugins;
}

test("package setup checks all known incompatible frontend plugins", () => {
	assert.match(extensionSource, /import \{ warnIfIncompatiblePlugins \} from "\.\/incompatible_plugins\.js"/);
	assert.match(extensionSource, /await warnIfIncompatiblePlugins\(\)/);
	assert.match(detectorSource, /ComfyUI-Danbooru-Gallery/);
	assert.match(detectorSource, /AIGODLIKE-COMFYUI-TRANSLATION/);
	assert.match(detectorSource, /app\.api\.getExtensions\(\)/);
	assert.match(detectorSource, /app\.extensions/);
	assert.match(detectorSource, /app\.extensionManager\?\.toast\?\.add/);
});

test("translation conflict warning is localized and explains workflow recovery", () => {
	for (const catalog of [en, zh, zhTw]) {
		assert.ok(conflictCatalog(catalog).legacyGallery.title);
		assert.ok(conflictCatalog(catalog).legacyGallery.detail);
		assert.ok(conflictCatalog(catalog).translation.title);
		assert.match(conflictCatalog(catalog).translation.detail, /AIGODLIKE-COMFYUI-TRANSLATION/);
	}
	assert.match(conflictCatalog(en).translation.detail, /clean copy/);
	assert.match(conflictCatalog(zh).translation.detail, /干净的工作流/);
	assert.match(conflictCatalog(zhTw).translation.detail, /乾淨的工作流程/);
});
