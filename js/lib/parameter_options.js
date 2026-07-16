/** Returns whether a parameter option list contains the same value more than once. */
export function hasDuplicateOptions(options) {
	if (!Array.isArray(options)) return false;
	const normalized = options.map(String);
	return new Set(normalized).size !== normalized.length;
}
