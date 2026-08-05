import test from "node:test";
import assert from "node:assert/strict";
import { dashboardPageMatchLabels, dashboardPageMatchScore, preferredDashboardPage } from "../js/lib/dashboard_page_matching.js";

const pages = [
	{ id: "groups", name: "🎯组管理" },
	{ id: "latent", name: "🎨潜空间放大参数" },
	{ id: "pixel", name: "🎨像素空间放大参数" },
	{ id: "seedvr", name: "🎨SeedVR2放大参数" },
];

function subgraphNode(title, groupTitle) {
	const node = { title, getTitle: () => title, graph: { _groups: [] } };
	node.graph._groups.push({ title: groupTitle, _nodes: [node] });
	return node;
}

test("selects the matching page instead of the active page", () => {
	const node = subgraphNode("像素空间放大", "【🎨文生图】像素空间放大");
	const selected = preferredDashboardPage(pages, dashboardPageMatchLabels(node), "groups");
	assert.equal(selected.id, "pixel");
	assert.ok(dashboardPageMatchScore("【🎨文生图】像素空间放大", "🎨像素空间放大参数") >= 700);
});

test("keeps the active page when no page is a confident match", () => {
	const node = subgraphNode("提示词选择器", "固定词库");
	const selected = preferredDashboardPage(pages, dashboardPageMatchLabels(node), "groups");
	assert.equal(selected.id, "groups");
});

test("does not confuse a shared suffix with the wrong upscale page", () => {
	const node = subgraphNode("像素空间放大", "【🎨文生图】像素空间放大");
	const selected = preferredDashboardPage([
		{ id: "generic", name: "🎨放大参数" },
		{ id: "latent", name: "🎨潜空间放大参数" },
		{ id: "pixel", name: "🎨像素空间放大参数" },
	], dashboardPageMatchLabels(node), null);
	assert.equal(selected.id, "pixel");
});

test("matches short page cores only when the source label is exact", () => {
	const selected = preferredDashboardPage([{ id: "base", name: "🎨底图参数" }], ["底图"], null);
	assert.equal(selected.id, "base");
});

test("includes ancestor visual-group titles for nested groups", () => {
	const node = { title: "采样器", graph: { _groups: [] } };
	const inner = { title: "像素空间放大", _nodes: [node], recomputeInsideNodes() {} };
	const outer = { title: "【🎨文生图】像素空间放大", _children: new Set([inner]), recomputeInsideNodes() {} };
	node.graph._groups.push(outer, inner);
	const labels = dashboardPageMatchLabels(node);
	assert.deepEqual(labels, ["采样器", "【🎨文生图】像素空间放大", "像素空间放大"]);
	assert.equal(preferredDashboardPage([{ id: "pixel", name: "🎨像素空间放大参数" }], labels, "other").id, "pixel");
});
