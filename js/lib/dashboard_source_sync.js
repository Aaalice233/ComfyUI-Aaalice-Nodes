/** Pure source-group snapshot, inspection, and synchronization planning. */

import { normalizeDashboard, normalizeGroupSource, stableId } from "./dashboard_model.js";
import { orderedItems, refreshGroupRowSpans } from "./dashboard_layout.js";
import { DASHBOARD_GRID_COLUMNS, normalizeDashboardColumnSpan, normalizeDashboardRowSpan } from "./dashboard_sizing.js";

export const SOURCE_SYNC_STATUS = Object.freeze({
	SYNCED: "synced",
	NEEDS_SYNC: "needs-sync",
	MISSING_SOURCE: "missing-source",
	ERROR: "error",
});

function sourceKey(source) {
	return `${source?.provider || ""}\u0000${source?.hostId || ""}\u0000${source?.scopeId || ""}`;
}

function sameSource(left, right) {
	return sourceKey(left) === sourceKey(right);
}

function sourceControlKey(binding) {
	return `${binding?.provider || ""}\u0000${binding?.hostId || ""}\u0000${binding?.controlId || ""}\u0000${binding?.adapterId || ""}`;
}

function invalidSnapshot(source, reason) {
	return { status: SOURCE_SYNC_STATUS.ERROR, source, controls: [], reason };
}

/**
 * Normalize the provider's ordered source descriptors without knowing the
 * provider's private node shape.
 */
export function buildSourceSnapshot(controls, source, { status = "ok", label = "", reason = "" } = {}) {
	let normalizedSource;
	try { normalizedSource = normalizeGroupSource(source); }
	catch (error) { return invalidSnapshot(source, error.message); }
	if (!normalizedSource) return invalidSnapshot(source, "Source identity is missing");
	if (status !== "ok") {
		const sourceStatus = status === "missing" ? SOURCE_SYNC_STATUS.MISSING_SOURCE : Object.values(SOURCE_SYNC_STATUS).includes(status) ? status : SOURCE_SYNC_STATUS.ERROR;
		return { status: sourceStatus, source: normalizedSource, controls: [], label, reason };
	}
	if (!Array.isArray(controls)) return invalidSnapshot(normalizedSource, "Source controls are not an array");

	const seen = new Set(); const snapshot = [];
	for (const control of controls) {
		if (!control?.binding || !sameSource(control.sourceGroup?.source, normalizedSource)) continue;
		const key = sourceControlKey(control.binding);
		if (!control.binding.controlId || !control.binding.provider || !control.binding.hostId || typeof control.binding.valueType !== "string" || !control.binding.valueType) return invalidSnapshot(normalizedSource, "Source control binding is incomplete");
		if (control.binding.provider !== normalizedSource.provider || control.binding.hostId !== normalizedSource.hostId) return invalidSnapshot(normalizedSource, `Source control binding does not match its source: ${key}`);
		if (seen.has(key)) return invalidSnapshot(normalizedSource, `Duplicate source control binding: ${key}`);
		seen.add(key);
		if (typeof control.label !== "string") return invalidSnapshot(normalizedSource, `Source control label is invalid: ${key}`);
		const rawRowSpan = Math.round(Number(control.rowSpan ?? 1)); const rawColumnSpan = Math.round(Number(control.columnSpan ?? 1));
		if (!Number.isFinite(rawRowSpan) || rawRowSpan < 1 || !Number.isFinite(rawColumnSpan) || rawColumnSpan < 1 || rawColumnSpan > DASHBOARD_GRID_COLUMNS) return invalidSnapshot(normalizedSource, `Source control footprint is invalid: ${key}`);
		const rowSpan = normalizeDashboardRowSpan(rawRowSpan); const columnSpan = normalizeDashboardColumnSpan(rawColumnSpan);
		snapshot.push({
			key,
			binding: { ...control.binding },
			label: control.label,
			rowSpan,
			columnSpan,
		});
	}
	const descriptorGroup = controls.find((control) => control?.sourceGroup?.source && sameSource(control.sourceGroup.source, normalizedSource))?.sourceGroup;
	return { status: SOURCE_SYNC_STATUS.SYNCED, source: normalizedSource, controls: snapshot, label: String(label || descriptorGroup?.name || ""), reason: "" };
}

function managedItems(group, members, snapshot) {
	const current = new Set(snapshot.controls.map((control) => control.key));
	const explicit = members.filter((item) => item.groupSource && sameSource(item.groupSource, group.source));
	const explicitIds = new Set(explicit.map((item) => item.id));
	const legacy = members.filter((item) => !item.groupSource && current.has(sourceControlKey(item.binding)) && !explicitIds.has(item.id));
	return [...explicit, ...legacy];
}

