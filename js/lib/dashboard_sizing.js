/** Stable Dashboard grid footprints independent from DOM measurements and themes. */

export const DASHBOARD_SEPARATOR_ROW_SPAN = 5;
export const DASHBOARD_GROUP_CHROME_ROW_SPAN = 7;
export const DASHBOARD_DEFAULT_CONTROL_ROW_SPAN = 12;
export const DASHBOARD_MARKDOWN_ROW_SPAN = 28;
export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN = 6;
export const DASHBOARD_MIN_CONTROL_COLUMN_SPAN = 3;
export const DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN = 7;
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

function finiteOption(options, key) {
	return options?.[key] !== null && options?.[key] !== "" && Number.isFinite(Number(options?.[key]));
}

export function recommendedControlRowSpan({ value, options = {}, paramType = "" } = {}) {
	if (typeof value === "number") {
		const bounded = finiteOption(options, "min") && finiteOption(options, "max") && Number(options.max) > Number(options.min);
		const seedLike = paramType === "seed" || typeof options.control_after_generate === "string";
		return bounded && !seedLike ? 12 : 7;
	}
	if (typeof value === "boolean") return 9;
	return DASHBOARD_DEFAULT_CONTROL_ROW_SPAN;
}

export function recommendedGroupRowSpan(members = []) {
	const contentRows = members.reduce((extent, item) => Math.max(extent, item.layout.row + item.layout.rowSpan), 0);
	return Math.max(DASHBOARD_GROUP_CHROME_ROW_SPAN, DASHBOARD_GROUP_CHROME_ROW_SPAN + contentRows);
}

/** A one-column group must reserve the stacked height of every member. */
export function projectedGroupRowSpan(members = [], columns = DASHBOARD_GRID_COLUMNS) {
	if (columns !== 1) return recommendedGroupRowSpan(members);
	const contentRows = members.reduce((total, item) => total + item.layout.rowSpan, 0);
	return Math.max(DASHBOARD_GROUP_CHROME_ROW_SPAN, DASHBOARD_GROUP_CHROME_ROW_SPAN + contentRows);
}
