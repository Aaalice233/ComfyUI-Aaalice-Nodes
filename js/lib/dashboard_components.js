/** Pure Dashboard V3 grid/group DOM composition. */

import { groupMemberColumnSpan, orderedItems, projectGroupScope, projectScope } from "./dashboard_layout.js";
import { groupToneClass, groupToneCssValue, isCustomGroupTone, normalizeGroupTone } from "./dashboard_group_tones.js";
import { el, icon, iconButton, inlineRename } from "./ui.js";

function applyGridPosition(element, projected, source = projected) {
	element.style.setProperty("--aa-dashboard-row", String(projected.row + 1));
	element.style.setProperty("--aa-dashboard-column", String(projected.column + 1));
	element.style.setProperty("--aa-dashboard-column-span", String(projected.columnSpan));
	element.style.setProperty("--aa-dashboard-row-span", String(projected.rowSpan));
	element.dataset.dropRow = String(source.row); element.dataset.dropColumn = String(source.column); element.dataset.dropRowSpan = String(source.rowSpan); element.dataset.dropColumnSpan = String(source.columnSpan);
	element.dataset.projectedRow = String(projected.row); element.dataset.projectedColumn = String(projected.column); element.dataset.projectedRowSpan = String(projected.rowSpan); element.dataset.projectedColumnSpan = String(projected.columnSpan);
}

function markProjectedAxes(element, projection) {
	if (Number.isFinite(Number(projection?.rowSpan))) element.dataset.dashboardAutoRowSpan = "true";
	if (Number.isFinite(Number(projection?.columnSpan))) element.dataset.dashboardAutoColumnSpan = "true";
}

export function createDashboardGroup({ group, members, memberProjection = null, sizeProjections = null, columns = 12, editMode = false, selected = false, showHeader = true, showTitle = true, labels = {}, renderItem, onMenu, onRename, onSync }) {
	const title = el("h3", null, group.name);
	if (!showTitle) title.classList.add("is-title-hidden");
	if (onRename) {
		title.title = labels.renameHint || "Double-click to rename";
		title.addEventListener("dblclick", (event) => {
			event.preventDefault(); event.stopPropagation();
			inlineRename(title, { value: group.name, ariaLabel: labels.renameHint || "Rename group", onCommit: (name) => { if (name) onRename(group, name); else title.textContent = group.name; } });
		});
	}
	const syncStatus = group.syncStatus;
	const syncLabels = labels.groupSync || {};
	const syncLabelKey = { synced: "synced", "needs-sync": "needsSync", syncing: "syncing", "missing-source": "missingSource", error: "error" }[syncStatus] || syncStatus;
	const syncIcon = { synced: "statusCheck", "needs-sync": "refresh", syncing: "refresh", "missing-source": "statusWarning", error: "statusError" }[syncStatus];
	const syncLabel = syncLabels[syncLabelKey] || syncStatus;
	const syncHint = group.syncReason ? `${syncLabel}: ${group.syncReason}` : syncLabel;
	const syncButton = syncIcon && group.source ? iconButton({
		iconName: syncIcon,
		label: syncHint,
		variant: "ghost",
		disabled: ["syncing", "missing-source", "error"].includes(syncStatus),
		className: `aa-dashboard-group-sync is-${syncStatus}`,
		onClick: (event) => { event.stopPropagation(); onSync?.(group); },
	}) : null;
	const header = el("header", { className: `aa-dashboard-group-header${showTitle ? "" : " is-title-hidden"}`, attrs: { tabindex: editMode ? 0 : null }, children: [
		title, el("span", { className: "aa-dashboard-group-header-spacer", attrs: { "aria-hidden": "true" } }),
		...(syncButton ? [syncButton] : []),
		...(editMode ? [icon("drag", { className: "aa-dashboard-group-grip" }), iconButton({ iconName: "settings", label: labels.groupMenu || "Group menu", variant: "ghost", onClick: (event) => onMenu?.(event, group) })] : []),
	] });
	const groupColumns = columns === 1 ? 1 : Math.max(1, Number(group.layout.columnSpan) || columns);
	const grid = el("div", { className: "aa-dashboard-group-grid", attrs: { "data-dashboard-columns": String(groupColumns), "data-dashboard-source-columns": String(group.layout.columnSpan) } }); grid.style.setProperty("--aa-dashboard-columns", String(groupColumns));
	const projection = memberProjection || projectGroupScope(members, groupColumns, showHeader, sizeProjections).projection;
	for (const item of orderedItems(members)) {
		const card = renderItem(item); card.classList.add("is-group-member"); card.dataset.dashboardGroupMember = group.id;
		const projected = projection.get(item.id); applyGridPosition(card, projected, item.layout); markProjectedAxes(card, sizeProjections?.get?.(item.id)); grid.append(card);
	}
	const normalizedTone = normalizeGroupTone(group.tone);
	const root = el("section", { className: `aa-dashboard-group aa-dashboard-composite-card is-${groupToneClass(normalizedTone)}${selected ? " is-selected" : ""}`, attrs: {
		"data-dashboard-group-id": group.id, "data-dashboard-group-tone": normalizedTone, "data-drop-row": String(group.layout.row), "data-drop-column": String(group.layout.column),
		"data-dashboard-min-column-span": String(groupMemberColumnSpan(members)), "data-dashboard-group-sync-status": syncStatus || null, "aria-label": group.name,
	}, children: [
		...(showHeader ? [header] : []), grid,
		...(editMode ? [el("button", { className: "aa-dashboard-resize-handle aa-dashboard-group-resize-handle", attrs: {
			type: "button", "data-dashboard-resize-handle": "true", "data-dashboard-group-resize-handle": "true", "aria-label": labels.resizeGroup || "Resize layout group",
		} })] : []),
	] });
	if (isCustomGroupTone(normalizedTone)) root.style.setProperty("--aa-dashboard-group-tone", groupToneCssValue(normalizedTone));
	root.addEventListener("contextmenu", (event) => { if (!editMode || event.target.closest("[data-dashboard-item-id]")) return; event.preventDefault(); onMenu?.(event, group); });
	header.addEventListener("keydown", (event) => { if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return; event.preventDefault(); onMenu?.(event, group); });
	const projectedLayout = group.projectedLayout || group.layout;
	applyGridPosition(root, projectedLayout, group.layout); return root;
}

