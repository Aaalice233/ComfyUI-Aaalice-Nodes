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

function rectangleContains(outer, rect) {
	return rect.left >= outer.left && rect.right <= outer.right && rect.top >= outer.top && rect.bottom <= outer.bottom;
}

export function containedSelectionIds(entries, rectangle) {
	return new Set(entries.filter((entry) => rectangleContains(rectangle, entry.rect)).map((entry) => entry.id));
}

// 从左往右拖是相交即选，从右往左拖是完全包含才选，与主流设计工具一致。
export function marqueeSelectionIds(entries, rectangle, start, end) {
	const containment = end.x < start.x;
	return { ids: containment ? containedSelectionIds(entries, rectangle) : intersectingSelectionIds(entries, rectangle), containment };
}

// 框选手势只支持并集与减集两种模式，由修饰键在按下时确定。
export function applyMarqueeSelection(base, candidates, mode = "add") {
	const result = new Set(base);
	for (const id of candidates) mode === "subtract" ? result.delete(id) : result.add(id);
	return result;
}

// 点选语义：非加选时清空重选；加选时切换目标项；减选只负责移除。
export function nextClickSelection(current, targetId, { additive = false, subtract = false } = {}) {
	const result = new Set(current);
	if (subtract) { result.delete(targetId); return result; }
	if (!additive && !result.has(targetId)) result.clear();
	if (additive && result.has(targetId)) result.delete(targetId); else result.add(targetId);
	return result;
}

// 键盘方向导航：主轴距离最近者优先，垂直轴偏差作为次级代价。
export function nearestInDirection(entries, currentId, direction) {
	const current = entries.find((entry) => entry.id === currentId);
	if (!current) return null;
	const center = (rect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
	const origin = center(current.rect);
	let best = null; let bestScore = Infinity;
	for (const entry of entries) {
		if (entry.id === currentId) continue;
		const point = center(entry.rect);
		const dx = point.x - origin.x; const dy = point.y - origin.y;
		const primary = direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
		if (primary <= 1) continue;
		const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
		const score = primary + secondary * 2;
		if (score < bestScore) { bestScore = score; best = entry.id; }
	}
	return best;
}
