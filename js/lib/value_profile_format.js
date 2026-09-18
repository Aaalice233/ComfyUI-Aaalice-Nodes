/**
 * Formatting and human-readable summarization for value profile payloads,
 * presets, diffs, and duplicate preview cards.
 */

import { decodeSeedPresetEntry } from "./seed_preset.js";

function cleanLoraName(name) {
	const file = String(name || "").split(/[\\/]/).pop() || "LoRA";
	return file.replace(/\.(safetensors|pt|ckpt|bin)$/i, "");
}

export function formatBooruGalleryPayload(payload, { t = null, format = "summary" } = {}) {
	if (!payload || typeof payload !== "object") return null;
	const state = (payload.state && typeof payload.state === "object")
		? payload.state
		: (payload.value && typeof payload.value === "object")
			? payload.value
			: payload;
	if (!state || typeof state !== "object" || typeof state.source !== "string") return null;

	const sourceRaw = state.source.toLowerCase();
	const sourceName = sourceRaw === "aitag" ? "AITag" : sourceRaw.charAt(0).toUpperCase() + sourceRaw.slice(1);
	const query = String(state.query || "").trim();
	const selections = Array.isArray(state.selections) ? state.selections : [];

	if (format === "tooltip") {
		const lines = [`${sourceName}${query ? ` · "${query}"` : ""}`];
		if (selections.length > 0) {
			const selCount = t ? t("aaalice.workspace.valueProfiles.gallerySelections", "{count} selected").replace("{count}", String(selections.length)) : `${selections.length} selected`;
			lines.push(selCount);
			for (const item of selections.slice(0, 5)) {
				if (item && item.postId) lines.push(`  • #${item.postId}`);
			}
			if (selections.length > 5) lines.push(`  • … (+${selections.length - 5})`);
		}
		return lines.join("\n");
	}

	const parts = [sourceName];
	if (query) {
		parts.push(`"${query}"`);
	} else if (state.filters?.feed && state.filters.feed !== "search") {
		parts.push(state.filters.feed.charAt(0).toUpperCase() + state.filters.feed.slice(1));
	}
	if (selections.length > 0) {
		const selCount = t ? t("aaalice.workspace.valueProfiles.gallerySelections", "{count} selected").replace("{count}", String(selections.length)) : `${selections.length} selected`;
		parts.push(selCount);
	}
	return parts.join(" · ");
}

export function formatLoraListPayload(payload, { t = null, format = "summary" } = {}) {
	const list = Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : null;
	if (!list) return null;
	const isLoraList = list.length === 0 || list.some((item) => item && typeof item === "object" && ("name" in item || "strength" in item || "active" in item));
	if (!isLoraList) return null;

	if (list.length === 0) {
		return t ? t("aaalice.workspace.valueProfiles.loraEmpty", "0 LoRAs") : "0 LoRAs";
	}

	const total = list.length;
	const active = list.filter((item) => item && item.active !== false).length;
	const offLabel = t ? t("aaalice.workspace.valueProfiles.off", "Off") : "Off";
	const onLabel = t ? t("aaalice.workspace.valueProfiles.on", "On") : "On";

	if (format === "tooltip") {
		const header = t ? t("aaalice.loraList.activeSummary", "{active}/{total} enabled").replace("{active}", String(active)).replace("{total}", String(total)) : `${active}/${total} enabled`;
		const lines = [header];
		for (const item of list) {
			const name = cleanLoraName(item?.name);
			const str = Number(item?.strength);
			const clip = Number(item?.clipStrength);
			const strText = Number.isFinite(str) ? str.toFixed(2) : "1.00";
			const clipText = Number.isFinite(clip) && clip !== str ? ` / clip: ${clip.toFixed(2)}` : "";
			const stateText = item?.active === false ? ` [${offLabel}]` : ` [${onLabel}]`;
			lines.push(`  • ${name}: ${strText}${clipText}${stateText}`);
		}
		return lines.join("\n");
	}

	if (total <= 2) {
		return list.map((item) => {
			const name = cleanLoraName(item?.name);
			const str = Number(item?.strength);
			const strPart = Number.isFinite(str) ? ` (${str.toFixed(2).replace(/\.?0+$/, "")})` : "";
			const offPart = item?.active === false ? ` [${offLabel}]` : "";
			return `${name}${strPart}${offPart}`;
		}).join(", ");
	}

	const activeSummary = t ? t("aaalice.loraList.activeSummary", "{active}/{total} enabled").replace("{active}", String(active)).replace("{total}", String(total)) : `${active}/${total} enabled`;
	const sampleNames = list.slice(0, 2).map((item) => cleanLoraName(item?.name)).join(", ");
	return `${activeSummary} · ${sampleNames}…`;
}

