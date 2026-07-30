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
import {
	computeCompactSetColumnPositions,
	computeLinkedSetPosition,
} from "./lib/kj_set_layout.js";
import {
	allGraphNodes,
	findGraphNode,
	graphDescendants,
	graphId,
	graphRoute,
	isGraphAncestor,
	rootGraph,
} from "./lib/graph_scope.js";

const MAX = 32;
const KJ_SET_NODE = "SetNode";
const KJ_GET_NODE = "GetNode";
export const EVENT_PARAMETER_KJ_CHANGED = "aaalice-parameter-panel-kj-changed";
const titleWatchers = new WeakMap();

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
	return findGraphNode(graph, nodeId);
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

function isNodeType(node, type) {
	return [node?.type, node?.comfyClass, node?.constructor?.comfyClass].includes(type);
}

function resolvedInputNode(resolved, fallbackGraph, fallbackNodeId) {
	return resolved?.inputNode || getGraphNode(fallbackGraph, fallbackNodeId);
}

function collectSetTargetsFromResolved(resolved, result, seen) {
	const target = resolved?.inputNode;
	if (!target) return;
	if (isNodeType(target, KJ_SET_NODE)) {
		if (!seen.has(target)) {
			seen.add(target);
			result.push(target);
		}
		return;
	}
	if (!target.subgraph || typeof target.resolveSubgraphInputLinks !== "function") return;
	const slot = target.inputs?.indexOf?.(resolved.input);
	if (slot == null || slot < 0) return;
	for (const inner of target.resolveSubgraphInputLinks(slot) || []) collectSetTargetsFromResolved(inner, result, seen);
}

export function directSetNodes(panel, outputIndex) {
	const graph = panel?.graph;
	const output = panel?.outputs?.[outputIndex];
	if (!graph || !output?.links?.length) return [];
	const result = [];
	const seen = new Set();
	for (const linkId of output.links) {
		const link = getGraphLink(graph, linkId);
		if (!link || String(link.origin_id) !== String(panel.id)) continue;
		const resolved = typeof link.resolve === "function" ? link.resolve(graph) : {
			inputNode: resolvedInputNode(null, graph, link.target_id),
			input: getGraphNode(graph, link.target_id)?.inputs?.[link.target_slot],
		};
		collectSetTargetsFromResolved(resolved, result, seen);
	}
	return result;
}

function connectAncestorToDescendant(sourceNode, sourceSlot, targetNode, targetSlot, name, type, createdBridgeSlots) {
	const route = graphRoute(sourceNode?.graph, targetNode?.graph);
	if (!route) throw new Error(message("aaalice.pcp.kj.scopeUnsupported", "KJ routing only supports the current graph or a descendant subgraph."));
	if (!route.length) {
		sourceNode.connect(sourceSlot, targetNode, targetSlot);
		return;
	}
	let source = { kind: "node", node: sourceNode, slot: sourceSlot };
	for (const wrapper of route) {
		const child = wrapper.subgraph;
		const input = child.addInput(name, type);
		const wrapperSlot = child.inputs.indexOf(input);
		if (source.kind === "node") source.node.connect(source.slot, wrapper, wrapperSlot);
		else source.input.connect(wrapper.inputs[wrapperSlot], wrapper);
		createdBridgeSlots?.push({ graph: child, kind: "input", slot: input });
		source = { kind: "subgraph-input", input };
	}
	source.input.connect(targetNode.inputs[targetSlot], targetNode);
}

export function connectDescendantToAncestor(sourceNode, sourceSlot, targetNode, targetSlot, name, type, createdBridgeSlots) {
	const route = graphRoute(targetNode?.graph, sourceNode?.graph);
	if (!route) throw new Error(message("aaalice.pcp.kj.scopeUnsupported", "KJ routing only supports the current graph or a descendant subgraph."));
	if (!route.length) {
		sourceNode.connect(sourceSlot, targetNode, targetSlot);
		return;
	}
	let source = { node: sourceNode, slot: sourceSlot };
	for (const wrapper of [...route].reverse()) {
		const child = wrapper.subgraph;
		const output = child.addOutput(name, type);
		const wrapperSlot = child.outputs.indexOf(output);
		output.connect(source.node.outputs[source.slot], source.node);
		createdBridgeSlots?.push({ graph: child, kind: "output", slot: output });
		source = { node: wrapper, slot: wrapperSlot };
	}
	source.node.connect(source.slot, targetNode, targetSlot);
}

