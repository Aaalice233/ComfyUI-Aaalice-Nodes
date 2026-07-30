import assert from "node:assert/strict";
import test from "node:test";

import {
	MAX_ENUM_BRANCHES,
	bindingFromDirectSource,
	bindingFromLogicalSource,
	boundPanelNode,
	defaultEnumSwitchState,
	enumPromptPayload,
	enumRouteDiff,
	normalizeEnumSwitchState,
	reconcileEnumRoutes,
	validateEnumRoutes,
} from "../js/lib/enum_switch_model.js";

test("new switches start with two usable branches", () => {
	assert.deepEqual(defaultEnumSwitchState().routes.map((route) => route.key), ["option_a", "option_b"]);
});

test("normalization preserves route identity and binding", () => {
	const result = normalizeEnumSwitchState({
		version: 99,
		binding: { panelNodeId: 7, parameterId: "mode" },
		routes: [{ id: "stable", key: "draft" }],
	});
	assert.equal(result.version, 1);
	assert.deepEqual(result.binding, { panelNodeId: 7, parameterId: "mode" });
	assert.deepEqual(result.routes, [{ id: "stable", key: "draft" }]);
});

test("normalization preserves the bound panel graph identity", () => {
	const result = normalizeEnumSwitchState({
		binding: { panelNodeId: 7, panelGraphId: "root", parameterId: "mode" },
		routes: [{ id: "stable", key: "draft" }],
	});
	assert.deepEqual(result.binding, { panelNodeId: 7, panelGraphId: "root", parameterId: "mode" });
});

test("route validation rejects empty and duplicate keys", () => {
	assert.ok(validateEnumRoutes([{ id: "a", key: "" }]).length);
	assert.ok(validateEnumRoutes([{ id: "a", key: "same" }, { id: "b", key: "same" }]).length);
});

test("route diff detects add remove and reorder", () => {
	const routes = [{ id: "a", key: "a" }, { id: "b", key: "b" }];
	assert.deepEqual(enumRouteDiff(routes, ["a", "c"]).added, ["c"]);
	assert.deepEqual(enumRouteDiff(routes, ["a"]).removed, ["b"]);
	assert.equal(enumRouteDiff(routes, ["b", "a"]).reordered, true);
});

test("reconcile preserves stable ids for unchanged keys", () => {
	const routes = [{ id: "a-id", key: "a" }, { id: "b-id", key: "b" }];
	const result = reconcileEnumRoutes(routes, ["b", "c", "a"]);
	assert.deepEqual(result.ordered.map((route) => route.key), ["b", "c", "a"]);
	assert.equal(result.ordered[0].id, "b-id");
	assert.equal(result.ordered[2].id, "a-id");
	assert.deepEqual(result.added.map((route) => route.key), ["c"]);
	assert.deepEqual(result.removed, []);
});

test("prompt payload maps stable routes onto the materialized protocol prefix", () => {
	const payload = enumPromptPayload({ routes: [{ id: "x", key: "draft" }, { id: "y", key: "final" }] });
	assert.deepEqual(payload.routes, [
		{ id: "x", key: "draft", input: "branch_1" },
		{ id: "y", key: "final", input: "branch_2" },
	]);
});

test("route count is capped at 32", () => {
	const routes = Array.from({ length: MAX_ENUM_BRANCHES + 1 }, (_, index) => ({ id: `id_${index}`, key: `key_${index}` }));
	assert.ok(validateEnumRoutes(routes).length);
});

test("direct ParameterPanel and ParameterReceiver outputs expose stable bindings", () => {
	assert.deepEqual(bindingFromDirectSource({
		type: "ParameterPanel", id: 4,
		outputs: [{ _aaaliceParamId: "mode" }],
	}, 0), { panelNodeId: 4, parameterId: "mode" });
	assert.deepEqual(bindingFromDirectSource({
		type: "ParameterReceiver",
		properties: { receiverBinding: { panelNodeId: 4, slots: [{ parameterId: "mode" }] } },
	}, 0), { panelNodeId: 4, parameterId: "mode" });
	assert.equal(bindingFromDirectSource({ type: "OtherNode" }, 0), null);
});

test("KJ Get virtual outputs expose ancestor ParameterPanel bindings", () => {
	const root = { id: null };
	const child = { id: "child", rootGraph: root };
	const panel = {
		type: "ParameterPanel",
		id: 4,
		graph: root,
		outputs: [{ _aaaliceParamId: "mode" }],
	};
	const get = {
		type: "GetNode",
		isVirtualNode: true,
		graph: child,
		resolveVirtualOutput: () => ({ node: panel, slot: 0 }),
	};
	assert.deepEqual(bindingFromLogicalSource(get, 0), {
		panelNodeId: 4,
		panelGraphId: "root",
		parameterId: "mode",
	});
});

test("KJ Get same-graph links expose ParameterPanel bindings", () => {
	const graph = { id: "nested" };
	const panel = {
		type: "ParameterPanel",
		id: 9,
		graph,
		outputs: [{ _aaaliceParamId: "quality" }],
	};
	const link = {
		origin_id: panel.id,
		origin_slot: 0,
		resolve: () => ({ outputNode: panel, output: panel.outputs[0] }),
	};
	const get = {
		type: "GetNode",
		isVirtualNode: true,
		graph,
		resolveVirtualOutput: () => undefined,
		getInputLink: () => link,
	};
	assert.deepEqual(bindingFromLogicalSource(get, 0), {
		panelNodeId: 9,
		panelGraphId: "nested",
		parameterId: "quality",
	});
});

test("bound panels resolve from an EnumSwitch subgraph by graph identity", () => {
	const panel = { type: "ParameterPanel", id: 5 };
	const child = { id: "child", _nodes: [] };
	const wrapper = { id: 17, subgraph: child };
	const root = {
		id: null,
		_nodes: [panel, wrapper],
		getNodeById: (id) => [panel, wrapper].find((node) => String(node.id) === String(id)) || null,
	};
	child.rootGraph = root;
	child.getNodeById = () => null;
	panel.graph = root;
	wrapper.graph = root;
	assert.equal(boundPanelNode(child, {
		panelNodeId: 5,
		panelGraphId: "root",
		parameterId: "mode",
	}, (node) => node?.type === "ParameterPanel"), panel);
});

test("legacy bindings skip same-id non-panel nodes in a nearer subgraph", () => {
	const impostor = { type: "OtherNode", id: 5 };
	const panel = { type: "ParameterPanel", id: 5 };
	const child = {
		id: "child",
		_nodes: [impostor],
		getNodeById: (id) => String(id) === "5" ? impostor : null,
	};
	const wrapper = { id: 17, subgraph: child };
	const root = {
		id: null,
		_nodes: [panel, wrapper],
		getNodeById: (id) => [panel, wrapper].find((node) => String(node.id) === String(id)) || null,
	};
	child.rootGraph = root;
	assert.equal(boundPanelNode(child, {
		panelNodeId: 5,
		parameterId: "mode",
	}, (node) => node?.type === "ParameterPanel"), panel);
});
