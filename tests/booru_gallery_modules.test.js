import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import test from "node:test";

import { isCurrentGalleryCardBinding, recoverGalleryCardImage, restoreGalleryScrollFocus, runGalleryCardBindingAction } from "../js/lib/booru_gallery_cards.js";
import { createGalleryControllerFactory } from "../js/lib/booru_gallery_controller.js";
import { createGalleryDialogs } from "../js/lib/booru_gallery_dialogs.js";

function createSelectionHarness(mode = "multi") {
	const requests = new Map(); const state = { selectionMode: mode, selections: [] }; let transactionCount = 0;
	const controller = createGalleryControllerFactory({
		API: "/gallery",
		STATIC_EXTENSIONS: new Set(["jpg"]),
		createTooltip: () => ({ hide() {} }),
		jsonRequest: (url) => new Promise((resolve) => { requests.set(new URL(url, "https://gallery.local").searchParams.get("postId"), resolve); }),
		label: (_key, fallback) => fallback,
		selectionFromDetail: (detail) => ({ source: detail.source, postId: detail.postId }),
		selectionKey: (selection) => `${selection.source}:${selection.postId}`,
		stateFor: () => state,
		transact: (_node, callback) => { transactionCount += 1; callback(state); },
	})({}, new Set());
	return {
		controller,
		state,
		get transactionCount() { return transactionCount; },
		resolve(postId) { requests.get(postId)({ source: "danbooru", postId, mediaUrl: `${postId}.jpg`, fileExt: "jpg" }); },
	};
}

const sources = Object.fromEntries([
	["entry", "../js/booru_gallery.js"],
	["surface", "../js/lib/booru_gallery_surface.js"],
	["control", "../js/lib/controls/booru_gallery.js"],
	["media", "../js/lib/booru_gallery_media.js"],
	["cards", "../js/lib/booru_gallery_cards.js"],
	["imagePool", "../js/lib/booru_gallery_image_pool.js"],
	["hover", "../js/lib/booru_gallery_hover.js"],
	["controller", "../js/lib/booru_gallery_controller.js"],
	["random", "../js/lib/booru_gallery_random.js"],
	["dialogs", "../js/lib/booru_gallery_dialogs.js"],
	["settings", "../js/lib/booru_gallery_settings.js"],
].map(([name, modulePath]) => [name, fs.readFileSync(new URL(modulePath, import.meta.url), "utf8")]));

test("every gallery module parses as a real ES module", () => {
	for (const [name, modulePath] of [
		["entry", "../js/booru_gallery.js"],
		["surface", "../js/lib/booru_gallery_surface.js"],
		["control", "../js/lib/controls/booru_gallery.js"],
		["media", "../js/lib/booru_gallery_media.js"],
		["cards", "../js/lib/booru_gallery_cards.js"],
		["imagePool", "../js/lib/booru_gallery_image_pool.js"],
		["hover", "../js/lib/booru_gallery_hover.js"],
		["controller", "../js/lib/booru_gallery_controller.js"],
		["random", "../js/lib/booru_gallery_random.js"],
		["dialogs", "../js/lib/booru_gallery_dialogs.js"],
		["settings", "../js/lib/booru_gallery_settings.js"],
	]) {
		const file = fileURLToPath(new URL(modulePath, import.meta.url));
		execFileSync(process.execPath, ["--check", file], { encoding: "utf8" });
		assert.ok(true, `${name} module parses`);
	}
});

test("pointer card actions return focus to masonry so wheel capture stays active", () => {
	const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
	const favoriteButton = {};
	const dialogControl = {};
	const fakeDocument = { activeElement: favoriteButton };
	let focusOptions = null;
	const masonry = { focus(options) { focusOptions = options; fakeDocument.activeElement = masonry; } };
	const card = { closest(selector) { assert.equal(selector, ".aa-gallery-masonry"); return masonry; } };
	Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
	try {
		assert.equal(restoreGalleryScrollFocus(card, favoriteButton, { detail: 1 }), true);
		assert.deepEqual(focusOptions, { preventScroll: true });
		assert.equal(fakeDocument.activeElement, masonry);

		fakeDocument.activeElement = favoriteButton;
		focusOptions = null;
		assert.equal(restoreGalleryScrollFocus(card, favoriteButton, { detail: 0 }), false, "keyboard activation keeps the button focused");
		assert.equal(focusOptions, null);

		fakeDocument.activeElement = dialogControl;
		assert.equal(restoreGalleryScrollFocus(card, favoriteButton, { detail: 1 }), false, "a dialog that already took focus must keep it");
		assert.equal(fakeDocument.activeElement, dialogControl);
	} finally {
		if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
		else delete globalThis.document;
	}
});

