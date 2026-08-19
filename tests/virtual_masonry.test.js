import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { VirtualMasonryLayout, masonryColumnCount, mountVirtualMasonry } from "../js/lib/virtual_masonry.js";

function posts(count) { return Array.from({ length: count }, (_, index) => ({ source: "mock", postId: String(index), width: 400 + (index % 7) * 70, height: 300 + (index % 11) * 90 })); }

test("masonry uses shortest column with stable left tie", () => {
	const layout = new VirtualMasonryLayout({ width: 594, minCardWidth: 144, gap: 6, maxColumns: 4 });
	layout.append([{ source: "x", postId: "1", width: 1, height: 1 }, { source: "x", postId: "2", width: 1, height: 2 }, { source: "x", postId: "3", width: 1, height: 1 }, { source: "x", postId: "4", width: 1, height: 1 }, { source: "x", postId: "5", width: 1, height: 1 }]);
	assert.deepEqual(layout.placements.slice(0, 4).map((item) => item.column), [0, 1, 2, 3]);
	assert.equal(layout.placements[4].column, 0);
});

test("append leaves previous placements untouched while resize reflows", () => {
	const layout = new VirtualMasonryLayout({ width: 760 }); layout.append(posts(100));
	const prior = layout.placements.slice(0, 100).map(({ x, y }) => [x, y]); layout.append(posts(20).map((item) => ({ ...item, postId: `next-${item.postId}` })));
	assert.deepEqual(layout.placements.slice(0, 100).map(({ x, y }) => [x, y]), prior);
	assert.equal(layout.placements.length, 120); assert.equal(layout.configure(520), true); assert.notDeepEqual(layout.placements.slice(0, 100).map(({ x, y }) => [x, y]), prior);
});

test("viewport anchor chooses the nearest card top across gaps and long columns", () => {
	const layout = new VirtualMasonryLayout({ width: 306, minCardWidth: 144, gap: 6, maxColumns: 2 });
	layout.append([
		{ source: "mock", postId: "long", width: 1, height: 10 },
		{ source: "mock", postId: "short", width: 1, height: 1 },
		{ source: "mock", postId: "next", width: 1, height: 1 },
	]);
	assert.deepEqual(layout.viewportAnchor(153), { key: "mock:next", offset: -3, index: 2 });
});

test("masonry restores the same card offset after its columns reflow", () => {
	const layout = new VirtualMasonryLayout({ width: 760 }); layout.append(posts(200));
	const target = layout.placements[90]; const scrollTop = target.y + 37;
	const anchor = layout.viewportAnchor(scrollTop);
	assert.ok(anchor);
	const anchoredPlacement = layout.placementsByKey.get(anchor.key);
	assert.equal(scrollTop - anchoredPlacement.y, anchor.offset);
	layout.configure(430);
	const restored = layout.scrollTopForAnchor(anchor, 300);
	assert.notEqual(restored, null);
	assert.ok(Math.abs(restored - layout.placementsByKey.get(anchor.key).y - anchor.offset) < 1e-9);
	assert.equal(layout.scrollTopForAnchor({ key: "mock:missing", offset: 0 }, 300), null);
});

test("duplicate stable identities never reserve empty masonry placements", () => {
	const layout = new VirtualMasonryLayout({ width: 300, minCardWidth: 144, gap: 6, maxColumns: 2 });
	layout.append([
		{ source: "x", postId: "1", width: 1, height: 1 },
		{ source: "x", postId: "2", width: 1, height: 1 },
		{ source: "x", postId: "1", width: 3, height: 4 },
	]);
	assert.deepEqual(layout.placements.map((placement) => placement.key), ["x:1", "x:2"]);
	assert.equal(layout.items.length, 2);
	layout.reflow();
	assert.deepEqual(layout.placements.map((placement) => placement.key), ["x:1", "x:2"]);
});

