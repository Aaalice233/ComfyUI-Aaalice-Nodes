const CACHEABLE_PREVIEW_EXTENSIONS = new Set(["jpg", "jpeg"]);

export function isCacheableDecodedPreview(url) {
	let parsed;
	try { parsed = new URL(String(url || ""), "https://gallery.local"); }
	catch { return false; }
	if (parsed.pathname.endsWith("/media")) {
		const upstream = parsed.searchParams.get("url");
		if (!upstream) return false;
		try { parsed = new URL(upstream, "https://gallery.local"); }
		catch { return false; }
	}
	const extension = parsed.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
	return CACHEABLE_PREVIEW_EXTENSIONS.has(extension);
}

export function createDecodedImagePool({ maxEntries, maxPixels }) {
	const entries = new Map();
	let pixels = 0;

	const evict = (src, entry) => {
		entry.image.removeAttribute("src");
		entries.delete(src);
		pixels -= entry.pixels;
	};

	const remember = (src, image, width, height) => {
		const imagePixels = Math.max(1, Number(width) || 1) * Math.max(1, Number(height) || 1);
		if (imagePixels > maxPixels) return false;
		const previous = entries.get(src);
		if (previous) evict(src, previous);
		entries.set(src, { image, width, height, pixels: imagePixels });
		pixels += imagePixels;
		while (entries.size > maxEntries || pixels > maxPixels) {
			const oldestSrc = entries.keys().next().value;
			evict(oldestSrc, entries.get(oldestSrc));
		}
		return true;
	};

	const take = (src) => {
		const entry = entries.get(src);
		if (!entry) return null;
		entries.delete(src);
		pixels -= entry.pixels;
		return entry;
	};

	return {
		remember,
		take,
		get size() { return entries.size; },
		get pixels() { return pixels; },
	};
}