test("card binding ownership expires on revision, controller, or post changes", () => {
	const controller = {}; const post = {};
	const view = { bindingRevision: 4, controller, post };
	const binding = { revision: 4, controller, post };
	assert.equal(isCurrentGalleryCardBinding(view, binding), true);
	view.bindingRevision += 1;
	assert.equal(isCurrentGalleryCardBinding(view, binding), false);
	view.bindingRevision = 4; view.controller = {};
	assert.equal(isCurrentGalleryCardBinding(view, binding), false);
	view.controller = controller; view.post = {};
	assert.equal(isCurrentGalleryCardBinding(view, binding), false);
});

test("late card actions keep global results without changing rebound card feedback", async () => {
	let resolveAction;
	const oldController = {}; const oldPost = {};
	const view = { bindingRevision: 2, controller: oldController, post: oldPost };
	const binding = { revision: 2, controller: oldController, post: oldPost };
	const events = [];
	const pending = runGalleryCardBindingAction(view, binding, () => new Promise((resolve) => { resolveAction = resolve; }), {
		onSuccess: (_binding, result) => events.push(["global", result]),
		onCurrentSuccess: () => events.push(["card-success"]),
		onCurrentSettled: () => events.push(["card-settled"]),
	});
	view.bindingRevision += 1; view.controller = {}; view.post = {};
	resolveAction("done");
	assert.equal(await pending, "done");
	assert.deepEqual(events, [["global", "done"]]);
});

test("late card action errors stay attributed to their original binding", async () => {
	let rejectAction;
	const oldController = {}; const oldPost = {};
	const view = { bindingRevision: 3, controller: oldController, post: oldPost };
	const binding = { revision: 3, controller: oldController, post: oldPost };
	const errors = []; let settled = false;
	const pending = runGalleryCardBindingAction(view, binding, () => new Promise((_resolve, reject) => { rejectAction = reject; }), {
		onError: (failedBinding, error) => errors.push([failedBinding.controller, failedBinding.post, error.message]),
		onCurrentSettled: () => { settled = true; },
	});
	view.bindingRevision += 1; view.controller = {}; view.post = {};
	rejectAction(new Error("old action failed"));
	await pending;
	assert.deepEqual(errors, [[oldController, oldPost, "old action failed"]]);
	assert.equal(settled, false);
});

test("late preview recovery cannot write into a rebound gallery card", async () => {
	let resolveDetail;
	const detailRequest = new Promise((resolve) => { resolveDetail = resolve; });
	const controller = { recoverPreview: () => detailRequest };
	const oldPost = { source: "aitag", postId: "old", previewUrl: "old.jpg", width: 1, height: 1 };
	const oldImage = { dataset: {}, src: "aitag:old.jpg" };
	const view = { controller, post: oldPost, image: oldImage, currentSrc: oldImage.src, previewRecovery: null };
	const surface = { classList: { add() {}, remove() {} } };
	const pending = recoverGalleryCardImage(view, oldPost, oldImage, { proxyUrl: (source, url) => `${source}:${url}`, surface });
	assert.equal(oldImage.dataset.previewRecovery, "pending");
	view.post = { source: "aitag", postId: "new" };
	view.previewRecovery = null;
	delete oldImage.dataset.previewRecovery;
	resolveDetail({ source: "aitag", postId: "old", previewUrl: "new.jpg", width: 640, height: 960 });
	await pending;
	assert.deepEqual(oldPost, { source: "aitag", postId: "old", previewUrl: "old.jpg", width: 1, height: 1 });
	assert.equal(view.currentSrc, "aitag:old.jpg");
	assert.equal(oldImage.src, "aitag:old.jpg");
});

