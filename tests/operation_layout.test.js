import test from "node:test";
import assert from "node:assert/strict";

import {
	commandBarInsets,
	distributeRects,
	expandViewportForFrames,
	findNearestFreeRect,
	frameFromRect,
	inferAnchor,
	rectsOverlap,
	resolveFrame,
	resolveLayoutViewport,
	snapValue,
} from "../js/lib/operation_layout.js";

test("anchor frames round-trip at the design viewport", () => {
	const viewport = { width: 1440, height: 900 };
	const rect = { x: 1040, y: 80, width: 360, height: 220 };
	const frame = frameFromRect(rect, "top-right", viewport);
	assert.deepEqual(resolveFrame(frame, viewport, rect.height), rect);
});

test("right anchors keep their right edge when the viewport grows", () => {
	const frame = frameFromRect({ x: 1040, y: 40, width: 360, height: 100 }, "top-right", { width: 1440, height: 900 });
	const resolved = resolveFrame(frame, { width: 1920, height: 1080 }, 100);
	assert.equal(resolved.x + resolved.width, 1880);
});

test("fixed design sizes are minimum responsive baselines", () => {
	assert.deepEqual(resolveLayoutViewport({ preset: "1440x900" }, { width: 1920, height: 1000 }), { width: 1920, height: 1000 });
	assert.deepEqual(resolveLayoutViewport({ preset: "1920x1080" }, { width: 1280, height: 720 }), { width: 1920, height: 1080 });
});

test("current design follows the window with a safe minimum", () => {
	assert.deepEqual(resolveLayoutViewport({ preset: "current" }, { width: 1280, height: 720 }), { width: 1280, height: 720 });
	assert.deepEqual(resolveLayoutViewport({ preset: "current" }, { width: 720, height: 480 }), { width: 960, height: 640 });
});

test("responsive collisions expand only the transient viewport", () => {
	const left = frameFromRect({ x: 24, y: 24, width: 560, height: 120 }, "top-left", { width: 1440, height: 900 });
	const right = frameFromRect({ x: 856, y: 24, width: 560, height: 120 }, "top-right", { width: 1440, height: 900 });
	const before = structuredClone([left, right]);
	const fitted = expandViewportForFrames({ width: 960, height: 640 }, [{ frame: left, height: 120 }, { frame: right, height: 120 }]);
	assert.ok(fitted.width > 960);
	assert.equal(rectsOverlap(resolveFrame(left, fitted, 120), resolveFrame(right, fitted, 120)), false);
	assert.deepEqual([left, right], before);
});

test("smart anchors follow thirds of the viewport", () => {
	const viewport = { width: 1200, height: 900 };
	assert.equal(inferAnchor({ x: 24, y: 24, width: 240, height: 100 }, viewport), "top-left");
	assert.equal(inferAnchor({ x: 900, y: 700, width: 240, height: 100 }, viewport), "bottom-right");
});

test("snap and collision placement are deterministic", () => {
	assert.equal(snapValue(19), 16);
	const occupied = [{ x: 24, y: 24, width: 300, height: 200 }];
	const placed = findNearestFreeRect({ x: 24, y: 24, width: 300, height: 200 }, occupied, 900);
	assert.equal(rectsOverlap(placed, occupied[0]), false);
	assert.deepEqual(placed, findNearestFreeRect({ x: 24, y: 24, width: 300, height: 200 }, occupied, 900));
});

test("distribution preserves first and last bounds", () => {
	const result = distributeRects([
		{ x: 0, y: 0, width: 100, height: 50 },
		{ x: 130, y: 0, width: 100, height: 50 },
		{ x: 400, y: 0, width: 100, height: 50 },
	]);
	assert.deepEqual(result.map((item) => item.x), [0, 200, 400]);
});

test("command bar occupies only the gap between native toolbar groups", () => {
	assert.deepEqual(commandBarInsets(
		{ left: 58, right: 1920 },
		{ right: 184 },
		{ left: 1260 },
	), { left: 138, right: 672, width: 1052 });
});

test("command bar insets stay inside the workspace when native groups collide", () => {
	assert.deepEqual(commandBarInsets(
		{ left: 58, right: 720 },
		{ right: 360 },
		{ left: 340 },
	), { left: 314, right: 392, width: 0 });
});
