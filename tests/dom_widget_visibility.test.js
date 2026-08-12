import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readStyleEntry } from "./helpers/style_source.js";

import { isDOMWidgetViewportVisible, observeDOMWidgetVisibility } from "../js/lib/dom_widget_visibility.js";

test("viewport visibility accepts intersecting entries and rejects zero-ratio entries", () => {
	assert.equal(isDOMWidgetViewportVisible({ isIntersecting: true, intersectionRatio: 0 }), true);
	assert.equal(isDOMWidgetViewportVisible({ isIntersecting: false, intersectionRatio: 0.2 }), true);
	assert.equal(isDOMWidgetViewportVisible({ isIntersecting: false, intersectionRatio: 0 }), false);
	assert.equal(isDOMWidgetViewportVisible(null), false);
});

test("viewport observer reports the initial inactive state, then only real changes, and disconnects", () => {
	const previousObserver = globalThis.IntersectionObserver;
	let callback = null;
	let disconnected = false;
	class FakeIntersectionObserver {
		constructor(nextCallback, options) { callback = nextCallback; this.options = options; }
		observe() {}
		disconnect() { disconnected = true; }
	}
	globalThis.IntersectionObserver = FakeIntersectionObserver;
	try {
		const states = [];
		const controller = observeDOMWidgetVisibility({}, { rootMargin: "640px", onChange: (active) => states.push(active) });
		assert.deepEqual(states, []);
		assert.ok(callback);
		callback([{ isIntersecting: false, intersectionRatio: 0 }]);
		callback([{ isIntersecting: true, intersectionRatio: 1 }]);
		assert.deepEqual(states, [false, true]);
		controller.destroy();
		assert.equal(disconnected, true);
	} finally {
		globalThis.IntersectionObserver = previousObserver;
	}
});

test("rich widget virtualization has an explicit inactive path and lifecycle wiring", () => {
	const root = new URL("../", import.meta.url);
	const list = readFileSync(new URL("js/lib/virtual_list.js", root), "utf8");
	const masonry = readFileSync(new URL("js/lib/virtual_masonry.js", root), "utf8");
	const booru = ["js/booru_gallery.js", "js/lib/booru_gallery_surface.js"].map((path) => readFileSync(new URL(path, root), "utf8")).join("\n");
	const prompt = readFileSync(new URL("js/prompt_selector.js", root), "utf8");
	const theme = readStyleEntry(new URL("js/lib/theme.css", root));

	assert.match(list, /setActive\(nextActive\)/);
	assert.match(list, /if \(!active\) \{[^}]*clearRendered\(\)/s);
	assert.match(masonry, /setActive\(nextActive\)/);
	assert.match(masonry, /if \(!active\) \{ clearMounted\(\); return; \}/);
	assert.match(booru, /observeDOMWidgetVisibility\(root/);
	assert.match(booru, /surface\.masonryController\.setActive\(active\)/);
	assert.match(booru, /visibility\.destroy\(\)/);
	assert.match(prompt, /observeDOMWidgetVisibility\(root/);
	assert.match(prompt, /_aaalicePromptSelectorVirtualList\?\.setActive/);
	assert.match(prompt, /_aaalicePromptSelectorVisibility\?\.destroy/);
	assert.match(theme, /\.aa-gallery\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-size:/s);
	assert.match(theme, /\.aa-prompt-selector\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-size:/s);
});
