/** Pure state and geometry helpers for ResolutionPreset. */

export const ALIGNMENTS = Object.freeze([8, 16, 32, 64]);
export const CANVAS_LIMITS = Object.freeze([2048, 4096, 8192]);
export const MIN_RESOLUTION = 16;
export const MAX_RESOLUTION = 16384;

export const BUILTIN_PRESETS = Object.freeze([
	{ id: "builtin:square-1024", group: "square", name: "1024×1024", width: 1024, height: 1024, alignment: 8 },
	{ id: "builtin:portrait-768x1024", group: "portrait", name: "768×1024", width: 768, height: 1024, alignment: 8 },
	{ id: "builtin:portrait-832x1216", group: "portrait", name: "832×1216", width: 832, height: 1216, alignment: 8 },
	{ id: "builtin:portrait-768x1344", group: "portrait", name: "768×1344", width: 768, height: 1344, alignment: 8 },
	{ id: "builtin:portrait-1024x1536", group: "portrait", name: "1024×1536", width: 1024, height: 1536, alignment: 8 },
	{ id: "builtin:portrait-1080x1920", group: "portrait", name: "1080×1920", width: 1080, height: 1920, alignment: 8 },
	{ id: "builtin:landscape-1024x768", group: "landscape", name: "1024×768", width: 1024, height: 768, alignment: 8 },
	{ id: "builtin:landscape-1216x832", group: "landscape", name: "1216×832", width: 1216, height: 832, alignment: 8 },
	{ id: "builtin:landscape-1344x768", group: "landscape", name: "1344×768", width: 1344, height: 768, alignment: 8 },
	{ id: "builtin:landscape-1536x1024", group: "landscape", name: "1536×1024", width: 1536, height: 1024, alignment: 8 },
	{ id: "builtin:landscape-1920x1080", group: "landscape", name: "1920×1080", width: 1920, height: 1080, alignment: 8 },
]);

function integer(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.round(number) : fallback;
}

export function alignDimension(value, alignment = 8) {
	const unit = ALIGNMENTS.includes(Number(alignment)) ? Number(alignment) : 8;
	const minimum = Math.ceil(MIN_RESOLUTION / unit) * unit;
	const clamped = Math.min(MAX_RESOLUTION, Math.max(minimum, integer(value, minimum)));
	return Math.min(MAX_RESOLUTION, Math.max(minimum, Math.round(clamped / unit) * unit));
}

export function requiredCanvasMax(width, height) {
	const required = Math.max(Number(width) || 0, Number(height) || 0);
	return CANVAS_LIMITS.find((limit) => required <= limit) || CANVAS_LIMITS.at(-1);
}

export function normalizePersonalPresets(value) {
	if (!Array.isArray(value)) return [];
	const seen = new Set();
	return value.flatMap((item) => {
		if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || seen.has(item.id)) return [];
		const alignment = ALIGNMENTS.includes(Number(item.alignment)) ? Number(item.alignment) : 8;
		const width = alignDimension(item.width, alignment);
		const height = alignDimension(item.height, alignment);
		const name = String(item.name || "").trim();
		if (!name) return [];
		seen.add(item.id);
		return [{ id: item.id, group: "personal", name, width, height, alignment }];
	});
}

export function allPresets(personal = []) {
	return [...BUILTIN_PRESETS, ...normalizePersonalPresets(personal)];
}

export function presetMatches(preset, width, height, alignment) {
	return preset?.width === width && preset?.height === height && (preset.group !== "personal" || preset.alignment === alignment);
}

export function matchingPreset(width, height, alignment, presets = BUILTIN_PRESETS) {
	return presets.find((item) => presetMatches(item, width, height, alignment)) || null;
}

