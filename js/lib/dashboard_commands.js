/** Immutable Dashboard V2 commands composed from pure model/layout helpers. */

import { createControlItem, createLayoutGroup, createSeparatorItem, findItem, findPage, normalizeDashboard, stableId } from "./dashboard_model.js";
import { compactScope, firstAvailableLayout, orderedItems, placeEntry } from "./dashboard_layout.js";
import { DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, DASHBOARD_MIN_CONTROL_COLUMN_SPAN } from "./dashboard_sizing.js";

function copy(model) { return structuredClone(normalizeDashboard(model)); }
function removeEmptyGroups(page) {
	const used = new Set(page.items.map((item) => item.groupId).filter(Boolean)); page.groups = page.groups.filter((group) => used.has(group.id)); return page;
}

export function addItems(model, pageId, controls) {
	const next = copy(model); const page = findPage(next, pageId); if (!page) throw new Error("Dashboard target page is missing");
	for (const control of controls) {
		const item = createControlItem(control.binding, control.label, { row: 0, column: 0, columnSpan: DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, rowSpan: control.rowSpan || DASHBOARD_DEFAULT_CONTROL_ROW_SPAN });
		item.layout = firstAvailableLayout(page, { columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan }); page.items.push(item);
	}
	return normalizeDashboard(next);
}

export function addSeparator(model, pageId, label = "") {
	const next = copy(model); const page = findPage(next, pageId); if (!page) throw new Error("Dashboard target page is missing");
	const item = createSeparatorItem(label); item.layout = firstAvailableLayout(page, { columnSpan: page.gridColumns, rowSpan: item.layout.rowSpan }); page.items.push(item); return normalizeDashboard(next);
}

export function removeItems(model, itemIds) {
	const ids = new Set(itemIds); const next = copy(model);
	for (const page of next.pages) { page.items = page.items.filter((item) => !ids.has(item.id)); removeEmptyGroups(page); }
	return normalizeDashboard(next);
}

export function updateItem(model, itemId, callback) {
	const next = copy(model); const { item } = findItem(next, itemId); if (item) callback(item); return normalizeDashboard(next);
}

export function moveItems(model, itemIds, targetPageId, { groupId = null, row = null, column = 0 } = {}) {
	const next = copy(model); const ids = new Set(itemIds); const moving = [];
	for (const page of next.pages) {
		for (const item of page.items) if (ids.has(item.id)) moving.push(item);
		page.items = page.items.filter((item) => !ids.has(item.id));
	}
	const page = findPage(next, targetPageId); if (!page) throw new Error("Dashboard target page is missing");
	if (groupId && !page.groups.some((group) => group.id === groupId)) throw new Error("Dashboard target group is missing");
	for (const item of orderedItems(moving)) {
		item.groupId = groupId;
		item.layout = row == null ? firstAvailableLayout(page, { groupId, columnSpan: item.kind === "separator" ? page.gridColumns : item.layout.columnSpan, rowSpan: item.layout.rowSpan }) : { row, column, columnSpan: item.kind === "separator" ? page.gridColumns : item.layout.columnSpan, rowSpan: item.layout.rowSpan };
		page.items.push(item); placeEntry(page, item.id, item.layout, { groupId });
	}
	if (groupId) { const group = page.groups.find((entry) => entry.id === groupId); placeEntry(page, groupId, group.layout); }
	for (const candidate of next.pages) removeEmptyGroups(candidate);
	return normalizeDashboard(next);
}

export function resizeItems(model, itemIds, columnSpan) {
	const ids = new Set(itemIds); const next = copy(model); const touched = new Set();
	for (const page of next.pages) for (const item of page.items) if (ids.has(item.id) && item.kind === "control") {
		item.layout.columnSpan = Math.max(DASHBOARD_MIN_CONTROL_COLUMN_SPAN, Math.min(page.gridColumns, Math.round(Number(columnSpan)) || DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN));
		item.layout.column = Math.min(item.layout.column, page.gridColumns - item.layout.columnSpan);
		touched.add(`${page.id}:${item.groupId || "page"}`);
	}
	for (const key of touched) {
		const [pageId, scope] = key.split(":"); const page = findPage(next, pageId); const groupId = scope === "page" ? null : scope;
		compactScope(page, groupId); if (groupId) compactScope(page, null);
	}
	return normalizeDashboard(next);
}

