/** Pure Dashboard V2 grid/group DOM composition. */

import { orderedItems, projectScope } from "./dashboard_layout.js";
import { projectedGroupRowSpan } from "./dashboard_sizing.js";
import { el, icon, iconButton, inlineRename } from "./ui.js";

function applyGridPosition(element, projected, source = projected) {
	element.style.setProperty("--aa-dashboard-row", String(projected.row + 1));
	element.style.setProperty("--aa-dashboard-column", String(projected.column + 1));
	element.style.setProperty("--aa-dashboard-column-span", String(projected.columnSpan));
	element.style.setProperty("--aa-dashboard-row-span", String(projected.rowSpan));
	element.dataset.dropRow = String(source.row); element.dataset.dropColumn = String(source.column); element.dataset.dropRowSpan = String(source.rowSpan);
	element.dataset.dropColumnSpan = String(source.columnSpan);
}

function sameSource(left, right) {
	return Boolean(left && right)
		&& left.provider === right.provider
		&& left.hostId === right.hostId
		&& (left.scopeId || null) === (right.scopeId || null);
}

export function createDashboardGroup({ group, members, columns = 12, editMode = false, selected = false, showHeader = true, labels = {}, renderItem, onMenu, onRename }) {
	const title = el("h3", null, group.name);
	if (onRename) {
		title.title = labels.renameHint || "Double-click to rename";
		title.addEventListener("dblclick", (event) => {
			event.preventDefault(); event.stopPropagation();
			inlineRename(title, { value: group.name, ariaLabel: labels.renameHint || "Rename group", onCommit: (name) => { if (name) onRename(group, name); else title.textContent = group.name; } });
		});
	}
	const header = el("header", { className: "aa-dashboard-group-header", attrs: { tabindex: editMode ? 0 : null }, children: [
		el("span", "aa-dashboard-group-marker"), title,
		...(editMode ? [icon("drag", { className: "aa-dashboard-group-grip" }), iconButton({ iconName: "settings", label: labels.groupMenu || "Group menu", variant: "ghost", onClick: (event) => onMenu?.(event, group) })] : []),
	] });
	const grid = el("div", { className: "aa-dashboard-group-grid", attrs: { "data-dashboard-columns": String(columns), "data-dashboard-source-columns": String(group.layout.columnSpan) } }); grid.style.setProperty("--aa-dashboard-columns", String(columns));
	const projection = projectScope(members, columns);
	for (const item of orderedItems(members)) {
		const card = renderItem(item); card.classList.add("is-group-member"); card.dataset.dashboardGroupMember = group.id;
		applyGridPosition(card, projection.get(item.id), item.layout); grid.append(card);
	}
	const root = el("section", { className: `aa-dashboard-group aa-dashboard-composite-card is-${group.tone}${selected ? " is-selected" : ""}`, attrs: { "data-dashboard-group-id": group.id, "data-drop-row": String(group.layout.row), "data-drop-column": "0", "aria-label": group.name }, children: [ ...(showHeader ? [header] : []), grid] });
	root.addEventListener("contextmenu", (event) => { if (!editMode || event.target.closest("[data-dashboard-item-id]")) return; event.preventDefault(); onMenu?.(event, group); });
	header.addEventListener("keydown", (event) => { if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return; event.preventDefault(); onMenu?.(event, group); });
	applyGridPosition(root, group.projectedLayout || group.layout, group.layout); return root;
}

export function createDashboardGrid({ page, columns = 12, editMode = false, selectedItemIds = new Set(), selectedGroupIds = new Set(), labels = {}, renderItem, onGroupMenu, onRenameGroup }) {
	const root = el("div", { className: `aa-dashboard-grid-v2${editMode ? " is-editing" : ""}`, attrs: { "data-dashboard-page-id": page.id, "data-dashboard-columns": String(columns), "data-dashboard-source-columns": String(page.gridColumns), tabindex: "0", "aria-label": `${page.name}. ${labels.pageMenu || "Page actions"}` } });
	root.style.setProperty("--aa-dashboard-columns", String(columns));
	const ungrouped = orderedItems(page.items.filter((item) => !item.groupId));
	const projectedGroups = page.groups.map((group) => ({
		...group,
		showHeader: editMode || !page.items.some((item) => item.kind === "separator" && item.layout.row <= group.layout.row && sameSource(item.source, group.source)),
		layout: {
			...group.layout,
			rowSpan: projectedGroupRowSpan(page.items.filter((item) => item.groupId === group.id), columns),
		},
	}));
	const topEntries = [...ungrouped, ...projectedGroups]; const projection = projectScope(topEntries, columns);
	for (const item of ungrouped) { const card = renderItem(item); card.classList.toggle("is-selected", selectedItemIds.has(item.id)); applyGridPosition(card, projection.get(item.id), item.layout); root.append(card); }
	for (const sourceGroup of orderedItems(projectedGroups)) {
		const group = { ...sourceGroup, projectedLayout: projection.get(sourceGroup.id) };
		root.append(createDashboardGroup({
		group, members: page.items.filter((item) => item.groupId === group.id), columns, editMode, selected: selectedGroupIds.has(group.id), labels, renderItem: (item) => {
			const card = renderItem(item); card.classList.toggle("is-selected", selectedItemIds.has(item.id)); return card;
		}, showHeader: group.showHeader, onMenu: onGroupMenu, onRename: onRenameGroup,
	})); }
	return root;
}