function compareOrder(items, snapshot) {
	const actual = orderedItems(items).map((item) => sourceControlKey(item.binding));
	const expected = snapshot.controls.map((control) => control.key).filter((key) => actual.includes(key));
	return actual.length !== expected.length || actual.some((key, index) => key !== expected[index]);
}

function diffSourceGroup(group, members, snapshot) {
	if (snapshot.status !== SOURCE_SYNC_STATUS.SYNCED) return { status: snapshot.status, added: 0, removed: 0, renamed: 0, reordered: 0, updated: 0, preservedManual: members.filter((item) => !item.groupSource).length, reason: snapshot.reason };
	const byKey = new Map(snapshot.controls.map((control) => [control.key, control]));
	const managed = managedItems(group, members, snapshot);
	const managedKeys = new Set(managed.map((item) => sourceControlKey(item.binding)));
	if (managedKeys.size !== managed.length) return { status: SOURCE_SYNC_STATUS.ERROR, added: 0, removed: 0, renamed: 0, reordered: 0, updated: 0, preservedManual: members.length - managed.length, reason: "Source group contains duplicate managed bindings" };
	const added = snapshot.controls.filter((control) => !managedKeys.has(control.key)).length;
	const removed = members.filter((item) => item.groupSource && sameSource(item.groupSource, group.source) && !byKey.has(sourceControlKey(item.binding))).length;
	let renamed = 0; let updated = 0;
	for (const item of managed) {
		const source = byKey.get(sourceControlKey(item.binding));
		if (!source) continue;
		const legacyLabel = !item.groupSource && item.labelSource == null && item.label && item.label !== source.label;
		if (item.labelOverride == null && !legacyLabel && (item.labelSource !== source.label || item.label !== source.label)) renamed++;
		if (item.binding.valueType !== source.binding.valueType || item.binding.adapterId !== source.binding.adapterId) updated++;
	}
	const groupName = snapshot.label;
	const legacyGroupName = !group.nameSource && group.name && group.name !== groupName;
	const groupRenamed = group.nameOverride == null && groupName && !legacyGroupName && (group.nameSource !== groupName || group.name !== groupName);
	return {
		status: added || removed || renamed || updated || groupRenamed || compareOrder(managed, snapshot) ? SOURCE_SYNC_STATUS.NEEDS_SYNC : SOURCE_SYNC_STATUS.SYNCED,
		added, removed, renamed: renamed + (groupRenamed ? 1 : 0), reordered: compareOrder(managed, snapshot) ? 1 : 0, updated,
		preservedManual: members.length - managed.length,
		reason: "",
	};
}

export function inspectSourceGroup(group, members, snapshot) {
	if (!group?.source) return { status: SOURCE_SYNC_STATUS.ERROR, added: 0, removed: 0, renamed: 0, reordered: 0, updated: 0, preservedManual: members?.length || 0, reason: "Group source is missing" };
	return diffSourceGroup(group, members || [], snapshot);
}

function setManagedSource(item, source) {
	if (source) item.groupSource = { ...source };
	else delete item.groupSource;
}

function createItemFromControl(control, layout, source) {
	return {
		id: stableId("item"),
		kind: "control", binding: { ...control.binding }, label: control.label, labelSource: control.label, labelOverride: null,
		groupId: null, groupSource: { ...source }, layout: { ...layout },
	};
}

function packManagedItems(page, group, managed, snapshot) {
	const fixed = page.items.filter((item) => item.groupId === group.id && !managed.some((candidate) => candidate.id === item.id));
	const used = new Set();
	const cells = (layout) => { const result = []; for (let row = layout.row; row < layout.row + layout.rowSpan; row++) for (let column = layout.column; column < layout.column + layout.columnSpan; column++) result.push(`${row}:${column}`); return result; };
	for (const item of fixed) for (const cell of cells(item.layout)) used.add(cell);
	const groupColumns = Math.max(group.layout.columnSpan, ...managed.map((item) => item.layout.columnSpan), 1);
	for (const source of snapshot.controls) {
		const item = managed.find((candidate) => sourceControlKey(candidate.binding) === source.key);
		if (!item) continue;
		let found = null;
		for (let row = 0; !found; row++) for (let column = 0; column <= groupColumns - item.layout.columnSpan; column++) {
			const candidate = { row, column, columnSpan: item.layout.columnSpan, rowSpan: item.layout.rowSpan };
			if (cells(candidate).every((cell) => !used.has(cell))) { found = candidate; break; }
		}
		if (!found) throw new Error("Source group members cannot be laid out without overlap");
		item.layout = found;
		for (const cell of cells(item.layout)) used.add(cell);
	}
}

