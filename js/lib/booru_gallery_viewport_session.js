const MAX_VIEWPORT_SESSIONS = 128;
const ZERO_GRAPH_ID = "00000000-0000-0000-0000-000000000000";
const viewportSessions = new Map();

export function galleryViewportSessionScope(node) {
	const graph = node?.graph;
	const rootGraph = graph?.rootGraph || graph;
	if (rootGraph?.id == null || graph?.id == null || node?.id == null || Number(node.id) === -1) return null;
	const workflowId = String(rootGraph.id);
	const graphId = String(graph.id);
	if (!workflowId || workflowId === ZERO_GRAPH_ID || !graphId || graphId === ZERO_GRAPH_ID) return null;
	return `${workflowId}\u0000${graphId}\u0000${String(node.id)}`;
}

function browseStateKey(state) {
	if (!state || state.randomMode) return null;
	const filters = state.filters || {};
	return JSON.stringify([
		String(state.source || ""),
		String(state.query || ""),
		String(filters.feed || "search"),
		String(filters.sort || ""),
		String(filters.period || ""),
		[...(Array.isArray(filters.ratings) ? filters.ratings : [])].map(String).sort(),
		Math.max(1, Number.parseInt(state.navigation?.page, 10) || 1),
	]);
}

function viewportAnchor(anchor) {
	const key = String(anchor?.key || "");
	const offset = Number(anchor?.offset);
	return key && Number.isFinite(offset) ? { key, offset } : null;
}

function touch(key, entry) {
	viewportSessions.delete(key);
	viewportSessions.set(key, entry);
	while (viewportSessions.size > MAX_VIEWPORT_SESSIONS) viewportSessions.delete(viewportSessions.keys().next().value);
}

export function saveGalleryViewportSession(scope, state, anchor) {
	if (!scope) return;
	const key = String(scope);
	const stateKey = browseStateKey(state);
	const normalizedAnchor = viewportAnchor(anchor);
	if (!stateKey || !normalizedAnchor) {
		viewportSessions.delete(key);
		return;
	}
	touch(key, { stateKey, anchor: normalizedAnchor });
}

export function readGalleryViewportSession(scope, state) {
	const key = scope ? String(scope) : null;
	const stateKey = browseStateKey(state);
	const entry = key && stateKey ? viewportSessions.get(key) : null;
	if (!entry || entry.stateKey !== stateKey) return null;
	touch(key, entry);
	return { ...entry.anchor };
}

export function clearGalleryViewportSession(scope) {
	if (scope) viewportSessions.delete(String(scope));
}
