import test from "node:test";
import assert from "node:assert/strict";

import {
	DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN,
	DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
	dashboardCardHeight,
	dashboardContentRowSpan,
	nextDashboardColumnSpan,
	nextDashboardRowSpan,
	normalizeDashboardColumnSpan,
	normalizeDashboardRowSpan,
	recommendedControlRowSpan,
	snapDashboardColumnSpan,
	snapDashboardRowSpan,
} from "../js/lib/dashboard_sizing.js";

test("normalization preserves arbitrary integer spans inside Dashboard V4 bounds", () => {
	assert.equal(normalizeDashboardColumnSpan(null), DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN);
	assert.equal(normalizeDashboardColumnSpan(undefined), DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN);
	assert.equal(normalizeDashboardColumnSpan(1), 3);
	assert.equal(normalizeDashboardColumnSpan(5), 5);
	assert.equal(normalizeDashboardColumnSpan(7), 7);
	assert.equal(normalizeDashboardColumnSpan(12), 12);
	assert.equal(normalizeDashboardColumnSpan(20), 12);
	assert.equal(normalizeDashboardRowSpan(7), 13);
	assert.equal(normalizeDashboardRowSpan(14), 14);
	assert.equal(normalizeDashboardRowSpan(40), 40);
	assert.equal(normalizeDashboardRowSpan(87), 87);
});

test("pointer sizing snaps to the nearest integer grid unit", () => {
	assert.equal(snapDashboardColumnSpan(7.4), 7);
	assert.equal(snapDashboardColumnSpan(7.6), 8);
	assert.equal(snapDashboardRowSpan(15.4), 15);
	assert.equal(snapDashboardRowSpan(15.6), 16);
	assert.equal(snapDashboardColumnSpan(11.8, { maximum: 10 }), 10);
	assert.equal(snapDashboardRowSpan(14.2, { minimum: 15 }), 15);
});

test("keyboard sizing advances one integer unit and accepts the caller's Shift step", () => {
	assert.equal(nextDashboardColumnSpan(6, 1), 7);
	assert.equal(nextDashboardColumnSpan(9, -1), 8);
	assert.equal(nextDashboardColumnSpan(6, 2), 8);
	assert.equal(nextDashboardRowSpan(DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, 1), 14);
	assert.equal(nextDashboardRowSpan(28, -1), 27);
	assert.equal(nextDashboardRowSpan(36, 2), 38);
});

test("control recommendations remain defaults rather than a size whitelist", () => {
	assert.equal(recommendedControlRowSpan({ value: false }), 13);
	assert.equal(recommendedControlRowSpan({ value: "text", options: { multiline: true } }), 18);
	assert.equal(normalizeDashboardRowSpan(19), 19);
});

test("content-sized projections can grow beyond recommended panel heights", () => {
	assert.equal(dashboardContentRowSpan(dashboardCardHeight(52), { minimum: 52 }), 52);
	assert.equal(dashboardContentRowSpan(dashboardCardHeight(52) + 1, { minimum: 52 }), 53);
	assert.equal(dashboardContentRowSpan(dashboardCardHeight(73), { minimum: 13 }), 73);
});
