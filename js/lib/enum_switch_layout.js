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

export function syncEnumConcreteInputs(node) {
	if (!Array.isArray(node?._concreteInputs)) return;
	node._concreteInputs = node._concreteInputs.slice(0, node.inputs?.length || 0);
	for (let index = 0; index < node._concreteInputs.length; index += 1) {
		const source = node.inputs?.[index];
		const target = node._concreteInputs[index];
		if (!source || !target) continue;
		for (const field of ["name", "label", "localized_name", "type", "shape", "color", "color_off", "color_on", "lazy", "_aaaliceProtocolName"]) {
			if (source[field] === undefined) delete target[field];
			else target[field] = source[field];
		}
	}
}
