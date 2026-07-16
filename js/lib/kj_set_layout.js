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
