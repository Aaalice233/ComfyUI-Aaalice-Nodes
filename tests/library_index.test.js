import test from "node:test";
import assert from "node:assert/strict";

import { LibraryIndex } from "../js/lib/library_index.js";

const snapshot = {
	categories: [{ id: "people", name: "People" }],
	collections: [{ id: "favorites", name: "Favorites" }],
	tags: [{ id: "red", name: "Red" }],
	entries: [
		{ id: "a", title: "Red hair", text: "crimson hair", note: "warm", categoryId: "people", tagIds: ["red"], collections: [{ collectionId: "favorites" }] },
		{ id: "b", title: "Blue sky", text: "clear sky", categoryId: null, tagIds: [], collections: [] },
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
