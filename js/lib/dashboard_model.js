/** Pure workflow-owned Dashboard V3 integer-grid model and V2 migration codec. */

import {
	DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN,
	DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
	DASHBOARD_GRID_COLUMNS,
	DASHBOARD_MIN_CONTROL_COLUMN_SPAN,
	DASHBOARD_SEPARATOR_ROW_SPAN,
	normalizeDashboardColumnSpan,
	normalizeDashboardRowSpan,
	recommendedGroupRowSpan,
} from "./dashboard_sizing.js";

export const DASHBOARD_VERSION = 3;
export const DASHBOARD_TONES = Object.freeze(["neutral", "blue", "green", "amber", "purple", "red"]);

export class DashboardModelError extends Error {
	constructor(message, code = "invalid-dashboard") { super(message); this.name = "DashboardModelError"; this.code = code; }
}

export function stableId(prefix) {
	return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
}

export function emptyDashboard() { return { version: DASHBOARD_VERSION, pages: [] }; }

function normalizeBinding(binding) {
	if (!binding || typeof binding !== "object") throw new DashboardModelError("Control binding is missing", "invalid-binding");
	for (const field of ["provider", "hostId", "controlId", "valueType"]) {
		if (typeof binding[field] !== "string" || !binding[field]) throw new DashboardModelError(`Control binding field ${field} is invalid`, "invalid-binding");
	}
	return { provider: binding.provider, hostId: binding.hostId, controlId: binding.controlId, valueType: binding.valueType, ...(typeof binding.adapterId === "string" && binding.adapterId ? { adapterId: binding.adapterId } : {}) };
}

function normalizeLayout(layout, { fullWidth = false, rowSpan = null, legacyColumns = false } = {}) {
	const row = Number(layout?.row);
	const columnScale = legacyColumns ? DASHBOARD_GRID_COLUMNS / 2 : 1;
	const column = Number(layout?.column) * columnScale;
	const columnSpan = Number(layout?.columnSpan) * columnScale;
	const normalizedRowSpan = Number(rowSpan ?? layout?.rowSpan);
	if (!Number.isInteger(row) || row < 0) throw new DashboardModelError("Grid row must be a non-negative integer", "invalid-layout");
	if (!Number.isInteger(normalizedRowSpan) || normalizedRowSpan < 1) throw new DashboardModelError("Grid row span must be a positive integer", "invalid-layout");
	if (fullWidth) {
		if (column !== 0 || columnSpan !== DASHBOARD_GRID_COLUMNS) throw new DashboardModelError("Full-width grid items must occupy the complete grid", "invalid-layout");
		return { row, column: 0, columnSpan: DASHBOARD_GRID_COLUMNS, rowSpan: normalizedRowSpan };
	}
	if (!Number.isInteger(column) || column < 0 || !Number.isInteger(columnSpan) || columnSpan < 1 || column + columnSpan > DASHBOARD_GRID_COLUMNS) throw new DashboardModelError("Grid column or span is invalid", "invalid-layout");
	return { row, column, columnSpan, rowSpan: normalizedRowSpan };
}

export function normalizeGroupSource(source) {
	if (source == null) return null;
	if (typeof source.provider !== "string" || !source.provider || typeof source.hostId !== "string" || !source.hostId) {
		throw new DashboardModelError("Dashboard group source is invalid", "invalid-group-source");
	}
	if (source.scopeId != null && (typeof source.scopeId !== "string" || !source.scopeId)) {
		throw new DashboardModelError("Dashboard group source scope is invalid", "invalid-group-source");
	}
	return {
		provider: source.provider,
		hostId: source.hostId,
		...(source.scopeId ? { scopeId: source.scopeId } : {}),
	};
}

function normalizeControlLayout(layout) {
	const columnSpan = normalizeDashboardColumnSpan(layout.columnSpan);
	return {
		...layout,
		column: Math.min(layout.column, DASHBOARD_GRID_COLUMNS - columnSpan),
		columnSpan,
		rowSpan: normalizeDashboardRowSpan(layout.rowSpan),
	};
}

function assertUnique(id, ids) {
	if (!id || typeof id !== "string") throw new DashboardModelError("Dashboard identity is missing", "invalid-id");
	if (ids.has(id)) throw new DashboardModelError(`Duplicate dashboard identity: ${id}`, "duplicate-id");
	ids.add(id);
}

function layoutsOverlap(left, right) {
	return left.column < right.column + right.columnSpan
		&& left.column + left.columnSpan > right.column
		&& left.row < right.row + right.rowSpan
		&& left.row + left.rowSpan > right.row;
}

function assertNoOverlap(entries, scope) {
	for (let index = 0; index < entries.length; index++) {
		for (let candidate = index + 1; candidate < entries.length; candidate++) {
			if (layoutsOverlap(entries[index].layout, entries[candidate].layout)) throw new DashboardModelError(`Grid items overlap in ${scope}`, "overlap");
		}
	}
}

