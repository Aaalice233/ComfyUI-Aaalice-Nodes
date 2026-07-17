/** Reusable composite components for Aaalice sidebar workspaces. */

import { button, el, icon, iconButton, segmentedControl } from "./ui.js";

export function createWorkspaceShell({ title, tabs, activeTab, onTabChange }) {
	const root = el("div", "aa-workspace");
	root.dataset.workspace = activeTab;
	const header = el("header", "aa-workspace-header");
	const tablist = segmentedControl({
		value: activeTab,
		options: tabs,
		ariaLabel: title,
		className: "aa-workspace-tabs",
		onChange: (value) => { root.dataset.workspace = value; onTabChange?.(value); },
	});
	const content = el("main", "aa-workspace-content");
	const setActive = (value) => { root.dataset.workspace = value; tablist.setValue(value); };
	header.append(tablist); root.append(header, content);
	return { root, header, content, setActive };
}

export function createWorkspaceToolbar(actions = [], { className = "", label = null } = {}) {
	return el("div", { className: `aa-workspace-toolbar${className ? ` ${className}` : ""}`, attrs: { role: "toolbar", "aria-label": label }, children: actions });
}

export function createCollapsibleSearch({ open = false, value = "", label, closeLabel = label, placeholder, disabled = false, focus = false, onToggle, onInput }) {
	const toggle = iconButton({ iconName: "search", label: value ? `${label}: ${value}` : label, active: open || Boolean(value), variant: "ghost", disabled, onClick: () => onToggle?.(!open) });
	toggle.setAttribute("aria-expanded", String(open));
	if (!open) return { toggle, panel: null, input: null };
	const input = document.createElement("input"); input.type = "search"; input.value = value; input.placeholder = placeholder; input.setAttribute("aria-label", label);
	input.addEventListener("input", () => onInput?.(input.value));
	input.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); onToggle?.(false); } });
	const panel = el("div", { className: "aa-workspace-search", children: [
		icon("search"), input,
		iconButton({ iconName: "close", label: closeLabel, variant: "ghost", onClick: () => onToggle?.(false) }),
	] });
	if (focus) queueMicrotask(() => { if (input.isConnected) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); } });
	return { toggle, panel, input };
}

export function createPageTabs({ pages, activeId, editMode, labels = {}, onSelect, onAdd, onRename, onDelete, onDuplicate, onReorder }) {
	const root = el("nav", { className: `aa-dashboard-pages${pages.length ? "" : " is-empty"}`, attrs: { "aria-label": labels.pages || "Dashboard pages" } });
	for (const page of pages) {
		const tab = button({ label: page.name, variant: "ghost", size: "sm", active: page.id === activeId, onClick: () => onSelect?.(page.id) });
		tab.dataset.pageId = page.id; root.append(tab);
		if (editMode) {
			tab.draggable = true;
			tab.addEventListener("dragstart", (event) => event.dataTransfer?.setData("application/x-aaalice-page", page.id));
			tab.addEventListener("dragover", (event) => event.preventDefault());
			tab.addEventListener("drop", (event) => { event.preventDefault(); const source = event.dataTransfer?.getData("application/x-aaalice-page"); if (source) onReorder?.(source, page.id); });
		}
		if (editMode && page.id === activeId) {
			root.append(iconButton({ iconName: "copy", label: labels.duplicatePage || "Duplicate page", variant: "ghost", onClick: () => onDuplicate?.(page) }));
			root.append(iconButton({ iconName: "settings", label: labels.renamePage || "Rename page", variant: "ghost", onClick: () => onRename?.(page) }));
			root.append(iconButton({ iconName: "delete", label: labels.deletePage || "Delete page", variant: "ghost", onClick: () => onDelete?.(page) }));
		}
	}
	root.append(iconButton({ iconName: "add", label: labels.addPage || "Add page", variant: "ghost", onClick: onAdd }));
	return root;
}

export function createSectionCard({ section, editMode, labels = {}, onRename, onDelete, onToggle, onDropSection, children = [] }) {
	const root = el("section", { className: "aa-dashboard-section", attrs: { "data-section-id": section.id } });
	const header = el("header", "aa-dashboard-section-header");
	const toggle = iconButton({ iconName: "moveDown", label: labels.toggleSection || `Toggle ${section.title}`, variant: "ghost", className: `aa-section-toggle${section.collapsed ? " is-collapsed" : ""}`, onClick: onToggle });
	header.append(toggle, el("h3", null, section.title), el("span", "aa-dashboard-section-count", String(children.length)));
	if (editMode) header.append(
		iconButton({ iconName: "settings", label: labels.renameSection || "Rename section", variant: "ghost", onClick: onRename }),
		iconButton({ iconName: "delete", label: labels.deleteSection || "Delete section", variant: "ghost", onClick: onDelete }),
	);
	const grid = el("div", { className: "aa-dashboard-grid", children }); grid.hidden = section.collapsed;
	if (editMode) {
		root.draggable = true;
		root.addEventListener("dragstart", (event) => { if (event.target !== root) return; event.dataTransfer?.setData("application/x-aaalice-section", section.id); });
		root.addEventListener("dragover", (event) => event.preventDefault());
		root.addEventListener("drop", (event) => { const source = event.dataTransfer?.getData("application/x-aaalice-section"); if (source) onDropSection?.(source, section.id); });
	}
	root.append(header, grid); return root;
}

export function createControlCard({ item, title, control, status = "ok", editMode, labels = {}, onManage, onMove, onRemove, onToggleSpan, onToggleCompact, draggable = false }) {
	const root = el("article", { className: `aa-control-card span-${item.span}${item.compact ? " is-compact" : ""}${status !== "ok" ? " is-missing" : ""}`, attrs: { "data-item-id": item.id, "data-provider": item.binding?.provider || "layout", draggable } });
	const header = el("header", "aa-control-card-header");
	header.append(el("span", "aa-control-card-indicator"), el("span", "aa-control-card-title", title));
	if (editMode) header.append(
		iconButton({ iconName: "settings", label: labels.moveControl || "Move control", variant: "ghost", onClick: onMove }),
		iconButton({ iconName: "copy", label: labels.toggleWidth || "Toggle card width", variant: "ghost", onClick: onToggleSpan }),
		iconButton({ iconName: "moveDown", label: labels.toggleCompact || "Toggle compact mode", variant: "ghost", onClick: onToggleCompact }),
		iconButton({ iconName: "delete", label: labels.removeControl || "Remove control", variant: "ghost", onClick: onRemove }),
	);
	else header.append(iconButton({ iconName: "settings", label: labels.controlMenu || "Control card menu", variant: "ghost", onClick: onManage }));
	root.append(header, control || el("p", "aa-control-card-error", status === "incompatible" ? (labels.incompatible || "Incompatible control") : (labels.missing || "Missing binding")));
	return root;
}

export function createListRow({ title, description = "", selected = false, onSelect, actions = [] }) {
	const root = el("div", `aa-workspace-list-row${selected ? " is-selected" : ""}`);
	const copy = el("div", "aa-workspace-list-row-copy"); copy.append(el("strong", null, title));
	if (description) copy.append(el("small", null, description));
	if (onSelect) {
		const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = selected;
		checkbox.setAttribute("aria-label", title); checkbox.addEventListener("change", () => onSelect(checkbox.checked));
		root.append(checkbox);
	} else root.classList.add("is-static");
	root.append(copy, ...actions); return root;
}
