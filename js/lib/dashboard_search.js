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

export function scoreDashboardOptionSearch(label, description, query) {
	const terms = dashboardSearchTerms(query);
	if (!terms.length) return 1;
	const normLabel = normalizeDashboardSearchText(label);
	const normDesc = normalizeDashboardSearchText(description);
	const normQuery = normalizeDashboardSearchQuery(query);

	let labelHits = 0;
	let descHits = 0;
	for (const term of terms) {
		const inLabel = normLabel.includes(term);
		const inDesc = normDesc.includes(term);
		if (!inLabel && !inDesc) return 0;
		if (inLabel) labelHits++;
		if (inDesc) descHits++;
	}

	if (labelHits === terms.length) {
		if (normLabel === normQuery) return 100;
		if (normLabel.startsWith(normQuery)) return 80;
		return 60;
	}
	if (labelHits > 0) return 40;
	if (descHits === terms.length) return 20;
	return 10;
}

