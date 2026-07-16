/** Canonical ComfyUI image references used by ParameterPanel values. */

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
