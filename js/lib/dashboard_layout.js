/** Pure Dashboard V3 integer-grid placement and responsive projection. */

import { DASHBOARD_GRID_COLUMNS, normalizeDashboardColumnSpan, recommendedGroupRowSpan } from "./dashboard_sizing.js";

function visualOrder(left, right) { return left.layout.row - right.layout.row || left.layout.column - right.layout.column || left.id.localeCompare(right.id); }
export function orderedItems(items) { return [...items].sort(visualOrder); }

function overlaps(left, right) {
	return left.column < right.column + right.columnSpan
		&& left.column + left.columnSpan > right.column
		&& left.row < right.row + right.rowSpan
		&& left.row + left.rowSpan > right.row;
}

function horizontalOverlap(left, right) {
	return left.column < right.column + right.columnSpan && left.column + left.columnSpan > right.column;
}

function firstFree(entries, { columns = DASHBOARD_GRID_COLUMNS, columnSpan = 1, rowSpan = 1, startRow = 0 } = {}) {
	const layouts = entries.map((entry) => entry.layout || entry);
	const width = Math.max(1, Math.min(columns, Math.round(Number(columnSpan) || 1)));
	const height = Math.max(1, Math.round(Number(rowSpan) || 1));
	const firstRow = Math.max(0, Math.round(Number(startRow) || 0));
	const rowsToTry = [...new Set([firstRow, ...layouts.map((layout) => layout.row + layout.rowSpan).filter((row) => row >= firstRow)])].sort((left, right) => left - right);
	for (const row of rowsToTry) for (let column = 0; column <= columns - width; column++) {
		const layout = { row, column, columnSpan: width, rowSpan: height };
		if (!layouts.some((candidate) => overlaps(layout, candidate))) return layout;
	}
	return { row: Math.max(firstRow, ...layouts.map((layout) => layout.row + layout.rowSpan)), column: 0, columnSpan: width, rowSpan: height };
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
	return firstFree(scopeEntries(page, groupId), { columns: page.gridColumns, columnSpan, rowSpan, startRow });
}

export function compactScope(page, groupId = null) {
	const entries = orderedItems(scopeEntries(page, groupId)); const placed = [];
	for (const entry of entries) {
		entry.layout = firstFree(placed, { columns: page.gridColumns, columnSpan: entry.layout.columnSpan, rowSpan: entry.layout.rowSpan });
		placed.push(entry);
	}
	if (groupId) refreshGroupRowSpans(page);
	return page;
}

export function placeEntries(page, entryIds, { groupId = null } = {}) {
	const protectedIds = new Set(entryIds); const entries = scopeEntries(page, groupId);
	const moving = orderedItems(entries.filter((entry) => protectedIds.has(entry.id)));
	const fixed = entries.filter((entry) => !protectedIds.has(entry.id));
	let rowOffset = 0;
	while (moving.some((entry) => fixed.some((candidate) => overlaps({ ...entry.layout, row: entry.layout.row + rowOffset }, candidate.layout)))) {
		const collidingBottoms = moving.flatMap((entry) => fixed
			.filter((candidate) => overlaps({ ...entry.layout, row: entry.layout.row + rowOffset }, candidate.layout))
			.map((candidate) => candidate.layout.row + candidate.layout.rowSpan - entry.layout.row));
		rowOffset = Math.max(rowOffset + 1, ...collidingBottoms);
	}
	if (rowOffset) for (const entry of moving) entry.layout = { ...entry.layout, row: entry.layout.row + rowOffset };
	if (groupId) refreshGroupRowSpans(page);
	return page;
}

export function placeEntry(page, entryId, target, { groupId = null } = {}) {
	const entries = scopeEntries(page, groupId); const entry = entries.find((candidate) => candidate.id === entryId);
	if (!entry) return page;
	const layout = {
		row: Math.max(0, Math.round(Number(target.row) || 0)),
		column: Math.max(0, Math.min(page.gridColumns - entry.layout.columnSpan, Math.round(Number(target.column) || 0))),
		columnSpan: entry.layout.columnSpan,
		rowSpan: entry.layout.rowSpan,
	};
	if (!entries.some((candidate) => candidate.id !== entry.id && overlaps(layout, candidate.layout))) {
		entry.layout = layout; if (groupId) refreshGroupRowSpans(page); return page;
	}
	entry.layout = layout;
	return placeEntries(page, [entryId], { groupId });
}

function projectWithoutOverlap(layout, placed) {
	if (!placed.some((candidate) => overlaps(layout, candidate))) return layout;
	const rowsToTry = [...new Set(placed.map((candidate) => candidate.row + candidate.rowSpan).filter((row) => row >= layout.row))].sort((left, right) => left - right);
	for (const row of rowsToTry) {
		const candidate = { ...layout, row };
		if (!placed.some((other) => overlaps(candidate, other))) return candidate;
	}
	return { ...layout, row: Math.max(layout.row, ...placed.map((candidate) => candidate.row + candidate.rowSpan)) };
}

function projectedSize(entry, projections, columns) {
	const projection = projections?.get?.(entry.id);
	const requestedColumnSpan = Number(projection?.columnSpan);
	const requestedRowSpan = Number(projection?.rowSpan);
	const columnSpan = Number.isFinite(requestedColumnSpan) && requestedColumnSpan > 0
		? Math.max(1, Math.min(columns, Math.round(requestedColumnSpan)))
		: Math.max(1, Math.min(columns, entry.layout.columnSpan));
	const rowSpan = Number.isFinite(requestedRowSpan) && requestedRowSpan > 0 ? Math.max(1, Math.round(requestedRowSpan)) : entry.layout.rowSpan;
	return { columnSpan, rowSpan };
}

export function projectScope(entries, columns = DASHBOARD_GRID_COLUMNS, sizeProjections = null) {
	const source = orderedItems(entries); const result = new Map(); const placed = [];
	if (columns === 1) {
		let row = 0;
		for (const entry of source) {
			const { rowSpan } = projectedSize(entry, sizeProjections, columns);
			const layout = { row, column: 0, columnSpan: 1, rowSpan };
			result.set(entry.id, layout); placed.push({ entry, layout }); row += rowSpan;
		}
		return result;
	}
	for (const entry of source) {
		const supports = placed.filter(({ entry: candidate }) => candidate.layout.row + candidate.layout.rowSpan <= entry.layout.row && horizontalOverlap(candidate.layout, entry.layout));
		const supportBottom = supports.length ? Math.max(...supports.map(({ entry: candidate }) => candidate.layout.row + candidate.layout.rowSpan)) : null;
		const row = supportBottom == null ? entry.layout.row : Math.max(...supports
			.filter(({ entry: candidate }) => candidate.layout.row + candidate.layout.rowSpan === supportBottom)
			.map(({ layout }) => layout.row + layout.rowSpan)) + entry.layout.row - supportBottom;
		const { columnSpan, rowSpan } = projectedSize(entry, sizeProjections, columns);
		const candidate = { row, column: Math.min(entry.layout.column, columns - columnSpan), columnSpan, rowSpan };
		const layout = projectWithoutOverlap(candidate, placed.map((item) => item.layout));
		result.set(entry.id, layout); placed.push({ entry, layout });
	}
	return result;
}

export function projectGroupScope(members, columns = DASHBOARD_GRID_COLUMNS, includeHeader = true, sizeProjections = null) {
	const projection = projectScope(members, columns, sizeProjections);
	const projectedMembers = members.map((item) => ({ ...item, layout: projection.get(item.id) || { ...item.layout } }));
	return { projection, rowSpan: recommendedGroupRowSpan(projectedMembers, includeHeader) };
}
