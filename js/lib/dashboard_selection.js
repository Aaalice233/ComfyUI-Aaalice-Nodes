/** Pure rectangle-selection geometry for Dashboard layout editing. */

function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}

export function selectionRectangle(start, end, bounds = null) {
	let left = Math.min(start.x, end.x); let right = Math.max(start.x, end.x);
	let top = Math.min(start.y, end.y); let bottom = Math.max(start.y, end.y);
	if (bounds) {
		left = clamp(left, bounds.left, bounds.right); right = clamp(right, bounds.left, bounds.right);
		top = clamp(top, bounds.top, bounds.bottom); bottom = clamp(bottom, bounds.top, bounds.bottom);
	}
	return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function rectanglesIntersect(left, right) {
	return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

export function intersectingSelectionIds(entries, rectangle) {
	return new Set(entries.filter((entry) => rectanglesIntersect(entry.rect, rectangle)).map((entry) => entry.id));
}
