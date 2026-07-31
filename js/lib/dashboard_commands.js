/** Immutable Dashboard V2 commands composed from pure model/layout helpers. */

import { createControlItem, createLayoutGroup, createSeparatorItem, findItem, findPage, normalizeDashboard, normalizeGroupSource, stableId } from "./dashboard_model.js";
import { compactScope, firstAvailableLayout, orderedItems, placeEntries, placeEntry, refreshGroupRowSpans } from "./dashboard_layout.js";
import { DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, DASHBOARD_MIN_CONTROL_COLUMN_SPAN } from "./dashboard_sizing.js";

function copy(model) { return structuredClone(normalizeDashboard(model)); }
function removeEmptyGroups(page) {
	const used = new Set(page.items.map((item) => item.groupId).filter(Boolean)); page.groups = page.groups.filter((group) => used.has(group.id)); return page;
}

function sameGroupSource(left, right) {
	return left?.provider === right?.provider
		&& left?.hostId === right?.hostId
		&& (left?.scopeId || null) === (right?.scopeId || null);
}

function sameControlHost(left, right) {
	return left?.provider === right?.provider && left?.hostId === right?.hostId;
}

function findSourceGroup(page, source) {
	if (!source) return null;
	return page.groups.find((group) => sameGroupSource(group.source, source))
		|| (!source.scopeId && page.groups.find((group) => !group.source && page.items.some((item) => item.groupId === group.id && sameControlHost(item.binding, source))))
		|| null;
}

function normalizeSourceGroup(sourceGroup) {
	const source = normalizeGroupSource(sourceGroup?.source);
	if (!source) return null;
	const separator = sourceGroup.separator?.label != null
		? { label: String(sourceGroup.separator.label) }
		: null;
	return {
		source,
		name: String(sourceGroup.name || "Group"),
		tone: sourceGroup.tone,
		forceGroup: Boolean(source.scopeId || sourceGroup.forceGroup),
		...(separator ? { separator } : {}),
	};
}

function sourceGroupKey(source) {
	return `${source.provider}\u0000${source.hostId}\u0000${source.scopeId || ""}`;
}

function findSourceSeparator(page, source) {
	return page.items.find((item) => item.kind === "separator" && sameGroupSource(item.source, source)) || null;
}

function addSourceSeparator(page, requestedGroup) {
	if (!requestedGroup.separator || findSourceSeparator(page, requestedGroup.source)) return;
	const item = createSeparatorItem(requestedGroup.separator.label, 0, requestedGroup.source);
	item.layout = firstAvailableLayout(page, { columnSpan: page.gridColumns, rowSpan: item.layout.rowSpan });
	page.items.push(item);
}

function createControlFromSpec(control, layout = { row: 0, column: 0 }) {
	return createControlItem(control.binding, control.label, {
		...layout,
		columnSpan: control.columnSpan || DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN,
		rowSpan: control.rowSpan || DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
	});
}

function placeGroupItems(page, controls) {
	const localPage = { ...page, items: [], groups: [] };
	const items = controls.map((control) => createControlFromSpec(control));
	for (const item of items) {
		item.layout = firstAvailableLayout(localPage, { columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan });
		localPage.items.push(item);
	}
	return items;
}

