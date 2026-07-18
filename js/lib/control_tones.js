/** Stable, presentation-only tone assignment shared by compact controls. */

export const CONTROL_TONE_COUNT = 12;

export function stableToneIndexes(values, paletteSize = CONTROL_TONE_COUNT) {
	const size = Math.max(1, Math.trunc(Number(paletteSize)) || 1);
	const identities = [...new Set((values || []).map((value) => String(value)))].sort();
	const used = new Set();
	const tones = new Map();
	for (const identity of identities) {
		let hash = 2166136261;
		for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
		let tone = (hash >>> 0) % size;
		if (used.size < size) while (used.has(tone)) tone = (tone + 1) % size;
		used.add(tone);
		tones.set(identity, tone);
	}
	return tones;
}
