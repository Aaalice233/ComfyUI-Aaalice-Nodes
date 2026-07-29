/** Small, framework-neutral helpers for state-driven native slot counts. */

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
