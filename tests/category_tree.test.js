import test from "node:test";
import assert from "node:assert/strict";

import { CategoryTree } from "../js/lib/category_tree.js";

const categories = [
	{ id: "hair", name: "Hair", parentId: "female", position: 0 },
	{ id: "male-hair", name: "Hair", parentId: "male", position: 0 },
	{ id: "people", name: "People", parentId: null, position: 0 },
	{ id: "male", name: "Male", parentId: "people", position: 1 },
	{ id: "female", name: "Female", parentId: "people", position: 0 },
];

const entries = [
	{ id: "a", categoryId: "people" },
	{ id: "b", categoryId: "female" },
	{ id: "c", categoryId: "hair" },
	{ id: "d", categoryId: "male-hair" },
	{ id: "e", categoryId: null },
	{ id: "legacy-missing-category" },
];

test("category tree builds stable order, paths, ancestry and aggregate counts", () => {
	const tree = new CategoryTree(categories, entries);
	assert.deepEqual(tree.roots.map((item) => item.id), ["people"]);
	assert.deepEqual(tree.flat.map((item) => item.id), ["people", "female", "hair", "male", "male-hair"]);
	assert.equal(tree.path("hair"), "People / Female / Hair");
	assert.equal(tree.path("male-hair"), "People / Male / Hair");
	assert.equal(tree.depth("hair"), 2);
	assert.deepEqual(tree.ancestors("hair").map((item) => item.id), ["people", "female"]);
	assert.deepEqual(tree.descendants("people").map((item) => item.id), ["female", "hair", "male", "male-hair"]);
	assert.equal(tree.isInSubtree("hair", "female"), true);
	assert.equal(tree.isInSubtree("male-hair", "female"), false);
	assert.equal(tree.aggregateCount.get("people"), 4);
	assert.equal(tree.aggregateCount.get("female"), 2);
	assert.equal(tree.directCount.get("people"), 1);
	assert.equal(tree.uncategorizedCount, 1);
	const selectedCounts = tree.aggregateCounts(new Map([["hair", 2], [null, 1]]));
	assert.equal(selectedCounts.get("people"), 2);
	assert.equal(selectedCounts.get(null), 1);
});

test("category tree rejects missing parents, self parents, duplicate ids and cycles", () => {
	assert.throws(() => new CategoryTree([{ id: "a", name: "A", parentId: "missing" }]), /missing parent/);
	assert.throws(() => new CategoryTree([{ id: "a", name: "A", parentId: "a" }]), /own parent/);
	assert.throws(() => new CategoryTree([{ id: "a", name: "A" }, { id: "a", name: "Again" }]), /duplicate id/);
	assert.throws(() => new CategoryTree([{ id: "a", name: "A", position: -1 }]), /invalid position/);
	assert.throws(() => new CategoryTree([{ id: "a", name: "A", parentId: 42 }]), /invalid parent/);
	assert.throws(() => new CategoryTree([
		{ id: "a", name: "A", parentId: "b" },
		{ id: "b", name: "B", parentId: "a" },
	]), /cycle/);
});
