import test from "node:test";
import assert from "node:assert/strict";

import { installLinkedSeedQueueHook } from "../js/lib/linked_seed_queue.js";

function graph(primary = 1, linked = 1) { return { primary, linked }; }

function fakeApp(targetGraph, { before = null, after = null, switchTo = null } = {}) {
	const snapshots = [];
	return {
		snapshots,
		activeGraph: targetGraph,
		async graphToPrompt(currentGraph) {
			snapshots.push([currentGraph.primary, currentGraph.linked]);
			if (switchTo) this.activeGraph = switchTo;
			return { output: {} };
		},
		async queuePrompt(_number, batchCount = 1) {
			const queuedGraph = this.activeGraph;
			for (let index = 0; index < batchCount; index++) {
				before?.(queuedGraph, index);
				await this.graphToPrompt(queuedGraph);
				after?.(queuedGraph, index);
			}
			return true;
		},
	};
}

const synchronizeGraph = (currentGraph) => { currentGraph.linked = currentGraph.primary; };

test("linked seeds synchronize before every batch serialization and after the final queue callback", async () => {
	const target = graph();
	const app = fakeApp(target, { after: (current) => { current.primary += 1; current.linked += 7; } });
	installLinkedSeedQueueHook(app, { synchronizeGraph });
	await app.queuePrompt(0, 2);
	assert.deepEqual(app.snapshots, [[1, 1], [2, 2]]);
	assert.equal(target.primary, 3);
	assert.equal(target.linked, 3);
});

test("before-queue Seed modes converge before the serialized prompt is captured", async () => {
	const target = graph();
	const app = fakeApp(target, { before: (current) => { current.primary += 3; current.linked += 9; } });
	installLinkedSeedQueueHook(app, { synchronizeGraph });
	await app.queuePrompt(0, 2);
	assert.deepEqual(app.snapshots, [[4, 4], [7, 7]]);
});

test("prepares each serialized batch before linked synchronization", async () => {
	const target = graph(); const phases = [];
	const app = fakeApp(target, { after: (current) => { current.primary += 1; } });
	installLinkedSeedQueueHook(app, {
		prepareGraph(current) { phases.push(["prepare", current.primary]); current.primary += 1; },
		synchronizeGraph(current) { phases.push(["sync", current.primary, current.linked]); current.linked = current.primary; },
	});
	await app.queuePrompt(0, 2);
	assert.deepEqual(app.snapshots, [[2, 2], [4, 4]]);
	assert.deepEqual(phases, [["prepare", 1], ["sync", 2, 1], ["prepare", 3], ["sync", 4, 2], ["sync", 5, 4]]);
});

test("does not serialize a graph when linked synchronization fails", async () => {
	const target = graph(); const app = fakeApp(target);
	installLinkedSeedQueueHook(app, { synchronizeGraph() { throw new Error("sync failed"); } });
	await assert.rejects(() => app.queuePrompt(0, 1), /sync failed/);
	assert.deepEqual(app.snapshots, []);
});

test("post-queue convergence targets the graphs that were actually serialized", async () => {
	const queued = graph(); const switched = graph(10, 20);
	const phases = [];
	const app = fakeApp(queued, { after: (current) => { current.primary = 5; current.linked = 9; }, switchTo: switched });
	installLinkedSeedQueueHook(app, { synchronizeGraph(current, context) { phases.push([current, context.phase]); synchronizeGraph(current); } });
	await app.queuePrompt(0, 1);
	assert.equal(queued.linked, 5);
	assert.equal(switched.linked, 20);
	assert.deepEqual(phases.map(([, phase]) => phase), ["before-serialize", "after-queue"]);
});

test("linked Seed queue hook is idempotent", () => {
	const target = graph(); const app = fakeApp(target);
	const first = installLinkedSeedQueueHook(app, { synchronizeGraph });
	const wrappedQueue = app.queuePrompt; const wrappedPrompt = app.graphToPrompt;
	const second = installLinkedSeedQueueHook(app, { synchronizeGraph });
	assert.equal(first, second);
	assert.equal(app.queuePrompt, wrappedQueue);
	assert.equal(app.graphToPrompt, wrappedPrompt);
});
