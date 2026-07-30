/** Pure value normalization shared by dropdown and segmented enum controls. */

export function normalizeChoiceValue(value, options) {
	const normalized = Array.isArray(options) ? options.map(String) : [];
	const current = String(value ?? "");
	if (!normalized.length) return current;
	return normalized.includes(current) ? current : normalized[0];
}
