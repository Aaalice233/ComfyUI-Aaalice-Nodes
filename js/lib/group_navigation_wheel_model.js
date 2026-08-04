export const GROUP_NAVIGATION_WHEEL_PAGE_SIZE = 8;
export const GROUP_NAVIGATION_WHEEL_DEAD_ZONE = 46;
const FULL_TURN = Math.PI * 2;
const DEFAULT_START_ANGLE = -Math.PI / 2;

export function wheelPage(entries, pageIndex = 0, pageSize = GROUP_NAVIGATION_WHEEL_PAGE_SIZE) {
	const source = Array.isArray(entries) ? entries : [];
	const size = normalizePageSize(pageSize);
	const totalPages = Math.max(1, Math.ceil(source.length / size));
	const numericPage = Number(pageIndex);
	const index = Number.isFinite(numericPage) ? Math.max(0, Math.min(totalPages - 1, Math.trunc(numericPage))) : 0;
	return {
		index,
		totalPages,
		items: source.slice(index * size, (index + 1) * size),
		hasPrevious: index > 0,
		hasNext: index < totalPages - 1,
	};
}

export function wheelPages(entries, pageSize = GROUP_NAVIGATION_WHEEL_PAGE_SIZE) {
	const source = Array.isArray(entries) ? entries : [];
	const size = normalizePageSize(pageSize);
	const totalPages = Math.max(1, Math.ceil(source.length / size));
	return Array.from({ length: totalPages }, (_, index) => wheelPage(source, index, size));
}

export function wheelSectorIndex(dx, dy, count, options = {}) {
	const sectorCount = Number(count);
	if (!Number.isFinite(sectorCount) || sectorCount < 1) return null;
	const distance = Math.hypot(Number(dx), Number(dy));
	const deadZone = Number(options.deadZone ?? GROUP_NAVIGATION_WHEEL_DEAD_ZONE);
	if (!Number.isFinite(distance) || distance < Math.max(0, deadZone)) return null;
	const startAngle = Number(options.startAngle ?? DEFAULT_START_ANGLE);
	const clockwise = options.clockwise !== false;
	const angle = Math.atan2(Number(dy), Number(dx));
	let relative = (angle - startAngle) / FULL_TURN;
	if (!clockwise) relative = -relative;
	relative = ((relative % 1) + 1) % 1;
	return Math.floor(relative * sectorCount + 0.5) % sectorCount;
}

export function wheelSectorAngle(index, count, options = {}) {
	const sectorCount = Number(count);
	if (!Number.isFinite(sectorCount) || sectorCount < 1) return null;
	const numericIndex = Number(index);
	if (!Number.isFinite(numericIndex)) return null;
	const startAngle = Number(options.startAngle ?? DEFAULT_START_ANGLE);
	const clockwise = options.clockwise !== false;
	const angle = startAngle + (clockwise ? 1 : -1) * ((numericIndex + 0.5) * FULL_TURN) / sectorCount;
	return angle;
}

export function cycleWheelIndex(currentIndex, direction, items) {
	const source = Array.isArray(items) ? items : [];
	const step = Number(direction) < 0 ? -1 : 1;
	const selectable = (item) => item && item.selectable !== false;
	const start = Number.isInteger(currentIndex) ? currentIndex : step > 0 ? -1 : source.length;
	for (let distance = 1; distance <= source.length; distance += 1) {
		const index = (start + step * distance + source.length) % source.length;
		if (selectable(source[index])) return index;
	}
	return null;
}

export function pageStep(pageIndex, direction, totalPages) {
	const pages = Number(totalPages);
	if (!Number.isFinite(pages) || pages < 1) return 0;
	const current = Number.isFinite(Number(pageIndex)) ? Math.trunc(Number(pageIndex)) : 0;
	return Math.max(0, Math.min(Math.trunc(pages) - 1, current + (Number(direction) < 0 ? -1 : 1)));
}

export function clampWheelCenter(point, viewport, radius, margin = 18) {
	const width = Math.max(0, Number(viewport?.width));
	const height = Math.max(0, Number(viewport?.height));
	const safeRadius = Math.max(0, Number(radius) || 0);
	const safeMargin = Math.max(0, Number(margin) || 0);
	const x = Number.isFinite(Number(point?.x)) ? Number(point.x) : width / 2;
	const y = Number.isFinite(Number(point?.y)) ? Number(point.y) : height / 2;
	return {
		x: clamp(x, safeRadius + safeMargin, Math.max(safeRadius + safeMargin, width - safeRadius - safeMargin)),
		y: clamp(y, safeRadius + safeMargin, Math.max(safeRadius + safeMargin, height - safeRadius - safeMargin)),
	};
}

function normalizePageSize(value) {
	const size = Number(value);
	if (!Number.isFinite(size) || size < 1) return GROUP_NAVIGATION_WHEEL_PAGE_SIZE;
	return Math.trunc(size);
}

function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}