test("shared AI TAG detail recovery updates every current projection", async () => {
	const detail = { source: "aitag", postId: "42", previewUrl: "exact.jpg", width: 640, height: 960 };
	const controller = { recoverPreview: async () => detail };
	const post = { source: "aitag", postId: "42", previewUrl: "derived.jpg", width: 1, height: 1 };
	const surface = { classList: { add() {}, remove() {} } };
	const createView = () => {
		const image = { dataset: {}, src: "aitag:derived.jpg" };
		return { controller, post, image, currentSrc: image.src, previewRecovery: null };
	};
	const first = createView(); const second = createView();
	await Promise.all([
		recoverGalleryCardImage(first, post, first.image, { proxyUrl: (source, url) => `${source}:${url}`, surface }),
		recoverGalleryCardImage(second, post, second.image, { proxyUrl: (source, url) => `${source}:${url}`, surface }),
	]);
	assert.equal(first.currentSrc, "aitag:exact.jpg");
	assert.equal(second.currentSrc, "aitag:exact.jpg");
	assert.equal(first.image.src, "aitag:exact.jpg");
	assert.equal(second.image.src, "aitag:exact.jpg");
});

test("AI TAG preview recovery returns data without mutating card-owned state", async () => {
	let resolveDetail;
	const detailRequest = new Promise((resolve) => { resolveDetail = resolve; });
	const controller = createGalleryControllerFactory({
		API: "/gallery",
		STATIC_EXTENSIONS: new Set(["jpg"]),
		createTooltip: () => ({ hide() {} }),
		jsonRequest: () => detailRequest,
		label: (_key, fallback) => fallback,
	})({}, new Set());
	const post = { source: "aitag", postId: "42", previewUrl: "https://example.test/old.jpg", width: 1, height: 1 };
	const pending = controller.recoverPreview(post);
	resolveDetail({ source: "aitag", postId: "42", previewUrl: "https://example.test/new.jpg", mediaUrl: "https://example.test/new.jpg", fileExt: "jpg", width: 640, height: 960 });
	const detail = await pending;
	assert.equal(detail.previewUrl, "https://example.test/new.jpg");
	assert.deepEqual(post, { source: "aitag", postId: "42", previewUrl: "https://example.test/old.jpg", width: 1, height: 1 });
	post.previewUrl = detail.previewUrl;
	assert.equal(await controller.recoverPreview(post), detail, "another projection still receives cached detail after the shared post is updated");
	assert.equal(post.width, 1, "the controller never applies card-owned dimensions");
	controller.destroy();
});

test("concurrent projections cannot append the same Gallery selection twice", async () => {
	const harness = createSelectionHarness(); const post = { source: "danbooru", postId: "42" };
	const first = harness.controller.toggleSelection(post); const second = harness.controller.toggleSelection(post);
	harness.resolve("42");
	await Promise.all([first, second]);
	assert.deepEqual(harness.state.selections, [{ source: "danbooru", postId: "42" }]);
	assert.equal(harness.transactionCount, 1, "the losing projection must not create a no-op graph transaction");
	harness.controller.destroy();
});

test("multiple Gallery selections commit in click order when details return out of order", async () => {
	const harness = createSelectionHarness();
	const first = harness.controller.toggleSelection({ source: "danbooru", postId: "first" });
	const second = harness.controller.toggleSelection({ source: "danbooru", postId: "second" });
	harness.resolve("second"); await Promise.resolve();
	assert.deepEqual(harness.state.selections, [], "a later detail must wait for the earlier selection intent");
	harness.resolve("first"); await Promise.all([first, second]);
	assert.deepEqual(harness.state.selections.map((item) => item.postId), ["first", "second"]);
	assert.equal(harness.transactionCount, 2);
	harness.controller.destroy();
});

test("single Gallery selection only commits the latest click intent", async () => {
	const harness = createSelectionHarness("single");
	const first = harness.controller.toggleSelection({ source: "danbooru", postId: "first" });
	const second = harness.controller.toggleSelection({ source: "danbooru", postId: "second" });
	harness.resolve("second"); await second;
	assert.deepEqual(harness.state.selections.map((item) => item.postId), ["second"]);
	harness.resolve("first"); await first;
	assert.deepEqual(harness.state.selections.map((item) => item.postId), ["second"]);
	assert.equal(harness.transactionCount, 1);
	harness.controller.destroy();
});

test("destroyed Gallery controllers discard late selection details", async () => {
	const harness = createSelectionHarness();
	const pending = harness.controller.toggleSelection({ source: "danbooru", postId: "late" });
	harness.controller.destroy(); harness.resolve("late"); await pending;
	assert.deepEqual(harness.state.selections, []);
	assert.equal(harness.transactionCount, 0);
});

