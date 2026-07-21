import test from "node:test";
import assert from "node:assert/strict";

import { groupNavigationBounds, navigateToVisualGroup, visualGroups } from "../js/lib/group_navigation.js";

test("discovers groups in canvas reading order and refreshes their members", () => {
	const refreshed = [];
	const groups = [
		{ id: 3, pos: [400, 100], recomputeInsideNodes: () => refreshed.push(3) },
		{ id: 1, pos: [20, 20], recomputeInsideNodes: () => refreshed.push(1) },
		{ id: 2, pos: [10, 100], recomputeInsideNodes: () => refreshed.push(2) },
	];
	assert.deepEqual(visualGroups({ _groups: groups }).map((group) => group.id), [1, 2, 3]);
	assert.deepEqual(refreshed, [3, 1, 2]);
});

test("animates to the full group bounds when the canvas supports it", () => {
	const calls = [];
	const group = { boundingRect: [10, 20, 300, 180] };
	const canvas = {
		animateToBounds: (...args) => calls.push(["animate", ...args]),
		setDirty: (...args) => calls.push(["dirty", ...args]),
	};
	assert.equal(navigateToVisualGroup(canvas, group), true);
	assert.deepEqual(calls, [
		["animate", group.boundingRect, { duration: 280, zoom: 0.82 }],
		["dirty", true, true],
	]);
});

test("applies a per-entry canvas offset to the navigation target", () => {
	let received = null;
	const canvas = { animateToBounds: (bounds, options) => { received = { bounds, options }; } };
	assert.equal(navigateToVisualGroup(canvas, { boundingRect: [10, 20, 300, 200] }, { offset: { x: 120, y: -80 }, zoom: 1.35 }), true);
	assert.deepEqual(received, { bounds: [130, -60, 300, 200], options: { duration: 280, zoom: 1.35 } });
});

test("falls back to centering group-shaped objects and rejects invalid targets", () => {
	const calls = [];
	const group = { pos: new Float32Array([5, 6]), size: new Float32Array([70, 80]) };
	const canvas = { centerOnNode: (target) => calls.push(target), setDirty() {} };
	assert.deepEqual(groupNavigationBounds(group), [5, 6, 70, 80]);
	assert.equal(navigateToVisualGroup(canvas, group), true);
	assert.deepEqual(calls, [group]);
	assert.equal(navigateToVisualGroup({}, {}), false);
});
