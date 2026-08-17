import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { addLifecycleDOMWidget, bindDomWidgetWidthToNode } from "../js/lib/dom_widget_lifecycle.js";

test("gives reconstructed DOM widgets distinct Nodes 2.0 renderer keys", () => {
	const calls = [];
	const createNode = () => ({
		addDOMWidget(name, type, element, options) {
			const widget = { name, type, element, options };
			calls.push(widget);
			return widget;
		},
	});
	const elementA = {};
	const elementB = {};
	const options = { serialize: false };

	const first = addLifecycleDOMWidget(createNode(), "aa_widget", "custom", elementA, options);
	const restored = addLifecycleDOMWidget(createNode(), "aa_widget", "custom", elementB, options);

	assert.match(first.type, /^custom__aa_instance_[a-z0-9]+$/);
	assert.match(restored.type, /^custom__aa_instance_[a-z0-9]+$/);
	assert.notEqual(restored.type, first.type);
	assert.equal(first.element, elementA);
	assert.equal(restored.element, elementB);
	assert.equal(calls[0].options, options);
});

test("keeps a Classic DOM widget aligned with its current node width", () => {
	const node = {
		size: [620, 300],
		get width() { return this.size[0]; },
	};
	const element = { style: { width: "" } };
	const widget = { width: 480, element };

	bindDomWidgetWidthToNode(node, widget);
	assert.equal(widget.width, 620);

	node.size[0] = 980;
	assert.equal(widget.width, 980);

	widget.width = 480;
	assert.equal(widget.width, 980);
	assert.equal(element.style.width, "");
});

test("routes every top-level custom node DOM mount through the lifecycle helper", () => {
	const jsDirectory = new URL("../js/", import.meta.url);
	const directMounts = readdirSync(jsDirectory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
		.filter((entry) => /\.addDOMWidget\s*\(/.test(readFileSync(new URL(entry.name, jsDirectory), "utf8")))
		.map((entry) => entry.name);

	assert.deepEqual(directMounts, []);
});

test("top-level node DOM widgets use the host low-quality transform fallback", () => {
	const jsDirectory = new URL("../js/", import.meta.url);
	const widgetModules = readdirSync(jsDirectory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
		.map((entry) => ({ name: entry.name, source: readFileSync(new URL(entry.name, jsDirectory), "utf8") }))
		.filter(({ source }) => /addLifecycleDOMWidget\s*\(/.test(source));

	assert.ok(widgetModules.length > 0);
	for (const { name, source } of widgetModules) {
		assert.doesNotMatch(source, /hideOnZoom:\s*false/, name);
		assert.match(source, /hideOnZoom:\s*true/, name);
	}
});
