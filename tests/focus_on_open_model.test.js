import assert from "node:assert/strict";
import test from "node:test";

import {
	FOCUS_ON_OPEN_PROPERTY,
	FOCUS_ON_OPEN_VERSION,
	clearFocusOnOpenTarget,
	createFocusOnOpenScheduler,
	focusOnOpenMarkedNodes,
	focusOnOpenMenuAction,
	focusOnOpenSettings,
	focusOnOpenTarget,
	normalizeFocusOnOpenMarkers,
	setFocusOnOpenSettings,
	setFocusOnOpenTarget,
} from "../js/lib/focus_on_open_model.js";

function graph(id, nodes = []) {
	const value = {
		id,
		_nodes: nodes,
		getNodeById(nodeId) { return this._nodes.find((node) => String(node.id) === String(nodeId)) || null; },
	};
	for (const node of nodes) node.graph = value;
	return value;
}

function nestedFixture() {
	const leafNode = { id: 9, type: "MarkdownNote", properties: {} };
	const shared = graph("shared", [leafNode]);
	const innerWrapper = { id: 4, type: "Subgraph", subgraph: shared, properties: {} };
	const middle = graph("middle", [innerWrapper]);
	const outerWrapper = { id: 2, type: "Subgraph", subgraph: middle, properties: {} };
	const rootNode = { id: 1, type: "ThirdParty", properties: {} };
	const secondWrapper = { id: 7, type: "Subgraph", subgraph: shared, properties: {} };
	const root = graph(null, [rootNode, outerWrapper, secondWrapper]);
	middle.rootGraph = root;
	shared.rootGraph = root;
	return { root, rootNode, leafNode, outerWrapper, innerWrapper, secondWrapper, shared };
}

test("setting a target replaces every older marker across nested and shared graph definitions", () => {
	const { root, rootNode, leafNode } = nestedFixture();
	assert.deepEqual(setFocusOnOpenTarget(root, leafNode), { target: leafNode, changed: true });
	assert.equal(leafNode.properties[FOCUS_ON_OPEN_PROPERTY].version, FOCUS_ON_OPEN_VERSION);
	assert.deepEqual(setFocusOnOpenTarget(root, rootNode), { target: rootNode, changed: true });
	assert.deepEqual(focusOnOpenMarkedNodes(root), [rootNode]);
});

test("the shared definition is traversed once and retains one deterministic target", () => {
	const { root, rootNode, leafNode } = nestedFixture();
	rootNode.properties[FOCUS_ON_OPEN_PROPERTY] = { version: FOCUS_ON_OPEN_VERSION };
	leafNode.properties[FOCUS_ON_OPEN_PROPERTY] = { version: FOCUS_ON_OPEN_VERSION };
	const normalized = normalizeFocusOnOpenMarkers(root);
	assert.equal(normalized.target, rootNode);
	assert.equal(normalized.changed, true);
	assert.deepEqual(focusOnOpenMarkedNodes(root), [rootNode]);
	assert.equal(focusOnOpenTarget(root), rootNode);
});

test("focus settings use the group-navigation view defaults and persist normalized values", () => {
	const { root, leafNode } = nestedFixture();
	setFocusOnOpenTarget(root, leafNode);
	assert.deepEqual(focusOnOpenSettings(leafNode), { offset: { x: 0, y: 0 }, zoom: 0.82 });
	assert.deepEqual(setFocusOnOpenSettings(root, leafNode, { offset: { x: "125", y: "-75" }, zoom: 1.17 }), { target: leafNode, changed: true });
	assert.deepEqual(focusOnOpenSettings(leafNode), { offset: { x: 125, y: -75 }, zoom: 1.17 });
	assert.deepEqual(leafNode.properties[FOCUS_ON_OPEN_PROPERTY], { version: FOCUS_ON_OPEN_VERSION, offset: { x: 125, y: -75 }, zoom: 1.17 });
});

