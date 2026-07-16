/** Optional KJ Set/Get integration for direct ParameterPanel outputs. */
import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";
import {
	EVENT_PARAMETER_CHANGED,
	displayName,
	ensureParameters,
	isParameterPanel,
	tunableMeta,
} from "./lib/param_model.js";
import { computeParameterLayout } from "./lib/parameter_layout.js";
import { computeLinkedSetPosition } from "./lib/kj_set_layout.js";

const MAX = 32;
const KJ_SET_NODE = "SetNode";
const KJ_GET_NODE = "GetNode";
export const EVENT_PARAMETER_KJ_CHANGED = "aaalice-parameter-panel-kj-changed";
const graphWatchers = new WeakMap();
const nodeWatchGraphs = new WeakMap();

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

export function nativeToast(severity, detail) {
	app.extensionManager?.toast?.add?.({
		severity,
		summary: t(`aaalice.common.${severity === "error" ? "error" : "notice"}`, severity === "error" ? "Error" : "Notice"),
		detail,
		life: 4500,
	});
}

export function getGraphLink(graph, linkId) {
	if (linkId == null || !graph) return null;
	if (typeof graph.getLink === "function") return graph.getLink(linkId);
	const links = graph.links;
	if (typeof links?.get === "function") return links.get(linkId) || null;
	const internalLinks = graph._links;
	if (typeof internalLinks?.get === "function") return internalLinks.get(linkId) || null;
	return links?.[linkId] || internalLinks?.[linkId] || null;
}

export function getGraphNode(graph, nodeId) {
	if (typeof graph?.getNodeById === "function") return graph.getNodeById(nodeId);
	if (typeof graph?._nodes_by_id?.get === "function") return graph._nodes_by_id.get(nodeId) || null;
	return graph?._nodes_by_id?.[nodeId] || null;
}

function kjNodeTypes() {
	const liteGraph = globalThis.LiteGraph;
	const registered = liteGraph?.registered_node_types;
	return { liteGraph, registered };
}

function hasRegisteredType(registered, name) {
	return typeof registered?.has === "function" ? registered.has(name) : Boolean(registered?.[name]);
}

export function isKjReady() {
	const { liteGraph, registered } = kjNodeTypes();
	return typeof liteGraph?.createNode === "function"
		&& hasRegisteredType(registered, KJ_SET_NODE)
		&& hasRegisteredType(registered, KJ_GET_NODE);
}

export function panelMeta(panel) {
	return tunableMeta(ensureParameters(panel)).slice(0, MAX);
}

export function panelTitle(panel) {
	return String(panel?.title || "").trim() || "ParameterPanel";
}

export function desiredSetName(panel, parameter) {
	const parameterName = String(displayName(parameter, parameter?.id || "parameter")).trim() || "parameter";
	return `${panelTitle(panel)}_${parameterName}`;
}

export function directSetNodes(panel, outputIndex) {
	const graph = panel?.graph;
	const output = panel?.outputs?.[outputIndex];
	if (!graph || !output?.links?.length) return [];
	const result = [];
	const seen = new Set();
	for (const linkId of output.links) {
		const link = getGraphLink(graph, linkId);
		if (!link || link.origin_id !== panel.id || Number(link.target_slot) !== 0) continue;
		const target = getGraphNode(graph, link.target_id);
		if (!target || ![target.type, target.comfyClass, target.constructor?.comfyClass].includes(KJ_SET_NODE) || seen.has(target.id)) continue;
		seen.add(target.id);
		result.push(target);
	}
	return result;
}

export function renameKjSet(setNode, nextName) {
	const widget = setNode?.widgets?.[0];
	if (!setNode?.graph || !widget || typeof setNode.validateName !== "function") {
		throw new Error("KJ SetNode is missing its naming API.");
	}
	const previousWidgetName = String(widget.value ?? "");
	const previousName = String(setNode.properties?.previousName || previousWidgetName);
	widget.value = nextName;
	setNode.validateName(setNode.graph);
	const finalName = String(widget.value ?? "");
	setNode.properties ||= {};
	setNode.properties.previousName = previousName;
	setNode.update?.();
	setNode.properties.previousName = finalName;
	return { changed: finalName !== previousWidgetName, name: finalName };
}

