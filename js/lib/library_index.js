/** Immutable derived indexes for prompt-library lookup and filtering. */

export class LibraryIndex {
	constructor(snapshot = {}) {
		this.entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
		this.entryById = new Map(this.entries.map((entry) => [entry.id, entry]));
		this.categoryById = new Map((snapshot.categories || []).map((item) => [item.id, item]));
		this.collectionById = new Map((snapshot.collections || []).map((item) => [item.id, item]));
		this.tagById = new Map((snapshot.tags || []).map((item) => [item.id, item]));
		this.searchText = new Map(this.entries.map((entry) => [entry.id, `${entry.title}\n${entry.text}\n${entry.note || ""}`.toLocaleLowerCase()]));
		this.categoryUsage = new Map();
		this.collectionUsage = new Map();
		for (const entry of this.entries) {
			if (entry.categoryId) this.categoryUsage.set(entry.categoryId, (this.categoryUsage.get(entry.categoryId) || 0) + 1);
			for (const membership of entry.collections || []) this.collectionUsage.set(membership.collectionId, (this.collectionUsage.get(membership.collectionId) || 0) + 1);
		}
	}

	filter({ query = "", categoryId = "", collectionId = "", entryIds = null } = {}) {
		const needle = String(query).trim().toLocaleLowerCase();
		const wanted = entryIds ? new Set(entryIds) : null;
		return this.entries.filter((entry) => {
			if (wanted && !wanted.has(entry.id)) return false;
			if (categoryId && entry.categoryId !== categoryId) return false;
			if (collectionId && !(entry.collections || []).some((item) => item.collectionId === collectionId)) return false;
			return !needle || this.searchText.get(entry.id)?.includes(needle);
		});
	}

	categoryName(id) { return this.categoryById.get(id)?.name || ""; }
	collectionNames(memberships = []) { return memberships.map((item) => this.collectionById.get(item.collectionId)?.name).filter(Boolean); }
	tagNames(ids = []) { return ids.map((id) => this.tagById.get(id)?.name).filter(Boolean); }
	usage(kind, id) { return (["category", "categories"].includes(kind) ? this.categoryUsage : this.collectionUsage).get(id) || 0; }
}