test("legacy markers keep the default view until settings are saved", () => {
	const { root, leafNode } = nestedFixture();
	leafNode.properties[FOCUS_ON_OPEN_PROPERTY] = true;
	assert.deepEqual(focusOnOpenSettings(leafNode), { offset: { x: 0, y: 0 }, zoom: 0.82 });
	assert.deepEqual(setFocusOnOpenSettings(root, leafNode, { offset: { x: 100001, y: -100001 }, zoom: 9 }), { target: leafNode, changed: true });
	assert.deepEqual(focusOnOpenSettings(leafNode), { offset: { x: 100000, y: -100000 }, zoom: 3 });
});

test("clearing the target removes the persisted marker without creating alternate state", () => {
	const { root, leafNode } = nestedFixture();
	setFocusOnOpenTarget(root, leafNode);
	const result = clearFocusOnOpenTarget(root, leafNode);
	assert.deepEqual(result, { target: null, changed: true });
	assert.equal(focusOnOpenMarkedNodes(root).length, 0);
	assert.equal(Object.hasOwn(leafNode.properties, FOCUS_ON_OPEN_PROPERTY), false);
});

test("all graph node kinds use the same menu action and non-nodes are ignored", () => {
	const markdown = { id: 1, type: "MarkdownNote", properties: {} };
	const builtin = { id: 2, type: "CheckpointLoaderSimple", properties: {} };
	const thirdParty = { id: 3, type: "ThirdPartyNode", properties: {} };
	const wrapper = { id: 4, type: "Subgraph", properties: {}, subgraph: graph("child", []) };
	const graphValue = graph(null, [markdown, builtin, thirdParty, wrapper]);
	for (const node of [markdown, builtin, thirdParty, wrapper]) assert.equal(focusOnOpenMenuAction(node), "set");
	setFocusOnOpenTarget(graphValue, builtin);
	assert.equal(focusOnOpenMenuAction(builtin), "clear");
	assert.equal(focusOnOpenMenuAction({ properties: {}, graph: graphValue }), null);
	assert.equal(focusOnOpenMenuAction(null), null);
});

test("each load generation schedules one focus and cancels stale frames", () => {
	const callbacks = new Map();
	const cancelled = [];
	const focused = [];
	let nextHandle = 0;
	const scheduler = createFocusOnOpenScheduler({
		schedule(callback) {
			const handle = ++nextHandle;
			callbacks.set(handle, callback);
			return handle;
		},
		cancel(handle) {
			cancelled.push(handle);
			callbacks.delete(handle);
		},
		run: (...args) => focused.push(args),
	});
	const root = {};
	const target = {};
	assert.equal(scheduler.afterConfigure(root, target), true);
	assert.equal(scheduler.afterConfigure(root, target), false);
	callbacks.get(1)();
	assert.deepEqual(focused, [[target, root, 0]]);
	assert.deepEqual(cancelled, []);
	assert.equal(scheduler.afterConfigure(root, target), false);
	const nextRoot = {};
	scheduler.beforeConfigure();
	assert.equal(scheduler.afterConfigure(nextRoot, target), true);
	assert.deepEqual(cancelled, []);
	scheduler.beforeConfigure();
	assert.deepEqual(cancelled, [2]);
	callbacks.get(2)?.();
	assert.deepEqual(focused, [[target, root, 0]]);
	scheduler.cancelPending();
});

test("the marker is independent of title, parameters, and workflow metadata", () => {
	const node = { id: 1, type: "Any", title: "Before", properties: {}, widgets: [{ value: 1 }] };
	const root = graph(null, [node]);
	setFocusOnOpenTarget(root, node);
	node.title = "After";
	node.widgets[0].value = 99;
	root.version = 42;
	assert.equal(focusOnOpenTarget(root), node);
	assert.deepEqual(Object.keys(node.properties), [FOCUS_ON_OPEN_PROPERTY]);
});
