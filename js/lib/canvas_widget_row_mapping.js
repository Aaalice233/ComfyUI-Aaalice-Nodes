function normalizedIdentityText(value) {
	return String(value ?? "")
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/[\s\u200b-\u200d\ufeff]+/g, "");
}

function readableWidgetLabels(widget) {
	const labels = [];
	for (const property of ["label", "promotedLabel", "sourceWidgetName", "name"]) {
		let value;
		try { value = widget?.[property]; } catch { continue; }
		const normalized = normalizedIdentityText(value);
		if (normalized.length >= 2 && !labels.includes(normalized)) labels.push(normalized);
	}
	return labels;
}

function searchableRowText(row) {
	const values = [row?.textContent || ""];
	try {
		for (const element of row?.querySelectorAll?.("[aria-label], [title], [name], [placeholder]") || []) {
			for (const attribute of ["aria-label", "title", "name", "placeholder"]) {
				const value = element.getAttribute?.(attribute);
				if (value) values.push(value);
			}
		}
	} catch {
		// A detached or third-party row may not support selector queries.
	}
	return normalizedIdentityText(values.join("\n"));
}

function positionalRange(mapping, rows, widgets, previous, next) {
	const widgetStart = previous.widgetIndex + 1;
	const rowStart = previous.rowIndex + 1;
	const widgetCount = next.widgetIndex - widgetStart;
	const rowCount = next.rowIndex - rowStart;
	if (widgetCount !== rowCount) return;
	for (let offset = 0; offset < widgetCount; offset++) mapping.set(widgets[widgetStart + offset], rows[rowStart + offset]);
}

/**
 * Map Nodes 2.0 widget rows without assuming every raw widget survives the
 * host's visibility, deduplication, and canvas-only processing.
 */
export function mapCanvasWidgetRows(rows, widgets) {
	const rowList = [...(rows || [])];
	const widgetList = [...(widgets || [])];
	const mapping = new Map();
	if (!rowList.length || !widgetList.length) return mapping;
	if (rowList.length === widgetList.length) {
		for (let index = 0; index < widgetList.length; index++) mapping.set(widgetList[index], rowList[index]);
		return mapping;
	}

	const rowTexts = rowList.map(searchableRowText);
	const labels = widgetList.map(readableWidgetLabels);
	const rowsByWidget = labels.map((values) => rowTexts
		.map((text, rowIndex) => values.some((label) => text.includes(label)) ? rowIndex : -1)
		.filter((rowIndex) => rowIndex >= 0));
	const widgetsByRow = rowTexts.map((text) => labels
		.map((values, widgetIndex) => values.some((label) => text.includes(label)) ? widgetIndex : -1)
		.filter((widgetIndex) => widgetIndex >= 0));

	const anchors = [];
	let previousRowIndex = -1;
	for (let widgetIndex = 0; widgetIndex < widgetList.length; widgetIndex++) {
		const matches = rowsByWidget[widgetIndex];
		if (matches.length !== 1) continue;
		const rowIndex = matches[0];
		if (widgetsByRow[rowIndex].length !== 1 || rowIndex <= previousRowIndex) continue;
		anchors.push({ widgetIndex, rowIndex });
		previousRowIndex = rowIndex;
	}

	const boundaries = [
		{ widgetIndex: -1, rowIndex: -1 },
		...anchors,
		{ widgetIndex: widgetList.length, rowIndex: rowList.length },
	];
	for (const anchor of anchors) mapping.set(widgetList[anchor.widgetIndex], rowList[anchor.rowIndex]);
	for (let index = 1; index < boundaries.length; index++) positionalRange(mapping, rowList, widgetList, boundaries[index - 1], boundaries[index]);
	return mapping;
}