test("10,000 posts keep the visible range bounded", () => {
	const layout = new VirtualMasonryLayout({ width: 760 }); layout.append(posts(10_000));
	for (const scrollTop of [0, 10_000, 100_000, Math.max(0, layout.totalHeight - 720)]) assert.ok(layout.visible(scrollTop, 720).length <= 240);
	assert.equal(layout.placements.length, 10_000); assert.equal(masonryColumnCount(760), 5);
});

test("mounted cards receive their real display geometry for adaptive overlays", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /element\._aaVirtualMasonryLayout\?\.\(placement\.width, placement\.height\)/);
});

test("visible items feed bounded media prefetch only when the visible set changes", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	// 单次 visible 计算同时驱动差量挂载与预取上报，且只在集合签名变化时回调。
	assert.match(source, /onVisibleItemsChange\?\.\(visible\.map\(\(placement\) => placement\.item\)\)/);
	assert.match(source, /signature !== visibleSignature/);
});

test("masonry redraws once after synchronous data changes so restored widget geometry is used", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /setItems\(next, \{ preserveScroll = true, restoreAnchor: anchor = null \} = \{\}\) \{[^\n]+draw\(true\); if \(sizesDirty && active\) schedule\(\); \},/);
	assert.match(source, /append\(next\) \{[^\n]+draw\(true\); if \(sizesDirty && active\) schedule\(\); \},/);
});

test("scrolling frames skip style writes when placement geometry is unchanged", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /const layoutChanged = layoutRevision !== layout\.revision;/);
	assert.match(source, /if \(isNew \|\| layoutChanged \|\| force\)/);
	assert.match(source, /if \(spacer\.style\.height !== `\$\{totalHeight\}px`\) spacer\.style\.height/);
});

test("natural-size corrections resolve by key without scanning the item list", () => {
	const layout = new VirtualMasonryLayout({ width: 760 }); layout.append(posts(200));
	assert.equal(layout.updateItemSize("mock:0", 999, 888), true);
	assert.equal(layout.updateItemSize("mock:0", 999, 888), false);
	assert.equal(layout.updateItemSize("mock:missing", 1, 1), false);
	assert.equal(layout.items[0].width, 999);
});

test("each projection detects a shared post size correction independently", () => {
	const post = { source: "mock", postId: "shared", width: 1, height: 1 };
	const nodeLayout = new VirtualMasonryLayout({ width: 600 }); const dashboardLayout = new VirtualMasonryLayout({ width: 360 });
	nodeLayout.append([post]); dashboardLayout.append([post]);
	assert.equal(nodeLayout.updateItemSize("mock:shared", 1, 2), true);
	assert.equal(dashboardLayout.updateItemSize("mock:shared", 1, 2), true);
	assert.equal(nodeLayout.updateItemSize("mock:shared", 1, 2), false);
	assert.equal(dashboardLayout.updateItemSize("mock:shared", 1, 2), false);
});

test("inactive masonry coalesces natural-size corrections until activation", () => {
	const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
	const previousRequest = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
	const previousCancel = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
	const element = () => ({ className: "", classList: { add() {} }, dataset: {}, style: {}, append() {}, querySelector() { return null; }, remove() {} });
	const frames = [];
	Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: element } });
	Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (callback) => { frames.push(callback); return frames.length; } });
	Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: () => {} });
	const container = { clientWidth: 300, clientHeight: 500, scrollTop: 0, classList: { add() {} }, replaceChildren() {}, addEventListener() {}, removeEventListener() {} };
	try {
		const controller = mountVirtualMasonry(container, { renderItem: element });
		controller.setItems([{ source: "mock", postId: "sized", width: 1, height: 1 }]);
		controller.setActive(false); const originalHeight = controller.layout.placements[0].height;
		controller.updateItemSize("mock:sized", 1, 2);
		assert.equal(frames.length, 0); assert.equal(controller.layout.placements[0].height, originalHeight);
		controller.setActive(true);
		assert.equal(controller.layout.placements[0].height, originalHeight * 2);
		assert.equal(frames.length, 1, "activation schedules only the ordinary follow-up draw");
		controller.destroy();
	} finally {
		for (const [name, descriptor] of [["document", previousDocument], ["requestAnimationFrame", previousRequest], ["cancelAnimationFrame", previousCancel]]) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
		}
	}
});

