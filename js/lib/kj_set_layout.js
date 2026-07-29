/** Compact placement for generated KJ Set nodes beside a ParameterPanel. */

export function computeLinkedSetPosition(panel, layout, index, collapsedHeight = 30) {
	const panelX = Number(panel?.pos?.[0]) || 0;
	const panelY = Number(panel?.pos?.[1]) || 0;
	const width = Number(layout?.width) || Number(panel?.size?.[0]) || 370;
	const height = Math.max(1, Number(collapsedHeight) || 30);
	const outputRows = (layout?.rows || []).filter((row) => row.kind === "parameter" && row.output);
	const firstOutputY = (Number(layout?.contentTop) || 0) + (Number(outputRows[0]?.output?.top) || height / 2);
	const outputStep = outputRows.length > 1
		? Math.max(0, Number(outputRows[1].output.top) - Number(outputRows[0].output.top))
		: 0;
	const rowStep = Math.max(height, outputStep);
	return [
		panelX + width + 48,
		panelY + firstOutputY - height / 2 + Math.max(0, Number(index) || 0) * rowStep,
	];
}

export function computeCompactSetColumnPositions(positions, collapsedHeight = 30, fallback = [80, 80]) {
	const height = Math.max(1, Number(collapsedHeight) || 30);
	const valid = (positions || []).filter((position) => (
		Number.isFinite(Number(position?.[0])) && Number.isFinite(Number(position?.[1]))
	));
	const anchorX = valid.length
		? Math.min(...valid.map((position) => Number(position[0])))
		: Number(fallback?.[0]) || 80;
	const anchorY = valid.length
		? Math.min(...valid.map((position) => Number(position[1])))
		: Number(fallback?.[1]) || 80;
	return (positions || []).map((_position, index) => [anchorX, anchorY + index * height]);
}
