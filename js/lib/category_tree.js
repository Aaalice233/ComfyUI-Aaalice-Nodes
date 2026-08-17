/** Derived category-tree index shared by the library and PromptSelector. */

export const UNCATEGORIZED_CATEGORY_ID = "__aaalice_uncategorized__";

function compareCategories(left, right) {
	return (Number(left.position) || 0) - (Number(right.position) || 0)
		|| String(left.name || "").localeCompare(String(right.name || ""))
		|| String(left.id).localeCompare(String(right.id));
}

function categoryId(value) {
	return typeof value === "string" && value ? value : null;
}

export class CategoryTree {
	constructor(categories = [], entries = []) {
		this.categories = Array.isArray(categories) ? categories : [];
		this.byId = new Map();
		this.childrenByParent = new Map();
		for (const category of this.categories) {
			if (!category || typeof category.id !== "string" || !category.id) throw new Error("Category tree contains a category without a valid id");
			if (this.byId.has(category.id)) throw new Error(`Category tree contains duplicate id: ${category.id}`);
			if (category.position !== undefined && (!Number.isInteger(category.position) || category.position < 0)) throw new Error(`Category ${category.id} has an invalid position`);
			if (category.parentId !== null && category.parentId !== undefined && !categoryId(category.parentId)) throw new Error(`Category ${category.id} has an invalid parent`);
			this.byId.set(category.id, category);
		}
		for (const category of this.categories) {
			const parentId = categoryId(category.parentId);
			if (parentId === category.id) throw new Error(`Category ${category.id} cannot be its own parent`);
			if (parentId && !this.byId.has(parentId)) throw new Error(`Category ${category.id} references missing parent ${parentId}`);
			if (!this.childrenByParent.has(parentId)) this.childrenByParent.set(parentId, []);
			this.childrenByParent.get(parentId).push(category);
		}
		for (const siblings of this.childrenByParent.values()) siblings.sort(compareCategories);
		this.roots = [...(this.childrenByParent.get(null) || [])];
		this._validateCycles();
		this.flat = [];
		this.recordById = new Map();
		this._flatten();
		this.setEntries(entries);
	}

	_validateCycles() {
		const complete = new Set();
		for (const category of this.categories) {
			if (complete.has(category.id)) continue;
			const chain = new Set();
			let current = category;
			while (current && !complete.has(current.id)) {
				if (chain.has(current.id)) throw new Error(`Category tree contains a cycle at ${current.id}`);
				chain.add(current.id);
				current = this.byId.get(categoryId(current.parentId));
			}
			for (const id of chain) complete.add(id);
		}
	}

	_flatten() {
		const roots = this.childrenByParent.get(null) || [];
		const stack = roots.slice().reverse().map((category) => ({ category, depth: 0, parentPath: "", exit: false }));
		while (stack.length) {
			const frame = stack.pop();
			const { category } = frame;
			if (frame.exit) {
				this.recordById.get(category.id).end = this.flat.length;
				continue;
			}
			const pathLabel = frame.parentPath ? `${frame.parentPath} / ${category.name}` : category.name;
			const children = this.childrenByParent.get(category.id) || [];
			const record = {
				category,
				id: category.id,
				parentId: categoryId(category.parentId),
				depth: frame.depth,
				pathLabel,
				hasChildren: children.length > 0,
				start: this.flat.length,
				end: this.flat.length + 1,
			};
			this.recordById.set(category.id, record);
			this.flat.push(record);
			stack.push({ ...frame, exit: true });
			for (let index = children.length - 1; index >= 0; index -= 1) {
				stack.push({ category: children[index], depth: frame.depth + 1, parentPath: pathLabel, exit: false });
			}
		}
		if (this.flat.length !== this.categories.length) throw new Error("Category tree could not be flattened");
	}

	matchesCategories(categories = []) {
		if (!Array.isArray(categories) || categories.length !== this.categories.length) return false;
		return categories.every((category) => {
			const current = this.byId.get(category?.id);
			return current && current.name === category.name && current.color === category.color
				&& categoryId(current.parentId) === categoryId(category.parentId)
				&& (Number(current.position) || 0) === (Number(category.position) || 0);
		});
	}

	setEntries(entries = []) {
		this.directCount = new Map();
		this.uncategorizedCount = 0;
		for (const entry of Array.isArray(entries) ? entries : []) {
			if (entry?.categoryId === null) this.uncategorizedCount += 1;
			else if (this.byId.has(entry?.categoryId)) this.directCount.set(entry.categoryId, (this.directCount.get(entry.categoryId) || 0) + 1);
		}
		this.aggregateCount = this.aggregateCounts(this.directCount);
		return this;
	}

	has(id) { return this.byId.has(id); }
	category(id) { return this.byId.get(id) || null; }
	record(id) { return this.recordById.get(id) || null; }
	children(id = null) { return [...(this.childrenByParent.get(categoryId(id)) || [])]; }
	path(id) { return this.record(id)?.pathLabel || ""; }
	depth(id) { return this.record(id)?.depth ?? -1; }
	ancestors(id, { includeSelf = false } = {}) {
		const result = [];
		let current = includeSelf ? this.category(id) : this.category(this.record(id)?.parentId);
		while (current) {
			result.push(current);
			current = this.category(categoryId(current.parentId));
		}
		return result.reverse();
	}
	descendants(id, { includeSelf = false } = {}) {
		const record = this.record(id);
		if (!record) return [];
		const start = includeSelf ? record.start : record.start + 1;
		return this.flat.slice(start, record.end).map((item) => item.category);
	}
	subtreeIds(id) {
		const record = this.record(id);
		return record ? new Set(this.flat.slice(record.start, record.end).map((item) => item.id)) : new Set();
	}
	isInSubtree(categoryIdValue, ancestorId) {
		const category = this.record(categoryIdValue);
		const ancestor = this.record(ancestorId);
		return Boolean(category && ancestor && category.start >= ancestor.start && category.start < ancestor.end);
	}
	aggregateCounts(directCounts = new Map()) {
		const counts = new Map(this.flat.map((record) => [record.id, Number(directCounts.get(record.id)) || 0]));
		if (directCounts.has(null)) counts.set(null, Number(directCounts.get(null)) || 0);
		if (directCounts.has(UNCATEGORIZED_CATEGORY_ID)) counts.set(UNCATEGORIZED_CATEGORY_ID, Number(directCounts.get(UNCATEGORIZED_CATEGORY_ID)) || 0);
		for (let index = this.flat.length - 1; index >= 0; index -= 1) {
			const record = this.flat[index];
			if (record.parentId) counts.set(record.parentId, (counts.get(record.parentId) || 0) + (counts.get(record.id) || 0));
		}
		return counts;
	}
}

export function createCategoryTree(categories, entries) {
	return new CategoryTree(categories, entries);
}