test("gallery entry delegates cohesive surface, media, card, controller, dialog, and settings modules", () => {
	for (const name of ["Media", "Cards", "ControllerFactory", "Dialogs", "Settings"]) {
		assert.match(sources.entry, new RegExp(`import \\{ createGallery${name}(?:, [^}]+)? \\}`));
	}
	assert.match(sources.entry, /import \{ createGallerySurfaceFactory, observeGalleryNodeMode \}/);
	assert.match(sources.surface, /export function createGallerySurfaceFactory/);
	assert.match(sources.control, /export function renderBooruGalleryControl/);
	assert.match(sources.media, /export function createGalleryMedia/);
	assert.match(sources.cards, /export function createGalleryCards/);
	assert.match(sources.imagePool, /export function createDecodedImagePool/);
	assert.match(sources.hover, /export function createGalleryHover/);
	assert.match(sources.controller, /export function createGalleryControllerFactory/);
	assert.match(sources.controller, /import \{ createGalleryHover \} from "\.\/booru_gallery_hover\.js"/);
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

function searchControlHarness(query = "") {
	const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
	const originalQueueMicrotask = globalThis.queueMicrotask;
	const state = { query, filters: { feed: "search", period: "" }, navigation: { page: 1 } };
	const listeners = new Map();
	const input = {
		value: "", className: "", dataset: {},
		addEventListener(type, listener) { listeners.set(type, listener); },
		setAttribute() {}, hasAttribute() { return false; }, focus() {}, setSelectionRange() {},
	};
	const root = { classList: { toggle() {} }, append() {} };
	const toggle = { hidden: false, setSearchOpen() {}, setSearchValue() {} };
	Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, createElement: () => input } });
	globalThis.queueMicrotask = (callback) => callback();
	const dialogs = createGalleryDialogs({
		...galleryDialogHarness().dependencies,
		el: () => root,
		iconButton: (options) => options,
		searchQuery: (value) => value.query,
		searchToggleButton: () => toggle,
		stateFor: () => state,
		transact: (_node, callback) => callback(state),
	});
	const node = { _aaGalleryController: { search() {} } };
	const control = dialogs.createSearchControl(node);
	node._aaGalleryController.syncState = () => control.sync();
	return {
		control, input, listeners, state,
		restore() {
			globalThis.queueMicrotask = originalQueueMicrotask;
			if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
			else delete globalThis.document;
		},
	};
}

test("collapsed gallery search preserves the submitted draft across synchronous state sync", () => {
	const harness = searchControlHarness("old query");
	try {
		harness.control.setOpen(true, { focus: false });
		harness.input.value = "new query";
		harness.listeners.get("input")();
		// Collapsing moves focus before click; a host sync in that gap must not restore the old query.
		harness.control.sync();
		harness.control.setOpen(false);
		assert.equal(harness.state.query, "new query");
		assert.equal(harness.input.value, "new query");
		assert.equal(harness.control.getValue(), "new query");
	} finally { harness.restore(); }
});

test("gallery search draft is not overwritten by an unrelated state sync", () => {
	const harness = searchControlHarness("committed query");
	try {
		harness.input.value = "live draft";
		harness.listeners.get("input")();
		harness.control.sync();
		assert.equal(harness.input.value, "live draft");
		assert.equal(harness.control.getValue(), "live draft");
		assert.equal(harness.state.query, "committed query");
	} finally { harness.restore(); }
});

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

test("gallery error dialog preserves and copies the complete TLS failure", async () => {
	const harness = galleryDialogHarness();
	const dialogs = createGalleryDialogs(harness.dependencies);
	const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
	const message = "Cannot connect to host danbooru.donmai.us:443 ssl:True [SSLCertVerificationError: certificate has expired]";
	let copied = ""; let retries = 0;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { clipboard: { writeText: async (value) => { copied = value; } } },
	});
	try {
		dialogs.openGalleryErrorDialog({ code: "tls_certificate_error", message }, () => { retries += 1; });
		assert.equal(harness.dialogs.length, 1);
		assert.equal(harness.dialogs[0].options.className, "aa-gallery-error-dialog");
		assert.equal(harness.dialogs[0].options.body.options.children.at(-1).options.text, message);
		await harness.buttons.find((entry) => entry.label === "Copy error").onClick();
		assert.equal(copied, message);
		assert.equal(harness.toastCalls[0]?.severity, "success");
		harness.buttons.find((entry) => entry.label === "Retry").onClick();
		assert.equal(retries, 1);
	} finally {
		if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
		else delete globalThis.navigator;
	}
});

