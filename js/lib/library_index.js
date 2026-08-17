/** Derived indexes for prompt-library lookup and filtering. */

import { CategoryTree, UNCATEGORIZED_CATEGORY_ID } from "./category_tree.js";

export class LibraryIndex {
	constructor(snapshot = {}, previousCategoryTree = null) {
		this.entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
		this.entryById = new Map(this.entries.map((entry) => [entry.id, entry]));
		const categories = snapshot.categories || [];
		this.categoryTree = previousCategoryTree?.matchesCategories(categories) ? previousCategoryTree.setEntries(this.entries) : new CategoryTree(categories, this.entries);
		this.categoryById = this.categoryTree.byId;
		this.collectionById = new Map((snapshot.collections || []).map((item) => [item.id, item]));
		this.tagById = new Map((snapshot.tags || []).map((item) => [item.id, item]));
		this.searchText = new Map(this.entries.map((entry) => [entry.id, `${entry.title}\n${entry.text}\n${entry.note || ""}`.toLocaleLowerCase()]));
		this.categoryUsage = this.categoryTree.aggregateCount;
		this.categoryDirectUsage = this.categoryTree.directCount;
		this.collectionUsage = new Map();
		for (const entry of this.entries) {
			for (const membership of entry.collections || []) this.collectionUsage.set(membership.collectionId, (this.collectionUsage.get(membership.collectionId) || 0) + 1);
		}
	}

	filter({ query = "", categoryId = "", collectionId = "", entryIds = null, recentFirst = false } = {}) {
		const needle = String(query).trim().toLocaleLowerCase();
		const wanted = entryIds ? new Set(entryIds) : null;
		const matches = this.entries.filter((entry) => {
			if (wanted && !wanted.has(entry.id)) return false;
			if (categoryId === UNCATEGORIZED_CATEGORY_ID && entry.categoryId !== null) return false;
			if (categoryId && categoryId !== UNCATEGORIZED_CATEGORY_ID && this.categoryTree.has(categoryId) && !this.categoryTree.isInSubtree(entry.categoryId, categoryId)) return false;
			if (collectionId && !(entry.collections || []).some((item) => item.collectionId === collectionId)) return false;
			return !needle || this.searchText.get(entry.id)?.includes(needle);
		});
		if (!recentFirst) return matches;
		return matches
			.map((entry, index) => ({ entry, index }))
			.sort((left, right) => (Number(right.entry.lastUsedAt) || 0) - (Number(left.entry.lastUsedAt) || 0) || left.index - right.index)
			.map(({ entry }) => entry);
	}

	category(id) { return this.categoryById.get(id) || null; }
	categoryName(id) { return this.categoryTree.path(id); }
	categoryPath(id) { return this.categoryTree.path(id); }
	categoryRecords() { return this.categoryTree.flat; }
	categoryDirectCount(id) { return this.categoryDirectUsage.get(id) || 0; }
	collectionItems(memberships = []) { return memberships.map((item) => this.collectionById.get(item.collectionId)).filter(Boolean); }
	collectionNames(memberships = []) { return memberships.map((item) => this.collectionById.get(item.collectionId)?.name).filter(Boolean); }
	tagNames(ids = []) { return ids.map((id) => this.tagById.get(id)?.name).filter(Boolean); }
	usage(kind, id) { return (["category", "categories"].includes(kind) ? this.categoryUsage : this.collectionUsage).get(id) || 0; }
}
