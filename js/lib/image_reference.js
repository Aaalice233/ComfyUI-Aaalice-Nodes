/** Canonical ComfyUI image references used by image controls. */

export function normalizeImageReference(value) {
	if (typeof value === "string") {
		const filename = value.trim();
		return filename ? { filename, subfolder: "", type: "input" } : null;
	}
	if (!value || typeof value !== "object") return null;
	const filename = String(value.filename ?? value.name ?? "").trim();
	if (!filename) return null;
	return {
		filename,
		subfolder: String(value.subfolder ?? ""),
		type: String(value.type || "input"),
	};
}

export function imageReferenceViewPath(value) {
	const reference = normalizeImageReference(value);
	if (!reference) return "";
	return `/view?${new URLSearchParams(reference).toString()}`;
}

export function imageReferenceThumbnailPath(value) {
	const reference = normalizeImageReference(value);
	if (!reference || /\.svg$/i.test(reference.filename)) return imageReferenceViewPath(reference);
	return `/aaalice/image-thumbnail?${new URLSearchParams(reference).toString()}`;
}

/** Convert a ComfyUI image combo value into the real /view reference. */
export function imageComboReference(value, defaultType = "input") {
	const source = String(value ?? "").trim();
	const typeMarker = source.match(/\s*\[(input|output|temp)\]\s*$/i);
	const cleaned = source.replace(/\s*\[(?:input|output|temp)\]\s*$/i, "");
	const slash = cleaned.lastIndexOf("/");
	return {
		filename: slash >= 0 ? cleaned.slice(slash + 1) : cleaned,
		subfolder: slash >= 0 ? cleaned.slice(0, slash) : "",
		type: typeMarker?.[1]?.toLowerCase() || (["input", "output", "temp"].includes(defaultType) ? defaultType : "input"),
	};
}

/** Convert an image reference into ComfyUI's annotated filepath format. */
export function imageReferenceComboValue(value, defaultType = "input") {
	const reference = normalizeImageReference(value);
	if (!reference) return "";
	const fallbackType = ["input", "output", "temp"].includes(defaultType) ? defaultType : "input";
	const type = ["input", "output", "temp"].includes(reference.type) ? reference.type : fallbackType;
	const path = [reference.subfolder, reference.filename].filter(Boolean).join("/");
	// folder_paths.py only treats input/ as implicit. ComfyUI's createAnnotatedPath
	// therefore always annotates output/ and temp/, including on output-folder widgets.
	return type === "input" ? path : `${path} [${type}]`;
}
