/** Native slot shaping for EnumSwitch's state-driven branch list. */

export function reshapeEnumBranchInputs(node, requestedCount) {
	const count = Math.max(1, Math.min(32, Number(requestedCount) || 1));
	const desiredInputs = count + 1;
	if ((node.inputs?.length || 0) === desiredInputs) return;
	while ((node.inputs?.length || 0) > desiredInputs) node.removeInput(node.inputs.length - 1);
	while ((node.inputs?.length || 0) < desiredInputs) {
		const branchIndex = node.inputs?.length || 1;
		node.addInput(`branch_${branchIndex}`, "*", { lazy: true });
		const input = node.inputs?.[node.inputs.length - 1];
		if (input) input.lazy = true;
	}
}

function sameRoutePrefix(previousRoutes, nextRoutes) {
	const shared = Math.min(previousRoutes.length, nextRoutes.length);
	for (let index = 0; index < shared; index += 1) {
		if (String(previousRoutes[index]?.id || "") !== String(nextRoutes[index]?.id || "")) return false;
	}
	return true;
}

/** Reshape branch inputs while preserving their sources by stable Route Id. */
export function reshapeEnumBranchInputsPreservingLinks(
	node,
	previousRoutes,
	nextRoutes,
	resolveLink,
	resolveNode,
) {
	const previous = Array.isArray(previousRoutes) ? previousRoutes : [];
	const next = Array.isArray(nextRoutes) ? nextRoutes : [];
	// Tail-only changes keep every surviving native branch input in place.
	if (sameRoutePrefix(previous, next)) {
		reshapeEnumBranchInputs(node, next.length);
		return;
	}

	const connections = [];
	for (let index = 0; index < previous.length; index += 1) {
		const link = resolveLink(node.inputs?.[index + 1]?.link);
		const source = link && resolveNode(link.origin_id);
		if (source) connections.push({
			routeId: String(previous[index]?.id || ""),
			source,
			originSlot: link.origin_slot,
		});
	}
	for (let index = Math.min(previous.length, (node.inputs?.length || 1) - 1); index > 0; index -= 1) {
		if (node.inputs?.[index]?.link != null) node.disconnectInput?.(index);
	}
	reshapeEnumBranchInputs(node, next.length);
	const slotById = new Map(next.map((route, index) => [String(route?.id || ""), index + 1]));
	for (const connection of connections) {
		const inputIndex = slotById.get(connection.routeId);
		if (inputIndex != null) connection.source.connect?.(connection.originSlot, node, inputIndex);
	}
}