export function removeCreatedBridgeSlots(createdBridgeSlots) {
	for (const entry of [...(createdBridgeSlots || [])].reverse()) {
		if (entry.kind === "input") entry.graph?.removeInput?.(entry.slot);
		else entry.graph?.removeOutput?.(entry.slot);
	}
}

function preferredSetGraph(panel, requested) {
	if (requested && isGraphAncestor(panel.graph, requested)) return requested;
	const graphs = new Set(panelMeta(panel).flatMap((_parameter, index) => directSetNodes(panel, index).map((node) => node.graph)));
	return graphs.size === 1 ? [...graphs][0] : panel.graph;
}

function placeSetNode(setNode, panel, outputIndex, targetGraph, existingSets) {
	if (targetGraph === panel.graph) {
		const layout = computeParameterLayout(panel);
		const collapsedHeight = Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT) || 30;
		setNode.pos = computeLinkedSetPosition(panel, layout, outputIndex, collapsedHeight);
		return;
	}
	const anchor = existingSets.find((node) => node.graph === targetGraph);
	const titleHeight = Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT) || 30;
	setNode.pos = anchor
		? [Number(anchor.pos?.[0]) || 0, (Number(anchor.pos?.[1]) || 0) + titleHeight * (outputIndex + 1)]
		: [80, 80 + titleHeight * outputIndex];
}

export function arrangeLinkedKjSets(panel) {
	if (!panel?.graph) return { arranged: 0, moved: 0 };
	const entries = panelMeta(panel).map((_parameter, parameterIndex) => ({
		parameterIndex,
		node: directSetNodes(panel, parameterIndex)[0] || null,
	})).filter((entry) => entry.node?.graph);
	const grouped = new Map();
	for (const entry of entries) {
		const list = grouped.get(entry.node.graph) || [];
		list.push(entry);
		grouped.set(entry.node.graph, list);
	}
	const collapsedHeight = Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT) || 30;
	const panelLayout = computeParameterLayout(panel);
	let moved = 0;
	for (const [targetGraph, graphEntries] of grouped) {
		const positions = targetGraph === panel.graph
			? graphEntries.map((entry) => computeLinkedSetPosition(panel, panelLayout, entry.parameterIndex, collapsedHeight))
			: computeCompactSetColumnPositions(graphEntries.map((entry) => entry.node.pos), collapsedHeight);
		for (let index = 0; index < graphEntries.length; index += 1) {
			const node = graphEntries[index].node;
			const next = positions[index];
			if (Number(node.pos?.[0]) !== next[0] || Number(node.pos?.[1]) !== next[1]) moved += 1;
			node.pos = next;
			node.flags ||= {};
			node.flags.collapsed = true;
		}
	}
	return { arranged: entries.length, moved };
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
	const setNames = {};
	for (const [index, parameter] of panelMeta(panel).entries()) {
		const setNodes = directSetNodes(panel, index);
		for (const setNode of setNodes) {
			try {
				if (renameKjSet(setNode, desiredSetName(panel, parameter)).changed) updated += 1;
			} catch (error) {
				errors.push(error);
				console.error("[Aaalice] Failed to refresh linked KJ SetNode", setNode, error);
			}
		}
		const actualName = setNodes[0]?.widgets?.[0]?.value;
		if (actualName) setNames[String(parameter.id)] = String(actualName);
	}
	window.dispatchEvent(new CustomEvent(EVENT_PARAMETER_KJ_CHANGED, {
		detail: { nodeId: panel.id, node: panel, updated, errors, setNames },
	}));
	return { updated, errors, setNames };
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

function installTitleWatcher(panel) {
	if (!panel || titleWatchers.has(panel)) return;
	const original = Object.getOwnPropertyDescriptor(panel, "title");
	if (!original?.configurable) return;
	const isDataDescriptor = !original.get && !original.set;
	let dataValue = original.value;
	const read = original.get
		? function () { return original.get.call(this); }
		: function () { return dataValue; };
	const write = original.set
		? function (value) { original.set.call(this, value); }
		: original.writable
			? function (value) { dataValue = value; }
			: null;
	if (!write) return;
	const wrappedGet = function () {
		return read.call(this);
	};
	const wrappedSet = function (value) {
		const previous = read.call(this);
		write.call(this, value);
		if (read.call(this) !== previous) scheduleRefresh(this);
	};
	Object.defineProperty(panel, "title", {
		configurable: true,
		enumerable: original.enumerable,
		get: wrappedGet,
		set: wrappedSet,
	});
	titleWatchers.set(panel, {
		original,
		isDataDescriptor,
		wrappedGet,
		wrappedSet,
	});
}

