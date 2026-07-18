/** Pure fine-grained Dashboard V2 placement and responsive projection. */

import { recommendedGroupRowSpan } from "./dashboard_sizing.js";

function visualOrder(left, right) { return left.layout.row - right.layout.row || left.layout.column - right.layout.column || left.id.localeCompare(right.id); }
export function orderedItems(items) { return [...items].sort(visualOrder); }

function cells(layout) {
	const result = [];
	for (let row = layout.row; row < layout.row + layout.rowSpan; row++) for (let column = layout.column; column < layout.column + layout.columnSpan; column++) result.push(`${row}:${column}`);
	return result;
}

function occupied(entries, ignoreId = null) {
	const result = new Set();
	for (const entry of entries) if (entry.id !== ignoreId) for (const cell of cells(entry.layout)) result.add(cell);
	return result;
}

function firstFree(used, { columns = 12, columnSpan = 1, rowSpan = 1, startRow = 0 } = {}) {
	const width = Math.max(1, Math.min(columns, Number(columnSpan) || 1)); const height = Math.max(1, Number(rowSpan) || 1);
	for (let row = Math.max(0, Number(startRow) || 0); ; row++) for (let column = 0; column <= columns - width; column++) {
		const layout = { row, column, columnSpan: width, rowSpan: height };
		if (cells(layout).every((cell) => !used.has(cell))) return layout;
	}
}

export function refreshGroupRowSpans(page) {
	for (const group of page.groups) group.layout.rowSpan = recommendedGroupRowSpan(page.items.filter((item) => item.groupId === group.id));
	return page;
}

export function scopeEntries(page, groupId = null) {
	if (groupId) return page.items.filter((item) => item.groupId === groupId);
	refreshGroupRowSpans(page); return [...page.items.filter((item) => !item.groupId), ...page.groups];
}

export function firstAvailableLayout(page, { groupId = null, columnSpan = 1, rowSpan = 1, startRow = 0 } = {}) {
	return firstFree(occupied(scopeEntries(page, groupId)), { columns: page.gridColumns, columnSpan, rowSpan, startRow });
}

export function compactScope(page, groupId = null) {
	const entries = orderedItems(scopeEntries(page, groupId)); const used = new Set();
	for (const entry of entries) {
		entry.layout = firstFree(used, { columns: page.gridColumns, columnSpan: entry.layout.columnSpan, rowSpan: entry.layout.rowSpan });
		for (const cell of cells(entry.layout)) used.add(cell);
	}
	if (groupId) refreshGroupRowSpans(page);
	return page;
}

export function placeEntry(page, entryId, target, { groupId = null } = {}) {
	const entries = scopeEntries(page, groupId); const entry = entries.find((candidate) => candidate.id === entryId);
	if (!entry) return page;
	const layout = {
		row: Math.max(0, Number(target.row) || 0),
		column: Math.max(0, Math.min(page.gridColumns - entry.layout.columnSpan, Number(target.column) || 0)),
		columnSpan: entry.layout.columnSpan,
		rowSpan: entry.layout.rowSpan,
	};
	const usedWithoutEntry = occupied(entries, entry.id);
	if (cells(layout).every((cell) => !usedWithoutEntry.has(cell))) { entry.layout = layout; if (groupId) refreshGroupRowSpans(page); return page; }

	const rest = orderedItems(entries.filter((candidate) => candidate.id !== entryId));
	const fixed = rest.filter((candidate) => visualOrder(candidate, { ...entry, layout }) < 0 && cells(candidate.layout).every((cell) => !cells(layout).includes(cell)));
	const used = occupied(fixed); entry.layout = layout; for (const cell of cells(layout)) used.add(cell);
	for (const candidate of rest.filter((item) => !fixed.includes(item))) {
		candidate.layout = firstFree(used, { columns: page.gridColumns, columnSpan: candidate.layout.columnSpan, rowSpan: candidate.layout.rowSpan, startRow: layout.row });
		for (const cell of cells(candidate.layout)) used.add(cell);
	}
	if (groupId) refreshGroupRowSpans(page);
	return page;
}

export function projectScope(entries, columns = 12) {
	const result = new Map();
	if (columns !== 1) { for (const entry of entries) result.set(entry.id, { ...entry.layout }); return result; }
	let row = 0;
	for (const entry of orderedItems(entries)) {
		result.set(entry.id, { row, column: 0, columnSpan: 1, rowSpan: entry.layout.rowSpan }); row += entry.layout.rowSpan;
	}
	return result;
}
