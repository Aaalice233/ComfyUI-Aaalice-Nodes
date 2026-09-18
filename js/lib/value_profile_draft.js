/** A preset edit session never owns a live node or a graph transaction. */
import { createSeedPresetPayload, decodeSeedPresetEntry } from "./seed_preset.js";

export const SHARED_PROFILE_KINDS = Object.freeze(["numeric", "boolean", "choice", "text", "seed", "image-choice", "lora-list"]);

export function createValueProfileDraft({ rule, validate, save, decode = (value) => value, encode = (value) => value }) {
	let payload = structuredClone(rule.payload);
	let destroyed = false;
	const listeners = new Set();
	const commit = (next) => {
		if (destroyed) throw new Error("Preset editor is closed");
		const candidate = structuredClone(next);
		const result = validate?.({ valueType: rule.valueType, payload: candidate });
		if (result?.then || result === false || typeof result === "string" || result?.ok === false) {
			throw new TypeError(typeof result === "string" ? result : "Preset value was rejected");
		}
		const saved = save(structuredClone(candidate));
		if (saved?.then || saved === false || saved?.ok === false) throw new Error("Preset value could not be saved");
		payload = candidate;
		for (const listener of listeners) listener();
	};
	return {
		getPayload: () => structuredClone(payload),
		getValue: () => structuredClone(decode(structuredClone(payload))),
		commitPayload: commit,
		commit: (next) => commit(encode(structuredClone(next), structuredClone(payload))),
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		destroy() { destroyed = true; listeners.clear(); },
	};
}

export function profileValueCodec(resolved, rule) {
	if (resolved.kind === "seed") return {
		decode: (payload) => decodeSeedPresetEntry({ valueType: rule.valueType, payload }).value,
		encode: (value, previous) => createSeedPresetPayload(value, decodeSeedPresetEntry({ valueType: rule.valueType, payload: previous }).behavior),
	};
	const codec = resolved.presetEditor;
	if (codec?.decode && codec?.encode) return codec;
	if (!SHARED_PROFILE_KINDS.includes(resolved.kind)) throw new TypeError(`Preset editor codec is missing: ${resolved.kind}`);
	return {};
}
