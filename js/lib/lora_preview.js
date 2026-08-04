/** Resolve and cache the local preview endpoint exposed by ComfyUI-Lora-Manager. */

const PREVIEW_CACHE_LIMIT = 64;
const previewCache = new Map();
let apiModulePromise = null;

function normalizedName(name) {
	return String(name ?? "").trim();
}

function getComfyApi() {
	if (!apiModulePromise) apiModulePromise = import("../../../scripts/api.js").then(({ api }) => api);
	return apiModulePromise;
}

function touchCache(key, entry) {
	previewCache.delete(key);
	previewCache.set(key, entry);
	while (previewCache.size > PREVIEW_CACHE_LIMIT) previewCache.delete(previewCache.keys().next().value);
}

export function resolveLoraPreview(name) {
	const key = normalizedName(name);
	if (!key) return Promise.resolve(null);
	const cached = previewCache.get(key);
	if (cached) {
		touchCache(key, cached);
		return cached.promise;
	}

	let request;
	request = getComfyApi().then((api) => {
		const query = new URLSearchParams({ name: key, license_flags: "true" });
		return api.fetchApi(`/lm/loras/preview-url?${query.toString()}`);
	}).then(async (response) => {
		if (response.status === 404) return null;
		if (!response.ok) throw new Error(`LoRA preview request failed with HTTP ${response.status}`);
		const payload = await response.json();
		if (!payload?.success || !payload.preview_url) return null;
		return {
			source: payload.preview_url,
			title: payload.display_name || key,
		};
	}).catch((error) => {
		if (previewCache.get(key)?.promise === request) previewCache.delete(key);
		throw error;
	});
	touchCache(key, { promise: request });
	return request;
}

export function clearLoraPreviewCache() {
	previewCache.clear();
}
