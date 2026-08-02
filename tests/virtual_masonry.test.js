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

test("masonry reports overscanned visible items for bounded media prefetch", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /onVisibleItemsChange\?\.\(layout\.visible\(container\.scrollTop, container\.clientHeight \|\| 1, 0\.25\)\.map\(\(placement\) => placement\.item\)\)/);
});

test("masonry redraws once after synchronous data changes so restored widget geometry is used", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /setItems\(next, \{ preserveScroll = true \} = \{\}\) \{[^\n]+draw\(true\); schedule\(\); \},/);
	assert.match(source, /append\(next\) \{[^\n]+draw\(true\); schedule\(\); \},/);
});

test("masonry can release mounted cards while its host widget is offscreen", () => {
	const source = readFileSync(new URL("../js/lib/virtual_masonry.js", import.meta.url), "utf8");
	assert.match(source, /setActive\(nextActive\)/);
	assert.match(source, /element\.querySelector\("img"\)\?\.removeAttribute\("src"\)/);
});
