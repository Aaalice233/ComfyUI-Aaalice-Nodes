/** Pure PromptSelector state model. */

export const PROMPT_SELECTOR_VERSION = 1;

export function normalizePromptSelectorState(raw) {
	const selections = [];
	const seen = new Set();
	for (const item of Array.isArray(raw?.selections) ? raw.selections : []) {
		const entryId = typeof item?.entryId === "string" ? item.entryId : "";
		const weight = Number(item?.weight ?? 1);
		if (!entryId || seen.has(entryId) || !Number.isFinite(weight)) continue;
		seen.add(entryId);
		selections.push({ entryId, weight: Math.round(Math.min(20, Math.max(0, weight)) * 100) / 100 });
	}
	return {
		version: PROMPT_SELECTOR_VERSION,
		selections,
		separator: typeof raw?.separator === "string" ? raw.separator : ", ",
	};
}

export function togglePromptSelection(state, entryId, selected) {
	const next = normalizePromptSelectorState(state);
	const index = next.selections.findIndex((item) => item.entryId === entryId);
	if (selected && index < 0) next.selections.push({ entryId, weight: 1 });
	if (!selected && index >= 0) next.selections.splice(index, 1);
	return next;
}

export function clearPromptSelections(state) {
	const next = normalizePromptSelectorState(state);
	next.selections = [];
	return next;
}

export function countPromptSelectionsByCategory(state, entries) {
	const selectedIds = new Set(normalizePromptSelectorState(state).selections.map((item) => item.entryId));
	const counts = new Map();
	for (const entry of entries || []) {
		if (!selectedIds.has(entry.id)) continue;
		const categoryId = entry.categoryId ?? null;
		counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
	}
	return counts;
}

export function setPromptWeight(state, entryId, weight) {
	const next = normalizePromptSelectorState(state);
	const item = next.selections.find((selection) => selection.entryId === entryId);
	const value = Number(weight);
	if (!item || !Number.isFinite(value) || value < 0 || value > 20) return next;
	item.weight = Math.round(value * 100) / 100;
	return next;
}

export function resolvePromptSelections(state, entries) {
	const byId = new Map((entries || []).map((entry) => [entry.id, entry]));
	return normalizePromptSelectorState(state).selections.map((selection) => ({
		...selection,
		entry: byId.get(selection.entryId) || null,
		missing: !byId.has(selection.entryId),
	}));
}

export function materializePromptPayload(state, entries) {
	const normalized = normalizePromptSelectorState(state);
	return {
		version: PROMPT_SELECTOR_VERSION,
		separator: normalized.separator,
		selections: resolvePromptSelections(normalized, entries).map((item) => ({
			entryId: item.entryId,
			weight: item.weight,
			...(item.entry ? { text: item.entry.text } : {}),
		})),
	};
}
