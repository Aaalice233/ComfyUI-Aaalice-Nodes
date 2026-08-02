/** Version-tolerant preset payloads for seed values and their after-generate mode. */

export const SEED_AFTER_GENERATE_MODES = Object.freeze(["fixed", "increment", "decrement", "randomize"]);

function payloadValue(entry) {
	const payload = entry?.payload;
	return payload && typeof payload === "object" && !Array.isArray(payload) ? payload.value : payload;
}

export function createSeedPresetPayload(value, behavior = "randomize") {
	return { value, control_after_generate: String(behavior || "randomize") };
}

export function validateSeedPresetEntry(entry, { min = null, max = null, behaviors = SEED_AFTER_GENERATE_MODES } = {}) {
	if (!entry || entry.valueType !== "number") return "type-mismatch";
	const value = payloadValue(entry);
	if (typeof value !== "number" || !Number.isFinite(value)) return "invalid-number";
	if (!Number.isInteger(value)) return "invalid-integer";
	if (min !== null && min !== "" && Number.isFinite(Number(min)) && value < Number(min)) return "below-minimum";
	if (max !== null && max !== "" && Number.isFinite(Number(max)) && value > Number(max)) return "above-maximum";
	const payload = entry.payload;
	if (payload && typeof payload === "object" && !Array.isArray(payload)) {
		const behavior = payload.control_after_generate;
		if (typeof behavior !== "string" || !behaviors.includes(behavior)) return "invalid-seed-behavior";
	}
	return true;
}

export function decodeSeedPresetEntry(entry, currentBehavior = "randomize") {
	const payload = entry?.payload;
	if (payload && typeof payload === "object" && !Array.isArray(payload)) {
		return { value: payload.value, behavior: payload.control_after_generate, hasBehavior: true };
	}
	return { value: payload, behavior: currentBehavior, hasBehavior: false };
}
