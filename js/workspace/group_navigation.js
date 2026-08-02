import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { navigateToVisualGroup, visualGroups } from "../lib/group_navigation.js";
import { GROUP_STATE, classifyGroupNodes, normalizeColor } from "../lib/quick_group_manager_model.js";
import { addGroupNavigationEntry, emptyGroupNavigation, isEditableShortcutTarget, normalizeGroupNavigation, removeGroupNavigationEntry, setGroupNavigationOffset, setGroupNavigationShortcut, setGroupNavigationZoom, shortcutFromKeyboardEvent, shortcutLabel } from "../lib/group_navigation_model.js";
import { badge, button, createDialog, el, emptyState, field, icon, iconButton } from "../lib/ui.js";
import { createCollapsibleSearch, createListRow, createWorkspaceToolbar } from "../lib/workspace_components.js";

const GROUP_NAVIGATION_EXTRA_KEY = "aaaliceGroupNavigation";
let groupNavigationModelError = null;
let runtime = null;

export function configureGroupNavigation(dependencies) { runtime = dependencies; }

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function groupNavigation() {
	try {
		const value = normalizeGroupNavigation(app.graph?.extra?.[GROUP_NAVIGATION_EXTRA_KEY] ?? null);
		groupNavigationModelError = null;
		return value;
	} catch (error) {
		groupNavigationModelError = error;
		return emptyGroupNavigation();
	}
}

function updateGroupNavigation(callback, detail = null) {
	if (groupNavigationModelError) throw groupNavigationModelError;
	const graph = app.graph;
	graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[GROUP_NAVIGATION_EXTRA_KEY] = normalizeGroupNavigation(callback(groupNavigation()) || groupNavigation());
	} finally {
		graph?.afterChange?.();
		graph?.setDirtyCanvas?.(true, true);
		runtime.scheduleRender("groups");
	}
	if (detail) runtime.remindWorkflowSave(detail);
}

function groupNavigationStatus(group) {
	const status = classifyGroupNodes(group?.nodes);
	return { status, label: {
		[GROUP_STATE.ENABLED]: t("aaalice.workspace.groupNavigation.status.enabled", "Enabled"),
		[GROUP_STATE.DISABLED]: t("aaalice.workspace.groupNavigation.status.disabled", "Disabled"),
		[GROUP_STATE.MIXED]: t("aaalice.workspace.groupNavigation.status.mixed", "Mixed"),
		[GROUP_STATE.EMPTY]: t("aaalice.workspace.groupNavigation.status.empty", "Empty"),
	}[status] };
}

function navigateFromWorkspace(group, offset = null, zoom = 0.82) {
	if (!navigateToVisualGroup(app.canvas, group, { offset, zoom })) {
		app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.workspace.groupNavigation.title", "Group navigation"), detail: t("aaalice.workspace.groupNavigation.unavailable", "This group cannot be located on the current canvas.") });
		return;
	}
	const sidebar = app.extensionManager?.sidebarTab;
	if (!runtime.isSidebarPinned() && sidebar?.activeSidebarTabId === runtime.tabId) sidebar.toggleSidebarTab?.(runtime.tabId);
}