export function normalizeResolutionState(value, personal = []) {
	const raw = value && typeof value === "object" && value.version === 1 ? value : {};
	const alignment = ALIGNMENTS.includes(Number(raw.alignment)) ? Number(raw.alignment) : 8;
	const width = alignDimension(raw.width ?? 1024, alignment);
	const height = alignDimension(raw.height ?? 1024, alignment);
	const minimumCanvas = requiredCanvasMax(width, height);
	const requestedCanvas = CANVAS_LIMITS.includes(Number(raw.canvasMax)) ? Number(raw.canvasMax) : 2048;
	const canvasMax = Math.max(minimumCanvas, requestedCanvas);
	const presets = allPresets(personal);
	const hinted = presets.find((item) => item.id === raw.presetId && presetMatches(item, width, height, alignment));
	const matched = hinted || matchingPreset(width, height, alignment, presets);
	return { version: 1, width, height, alignment, canvasMax, presetId: matched?.id || null };
}

export function resolutionPayload(state) {
	const normalized = normalizeResolutionState(state);
	return { version: 1, width: normalized.width, height: normalized.height };
}

export function updateDimensions(state, changes, personal = [], { expandCanvas = true } = {}) {
	const alignment = ALIGNMENTS.includes(Number(changes.alignment)) ? Number(changes.alignment) : state.alignment;
	const width = alignDimension(changes.width ?? state.width, alignment);
	const height = alignDimension(changes.height ?? state.height, alignment);
	const canvasMax = expandCanvas ? Math.max(state.canvasMax, requiredCanvasMax(width, height)) : state.canvasMax;
	const matched = matchingPreset(width, height, alignment, allPresets(personal));
	return { version: 1, width, height, alignment, canvasMax, presetId: matched?.id || null };
}

export function selectPreset(state, preset) {
	const presetAlignment = ALIGNMENTS.includes(Number(preset?.alignment)) ? Number(preset.alignment) : 8;
	const currentAlignmentFits = Number(preset?.width) % state.alignment === 0 && Number(preset?.height) % state.alignment === 0;
	const alignment = preset?.group === "personal" || !currentAlignmentFits ? presetAlignment : state.alignment;
	const width = alignDimension(preset?.width, alignment);
	const height = alignDimension(preset?.height, alignment);
	return { version: 1, width, height, alignment, canvasMax: Math.max(state.canvasMax, requiredCanvasMax(width, height)), presetId: preset?.id || null };
}

export function fitCanvasLimit(state, limit, personal = []) {
	const canvasMax = CANVAS_LIMITS.includes(Number(limit)) ? Number(limit) : state.canvasMax;
	const largestDimension = Math.max(state.width, state.height);
	if (largestDimension <= canvasMax) return { ...state, canvasMax };

	const scale = canvasMax / largestDimension;
	const width = alignDimension(state.width * scale, state.alignment);
	const height = alignDimension(state.height * scale, state.alignment);
	const matched = matchingPreset(width, height, state.alignment, allPresets(personal));
	return { version: 1, width, height, alignment: state.alignment, canvasMax, presetId: matched?.id || null };
}

export function canvasDimensions(state, widthFraction, heightFraction, mode = "both") {
	const minimum = Math.ceil(MIN_RESOLUTION / state.alignment) * state.alignment;
	const span = state.canvasMax - minimum;
	const nextWidth = mode === "height" ? state.width : alignDimension(minimum + Math.min(1, Math.max(0, widthFraction)) * span, state.alignment);
	const nextHeight = mode === "width" ? state.height : alignDimension(minimum + Math.min(1, Math.max(0, heightFraction)) * span, state.alignment);
	return { width: Math.min(state.canvasMax, nextWidth), height: Math.min(state.canvasMax, nextHeight) };
}

export function selectionFractions(state) {
	const minimum = Math.ceil(MIN_RESOLUTION / state.alignment) * state.alignment;
	const span = state.canvasMax - minimum;
	return {
		width: Math.min(1, Math.max(0, (state.width - minimum) / span)),
		height: Math.min(1, Math.max(0, (state.height - minimum) / span)),
	};
}

function gcd(left, right) {
	let a = Math.abs(left); let b = Math.abs(right);
	while (b) [a, b] = [b, a % b];
	return a || 1;
}

export function resolutionSummary(width, height) {
	const divisor = gcd(width, height);
	const megapixels = (width * height) / (1024 * 1024);
	return { ratio: `${width / divisor}:${height / divisor}`, megapixels: `${megapixels.toFixed(megapixels >= 10 ? 1 : 2)} MP` };
}