function repairNormalizedOverlaps(entries, columns) {
	const placed = [];
	for (const entry of [...entries].sort((left, right) => left.layout.row - right.layout.row || left.layout.column - right.layout.column || left.id.localeCompare(right.id))) {
		const base = entry.layout;
		const columnsToTry = [base.column, ...Array.from({ length: columns }, (_, column) => column).filter((column) => column !== base.column)];
		const rowsToTry = [...new Set([base.row, ...placed.map((layout) => layout.row + layout.rowSpan).filter((row) => row >= base.row)])].sort((left, right) => left - right);
		const next = rowsToTry.map((row) => {
			const column = columnsToTry.find((candidateColumn) => candidateColumn + base.columnSpan <= columns && !placed.some((other) => layoutsOverlap({ ...base, row, column: candidateColumn }, other)));
			return column == null ? null : { ...base, row, column };
		}).find(Boolean);
		entry.layout = next || { ...base, row: Math.max(base.row, ...placed.map((layout) => layout.row + layout.rowSpan)) };
		placed.push(entry.layout);
	}
}

function groupContentColumnSpan(items) {
	return items.length ? Math.max(...items.map((item) => item.layout.column + item.layout.columnSpan)) : 1;
}

export function normalizeDashboard(raw) {
	if (raw == null) return emptyDashboard();
	const sourceVersion = Number(raw?.version);
	if (![2, DASHBOARD_VERSION].includes(sourceVersion)) throw new DashboardModelError(`Unsupported dashboard version: ${raw?.version ?? "missing"}`, "unsupported-version");
	const ids = new Set(); const result = emptyDashboard();
	if (!Array.isArray(raw.pages)) throw new DashboardModelError("Dashboard pages must be an array");
	for (const sourcePage of raw.pages) {
		assertUnique(sourcePage?.id, ids);
		const legacyColumns = sourceVersion === 2 && sourcePage?.gridColumns == null;
		if (!legacyColumns && sourcePage?.gridColumns !== DASHBOARD_GRID_COLUMNS) throw new DashboardModelError(`Unsupported dashboard grid: ${sourcePage?.gridColumns ?? "missing"}`, "unsupported-grid");
		const page = { id: sourcePage.id, name: String(sourcePage.name || "Page"), gridColumns: DASHBOARD_GRID_COLUMNS, tone: DASHBOARD_TONES.includes(sourcePage.tone) ? sourcePage.tone : null, items: [], groups: [] };
		if (!Array.isArray(sourcePage.groups) || !Array.isArray(sourcePage.items)) throw new DashboardModelError("Dashboard page collections are invalid");
		for (const sourceGroup of sourcePage.groups) {
			assertUnique(sourceGroup?.id, ids);
			const source = normalizeGroupSource(sourceGroup.source);
			const widthMode = sourceGroup.widthMode === "fixed" ? "fixed" : "auto";
			page.groups.push({
				id: sourceGroup.id, name: String(sourceGroup.name || "Group"), tone: DASHBOARD_TONES.includes(sourceGroup.tone) ? sourceGroup.tone : "neutral",
				showTitle: sourceGroup.showTitle !== false,
				...(typeof sourceGroup.nameSource === "string" ? { nameSource: sourceGroup.nameSource } : {}),
				...(typeof sourceGroup.nameOverride === "string" ? { nameOverride: sourceGroup.nameOverride } : {}),
				...(source ? { source } : {}), widthMode, layout: normalizeLayout(sourceGroup.layout, { rowSpan: 1, legacyColumns }),
			});
		}
		const rawItems = [];
		const groupIds = new Set(page.groups.map((group) => group.id));
		for (const sourceItem of sourcePage.items) {
			assertUnique(sourceItem?.id, ids);
			const kind = sourceItem?.kind;
			if (!["control", "separator"].includes(kind)) throw new DashboardModelError(`Unsupported dashboard item kind: ${kind}`, "invalid-kind");
			const groupId = sourceItem.groupId == null ? null : String(sourceItem.groupId);
			if (groupId && !groupIds.has(groupId)) throw new DashboardModelError(`Dashboard item references missing group: ${groupId}`, "missing-group");
			const source = kind === "separator" ? normalizeGroupSource(sourceItem.source) : null;
			const groupSource = kind === "control" ? normalizeGroupSource(sourceItem.groupSource) : null;
			const layout = normalizeLayout(sourceItem.layout, { fullWidth: kind === "separator", rowSpan: kind === "separator" ? DASHBOARD_SEPARATOR_ROW_SPAN : null, legacyColumns });
			rawItems.push({ id: sourceItem.id, groupId, layout });
			page.items.push({
				id: sourceItem.id, kind, binding: kind === "control" ? normalizeBinding(sourceItem.binding) : null,
				label: String(sourceItem.label || ""), groupId,
				...(typeof sourceItem.labelSource === "string" ? { labelSource: sourceItem.labelSource } : {}),
				...(typeof sourceItem.labelOverride === "string" ? { labelOverride: sourceItem.labelOverride } : {}),
				...(groupSource ? { groupSource } : {}),
				...(source ? { source } : {}),
				layout: kind === "control" ? normalizeControlLayout(layout) : layout,
			});
		}
		const rawPageEntries = [...rawItems.filter((item) => !item.groupId), ...page.groups];
		if (rawPageEntries.some((entry) => entry.layout.columnSpan < DASHBOARD_MIN_CONTROL_COLUMN_SPAN)) assertNoOverlap(rawPageEntries, `page ${sourcePage.id}`);
		for (const group of page.groups) {
			const rawMembers = rawItems.filter((item) => item.groupId === group.id);
			if (rawMembers.some((entry) => entry.layout.columnSpan < DASHBOARD_MIN_CONTROL_COLUMN_SPAN)) assertNoOverlap(rawMembers, `group ${group.id}`);
		}
		for (const group of page.groups) {
			const members = page.items.filter((item) => item.groupId === group.id);
			repairNormalizedOverlaps(members, DASHBOARD_GRID_COLUMNS);
			const minimumColumnSpan = Math.min(DASHBOARD_GRID_COLUMNS, groupContentColumnSpan(members));
			if (group.widthMode === "auto") group.layout.columnSpan = normalizeDashboardColumnSpan(minimumColumnSpan, { minimum: minimumColumnSpan });
			else group.layout.columnSpan = normalizeDashboardColumnSpan(Math.max(group.layout.columnSpan, minimumColumnSpan), { minimum: minimumColumnSpan });
			group.layout.column = Math.min(group.layout.column, DASHBOARD_GRID_COLUMNS - group.layout.columnSpan);
			group.layout.rowSpan = recommendedGroupRowSpan(members);
		}
		repairNormalizedOverlaps([...page.items.filter((item) => !item.groupId), ...page.groups], DASHBOARD_GRID_COLUMNS);
		assertNoOverlap([...page.items.filter((item) => !item.groupId), ...page.groups], `page ${page.id}`);
		for (const group of page.groups) assertNoOverlap(page.items.filter((item) => item.groupId === group.id), `group ${group.id}`);
		result.pages.push(page);
	}
	return result;
}