test("gallery controller exposes a persistent TLS summary without dropping raw diagnostics", () => {
	const elements = {
		error: { hidden: true, title: "", classList: { toggle() {} } },
		errorLabel: { textContent: "" },
		masonryController: { destroy() {} },
		selectedDropIndicator: null,
		selectedList: { destroy() {} },
	};
	const controller = createGalleryControllerFactory({
		createTooltip: () => ({ hide() {}, destroy() {} }),
		label: (_key, fallback) => fallback,
	})({}, elements);
	const previousConsoleError = console.error;
	console.error = () => {};
	try {
		const message = "certificate has expired (_ssl.c:1010)";
		controller.showError({ code: "tls_certificate_error", message });
		assert.equal(elements.error.hidden, false);
		assert.match(elements.errorLabel.textContent, /SSL certificate verification failed/);
		assert.deepEqual(controller.getLastError(), { code: "tls_certificate_error", message, summary: elements.errorLabel.textContent });
	} finally {
		console.error = previousConsoleError;
		controller.destroy();
	}
});

test("attaching the Dashboard projection suspends the duplicate node projection", () => {
	const activity = [];
	const makeSurface = (placement) => ({
		placement,
		root: { isConnected: true },
		setProjectionEnabled(enabled) { activity.push([placement, enabled]); },
		syncState() {},
		masonryController: { setItems() {}, destroy() {} },
		selectedList: { setItems() {}, destroy() {} },
		selectedDropIndicator: null,
		loading: { hidden: true },
		pageControl: { setBusy() {} },
		end: { hidden: true }, endLabel: { textContent: "" },
		emptyResults: { hidden: true, querySelector: () => ({ textContent: "" }) },
		continueResults: { hidden: true },
		error: { hidden: true, classList: { toggle() {} } }, errorLabel: { textContent: "" },
		tabs: { setValue() {} }, selectionMode: { setValue() {} }, selectedCount: { textContent: "", setAttribute() {} },
		selectedSummary: { textContent: "" }, selectedClear: { disabled: false }, emptySelected: { hidden: true },
		mode: "browse", destroy() { activity.push([placement, "destroy"]); },
	});
	const nodeSurface = makeSurface("node");
	const dashboardSurface = makeSurface("dashboard");
	dashboardSurface.viewportActive = true;
	const controller = createGalleryControllerFactory({
		createTooltip: () => ({ hide() {}, destroy() {} }), label: (_key, fallback) => fallback,
		stateFor: () => ({ selections: [], selectionMode: "multi" }),
	})({}, nodeSurface);

	controller.attachSurface(dashboardSurface);
	assert.deepEqual(activity.slice(-2), [["node", false], ["dashboard", true]]);
	dashboardSurface.viewportActive = false;
	controller.syncProjectionActivity();
	assert.deepEqual(activity.slice(-2), [["node", true], ["dashboard", true]], "a hidden Dashboard page must release the canvas projection");
	controller.detachSurface(dashboardSurface);
	assert.deepEqual(activity.slice(-2), [["dashboard", "destroy"], ["node", true]]);
	controller.destroy();
});

