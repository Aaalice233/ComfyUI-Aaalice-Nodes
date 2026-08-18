import assert from "node:assert/strict";
import test from "node:test";

import { createDecodedImagePool, isCacheableDecodedPreview } from "../js/lib/booru_gallery_image_pool.js";

function fakeImage(src) {
	return {
		src,
		removed: [],
		removeAttribute(name) { this.removed.push(name); if (name === "src") this.src = null; },
	};
}

test("decoded image pool evicts the oldest entry by count", () => {
	const pool = createDecodedImagePool({ maxEntries: 2, maxPixels: 100 });
	const first = fakeImage("first"); const second = fakeImage("second"); const third = fakeImage("third");
	pool.remember("first", first, 2, 2); pool.remember("second", second, 2, 2); pool.remember("third", third, 2, 2);
	assert.deepEqual(first.removed, ["src"]);
	assert.equal(pool.size, 2); assert.equal(pool.pixels, 8);
	assert.equal(pool.take("first"), null);
	assert.equal(pool.take("second").image, second);
});

test("decoded image pool evicts the oldest entry by cumulative pixels", () => {
	const pool = createDecodedImagePool({ maxEntries: 4, maxPixels: 10 });
	const first = fakeImage("first"); const second = fakeImage("second"); const third = fakeImage("third");
	pool.remember("first", first, 2, 2); pool.remember("second", second, 2, 2); pool.remember("third", third, 2, 2);
	assert.deepEqual(first.removed, ["src"]);
	assert.equal(pool.size, 2); assert.equal(pool.pixels, 8);
	assert.equal(pool.take("first"), null);
	assert.deepEqual(pool.take("second"), { image: second, width: 2, height: 2, pixels: 4 });
	assert.equal(pool.size, 1); assert.equal(pool.pixels, 4);
});

test("decoded image pool replaces duplicate URLs without double-counting", () => {
	const pool = createDecodedImagePool({ maxEntries: 4, maxPixels: 100 });
	const previous = fakeImage("previous"); const replacement = fakeImage("replacement");
	pool.remember("same", previous, 3, 3);
	pool.remember("same", replacement, 2, 2);
	assert.deepEqual(previous.removed, ["src"]);
	assert.equal(pool.size, 1); assert.equal(pool.pixels, 4);
	assert.equal(pool.take("same").image, replacement);
	assert.equal(pool.size, 0); assert.equal(pool.pixels, 0);
});

test("decoded image pool rejects one image larger than its pixel budget", () => {
	const pool = createDecodedImagePool({ maxEntries: 4, maxPixels: 10 });
	const oversized = fakeImage("oversized");
	assert.equal(pool.remember("oversized", oversized, 4, 3), false);
	assert.equal(pool.size, 0); assert.equal(pool.pixels, 0);
	assert.deepEqual(oversized.removed, [], "the caller still owns a rejected image");
});

test("decoded preview cache only retains loaded sources that cannot animate", () => {
	assert.equal(isCacheableDecodedPreview("https://cdn.test/sample.jpg?size=preview"), true);
	assert.equal(isCacheableDecodedPreview("/relative/sample.JPEG#preview"), true);
	assert.equal(isCacheableDecodedPreview("/aaalice/gallery/media?source=danbooru&url=https%3A%2F%2Fcdn.test%2Fsample.jpg%3Fsize%3Dpreview"), true);
	for (const url of [
		"sample.gif", "sample.webp", "sample.png", "sample.apng", "sample", "",
		"/aaalice/gallery/media?source=aitag&url=https%3A%2F%2Fcdn.test%2Fanimated.gif",
	]) assert.equal(isCacheableDecodedPreview(url), false, url);
});
