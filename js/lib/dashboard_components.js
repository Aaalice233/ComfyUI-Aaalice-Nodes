/** Pure Dashboard V2 grid/group DOM composition. */

import { orderedItems, projectScope } from "./dashboard_layout.js";
import { el, iconButton } from "./ui.js";

function applyGridPosition(element, projected, source = projected) {
	element.style.setProperty("--aa-dashboard-row", String(projected.row + 1));
	element.style.setProperty("--aa-dashboard-column", String(projected.column + 1));
	element.style.setProperty("--aa-dashboard-column-span", String(projected.columnSpan));
	element.style.setProperty("--aa-dashboard-row-span", String(projected.rowSpan));
	element.dataset.dropRow = String(source.row); element.dataset.dropColumn = String(source.column); element.dataset.dropRowSpan = String(source.rowSpan);
}

export function createDashboardGroup({ group, members, columns = 2, editMode = false, selected = false, labels = {}, renderItem, onMenu }) {
	const header = el("header", { className: "aa-dashboard-group-header", attrs: { tabindex: editMode ? 0 : null }, children: [
		el("span", "aa-dashboard-group-marker"), el("h3", null, group.name),
		...(editMode ? [iconButton({ iconName: "settings", label: labels.groupMenu || "Group menu", variant: "ghost", onClick: (event) => onMenu?.(event, group) })] : []),
	] });
	const grid = el("div", { className: "aa-dashboard-group-grid", attrs: { "data-dashboard-columns": String(columns) } }); grid.style.setProperty("--aa-dashboard-columns", String(columns));
	const projection = projectScope(members, columns);
	for (const item of orderedItems(members)) { const card = renderItem(item); applyGridPosition(card, projection.get(item.id), item.layout); grid.append(card); }
	const root = el("section", { className: `aa-dashboard-group is-${group.tone}${selected ? " is-selected" : ""}`, attrs: { "data-dashboard-group-id": group.id, "data-drop-row": String(group.layout.row), "data-drop-column": "0" }, children: [header, grid] });
	root.addEventListener("contextmenu", (event) => { if (!editMode || event.target.closest("[data-dashboard-item-id]")) return; event.preventDefault(); onMenu?.(event, group); });
	header.addEventListener("keydown", (event) => { if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return; event.preventDefault(); onMenu?.(event, group); });
	applyGridPosition(root, group.projectedLayout || group.layout, group.layout); return root;
}

export function createDashboardGrid({ page, columns = 2, editMode = false, selectedItemIds = new Set(), selectedGroupIds = new Set(), labels = {}, renderItem, onGroupMenu }) {
	const root = el("div", { className: `aa-dashboard-grid-v2${editMode ? " is-editing" : ""}`, attrs: { "data-dashboard-page-id": page.id, "data-dashboard-columns": String(columns) } });
	root.style.setProperty("--aa-dashboard-columns", String(columns));
	const ungrouped = orderedItems(page.items.filter((item) => !item.groupId));
	const topEntries = [...ungrouped, ...page.groups]; const projection = projectScope(topEntries, columns);
	for (const item of ungrouped) { const card = renderItem(item); card.classList.toggle("is-selected", selectedItemIds.has(item.id)); applyGridPosition(card, projection.get(item.id), item.layout); root.append(card); }
	for (const sourceGroup of orderedItems(page.groups)) {
		const group = { ...sourceGroup, projectedLayout: projection.get(sourceGroup.id) };
		root.append(createDashboardGroup({
		group, members: page.items.filter((item) => item.groupId === group.id), columns, editMode, selected: selectedGroupIds.has(group.id), labels, renderItem: (item) => {
			const card = renderItem(item); card.classList.toggle("is-selected", selectedItemIds.has(item.id)); return card;
		}, onMenu: onGroupMenu,
	})); }
	return root;
}
