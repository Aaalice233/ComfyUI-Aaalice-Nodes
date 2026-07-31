/** Stable Dashboard grid footprints independent from DOM measurements and themes. */

export const DASHBOARD_SEPARATOR_ROW_SPAN = 5;
export const DASHBOARD_GROUP_CHROME_ROW_SPAN = 7;
export const DASHBOARD_DEFAULT_CONTROL_ROW_SPAN = 12;
export const DASHBOARD_MARKDOWN_ROW_SPAN = 28;
export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN = 6;
export const DASHBOARD_MIN_CONTROL_COLUMN_SPAN = 3;
export const DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN = 12;
export const DASHBOARD_GRID_TRACK_HEIGHT = 4;
export const DASHBOARD_GRID_TRACK_GAP = 2;
export const DASHBOARD_CARD_GAP = 6;
export const DASHBOARD_SINGLE_COLUMN_MAX_WIDTH = 330;

/** Narrow sidebars project the twelve-column grid into one reading column. */
export function dashboardColumnsForWidth(width) {
	return width && width < DASHBOARD_SINGLE_COLUMN_MAX_WIDTH ? 1 : DASHBOARD_GRID_COLUMNS;
}

export function dashboardCardHeight(rowSpan) {
	return (rowSpan * DASHBOARD_GRID_TRACK_HEIGHT) + ((rowSpan - 1) * DASHBOARD_GRID_TRACK_GAP) - (DASHBOARD_CARD_GAP - DASHBOARD_GRID_TRACK_GAP);
}

export function recommendedControlRowSpan({ value } = {}) {
	if (typeof value === "number") return DASHBOARD_DEFAULT_CONTROL_ROW_SPAN;
	if (typeof value === "boolean") return DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN;
	return DASHBOARD_DEFAULT_CONTROL_ROW_SPAN;
}

export function recommendedGroupRowSpan(members = [], includeHeader = true) {
	const chromeRows = includeHeader ? DASHBOARD_GROUP_CHROME_ROW_SPAN : 0;
	const contentRows = members.reduce((extent, item) => Math.max(extent, item.layout.row + item.layout.rowSpan), 0);
	return Math.max(includeHeader ? DASHBOARD_GROUP_CHROME_ROW_SPAN : 1, chromeRows + contentRows);
}

/** A one-column group must reserve the stacked height of every member. */
export function projectedGroupRowSpan(members = [], columns = DASHBOARD_GRID_COLUMNS, includeHeader = true) {
	if (columns !== 1) return recommendedGroupRowSpan(members, includeHeader);
	const chromeRows = includeHeader ? DASHBOARD_GROUP_CHROME_ROW_SPAN : 0;
	const contentRows = members.reduce((total, item) => total + item.layout.rowSpan, 0);
	return Math.max(includeHeader ? DASHBOARD_GROUP_CHROME_ROW_SPAN : 1, chromeRows + contentRows);
}
