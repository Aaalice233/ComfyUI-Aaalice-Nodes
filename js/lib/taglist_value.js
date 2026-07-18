/** Shared serialization for ParameterPanel string-list values. */

export function formatTagListValue(value) {
	return Array.isArray(value) ? value.map(String).join("\n") : "";
}

export function parseTagListValue(value) {
	return String(value ?? "")
		.split(/[,，\r\n]+/u)
		.map((item) => item.trim())
		.filter(Boolean);
}
