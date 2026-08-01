import test from "node:test";
import assert from "node:assert/strict";

import {
	DASHBOARD_CONTROL_COLUMN_SPANS,
	DASHBOARD_CONTROL_ROW_SPANS,
	DASHBOARD_SIZE_CATALOG,
	DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
	dashboardCardHeight,
	dashboardContentRowSpan,
	dashboardSizeToken,
	nextDashboardColumnSpan,
	nextDashboardRowSpan,
	normalizeDashboardColumnSpan,
	normalizeDashboardRowSpan,
	recommendedControlRowSpan,
	snapDashboardColumnSpan,
	snapDashboardRowSpan,
} from "../js/lib/dashboard_sizing.js";

test("the Dashboard size catalog exposes composable width and height vocabularies", () => {
	assert.deepEqual(DASHBOARD_CONTROL_COLUMN_SPANS, [3, 6, 9, 12]);
	assert.deepEqual(DASHBOARD_CONTROL_ROW_SPANS, [13, 18, 28, 36, 52]);
	assert.equal(DASHBOARD_SIZE_CATALOG.length, 20);
	assert.equal(new Set(DASHBOARD_SIZE_CATALOG.map((size) => size.id)).size, 20);
	assert.deepEqual(dashboardSizeToken({ columnSpan: 6, rowSpan: 18 }), {
		id: "half-standard", columnSpan: 6, rowSpan: 18, width: "half", height: "standard",
	});
});

test("normalization grows legacy footprints to the next supported size", () => {
	assert.equal(normalizeDashboardColumnSpan(1), 3);
	assert.equal(normalizeDashboardColumnSpan(7), 9);
	assert.equal(normalizeDashboardColumnSpan(12), 12);
	assert.equal(normalizeDashboardRowSpan(7), 13);
	assert.equal(normalizeDashboardRowSpan(14), 18);
	assert.equal(normalizeDashboardRowSpan(40), 52);
});

test("interactive resizing moves through the same paired size vocabulary", () => {
	assert.equal(snapDashboardColumnSpan(7), 6);
	assert.equal(snapDashboardRowSpan(15), 13);
	assert.equal(nextDashboardColumnSpan(6, 1), 9);
	assert.equal(nextDashboardColumnSpan(9, -1), 6);
	assert.equal(nextDashboardRowSpan(DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, 1), 18);
	assert.equal(nextDashboardRowSpan(28, 1), 36);
	assert.equal(nextDashboardRowSpan(36, 1), 52);
});

test("control recommendations use the shared compact and standard heights", () => {
	assert.equal(recommendedControlRowSpan({ value: false }), 13);
	assert.equal(recommendedControlRowSpan({ value: "text", options: { multiline: true } }), 18);
});

test("content-sized projections grow past the persisted panel size without changing the catalog", () => {
	assert.equal(dashboardContentRowSpan(dashboardCardHeight(52), { minimum: 52 }), 52);
	assert.equal(dashboardContentRowSpan(dashboardCardHeight(52) + 1, { minimum: 52 }), 53);
	assert.equal(DASHBOARD_CONTROL_ROW_SPANS.at(-1), 52);
});
