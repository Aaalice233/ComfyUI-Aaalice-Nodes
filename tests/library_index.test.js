import test from "node:test";
import assert from "node:assert/strict";

import { LibraryIndex } from "../js/lib/library_index.js";

const snapshot = {
	categories: [{ id: "people", name: "People" }],
	collections: [{ id: "favorites", name: "Favorites" }],
	tags: [{ id: "red", name: "Red" }],
	entries: [
		{ id: "a", title: "Red hair", text: "crimson hair", note: "warm", categoryId: "people", tagIds: ["red"], collections: [{ collectionId: "favorites" }], lastUsedAt: 10 },
		{ id: "b", title: "Blue sky", text: "clear sky", categoryId: null, tagIds: [], collections: [], lastUsedAt: 20 },
	],
};

test("library index reuses derived lookup data for search and taxonomy", () => {
	const index = new LibraryIndex(snapshot);
	assert.deepEqual(index.filter({ query: "warm" }).map((entry) => entry.id), ["a"]);
	assert.deepEqual(index.filter({ categoryId: "people", collectionId: "favorites" }).map((entry) => entry.id), ["a"]);
	assert.equal(index.categoryName("people"), "People");
	assert.deepEqual(index.collectionNames([{ collectionId: "favorites" }]), ["Favorites"]);
	assert.deepEqual(index.collectionItems([{ collectionId: "favorites" }]), [snapshot.collections[0]]);
	assert.deepEqual(index.tagNames(["red"]), ["Red"]);
	assert.equal(index.usage("category", "people"), 1);
	assert.equal(index.usage("collection", "favorites"), 1);
});

test("library index can place recently used prompts first without disturbing stable ties", () => {
	const index = new LibraryIndex({ entries: [
		{ id: "unused", title: "Unused", text: "unused", lastUsedAt: 0 },
		{ id: "older", title: "Older", text: "older", lastUsedAt: 10 },
		{ id: "newer-a", title: "Newer A", text: "newer a", lastUsedAt: 20 },
		{ id: "newer-b", title: "Newer B", text: "newer b", lastUsedAt: 20 },
	] });
	assert.deepEqual(index.filter({ recentFirst: true }).map((entry) => entry.id), ["newer-a", "newer-b", "older", "unused"]);
	assert.deepEqual(index.filter().map((entry) => entry.id), ["unused", "older", "newer-a", "newer-b"]);
});
