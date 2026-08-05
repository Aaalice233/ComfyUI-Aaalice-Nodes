/** Pure matching helpers for Dashboard component search. */

export function normalizeDashboardSearchText(value) {
	return String(value || "").normalize("NFKC").toLocaleLowerCase();
}

export function normalizeDashboardSearchQuery(value) {
	return normalizeDashboardSearchText(value).trim();
}

export function dashboardSearchTerms(value) {
	return normalizeDashboardSearchQuery(value).split(/\s+/u).filter(Boolean);
}

export function matchesDashboardSearch(searchText, query) {
	const terms = dashboardSearchTerms(query);
	if (!terms.length) return true;
	const normalizedText = normalizeDashboardSearchText(searchText);
	return terms.every((term) => normalizedText.includes(term));
}