export function createDashboardGrid({ page, sizeProjections = null, columns = 12, editMode = false, selectedItemIds = new Set(), selectedGroupIds = new Set(), labels = {}, renderItem, onGroupMenu, onRenameGroup, onSyncGroup }) {
	const root = el("div", { className: `aa-dashboard-grid-v2${editMode ? " is-editing" : ""}`, attrs: { "data-dashboard-page-id": page.id, "data-dashboard-columns": String(columns), "data-dashboard-source-columns": String(page.gridColumns), tabindex: "0", "aria-label": `${page.name}. ${labels.pageMenu || "Page actions"}` } });
	root.style.setProperty("--aa-dashboard-columns", String(columns));
	const ungrouped = orderedItems(page.items.filter((item) => !item.groupId));
	const projectedGroups = page.groups.map((group) => {
		const showHeader = editMode || group.showTitle !== false || Boolean(group.source && group.syncStatus);
		const members = page.items.filter((item) => item.groupId === group.id);
		const groupColumns = columns === 1 ? 1 : Math.max(1, Number(group.layout.columnSpan) || columns);
		const projectedMembers = projectGroupScope(members, groupColumns, showHeader, sizeProjections);
		return { ...group, showHeader, memberProjection: projectedMembers.projection, projectedRowSpan: projectedMembers.rowSpan };
	});
	const topSizeProjections = new Map();
	for (const item of ungrouped) if (sizeProjections?.has?.(item.id)) topSizeProjections.set(item.id, sizeProjections.get(item.id));
	for (const group of projectedGroups) topSizeProjections.set(group.id, { rowSpan: group.projectedRowSpan });
	const topEntries = [...ungrouped, ...page.groups]; const projection = projectScope(topEntries, columns, topSizeProjections);
	for (const item of ungrouped) {
		const card = renderItem(item); card.classList.toggle("is-selected", selectedItemIds.has(item.id));
		const projected = projection.get(item.id); applyGridPosition(card, projected, item.layout); markProjectedAxes(card, sizeProjections?.get?.(item.id)); root.append(card);
	}
	for (const sourceGroup of orderedItems(projectedGroups)) {
		const group = { ...sourceGroup, projectedLayout: projection.get(sourceGroup.id) };
		root.append(createDashboardGroup({
			group, members: page.items.filter((item) => item.groupId === group.id), memberProjection: group.memberProjection, sizeProjections, columns, editMode, selected: selectedGroupIds.has(group.id), labels, renderItem: (item) => {
				const card = renderItem(item); card.classList.toggle("is-selected", selectedItemIds.has(item.id)); return card;
			}, showHeader: group.showHeader, showTitle: group.showTitle !== false, onMenu: onGroupMenu, onRename: onRenameGroup, onSync: onSyncGroup,
		}));
	}
	return root;
}
