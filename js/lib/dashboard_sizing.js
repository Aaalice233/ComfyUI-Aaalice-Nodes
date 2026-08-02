/** Dashboard integer-grid sizing and semantic control defaults. */

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

// These are recommended starting heights, not a whitelist of valid row spans.
export const DASHBOARD_DEFAULT_CONTROL_ROW_SPAN = 13;
export const DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN = DASHBOARD_DEFAULT_CONTROL_ROW_SPAN;
export const DASHBOARD_STANDARD_CONTROL_ROW_SPAN = 18;
export const DASHBOARD_MARKDOWN_ROW_SPAN = 28;

function boundedInteger(value, { minimum = 1, maximum = Number.POSITIVE_INFINITY, fallback = minimum } = {}) {
	const lower = Math.max(1, Math.ceil(Number(minimum) || 1));
	const upperValue = Number(maximum);
	const upper = Number.isFinite(upperValue) ? Math.max(lower, Math.floor(upperValue)) : Number.POSITIVE_INFINITY;
	const numeric = value == null ? Number.NaN : Number(value);
	const fallbackValue = Number(fallback);
	const rounded = Number.isFinite(numeric) ? Math.round(numeric) : Number.isFinite(fallbackValue) ? Math.round(fallbackValue) : lower;
	return Math.max(lower, Math.min(upper, rounded));
}

export function normalizeDashboardColumnSpan(value, options = {}) {
	return boundedInteger(value, {
		minimum: options.minimum ?? DASHBOARD_MIN_CONTROL_COLUMN_SPAN,
		maximum: options.maximum ?? DASHBOARD_GRID_COLUMNS,
		fallback: options.fallback ?? DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN,
	});
}

export function normalizeDashboardRowSpan(value, options = {}) {
	return boundedInteger(value, {
		minimum: options.minimum ?? DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
		maximum: options.maximum,
		fallback: options.fallback ?? DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
	});
}

/** Pointer resizing snaps to the nearest integer grid span. */
export function snapDashboardColumnSpan(value, options = {}) {
	return normalizeDashboardColumnSpan(value, options);
}

export function snapDashboardRowSpan(value, options = {}) {
	return normalizeDashboardRowSpan(value, options);
}

export function nextDashboardColumnSpan(value, direction, options = {}) {
	const current = snapDashboardColumnSpan(value, options);
	return snapDashboardColumnSpan(current + Math.trunc(Number(direction) || 0), { ...options, fallback: current });
}

export function nextDashboardRowSpan(value, direction, options = {}) {
	const current = snapDashboardRowSpan(value, options);
	return snapDashboardRowSpan(current + Math.trunc(Number(direction) || 0), { ...options, fallback: current });
}

/** Narrow sidebars project the twelve-column grid into one reading column. */
export function dashboardColumnsForWidth(width) {
	return width && width < DASHBOARD_SINGLE_COLUMN_MAX_WIDTH ? 1 : DASHBOARD_GRID_COLUMNS;
}

export function dashboardCardHeight(rowSpan) {
	return (rowSpan * DASHBOARD_GRID_TRACK_HEIGHT) + ((rowSpan - 1) * DASHBOARD_GRID_TRACK_GAP) - (DASHBOARD_CARD_GAP - DASHBOARD_GRID_TRACK_GAP);
}

/** Calculate a transient content footprint without changing the persisted layout. */
export function dashboardContentRowSpan(contentHeight, { minimum = 1 } = {}) {
	const lower = Math.max(1, Math.ceil(Number(minimum) || 1));
	const height = Number(contentHeight);
	if (!Number.isFinite(height)) return lower;
	const required = Math.ceil((Math.max(0, height) + DASHBOARD_CARD_GAP) / (DASHBOARD_GRID_TRACK_HEIGHT + DASHBOARD_GRID_TRACK_GAP));
	return Math.max(lower, required);
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
