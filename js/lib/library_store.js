/** Event-driven prompt-library client store. */

import { api } from "../../../scripts/api.js";
import { LibraryIndex } from "./library_index.js";

const ENDPOINT = "/aaalice/prompt-library";

async function checked(response) {
	if (response?.ok) return response;
	let detail = "";
	try { detail = (await response.json())?.message || ""; } catch { /* keep status */ }
	throw new Error(detail || `Prompt library request failed (${response?.status || "unknown"})`);
}

export class PromptLibraryStore extends EventTarget {
	constructor() {
		super();
		this.snapshot = { version: 2, categories: [], collections: [], tags: [], entries: [] };
		this.index = new LibraryIndex(this.snapshot);
		this.loading = false;
		this.loaded = false;
		this.loadPromise = null;
		this.onServerChange = () => { void this.refresh(); };
		api.addEventListener("aaalice.prompt_library.changed", this.onServerChange);
	}

	async refresh() {
		if (this.loadPromise) return this.loadPromise;
		this.loading = true;
		this.loadPromise = (async () => {
			const response = await checked(await api.fetchApi(`${ENDPOINT}/snapshot`));
			const snapshot = await response.json();
			const categoryTree = this.index.categoryTree;
			this.snapshot = snapshot;
			this.index = new LibraryIndex(snapshot, categoryTree);
			this.loaded = true;
			this.dispatchEvent(new CustomEvent("change", { detail: this.snapshot }));
			return this.snapshot;
		})().finally(() => { this.loading = false; this.loadPromise = null; });
		return this.loadPromise;
	}

	filterEntries(filters = {}) { return this.index.filter(filters); }
	category(id) { return this.index.category(id); }
	categoryName(id) { return this.index.categoryName(id); }
	categoryPath(id) { return this.index.categoryPath(id); }
	categoryRecords() { return this.index.categoryRecords(); }
	categoryDirectCount(id) { return this.index.categoryDirectCount(id); }
	collectionItems(memberships) { return this.index.collectionItems(memberships); }
	collectionNames(memberships) { return this.index.collectionNames(memberships); }
	tagNames(ids) { return this.index.tagNames(ids); }
	usage(kind, id) { return this.index.usage(kind, id); }

	async json(path, { method = "POST", body = {} } = {}) {
		const response = await checked(await api.fetchApi(`${ENDPOINT}${path}`, {
			method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
		}));
		const result = response.status === 204 ? null : await response.json();
		await this.refresh();
		return result;
	}

	createEntry(data) { return this.json("/entries", { body: data }); }
	updateEntry(id, data) { return this.json(`/entries/${encodeURIComponent(id)}`, { method: "PATCH", body: data }); }
	deleteEntry(id) { return this.json(`/entries/${encodeURIComponent(id)}`, { method: "DELETE" }); }
	batchEntries(data) { return this.json("/entries/batch", { body: data }); }
	deleteEntries(entryIds) { return this.json("/entries/batch-delete", { body: { entryIds } }); }
	recordUsage(entryIds) { return this.json("/entries/usage", { body: { entryIds } }); }
	reorder(data) { return this.json("/reorder", { body: data }); }
	createCategory(data) { return this.json("/categories", { body: data }); }
	updateCategory(id, data) { return this.json(`/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: data }); }
	moveCategory(id, { parentId = null, index } = {}) { return this.json(`/categories/${encodeURIComponent(id)}/move`, { body: { parentId, index } }); }
	deleteCategory(id, { deleteDescendants = false } = {}) {
		const query = deleteDescendants ? "?deleteDescendants=true" : "";
		return this.json(`/categories/${encodeURIComponent(id)}${query}`, { method: "DELETE" });
	}
	createCollection(data) { return this.json("/collections", { body: data }); }
	updateCollection(id, data) { return this.json(`/collections/${encodeURIComponent(id)}`, { method: "PATCH", body: data }); }
	deleteCollection(id) { return this.json(`/collections/${encodeURIComponent(id)}`, { method: "DELETE" }); }

	async uploadPreview(id, file) {
		const body = new FormData(); body.append("file", file);
		const response = await checked(await api.fetchApi(`${ENDPOINT}/entries/${encodeURIComponent(id)}/preview`, { method: "POST", body }));
		const result = await response.json(); await this.refresh(); return result;
	}
	deletePreview(id) { return this.json(`/entries/${encodeURIComponent(id)}/preview`, { method: "DELETE" }); }

	async exportArchive(filter = {}, { signal } = {}) {
		const response = await checked(await api.fetchApi(`${ENDPOINT}/export`, {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filter), signal,
		}));
		const result = await response.json();
		return { ...result, url: api.apiURL(`${ENDPOINT}/export/${encodeURIComponent(result.token)}`) };
	}

	async importPreflight(file, { signal } = {}) {
		const body = new FormData(); body.append("file", file);
		const response = await checked(await api.fetchApi(`${ENDPOINT}/import/preflight`, { method: "POST", body, signal }));
		return response.json();
	}

	async importApply(token, resolutions = {}, { signal } = {}) {
		const response = await checked(await api.fetchApi(`${ENDPOINT}/import/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, resolutions }), signal }));
		const result = await response.json(); await this.refresh(); return result;
	}

	async discardImport(token) {
		if (!token) return;
		await checked(await api.fetchApi(`${ENDPOINT}/import/discard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }));
	}

	destroy() { api.removeEventListener("aaalice.prompt_library.changed", this.onServerChange); }
}

export const promptLibraryStore = new PromptLibraryStore();
