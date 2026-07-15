/** Pure geometry helpers for the anchored Operation Panel workspace. */

export const OPERATION_DESIGN_PRESETS = Object.freeze({
	"1440x900": Object.freeze({ width: 1440, height: 900 }),
	"1920x1080": Object.freeze({ width: 1920, height: 1080 }),
});

export const OPERATION_ANCHORS = Object.freeze({
	"top-left": Object.freeze({ x: 0, y: 0, alignX: 0, alignY: 0 }),
	"top-center": Object.freeze({ x: 0.5, y: 0, alignX: 0.5, alignY: 0 }),
	"top-right": Object.freeze({ x: 1, y: 0, alignX: 1, alignY: 0 }),
	"center-left": Object.freeze({ x: 0, y: 0.5, alignX: 0, alignY: 0.5 }),
	center: Object.freeze({ x: 0.5, y: 0.5, alignX: 0.5, alignY: 0.5 }),
	"center-right": Object.freeze({ x: 1, y: 0.5, alignX: 1, alignY: 0.5 }),
	"bottom-left": Object.freeze({ x: 0, y: 1, alignX: 0, alignY: 1 }),
	"bottom-center": Object.freeze({ x: 0.5, y: 1, alignX: 0.5, alignY: 1 }),
	"bottom-right": Object.freeze({ x: 1, y: 1, alignX: 1, alignY: 1 }),
	"stretch-top": Object.freeze({ x: 0, y: 0, alignX: 0, alignY: 0, stretchX: true }),
});

export function snapValue(value, step = 8) {
	const size = Math.max(1, Number(step) || 8);
	return Math.round((Number(value) || 0) / size) * size;
}

export function normalizeFrame(frame = {}) {
	const anchor = OPERATION_ANCHORS[frame.anchor] ? frame.anchor : "top-left";
	const preset = OPERATION_ANCHORS[anchor];
	return {
		anchor,
		alignX: Number.isFinite(Number(frame.alignX)) ? Number(frame.alignX) : preset.alignX,
		alignY: Number.isFinite(Number(frame.alignY)) ? Number(frame.alignY) : preset.alignY,
		x: Number.isFinite(Number(frame.x)) ? Number(frame.x) : 24,
		y: Number.isFinite(Number(frame.y)) ? Number(frame.y) : 24,
		width: Math.max(240, Number(frame.width) || 360),
		right: Math.max(16, Number(frame.right) || 24),
	};
}

export function resolveFrame(frame, viewport, measuredHeight = 0) {
	const value = normalizeFrame(frame);
	const preset = OPERATION_ANCHORS[value.anchor];
	const width = preset.stretchX
		? Math.max(240, Number(viewport.width) - value.x - value.right)
		: value.width;
	return {
		x: preset.x * Number(viewport.width) + value.x - value.alignX * width,
		y: preset.y * Number(viewport.height) + value.y - value.alignY * measuredHeight,
		width,
		height: measuredHeight,
	};
}

export function frameFromRect(rect, anchor, viewport) {
	const key = OPERATION_ANCHORS[anchor] ? anchor : "top-left";
	const preset = OPERATION_ANCHORS[key];
	if (preset.stretchX) {
		return normalizeFrame({
			anchor: key,
			alignX: preset.alignX,
			alignY: preset.alignY,
			x: rect.x,
			y: rect.y,
			width: rect.width,
			right: Math.max(16, Number(viewport.width) - rect.x - rect.width),
		});
	}
	return normalizeFrame({
		anchor: key,
		alignX: preset.alignX,
		alignY: preset.alignY,
		x: rect.x + preset.alignX * rect.width - preset.x * Number(viewport.width),
		y: rect.y + preset.alignY * rect.height - preset.y * Number(viewport.height),
		width: rect.width,
	});
}

export function inferAnchor(rect, viewport) {
	const centerX = rect.x + rect.width / 2;
	const centerY = rect.y + rect.height / 2;
	const column = centerX < viewport.width / 3 ? "left" : centerX > viewport.width * 2 / 3 ? "right" : "center";
	const row = centerY < viewport.height / 3 ? "top" : centerY > viewport.height * 2 / 3 ? "bottom" : "center";
	if (row === "center" && column === "center") return "center";
	return `${row}-${column}`;
}

export function rectsOverlap(a, b, gap = 8) {
	return a.x < b.x + b.width + gap
		&& a.x + a.width + gap > b.x
		&& a.y < b.y + b.height + gap
		&& a.y + a.height + gap > b.y;
}

export function findNearestFreeRect(preferred, occupied, canvasWidth, step = 8) {
	const candidate = { ...preferred };
	const maxX = Math.max(0, Number(canvasWidth) - candidate.width - 24);
	candidate.x = Math.min(maxX, Math.max(24, snapValue(candidate.x, step)));
	candidate.y = Math.max(24, snapValue(candidate.y, step));
	for (let guard = 0; guard < 4096; guard += 1) {
		if (!occupied.some((rect) => rectsOverlap(candidate, rect))) return candidate;
		candidate.x += step;
		if (candidate.x > maxX) {
			candidate.x = 24;
			candidate.y += step;
		}
	}
	throw new Error("Operation Panel could not find a free layout position");
}

export function distributeRects(rects, axis = "x") {
	if (rects.length < 3) return rects.map((rect) => ({ ...rect }));
	const key = axis === "y" ? "y" : "x";
	const size = axis === "y" ? "height" : "width";
	const ordered = rects.map((rect, index) => ({ rect: { ...rect }, index })).sort((a, b) => a.rect[key] - b.rect[key]);
	const first = ordered[0].rect[key];
	const last = ordered.at(-1).rect[key] + ordered.at(-1).rect[size];
	const total = ordered.reduce((sum, item) => sum + item.rect[size], 0);
	const gap = Math.max(0, (last - first - total) / (ordered.length - 1));
	let cursor = first;
	for (const item of ordered) {
		item.rect[key] = cursor;
		cursor += item.rect[size] + gap;
	}
	return ordered.sort((a, b) => a.index - b.index).map((item) => item.rect);
}