export function resizeItem(model, itemId, { columnSpan, rowSpan }) {
	const next = copy(model); const { page, item } = findItem(next, itemId);
	if (!page || item?.kind !== "control") return next;
	item.layout.columnSpan = Math.max(DASHBOARD_MIN_CONTROL_COLUMN_SPAN, Math.min(page.gridColumns, Math.round(Number(columnSpan)) || item.layout.columnSpan));
	item.layout.rowSpan = Math.max(1, Math.round(Number(rowSpan)) || item.layout.rowSpan);
	item.layout.column = Math.min(item.layout.column, page.gridColumns - item.layout.columnSpan);
	placeEntry(page, item.id, item.layout, { groupId: item.groupId });
	if (item.groupId) placeEntry(page, item.groupId, page.groups.find((group) => group.id === item.groupId)?.layout || { row: 0, column: 0 });
	return normalizeDashboard(next);
}

export function createGroup(model, pageId, itemIds, { name = "Group", tone = "neutral" } = {}) {
	if (itemIds.length < 2) throw new Error("A layout group requires at least two items");
	const next = copy(model); const page = findPage(next, pageId); const ids = new Set(itemIds);
	if (!page || itemIds.some((id) => !page.items.some((item) => item.id === id))) throw new Error("Layout group items must belong to one page");
	const selected = orderedItems(page.items.filter((item) => ids.has(item.id))); const row = Math.min(...selected.map((item) => item.layout.row));
	const group = createLayoutGroup(name, tone, row); page.groups.push(group);
	for (const item of selected) item.groupId = group.id;
	removeEmptyGroups(page); compactScope(page, group.id); compactScope(page, null); return normalizeDashboard(next);
}

export function assignToGroup(model, pageId, itemIds, groupId) { return moveItems(model, itemIds, pageId, { groupId }); }

export function ungroupItems(model, pageId, itemIds) {
	const next = copy(model); const page = findPage(next, pageId); if (!page) return next; const ids = new Set(itemIds);
	const items = orderedItems(page.items.filter((item) => ids.has(item.id)));
	for (const item of items) { item.layout = firstAvailableLayout(page, { columnSpan: item.kind === "separator" ? page.gridColumns : item.layout.columnSpan, rowSpan: item.layout.rowSpan }); item.groupId = null; }
	removeEmptyGroups(page); return normalizeDashboard(next);
}

export function deleteGroup(model, pageId, groupId) {
	const next = copy(model); const page = findPage(next, pageId); if (!page) return next;
	const group = page.groups.find((entry) => entry.id === groupId); const members = orderedItems(page.items.filter((item) => item.groupId === groupId));
	page.groups = page.groups.filter((entry) => entry.id !== groupId);
	for (const item of members) { item.layout = firstAvailableLayout(page, { columnSpan: item.kind === "separator" ? page.gridColumns : item.layout.columnSpan, rowSpan: item.layout.rowSpan }); item.groupId = null; }
	if (group) compactScope(page, null); return normalizeDashboard(next);
}

export function moveGroup(model, pageId, groupId, row) {
	const next = copy(model); const page = findPage(next, pageId); const group = page?.groups.find((entry) => entry.id === groupId); if (!group) return next;
	placeEntry(page, groupId, { row, column: 0 }, { groupId: null }); return normalizeDashboard(next);
}

export function compactDashboard(model, pageId, groupId = null) {
	const next = copy(model); const page = findPage(next, pageId); if (page) { compactScope(page, groupId); if (groupId) compactScope(page, null); } return normalizeDashboard(next);
}

export function duplicatePage(model, pageId) {
	const next = copy(model); const source = findPage(next, pageId); if (!source) return next; const clone = structuredClone(source); const groupIds = new Map();
	clone.id = stableId("page"); clone.name = `${clone.name} copy`;
	for (const group of clone.groups) { const previous = group.id; group.id = stableId("group"); groupIds.set(previous, group.id); }
	for (const item of clone.items) { item.id = stableId("item"); if (item.groupId) item.groupId = groupIds.get(item.groupId) || null; }
	next.pages.splice(next.pages.indexOf(source) + 1, 0, clone); return normalizeDashboard(next);
}
