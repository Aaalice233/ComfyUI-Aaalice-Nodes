/** Pure value normalization shared by dropdown and segmented enum controls. */

export function normalizeChoiceValue(value, options, { preserveInvalid = false } = {}) {
	const normalized = Array.isArray(options) ? options.map(String) : [];
	const current = String(value ?? "");
	if (!normalized.length) return current;
	if (normalized.includes(current) || (preserveInvalid && current)) return current;
	return normalized[0];
}
