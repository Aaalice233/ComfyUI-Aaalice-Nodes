/** Pure layout selection for Gallery card actions. */

const BUTTON_SIZE = 28;
const GAP = 4;
const INSET = 14;

export function galleryCardActionLayout(width, height, count) {
	const actionCount = Math.max(0, Math.floor(Number(count) || 0));
	if (!actionCount) return { mode: "none", columns: 0, rows: 0 };
	const availableWidth = Math.max(0, Number(width) - INSET);
	const availableHeight = Math.max(0, Number(height) - INSET);
	const targetRatio = availableHeight > 0 ? availableWidth / availableHeight : 1;
	const candidates = [];
	for (let columns = 1; columns <= actionCount; columns += 1) {
		const rows = Math.ceil(actionCount / columns);
		const gridWidth = columns * BUTTON_SIZE + (columns - 1) * GAP;
		const gridHeight = rows * BUTTON_SIZE + (rows - 1) * GAP;
		if (gridWidth > availableWidth || gridHeight > availableHeight) continue;
		candidates.push({ columns, rows, area: gridWidth * gridHeight, shapeCost: Math.abs(Math.log((gridWidth / gridHeight) / targetRatio)) });
	}
	if (!candidates.length) return { mode: "overflow", columns: 1, rows: 1 };
	candidates.sort((a, b) => a.area - b.area || a.shapeCost - b.shapeCost || (targetRatio >= 1 ? b.columns - a.columns : a.columns - b.columns));
	const { columns, rows } = candidates[0];
	return { mode: columns === 1 ? "vertical" : rows === 1 ? "horizontal" : "grid", columns, rows };
}
