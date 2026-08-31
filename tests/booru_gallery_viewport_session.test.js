import assert from "node:assert/strict";
import test from "node:test";

import { clearGalleryViewportSession, galleryViewportSessionScope, readGalleryViewportSession, saveGalleryViewportSession } from "../js/lib/booru_gallery_viewport_session.js";

function galleryState({ query = "blue hair", page = 5, randomMode = false } = {}) {
	return {
		source: "danbooru",
		query,
		randomMode,
		filters: { feed: "search", sort: "latest", period: "", ratings: ["general"] },
		navigation: { page },
	};
}

function galleryNode(workflowId, nodeId = 12, graphId = workflowId) {
	const rootGraph = { id: workflowId };
	const graph = graphId === workflowId ? rootGraph : { id: graphId, rootGraph };
	return { id: nodeId, graph };
}

test("Gallery viewport sessions restore only the matching workflow, graph, node, and browse state", () => {
	const scope = galleryViewportSessionScope(galleryNode("workflow-a", 12, "subgraph-a"));
	const state = galleryState();
	const anchor = { key: "danbooru:500", offset: 37 };
	saveGalleryViewportSession(scope, state, anchor);

	assert.deepEqual(readGalleryViewportSession(scope, galleryState()), anchor);
	assert.equal(readGalleryViewportSession(galleryViewportSessionScope(galleryNode("workflow-b", 12, "subgraph-a")), state), null);
	assert.equal(readGalleryViewportSession(galleryViewportSessionScope(galleryNode("workflow-a", 12, "subgraph-b")), state), null);
	assert.equal(readGalleryViewportSession(galleryViewportSessionScope(galleryNode("workflow-a", 13, "subgraph-a")), state), null);
	assert.equal(readGalleryViewportSession(scope, galleryState({ query: "red hair" })), null);
	assert.equal(readGalleryViewportSession(scope, galleryState({ page: 6 })), null);
	clearGalleryViewportSession(scope);
	assert.equal(readGalleryViewportSession(scope, state), null);
});

test("Gallery viewport sessions copy anchors and never restore random draws", () => {
	const scope = galleryViewportSessionScope(galleryNode("workflow-random"));
	const state = galleryState();
	const anchor = { key: "danbooru:500", offset: 37 };
	saveGalleryViewportSession(scope, state, anchor);
	anchor.offset = 0;
	const restored = readGalleryViewportSession(scope, state);
	assert.deepEqual(restored, { key: "danbooru:500", offset: 37 });
	restored.offset = -20;
	assert.deepEqual(readGalleryViewportSession(scope, state), { key: "danbooru:500", offset: 37 });

	const randomState = galleryState({ randomMode: true });
	saveGalleryViewportSession(scope, randomState, { key: "danbooru:random", offset: 4 });
	assert.equal(readGalleryViewportSession(scope, randomState), null);
});

test("a captured Gallery viewport scope survives root graph clearing before node removal", () => {
	const node = galleryNode("workflow-cleared");
	const scope = galleryViewportSessionScope(node);
	node.graph.id = "00000000-0000-0000-0000-000000000000";
	assert.equal(galleryViewportSessionScope(node), null);
	saveGalleryViewportSession(scope, galleryState(), { key: "danbooru:cleared", offset: 19 });
	assert.deepEqual(
		readGalleryViewportSession(galleryViewportSessionScope(galleryNode("workflow-cleared")), galleryState()),
		{ key: "danbooru:cleared", offset: 19 },
	);
});

test("Gallery viewport sessions evict the least recently used entry at the fixed bound", () => {
	const state = galleryState();
	const oldest = galleryViewportSessionScope(galleryNode("workflow-oldest"));
	saveGalleryViewportSession(oldest, state, { key: "danbooru:oldest", offset: 1 });
	for (let index = 0; index < 128; index += 1) {
		saveGalleryViewportSession(galleryViewportSessionScope(galleryNode(`workflow-bound-${index}`)), state, { key: `danbooru:${index}`, offset: index });
	}
	assert.equal(readGalleryViewportSession(oldest, state), null);
	assert.deepEqual(readGalleryViewportSession(galleryViewportSessionScope(galleryNode("workflow-bound-127")), state), { key: "danbooru:127", offset: 127 });
});
