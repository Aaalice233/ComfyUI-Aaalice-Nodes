/** Stable Dashboard grid footprints independent from DOM measurements and themes. */

export const DASHBOARD_SEPARATOR_ROW_SPAN = 5;
export const DASHBOARD_GROUP_CHROME_ROW_SPAN = 7;
// The group frame still needs room for its padding when the header is hidden.
export const DASHBOARD_GROUP_FRAME_ROW_SPAN = 3;
export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN = 6;
export const DASHBOARD_MIN_CONTROL_COLUMN_SPAN = 3;
export const DASHBOARD_GRID_TRACK_HEIGHT = 4;
export const DASHBOARD_GRID_TRACK_GAP = 2;
export const DASHBOARD_CARD_GAP = 6;
export const DASHBOARD_SINGLE_COLUMN_MAX_WIDTH = 330;

/**
 * Dashboard card sizes are a small composable vocabulary, not arbitrary pixel
 * measurements. Width and height are independent so new control families can
 * reuse an existing footprint without adding another layout algorithm.
 */
export const DASHBOARD_WIDTH_SIZES = Object.freeze([
	Object.freeze({ id: "quarter", columnSpan: 3 }),
	Object.freeze({ id: "half", columnSpan: 6 }),
	Object.freeze({ id: "three-quarter", columnSpan: 9 }),
	Object.freeze({ id: "full", columnSpan: 12 }),
]);

export const DASHBOARD_HEIGHT_SIZES = Object.freeze([
	Object.freeze({ id: "compact", rowSpan: 13 }),
	Object.freeze({ id: "standard", rowSpan: 18 }),
	Object.freeze({ id: "tall", rowSpan: 28 }),
	Object.freeze({ id: "media", rowSpan: 36 }),
	Object.freeze({ id: "panel", rowSpan: 52 }),
]);

/** All supported width/height pairings; the catalog is the only resize vocabulary. */
export const DASHBOARD_SIZE_CATALOG = Object.freeze(
	DASHBOARD_WIDTH_SIZES.flatMap((width) => DASHBOARD_HEIGHT_SIZES.map((height) => Object.freeze({
		id: `${width.id}-${height.id}`,
		columnSpan: width.columnSpan,
		rowSpan: height.rowSpan,
		width: width.id,
		height: height.id,
	}))),
);

export const DASHBOARD_CONTROL_ROW_SPANS = Object.freeze(DASHBOARD_HEIGHT_SIZES.map(({ rowSpan }) => rowSpan));
export const DASHBOARD_CONTROL_COLUMN_SPANS = Object.freeze(DASHBOARD_WIDTH_SIZES.map(({ columnSpan }) => columnSpan));
export const DASHBOARD_DEFAULT_CONTROL_ROW_SPAN = DASHBOARD_HEIGHT_SIZES[0].rowSpan;
export const DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN = DASHBOARD_DEFAULT_CONTROL_ROW_SPAN;
export const DASHBOARD_STANDARD_CONTROL_ROW_SPAN = DASHBOARD_HEIGHT_SIZES[1].rowSpan;
export const DASHBOARD_MARKDOWN_ROW_SPAN = DASHBOARD_HEIGHT_SIZES[2].rowSpan;
export const DASHBOARD_LARGE_CONTROL_ROW_SPAN = DASHBOARD_HEIGHT_SIZES[3].rowSpan;
export const DASHBOARD_PANEL_CONTROL_ROW_SPAN = DASHBOARD_HEIGHT_SIZES[4].rowSpan;

function boundedCandidates(candidates, minimum = 1, maximum = Number.POSITIVE_INFINITY) {
	return candidates.filter((value) => value >= minimum && value <= maximum);
}

function snapSpan(value, candidates, { minimum = 1, maximum = Number.POSITIVE_INFINITY, fallback, mode = "nearest" } = {}) {
	const allowed = boundedCandidates(candidates, minimum, maximum);
	if (!allowed.length) return fallback ?? Math.max(minimum, Math.min(maximum, candidates[candidates.length - 1]));
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback ?? allowed[0];
	if (mode === "ceil") return allowed.find((candidate) => candidate >= numeric) || allowed[allowed.length - 1];
	return allowed.reduce((best, candidate) => Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, allowed[0]);
}

