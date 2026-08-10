/** Shared serialization for toggleable tag-list values. */

import { stableToneIndexes } from "./control_tones.js";

export function normalizeTagListValue(value) {
	const entries = [];
	const seen = new Set();
	for (const item of Array.isArray(value) ? value : []) {
		const text = String(typeof item === "object" && item !== null ? item.text ?? "" : item).trim();
		if (!text || seen.has(text)) continue;
		seen.add(text);
		entries.push({ text, enabled: typeof item === "object" && item !== null ? item.enabled !== false : true });
	}
	return entries;
}

export function parseTagListValue(value) {
	return String(value ?? "")
		.split(/[,，、\r\n]+/u)
		.map((item) => item.trim())
		.filter(Boolean);
}

export function tagToneIndexes(value, paletteSize = 12) {
	return stableToneIndexes(normalizeTagListValue(value).map((entry) => entry.text), paletteSize);
}