function uninstallTitleWatcher(panel) {
	const state = panel && titleWatchers.get(panel);
	if (!state) return;
	const current = Object.getOwnPropertyDescriptor(panel, "title");
	if (current?.get === state.wrappedGet && current?.set === state.wrappedSet) {
		const value = panel.title;
		Object.defineProperty(panel, "title", state.isDataDescriptor
			? { ...state.original, value }
			: state.original);
	}
	titleWatchers.delete(panel);
}

export function registerParameterPanelKj(panel) {
	if (!isParameterPanel(panel) || panel._aaaliceParameterPanelKjMounted) return;
	panel._aaaliceParameterPanelKjMounted = true;
	const onParameterChange = (event) => {
		if (event.detail?.node && event.detail.node !== panel) return;
		if (!event.detail?.node && event.detail?.nodeId != null && String(event.detail.nodeId) !== String(panel.id)) return;
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
		installTitleWatcher(this);
		scheduleRefresh(this);
		return value;
	};
	const previousConfigure = panel.onConfigure;
	panel.onConfigure = function () {
		const value = previousConfigure?.apply(this, arguments);
		installTitleWatcher(this);
		setTimeout(() => scheduleRefresh(this), 0);
		return value;
	};
	const previousRemoved = panel.onRemoved;
	panel.onRemoved = function () {
		window.removeEventListener(EVENT_PARAMETER_CHANGED, onParameterChange);
		uninstallTitleWatcher(this);
		return previousRemoved?.apply(this, arguments);
	};
	installTitleWatcher(panel);
	scheduleRefresh(panel);
}