test("random browse requests omit cursors and keep source-scoped posts unseen across draws", async () => {
	const state = { source: "danbooru", query: "blue hair", randomMode: true, filters: { feed: "search", sort: "latest", period: "", ratings: [] }, navigation: { page: 7 } };
	const urls = []; const requestOptions = []; const appended = [];
	const elements = {
		continueResults: { hidden: true }, loading: { hidden: true }, randomMode: { disabled: false },
		pageControl: { setBusy() {}, setPage() {} }, end: { hidden: true }, endLabel: { textContent: "" },
		emptyResults: { hidden: true, querySelector: () => ({ textContent: "" }) },
		error: { hidden: true, classList: { toggle() {} } }, errorLabel: { textContent: "" },
		masonryController: { setItems() {}, append(posts) { appended.push(posts); }, needsMore() { return false; }, recheckNearEnd() {}, updateItemSize() {}, destroy() {} },
		selectedDropIndicator: null, selectedList: { destroy() {} },
	};
	const controller = createGalleryControllerFactory({
		API: "/gallery", capability: () => ({ authRequired: false }), createTooltip: () => ({ hide() {}, destroy() {} }),
		hasSourceCredentials: () => true,
		jsonRequest: async (url, options) => {
			urls.push(url); requestOptions.push(options);
			return { page: 1, posts: [{ source: "danbooru", postId: "42", previewUrl: "https://example.test/42.jpg", width: 1, height: 1 }], nextCursor: null, ended: true, warnings: [] };
		},
		label: (_key, fallback) => fallback, searchQuery: () => state.query, stateFor: () => state,
	})({ graph: { change() {} } }, elements);
	await controller.search({ reset: true, page: 7 });
	await controller.search({ reset: false, page: 7 });
	assert.match(urls[0], /random=1/);
	assert.doesNotMatch(urls[0], /(?:page|cursor)=/);
	assert.equal(requestOptions[0].cache, "no-store", "random draws must bypass the browser HTTP cache");
	assert.equal(appended[0].length, 1);
	assert.equal(appended[1].length, 0, "a continuous near-end batch must not replay a post already seen in this random session");
	const scopeChanges = [
		() => { state.query = "fantasy"; },
		() => { state.filters.ratings = ["general"]; },
		() => { state.filters.feed = "ranking"; },
		() => { state.filters.period = "week"; },
		() => { state.source = "gelbooru"; state.filters.feed = "search"; },
	];
	for (const changeScope of scopeChanges) {
		changeScope();
		await controller.search({ reset: true, page: 7 });
		assert.equal(appended.at(-1).length, 1, "changing random scope must clear its transient seen set");
	}
	state.randomMode = false;
	await controller.search({ reset: true, page: 7 });
	const sequentialIndex = urls.length - 1;
	assert.match(urls[sequentialIndex], /page=7/);
	assert.doesNotMatch(urls[sequentialIndex], /random=1/);
	assert.equal(requestOptions[sequentialIndex].cache, undefined);
	assert.equal(appended.at(-1).length, 1, "leaving random mode clears its transient seen set");
	controller.destroy();
});

test("gallery replays a near-end request after the current page settles", async () => {
	const state = { source: "gelbooru", filters: { feed: "search", sort: "newest", ratings: [] }, navigation: { page: 1 } };
	let controller = null;
	let requestCount = 0;
	let resolveSecondRequest;
	const secondRequest = new Promise((resolve) => { resolveSecondRequest = resolve; });
	const requestNearEnd = () => controller?.search();
	const masonryController = {
		setItems() { requestNearEnd(); },
		append() { requestNearEnd(); },
		needsMore() { return true; },
		recheckNearEnd() { requestNearEnd(); },
		updateItemSize() {},
		destroy() {},
	};
	const elements = {
		continueResults: { hidden: true },
		loading: { hidden: true },
		pageControl: { setBusy() {}, setPage() {} },
		end: { hidden: true },
		endLabel: { textContent: "" },
		emptyResults: { hidden: true, querySelector: () => ({ textContent: "" }) },
		error: { hidden: true, classList: { toggle() {} } },
		errorLabel: { textContent: "" },
		masonryController,
		selectedDropIndicator: null,
		selectedList: { destroy() {} },
	};
	const buildController = createGalleryControllerFactory({
		API: "/gallery",
		capability: () => ({ authRequired: false }),
		createTooltip: () => ({ hide() {}, destroy() {} }),
		hasSourceCredentials: () => true,
		jsonRequest: async (url) => {
			requestCount += 1;
			if (requestCount === 1) return { page: 1, posts: [{ source: "gelbooru", postId: "1", previewUrl: "https://example.test/1.jpg", width: 1, height: 1 }], nextCursor: "next", ended: false, warnings: [] };
			assert.match(url, /cursor=next/);
			resolveSecondRequest();
			return { page: 2, posts: [], nextCursor: null, ended: true, warnings: [] };
		},
		label: (_key, fallback) => fallback,
		searchQuery: () => "",
		stateFor: () => state,
	});
	controller = buildController({ graph: { change() {} } }, elements);
	await controller.search({ reset: true, page: 1 });
	await secondRequest;
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(requestCount, 2, "the near-end callback consumed during append must run again after loading clears");
	controller.destroy();
});
