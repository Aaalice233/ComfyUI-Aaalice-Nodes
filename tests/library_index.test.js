import test from "node:test";
import assert from "node:assert/strict";

import { LibraryIndex } from "../js/lib/library_index.js";
import { UNCATEGORIZED_CATEGORY_ID } from "../js/lib/category_tree.js";

const snapshot = {
	categories: [
		{ id: "people", name: "People", parentId: null, position: 0 },
		{ id: "hair", name: "Hair", parentId: "people", position: 0 },
	],
	collections: [{ id: "favorites", name: "Favorites" }],
	tags: [{ id: "red", name: "Red" }],
	entries: [
		{ id: "a", title: "Red hair", text: "crimson hair", note: "warm", categoryId: "hair", tagIds: ["red"], collections: [{ collectionId: "favorites" }], lastUsedAt: 10 },
		{ id: "b", title: "Blue sky", text: "clear sky", categoryId: null, tagIds: [], collections: [], lastUsedAt: 20 },
		{ id: "c", title: "Portrait", text: "portrait", categoryId: "people", tagIds: [], collections: [], lastUsedAt: 0 },
	],
};

test("library index reuses derived lookup data for search and taxonomy", () => {
	const index = new LibraryIndex(snapshot);
	const categoryTree = index.categoryTree;
	assert.deepEqual(index.filter({ query: "warm" }).map((entry) => entry.id), ["a"]);
	assert.deepEqual(index.filter({ categoryId: "people", collectionId: "favorites" }).map((entry) => entry.id), ["a"]);
	assert.deepEqual(index.filter({ categoryId: "people" }).map((entry) => entry.id), ["a", "c"]);
	assert.deepEqual(index.filter({ categoryId: "hair" }).map((entry) => entry.id), ["a"]);
	assert.deepEqual(index.filter({ categoryId: UNCATEGORIZED_CATEGORY_ID }).map((entry) => entry.id), ["b"]);
	assert.deepEqual(index.filter({ categoryId: "missing" }).map((entry) => entry.id), ["a", "b", "c"]);
	assert.deepEqual(index.filter({ categoryId: UNCATEGORIZED_CATEGORY_ID, query: "sky" }).map((entry) => entry.id), ["b"]);
	assert.equal(index.categoryTree.uncategorizedCount, 1);
	assert.equal(index.categoryName("hair"), "People / Hair");
	assert.deepEqual(index.collectionNames([{ collectionId: "favorites" }]), ["Favorites"]);
	assert.deepEqual(index.collectionItems([{ collectionId: "favorites" }]), [snapshot.collections[0]]);
	assert.deepEqual(index.tagNames(["red"]), ["Red"]);
	assert.equal(index.usage("category", "people"), 2);
	assert.equal(index.categoryDirectCount("people"), 1);
	assert.equal(index.usage("collection", "favorites"), 1);
	assert.strictEqual(index.categoryTree, categoryTree);
	const refreshed = new LibraryIndex({ ...snapshot, entries: [...snapshot.entries, { id: "d", title: "More hair", text: "hair", categoryId: "hair" }] }, categoryTree);
	assert.strictEqual(refreshed.categoryTree, categoryTree);
	assert.equal(refreshed.usage("category", "people"), 3);
	const rebuilt = new LibraryIndex({ ...snapshot, categories: snapshot.categories.map((category) => category.id === "people" ? { ...category, name: "Characters" } : category) }, categoryTree);
	assert.notStrictEqual(rebuilt.categoryTree, categoryTree);
	assert.equal(rebuilt.categoryName("hair"), "Characters / Hair");
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
