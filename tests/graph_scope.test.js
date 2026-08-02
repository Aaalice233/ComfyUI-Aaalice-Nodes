import assert from "node:assert/strict";
import test from "node:test";

import {
	allGraphNodes,
	findNodeByExecutionId,
	findNodeByGraphRef,
	graphAncestors,
	graphDescendants,
	graphId,
	graphRoute,
	nodeExecutionIds,
	promptNodesForGraphNode,
} from "../js/lib/graph_scope.js";

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
	const leafNode = { id: 9, type: "PromptSelector" };
	const leaf = graph("leaf", [leafNode]);
	const innerWrapper = { id: 4, subgraph: leaf };
	const middle = graph("middle", [innerWrapper]);
	const outerWrapper = { id: 2, subgraph: middle };
	const root = graph(null, [{ id: 1 }, outerWrapper]);
	middle.rootGraph = root;
	leaf.rootGraph = root;
	return { root, middle, leaf, leafNode, outerWrapper, innerWrapper };
}

test("graph scope follows nested wrapper paths and stable graph ids", () => {
	const { root, middle, leaf, outerWrapper, innerWrapper } = nestedFixture();
	assert.equal(graphId(root), "root");
	assert.equal(graphId(leaf), "leaf");
	assert.deepEqual(graphAncestors(leaf), [leaf, middle, root]);
	assert.deepEqual(graphDescendants(root), [middle, leaf]);
	assert.deepEqual(graphRoute(root, leaf), [outerWrapper, innerWrapper]);
	assert.deepEqual(graphRoute(middle, leaf), [innerWrapper]);
	assert.equal(graphRoute(leaf, root), null);
});

test("qualified execution ids include every enclosing subgraph node", () => {
	const { root, leafNode } = nestedFixture();
	assert.deepEqual(nodeExecutionIds(leafNode), ["2:4:9"]);
	assert.deepEqual(promptNodesForGraphNode({ "2:4:9": { inputs: {} } }, leafNode), [{ inputs: {} }]);
	assert.equal(findNodeByExecutionId(root, "2:4:9"), leafNode);
	assert.equal(findNodeByExecutionId(root, "2:missing:9"), null);
});

test("shared subgraph definitions address every wrapper execution", () => {
	const sharedNode = { id: 9, type: "GroupLogicProbe" };
	const shared = graph("shared", [sharedNode]);
	const root = graph(null, [{ id: 2, subgraph: shared }, { id: 7, subgraph: shared }]);
	shared.rootGraph = root;
	const first = { inputs: {} };
	const second = { inputs: {} };

	assert.deepEqual(nodeExecutionIds(sharedNode), ["2:9", "7:9"]);
	assert.deepEqual(promptNodesForGraphNode({ "2:9": first, "7:9": second }, sharedNode), [first, second]);
	assert.equal(findNodeByExecutionId(root, "7:9"), sharedNode);
});

test("graph references resolve duplicate node ids without drifting graphs", () => {
	const { root, leaf } = nestedFixture();
	const duplicate = { id: 9, type: "Other" };
	duplicate.graph = root;
	root._nodes.push(duplicate);
	assert.equal(findNodeByGraphRef(root, "leaf", 9)?.type, "PromptSelector");
	assert.equal(findNodeByGraphRef(root, "root", 9)?.type, "Other");
	assert.equal(allGraphNodes(root).length, 5);
});
