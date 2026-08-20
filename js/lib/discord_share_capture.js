/** Captures the latest completed ComfyUI execution without serializing result data. */

import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";
import { findNodeByExecutionId, findNodeByGraphRef, graphId, rootGraph } from "./graph_scope.js";
import {
	createShareSnapshot,
	normalizeDiscordShareWorkflowState,
	normalizePromptBinding,
} from "./discord_share_model.js";
import { nativeOutputNodeClass } from "./native_output_model.js";

export const DISCORD_SHARE_WORKFLOW_KEY = "aaaliceDiscordShare";

function currentWorkflowState(graph = rootGraph(app.graph)) {
	return normalizeDiscordShareWorkflowState(graph?.extra?.[DISCORD_SHARE_WORKFLOW_KEY]);
}

export function promptSourceBinding() {
	return currentWorkflowState().promptSource;
}

export function resolvePromptSource() {
	const binding = promptSourceBinding();
	return binding ? findNodeByGraphRef(app.graph, binding.graphId, binding.nodeId) : null;
}

export function setPromptSource(node) {
	if (nativeOutputNodeClass(node) !== "PreviewAny" || !node?.graph || node.id == null) {
		throw new Error("[Aaalice] Discord share prompt source must be a PreviewAny node");
	}
	const binding = normalizePromptBinding({
		graphId: graphId(node.graph),
		nodeId: node.id,
		label: String(node.title || node.constructor?.title || "Preview Any"),
	});
	const graph = rootGraph(node.graph);
	graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[DISCORD_SHARE_WORKFLOW_KEY] = {
			...currentWorkflowState(graph),
			promptSource: binding,
		};
	} finally {
		graph?.afterChange?.();
		graph?.setDirtyCanvas?.(true, true);
	}
	captureEvents.dispatchEvent(new CustomEvent("prompt-source-change", { detail: binding }));
	return binding;
}

export function clearPromptSource() {
	const graph = rootGraph(app.graph);
	if (!graph) return;
	graph.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[DISCORD_SHARE_WORKFLOW_KEY] = {
			...currentWorkflowState(graph),
			promptSource: null,
		};
	} finally {
		graph.afterChange?.();
		graph.setDirtyCanvas?.(true, true);
	}
	captureEvents.dispatchEvent(new CustomEvent("prompt-source-change", { detail: null }));
}

async function fetchHistoryOutputs(promptId) {
	const fetcher = typeof api.fetchApi === "function"
		? (path) => api.fetchApi(path)
		: (path) => fetch(path);
	const response = await fetcher(`/history/${encodeURIComponent(promptId)}`);
	if (!response.ok) throw new Error(`history request failed with HTTP ${response.status}`);
	const payload = await response.json();
	const entry = payload?.[promptId] || payload?.[String(promptId)] || payload;
	return entry?.outputs && typeof entry.outputs === "object" ? entry.outputs : {};
}

class DiscordShareCapture extends EventTarget {
	constructor() {
		super();
		this.started = false;
		this.sequence = 0;
		this.latestSequence = 0;
		this.latest = null;
		this.executedOutputs = new Map();
		this.promptSequences = new Map();
	}

	start() {
		if (this.started) return;
		this.started = true;
		api.addEventListener("execution_start", (event) => {
			const promptId = String(event.detail?.prompt_id || "");
			if (!promptId) return;
			const sequence = ++this.sequence;
			this.promptSequences.set(promptId, sequence);
			this.executedOutputs.set(promptId, new Map());
		});
		api.addEventListener("executed", (event) => {
			const promptId = String(event.detail?.prompt_id || "");
			const executionId = event.detail?.display_node ?? event.detail?.node;
			if (!promptId || executionId == null) return;
			const outputs = this.executedOutputs.get(promptId) || new Map();
			const outputId = String(executionId);
			outputs.delete(outputId);
			outputs.set(outputId, event.detail?.output || {});
			this.executedOutputs.set(promptId, outputs);
		});
		api.addEventListener("execution_success", (event) => {
			const promptId = String(event.detail?.prompt_id || "");
			if (promptId) void this.finalize(promptId);
		});
		const finalizePartial = (event) => {
			const promptId = String(event.detail?.prompt_id || "");
			if (promptId) void this.finalize(promptId, { includeHistory: false, preserveOnEmpty: true });
		};
		api.addEventListener("execution_error", finalizePartial);
		api.addEventListener("execution_interrupted", finalizePartial);
	}

	async finalize(promptId, { includeHistory = true, preserveOnEmpty = false } = {}) {
		const sequence = this.promptSequences.get(promptId) || ++this.sequence;
		const outputs = this.executedOutputs.get(promptId) || new Map();
		if (includeHistory) {
			try {
				const historyOutputs = await fetchHistoryOutputs(promptId);
				for (const [executionId, output] of Object.entries(historyOutputs)) outputs.set(executionId, output);
			} catch (error) {
				console.warn("[Aaalice] Discord share could not read completed history; using live execution outputs.", error);
			}
		}
		const binding = promptSourceBinding();
		const snapshot = createShareSnapshot({
			promptId,
			outputs,
			promptBinding: binding,
			resolveNode: (executionId) => findNodeByExecutionId(app.graph, executionId),
		});
		this.executedOutputs.delete(promptId);
		this.promptSequences.delete(promptId);
		if ((preserveOnEmpty && snapshot.images.length === 0) || sequence < this.latestSequence) return;
		this.latestSequence = sequence;
		this.latest = snapshot;
		this.dispatchEvent(new CustomEvent("latest-run-change", { detail: this.latest }));
	}
}

export const captureEvents = new DiscordShareCapture();