export function formatResolutionPayload(payload) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
	const res = (payload.value && typeof payload.value === "object") ? payload.value : payload;
	if (Number.isFinite(res.width) && Number.isFinite(res.height) && !("source" in res)) {
		return `${res.width} × ${res.height}`;
	}
	return null;
}

export function formatPromptSelectorPayload(payload, { t = null } = {}) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
	const ps = (payload.value && typeof payload.value === "object") ? payload.value : payload;
	if (Array.isArray(ps.selections) && !("source" in ps)) {
		return t ? t("aaalice.workspace.valueProfiles.promptsSelected", "{count} selected").replace("{count}", String(ps.selections.length)) : `${ps.selections.length} selected`;
	}
	return null;
}

function seedBehaviorLabel(mode, t = null) {
	const fallbacks = { fixed: "Fixed", increment: "Increment", decrement: "Decrement", randomize: "Randomize" };
	return t ? t(`aaalice.workspace.valueProfiles.behaviors.${mode}`, fallbacks[mode] || mode) : (fallbacks[mode] || mode);
}

export function formatProfilePayload(payload, { resolved = null, valueType = null, t = null, format = "summary" } = {}) {
	if (payload == null) return "—";
	if (valueType === "quick-group-manager" && Array.isArray(payload.groups)) {
		return t ? t("aaalice.workspace.valueProfiles.editor.groupCount", "{count} groups").replace("{count}", String(payload.groups.length)) : `${payload.groups.length} groups`;
	}

	// 1. Seed
	if (resolved?.kind === "seed" || (typeof payload === "object" && payload !== null && "control_after_generate" in payload)) {
		const decoded = decodeSeedPresetEntry({ valueType, payload });
		return decoded.hasBehavior ? `${decoded.value} · ${seedBehaviorLabel(decoded.behavior, t)}` : String(decoded.value);
	}

	// 2. Boolean
	if (typeof payload === "boolean") {
		return t ? (payload ? t("aaalice.workspace.valueProfiles.on", "On") : t("aaalice.workspace.valueProfiles.off", "Off")) : (payload ? "On" : "Off");
	}

	// 3. Choice
	if (resolved?.kind === "choice") {
		const options = Array.isArray(resolved?.options?.values) ? resolved.options.values : [];
		const hit = options.find((opt) => (opt && typeof opt === "object" ? String(opt.value) : String(opt)) === String(payload));
		if (hit) return typeof hit === "object" ? String(hit.label ?? hit.value ?? "") : String(hit);
		return String(payload);
	}

	// 4. Number
	if (typeof payload === "number") {
		return String(payload);
	}

	// 5. String
	if (typeof payload === "string") {
		return payload;
	}

	// 6. Booru Gallery
	if (resolved?.kind === "booru-gallery" || valueType === "booru-gallery" || (typeof payload === "object" && ((payload.state && typeof payload.state.source === "string") || typeof payload.source === "string"))) {
		const gallery = formatBooruGalleryPayload(payload, { t, format });
		if (gallery) return gallery;
	}

	// 7. LoRA List
	if (resolved?.kind === "lora-list" || valueType === "lora-list" || Array.isArray(payload) || Array.isArray(payload?.value)) {
		const lora = formatLoraListPayload(payload, { t, format });
		if (lora) return lora;
	}

	// 8. Resolution
	if (resolved?.kind === "resolution" || valueType === "resolution") {
		const resolution = formatResolutionPayload(payload);
		if (resolution) return resolution;
	}

	// 9. Prompt Selector
	if (resolved?.kind === "prompt-selector" || valueType === "prompt-selector") {
		const ps = formatPromptSelectorPayload(payload, { t });
		if (ps) return ps;
	}

	// 10. Generic Object / Array fallback
	if (typeof payload === "object") {
		const directGallery = formatBooruGalleryPayload(payload, { t, format });
		if (directGallery) return directGallery;

		const directLora = formatLoraListPayload(payload, { t, format });
		if (directLora) return directLora;

		const directRes = formatResolutionPayload(payload);
		if (directRes) return directRes;

		const directPs = formatPromptSelectorPayload(payload, { t });
		if (directPs) return directPs;

		if ("value" in payload) return String(payload.value);
		try {
			const str = JSON.stringify(payload);
			return str.length > 50 ? str.slice(0, 47) + "…" : str;
		} catch {
			return "—";
		}
	}

	return String(payload);
}
