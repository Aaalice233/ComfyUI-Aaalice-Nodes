/** Pure state and immutable prompt payload helpers for BooruGalleryNode. */

export const GALLERY_STATE_VERSION = 1;
export const GALLERY_CATEGORIES = ["artist", "copyright", "character", "general", "meta"];
export const DEFAULT_PROMPT_CATEGORIES = ["copyright", "character", "general"];

function strings(value) {
	const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
	return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
}

export function normalizeTagGroups(value = {}) {
	return Object.fromEntries(GALLERY_CATEGORIES.map((category) => [category, strings(value?.[category])]));
}

export function normalizeGallerySelection(value) {
	if (!value || typeof value !== "object") return null;
	const source = String(value.source || "").toLowerCase();
	const postId = String(value.postId ?? "").trim();
	const mediaUrl = String(value.mediaUrl || "");
	if (!source || !postId || !mediaUrl.startsWith("https://")) return null;
	return {
		source, postId,
		postUrl: String(value.postUrl || ""), mediaUrl, previewUrl: String(value.previewUrl || ""),
		fileExt: String(value.fileExt || "").toLowerCase().replace(/^\./, ""),
		width: Math.max(0, Number(value.width) || 0), height: Math.max(0, Number(value.height) || 0), rating: String(value.rating || ""),
		originalTags: normalizeTagGroups(value.originalTags),
		...(value.editedTags && typeof value.editedTags === "object" ? { editedTags: normalizeTagGroups(value.editedTags) } : {}),
	};
}

export function defaultGalleryState(settings = {}) {
	const source = ["danbooru", "gelbooru", "safebooru", "aitag"].includes(settings.defaultSource) ? settings.defaultSource : "danbooru";
	const defaults = settings.promptDefaults || {};
	return {
		version: GALLERY_STATE_VERSION, source, query: "",
		filters: { ratings: strings(settings.defaultRatings?.[source] || (source === "safebooru" ? ["safe"] : source === "aitag" ? [] : ["general"])), sort: source === "aitag" ? "new" : "latest", feed: "search", period: "" },
		navigation: { page: 1 },
		prompt: {
			categories: strings(defaults.categories || DEFAULT_PROMPT_CATEGORIES).filter((item) => GALLERY_CATEGORIES.includes(item)),
			replaceUnderscores: Boolean(defaults.replaceUnderscores), escapeParentheses: Boolean(defaults.escapeParentheses),
			excludedTags: strings(defaults.excludedTags),
		},
		selections: [],
	};
}

export function normalizeGalleryState(value, settings = {}) {
	const fallback = defaultGalleryState(settings);
	if (!value || typeof value !== "object" || value.version !== GALLERY_STATE_VERSION) return fallback;
	const source = ["danbooru", "gelbooru", "safebooru", "aitag"].includes(value.source) ? value.source : fallback.source;
	const seen = new Set(); const selections = [];
	for (const raw of Array.isArray(value.selections) ? value.selections : []) {
		const item = normalizeGallerySelection(raw); if (!item) continue;
		const key = `${item.source}:${item.postId}`; if (seen.has(key)) continue;
		seen.add(key); selections.push(item);
	}
	const categories = strings(value.prompt?.categories).filter((item) => GALLERY_CATEGORIES.includes(item));
	const legacyMonthly = source === "aitag" && value.filters?.sort === "monthly";
	const feed = value.filters?.feed === "favorites" ? "favorites" : value.filters?.feed === "ranking" || legacyMonthly ? "ranking" : "search";
	return {
		version: GALLERY_STATE_VERSION, source, query: String(value.query || ""),
		filters: { ratings: strings(value.filters?.ratings), sort: legacyMonthly ? "new" : String(value.filters?.sort || "latest"), feed,
			period: feed === "ranking" ? String(value.filters?.period || "month") : "" },
		navigation: { page: Math.max(1, Math.floor(Number(value.navigation?.page) || 1)) },
		prompt: { categories, replaceUnderscores: Boolean(value.prompt?.replaceUnderscores),
			escapeParentheses: Boolean(value.prompt?.escapeParentheses), excludedTags: strings(value.prompt?.excludedTags) },
		selections,
	};
}

export function selectionKey(value) { return `${value.source}:${value.postId}`; }

export function finalPrompt(selection, prompt) {
	const groups = selection.editedTags || selection.originalTags || {};
	const categories = new Set(prompt.categories || []); const excluded = new Set(prompt.excludedTags || []);
	const seen = new Set(); const result = [];
	for (const category of GALLERY_CATEGORIES) {
		if (!categories.has(category)) continue;
		for (const tag of groups[category] || []) {
			if (seen.has(tag) || excluded.has(tag)) continue;
			seen.add(tag); let rendered = prompt.replaceUnderscores ? tag.replaceAll("_", " ") : tag;
			if (prompt.escapeParentheses) rendered = rendered.replaceAll("(", "\\(").replaceAll(")", "\\)");
			result.push(rendered);
		}
	}
	return result.join(", ");
}

export function galleryPayload(state) {
	const normalized = normalizeGalleryState(state);
	return { version: 1, prompt: structuredClone(normalized.prompt), selections: normalized.selections.map((item) => structuredClone(item)),
		prompts: normalized.selections.map((item) => finalPrompt(item, normalized.prompt)) };
}

export function selectionFromDetail(detail, editedTags = null) {
	return normalizeGallerySelection({ ...detail, originalTags: detail.tags, ...(editedTags ? { editedTags } : {}) });
}
