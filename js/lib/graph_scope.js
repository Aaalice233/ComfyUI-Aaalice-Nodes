/** Read-only helpers for ComfyUI root graphs and nested subgraph definitions. */

export const ROOT_GRAPH_ID = "root";

export function graphId(graph) {
	return graph?.id == null ? ROOT_GRAPH_ID : String(graph.id);
}

export function rootGraph(graph) {
	return graph?.rootGraph || graph || null;
}

export function directSubgraphNodes(graph) {
	return (graph?._nodes || []).filter((node) => node?.subgraph);
}

export function graphEntries(root, { revisitShared = false } = {}) {
	const start = rootGraph(root);
	if (!start) return [];
	const entries = [];
	const visited = new Set();
	const walk = (graph, path, lineage) => {
		if (!graph || lineage.has(graph)) return;
		if (!revisitShared && visited.has(graph)) return;
		visited.add(graph);
		entries.push({ graph, path });
		const nextLineage = new Set(lineage);
		nextLineage.add(graph);
		for (const wrapper of directSubgraphNodes(graph)) {
			walk(wrapper.subgraph, [...path, wrapper], nextLineage);
		}
	};
	walk(start, [], new Set());
	return entries;
}

export function allGraphNodes(root) {
	return graphEntries(root).flatMap(({ graph }) => graph?._nodes || []);
}

export function graphPath(targetGraph) {
	if (!targetGraph) return null;
	const root = rootGraph(targetGraph);
	return graphEntries(root, { revisitShared: true }).find(({ graph }) => graph === targetGraph)?.path || null;
}

export function graphAncestors(graph) {
	const path = graphPath(graph);
	if (!path) return graph ? [graph] : [];
	const ancestors = [rootGraph(graph)];
	for (const wrapper of path) ancestors.push(wrapper.subgraph);
	return ancestors.reverse();
}

export function graphDescendants(graph) {
	if (!graph) return [];
	const result = [];
	const visited = new Set([graph]);
	const walk = (candidate) => {
		for (const wrapper of directSubgraphNodes(candidate)) {
			const child = wrapper.subgraph;
			if (!child || visited.has(child)) continue;
			visited.add(child);
			result.push(child);
			walk(child);
		}
	};
	walk(graph);
	return result;
}

export function isGraphAncestor(ancestor, descendant) {
	return Boolean(ancestor && descendant && graphAncestors(descendant).includes(ancestor));
}

export function findGraphNode(graph, nodeId) {
	if (!graph || nodeId == null) return null;
	if (typeof graph.getNodeById === "function") return graph.getNodeById(nodeId);
	if (typeof graph._nodes_by_id?.get === "function") return graph._nodes_by_id.get(nodeId) || null;
	return graph._nodes_by_id?.[nodeId] || (graph._nodes || []).find((node) => String(node?.id) === String(nodeId)) || null;
}

export function findNodeByGraphRef(contextGraph, targetGraphId, nodeId) {
	if (!contextGraph || nodeId == null) return null;
	const targetId = targetGraphId == null ? null : String(targetGraphId);
	for (const { graph } of graphEntries(rootGraph(contextGraph))) {
		if (targetId != null && graphId(graph) !== targetId) continue;
		const node = findGraphNode(graph, nodeId);
		if (node) return node;
	}
	return null;
}

export function nodeExecutionIds(node) {
	if (!node?.graph || node.id == null) return [];
	const matches = graphEntries(rootGraph(node.graph), { revisitShared: true })
		.filter(({ graph }) => graph === node.graph);
	return matches.map(({ path }) => [...path.map((wrapper) => wrapper.id), node.id].join(":"));
}

export function graphRoute(ancestor, descendant) {
	if (!ancestor || !descendant) return null;
	if (ancestor === descendant) return [];
	const fullPath = graphPath(descendant);
	if (!fullPath) return null;
	let graph = rootGraph(descendant);
	const route = [];
	let collecting = graph === ancestor;
	for (const wrapper of fullPath) {
		if (collecting) route.push(wrapper);
		graph = wrapper.subgraph;
		if (!collecting && graph === ancestor) collecting = true;
	}
	return graph === descendant && collecting ? route : null;
}

export function uniqueSubgraphWrapper(parentGraph, childGraph) {
	const matches = directSubgraphNodes(parentGraph).filter((node) => node.subgraph === childGraph);
	return matches.length === 1 ? matches[0] : null;
}
