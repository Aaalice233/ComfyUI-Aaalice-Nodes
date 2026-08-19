import assert from "node:assert/strict";
import test from "node:test";
import { galleryCardActionLayout } from "../js/lib/booru_gallery_card_layout.js";

test("gallery card actions choose the smallest complete grid that fits", () => {
	assert.deepEqual(galleryCardActionLayout(143, 80, 6), { mode: "grid", columns: 3, rows: 2 });
	assert.deepEqual(galleryCardActionLayout(143, 80, 5), { mode: "grid", columns: 3, rows: 2 });
	assert.deepEqual(galleryCardActionLayout(90, 90, 4), { mode: "grid", columns: 2, rows: 2 });
});

test("gallery card actions keep linear layouts when the card geometry supports them", () => {
	assert.deepEqual(galleryCardActionLayout(205, 48, 6), { mode: "horizontal", columns: 6, rows: 1 });
	assert.deepEqual(galleryCardActionLayout(205, 48, 5), { mode: "horizontal", columns: 5, rows: 1 });
	assert.deepEqual(galleryCardActionLayout(48, 205, 6), { mode: "vertical", columns: 1, rows: 6 });
	assert.deepEqual(galleryCardActionLayout(48, 205, 5), { mode: "vertical", columns: 1, rows: 5 });
});

test("gallery card actions collapse to one overflow trigger only when no complete grid fits", () => {
	assert.deepEqual(galleryCardActionLayout(120, 45, 6), { mode: "overflow", columns: 1, rows: 1 });
	assert.deepEqual(galleryCardActionLayout(120, 45, 5), { mode: "overflow", columns: 1, rows: 1 });
	assert.deepEqual(galleryCardActionLayout(120, 45, 0), { mode: "none", columns: 0, rows: 0 });
});