function refreshKjSetNames(panel) {
	if (!panel?.graph || !isKjReady()) return { updated: 0, errors: [] };
	let updated = 0;
	const errors = [];
	for (const [index, parameter] of panelMeta(panel).entries()) {
		for (const setNode of directSetNodes(panel, index)) {
			try {
				if (renameKjSet(setNode, desiredSetName(panel, parameter)).changed) updated += 1;
			} catch (error) {
				errors.push(error);
				console.error("[Aaalice] Failed to refresh linked KJ SetNode", setNode, error);
			}
		}
	}
	window.dispatchEvent(new CustomEvent(EVENT_PARAMETER_KJ_CHANGED, {
		detail: { nodeId: panel.id, node: panel, updated, errors },
	}));
	return { updated, errors };
}

function scheduleRefresh(panel) {
	if (!panel || panel._aaaliceKjRefreshScheduled) return;
	panel._aaaliceKjRefreshScheduled = true;
	const run = () => {
		panel._aaaliceKjRefreshScheduled = false;
		if (panel.graph) refreshKjSetNames(panel);
	};
	if (typeof queueMicrotask === "function") queueMicrotask(run);
	else setTimeout(run, 0);
}

function installGraphWatcher(panel) {
	const graph = panel?.graph;
	if (!graph) return;
	nodeWatchGraphs.set(panel, graph);
	let state = graphWatchers.get(graph);
	if (state) {
		state.nodes.add(panel);
		return;
	}
	state = { nodes: new Set([panel]), previous: graph.onTrigger, handler: null };
	state.handler = (event) => {
		state.previous?.call(graph, event);
		if (event?.type !== "node:property:changed" || event.property !== "title") return;
		const changedNode = event.node || getGraphNode(graph, event.nodeId);
		if (!isParameterPanel(changedNode)) return;
		for (const candidate of state.nodes) {
			if (candidate.graph === graph && candidate === changedNode) scheduleRefresh(candidate);
		}
	};
	graph.onTrigger = state.handler;
	graphWatchers.set(graph, state);
}

function uninstallGraphWatcher(panel) {
	const graph = panel?.graph || nodeWatchGraphs.get(panel);
	const state = graph && graphWatchers.get(graph);
	nodeWatchGraphs.delete(panel);
	if (!state) return;
	state.nodes.delete(panel);
	if (state.nodes.size) return;
	if (graph.onTrigger === state.handler) graph.onTrigger = state.previous;
	graphWatchers.delete(graph);
}

export function registerParameterPanelKj(panel) {
	if (!isParameterPanel(panel) || panel._aaaliceParameterPanelKjMounted) return;
	panel._aaaliceParameterPanelKjMounted = true;
	const onParameterChange = (event) => {
		if (event.detail?.nodeId != null && String(event.detail.nodeId) !== String(panel.id)) return;
		scheduleRefresh(panel);
	};
	window.addEventListener(EVENT_PARAMETER_CHANGED, onParameterChange);
	const previousConnections = panel.onConnectionsChange;
	panel.onConnectionsChange = function () {
		const value = previousConnections?.apply(this, arguments);
		scheduleRefresh(this);
		return value;
	};
	const previousAdded = panel.onAdded;
	panel.onAdded = function () {
		const value = previousAdded?.apply(this, arguments);
		installGraphWatcher(this);
		scheduleRefresh(this);
		return value;
	};
	const previousConfigure = panel.onConfigure;
	panel.onConfigure = function () {
		const value = previousConfigure?.apply(this, arguments);
		installGraphWatcher(this);
		setTimeout(() => scheduleRefresh(this), 0);
		return value;
	};
	const previousRemoved = panel.onRemoved;
	panel.onRemoved = function () {
		window.removeEventListener(EVENT_PARAMETER_CHANGED, onParameterChange);
		uninstallGraphWatcher(this);
		return previousRemoved?.apply(this, arguments);
	};
	installGraphWatcher(panel);
	scheduleRefresh(panel);
}