export function createLinkedKjSets(panel, { changeBoundary = true, preferredGraph = null } = {}) {
	if (!panel?.graph) throw new Error(message("aaalice.pcp.kj.graphUnavailable", "The current graph is unavailable."));
	if (!isKjReady()) return { created: 0, createdNodes: [], createdBridgeSlots: [], updated: 0, arranged: 0, moved: 0, errors: [] };
	const meta = panelMeta(panel);
	if (!meta.length) return { created: 0, createdNodes: [], createdBridgeSlots: [], updated: 0, arranged: 0, moved: 0, errors: [] };
	const graph = panel.graph;
	const targetGraph = preferredSetGraph(panel, preferredGraph);
	const { liteGraph } = kjNodeTypes();
	let created = 0;
	const createdNodes = [];
	const createdBridgeSlots = [];
	let updated = 0;
	let arranged = 0;
	let moved = 0;
	const errors = [];
	const transactionGraph = rootGraph(graph);
	if (changeBoundary) transactionGraph?.beforeChange?.();
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
				placeSetNode(setNode, panel, index, targetGraph, createdNodes);
				targetGraph.add(setNode);
				try {
					connectAncestorToDescendant(
						panel,
						index,
						setNode,
						0,
						desiredSetName(panel, meta[index]),
						panel.outputs?.[index]?.type || "*",
						createdBridgeSlots,
					);
				} catch (error) {
					targetGraph.remove?.(setNode);
					errors.push(error);
					continue;
				}
				sets = directSetNodes(panel, index);
				if (!sets.includes(setNode)) {
					errors.push(new Error(message("aaalice.pcp.kj.connectFailed", "The KJ Set node could not be connected.")));
					targetGraph.remove?.(setNode);
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
		if (!errors.length) ({ arranged, moved } = arrangeLinkedKjSets(panel));
	} finally {
		if (errors.length) {
			for (const node of createdNodes) node.graph?.remove?.(node);
			removeCreatedBridgeSlots(createdBridgeSlots);
			createdNodes.length = 0;
			createdBridgeSlots.length = 0;
			created = 0;
		}
		if (changeBoundary) transactionGraph?.afterChange?.();
		transactionGraph?.setDirtyCanvas?.(true, true);
		app.canvas?.setDirty?.(true, true);
	}
	return { created, createdNodes, createdBridgeSlots, updated, arranged, moved, errors };
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
					nativeToast("success", message("aaalice.pcp.kj.created", "KJ Set nodes ready: {count} created, {arranged} arranged.", {
						count: result.created,
						arranged: result.arranged,
					}));
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

function isReceiver(node) {
	return [node?.type, node?.comfyClass, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes("ParameterReceiver");
}

export function boundParameterReceivers(panel) {
	if (!isParameterPanel(panel) || !panel.graph) return [];
	const allowedGraphs = new Set([panel.graph, ...graphDescendants(panel.graph)]);
	const panelGraphId = graphId(panel.graph);
	return allGraphNodes(rootGraph(panel.graph)).filter((node) => {
		if (!isReceiver(node) || !allowedGraphs.has(node.graph)) return false;
		const receiverBinding = node.properties?.receiverBinding;
		if (String(receiverBinding?.panelNodeId) !== String(panel.id)) return false;
		if (receiverBinding?.panelGraphId != null) return String(receiverBinding.panelGraphId) === panelGraphId;
		return node._aaaliceResolveParameterPanel?.() === panel || isGraphAncestor(panel.graph, node.graph);
	});
}

function receiverLabel(receiver, duplicated) {
	const title = String(receiver?.title || "ParameterReceiver");
	return duplicated ? `${title} (#${receiver.id}, ${graphId(receiver.graph)})` : title;
}

export function navigateToGraphNode(node) {
	const canvas = app.canvas;
	if (!canvas || !node?.graph) return false;
	if (canvas.graph !== node.graph) {
		if (typeof canvas.setGraph !== "function") return false;
		canvas.setGraph(node.graph);
	}
	const focus = () => {
		canvas.centerOnNode?.(node);
		canvas.selectNode?.(node, false);
		canvas.setDirty?.(true, true);
	};
	if (canvas.graph === node.graph) focus();
	else setTimeout(focus, 0);
	return true;
}

async function syncBoundReceivers(panel) {
	const receivers = boundParameterReceivers(panel);
	if (!receivers.length) {
		nativeToast("info", t("aaalice.pcp.kj.noReceivers", "No bound Parameter Receivers are available."));
		return;
	}
	let synchronized = 0;
	for (const receiver of receivers) {
		if (await receiver._aaaliceSynchronizeParameterReceiver?.(panel, { successToast: false })) synchronized += 1;
	}
	if (synchronized === receivers.length) {
		nativeToast("success", message("aaalice.pcp.kj.receiversSynced", "Parameter Receivers synchronized: {count}.", { count: synchronized }));
	} else if (synchronized) {
		nativeToast("info", message("aaalice.pcp.kj.receiversPartiallySynced", "Parameter Receivers synchronized: {count} of {total}.", {
			count: synchronized,
			total: receivers.length,
		}));
	}
}

export function parameterPanelReceiverMenuItems(panel) {
	const receivers = boundParameterReceivers(panel);
	const titleCounts = new Map(receivers.map((receiver) => {
		const title = String(receiver?.title || "ParameterReceiver");
		return [title, receivers.filter((candidate) => String(candidate?.title || "ParameterReceiver") === title).length];
	}));
	const locateOptions = receivers.map((receiver) => {
		const title = String(receiver?.title || "ParameterReceiver");
		return {
			content: receiverLabel(receiver, titleCounts.get(title) > 1),
			callback: () => {
				if (!navigateToGraphNode(receiver)) nativeToast("error", t("aaalice.pcp.kj.receiverNavigateFailed", "The Parameter Receiver cannot be opened on the current canvas."));
			},
		};
	});
	return [
		{
			content: t("aaalice.pcp.kj.syncReceivers", "🔄 Sync Parameter Receivers"),
			disabled: !receivers.length,
			callback: () => syncBoundReceivers(panel).catch((error) => {
				console.error("[Aaalice] Failed to synchronize Parameter Receivers from ParameterPanel", error);
				nativeToast("error", message("aaalice.receiver.toast.syncFailed", "Parameter Receiver sync failed: {reason}", { reason: error?.message || String(error) }));
			}),
		},
		{
			content: t("aaalice.pcp.kj.locateReceivers", "🎯 Locate Parameter Receiver"),
			disabled: !receivers.length,
			...(receivers.length === 1
				? { callback: locateOptions[0]?.callback }
				: { has_submenu: true, submenu: { title: "ParameterReceiver", options: locateOptions } }),
		},
	];
}
