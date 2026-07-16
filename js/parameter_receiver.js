/** ParameterReceiver binding, synchronization, compact UI and lifecycle. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	cleanupDomWidgetResizePassthrough,
	growClassicDomWidgetNode,
	installDomWidgetResizePassthrough,
} from "./lib/dom_widget_resize.js";
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
	EVENT_PARAMETER_KJ_CHANGED,
	createLinkedKjSets,
	desiredSetName,
	directSetNodes,
	getGraphLink,
	getGraphNode,
	isKjReady,
	nativeToast,
	panelMeta,
} from "./parameter_panel_kj.js";

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
	const id = binding(node).panelNodeId;
	return id == null ? null : getGraphNode(node.graph, id);
}

function isGetNode(node) {
	return [node?.type, node?.comfyClass, node?.constructor?.comfyClass].includes(GET_NODE);
}

function ownerMatches(getNode, receiver, slot) {
	const owner = getNode?.properties?.[OWNER_KEY];
	return owner && String(owner.receiverNodeId) === String(receiver.id)
		&& String(owner.panelNodeId) === String(binding(receiver).panelNodeId)
		&& String(owner.parameterId) === String(slot.parameterId);
}

function inputGet(receiver, index) {
	const link = getGraphLink(receiver.graph, receiver.inputs?.[index]?.link);
	const source = link && getGraphNode(receiver.graph, link.origin_id);
	return isGetNode(source) ? source : null;
}

function managedGet(receiver, slot, index) {
	const connected = inputGet(receiver, index);
	const connectedOwner = connected?.properties?.[OWNER_KEY];
	const connectedTargets = (connected?.outputs?.[0]?.links || []).map((id) => getGraphLink(connected.graph, id)).filter(Boolean);
	if (connected && connectedOwner
		&& String(connectedOwner.panelNodeId) === String(binding(receiver).panelNodeId)
		&& String(connectedOwner.parameterId) === String(slot.parameterId)
		&& connectedTargets.length === 1
		&& String(connectedTargets[0].target_id) === String(receiver.id)) {
		connectedOwner.receiverNodeId = receiver.id;
		slot.getNodeId = connected.id;
		return connected;
	}
	if (connected && ownerMatches(connected, receiver, slot)) return connected;
	const stored = getGraphNode(receiver.graph, slot.getNodeId);
	if (isGetNode(stored) && ownerMatches(stored, receiver, slot)) return stored;
	return (receiver.graph?._nodes || []).find((candidate) => isGetNode(candidate) && ownerMatches(candidate, receiver, slot)) || null;
}

function getExternalConsumers(getNode, receiver) {
	return (getNode?.outputs?.[0]?.links || []).map((id) => getGraphLink(getNode.graph, id)).filter(Boolean)
		.filter((link) => String(link.target_id) !== String(receiver.id));
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
	reshapeReceiverSlots(receiver, current.slots.length);
	for (let index = 0; index < current.slots.length; index += 1) {
		const slot = current.slots[index];
		const getNode = slot && managedGet(receiver, slot, index);
		const type = getNode?.outputs?.[0]?.type || "*";
		for (const nativeSlot of [receiver.inputs?.[index], receiver.outputs?.[index]]) {
			if (!nativeSlot) continue;
			nativeSlot.label = slot?.name || "";
			nativeSlot.localized_name = slot?.name || "";
			nativeSlot.type = slot ? type : "*";
			nativeSlot._aaaliceParamId = slot?.parameterId || null;
		}
	}
	return syncReceiverLayout(receiver, current.slots.length);
}

function receiverNodeSize(receiver) {
	const layout = computeReceiverLayout(receiver, receiver.inputs?.length || 0);
	return Math.max(72, layout.contentTop + layout.height + 12);
}

function syncReceiverResizeLayout(receiver) {
	syncReceiverLayout(receiver, receiver.inputs?.length || 0);
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
	const panels = (receiver.graph?._nodes || []).filter(isParameterPanel);
	if (!panels.length) {
		nativeToast("error", t("aaalice.receiver.menu.noPanels", "No Parameter Panels in this graph"));
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
	if (!getNode?.widgets?.[0]) throw new Error(t("aaalice.receiver.error.getApi", "KJ GetNode naming API is unavailable."));
	getNode.widgets[0].value = name;
	getNode.onRename?.();
}

function placeGet(getNode, receiver, index) {
	const width = Math.max(Number(getNode.size?.[0]) || 190, 190);
	getNode.pos = [
		(Number(receiver.pos?.[0]) || 0) - width - 78,
		(Number(receiver.pos?.[1]) || 0) + 34 + index * RECEIVER_LAYOUT.rowHeight,
	];
	getNode.flags ||= {};
	getNode.flags.collapsed = true;
}

function createGet(receiver, panel, slot, index) {
	const getNode = globalThis.LiteGraph?.createNode?.(GET_NODE);
	if (!getNode) throw new Error(t("aaalice.receiver.error.createGet", "Unable to create a KJ Get node."));
	receiver.graph.add(getNode);
	getNode.properties ||= {};
	getNode.properties[OWNER_KEY] = {
		receiverNodeId: receiver.id,
		panelNodeId: panel.id,
		parameterId: slot.parameterId,
	};
	setGetName(getNode, slot.setName);
	placeGet(getNode, receiver, index);
	return getNode;
}

function missingSetCount(panel) {
	return panelMeta(panel).filter((_parameter, index) => !directSetNodes(panel, index).length).length;
}

async function synchronize(receiver, panel) {
	if (!receiver?.graph || !isParameterPanel(panel) || panel.graph !== receiver.graph) return;
	if (!isKjReady()) {
		nativeToast("error", t("aaalice.receiver.toast.kjMissing", "KJNodes is required to bind or sync a Parameter Receiver."));
		render(receiver);
		return;
	}
	const missingSets = missingSetCount(panel);
	if (missingSets && !(await confirmAction(message("aaalice.receiver.confirm.createSets", "Create {count} missing KJ Set node(s)?", { count: missingSets })))) return;
	const current = binding(receiver);
	const nextMeta = panelMeta(panel);
	const changingPanel = current.panelNodeId != null && String(current.panelNodeId) !== String(panel.id);
	const reconciliation = reconcileReceiverSlots(changingPanel ? [] : current.slots, nextMeta, (parameter) => desiredSetName(panel, parameter));
	if (changingPanel) reconciliation.removed = current.slots.slice();
	const preserveStablePrefix = !changingPanel && receiverSlotsShareStablePrefix(current.slots, reconciliation.ordered);
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
		if (!(await confirmAction(`${t("aaalice.receiver.confirm.removeImpact", "Removed parameters affect receiver links / additional Get consumers:")}\n${detail}`))) return;
	}
	const graph = receiver.graph;
	const createdGets = [];
	const createdSets = [];
	const inputSnapshot = current.slots.map((_slot, index) => {
		const link = getGraphLink(graph, receiver.inputs?.[index]?.link);
		return link ? { source: getGraphNode(graph, link.origin_id), sourceSlot: link.origin_slot, targetSlot: index } : null;
	}).filter(Boolean);
	const outputSnapshot = current.slots.flatMap((slot, index) => (receiver.outputs?.[index]?.links || []).map((id) => {
		const link = getGraphLink(graph, id);
		return link ? { parameterId: slot.parameterId, target: getGraphNode(graph, link.target_id), targetSlot: link.target_slot } : null;
	}).filter(Boolean));
	graph.beforeChange?.();
	try {
		const setResult = createLinkedKjSets(panel, { changeBoundary: false });
		createdSets.push(...(setResult.createdNodes || []));
		if (setResult.errors.length) throw setResult.errors[0];
		for (let index = 0; index < reconciliation.ordered.length; index += 1) {
			const slot = reconciliation.ordered[index];
			const setNode = directSetNodes(panel, index)[0];
			if (!setNode) throw new Error(t("aaalice.receiver.error.missingSet", "A required KJ Set node is missing."));
			slot.setName = String(setNode.widgets?.[0]?.value || desiredSetName(panel, nextMeta[index]));
			let getNode = managedGet(receiver, slot, current.slots.findIndex((item) => item.parameterId === slot.parameterId));
			if (!getNode) {
				getNode = createGet(receiver, panel, slot, index);
				createdGets.push(getNode);
			}
			getNode.properties ||= {};
			getNode.properties[OWNER_KEY] = { receiverNodeId: receiver.id, panelNodeId: panel.id, parameterId: slot.parameterId };
			setGetName(getNode, slot.setName);
			placeGet(getNode, receiver, index);
			slot.getNodeId = getNode.id;
		}
		if (!preserveStablePrefix) {
			disconnectReceiverInputs(receiver);
			disconnectReceiverOutputs(receiver);
		}
		reshapeReceiverSlots(receiver, reconciliation.ordered.length);
		for (let index = 0; index < reconciliation.ordered.length; index += 1) {
			if (preserveStablePrefix && receiver.inputs?.[index]?.link != null) continue;
			const slot = reconciliation.ordered[index];
			const getNode = getGraphNode(graph, slot.getNodeId);
			getNode.connect(0, receiver, index);
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
			else graph.remove?.(getNode);
		}
		receiver.properties.receiverBinding = {
			version: 1,
			panelNodeId: panel.id,
			panelTitle: String(panel.title || "ParameterPanel"),
			slots: reconciliation.ordered,
		};
	} catch (error) {
		for (const getNode of createdGets) if (getNode.graph === graph) graph.remove?.(getNode);
		for (const setNode of createdSets) if (setNode.graph === graph) graph.remove?.(setNode);
		disconnectReceiverInputs(receiver);
		disconnectReceiverOutputs(receiver);
		reshapeReceiverSlots(receiver, current.slots.length);
		for (const connection of inputSnapshot) if (connection.source?.graph === graph) connection.source.connect(connection.sourceSlot, receiver, connection.targetSlot);
		for (const connection of outputSnapshot) if (connection.target?.graph === graph) {
			const oldIndex = current.slots.findIndex((slot) => slot.parameterId === connection.parameterId);
			if (oldIndex >= 0) receiver.connect(oldIndex, connection.target, connection.targetSlot);
		}
		console.error("[Aaalice] ParameterReceiver synchronization failed", error);
		nativeToast("error", message("aaalice.receiver.toast.syncFailed", "Parameter Receiver sync failed: {reason}", { reason: error?.message || String(error) }));
		return;
	} finally {
		graph.afterChange?.();
		graph.setDirtyCanvas?.(true, true);
	}
	render(receiver);
	nativeToast("success", message("aaalice.receiver.toast.synced", "Parameter Receiver synchronized: {count} parameter(s).", { count: reconciliation.ordered.length }));
}

async function detach(receiver) {
	const current = binding(receiver);
	if (current.panelNodeId == null) return;
	const impact = current.slots.reduce((sum, slot, index) => sum + (receiver.outputs?.[index]?.links?.length || 0) + getExternalConsumers(managedGet(receiver, slot, index), receiver).length, 0);
	if (impact && !(await confirmAction(message("aaalice.receiver.confirm.detach", "Detach this receiver? {count} managed or downstream connection(s) are affected.", { count: impact })))) return;
	const graph = receiver.graph;
	graph?.beforeChange?.();
	try {
		for (let index = 0; index < current.slots.length; index += 1) {
			const getNode = managedGet(receiver, current.slots[index], index);
			receiver.disconnectInput?.(index);
			if (!getNode) continue;
			if (getExternalConsumers(getNode, receiver).length) delete getNode.properties?.[OWNER_KEY];
			else graph?.remove?.(getNode);
		}
		disconnectReceiverOutputs(receiver);
		receiver.properties.receiverBinding = emptyReceiverBinding();
	} finally {
		graph?.afterChange?.();
		graph?.setDirtyCanvas?.(true, true);
	}
	render(receiver);
}

function locatePanel(receiver) {
	const panel = panelFor(receiver);
	if (!panel) {
		nativeToast("error", t("aaalice.receiver.toast.sourceMissing", "The bound Parameter Panel no longer exists."));
		return;
	}
	app.canvas?.centerOnNode?.(panel);
	app.canvas?.selectNode?.(panel, false);
	app.canvas?.setDirty?.(true, true);
}

function menuItems(receiver) {
	const panels = (receiver.graph?._nodes || []).filter(isParameterPanel);
	const labels = disambiguatePanelLabels(panels);
	const bindOptions = panels.length ? panels.map((panel, index) => ({ content: labels[index], callback: () => synchronize(receiver, panel) })) : [{
		content: t("aaalice.receiver.menu.noPanels", "No Parameter Panels in this graph"), disabled: true,
	}];
	return [
		{ content: t("aaalice.receiver.menu.bind", "🔗 Bind Parameter Panel…"), has_submenu: true, submenu: { title: NODE, options: bindOptions } },
		{ content: t("aaalice.receiver.menu.sync", "🔄 Sync from Parameter Panel"), disabled: !panelFor(receiver), callback: () => synchronize(receiver, panelFor(receiver)) },
		{ content: t("aaalice.receiver.menu.locate", "🎯 Locate Parameter Panel"), disabled: !panelFor(receiver), callback: () => locatePanel(receiver) },
		{ content: t("aaalice.receiver.menu.detach", "✂️ Detach"), disabled: binding(receiver).panelNodeId == null, callback: () => detach(receiver) },
	];
}

function refreshNames(receiver, panel) {
	const current = binding(receiver);
	const meta = panelMeta(panel);
	if (receiverStructureDiff(current, meta).changed) { render(receiver); return; }
	current.panelTitle = String(panel.title || "ParameterPanel");
	for (let index = 0; index < meta.length; index += 1) {
		const parameter = meta[index];
		const slot = current.slots[index];
		slot.name = parameter.name;
		slot.paramType = parameter.param_type;
		slot.setName = String(directSetNodes(panel, index)[0]?.widgets?.[0]?.value || desiredSetName(panel, parameter));
		const getNode = managedGet(receiver, slot, index);
		if (getNode) setGetName(getNode, slot.setName);
	}
	render(receiver);
}

function setupReceiver(receiver, loaded = false) {
	if (!isReceiver(receiver) || receiver._aaaliceReceiverMounted) return;
	receiver._aaaliceReceiverMounted = true;
	mountedReceivers.add(receiver);
	ensureVueReceiverObserver();
	binding(receiver);
	reshapeReceiverSlots(receiver, binding(receiver).slots.length);
	if (typeof receiver.addDOMWidget !== "function") throw new Error("[Aaalice] ParameterReceiver requires addDOMWidget");
	// Receiver labels and native slots occupy the same rows. Use LiteGraph's
	// overlay layout mode so their minimum heights are not added together.
	receiver.widgets_up = true;
	receiver.widgets_start_y = Number(receiver.constructor?.slot_start_y) || 4;
	const root = el("div", "aaalice-pcp aaalice-pcp-node-root aaalice-receiver-root");
	receiver._aaaliceReceiverRoot = root;
	const widget = receiver.addDOMWidget("aaalice_parameter_receiver", "custom", root, {
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
	receiver.onResize = function () {
		const result = previousResize?.apply(this, arguments);
		syncReceiverResizeLayout(this);
		return result;
	};
	const previousConcrete = receiver._setConcreteSlots;
	if (typeof previousConcrete === "function") receiver._setConcreteSlots = function () {
		const result = previousConcrete.apply(this, arguments);
		syncSlotPresentation(this);
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
			slots: normalizeReceiverBinding(cloned.properties.receiverBinding).slots.map((slot) => ({ ...slot, getNodeId: null })),
		};
		return cloned;
	};
	const onPanelChange = (event) => {
		if (String(event.detail?.nodeId) !== String(binding(receiver).panelNodeId)) return;
		if (event.detail?.removed) {
			setTimeout(() => render(receiver), 0);
			return;
		}
		const panel = event.detail?.node || panelFor(receiver);
		if (panel) refreshNames(receiver, panel);
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
	if (!loaded) receiver.setSize?.(receiver.computeSize());
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
		for (const node of app.graph?._nodes || []) if (isReceiver(node)) setupReceiver(node, true);
	},
});
