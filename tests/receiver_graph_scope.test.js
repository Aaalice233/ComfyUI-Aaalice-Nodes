import assert from "node:assert/strict";
import test from "node:test";

import {
	RECEIVER_GRAPH_SCOPE_ERROR,
	selectManagedGetGraph,
} from "../js/lib/receiver_graph_scope.js";

function graph(id, nodes = []) {
	const value = { id, _nodes: nodes };
	for (const node of nodes) node.graph = value;
	return value;
}

function fixture() {
	const nested = graph("nested");
	const receiverGraph = graph("receiver", [{ id: 3, subgraph: nested }]);
	const sibling = graph("sibling");
	const root = graph("root", [
		{ id: 1, subgraph: receiverGraph },
		{ id: 2, subgraph: sibling },
	]);
	receiverGraph.rootGraph = root;
	nested.rootGraph = root;
	sibling.rootGraph = root;
	return { root, receiverGraph, nested, sibling };
}

test("receiver and managed Gets remain together inside a subgraph", () => {
	const { root, receiverGraph } = fixture();
	assert.equal(
		selectManagedGetGraph(receiverGraph, new Set([receiverGraph]), new Set([root])),
		receiverGraph,
	);
});

test("new managed Gets default to the receiver subgraph when Sets are in an ancestor", () => {
	const { root, receiverGraph } = fixture();
	assert.equal(
		selectManagedGetGraph(receiverGraph, new Set(), new Set([root])),
		receiverGraph,
	);
});

test("managed Gets may remain in a deeper nested subgraph", () => {
	const { root, receiverGraph, nested } = fixture();
	assert.equal(
		selectManagedGetGraph(receiverGraph, new Set([nested]), new Set([root, receiverGraph])),
		nested,
	);
});

test("new managed Gets may follow Sets into a deeper nested subgraph", () => {
	const { receiverGraph, nested } = fixture();
	assert.equal(
		selectManagedGetGraph(receiverGraph, new Set(), new Set([nested])),
		nested,
	);
});

test("sibling or split Get scopes fail explicitly", () => {
	const { receiverGraph, nested, sibling } = fixture();
	for (const existing of [new Set([sibling]), new Set([receiverGraph, nested])]) {
		assert.throws(
			() => selectManagedGetGraph(receiverGraph, existing, new Set()),
			(error) => error?.code === RECEIVER_GRAPH_SCOPE_ERROR,
		);
	}
});
