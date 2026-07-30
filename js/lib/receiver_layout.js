/** Shared compact geometry for ParameterReceiver native inputs and outputs. */

export const RECEIVER_LAYOUT = Object.freeze({
	minWidth: 220,
	defaultWidth: 280,
	headerHeight: 32,
	rowHeight: 30,
	emptyRowsHeight: 28,
});

export function reshapeReceiverSlots(node, requestedCount) {
	const count = Math.max(0, Math.min(32, Number(requestedCount) || 0));
	if ((node.inputs?.length || 0) === count && (node.outputs?.length || 0) === count) return;
	node._aaaliceReshapingReceiverSlots = true;
	try {
		while ((node.inputs?.length || 0) > count) node.removeInput(node.inputs.length - 1);
		while ((node.outputs?.length || 0) > count) node.removeOutput(node.outputs.length - 1);
		while ((node.inputs?.length || 0) < count) {
			const index = node.inputs?.length || 0;
			node.addInput(`input_${index + 1}`, "*");
		}
		while ((node.outputs?.length || 0) < count) {
			const index = node.outputs?.length || 0;
			node.addOutput(`output_${index + 1}`, "*");
		}
	} finally {
		node._aaaliceReshapingReceiverSlots = false;
	}
}

export function computeReceiverLayout(node, count) {
	const visibleCount = Math.max(0, Math.min(32, Number(count) || 0));
	const contentTop = Number(node?.constructor?.slot_start_y) || 4;
	const rowsHeight = visibleCount ? visibleCount * RECEIVER_LAYOUT.rowHeight : RECEIVER_LAYOUT.emptyRowsHeight;
	return {
		width: Math.max(RECEIVER_LAYOUT.minWidth, Number(node?.size?.[0]) || RECEIVER_LAYOUT.minWidth),
		contentTop,
		visibleCount,
		height: RECEIVER_LAYOUT.headerHeight + rowsHeight,
		rows: Array.from({ length: visibleCount }, (_, index) => ({
			index,
			top: RECEIVER_LAYOUT.headerHeight + RECEIVER_LAYOUT.rowHeight * index,
			center: RECEIVER_LAYOUT.headerHeight + RECEIVER_LAYOUT.rowHeight * (index + 0.5),
		})),
	};
}

export function syncReceiverLayout(node, count) {
	const layout = computeReceiverLayout(node, count);
	node._aaaliceReceiverLayout = layout;
	const slotOffset = (Number(globalThis.LiteGraph?.NODE_SLOT_HEIGHT) || 20) * 0.5;
	for (let index = 0; index < layout.visibleCount; index += 1) {
		const row = layout.rows[index];
		for (const [direction, slot] of [["input", node.inputs?.[index]], ["output", node.outputs?.[index]]]) {
			if (!slot) continue;
			slot.pos = [direction === "input" ? slotOffset - 1 : layout.width + 1 - slotOffset, layout.contentTop + row.center];
		}
	}
	return layout;
}