/** Normalize persisted or provider-supplied footprints without losing content. */
export function normalizeDashboardColumnSpan(value, options = {}) {
	return snapSpan(value, DASHBOARD_CONTROL_COLUMN_SPANS, { ...options, mode: "ceil", fallback: options.fallback ?? DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN });
}

export function normalizeDashboardRowSpan(value, options = {}) {
	return snapSpan(value, DASHBOARD_CONTROL_ROW_SPANS, { ...options, mode: "ceil", fallback: options.fallback ?? DASHBOARD_DEFAULT_CONTROL_ROW_SPAN });
}

/** Snap an interactive resize to the closest supported footprint. */
export function snapDashboardColumnSpan(value, options = {}) {
	return snapSpan(value, DASHBOARD_CONTROL_COLUMN_SPANS, { ...options, fallback: options.fallback ?? DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN });
}

export function snapDashboardRowSpan(value, options = {}) {
	return snapSpan(value, DASHBOARD_CONTROL_ROW_SPANS, { ...options, fallback: options.fallback ?? DASHBOARD_DEFAULT_CONTROL_ROW_SPAN });
}

export function nextDashboardColumnSpan(value, direction, options = {}) {
	const minimum = options.minimum ?? DASHBOARD_MIN_CONTROL_COLUMN_SPAN;
	const maximum = options.maximum ?? DASHBOARD_GRID_COLUMNS;
	const allowed = boundedCandidates(DASHBOARD_CONTROL_COLUMN_SPANS, minimum, maximum);
	if (!allowed.length) return minimum;
	const current = snapDashboardColumnSpan(value, { minimum, maximum });
	const index = allowed.indexOf(current);
	return allowed[Math.max(0, Math.min(allowed.length - 1, index + Math.trunc(direction || 0)))];
}

export function nextDashboardRowSpan(value, direction, options = {}) {
	const minimum = options.minimum ?? DASHBOARD_DEFAULT_CONTROL_ROW_SPAN;
	const maximum = options.maximum ?? Number.POSITIVE_INFINITY;
	const allowed = boundedCandidates(DASHBOARD_CONTROL_ROW_SPANS, minimum, maximum);
	if (!allowed.length) return minimum;
	const current = snapDashboardRowSpan(value, { minimum, maximum });
	const index = allowed.indexOf(current);
	return allowed[Math.max(0, Math.min(allowed.length - 1, index + Math.trunc(direction || 0)))];
}

export function dashboardSizeToken(layout) {
	return DASHBOARD_SIZE_CATALOG.find((size) => size.columnSpan === Number(layout?.columnSpan) && size.rowSpan === Number(layout?.rowSpan)) || null;
}

/** Narrow sidebars project the twelve-column grid into one reading column. */
export function dashboardColumnsForWidth(width) {
	return width && width < DASHBOARD_SINGLE_COLUMN_MAX_WIDTH ? 1 : DASHBOARD_GRID_COLUMNS;
}

export function dashboardCardHeight(rowSpan) {
	return (rowSpan * DASHBOARD_GRID_TRACK_HEIGHT) + ((rowSpan - 1) * DASHBOARD_GRID_TRACK_GAP) - (DASHBOARD_CARD_GAP - DASHBOARD_GRID_TRACK_GAP);
}

export function recommendedControlRowSpan({ value, options = {} } = {}) {
	if (options.multiline) return DASHBOARD_STANDARD_CONTROL_ROW_SPAN;
	return typeof value === "boolean" ? DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN : DASHBOARD_DEFAULT_CONTROL_ROW_SPAN;
}

export function recommendedGroupRowSpan(members = [], includeHeader = true) {
	const chromeRows = includeHeader ? DASHBOARD_GROUP_CHROME_ROW_SPAN : DASHBOARD_GROUP_FRAME_ROW_SPAN;
	const contentRows = members.reduce((extent, item) => Math.max(extent, item.layout.row + item.layout.rowSpan), 0);
	return Math.max(chromeRows, chromeRows + contentRows);
}
