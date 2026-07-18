/** Pure workflow-owned Dashboard V2 model and preset codec. */

import {
	DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN,
	DASHBOARD_DEFAULT_CONTROL_ROW_SPAN,
	DASHBOARD_GRID_COLUMNS,
	DASHBOARD_SEPARATOR_ROW_SPAN,
	recommendedGroupRowSpan,
} from "./dashboard_sizing.js";

export const DASHBOARD_VERSION = 2;
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

function assertUnique(id, ids) {
	if (!id || typeof id !== "string") throw new DashboardModelError("Dashboard identity is missing", "invalid-id");
	if (ids.has(id)) throw new DashboardModelError(`Duplicate dashboard identity: ${id}`, "duplicate-id");
	ids.add(id);
}

function assertNoOverlap(entries, scope) {
	const cells = new Set();
	for (const entry of entries) {
		for (let row = entry.layout.row; row < entry.layout.row + entry.layout.rowSpan; row++) for (let column = entry.layout.column; column < entry.layout.column + entry.layout.columnSpan; column++) {
			const cell = `${row}:${column}`; if (cells.has(cell)) throw new DashboardModelError(`Grid items overlap in ${scope}`, "overlap"); cells.add(cell);
		}
	}
}

export function normalizeDashboard(raw) {
	if (raw == null) return emptyDashboard();
	if (raw?.version !== DASHBOARD_VERSION) throw new DashboardModelError(`Unsupported dashboard version: ${raw?.version ?? "missing"}`, "unsupported-version");
	const ids = new Set(); const result = emptyDashboard();
	if (!Array.isArray(raw.pages)) throw new DashboardModelError("Dashboard pages must be an array");
	for (const sourcePage of raw.pages) {
		assertUnique(sourcePage?.id, ids);
		const legacyColumns = sourcePage?.gridColumns !== DASHBOARD_GRID_COLUMNS;
		if (sourcePage?.gridColumns != null && sourcePage.gridColumns !== DASHBOARD_GRID_COLUMNS) throw new DashboardModelError(`Unsupported dashboard grid: ${sourcePage.gridColumns}`, "unsupported-grid");
		const page = { id: sourcePage.id, name: String(sourcePage.name || "Page"), gridColumns: DASHBOARD_GRID_COLUMNS, items: [], groups: [] };
		if (!Array.isArray(sourcePage.groups) || !Array.isArray(sourcePage.items)) throw new DashboardModelError("Dashboard page collections are invalid");
		for (const sourceGroup of sourcePage.groups) {
			assertUnique(sourceGroup?.id, ids);
			page.groups.push({ id: sourceGroup.id, name: String(sourceGroup.name || "Group"), tone: DASHBOARD_TONES.includes(sourceGroup.tone) ? sourceGroup.tone : "neutral", layout: normalizeLayout(sourceGroup.layout, { fullWidth: true, rowSpan: 1, legacyColumns }) });
		}
		const groupIds = new Set(page.groups.map((group) => group.id));
		for (const sourceItem of sourcePage.items) {
			assertUnique(sourceItem?.id, ids);
			const kind = sourceItem?.kind;
			if (!["control", "separator"].includes(kind)) throw new DashboardModelError(`Unsupported dashboard item kind: ${kind}`, "invalid-kind");
			const groupId = sourceItem.groupId == null ? null : String(sourceItem.groupId);
			if (groupId && !groupIds.has(groupId)) throw new DashboardModelError(`Dashboard item references missing group: ${groupId}`, "missing-group");
			page.items.push({
				id: sourceItem.id, kind, binding: kind === "control" ? normalizeBinding(sourceItem.binding) : null,
				label: String(sourceItem.label || ""), groupId, compact: Boolean(sourceItem.compact),
				layout: normalizeLayout(sourceItem.layout, { fullWidth: kind === "separator", rowSpan: kind === "separator" ? DASHBOARD_SEPARATOR_ROW_SPAN : null, legacyColumns }),
			});
		}
		for (const group of page.groups) group.layout.rowSpan = recommendedGroupRowSpan(page.items.filter((item) => item.groupId === group.id));
		assertNoOverlap([...page.items.filter((item) => !item.groupId), ...page.groups], `page ${page.id}`);
		for (const group of page.groups) assertNoOverlap(page.items.filter((item) => item.groupId === group.id), `group ${group.id}`);
		result.pages.push(page);
	}
	return result;
}

export function createPage(name = "Page") { return { id: stableId("page"), name, gridColumns: DASHBOARD_GRID_COLUMNS, items: [], groups: [] }; }
export function createControlItem(binding, label = "", layout = { row: 0, column: 0, columnSpan: DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, rowSpan: DASHBOARD_DEFAULT_CONTROL_ROW_SPAN }) {
	return { id: stableId("item"), kind: "control", binding: normalizeBinding(binding), label, groupId: null, compact: false, layout: normalizeLayout(layout) };
}
export function createSeparatorItem(label = "", row = 0) {
	return { id: stableId("item"), kind: "separator", binding: null, label, groupId: null, compact: false, layout: { row, column: 0, columnSpan: DASHBOARD_GRID_COLUMNS, rowSpan: DASHBOARD_SEPARATOR_ROW_SPAN } };
}
export function createLayoutGroup(name = "Group", tone = "neutral", row = 0) {
	return { id: stableId("group"), name, tone: DASHBOARD_TONES.includes(tone) ? tone : "neutral", layout: { row, column: 0, columnSpan: DASHBOARD_GRID_COLUMNS, rowSpan: 1 } };
}

export function findPage(model, pageId) { return model.pages.find((page) => page.id === pageId) || null; }
export function findItem(model, itemId) {
	for (const page of model.pages) { const item = page.items.find((entry) => entry.id === itemId); if (item) return { page, item }; }
	return { page: null, item: null };
}
export function bindingKey(binding) {
	return `${binding.provider}:${binding.hostId}:${binding.controlId}${binding.adapterId ? `:${binding.adapterId}` : ""}`;
}

export function exportDashboardPreset(model, resolveValue) {
	const dashboard = normalizeDashboard(model); const values = {};
	for (const page of dashboard.pages) for (const item of page.items) {
		if (item.kind !== "control") continue;
		const resolved = resolveValue?.(item.binding);
		if (resolved?.status === "ok") values[bindingKey(item.binding)] = { valueType: item.binding.valueType, value: resolved.value };
	}
	return { format: "aaalice-dashboard-preset", version: DASHBOARD_VERSION, dashboard, values };
}

export function preflightDashboardPreset(preset, resolveBinding) {
	if (preset?.format !== "aaalice-dashboard-preset" || preset?.version !== DASHBOARD_VERSION) throw new DashboardModelError("Unsupported dashboard preset", "unsupported-preset");
	const dashboard = normalizeDashboard(preset.dashboard); const bindings = [];
	for (const page of dashboard.pages) for (const item of page.items) {
		if (item.kind !== "control") continue;
		const resolved = resolveBinding(item.binding); const saved = preset.values?.[bindingKey(item.binding)];
		let status = resolved?.status || "missing";
		if (status === "ok" && saved && saved.valueType !== item.binding.valueType) status = "incompatible";
		bindings.push({ itemId: item.id, binding: item.binding, status, saved });
	}
	return { dashboard, bindings };
}