export function createPage(name = "Page") { return { id: stableId("page"), name, gridColumns: DASHBOARD_GRID_COLUMNS, tone: null, items: [], groups: [] }; }
export function createControlItem(binding, label = "", layout = { row: 0, column: 0, columnSpan: DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, rowSpan: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN }, groupSource = null) {
	const sourceLabel = String(label || ""); const normalizedSource = normalizeGroupSource(groupSource);
	const normalizedLayout = normalizeControlLayout(normalizeLayout(layout));
	return { id: stableId("item"), kind: "control", binding: normalizeBinding(binding), label: sourceLabel, labelSource: sourceLabel || null, labelOverride: null, groupId: null, ...(normalizedSource ? { groupSource: normalizedSource } : {}), layout: normalizedLayout };
}
export function createSeparatorItem(label = "", row = 0, source = null) {
	const normalizedSource = normalizeGroupSource(source);
	return {
		id: stableId("item"), kind: "separator", binding: null, label, groupId: null,
		...(normalizedSource ? { source: normalizedSource } : {}),
		layout: { row, column: 0, columnSpan: DASHBOARD_GRID_COLUMNS, rowSpan: DASHBOARD_SEPARATOR_ROW_SPAN },
	};
}
export function createLayoutGroup(name = "Group", tone = "neutral", row = 0, source = null, columnSpan = DASHBOARD_GRID_COLUMNS) {
	const normalizedSource = normalizeGroupSource(source);
	const sourceName = String(name || "Group");
	return {
		id: stableId("group"), name: sourceName, tone: DASHBOARD_TONES.includes(tone) ? tone : "neutral", showTitle: true, widthMode: "auto",
		...(normalizedSource ? { source: normalizedSource, nameSource: sourceName } : {}), nameOverride: null,
		layout: { row, column: 0, columnSpan: normalizeDashboardColumnSpan(columnSpan, { minimum: 1 }), rowSpan: 1 },
	};
}

export function findPage(model, pageId) { return model.pages.find((page) => page.id === pageId) || null; }
export function findItem(model, itemId) {
	for (const page of model.pages) { const item = page.items.find((entry) => entry.id === itemId); if (item) return { page, item }; }
	return { page: null, item: null };
}
export function bindingKey(binding) {
	return `${binding.provider}:${binding.hostId}:${binding.controlId}${binding.adapterId ? `:${binding.adapterId}` : ""}`;
}