function openAddGroupNavigation() {
	const groups = visualGroups(app.graph);
	const existing = new Set(groupNavigation().entries.map((entry) => entry.groupId));
	const available = groups.filter((group) => !existing.has(String(group.id)));
	const selected = new Set();
	const list = el("div", { className: "aa-group-navigation-picker" });
	for (const group of available) {
		const groupId = String(group.id);
		list.append(createListRow({ title: String(group.title || t("aaalice.quickGroup.untitled", "Untitled group")), description: message("aaalice.workspace.groupNavigation.nodeCount", "{count} nodes", { count: Array.isArray(group.nodes) ? group.nodes.length : 0 }), selected: false, onSelect: (checked) => { if (checked) selected.add(groupId); else selected.delete(groupId); confirm.disabled = selected.size === 0; } }));
	}
	if (!available.length) list.append(emptyState({ iconName: "statusCheck", title: t("aaalice.workspace.groupNavigation.allAddedTitle", "All groups are already added"), description: t("aaalice.workspace.groupNavigation.allAdded", "Remove an existing navigation item before adding it again.") }));
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.groupNavigation.addTitle", "Add groups to navigation"), body: list, footer, size: "md", className: "aa-group-navigation-dialog" });
	const confirm = button({ label: t("aaalice.workspace.groupNavigation.addSelected", "Add selected"), disabled: true, onClick: () => {
		updateGroupNavigation((model) => {
			let next = model;
			for (const group of available) if (selected.has(String(group.id))) next = addGroupNavigationEntry(next, group);
			return next;
		}, t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
		dialog.close();
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirm);
}

function openGroupNavigationSettings(entry, groupName) {
	let candidate = entry.shortcut;
	const input = el("input", { className: "aa-group-navigation-shortcut-input", attrs: { type: "text", readonly: "", placeholder: t("aaalice.workspace.groupNavigation.shortcutPlaceholder", "Press a shortcut") } });
	const hint = el("small", "aa-group-navigation-shortcut-hint", t("aaalice.workspace.groupNavigation.shortcutHint", "Use Ctrl, Alt, or Command with another key. Backspace clears it."));
	const error = el("small", "aa-group-navigation-shortcut-error");
	const sync = () => {
		input.value = shortcutLabel(candidate);
		const conflict = candidate && groupNavigation().entries.find((other) => other.groupId !== entry.groupId && other.shortcut === candidate);
		error.textContent = conflict ? message("aaalice.workspace.groupNavigation.shortcutConflict", "Already used by {group}", { group: conflict.label || conflict.groupId }) : "";
		save.disabled = Boolean(conflict);
	};
	input.addEventListener("keydown", (event) => {
		if (event.key === "Escape") return;
		event.preventDefault(); event.stopPropagation();
		if (event.key === "Backspace" || event.key === "Delete") candidate = null;
		else {
			const shortcut = shortcutFromKeyboardEvent(event);
			if (!shortcut) return;
			candidate = shortcut;
		}
		sync();
	});
	const offsetX = el("input", { attrs: { type: "number", step: "50", value: entry.offset.x, "aria-label": t("aaalice.workspace.groupNavigation.offsetX", "Horizontal offset") } });
	const offsetY = el("input", { attrs: { type: "number", step: "50", value: entry.offset.y, "aria-label": t("aaalice.workspace.groupNavigation.offsetY", "Vertical offset") } });
	const zoom = el("input", { attrs: { type: "number", min: "10", max: "300", step: "5", value: Math.round(entry.zoom * 100), "aria-label": t("aaalice.workspace.groupNavigation.zoom", "Zoom") } });
	const offsetFields = el("div", { className: "aa-group-navigation-offset-fields", children: [
		field({ label: t("aaalice.workspace.groupNavigation.offsetX", "Horizontal offset"), control: offsetX }),
		field({ label: t("aaalice.workspace.groupNavigation.offsetY", "Vertical offset"), control: offsetY }),
		field({ label: t("aaalice.workspace.groupNavigation.zoom", "Zoom"), control: zoom }),
	] });
	const body = el("div", { className: "aa-group-navigation-shortcut-editor", children: [
		field({ label: message("aaalice.workspace.groupNavigation.shortcutFor", "Shortcut for {group}", { group: groupName }), control: input }), hint, error,
		el("div", { className: "aa-group-navigation-offset-section", children: [el("strong", null, t("aaalice.workspace.groupNavigation.viewTitle", "Target view")), el("small", null, t("aaalice.workspace.groupNavigation.viewHint", "Offsets use canvas units; zoom controls how much of the viewport the group occupies.")), offsetFields] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.groupNavigation.settings", "Navigation settings"), body, footer, confirmOnEnter: false });
	const save = button({ label: t("aaalice.common.save", "Save"), onClick: () => {
		updateGroupNavigation((model) => setGroupNavigationZoom(setGroupNavigationOffset(setGroupNavigationShortcut(model, entry.groupId, candidate), entry.groupId, { x: offsetX.value, y: offsetY.value }), entry.groupId, zoom.value === "" ? null : Number(zoom.value) / 100), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
		dialog.close();
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), save);
	sync(); input.focus();
}

export function renderGroupNavigation(container, host) {
	const viewState = runtime.viewState;
	const groups = visualGroups(app.graph);
	const groupsById = new Map(groups.map((group) => [String(group.id), group]));
	const navigation = groupNavigation();
	const entries = navigation.entries.map((entry) => ({ entry, group: groupsById.get(entry.groupId) || null }));
	const focusSearch = viewState.focusSearch && viewState.focusHost === host && runtime.isWorkspaceRootInteractive(host);
	if (focusSearch) { viewState.focusSearch = false; viewState.focusHost = null; }
	let applySearch = () => {};
	const search = createCollapsibleSearch({
		open: viewState.searchOpen, value: viewState.query, focus: focusSearch, disabled: entries.length === 0,
		label: t("aaalice.workspace.groupNavigation.search", "Search groups"), closeLabel: t("aaalice.workspace.search.close", "Close search"), placeholder: t("aaalice.workspace.groupNavigation.searchPlaceholder", "Search workflow groups"),
		onToggle: (open) => { viewState.searchOpen = open; viewState.focusSearch = open; viewState.focusHost = open ? host : null; runtime.scheduleRender(); },
		onInput: (value) => { viewState.query = value; applySearch(value); },
	});
	const count = badge(message("aaalice.workspace.groupNavigation.count", "{count} groups", { count: entries.length }), { className: "aa-group-navigation-count" });
	const add = iconButton({ iconName: "add", label: t("aaalice.workspace.groupNavigation.add", "Add groups"), variant: "ghost", className: "aa-group-navigation-add", onClick: openAddGroupNavigation });
	const toolbar = createWorkspaceToolbar(viewState.searchOpen ? [search.panel] : [el("div", { className: "aa-group-navigation-heading", children: [el("strong", null, t("aaalice.workspace.groupNavigation.title", "Group navigation")), count] }), search.toggle, add], { className: `aa-group-navigation-toolbar${viewState.searchOpen ? " is-searching" : ""}`, label: t("aaalice.workspace.groupNavigation.actions", "Group navigation actions") });
	const list = el("nav", { className: "aa-group-navigation-list", attrs: { "aria-label": t("aaalice.workspace.groupNavigation.groups", "Workflow groups") } });
	applySearch = (value = "") => {
		const query = String(value).trim().toLocaleLowerCase();
		const visible = entries.filter(({ entry, group }) => !query || String(group?.title || entry.label || entry.groupId).toLocaleLowerCase().includes(query));
		list.replaceChildren();
		for (const { entry, group } of visible) {
			const name = String(group?.title || entry.label || message("aaalice.workspace.groupNavigation.missingGroup", "Missing group #{id}", { id: entry.groupId }));
			const nodeCount = Array.isArray(group?.nodes) ? group.nodes.length : 0;
			const state = group ? groupNavigationStatus(group) : { status: "missing", label: t("aaalice.workspace.groupNavigation.status.missing", "Missing") };
			const color = normalizeColor(group?.color);
			const marker = el("span", { className: `aa-group-navigation-marker${color ? "" : " is-uncolored"}`, attrs: { ...(color ? { style: `--group-color:${color}` } : {}), "aria-hidden": "true" } });
			const offsetActive = entry.offset.x !== 0 || entry.offset.y !== 0;
			const offsetLabel = offsetActive ? message("aaalice.workspace.groupNavigation.offsetMeta", "offset {x}, {y}", { x: entry.offset.x, y: entry.offset.y }) : "";
			const zoomLabel = message("aaalice.workspace.groupNavigation.zoomMeta", "zoom {zoom}%", { zoom: Math.round(entry.zoom * 100) });
			const meta = `${message("aaalice.workspace.groupNavigation.meta", "{count} nodes · {status}", { count: nodeCount, status: state.label })}${offsetLabel ? ` · ${offsetLabel}` : ""} · ${zoomLabel}`;
			const target = el("button", { className: "aa-group-navigation-target", attrs: { type: "button", disabled: !group, "aria-label": message("aaalice.workspace.groupNavigation.navigate", "Go to {group}", { group: name }) }, children: [marker, el("span", { className: "aa-group-navigation-copy", children: [el("strong", null, name), el("small", null, meta)] }), el("span", { className: "aa-group-navigation-fit", attrs: { "aria-hidden": "true" }, children: [icon("fit")] })] });
			target.addEventListener("click", () => navigateFromWorkspace(group, entry.offset, entry.zoom));
			const shortcut = button({ label: entry.shortcut ? shortcutLabel(entry.shortcut) : t("aaalice.workspace.groupNavigation.settingsShort", "Set"), variant: "ghost", size: "sm", className: `aa-group-navigation-shortcut${entry.shortcut || offsetActive || entry.zoom !== 0.82 ? " is-set" : ""}`, onClick: () => openGroupNavigationSettings(entry, name) });
			const remove = iconButton({ iconName: "close", label: message("aaalice.workspace.groupNavigation.remove", "Remove {group} from navigation", { group: name }), variant: "ghost", className: "aa-group-navigation-remove", onClick: () => updateGroupNavigation((model) => removeGroupNavigationEntry(model, entry.groupId), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings.")) });
			list.append(el("div", { className: `aa-group-navigation-row is-${state.status}`, children: [target, el("div", { className: "aa-group-navigation-actions", children: [shortcut, remove] })] }));
		}
		if (!visible.length) list.append(emptyState({ iconName: "fit", className: "aa-workspace-empty aa-group-navigation-empty", title: entries.length ? t("aaalice.workspace.groupNavigation.noMatchesTitle", "No matching groups") : t("aaalice.workspace.groupNavigation.emptyTitle", "No navigation groups yet"), description: entries.length ? t("aaalice.workspace.groupNavigation.noMatches", "Try another group name.") : t("aaalice.workspace.groupNavigation.empty", "Add only the workflow groups you want to navigate to.") }));
	};
	applySearch(viewState.query);
	container.append(toolbar, list);
}

export function handleGroupNavigationShortcut(event) {
	if (event.defaultPrevented || event.repeat || isEditableShortcutTarget(event.target)) return;
	const shortcut = shortcutFromKeyboardEvent(event);
	if (!shortcut) return;
	const entry = groupNavigation().entries.find((candidate) => candidate.shortcut === shortcut);
	if (!entry) return;
	const group = visualGroups(app.graph).find((candidate) => String(candidate.id) === entry.groupId);
	if (!group) return;
	event.preventDefault(); event.stopPropagation();
	navigateFromWorkspace(group, entry.offset, entry.zoom);
}
