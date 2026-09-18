import test from "node:test";
import assert from "node:assert/strict";
import { dashboardSearchTerms, matchesDashboardSearch, normalizeDashboardSearchQuery, normalizeDashboardSearchText, scoreDashboardOptionSearch } from "../js/lib/dashboard_search.js";

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

test("option search ranking prioritizes direct parameter label match over node title", () => {
	const query = "采样器";
	const exactParamScore = scoreDashboardOptionSearch("采样器", "KSampler", query);
	const prefixParamScore = scoreDashboardOptionSearch("采样器名称", "KSampler", query);
	const unrelatedParamInSamplerNode = scoreDashboardOptionSearch("步数", "KSampler 采样器", query);
	const cfgInSamplerNode = scoreDashboardOptionSearch("cfg", "底模采样器", query);
	const completelyUnrelated = scoreDashboardOptionSearch("提示词", "CLIP 编码器", query);

	assert.equal(exactParamScore, 100);
	assert.equal(prefixParamScore, 80);
	assert.equal(unrelatedParamInSamplerNode, 20);
	assert.equal(cfgInSamplerNode, 20);
	assert.equal(completelyUnrelated, 0);

	assert.ok(exactParamScore > unrelatedParamInSamplerNode);
	assert.ok(prefixParamScore > cfgInSamplerNode);
});

