import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { VirtualMasonryLayout, masonryColumnCount } from "../js/lib/virtual_masonry.js";

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
	assert.match(source, /setItems\(next, \{ preserveScroll = true \} = \{\}\) \{[^\n]+draw\(true\); if \(sizesDirty\) schedule\(\); \},/);
	assert.match(source, /append\(next\) \{[^\n]+draw\(true\); if \(sizesDirty\) schedule\(\); \},/);
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