test("revision changes only when placements actually move", () => {
	const layout = new VirtualMasonryLayout({ width: 760 });
	const initial = layout.revision;
	layout.append(posts(20));
	assert.equal(layout.revision, initial);
	layout.updateItemSize("mock:0", 500, 500);
	assert.equal(layout.revision, initial);
	layout.setItems(posts(10));
	assert.equal(layout.revision, initial + 1);
	const afterSet = layout.revision;
	layout.reflow();
	assert.equal(layout.revision, afterSet + 1);
	assert.equal(layout.configure(600), true);
	assert.equal(layout.revision, afterSet + 2);
	assert.equal(layout.configure(600), false);
	assert.equal(layout.revision, afterSet + 2);
});

test("logical page reporting ignores earlier cards mounted only for overscan", () => {
	const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
	const element = () => ({ className: "", classList: { add() {} }, dataset: {}, style: {}, append() {}, querySelector() { return null; }, remove() {} });
	Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: element } });
	const container = { clientWidth: 306, clientHeight: 500, scrollTop: 2000, classList: { add() {} }, replaceChildren() {}, addEventListener() {}, removeEventListener() {} };
	let visibleIndex = -1;
	try {
		const controller = mountVirtualMasonry(container, { renderItem: element, onVisibleIndexChange: (index) => { visibleIndex = index; }, minCardWidth: 144, gap: 6, maxColumns: 2 });
		controller.append([{ source: "mock", postId: "page-1-long", width: 1, height: 100 }, ...Array.from({ length: 40 }, (_, index) => ({ source: "mock", postId: `later-${index}`, width: 1, height: 1 }))]);
		assert.equal(visibleIndex, controller.layout.viewportAnchor(container.scrollTop).index);
		assert.notEqual(visibleIndex, 0, "the long first-page card is overscan content, not the current logical page");
		controller.destroy();
	} finally {
		if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
		else delete globalThis.document;
	}
});

test("masonry can release mounted cards while its host widget is offscreen", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /setActive\(nextActive\)/);
	assert.match(source, /releaseImage\(element\)/);
	assert.match(source, /image\._aaVirtualMasonryRelease\?\.\(\) === true/);
	assert.match(source, /if \(!preserved\) image\.removeAttribute\("src"\)/);
});

test("near-end refill reads cached layout geometry without scanning cards", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /needsMore\(\) \{ return active && layout\.totalHeight - container\.scrollTop - container\.clientHeight <= nearEndDistance; \}/);
});

test("near-end can be rechecked without scrolling away from the boundary", () => {
	const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
	const element = () => ({
		className: "",
		classList: { add() {} },
		dataset: {},
		style: {},
		append() {},
		querySelector() { return null; },
		remove() {},
	});
	Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: element } });
	const container = {
		clientWidth: 300,
		clientHeight: 500,
		scrollTop: 0,
		classList: { add() {} },
		replaceChildren() {},
		addEventListener() {},
		removeEventListener() {},
	};
	let nearEndCalls = 0;
	try {
		const controller = mountVirtualMasonry(container, {
			renderItem: element,
			onNearEnd: () => { nearEndCalls += 1; },
		});
		nearEndCalls = 0;
		controller.append([{ source: "mock", postId: "short", width: 1, height: 1 }]);
		assert.equal(nearEndCalls, 1);
		controller.refresh();
		assert.equal(nearEndCalls, 1, "ordinary redraw remains disarmed at the same boundary");
		controller.recheckNearEnd();
		assert.equal(nearEndCalls, 2, "settled page load can replay the consumed boundary signal");
		controller.destroy();
	} finally {
		if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
		else delete globalThis.document;
	}
});
