import assert from "node:assert/strict";
import test from "node:test";

import {
	allGraphNodes,
	findNodeByGraphRef,
	graphAncestors,
	graphDescendants,
	graphId,
	graphRoute,
	nodeExecutionIds,
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
	const leafNode = { id: 9, type: "ParameterPanel" };
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
	const { leafNode } = nestedFixture();
	assert.deepEqual(nodeExecutionIds(leafNode), ["2:4:9"]);
});

test("graph references resolve duplicate node ids without drifting graphs", () => {
	const { root, leaf } = nestedFixture();
	const duplicate = { id: 9, type: "Other" };
	duplicate.graph = root;
	root._nodes.push(duplicate);
	assert.equal(findNodeByGraphRef(root, "leaf", 9)?.type, "ParameterPanel");
	assert.equal(findNodeByGraphRef(root, "root", 9)?.type, "Other");
	assert.equal(allGraphNodes(root).length, 5);
});
