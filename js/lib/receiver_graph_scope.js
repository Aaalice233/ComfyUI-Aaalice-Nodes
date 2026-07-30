/** Pure graph-placement policy for ParameterReceiver-managed KJ Get nodes. */
import { isGraphAncestor } from "./graph_scope.js";

export const RECEIVER_GRAPH_SCOPE_ERROR = "AAALICE_RECEIVER_GRAPH_SCOPE_INCOMPATIBLE";

function incompatibleScope() {
	const error = new Error(RECEIVER_GRAPH_SCOPE_ERROR);
	error.code = RECEIVER_GRAPH_SCOPE_ERROR;
	return error;
}

/**
 * Select the graph that owns every managed Get for one receiver.
 *
 * A receiver may live in a subgraph and its managed Gets may stay beside it or
 * move into a deeper descendant containing the corresponding Sets. Existing
 * Gets remain authoritative so synchronization never silently pulls them out
 * of a subgraph chosen by the user.
 */
export function selectManagedGetGraph(receiverGraph, existingGetGraphs, setGraphs) {
	const existing = [...(existingGetGraphs || [])];
	if (existing.length > 1) throw incompatibleScope();

	let target = existing.length ? existing[0] : receiverGraph;
	if (!isGraphAncestor(receiverGraph, target)) throw incompatibleScope();

	for (const setGraph of setGraphs || []) {
		if (isGraphAncestor(setGraph, target)) continue;
		if (!existing.length && isGraphAncestor(target, setGraph)) {
			target = setGraph;
			continue;
		}
		throw incompatibleScope();
	}
	return target;
}
