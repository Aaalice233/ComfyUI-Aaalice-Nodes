/** ParameterReceiver binding, synchronization, compact UI and lifecycle. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	cleanupDomWidgetResizePassthrough,
	growClassicDomWidgetNode,
	installDomWidgetResizePassthrough,
} from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { button, createDialog, el, iconButton } from "./lib/ui.js";
import {
	EVENT_PARAMETER_CHANGED,
	isParameterPanel,
} from "./lib/param_model.js";
import {
	disambiguatePanelLabels,
	emptyReceiverBinding,
	normalizeReceiverBinding,
	receiverSlotsShareStablePrefix,
	receiverStructureDiff,
	reconcileReceiverSlots,
} from "./lib/receiver_model.js";
import {
	RECEIVER_LAYOUT,
	computeReceiverLayout,
	reshapeReceiverSlots,
	syncReceiverLayout,
} from "./lib/receiver_layout.js";
import {
	publishDynamicSlotState,
	refreshDynamicSlotGeometry,
} from "./lib/dynamic_slots.js";
import {
	EVENT_PARAMETER_KJ_CHANGED,
	connectDescendantToAncestor,
	createLinkedKjSets,
	desiredSetName,
	directSetNodes,
	getGraphLink,
	getGraphNode,
	isKjReady,
	navigateToGraphNode,
	nativeToast,
	panelMeta,
	removeCreatedBridgeSlots,
} from "./parameter_panel_kj.js";
import {
	allGraphNodes,
	directSubgraphNodes,
	findNodeByGraphRef,
	graphAncestors,
	graphId,
	isGraphAncestor,
	rootGraph,
} from "./lib/graph_scope.js";
import {
	RECEIVER_GRAPH_SCOPE_ERROR,
	selectManagedGetGraph,
} from "./lib/receiver_graph_scope.js";

const NODE = "ParameterReceiver";
const GET_NODE = "GetNode";
const OWNER_KEY = "aaaliceReceiverOwner";
const mountedReceivers = new Set();
let vueReceiverObserver = null;
let vueReceiverFrame = 0;

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function isReceiver(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function binding(node) {
	node.properties ||= {};
	node.properties.receiverBinding = normalizeReceiverBinding(node.properties.receiverBinding);
	return node.properties.receiverBinding;
}

function panelFor(node) {
	const current = binding(node);
	if (current.panelNodeId == null) return null;
	const graphs = graphAncestors(node.graph);
	if (current.panelGraphId != null) {
		const graph = graphs.find((candidate) => graphId(candidate) === String(current.panelGraphId));
		return graph ? getGraphNode(graph, current.panelNodeId) : null;
	}
	for (const graph of graphs) {
		const panel = getGraphNode(graph, current.panelNodeId);
		if (isParameterPanel(panel)) return panel;
	}
	return null;
}

function visiblePanels(receiver) {
	return graphAncestors(receiver?.graph).flatMap((graph) => (graph?._nodes || []).filter(isParameterPanel));
}

function isGetNode(node) {
	return [node?.type, node?.comfyClass, node?.constructor?.comfyClass].includes(GET_NODE);
}

function ownerMatches(getNode, receiver, slot) {
	const owner = getNode?.properties?.[OWNER_KEY];
	const current = binding(receiver);
	return owner && String(owner.receiverNodeId) === String(receiver.id)
		&& (owner.receiverGraphId == null || String(owner.receiverGraphId) === graphId(receiver.graph))
		&& String(owner.panelNodeId) === String(current.panelNodeId)
		&& (owner.panelGraphId == null || current.panelGraphId == null || String(owner.panelGraphId) === String(current.panelGraphId))
		&& String(owner.parameterId) === String(slot.parameterId);
}

function resolveGetFromResolved(resolved, seen = new Set()) {
	const source = resolved?.outputNode;
	if (!source || seen.has(source)) return null;
	seen.add(source);
	if (isGetNode(source)) return source;
	if (!source.subgraph || typeof source.resolveSubgraphOutputLink !== "function") return null;
	const slot = source.outputs?.indexOf?.(resolved.output);
	if (slot == null || slot < 0) return null;
	return resolveGetFromResolved(source.resolveSubgraphOutputLink(slot), seen);
}

function inputGet(receiver, index) {
	const link = getGraphLink(receiver.graph, receiver.inputs?.[index]?.link);
	if (!link) return null;
	const resolved = typeof link.resolve === "function" ? link.resolve(receiver.graph) : {
		outputNode: getGraphNode(receiver.graph, link.origin_id),
		output: getGraphNode(receiver.graph, link.origin_id)?.outputs?.[link.origin_slot],
	};
	return resolveGetFromResolved(resolved);
}

function followLogicalTargets(graph, link, seen = new Set()) {
	if (!graph || !link) return [];
	const key = `${graphId(graph)}:${link.id}`;
	if (seen.has(key)) return [];
	seen.add(key);
	const resolved = typeof link.resolve === "function" ? link.resolve(graph) : {
		inputNode: getGraphNode(graph, link.target_id),
		input: getGraphNode(graph, link.target_id)?.inputs?.[link.target_slot],
	};
	if (resolved?.inputNode) return [{ node: resolved.inputNode, graph, link }];
	const subgraphOutput = resolved?.subgraphOutput;
	if (!subgraphOutput) return [];
	const childGraph = subgraphOutput.parent?.subgraph || graph;
	const outputIndex = childGraph.outputs?.indexOf?.(subgraphOutput);
	const parentGraph = graphAncestors(childGraph)[1];
	if (!parentGraph || outputIndex == null || outputIndex < 0) return [];
	const targets = [];
	for (const wrapper of directSubgraphNodes(parentGraph).filter((node) => node.subgraph === childGraph)) {
		for (const outerLinkId of wrapper.outputs?.[outputIndex]?.links || []) {
			targets.push(...followLogicalTargets(parentGraph, getGraphLink(parentGraph, outerLinkId), seen));
		}
	}
	return targets;
}

function logicalConsumers(getNode) {
	return (getNode?.outputs?.[0]?.links || []).flatMap((id) => followLogicalTargets(getNode.graph, getGraphLink(getNode.graph, id)));
}

function managedGet(receiver, slot, index) {
	const connected = inputGet(receiver, index);
	const connectedOwner = connected?.properties?.[OWNER_KEY];
	const connectedTargets = logicalConsumers(connected);
	if (connected && connectedOwner
		&& String(connectedOwner.panelNodeId) === String(binding(receiver).panelNodeId)
		&& String(connectedOwner.parameterId) === String(slot.parameterId)
		&& connectedTargets.length === 1
		&& connectedTargets[0].node === receiver) {
		connectedOwner.receiverNodeId = receiver.id;
		connectedOwner.receiverGraphId = graphId(receiver.graph);
		slot.getNodeId = connected.id;
		slot.getGraphId = graphId(connected.graph);
		return connected;
	}
	if (connected && ownerMatches(connected, receiver, slot)) return connected;
	const stored = findNodeByGraphRef(receiver.graph, slot.getGraphId, slot.getNodeId);
	if (isGetNode(stored) && ownerMatches(stored, receiver, slot)) return stored;
	return allGraphNodes(rootGraph(receiver.graph)).find((candidate) => isGetNode(candidate) && ownerMatches(candidate, receiver, slot)) || null;
}

function getExternalConsumers(getNode, receiver) {
	return logicalConsumers(getNode).filter((target) => target.node !== receiver);
}

function collectOutputBridgeSlots(graph, link, result, seen = new Set()) {
	if (!graph || !link) return;
	const key = `${graphId(graph)}:${link.id}`;
	if (seen.has(key)) return;
	seen.add(key);
	const resolved = typeof link.resolve === "function" ? link.resolve(graph) : null;
	const subgraphOutput = resolved?.subgraphOutput;
	if (!subgraphOutput) return;
	const childGraph = subgraphOutput.parent?.subgraph || graph;
	if (!result.some((entry) => entry.graph === childGraph && entry.slot === subgraphOutput)) {
		result.push({ graph: childGraph, slot: subgraphOutput });
	}
	const outputIndex = childGraph.outputs?.indexOf?.(subgraphOutput);
	const parentGraph = graphAncestors(childGraph)[1];
	if (!parentGraph || outputIndex == null || outputIndex < 0) return;
	for (const wrapper of directSubgraphNodes(parentGraph).filter((node) => node.subgraph === childGraph)) {
		for (const outerLinkId of wrapper.outputs?.[outputIndex]?.links || []) {
			collectOutputBridgeSlots(parentGraph, getGraphLink(parentGraph, outerLinkId), result, seen);
		}
	}
}

function removeManagedGet(getNode, receiver) {
	if (!getNode?.graph) return;
	const bridgeSlots = [];
	for (const linkId of getNode.outputs?.[0]?.links || []) {
		collectOutputBridgeSlots(getNode.graph, getGraphLink(getNode.graph, linkId), bridgeSlots);
	}
	getNode.graph.remove?.(getNode);
	for (const entry of bridgeSlots) entry.graph?.removeOutput?.(entry.slot);
}

function statusFor(receiver) {
	const current = binding(receiver);
	if (current.panelNodeId == null) return { kind: "unbound", text: t("aaalice.receiver.status.unbound", "Not bound") };
	if (!isKjReady()) return { kind: "error", text: t("aaalice.receiver.status.kjMissing", "KJNodes unavailable") };
	const panel = panelFor(receiver);
	if (!isParameterPanel(panel)) return { kind: "missing", text: t("aaalice.receiver.status.sourceMissing", "Source panel missing") };
	const meta = panelMeta(panel);
	if (receiverStructureDiff(current, meta).changed) return { kind: "warning", text: t("aaalice.receiver.status.needsSync", "Needs sync") };
	for (let index = 0; index < current.slots.length; index += 1) {
		const getNode = managedGet(receiver, current.slots[index], index);
		if (!getNode || inputGet(receiver, index) !== getNode) return { kind: "warning", text: t("aaalice.receiver.status.needsSync", "Needs sync") };
	}
	return { kind: "success", text: t("aaalice.receiver.status.synced", "Synced") };
}

function syncSlotPresentation(receiver) {
	const current = binding(receiver);
	let presentationChanged = (receiver.inputs?.length || 0) !== current.slots.length
		|| (receiver.outputs?.length || 0) !== current.slots.length;
	reshapeReceiverSlots(receiver, current.slots.length);
	for (let index = 0; index < current.slots.length; index += 1) {
		const slot = current.slots[index];
		const getNode = slot && managedGet(receiver, slot, index);
		const type = getNode?.outputs?.[0]?.type || "*";
		for (const nativeSlot of [receiver.inputs?.[index], receiver.outputs?.[index]]) {
			if (!nativeSlot) continue;
			presentationChanged ||= String(nativeSlot._aaaliceParamId || "") !== String(slot?.parameterId || "")
				|| nativeSlot.label !== (slot?.name || "")
				|| nativeSlot.localized_name !== (slot?.name || "")
				|| nativeSlot.type !== (slot ? type : "*");
			nativeSlot.label = slot?.name || "";
			nativeSlot.localized_name = slot?.name || "";
			nativeSlot.type = slot ? type : "*";
			nativeSlot._aaaliceParamId = slot?.parameterId || null;
		}
	}
	const layout = syncReceiverLayout(receiver, current.slots.length);
	if (presentationChanged) {
		publishDynamicSlotState(receiver, { inputs: true, outputs: true });
	} else refreshDynamicSlotGeometry(receiver);
	return layout;
}

function receiverNodeSize(receiver) {
	const layout = computeReceiverLayout(receiver, receiver.inputs?.length || 0);
	return Math.max(72, layout.contentTop + layout.height + 12);
}

function enforceReceiverWidth(receiver, { initialize = false } = {}) {
	const currentWidth = Number(receiver.size?.[0]) || 0;
	const targetWidth = initialize
		? RECEIVER_LAYOUT.defaultWidth
		: Math.max(RECEIVER_LAYOUT.minWidth, currentWidth);
	if (currentWidth === targetWidth) return;
	receiver.setSize?.([
		targetWidth,
		Number(receiver.size?.[1]) || receiverNodeSize(receiver),
	]);
}

function syncReceiverResizeLayout(receiver) {
	syncReceiverLayout(receiver, receiver.inputs?.length || 0);
	refreshDynamicSlotGeometry(receiver);
	markVueReceiverSlots(receiver);
	receiver.setDirtyCanvas?.(true, true);
}

function disconnectReceiverInputs(receiver) {
	for (let index = (receiver.inputs?.length || 0) - 1; index >= 0; index -= 1) {
		if (receiver.inputs[index]?.link != null) receiver.disconnectInput?.(index);
	}
}

function disconnectReceiverOutputs(receiver) {
	for (let index = (receiver.outputs?.length || 0) - 1; index >= 0; index -= 1) {
		if (receiver.outputs[index]?.links?.length) receiver.disconnectOutput?.(index);
	}
}

function markVueReceiverSlots(receiver) {
	if (typeof document === "undefined") return;
	const id = String(receiver.id);
	const slotCount = receiver.inputs?.length || 0;
	for (const element of document.querySelectorAll("[data-node-id]")) {
		if (element.getAttribute("data-node-id") !== id) continue;
		const layout = receiver._aaaliceReceiverLayout || computeReceiverLayout(receiver, slotCount);
		const inputSlots = [...element.querySelectorAll(".lg-slot--input")];
		const outputSlots = [...element.querySelectorAll(".lg-slot--output")];
		const inputColumn = inputSlots[0]?.parentElement;
		const outputColumn = outputSlots[0]?.parentElement;
		const slotLayer = inputColumn?.parentElement || outputColumn?.parentElement;
		const body = slotLayer?.parentElement;
		const widgets = body?.querySelector?.(".lg-node-widgets");
		element.classList.add("aaalice-parameter-receiver-node");
		// Nodes 2.0 resize reads the node element's inline minimum instead
		// of the computed minimum owned by the widget content.
		element.style.setProperty("min-width", `${RECEIVER_LAYOUT.minWidth}px`);
		element.style.setProperty("--aaalice-receiver-content-height", `${layout.height}px`);
		element.style.setProperty("--aaalice-receiver-slot-height", `${RECEIVER_LAYOUT.rowHeight}px`);
		inputColumn?.classList.add("aaalice-receiver-input-column");
		outputColumn?.classList.add("aaalice-receiver-output-column");
		slotLayer?.classList.add("aaalice-receiver-slot-layer");
		body?.classList.add("aaalice-receiver-node-body");
		widgets?.classList.add("aaalice-receiver-widget-layer");
		for (const slots of [inputSlots, outputSlots]) {
			for (let index = 0; index < slots.length; index += 1) {
				const slot = slots[index];
				slot.style.setProperty("--aaalice-receiver-slot-top", `${RECEIVER_LAYOUT.headerHeight + index * RECEIVER_LAYOUT.rowHeight}px`);
			}
		}
	}
}

function ensureVueReceiverObserver() {
	if (vueReceiverObserver || typeof MutationObserver === "undefined" || !document.body) return;
	vueReceiverObserver = new MutationObserver(() => {
		if (vueReceiverFrame) return;
		vueReceiverFrame = requestAnimationFrame(() => {
			vueReceiverFrame = 0;
			for (const receiver of mountedReceivers) if (receiver?.graph) markVueReceiverSlots(receiver);
		});
	});
	vueReceiverObserver.observe(document.body, { childList: true, subtree: true });
}

function render(receiver) {
	const root = receiver._aaaliceReceiverRoot;
	if (!root) return;
	const current = binding(receiver);
	reshapeReceiverSlots(receiver, current.slots.length);
	const source = current.panelNodeId == null
		? t("aaalice.receiver.binding.none", "No parameter panel bound")
		: message("aaalice.receiver.binding.bound", "Bound: {title}", { title: current.panelTitle || "ParameterPanel" });
	const state = statusFor(receiver);
	const showStatus = state.kind !== "success";
	root.replaceChildren(el("div", {
		className: `aaalice-receiver-binding${showStatus ? " has-status" : ""}`,
		text: source,
		attrs: { title: source },
	}));
	if (showStatus) {
		const statusIcon = { warning: "statusWarning", unbound: "link", error: "statusError", missing: "statusError" }[state.kind];
		root.append(iconButton({
			iconName: statusIcon,
			label: state.text,
			title: state.text,
			variant: "ghost",
			className: `aaalice-receiver-status-action is-${state.kind}`,
			onClick: () => quickStatusAction(receiver, state),
		}));
	}
	const layout = syncSlotPresentation(receiver);
	root.style.setProperty("--aaalice-receiver-height", `${layout.height}px`);
	const widget = receiver.widgets?.find((item) => item.name === "aaalice_parameter_receiver");
	if (widget) {
		widget.y = layout.contentTop;
	}
	root.style.minHeight = `${layout.height}px`;
	markVueReceiverSlots(receiver);
	growClassicDomWidgetNode(receiver);
	receiver.setDirtyCanvas?.(true, true);
}

async function confirmAction(text) {
	if (app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({
		title: t("aaalice.common.confirm", "Confirm"), message: text,
	}));
	return globalThis.confirm(text);
}

function openBindingDialog(receiver) {
	const panels = visiblePanels(receiver);
	if (!panels.length) {
		nativeToast("error", t("aaalice.receiver.menu.noPanels", "No Parameter Panels are visible in this scope"));
		return;
	}
	const labels = disambiguatePanelLabels(panels);
	const select = document.createElement("select");
	for (let index = 0; index < panels.length; index += 1) select.add(new Option(labels[index], String(index)));
	const currentIndex = panels.findIndex((panel) => String(panel.id) === String(binding(receiver).panelNodeId));
	if (currentIndex >= 0) select.value = String(currentIndex);
	const footer = el("footer");
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary" });
	const bind = button({ label: t("aaalice.receiver.binding.action", "Bind") });
	footer.append(cancel, bind);
	const body = el("div", { className: "aaalice-modal-body", children: [select] });
	const dialog = createDialog({ title: t("aaalice.receiver.binding.title", "Bind Parameter Panel"), body, footer });
	cancel.addEventListener("click", () => dialog.close());
	bind.addEventListener("click", () => {
		const panel = panels[Number(select.value)];
		if (!panel) return;
		dialog.close();
		runStatusAction(synchronize(receiver, panel));
	});
}

function runStatusAction(action) {
	Promise.resolve(action).catch((error) => {
		console.error("[Aaalice] ParameterReceiver status action failed", error);
		nativeToast("error", message("aaalice.receiver.toast.syncFailed", "Parameter Receiver sync failed: {reason}", { reason: error?.message || String(error) }));
	});
}

function quickStatusAction(receiver, state) {
	if (state.kind === "warning") {
		const panel = panelFor(receiver);
		if (panel) runStatusAction(synchronize(receiver, panel));
		else openBindingDialog(receiver);
		return;
	}
	if (["unbound", "missing"].includes(state.kind)) {
		openBindingDialog(receiver);
		return;
	}
	nativeToast("error", state.text);
}

function setGetName(getNode, name) {
	if (typeof getNode?.setName === "function") {
		getNode.setName(name);
		return;
	}
	if (!getNode?.widgets?.[0] || typeof getNode.onRename !== "function") {
		throw new Error(t("aaalice.receiver.error.getApi", "KJ GetNode naming API is unavailable."));
	}
	getNode.widgets[0].value = name;
	getNode.onRename();
}

function placeGet(getNode, receiver, index, targetGraph, existingGets = []) {
	const width = Math.max(Number(getNode.size?.[0]) || 190, 190);
	const anchor = existingGets.find((node) => node?.graph === targetGraph);
	getNode.pos = targetGraph === receiver.graph
		? [
			(Number(receiver.pos?.[0]) || 0) - width - 78,
			(Number(receiver.pos?.[1]) || 0) + 34 + index * RECEIVER_LAYOUT.rowHeight,
		]
		: [
			Number(anchor?.pos?.[0]) || 240,
			(Number(anchor?.pos?.[1]) || 80) + index * RECEIVER_LAYOUT.rowHeight,
		];
	getNode.flags ||= {};
	getNode.flags.collapsed = true;
}

function createGet(receiver, panel, slot, index, targetGraph, existingGets) {
	const getNode = globalThis.LiteGraph?.createNode?.(GET_NODE);
	if (!getNode) throw new Error(t("aaalice.receiver.error.createGet", "Unable to create a KJ Get node."));
	targetGraph.add(getNode);
	getNode.properties ||= {};
	getNode.properties[OWNER_KEY] = {
		receiverNodeId: receiver.id,
		receiverGraphId: graphId(receiver.graph),
		panelNodeId: panel.id,
		panelGraphId: graphId(panel.graph),
		parameterId: slot.parameterId,
	};
	setGetName(getNode, slot.setName);
	placeGet(getNode, receiver, index, targetGraph, existingGets);
	return getNode;
}

function assertSynchronizationCommitted(receiver, panel) {
	const current = binding(receiver);
	if ((receiver.inputs?.length || 0) !== current.slots.length
		|| (receiver.outputs?.length || 0) !== current.slots.length) {
		throw new Error(t("aaalice.receiver.error.incompleteSync", "Parameter Receiver synchronization did not commit consistently."));
	}
	for (let index = 0; index < current.slots.length; index += 1) {
		const slot = current.slots[index];
		const input = receiver.inputs?.[index];
		const output = receiver.outputs?.[index];
		const getNode = managedGet(receiver, slot, index);
		const connectedGet = inputGet(receiver, index);
		const setNode = directSetNodes(panel, index)[0];
		const setName = String(setNode?.widgets?.[0]?.value || "");
		const getName = String(getNode?.widgets?.[0]?.value || "");
		const committed = String(input?._aaaliceParamId || "") === String(slot.parameterId)
			&& String(output?._aaaliceParamId || "") === String(slot.parameterId)
			&& getNode != null
			&& connectedGet === getNode
			&& ownerMatches(getNode, receiver, slot)
			&& setName === String(slot.setName)
			&& getName === String(slot.setName);
		if (!committed) {
			throw new Error(message(
				"aaalice.receiver.error.incompleteParameterSync",
				"Parameter \"{name}\" did not synchronize consistently.",
				{ name: slot.name || slot.parameterId },
			));
		}
	}
}

function missingSetCount(panel) {
	return panelMeta(panel).filter((_parameter, index) => !directSetNodes(panel, index).length).length;
}

async function synchronize(receiver, panel, { successToast = true } = {}) {
	if (!receiver?.graph || !isParameterPanel(panel) || !isGraphAncestor(panel.graph, receiver.graph)) {
		nativeToast("error", t("aaalice.receiver.toast.scopeUnsupported", "A receiver can bind a panel in its current graph or an ancestor graph."));
		return false;
	}
	if (!isKjReady()) {
		nativeToast("error", t("aaalice.receiver.toast.kjMissing", "KJNodes is required to bind or sync a Parameter Receiver."));
		render(receiver);
		return false;
	}
	const missingSets = missingSetCount(panel);
	if (missingSets && !(await confirmAction(message("aaalice.receiver.confirm.createSets", "Create {count} missing KJ Set node(s)?", { count: missingSets })))) return false;
	const current = binding(receiver);
	const nextMeta = panelMeta(panel);
	const nextPanelGraphId = graphId(panel.graph);
	const changingPanel = current.panelNodeId != null && (
		String(current.panelNodeId) !== String(panel.id)
		|| (current.panelGraphId != null && String(current.panelGraphId) !== nextPanelGraphId)
	);
	const reconciliation = reconcileReceiverSlots(changingPanel ? [] : current.slots, nextMeta, (parameter) => desiredSetName(panel, parameter));
	if (changingPanel) reconciliation.removed = current.slots.slice();
	const preserveStablePrefix = !changingPanel && receiverSlotsShareStablePrefix(current.slots, reconciliation.ordered);
	const existingGets = current.slots.map((slot, index) => managedGet(receiver, slot, index)).filter(Boolean);
	const existingGetGraphs = new Set(existingGets.map((node) => node.graph));
	const setGraphs = new Set(nextMeta.flatMap((_parameter, index) => directSetNodes(panel, index).map((node) => node.graph)));
	let targetGetGraph;
	try {
		targetGetGraph = selectManagedGetGraph(receiver.graph, existingGetGraphs, setGraphs);
	} catch (error) {
		console.error("[Aaalice] ParameterReceiver subgraph scope is incompatible", error);
		const detail = error?.code === RECEIVER_GRAPH_SCOPE_ERROR
			? t("aaalice.receiver.toast.packedScopeUnsupported", "Managed KJ Get/Set nodes span incompatible subgraphs.")
			: error?.message || String(error);
		nativeToast("error", detail);
		return false;
	}
	const removedImpact = reconciliation.removed.map((slot) => {
		const index = current.slots.findIndex((item) => item.parameterId === slot.parameterId);
		const getNode = managedGet(receiver, slot, index);
		return {
			slot,
			getNode,
			downstream: receiver.outputs?.[index]?.links?.length || 0,
			extra: getExternalConsumers(getNode, receiver).length,
		};
	}).filter((item) => item.downstream || item.extra);
	if (removedImpact.length) {
		const detail = removedImpact.map((item) => `${item.slot.name}: ${item.downstream} / ${item.extra}`).join("\n");
		if (!(await confirmAction(`${t("aaalice.receiver.confirm.removeImpact", "Removed parameters affect receiver links / additional Get consumers:")}\n${detail}`))) return false;
	}
	const graph = receiver.graph;
	const transactionGraph = rootGraph(graph);
	const previousBinding = normalizeReceiverBinding(current);
	const createdGets = [];
	const createdSets = [];
	const createdBridgeSlots = [];
	const inputSnapshot = current.slots.map((slot, index) => {
		const link = getGraphLink(graph, receiver.inputs?.[index]?.link);
		return link ? { parameterId: slot.parameterId, source: getGraphNode(graph, link.origin_id), sourceSlot: link.origin_slot, targetSlot: index } : null;
	}).filter(Boolean);
	const outputSnapshot = current.slots.flatMap((slot, index) => (receiver.outputs?.[index]?.links || []).map((id) => {
		const link = getGraphLink(graph, id);
		return link ? { parameterId: slot.parameterId, target: getGraphNode(graph, link.target_id), targetSlot: link.target_slot } : null;
	}).filter(Boolean));
	transactionGraph?.beforeChange?.();
	try {
		const preferredSetGraph = isGraphAncestor(panel.graph, targetGetGraph) ? targetGetGraph : null;
		const setResult = createLinkedKjSets(panel, { changeBoundary: false, preferredGraph: preferredSetGraph });
		createdSets.push(...(setResult.createdNodes || []));
		createdBridgeSlots.push(...(setResult.createdBridgeSlots || []));
		if (setResult.errors.length) throw setResult.errors[0];
		for (let index = 0; index < reconciliation.ordered.length; index += 1) {
			const slot = reconciliation.ordered[index];
			const setNode = directSetNodes(panel, index)[0];
			if (!setNode) throw new Error(t("aaalice.receiver.error.missingSet", "A required KJ Set node is missing."));
			slot.setName = String(setNode.widgets?.[0]?.value || desiredSetName(panel, nextMeta[index]));
			let getNode = managedGet(receiver, slot, current.slots.findIndex((item) => item.parameterId === slot.parameterId));
			if (!getNode) {
				getNode = createGet(receiver, panel, slot, index, targetGetGraph, existingGets);
				createdGets.push(getNode);
			}
			getNode.properties ||= {};
			getNode.properties[OWNER_KEY] = {
				receiverNodeId: receiver.id,
				receiverGraphId: graphId(receiver.graph),
				panelNodeId: panel.id,
				panelGraphId: nextPanelGraphId,
				parameterId: slot.parameterId,
			};
			setGetName(getNode, slot.setName);
			placeGet(getNode, receiver, index, getNode.graph, existingGets);
			slot.getNodeId = getNode.id;
			slot.getGraphId = graphId(getNode.graph);
		}
		if (!preserveStablePrefix) {
			disconnectReceiverInputs(receiver);
			disconnectReceiverOutputs(receiver);
		}
		reshapeReceiverSlots(receiver, reconciliation.ordered.length);
		for (let index = 0; index < reconciliation.ordered.length; index += 1) {
			if (preserveStablePrefix && receiver.inputs?.[index]?.link != null) continue;
			const slot = reconciliation.ordered[index];
			const snapshot = inputSnapshot.find((item) => item.parameterId === slot.parameterId);
			if (snapshot?.source?.graph === graph) {
				snapshot.source.connect(snapshot.sourceSlot, receiver, index);
				continue;
			}
			const getNode = findNodeByGraphRef(graph, slot.getGraphId, slot.getNodeId);
			if (!getNode) throw new Error(t("aaalice.receiver.error.missingGet", "A required KJ Get node is missing."));
			connectDescendantToAncestor(
				getNode,
				0,
				receiver,
				index,
				slot.setName,
				getNode.outputs?.[0]?.type || "*",
				createdBridgeSlots,
			);
		}
		if (!preserveStablePrefix) {
			for (const connection of changingPanel ? [] : outputSnapshot) {
				const nextIndex = reconciliation.ordered.findIndex((slot) => slot.parameterId === connection.parameterId);
				if (nextIndex >= 0 && connection.target?.graph === graph) receiver.connect(nextIndex, connection.target, connection.targetSlot);
			}
		}
		for (const removed of reconciliation.removed) {
			const oldIndex = current.slots.findIndex((item) => item.parameterId === removed.parameterId);
			const getNode = managedGet(receiver, removed, oldIndex);
			if (!getNode) continue;
			if (getExternalConsumers(getNode, receiver).length) delete getNode.properties?.[OWNER_KEY];
			else removeManagedGet(getNode, receiver);
		}
		receiver.properties.receiverBinding = {
			version: 2,
			panelGraphId: nextPanelGraphId,
			panelNodeId: panel.id,
			panelTitle: String(panel.title || "ParameterPanel"),
			slots: reconciliation.ordered,
		};
		syncSlotPresentation(receiver);
		assertSynchronizationCommitted(receiver, panel);
	} catch (error) {
		for (const getNode of createdGets) getNode.graph?.remove?.(getNode);
		for (const setNode of createdSets) setNode.graph?.remove?.(setNode);
		removeCreatedBridgeSlots(createdBridgeSlots);
		disconnectReceiverInputs(receiver);
		disconnectReceiverOutputs(receiver);
		receiver.properties.receiverBinding = previousBinding;
		reshapeReceiverSlots(receiver, current.slots.length);
		for (const connection of inputSnapshot) if (connection.source?.graph === graph) connection.source.connect(connection.sourceSlot, receiver, connection.targetSlot);
		for (const connection of outputSnapshot) if (connection.target?.graph === graph) {
			const oldIndex = current.slots.findIndex((slot) => slot.parameterId === connection.parameterId);
			if (oldIndex >= 0) receiver.connect(oldIndex, connection.target, connection.targetSlot);
		}
		console.error("[Aaalice] ParameterReceiver synchronization failed", error);
		nativeToast("error", message("aaalice.receiver.toast.syncFailed", "Parameter Receiver sync failed: {reason}", { reason: error?.message || String(error) }));
		render(receiver);
		return false;
	} finally {
		transactionGraph?.afterChange?.();
		transactionGraph?.setDirtyCanvas?.(true, true);
	}
	render(receiver);
	if (successToast) nativeToast("success", message("aaalice.receiver.toast.synced", "Parameter Receiver synchronized: {count} parameter(s).", { count: reconciliation.ordered.length }));
	return true;
}

async function detach(receiver) {
	const current = binding(receiver);
	if (current.panelNodeId == null) return;
	const impact = current.slots.reduce((sum, slot, index) => sum + (receiver.outputs?.[index]?.links?.length || 0) + getExternalConsumers(managedGet(receiver, slot, index), receiver).length, 0);
	if (impact && !(await confirmAction(message("aaalice.receiver.confirm.detach", "Detach this receiver? {count} managed or downstream connection(s) are affected.", { count: impact })))) return;
	const graph = receiver.graph;
	const transactionGraph = rootGraph(graph);
	transactionGraph?.beforeChange?.();
	try {
		for (let index = 0; index < current.slots.length; index += 1) {
			const getNode = managedGet(receiver, current.slots[index], index);
			receiver.disconnectInput?.(index);
			if (!getNode) continue;
			if (getExternalConsumers(getNode, receiver).length) delete getNode.properties?.[OWNER_KEY];
			else removeManagedGet(getNode, receiver);
		}
		disconnectReceiverOutputs(receiver);
		receiver.properties.receiverBinding = emptyReceiverBinding();
	} finally {
		transactionGraph?.afterChange?.();
		transactionGraph?.setDirtyCanvas?.(true, true);
	}
	render(receiver);
}

function locatePanel(receiver) {
	const panel = panelFor(receiver);
	if (!panel) {
		nativeToast("error", t("aaalice.receiver.toast.sourceMissing", "The bound Parameter Panel no longer exists."));
		return;
	}
	if (!navigateToGraphNode(panel)) nativeToast("error", t("aaalice.receiver.toast.navigateFailed", "The bound Parameter Panel cannot be opened on the current canvas."));
}

function menuItems(receiver) {
	const panels = visiblePanels(receiver);
	const labels = disambiguatePanelLabels(panels);
	const bindOptions = panels.length ? panels.map((panel, index) => ({ content: labels[index], callback: () => synchronize(receiver, panel) })) : [{
			content: t("aaalice.receiver.menu.noPanels", "No Parameter Panels are visible in this scope"), disabled: true,
	}];
	return [
		{ content: t("aaalice.receiver.menu.bind", "🔗 Bind Parameter Panel…"), has_submenu: true, submenu: { title: NODE, options: bindOptions } },
		{ content: t("aaalice.receiver.menu.sync", "🔄 Sync from Parameter Panel"), disabled: !panelFor(receiver), callback: () => synchronize(receiver, panelFor(receiver)) },
		{ content: t("aaalice.receiver.menu.locate", "🎯 Locate Parameter Panel"), disabled: !panelFor(receiver), callback: () => locatePanel(receiver) },
		{ content: t("aaalice.receiver.menu.detach", "✂️ Detach"), disabled: binding(receiver).panelNodeId == null, callback: () => detach(receiver) },
	];
}

function refreshNames(receiver, panel, authoritativeSetNames = null) {
	const current = binding(receiver);
	const meta = panelMeta(panel);
	if (receiverStructureDiff(current, meta).changed) { render(receiver); return; }
	current.panelTitle = String(panel.title || "ParameterPanel");
	// The parameter event arrives before KJ finishes validating its Set rename.
	// Use the new panel name immediately, then accept KJ's exact validated name.
	const setNames = new Map(meta.map((parameter) => [
		String(parameter.id),
		String(
			authoritativeSetNames?.[String(parameter.id)]
			|| desiredSetName(panel, parameter),
		),
	]));
	current.slots = reconcileReceiverSlots(
		current.slots,
		meta,
		(parameter) => setNames.get(String(parameter.id)),
	).ordered;
	for (let index = 0; index < meta.length; index += 1) {
		const slot = current.slots[index];
		const getNode = managedGet(receiver, slot, index);
		if (getNode) setGetName(getNode, slot.setName);
	}
	render(receiver);
}

function setupReceiver(receiver, loaded = false) {
	if (!isReceiver(receiver)) return;
	if (receiver._aaaliceReceiverMounted) {
		binding(receiver);
		reshapeReceiverSlots(receiver, binding(receiver).slots.length);
		enforceReceiverWidth(receiver);
		render(receiver);
		return;
	}
	receiver._aaaliceReceiverMounted = true;
	mountedReceivers.add(receiver);
	ensureVueReceiverObserver();
	binding(receiver);
	receiver._aaaliceResolveParameterPanel = () => panelFor(receiver);
	receiver._aaaliceSynchronizeParameterReceiver = (panel, options) => synchronize(receiver, panel, options);
	reshapeReceiverSlots(receiver, binding(receiver).slots.length);
	if (typeof receiver.addDOMWidget !== "function") throw new Error("[Aaalice] ParameterReceiver requires addDOMWidget");
	// Receiver labels and native slots occupy the same rows. Use LiteGraph's
	// overlay layout mode so their minimum heights are not added together.
	receiver.widgets_up = true;
	receiver.widgets_start_y = Number(receiver.constructor?.slot_start_y) || 4;
	const root = el("div", "aaalice-pcp aaalice-pcp-node-root aaalice-receiver-root");
	receiver._aaaliceReceiverRoot = root;
	const widget = addLifecycleDOMWidget(receiver, "aaalice_parameter_receiver", "custom", root, {
		serialize: false, hideOnZoom: false, margin: 0,
		getMinHeight: () => computeReceiverLayout(receiver, receiver.inputs?.length || 0).height,
		getValue: () => "", setValue: () => {},
	});
	installDomWidgetResizePassthrough(receiver, root);
	const previousMenu = receiver.getExtraMenuOptions;
	receiver.getExtraMenuOptions = function (_canvas, options = []) {
		const result = previousMenu?.apply(this, arguments);
		options.unshift(...menuItems(this), null);
		return result;
	};
	receiver.computeSize = function () {
		return [RECEIVER_LAYOUT.minWidth, receiverNodeSize(this)];
	};
	const previousResize = receiver.onResize;
	receiver.onResize = function (size) {
		if (Array.isArray(size)) size[0] = Math.max(RECEIVER_LAYOUT.minWidth, Number(size[0]) || 0);
		const result = previousResize?.apply(this, arguments);
		syncReceiverResizeLayout(this);
		return result;
	};
	const previousConnections = receiver.onConnectionsChange;
	receiver.onConnectionsChange = function () {
		const result = previousConnections?.apply(this, arguments);
		if (!this._aaaliceReshapingReceiverSlots) setTimeout(() => render(this), 0);
		return result;
	};
	const previousClone = receiver.clone;
	if (typeof previousClone === "function") receiver.clone = function () {
		const cloned = previousClone.apply(this, arguments);
		if (cloned?.properties?.receiverBinding) cloned.properties.receiverBinding = {
			...normalizeReceiverBinding(cloned.properties.receiverBinding),
			slots: normalizeReceiverBinding(cloned.properties.receiverBinding).slots.map((slot) => ({ ...slot, getGraphId: null, getNodeId: null })),
		};
		return cloned;
	};
	const onPanelChange = (event) => {
		const source = panelFor(receiver);
		if (event.detail?.node) {
			if (event.detail.node !== source) return;
		} else if (String(event.detail?.nodeId) !== String(binding(receiver).panelNodeId)) return;
		if (event.detail?.removed) {
			setTimeout(() => render(receiver), 0);
			return;
		}
		const panel = event.detail?.node || panelFor(receiver);
		if (panel) refreshNames(receiver, panel, event.detail?.setNames);
		else render(receiver);
	};
	window.addEventListener(EVENT_PARAMETER_CHANGED, onPanelChange);
	window.addEventListener(EVENT_PARAMETER_KJ_CHANGED, onPanelChange);
	const previousRemoved = receiver.onRemoved;
	receiver.onRemoved = function () {
		mountedReceivers.delete(this);
		cleanupDomWidgetResizePassthrough(this);
		window.removeEventListener(EVENT_PARAMETER_CHANGED, onPanelChange);
		window.removeEventListener(EVENT_PARAMETER_KJ_CHANGED, onPanelChange);
		delete this._aaaliceResolveParameterPanel;
		delete this._aaaliceSynchronizeParameterReceiver;
		return previousRemoved?.apply(this, arguments);
	};
	const previousConfigure = receiver.onConfigure;
	receiver.onConfigure = function () {
		const result = previousConfigure?.apply(this, arguments);
		this.properties.receiverBinding = normalizeReceiverBinding(this.properties?.receiverBinding);
		setTimeout(() => render(this), 0);
		return result;
	};
	widget.y = Number(receiver.constructor?.slot_start_y) || 4;
	enforceReceiverWidth(receiver, { initialize: !loaded });
	render(receiver);
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaaliceParameterReceiver) return;
	nodeType.__aaaliceParameterReceiver = true;
	const previous = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previous?.apply(this, arguments);
		setupReceiver(this, false);
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ParameterReceiver",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isReceiver(node)) setupReceiver(node, false); },
	loadedGraphNode(node) { if (isReceiver(node)) setupReceiver(node, true); },
	setup() {
		for (const node of allGraphNodes(app.graph)) if (isReceiver(node)) setupReceiver(node, true);
	},
});
