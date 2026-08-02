import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createGalleryDialogs } from "../js/lib/booru_gallery_dialogs.js";

const sources = Object.fromEntries([
	["entry", "../js/booru_gallery.js"],
	["media", "../js/lib/booru_gallery_media.js"],
	["cards", "../js/lib/booru_gallery_cards.js"],
	["controller", "../js/lib/booru_gallery_controller.js"],
	["dialogs", "../js/lib/booru_gallery_dialogs.js"],
	["settings", "../js/lib/booru_gallery_settings.js"],
].map(([name, path]) => [name, fs.readFileSync(new URL(path, import.meta.url), "utf8")]));

test("gallery entry delegates cohesive media, card, controller, dialog, and settings modules", () => {
	for (const name of ["Media", "Cards", "ControllerFactory", "Dialogs", "Settings"]) {
		assert.match(sources.entry, new RegExp(`import \\{ createGallery${name} \\}`));
	}
	assert.match(sources.media, /export function createGalleryMedia/);
	assert.match(sources.cards, /export function createGalleryCards/);
	assert.match(sources.controller, /export function createGalleryControllerFactory/);
	assert.match(sources.dialogs, /export function createGalleryDialogs/);
	assert.match(sources.settings, /export function createGallerySettings/);
	for (const [name, contents] of Object.entries(sources)) {
		assert.ok(contents.split(/\r?\n/).length <= 800, `${name} module exceeds the source-size contract`);
	}
});

function galleryDialogHarness() {
	const buttons = [];
	const dialogs = [];
	const toastCalls = [];
	const translations = [];
	const proxiedUrls = [];
	const dependencies = {
		app: { extensionManager: { toast: { add: (options) => toastCalls.push(options) } } },
		button: (options) => { buttons.push(options); return { ...options }; },
		createDialog: (options) => {
			const dialog = { options, close() {} };
			dialogs.push(dialog);
			return dialog;
		},
		el: (tag, options, text) => ({ tag, options, text }),
		icon: (name) => ({ name }),
		iconButton: (options) => ({ ...options }),
		label: (_key, fallback) => fallback,
		proxyUrl: (source, url) => { proxiedUrls.push([source, url]); return `proxy:${source}:${url}`; },
		searchQuery: () => "",
		searchToggleButton: () => ({}),
		stateFor: () => ({ selections: [] }),
		t: (key, fallback) => { translations.push(key); return fallback; },
		transact() {},
	};
	return { buttons, dependencies, dialogs, proxiedUrls, toastCalls, translations };
}

test("gallery dialog factory invokes single-selection dialog with its explicit i18n dependency", () => {
	const harness = galleryDialogHarness();
	const dialogs = createGalleryDialogs(harness.dependencies);
	assert.doesNotThrow(() => dialogs.openSingleSelectionDialog(() => {}));
	assert.equal(harness.dialogs.length, 1);
	assert.ok(harness.translations.includes("aaalice.common.cancel"));
});

test("gallery interrogation dialog uses explicit proxy and app dependencies at runtime", async () => {
	const harness = galleryDialogHarness();
	const dialogs = createGalleryDialogs(harness.dependencies);
	const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
	let copied = "";
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { clipboard: { writeText: async (value) => { copied = value; } } },
	});
	try {
		dialogs.openInterrogateResultDialog({ source: "danbooru", previewUrl: "https://example.test/preview.jpg", postId: "42" }, "prompt text");
		assert.deepEqual(harness.proxiedUrls, [["danbooru", "https://example.test/preview.jpg"]]);
		await harness.buttons[0].onClick();
		assert.equal(copied, "prompt text");
		assert.equal(harness.toastCalls[0]?.severity, "success");
	} finally {
		if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
		else delete globalThis.navigator;
	}
});