/**
 * Apply one source snapshot to a normalized Dashboard model. The returned
 * model is either a complete normalized result or the original model is not
 * mutated by this function.
 */
export function planSourceGroupSync(model, pageId, groupId, snapshot) {
	if (snapshot.status !== SOURCE_SYNC_STATUS.SYNCED) throw new Error(snapshot.reason || "Source cannot be synchronized");
	const next = structuredClone(model);
	const page = next.pages.find((entry) => entry.id === pageId);
	const group = page?.groups.find((entry) => entry.id === groupId);
	if (!page || !group) throw new Error("Dashboard source group is missing");
	if (!group.source || !sameSource(group.source, snapshot.source)) throw new Error("Dashboard source group does not match the source snapshot");
	const members = page.items.filter((item) => item.groupId === group.id && item.kind === "control");
	const sourceByKey = new Map(snapshot.controls.map((control) => [control.key, control]));
	const managed = managedItems(group, members, snapshot);
	const managedKeys = new Set(managed.map((item) => sourceControlKey(item.binding)));
	if (managedKeys.size !== managed.length) throw new Error("Source group contains duplicate managed bindings");
	const managedByKey = new Map(managed.map((item) => [sourceControlKey(item.binding), item]));
	const beforeByKey = new Map(managedByKey);
	const beforeOrder = orderedItems(managed).map((item) => sourceControlKey(item.binding));
	const renamedCount = snapshot.controls.reduce((count, control) => {
		const item = beforeByKey.get(control.key);
		const legacyLabel = item && !item.groupSource && item.labelSource == null && item.label && item.label !== control.label;
		return count + (item && item.labelOverride == null && !legacyLabel && (item.labelSource !== control.label || item.label !== control.label) ? 1 : 0);
	}, 0);
	const updatedCount = snapshot.controls.reduce((count, control) => {
		const item = beforeByKey.get(control.key);
		return count + (item && (item.binding.valueType !== control.binding.valueType || item.binding.adapterId !== control.binding.adapterId) ? 1 : 0);
	}, 0);
	const addedCount = snapshot.controls.filter((control) => !beforeByKey.has(control.key)).length;
	const removedIds = new Set();
	for (const item of managed) if (item.groupSource && !sourceByKey.has(sourceControlKey(item.binding))) removedIds.add(item.id);
	page.items = page.items.filter((item) => !removedIds.has(item.id));
	const activeManaged = managed.filter((item) => !removedIds.has(item.id));
	for (const source of snapshot.controls) {
		let item = managedByKey.get(source.key);
		if (!item) {
			item = createItemFromControl(source, { row: 0, column: 0, columnSpan: source.columnSpan, rowSpan: source.rowSpan }, snapshot.source);
			item.groupId = group.id; page.items.push(item); activeManaged.push(item); managedByKey.set(source.key, item);
		}
		item.binding = { ...source.binding };
		const legacyLabel = !item.groupSource && item.labelSource == null && item.label && item.label !== source.label;
		setManagedSource(item, snapshot.source);
		if (item.labelOverride == null && legacyLabel) item.labelOverride = item.label;
		if (item.labelOverride == null) { item.labelSource = source.label; item.label = source.label; }
		item.layout.columnSpan = Math.max(1, Math.min(page.gridColumns, item.layout.columnSpan || source.columnSpan));
		item.layout.rowSpan = Math.max(1, item.layout.rowSpan || source.rowSpan);
	}
	const groupName = snapshot.label;
	const legacyGroupName = !group.nameSource && group.name && group.name !== groupName;
	const groupRenamed = Boolean(groupName && group.nameOverride == null && !legacyGroupName && (group.nameSource !== groupName || group.name !== groupName));
	if (groupName && group.nameOverride == null && legacyGroupName) group.nameOverride = group.name;
	if (groupName && group.nameOverride == null) { group.nameSource = groupName; group.name = groupName; }
	packManagedItems(page, group, activeManaged, snapshot);
	if (!page.items.some((item) => item.groupId === group.id)) page.groups = page.groups.filter((entry) => entry.id !== group.id);
	refreshGroupRowSpans(page);
	const expectedBeforeOrder = snapshot.controls.map((control) => control.key).filter((key) => beforeOrder.includes(key));
	return { next: normalizeDashboard(next), summary: {
		added: addedCount,
		removed: removedIds.size,
		renamed: renamedCount + (groupRenamed ? 1 : 0),
		reordered: beforeOrder.join("\u0000") !== expectedBeforeOrder.join("\u0000") ? 1 : 0,
		updated: updatedCount,
		preservedManual: members.length - managed.length,
	} };
}