export function addItems(model, pageId, controls, { sourceGroup = null } = {}) {
	let next = copy(model); const page = findPage(next, pageId); if (!page) throw new Error("Dashboard target page is missing");
	const plans = new Map(); const entries = [];
	for (const control of controls) {
		const requestedGroup = normalizeSourceGroup(control.sourceGroup || sourceGroup);
		if (!requestedGroup) { entries.push({ type: "control", control }); continue; }
		const key = sourceGroupKey(requestedGroup.source);
		if (!plans.has(key)) {
			const plan = { requestedGroup, controls: [] };
			plans.set(key, plan); entries.push({ type: "group", plan });
		}
		plans.get(key).controls.push(control);
	}

	// Scoped sections are laid out in their own coordinate space before the group
	// is placed on the page. Otherwise controls from later sections occupy page
	// cells while earlier groups are being created, which preserves global gaps
	// inside the group and makes the result depend on section count.
	for (const entry of entries) {
		if (entry.type === "control") {
			const currentPage = findPage(next, pageId);
			const item = createControlFromSpec(entry.control);
			item.layout = firstAvailableLayout(currentPage, { columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan });
			currentPage.items.push(item);
			continue;
		}
		const { requestedGroup, controls: groupControls } = entry.plan;
		const currentPage = findPage(next, pageId);
		const existingGroup = findSourceGroup(currentPage, requestedGroup.source);
		if (requestedGroup.forceGroup) {
			addSourceSeparator(currentPage, requestedGroup);
			if (existingGroup) {
				const itemIds = groupControls.map((control) => {
					const item = createControlFromSpec(control);
					item.layout = firstAvailableLayout(currentPage, { columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan });
					currentPage.items.push(item);
					return item.id;
				});
				next = moveItems(next, itemIds, pageId, { groupId: existingGroup.id });
				continue;
			}
			const items = placeGroupItems(currentPage, groupControls);
			currentPage.items.push(...items);
			createGroupInPage(currentPage, items.map((item) => item.id), {
				name: requestedGroup.name,
				tone: requestedGroup.tone,
				source: requestedGroup.source,
				allowSingle: true,
			});
			continue;
		}

		// An unscoped source group is the legacy auto-grouping path. Keep its
		// existing-host adoption behavior, but do not apply it to separator scopes.
		const itemIds = groupControls.map((control) => {
			const item = createControlFromSpec(control);
			item.layout = firstAvailableLayout(currentPage, { columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan });
			currentPage.items.push(item);
			return item.id;
		});
		const group = findSourceGroup(currentPage, requestedGroup.source);
		if (group) {
			next = moveItems(next, itemIds, pageId, { groupId: group.id });
			continue;
		}
		const candidateIds = currentPage.items.filter((item) => !item.groupId && sameControlHost(item.binding, requestedGroup.source)).map((item) => item.id);
		if (candidateIds.length < 2) continue;
		next = createGroup(next, pageId, candidateIds, {
			name: requestedGroup.name,
			tone: requestedGroup.tone,
			source: requestedGroup.source,
			allowSingle: false,
		});
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

// 复制保持绑定身份不变：同一控件允许多处投影，值仍由原宿主持有。
export function duplicateItems(model, pageId, itemIds) {
	const next = copy(model); const page = findPage(next, pageId); if (!page) throw new Error("Dashboard target page is missing");
	const ids = new Set(itemIds);
	for (const source of orderedItems(page.items.filter((item) => ids.has(item.id)))) {
		const item = structuredClone(source);
		item.id = stableId("item");
		item.layout = firstAvailableLayout(page, { groupId: item.groupId, columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan });
		page.items.push(item);
	}
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
	const ordered = orderedItems(moving);
	if (row == null) {
		for (const item of ordered) {
			item.groupId = groupId;
			item.layout = firstAvailableLayout(page, { groupId, columnSpan: item.kind === "separator" ? page.gridColumns : item.layout.columnSpan, rowSpan: item.layout.rowSpan });
			page.items.push(item);
		}
	} else if (ordered.length) {
		const minRow = Math.min(...ordered.map((item) => item.layout.row));
		const minColumn = Math.min(...ordered.map((item) => item.layout.column));
		const width = Math.max(...ordered.map((item) => item.layout.column - minColumn + (item.kind === "separator" ? page.gridColumns : item.layout.columnSpan)));
		const targetRow = Math.max(0, Number(row) || 0); const targetColumn = Math.max(0, Math.min(page.gridColumns - width, Number(column) || 0));
		for (const item of ordered) {
			item.groupId = groupId;
			item.layout = { ...item.layout, row: targetRow + item.layout.row - minRow, column: targetColumn + item.layout.column - minColumn, columnSpan: item.kind === "separator" ? page.gridColumns : item.layout.columnSpan };
			page.items.push(item);
		}
		placeEntries(page, ordered.map((item) => item.id), { groupId });
	}
	if (groupId) { const group = page.groups.find((entry) => entry.id === groupId); placeEntry(page, groupId, group.layout); }
	for (const candidate of next.pages) removeEmptyGroups(candidate);
	return normalizeDashboard(next);
}

export function resizeItems(model, itemIds, columnSpan) {
	const ids = new Set(itemIds); const next = copy(model); const touched = [];
	for (const page of next.pages) for (const item of page.items) if (ids.has(item.id) && item.kind === "control") {
		item.layout.columnSpan = Math.max(DASHBOARD_MIN_CONTROL_COLUMN_SPAN, Math.min(page.gridColumns, Math.round(Number(columnSpan)) || DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN));
		item.layout.column = Math.min(item.layout.column, page.gridColumns - item.layout.columnSpan);
		touched.push({ page, item });
	}
	for (const { page, item } of touched) {
		placeEntry(page, item.id, item.layout, { groupId: item.groupId });
		if (item.groupId) {
			const group = page.groups.find((candidate) => candidate.id === item.groupId);
			if (group) placeEntry(page, group.id, group.layout);
		}
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

function createGroupInPage(page, itemIds, { name = "Group", tone = "neutral", source = null, allowSingle = false } = {}) {
	if (itemIds.length < (allowSingle ? 1 : 2)) throw new Error("A layout group requires at least two items");
	const ids = new Set(itemIds);
	if (itemIds.some((id) => !page.items.some((item) => item.id === id))) throw new Error("Layout group items must belong to one page");
	const selected = page.items.filter((item) => ids.has(item.id));
	const absoluteLayouts = new Map(selected.map((item) => {
		const parent = item.groupId ? page.groups.find((group) => group.id === item.groupId) : null;
		return [item.id, { ...item.layout, row: item.layout.row + (parent?.layout.row || 0), column: item.layout.column + (parent?.layout.column || 0) }];
	}));
	const row = Math.min(...[...absoluteLayouts.values()].map((layout) => layout.row));
	const group = createLayoutGroup(name, tone, row, source); page.groups.push(group);
	for (const item of selected) {
		const layout = absoluteLayouts.get(item.id);
		item.groupId = group.id; item.layout = { ...layout, row: layout.row - row };
	}
	removeEmptyGroups(page); placeEntry(page, group.id, group.layout);
	return group;
}

export function createGroup(model, pageId, itemIds, options = {}) {
	const next = copy(model); const page = findPage(next, pageId);
	if (!page) throw new Error("Dashboard target page is missing");
	createGroupInPage(page, itemIds, options);
	return normalizeDashboard(next);
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
	if (!group) return next;
	page.groups = page.groups.filter((entry) => entry.id !== groupId);
	for (const item of members) {
		item.layout = { ...item.layout, row: group.layout.row + item.layout.row, column: group.layout.column + item.layout.column };
		item.groupId = null;
	}
	return normalizeDashboard(next);
}

export function moveGroup(model, pageId, groupId, row) {
	const next = copy(model); const page = findPage(next, pageId); const group = page?.groups.find((entry) => entry.id === groupId); if (!group) return next;
	placeEntry(page, groupId, { row, column: 0 }, { groupId: null }); return normalizeDashboard(next);
}

// 整组跨页移动：组身份、成员和成员间的相对排列一起带走，组框落在目标页空位。
export function moveGroups(model, groupIds, targetPageId) {
	const next = copy(model); const target = findPage(next, targetPageId); if (!target) throw new Error("Dashboard target page is missing");
	const ids = new Set(groupIds);
	for (const page of next.pages) {
		if (page === target) continue;
		for (const group of page.groups.filter((entry) => ids.has(entry.id))) {
			const members = orderedItems(page.items.filter((item) => item.groupId === group.id));
			page.items = page.items.filter((item) => item.groupId !== group.id);
			page.groups = page.groups.filter((entry) => entry.id !== group.id);
			target.groups.push(group);
			for (const item of members) {
				item.groupId = group.id;
				item.layout = firstAvailableLayout(target, { groupId: group.id, columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan });
				target.items.push(item);
			}
			refreshGroupRowSpans(target);
			group.layout = firstAvailableLayout(target, { columnSpan: target.gridColumns, rowSpan: group.layout.rowSpan });
		}
		removeEmptyGroups(page);
	}
	return normalizeDashboard(next);
}

export function compactDashboard(model, pageId, groupId = null) {
	const next = copy(model); const page = findPage(next, pageId);
	if (page) {
		// 先收紧每个组的成员，组框高度由成员范围派生，随后根级整理才能按新高度回填空隙。
		if (groupId) compactScope(page, groupId);
		else for (const group of page.groups) compactScope(page, group.id);
		compactScope(page, null);
	}
	return normalizeDashboard(next);
}

export function duplicatePage(model, pageId) {
	const next = copy(model); const source = findPage(next, pageId); if (!source) return next; const clone = structuredClone(source); const groupIds = new Map();
	clone.id = stableId("page"); clone.name = `${clone.name} copy`;
	for (const group of clone.groups) { const previous = group.id; group.id = stableId("group"); groupIds.set(previous, group.id); }
	for (const item of clone.items) { item.id = stableId("item"); if (item.groupId) item.groupId = groupIds.get(item.groupId) || null; }
	next.pages.splice(next.pages.indexOf(source) + 1, 0, clone); return normalizeDashboard(next);
}
