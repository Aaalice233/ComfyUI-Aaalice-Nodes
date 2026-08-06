import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { copyEntryPromptText } from "../js/lib/prompt_copy.js";

function harness() {
	const toasts = [];
	const app = { extensionManager: { toast: { add: (options) => toasts.push(options) } } };
	return { app, toasts };
}

test("copyEntryPromptText writes the full text and reports success", async () => {
	const { app, toasts } = harness();
	let written = "";
	const originalNavigator = globalThis.navigator;
	const originalWindow = globalThis.window;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { clipboard: { writeText: async (text) => { written = text; } } },
	});
	Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
	try {
		const ok = await copyEntryPromptText({ text: "1girl, solo, original", title: "Copy prompt", app, copiedLabel: "Copied" });
		assert.equal(ok, true);
		assert.equal(written, "1girl, solo, original");
		assert.equal(toasts.length, 1);
		assert.equal(toasts[0].severity, "success");
	} finally {
		if (originalNavigator) Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
		else delete globalThis.navigator;
		if (originalWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
		else delete globalThis.window;
	}
});

test("copyEntryPromptText surfaces clipboard failures without throwing", async () => {
	const { app, toasts } = harness();
	const originalClipboard = globalThis.navigator?.clipboard;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { clipboard: { writeText: async () => { throw new Error("denied"); } } },
	});
	try {
		const ok = await copyEntryPromptText({ text: "blocked", title: "Copy prompt", app, copiedLabel: "Copied" });
		assert.equal(ok, false);
		assert.equal(toasts.length, 1);
		assert.equal(toasts[0].severity, "error");
	} finally {
		if (originalClipboard) Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalClipboard });
		else delete globalThis.navigator;
	}
});

test("flashCopied is a safe no-op outside a DOM element", async () => {
	const { flashCopied } = await import("../js/lib/prompt_copy.js");
	assert.doesNotThrow(() => flashCopied(null));
	assert.doesNotThrow(() => flashCopied({}));
});

test("both prompt surfaces expose a copy action and shared feedback", () => {
	const selector = readFileSync(new URL("../js/prompt_selector.js", import.meta.url), "utf8");
	const library = readFileSync(new URL("../js/workspace/library.js", import.meta.url), "utf8");
	assert.match(selector, /className: "aa-prompt-selector-copy-action"/);
	assert.match(selector, /copyEntryPromptText\(\{ text: entry\.text/);
	assert.match(library, /className: "aa-library-entry-copy-action"/);
	assert.match(library, /copyEntryPromptText\(\{ text: entry\.text/);
});
