/**
 * Shared state-driven native slot helpers.
 *
 * Nodes 2.0 observes the public slot arrays shallowly, while LiteGraph keeps a
 * separate concrete-slot snapshot for canvas hit testing and link geometry.
 * Dynamic-slot owners must commit both views together instead of waiting for a
 * later node movement or canvas draw to repair the snapshot.
 */

const INPUT = 1;
const OUTPUT = 2;

function refreshConcreteSlots(node) {
	if (typeof node?._setConcreteSlots === "function") node._setConcreteSlots();
}

/**
 * Commit public slot mutations to Nodes 2.0 and LiteGraph immediately.
 *
 * Reassigning the public arrays reaches ComfyUI's shallowReactive setters when
 * Nodes 2.0 is active. The official slot-label event then refreshes the
 * extracted Vue node data. Classic mode simply receives equivalent arrays and
 * a dirty-canvas request.
 */
export function publishDynamicSlotState(node, { inputs = false, outputs = false } = {}) {
	if (!node || (!inputs && !outputs)) return;
	if (inputs && Array.isArray(node.inputs)) node.inputs = [...node.inputs];
	if (outputs && Array.isArray(node.outputs)) node.outputs = [...node.outputs];
	refreshConcreteSlots(node);
	const graph = node.graph;
	if (inputs) {
		graph?.trigger?.("node:slot-label:changed", {
			nodeId: node.id,
			slotType: globalThis.LiteGraph?.INPUT ?? INPUT,
		});
	}
	if (outputs) {
		graph?.trigger?.("node:slot-label:changed", {
			nodeId: node.id,
			slotType: globalThis.LiteGraph?.OUTPUT ?? OUTPUT,
		});
	}
	node.setDirtyCanvas?.(true, true);
	graph?.setDirtyCanvas?.(true, true);
}

/** Refresh LiteGraph's concrete snapshot after geometry-only slot changes. */
export function refreshDynamicSlotGeometry(node) {
	refreshConcreteSlots(node);
	node?.setDirtyCanvas?.(true, true);
	node?.graph?.setDirtyCanvas?.(true, true);
}

export function reshapeParameterOutputs(node, requestedCount) {
	const count = Math.max(0, Math.min(32, Number(requestedCount) || 0));
	if ((node.outputs?.length || 0) === count) return;
	while ((node.outputs?.length || 0) > count) node.removeOutput(node.outputs.length - 1);
	while ((node.outputs?.length || 0) < count) {
		const index = node.outputs?.length || 0;
		node.addOutput(`output_${index + 1}`, "*");
	}
}

export function parameterOutputPresentationChanged(outputs, nextMeta) {
	const slots = Array.isArray(outputs) ? outputs : [];
	const meta = Array.isArray(nextMeta) ? nextMeta : [];
	if (slots.length !== meta.length) return true;
	return meta.some((item, index) => {
		const output = slots[index];
		const label = item?.name || "";
		return !output
			|| String(output._aaaliceParamId || "") !== String(item?.id || "")
			|| output.label !== label
			|| output.localized_name !== label;
	});
}

function sameSharedPrefix(previousMeta, nextMeta) {
	const shared = Math.min(previousMeta.length, nextMeta.length);
	for (let index = 0; index < shared; index += 1) {
		if (String(previousMeta[index]?.id || "") !== String(nextMeta[index]?.id || "")) return false;
	}
	return true;
}

/** Reshape outputs while preserving connections by stable Parameter Id. */
export function reshapeParameterOutputsPreservingLinks(
	node,
	previousMeta,
	nextMeta,
	resolveLink,
	resolveNode,
) {
	const previous = Array.isArray(previousMeta) ? previousMeta : [];
	const next = Array.isArray(nextMeta) ? nextMeta : [];
	// Appending or trimming the tail does not move any surviving slot. Keeping
	// those native slot objects intact also keeps their links intact.
	if (sameSharedPrefix(previous, next)) {
		reshapeParameterOutputs(node, next.length);
		return;
	}

	const connections = [];
	for (let index = 0; index < (node.outputs?.length || 0); index += 1) {
		const parameterId = String(previous[index]?.id || "");
		if (!parameterId) continue;
		for (const linkId of [...(node.outputs[index]?.links || [])]) {
			const link = resolveLink(linkId);
			const target = link && resolveNode(link.target_id);
			if (target) connections.push({ parameterId, target, targetSlot: link.target_slot });
		}
	}

	for (let index = (node.outputs?.length || 0) - 1; index >= 0; index -= 1) {
		for (const linkId of [...(node.outputs[index]?.links || [])]) {
			const link = resolveLink(linkId);
			const target = link && resolveNode(link.target_id);
			target?.disconnectInput?.(link.target_slot);
		}
	}
	reshapeParameterOutputs(node, next.length);
	const slotById = new Map(next.map((item, index) => [String(item?.id || ""), index]));
	for (const connection of connections) {
		const outputIndex = slotById.get(connection.parameterId);
		if (outputIndex != null) node.connect?.(outputIndex, connection.target, connection.targetSlot);
	}
}
