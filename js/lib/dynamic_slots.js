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
