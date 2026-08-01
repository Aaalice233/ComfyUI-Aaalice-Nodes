import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installNativeWidgetResizePassthrough } from "../js/lib/native_widget_resize.js";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/node_resize.js", import.meta.url), "utf8");

test("package entry registers resize support only for exact native-widget node types", () => {
	assert.match(extension, /import "\.\/node_resize\.js"/);
	assert.match(source, /name: "ComfyUI\.Aaalice\.NodeResize"/);
	for (const name of ["GroupIsEnabled", "SimpleNotify", "SimpleStringSplit"]) {
		assert.match(source, new RegExp(`NATIVE_WIDGET_NODES[\\s\\S]*"${name}"`));
	}
	assert.match(source, /beforeRegisterNodeDef\(nodeType, nodeData\)/);
	assert.match(source, /if \(!NATIVE_WIDGET_NODES\.has\(nodeData\?\.name\)\) return/);
	assert.match(source, /installNativeWidgetResizePassthrough\(nodeType\)/);
	assert.doesNotMatch(source, /(?:nodeCreated|loadedGraphNode|setup)\s*\(/);
	assert.doesNotMatch(source, /allGraphNodes|\.resizable\s*=/);
});

test("native-widget passthrough releases corners and delegates every other hit", () => {
	class NativeWidgetNode {
		constructor() {
			this.resizable = true;
			this.calls = [];
		}

		findResizeDirection(x, y) {
			return x === 90 && y === 90 ? "SE" : undefined;
		}

		getWidgetOnPos(...args) {
			this.calls.push(args);
			return "widget";
		}
	}

	installNativeWidgetResizePassthrough(NativeWidgetNode);
	const node = new NativeWidgetNode();
	assert.equal(node.getWidgetOnPos(90, 90, true), undefined);
	assert.deepEqual(node.calls, []);
	assert.equal(node.getWidgetOnPos(20, 30, true), "widget");
	assert.deepEqual(node.calls, [[20, 30, true]]);
});

test("native-widget passthrough preserves fixed-size capability and patches once", () => {
	class FixedNode {
		constructor() {
			this.resizable = false;
			this.calls = 0;
		}

		findResizeDirection() { return "SE"; }
		getWidgetOnPos() { this.calls += 1; return "widget"; }
	}

	installNativeWidgetResizePassthrough(FixedNode);
	const wrapped = FixedNode.prototype.getWidgetOnPos;
	installNativeWidgetResizePassthrough(FixedNode);
	assert.equal(FixedNode.prototype.getWidgetOnPos, wrapped);
	const node = new FixedNode();
	assert.equal(node.getWidgetOnPos(90, 90), "widget");
	assert.equal(node.calls, 1);
});