export function createLinkedKjSets(panel, { changeBoundary = true } = {}) {
	if (!panel?.graph) throw new Error(message("aaalice.pcp.kj.graphUnavailable", "The current graph is unavailable."));
	if (!isKjReady()) return { created: 0, createdNodes: [], updated: 0, errors: [] };
	const meta = panelMeta(panel);
	if (!meta.length) return { created: 0, createdNodes: [], updated: 0, errors: [] };
	const graph = panel.graph;
	const { liteGraph } = kjNodeTypes();
	let created = 0;
	const createdNodes = [];
	let updated = 0;
	const errors = [];
	if (changeBoundary) graph.beforeChange?.();
	try {
		for (let index = 0; index < meta.length; index += 1) {
			let sets = directSetNodes(panel, index);
			if (!sets.length) {
				const setNode = liteGraph.createNode(KJ_SET_NODE);
				if (!setNode) {
					errors.push(new Error(message("aaalice.pcp.kj.createFailed", "Unable to create a KJ Set node.")));
					continue;
				}
				setNode.flags ||= {};
				setNode.flags.collapsed = true;
				const layout = computeParameterLayout(panel);
				const collapsedHeight = Number(liteGraph.NODE_TITLE_HEIGHT) || 30;
				setNode.pos = computeLinkedSetPosition(panel, layout, index, collapsedHeight);
				graph.add(setNode);
				try {
					panel.connect(index, setNode, 0);
				} catch (error) {
					graph.remove?.(setNode);
					errors.push(error);
					continue;
				}
				sets = directSetNodes(panel, index);
				if (!sets.includes(setNode)) {
					errors.push(new Error(message("aaalice.pcp.kj.connectFailed", "The KJ Set node could not be connected.")));
					graph.remove?.(setNode);
					continue;
				}
				created += 1;
				createdNodes.push(setNode);
			}
			for (const setNode of sets) {
				try {
					if (renameKjSet(setNode, desiredSetName(panel, meta[index])).changed) updated += 1;
				} catch (error) {
					errors.push(error);
					console.error("[Aaalice] Failed to name linked KJ SetNode", setNode, error);
				}
			}
		}
	} finally {
		if (changeBoundary) graph.afterChange?.();
		graph.setDirtyCanvas?.(true, true);
		app.canvas?.setDirty?.(true, true);
	}
	return { created, createdNodes, updated, errors };
}

export function parameterPanelKjMenuItem(panel) {
	if (!isParameterPanel(panel) || !isKjReady()) return null;
	return {
		content: t("aaalice.pcp.kj.menu", "🔗 Create and link KJ Set nodes for all parameters"),
		callback: () => {
			const meta = panelMeta(panel);
			if (!meta.length) {
				nativeToast("info", message("aaalice.pcp.kj.noParameters", "No tunable parameters are available."));
				return;
			}
			try {
				const result = createLinkedKjSets(panel);
				if (result.errors.length) {
					nativeToast("error", message("aaalice.pcp.kj.linkFailed", "Some KJ Set nodes could not be linked: {reason}", {
						reason: result.errors[0]?.message || String(result.errors[0]),
					}));
				} else {
					nativeToast("success", message("aaalice.pcp.kj.created", "KJ Set nodes ready: {count} created.", { count: result.created }));
				}
			} catch (error) {
				console.error("[Aaalice] Failed to create linked KJ SetNodes", error);
				nativeToast("error", message("aaalice.pcp.kj.linkFailed", "Some KJ Set nodes could not be linked: {reason}", {
					reason: error?.message || String(error),
				}));
			}
		},
	};
}
