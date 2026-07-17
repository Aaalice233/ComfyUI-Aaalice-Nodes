/** Stable Dashboard grid footprints independent from DOM measurements and themes. */

export const DASHBOARD_SEPARATOR_ROW_SPAN = 5;
export const DASHBOARD_GROUP_CHROME_ROW_SPAN = 7;
export const DASHBOARD_DEFAULT_CONTROL_ROW_SPAN = 12;

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
