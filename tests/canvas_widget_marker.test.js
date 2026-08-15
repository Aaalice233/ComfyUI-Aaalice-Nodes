import test from "node:test";
import assert from "node:assert/strict";
import { createCanvasWidgetMarkerManager } from "../js/lib/canvas_widget_marker.js";

const COLOR = "#a855f7";

function drawingContext() {
	const strokes = [];
	return {
		strokeStyle: "#000",
		lineWidth: 1,
		save() {},
		restore() {},
		beginPath() {},
		roundRect(...args) { strokes.push({ kind: "roundRect", args }); },
		rect(...args) { strokes.push({ kind: "rect", args }); },
		stroke() { strokes.push({ kind: "stroke", color: this.strokeStyle }); },
		strokes,
	};
}

test("modern canvas widgets use and restore the outline color hook", () => {
	class Widget {
		getOutlineColor() { return "original"; }
	}
	const widget = new Widget();
	const manager = createCanvasWidgetMarkerManager(COLOR);

	assert.equal(manager.sync(new Set([widget])), true);
	assert.equal(widget.getOutlineColor(), COLOR);
	assert.equal(manager.sync(new Set([widget])), false);
	assert.equal(manager.reset(), true);
	assert.equal(widget.getOutlineColor(), "original");
	assert.equal(Object.hasOwn(widget, "getOutlineColor"), false);
});

test("legacy draw widgets receive a direct outline even when they expose an unused color hook", () => {
	const calls = [];
	const widget = {
		getOutlineColor() { return "ignored"; },
		draw(...args) { calls.push(args); return "drawn"; },
	};
	const originalDraw = widget.draw;
	const manager = createCanvasWidgetMarkerManager(COLOR);
	const ctx = drawingContext();

	manager.sync(new Set([widget]));
	assert.equal(widget.draw(ctx, {}, 240, 36, 20, false), "drawn");
	assert.equal(calls.length, 1);
	assert.deepEqual(ctx.strokes.at(-1), { kind: "stroke", color: COLOR });
	assert.deepEqual(ctx.strokes[0], { kind: "roundRect", args: [15, 36, 210, 20, 6] });

	manager.reset();
	assert.equal(widget.draw, originalDraw);
	assert.equal(widget.getOutlineColor(), "ignored");
});

test("marker reconciliation wraps a host replacement and preserves it on cleanup", () => {
	const widget = { draw() { return "first"; } };
	const manager = createCanvasWidgetMarkerManager(COLOR);
	const marked = new Set([widget]);
	manager.sync(marked);

	const replacement = function () { return "replacement"; };
	widget.draw = replacement;
	assert.equal(manager.sync(marked), true);
	assert.notEqual(widget.draw, replacement);
	assert.equal(widget.draw(drawingContext(), {}, 180, 20, 20), "replacement");

	assert.equal(manager.sync(new Set()), true);
	assert.equal(widget.draw, replacement);
	assert.equal(manager.reset(), false);
});
