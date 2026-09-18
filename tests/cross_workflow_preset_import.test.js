import test from "node:test";
import assert from "node:assert/strict";
import { bindingKey } from "../js/lib/dashboard_model.js";
import {
	planDashboardPresetApplication,
	planDashboardPresetValueOverwrite,
} from "../js/lib/dashboard_preset_runtime.js";

function makeCard(id, provider, hostId, controlId, valueType, options = {}) {
	return {
		id,
		kind: "control",
		label: options.label || controlId,
		labelOverride: options.labelOverride || null,
		groupId: options.groupId || null,
		binding: { provider, hostId, controlId, valueType },
		layout: { row: 0, column: 0, columnSpan: 12, rowSpan: 8 },
	};
}

test("cross-workflow value recovery matches cards by control name across different hostIds and pages", () => {
	// 源预设来自旧工作流：host_old, 页面名为 "Old Page", 卡片 ID 为 "card_old"
	const sourceBinding = { provider: "generic-widget", hostId: "host_old", controlId: "steps", valueType: "number" };
	const sourceSnapshot = {
		dashboard: {
			version: 4,
			pages: [{
				id: "page_old",
				name: "Old Page",
				gridColumns: 12,
				groups: [],
				items: [makeCard("card_old", "generic-widget", "host_old", "steps", "number", { label: "Steps" })],
			}],
		},
		values: {
			[bindingKey(sourceBinding)]: { valueType: "number", payload: 35 },
		},
	};

	// 目标预设在全新工作流中：host_new, 页面名为 "Main", 卡片 ID 为 "card_new"
	const targetBinding = { provider: "generic-widget", hostId: "host_new", controlId: "steps", valueType: "number" };
	const targetPreset = {
		id: "preset_new",
		name: "New Workflow Preset",
		dashboard: {
			version: 4,
			pages: [{
				id: "page_new",
				name: "Main",
				gridColumns: 12,
				groups: [],
				items: [makeCard("card_new", "generic-widget", "host_new", "steps", "number", { label: "采样步数" })],
			}],
		},
		values: {
			[bindingKey(targetBinding)]: { valueType: "number", payload: 20 },
		},
	};

	const plan = planDashboardPresetValueOverwrite(sourceSnapshot, targetPreset, (binding) => {
		return {
			status: "ok",
			value: 20,
			readPresetValue: () => 20,
			validatePresetValue: () => true,
		};
	});

	// 验证成功通过 control-name 层级配对，并将旧预设值 35 写入新工作流的 host_new
	assert.equal(plan.summary.overwritten, 1);
	assert.equal(plan.summary.recovered, 1);
	assert.equal(plan.entries[0].match, "recovered");
	assert.equal(plan.entries[0].recovery, "control-name");
	assert.equal(plan.merged.values[bindingKey(targetBinding)].payload, 35);
});

test("planDashboardPresetApplication auto-heals relocated hostIds into the dashboard binding", () => {
	const orphanedBinding = { provider: "generic-widget", hostId: "host_lost", controlId: "cfg", valueType: "number" };
	const snapshot = {
		dashboard: {
			version: 4,
			pages: [{
				id: "page_1",
				name: "Page 1",
				gridColumns: 12,
				groups: [],
				items: [makeCard("card_1", "generic-widget", "host_lost", "cfg", "number")],
			}],
		},
		values: {
			[bindingKey(orphanedBinding)]: { valueType: "number", payload: 7.5 },
		},
	};

	// resolve 返回重定位到新节点 host_found
	const plan = planDashboardPresetApplication(snapshot, (binding) => {
		return {
			status: "ok",
			relocatedHostId: "host_found",
			value: 8.0,
			readPresetValue: () => 8.0,
			validatePresetValue: () => true,
		};
	});

	assert.equal(plan.ready.length, 1);
	// 验证 dashboard 中的 binding.hostId 已自动固化为 host_found
	const resolvedItem = plan.dashboard.pages[0].items[0];
	assert.equal(resolvedItem.binding.hostId, "host_found");
});
