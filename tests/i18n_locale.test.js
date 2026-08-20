import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localeFallbackChain, resolveLocale } from "../js/lib/i18n_locale.js";

const languages = ["en", "zh", "zh-TW"];
const loadLocale = (language, file) => JSON.parse(readFileSync(new URL(`../locales/${language}/${file}`, import.meta.url), "utf8"));
const placeholders = (value) => [...value.matchAll(/\{[^{}]+\}/g)].map(([match]) => match).sort();

function compareLocaleShape(reference, candidate, path = "") {
	assert.equal(Array.isArray(candidate), Array.isArray(reference), path);
	assert.equal(typeof candidate, typeof reference, path);
	if (typeof reference === "string") {
		assert.deepEqual(placeholders(candidate), placeholders(reference), path);
		return;
	}
	if (!reference || typeof reference !== "object") return;
	assert.deepEqual(Object.keys(candidate).sort(), Object.keys(reference).sort(), path);
	for (const key of Object.keys(reference)) compareLocaleShape(reference[key], candidate[key], path ? `${path}.${key}` : key);
}

test("locale resolution preserves ComfyUI Traditional Chinese regional tags", () => {
	for (const locale of ["zh-TW", "zh-tw", "zh_TW", "zh-Hant", "zh-Hant-TW", "zh-HK", "zh-MO"]) assert.equal(resolveLocale(locale), "zh-TW", locale);
	for (const locale of ["zh", "zh-CN", "zh_Hans"]) assert.equal(resolveLocale(locale), "zh", locale);
	for (const locale of ["en", "en-US", "fr", "", null]) assert.equal(resolveLocale(locale), "en", String(locale));
});

test("all shipped locale catalogs keep identical keys, value types, and placeholders", () => {
	for (const file of ["main.json", "nodeDefs.json"]) {
		const reference = loadLocale("en", file);
		for (const language of languages.slice(1)) compareLocaleShape(reference, loadLocale(language, file), `${language}/${file}`);
	}
});

test("Traditional Chinese falls back through Simplified Chinese before English", () => {
	assert.deepEqual(localeFallbackChain("zh-TW"), ["zh-TW", "zh", "en"]);
	assert.deepEqual(localeFallbackChain("zh"), ["zh", "en"]);
	assert.deepEqual(localeFallbackChain("en"), ["en"]);
	const source = readFileSync(new URL("../js/i18n.js", import.meta.url), "utf8");
	assert.match(source, /localeFallbackChain\(getLocale\(\)\)/);
});
