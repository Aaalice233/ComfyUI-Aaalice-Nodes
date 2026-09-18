import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/workspace/value_profiles.js", import.meta.url), "utf8");
const start = source.indexOf("const editPresetTargetName = () =>");
const entry = source.slice(start, source.indexOf("const exportCurrentProfile", start));

function fixture({ success = true } = {}) {
	const el = (tag, options = {}) => ({ tag, ...options, children: options.children || [], append(...items) { this.children.push(...items); } });
	const input = { handlers: {}, setAttribute(key, value) { this[key] = value; }, addEventListener(key, handler) { this.handlers[key] = handler; }, focus() {}, select() {} };
	let options; let closed = false; let saved;
	const dependencies = { selectedProfile: () => ({ id: "p", presetName: "Pixel" }), document: { createElement: () => input },
		el, t: (_, fallback) => fallback, button: (options) => options,
		createDialog: (value) => { options = value; return { close() { closed = true; } }; },
		persist: (mutator) => { if (!success) return false; saved = mutator({}); return true; },
		setProfilePresetName: (_, id, name) => ({ id, name }), requestAnimationFrame: (callback) => callback() };
	Function(...Object.keys(dependencies), `${entry};editPresetTargetName();`)(...Object.values(dependencies));
	return { options, input, closed: () => closed, saved: () => saved };
}

test("name dialog keeps full-width content inside shared padded shells", () => {
	const f = fixture();
	assert.equal(f.options.body.className, undefined);
	assert.equal(f.options.body.children[0].className, "aa-value-profiles__prompt-body");
	assert.equal(f.options.footer.className, undefined);
	assert.equal(f.options.footer.children[0].className, "aa-value-profiles__prompt-footer");
	assert.equal(f.options.initialFocus, f.input);
	assert.equal(f.input.maxLength, 80);
});

test("name dialog saves trimmed names, keeps input on failure and ignores IME Enter", () => {
	for (const success of [false, true]) {
		const f = fixture({ success }); f.input.value = " New name ";
		f.input.handlers.keydown({ key: "Enter", isComposing: true });
		assert.equal(f.closed(), false); assert.equal(f.saved(), undefined);
		f.input.handlers.keydown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
		assert.equal(f.closed(), success);
		if (success) assert.deepEqual(f.saved(), { id: "p", name: "New name" });
	}
});

test("name dialog clears explicitly and ships its complete copy in all languages", () => {
	const f = fixture(); f.options.footer.children[0].children[0].children[0].onClick();
	assert.deepEqual(f.saved(), { id: "p", name: "" });
	const keys = [...entry.matchAll(/\bt\("(aaalice\.[^"]+)"/g)].map((match) => match[1]);
	for (const language of ["en", "zh", "zh-TW"]) {
		const catalog = JSON.parse(readFileSync(new URL(`../locales/${language}/main.json`, import.meta.url), "utf8"));
		for (const key of keys) assert.equal(typeof key.split(".").reduce((value, part) => value?.[part], catalog), "string", `${language}: ${key}`);
		if (language !== "en") {
			assert.match(catalog.aaalice.workspace.valueProfiles.presetTargetHint, /[\u4e00-\u9fff]/);
			assert.match(catalog.aaalice.workspace.valueProfiles.clearPresetName, /[\u4e00-\u9fff]/);
		}
	}
});
