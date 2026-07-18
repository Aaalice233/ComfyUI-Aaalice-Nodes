import test from "node:test";
import assert from "node:assert/strict";

import { installNodeControlMenu } from "../js/lib/node_control_menu.js";
import { listAdaptedWidgetControls } from "../js/lib/widget_control_adapters.js";

test("control menu discovers widgets when the menu opens, not when the node is created", () => {
	const node = { properties: {}, widgets: [], isSubgraphNode: () => false };
	let opened = null;
	assert.equal(installNodeControlMenu(node, {
		label: "Add controls",
		listControls: (candidate) => listAdaptedWidgetControls(candidate),
		openControls: (candidate) => { opened = candidate; },
	}), true);

	const beforeWidgets = [];
	node.getExtraMenuOptions(null, beforeWidgets);
	assert.deepEqual(beforeWidgets, []);

	node.widgets.push({ name: "value", type: "INT", value: 0, options: {} });
	const afterWidgets = [];
	node.getExtraMenuOptions(null, afterWidgets);
	assert.equal(afterWidgets.length, 1);
	afterWidgets[0].callback();
	assert.equal(opened, node);
});

test("control menu exposes non-serializing public subgraph widget views", () => {
	const node = {
		properties: {},
		isSubgraphNode: () => true,
		widgets: [{ name: "value", type: "INT", value: 0, options: {}, serialize: false, sourceNodeId: "4", sourceWidgetName: "value" }],
	};
	installNodeControlMenu(node, {
		label: "Add controls",
		listControls: (candidate) => listAdaptedWidgetControls(candidate, { promoted: true }),
		openControls: () => {},
	});
	const options = [];
	node.getExtraMenuOptions(null, options);
	assert.equal(options[0].content, "Add controls");
});

test("control menu composes with existing node options and installs only once", () => {
	const existing = { content: "Existing" };
	const node = { getExtraMenuOptions: () => [existing] };
	const config = { label: "Add controls", listControls: () => [{}], openControls: () => {} };
	assert.equal(installNodeControlMenu(node, config), true);
	assert.equal(installNodeControlMenu(node, config), false);
	const options = node.getExtraMenuOptions(null, []);
	assert.equal(options[0], existing);
	assert.equal(options[1].content, "Add controls");
	assert.equal(typeof options[1].callback, "function");
});
