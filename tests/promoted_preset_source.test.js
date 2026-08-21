import test from "node:test";
import assert from "node:assert/strict";

import { bindingKey } from "../js/lib/dashboard_model.js";
import { compareDashboardPreset } from "../js/lib/dashboard_presets.js";
import { captureDashboardValues } from "../js/lib/dashboard_preset_runtime.js";
import { adaptWidgetControl } from "../js/lib/widget_control_adapters.js";

function numericPromotedBoolean() {
	const sourceWidget = { name: "value", type: "toggle", value: true, options: {} };
	const sourceInput = { name: "value", link: 11 };
	const sourceNode = { id: 4, inputs: [sourceInput], isSubgraphNode: () => false, getWidgetFromSlot: (slot) => slot === sourceInput ? sourceWidget : undefined };
	const projectedWidget = { name: "value", type: "toggle", value: 1, options: {}, widgetId: "graph-1:1:value" };
	const hostInput = { name: "value", widgetId: projectedWidget.widgetId, _widget: projectedWidget, _subgraphSlot: { linkIds: [11] } };
	const host = {
		properties: {}, inputs: [hostInput], widgets: [projectedWidget],
		isSubgraphNode: () => true,
		subgraph: {
			getLink: (id) => id === 11 ? { resolve: () => ({ inputNode: sourceNode }) } : null,
			getNodeById: (id) => id === 4 ? sourceNode : null,
		},
	};
	return { host, projectedWidget, sourceWidget };
}

function dashboard(binding) {
	return { version: 4, pages: [{ id: "page-a", name: "A", gridColumns: 12, tone: null, groups: [], items: [
		{ id: "item-a", kind: "control", binding, label: "", groupId: null, layout: { row: 0, column: 0, columnSpan: 6, rowSpan: 13 } },
	] }] };
}

test("preset capture normalizes a numeric promoted boolean without losing wrapper-local state", () => {
	const { host, projectedWidget, sourceWidget } = numericPromotedBoolean();
	const adapted = adaptWidgetControl(host, projectedWidget, { promoted: true });
	const binding = { provider: "subgraph-widget", hostId: "host-a", controlId: adapted.controlId, valueType: adapted.valueType };
	const model = dashboard(binding);
	const captured = captureDashboardValues(model, () => ({
		status: "ok", readPresetValue: () => adapted.readPresetValue(),
		validatePresetValue: (entry) => typeof entry.payload === "boolean" ? true : "invalid-boolean",
	}));
	const key = bindingKey(binding);
	assert.equal(adapted.value, true);
	assert.equal(adapted.readPresetRepairValue(), true);
	assert.deepEqual(captured.values[key], { valueType: "boolean", payload: true });
	adapted.setValue(false);
	assert.equal(projectedWidget.value, 0);
	assert.equal(adapted.readPresetValue(), false);
	assert.equal(sourceWidget.value, true);
	assert.equal(captured.bindings[0].status, "ok");
	assert.equal(compareDashboardPreset({ dashboard: model, values: captured.values }, { dashboard: model, ...captured }).attention, false);
});
