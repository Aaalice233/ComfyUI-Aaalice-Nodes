import test from "node:test";
import assert from "node:assert/strict";
import { findNodeGraphGroup, resolveControlHierarchy } from "../js/lib/graph_group_context.js";

test("missing promoted sources preserve the host context without throwing", () => {
	const hierarchy = resolveControlHierarchy({ title: "Host", subgraph: { getNodeById: () => null } }, { sourceNodeId: 9, sourceWidgetName: "steps" });
	assert.equal(hierarchy.hostTitle, "Host");
	assert.equal(hierarchy.sourceNodeTitle, "");
});

test("findNodeGraphGroup returns empty string when node has no graph or no groups", () => {
	assert.equal(findNodeGraphGroup(null), "");
	assert.equal(findNodeGraphGroup({}), "");
	assert.equal(findNodeGraphGroup({ graph: { _groups: [] } }), "");
});

test("findNodeGraphGroup finds group by member array", () => {
	const node = { pos: [100, 100], size: [200, 100] };
	const group = { title: "采样流程组", _nodes: [node], size: [500, 400] };
	node.graph = { _groups: [group] };

	assert.equal(findNodeGraphGroup(node), "采样流程组");
});

test("findNodeGraphGroup finds group by geometry and prefers more specific inner group", () => {
	const node = { pos: [150, 150], size: [100, 50] };
	const outerGroup = { title: "全局主流程", pos: [0, 0], size: [1000, 1000], isPointInside: () => true };
	const innerGroup = { title: "细化修手组", pos: [100, 100], size: [300, 200], isPointInside: () => true };
	node.graph = { _groups: [outerGroup, innerGroup] };

	assert.equal(findNodeGraphGroup(node), "细化修手组");
});

test("resolveControlHierarchy formats native node with group", () => {
	const node = {
		title: "KSampler",
		pos: [100, 100],
		graph: {
			_groups: [{ title: "生成主体", _nodes: [] }],
		},
	};
	node.graph._groups[0]._nodes.push(node);

	const widget = { name: "steps", value: 20 };
	const hierarchy = resolveControlHierarchy(node, widget);

	assert.equal(hierarchy.isPromoted, false);
	assert.equal(hierarchy.groupName, "生成主体");
	assert.equal(hierarchy.hostTitle, "KSampler");
	assert.equal(hierarchy.contextDescription, "[生成主体] KSampler");
});

test("resolveControlHierarchy formats promoted widget with subgraph and interior node context", () => {
	const interiorWidget = { name: "guide_size", value: 512 };
	const interiorNode = {
		id: 12,
		title: "FaceDetailer",
		widgets: [interiorWidget],
		graph: {
			_groups: [{ title: "内部面部修复", _nodes: [] }],
		},
	};

	const subgraphNode = {
		title: "人脸增强子图",
		isSubgraphNode: () => true,
		subgraph: {
			getNodeById: (id) => (id === 12 ? interiorNode : null),
		},
		graph: {
			_groups: [{ title: "后处理流程", _nodes: [] }],
		},
	};
	subgraphNode.graph._groups[0]._nodes.push(subgraphNode);

	const promotedWidget = {
		sourceNodeId: 12,
		sourceWidgetName: "guide_size",
	};

	const hierarchy = resolveControlHierarchy(subgraphNode, promotedWidget);

	assert.equal(hierarchy.isPromoted, true);
	assert.equal(hierarchy.groupName, "后处理流程");
	assert.equal(hierarchy.hostTitle, "人脸增强子图");
	assert.equal(hierarchy.sourceNodeTitle, "FaceDetailer");
	assert.equal(hierarchy.contextDescription, "[后处理流程] 人脸增强子图 · FaceDetailer");
});
