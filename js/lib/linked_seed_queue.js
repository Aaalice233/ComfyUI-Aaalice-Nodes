/** Keeps linked Seed controls equal at every queue serialization boundary. */

const installations = new WeakMap();

function runSynchronization(synchronizeGraph, graph, phase, onError) {
	try { return synchronizeGraph(graph, { phase }); }
	catch (error) {
		onError?.(error, { graph, phase });
		throw error;
	}
}

export function installLinkedSeedQueueHook(app, { prepareGraph = null, synchronizeGraph, onError = null } = {}) {
	if (!app || typeof app.queuePrompt !== "function" || typeof app.graphToPrompt !== "function") throw new TypeError("Linked Seed queue hook requires queuePrompt() and graphToPrompt()");
	if (typeof prepareGraph !== "function" && prepareGraph !== null) throw new TypeError("Linked Seed queue hook requires a synchronous prepareGraph()");
	if (typeof synchronizeGraph !== "function") throw new TypeError("Linked Seed queue hook requires synchronizeGraph()");
	if (installations.has(app)) return installations.get(app);
	const originalQueuePrompt = app.queuePrompt;
	const originalGraphToPrompt = app.graphToPrompt;
	let queueDepth = 0;
	const serializedGraphs = new Set();
	app.graphToPrompt = async function (graph, ...args) {
		if (queueDepth > 0 && graph) {
			try { prepareGraph?.(graph, { phase: "before-serialize" }); }
			catch (error) { onError?.(error, { graph, phase: "before-serialize" }); throw error; }
			runSynchronization(synchronizeGraph, graph, "before-serialize", onError);
			serializedGraphs.add(graph);
		}
		return originalGraphToPrompt.call(this, graph, ...args);
	};
	app.queuePrompt = async function (...args) {
		queueDepth++;
		try { return await originalQueuePrompt.apply(this, args); }
		finally {
			queueDepth--;
			if (queueDepth === 0) {
				const graphs = [...serializedGraphs]; serializedGraphs.clear();
				for (const graph of graphs) runSynchronization(synchronizeGraph, graph, "after-queue", onError);
			}
		}
	};
	const installation = { originalQueuePrompt, originalGraphToPrompt, prepareGraph };
	installations.set(app, installation);
	return installation;
}
