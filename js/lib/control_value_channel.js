/** Binding-key value fan-out for mounted Dashboard control views. */

const controlValueViews = new Map();

function normalizedSyncKeys(keys) { return [...new Set((keys || []).map(String).filter(Boolean))]; }

export function registerControlValueView(keys, update) {
	if (typeof update !== "function") return () => {};
	const normalized = normalizedSyncKeys(keys);
	for (const key of normalized) {
		let views = controlValueViews.get(key);
		if (!views) { views = new Set(); controlValueViews.set(key, views); }
		views.add(update);
	}
	return () => {
		for (const key of normalized) {
			const views = controlValueViews.get(key);
			views?.delete(update);
			if (!views?.size) controlValueViews.delete(key);
		}
	};
}

export function updateBoundControlValues(keys, value, detail = {}) {
	const updates = new Set();
	for (const key of normalizedSyncKeys(keys)) for (const update of controlValueViews.get(key) || []) updates.add(update);
	for (const update of updates) update(value, detail);
}
