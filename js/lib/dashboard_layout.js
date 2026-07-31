/** Pure Dashboard V2 placement and responsive projection over discrete card footprints. */

import { DASHBOARD_GRID_COLUMNS, normalizeDashboardColumnSpan, recommendedGroupRowSpan } from "./dashboard_sizing.js";

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

function overlaps(left, right) {
	return left.column < right.column + right.columnSpan
		&& left.column + left.columnSpan > right.column
		&& left.row < right.row + right.rowSpan
		&& left.row + left.rowSpan > right.row;
}

function firstFree(used, { columns = 12, columnSpan = 1, rowSpan = 1, startRow = 0 } = {}) {
	const width = Math.max(1, Math.min(columns, Number(columnSpan) || 1)); const height = Math.max(1, Number(rowSpan) || 1);
	for (let row = Math.max(0, Number(startRow) || 0); ; row++) for (let column = 0; column <= columns - width; column++) {
		const layout = { row, column, columnSpan: width, rowSpan: height };
		if (cells(layout).every((cell) => !used.has(cell))) return layout;
	}
}

export function groupMemberColumnSpan(members) {
	return members.length ? Math.max(...members.map((item) => item.layout.column + item.layout.columnSpan)) : 1;
}

export function refreshGroupRowSpans(page) {
	for (const group of page.groups) {
		const members = page.items.filter((item) => item.groupId === group.id);
		const minimumColumnSpan = Math.min(page.gridColumns || DASHBOARD_GRID_COLUMNS, groupMemberColumnSpan(members));
		const requestedColumnSpan = group.widthMode === "fixed" ? Math.max(group.layout.columnSpan, minimumColumnSpan) : minimumColumnSpan;
		group.layout.columnSpan = normalizeDashboardColumnSpan(requestedColumnSpan, { minimum: minimumColumnSpan });
		group.layout.column = Math.min(group.layout.column, (page.gridColumns || DASHBOARD_GRID_COLUMNS) - group.layout.columnSpan);
		group.layout.rowSpan = recommendedGroupRowSpan(members);
	}
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

export function placeEntries(page, entryIds, { groupId = null } = {}) {
	const protectedIds = new Set(entryIds); const entries = scopeEntries(page, groupId);
	const moving = orderedItems(entries.filter((entry) => protectedIds.has(entry.id)));
	const fixed = entries.filter((entry) => !protectedIds.has(entry.id));
	let rowOffset = 0;
	while (moving.some((entry) => fixed.some((candidate) => overlaps({ ...entry.layout, row: entry.layout.row + rowOffset }, candidate.layout)))) rowOffset++;
	if (rowOffset) for (const entry of moving) entry.layout = { ...entry.layout, row: entry.layout.row + rowOffset };
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

	entry.layout = layout;
	return placeEntries(page, [entryId], { groupId });
}

function projectWithoutOverlap(layout, placed) {
	let row = layout.row;
	while (placed.some((candidate) => overlaps({ ...layout, row }, candidate))) row++;
	return { ...layout, row };
}

export function projectScope(entries, columns = 12) {
	const result = new Map(); const placed = [];
	if (columns === 1) {
		let row = 0;
		for (const entry of orderedItems(entries)) {
			const layout = { row, column: 0, columnSpan: 1, rowSpan: entry.layout.rowSpan };
			result.set(entry.id, layout); placed.push(layout); row += layout.rowSpan;
		}
		return result;
	}
	for (const entry of orderedItems(entries)) {
		const layout = projectWithoutOverlap(entry.layout, placed);
		result.set(entry.id, layout); placed.push(layout);
	}
	return result;
}

export function projectGroupScope(members, columns = DASHBOARD_GRID_COLUMNS, includeHeader = true) {
	const projection = projectScope(members, columns);
	const projectedMembers = members.map((item) => ({ ...item, layout: projection.get(item.id) || { ...item.layout } }));
	return { projection, rowSpan: recommendedGroupRowSpan(projectedMembers, includeHeader) };
}
