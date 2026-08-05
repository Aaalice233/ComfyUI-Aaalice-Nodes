import test from "node:test";
import assert from "node:assert/strict";
import { dashboardSearchTerms, matchesDashboardSearch, normalizeDashboardSearchQuery, normalizeDashboardSearchText } from "../js/lib/dashboard_search.js";

test("Dashboard search normalizes full-width text and case without changing the source label", () => {
	assert.equal(normalizeDashboardSearchText("  Ｓａｍｐｌｅｒ  "), "  sampler  ");
	assert.equal(normalizeDashboardSearchQuery("  Ｓａｍｐｌｅｒ  "), "sampler");
	assert.deepEqual(dashboardSearchTerms("  sampler   scheduler "), ["sampler", "scheduler"]);
});

test("Dashboard search matches every query term against the component title", () => {
	assert.equal(matchesDashboardSearch("Sampler · Euler a", "sampler"), true);
	assert.equal(matchesDashboardSearch("Sampler · Euler a", "sampler euler"), true);
	assert.equal(matchesDashboardSearch("Sampler · Euler a", "sampler ddim"), false);
	assert.equal(matchesDashboardSearch("采样器", "采样器"), true);
});

test("an empty Dashboard search query keeps every component visible", () => {
	assert.equal(matchesDashboardSearch("Anything", ""), true);
	assert.equal(matchesDashboardSearch("Anything", "   "), true);
});
