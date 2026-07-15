/** Shared compact geometry for ParameterReceiver native inputs and outputs. */

export const RECEIVER_LAYOUT = Object.freeze({
	minWidth: 240,
	headerHeight: 32,
	rowHeight: 30,
	footerHeight: 30,
	emptyRowsHeight: 28,
});

export function computeReceiverLayout(node, count) {
	const visibleCount = Math.max(0, Math.min(32, Number(count) || 0));
	const contentTop = Number(node?.constructor?.slot_start_y) || 4;
	const rowsHeight = visibleCount ? visibleCount * RECEIVER_LAYOUT.rowHeight : RECEIVER_LAYOUT.emptyRowsHeight;
	return {
		width: Math.max(RECEIVER_LAYOUT.minWidth, Number(node?.size?.[0]) || RECEIVER_LAYOUT.minWidth),
		contentTop,
		visibleCount,
		height: RECEIVER_LAYOUT.headerHeight + rowsHeight + RECEIVER_LAYOUT.footerHeight,
		rows: Array.from({ length: visibleCount }, (_, index) => ({
			index,
			top: RECEIVER_LAYOUT.headerHeight + RECEIVER_LAYOUT.rowHeight * index,
			center: RECEIVER_LAYOUT.headerHeight + RECEIVER_LAYOUT.rowHeight * (index + 0.5),
		})),
		footerTop: RECEIVER_LAYOUT.headerHeight + rowsHeight,
	};
}

function syncConcrete(node, direction, visible) {
	const key = direction === "input" ? "_concreteInputs" : "_concreteOutputs";
	const allKey = direction === "input" ? "_aaaliceAllReceiverInputs" : "_aaaliceAllReceiverOutputs";
	const concrete = node?.[key];
	if (!Array.isArray(concrete)) return;
	const protocolCount = node?.[direction === "input" ? "inputs" : "outputs"]?.length || 0;
	if (!Array.isArray(node[allKey]) || concrete.length >= protocolCount) node[allKey] = concrete.slice();
	const all = node[allKey] || concrete;
	for (let index = 0; index < all.length; index += 1) {
		const source = node?.[direction === "input" ? "inputs" : "outputs"]?.[index];
		const target = all[index];
		if (!source || !target) continue;
		target._aaaliceRawIndex = index;
		for (const field of ["name", "label", "localized_name", "type", "shape", "color", "color_off", "color_on", "_aaaliceDisplayHidden"]) {
			if (source[field] === undefined) delete target[field];
			else target[field] = source[field];
		}
		if (source.pos) target.pos = [...source.pos];
		else delete target.pos;
	}
	node[key] = all.filter((slot) => visible.has(slot._aaaliceRawIndex));
}

export function syncReceiverLayout(node, count) {
	const layout = computeReceiverLayout(node, count);
	const visible = new Set(layout.rows.map((row) => row.index));
	node._aaaliceReceiverLayout = layout;
	node._aaaliceVisibleReceiverSlots = visible;
	const slotOffset = (Number(globalThis.LiteGraph?.NODE_SLOT_HEIGHT) || 20) * 0.5;
	for (let index = 0; index < 32; index += 1) {
		const row = layout.rows[index];
		for (const [direction, slot] of [["input", node.inputs?.[index]], ["output", node.outputs?.[index]]]) {
			if (!slot) continue;
			slot._aaaliceDisplayHidden = !row;
			slot._aaaliceRawIndex = index;
			if (row) slot.pos = [direction === "input" ? slotOffset - 1 : layout.width + 1 - slotOffset, layout.contentTop + row.center];
			else delete slot.pos;
		}
	}
	syncConcrete(node, "input", visible);
	syncConcrete(node, "output", visible);
	return layout;
}

export function withVisibleReceiverSlots(node, callback) {
	const visible = node?._aaaliceVisibleReceiverSlots || new Set();
	const saved = [];
	const hasConcrete = Array.isArray(node?._concreteInputs) || Array.isArray(node?._concreteOutputs);
	for (const key of ["_concreteInputs", "_concreteOutputs"]) {
		if (!Array.isArray(node?.[key])) continue;
		saved.push([key, node[key]]);
		node[key] = node[key].filter((slot, index) => visible.has(slot?._aaaliceRawIndex ?? index));
	}
	if (!hasConcrete) {
		for (const key of ["inputs", "outputs"]) {
			if (!Array.isArray(node?.[key])) continue;
			saved.push([key, node[key]]);
			node[key] = node[key].slice(0, visible.size);
		}
	}
	try { return callback(); }
	finally { for (const [key, value] of saved) node[key] = value; }
}
