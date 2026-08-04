import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { navigateToVisualGroup, visualGroups } from "../lib/group_navigation.js";
import { GROUP_STATE, classifyGroupNodes, normalizeColor } from "../lib/quick_group_manager_model.js";
import { addGroupNavigationEntry, DEFAULT_WHEEL_SHORTCUT, emptyGroupNavigation, isEditableShortcutTarget, moveGroupNavigationEntry, normalizeGroupNavigation, removeGroupNavigationEntry, setGroupNavigationOffset, setGroupNavigationWheelShortcut, setGroupNavigationZoom, wheelShortcutFromKeyboardEvent, wheelShortcutLabel } from "../lib/group_navigation_model.js";
import { badge, button, createDialog, el, emptyState, field, icon, iconButton } from "../lib/ui.js";
import { dispatchGroupNavigationWheelKeydown, dispatchGroupNavigationWheelKeyup, groupNavigationWheelCenter, openGroupNavigationWheel } from "./group_navigation_wheel.js";
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
	const current = groupNavigation();
	const next = normalizeGroupNavigation(callback(current) || current);
	const graph = app.graph;
	graph?.beforeChange?.();
	try {
		graph.extra ||= {};
		graph.extra[GROUP_NAVIGATION_EXTRA_KEY] = next;
	} finally {
		graph?.afterChange?.();
		graph?.setDirtyCanvas?.(true, true);
		runtime.scheduleStructuralRender("groups");
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

function navigationWheelEntries() {
	const groupsById = new Map(visualGroups(app.graph).map((group) => [String(group.id), group]));
	return groupNavigation().entries.map((entry) => {
		const group = groupsById.get(entry.groupId) || null;
		const state = group ? groupNavigationStatus(group) : { label: t("aaalice.workspace.groupNavigation.status.missing", "Missing") };
		return {
			entry,
			name: String(group?.title || entry.label || message("aaalice.workspace.groupNavigation.missingGroup", "Missing group #{id}", { id: entry.groupId })),
			nodeCount: Array.isArray(group?.nodes) ? group.nodes.length : 0,
			statusLabel: state.label,
			color: normalizeColor(group?.color),
			selectable: Boolean(group),
		};
	});
}

function navigateGroupNavigationEntry(entry) {
	const group = visualGroups(app.graph).find((candidate) => String(candidate.id) === String(entry?.groupId));
	if (!group) {
		app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.workspace.groupNavigation.title", "Group navigation"), detail: t("aaalice.workspace.groupNavigation.unavailable", "This group cannot be located on the current canvas.") });
		return;
	}
	navigateFromWorkspace(group, entry.offset, entry.zoom);
}

function openNavigationWheel(owner, trigger = "keyboard", activation = null) {
	const navigation = groupNavigation();
	const entries = navigationWheelEntries();
	if (!entries.length) return;
	openGroupNavigationWheel({
		owner,
		graph: app.graph,
		canvasElement: app.canvas?.canvas || null,
		entries,
		center: groupNavigationWheelCenter(app.graph, trigger),
		shortcutCode: activation?.code || navigation.wheelShortcut,
		shortcutLabel: activation?.label || wheelShortcutLabel(navigation.wheelShortcut),
		activationPointer: activation?.pointer || null,
		trigger,
		onNavigate: navigateGroupNavigationEntry,
	});
}

function openGroupNavigationWheelSettings() {
	const navigation = groupNavigation();
	let candidate = navigation.wheelShortcut;
	let captureError = "";
	const input = el("input", { className: "aa-group-navigation-shortcut-input", attrs: { type: "text", readonly: "", placeholder: t("aaalice.workspace.groupNavigation.wheel.shortcutPlaceholder", "Press any key.") } });
	const badgeValue = el("span", { className: "aa-group-navigation-wheel-key-badge" });
	const hint = el("small", "aa-group-navigation-shortcut-hint", t("aaalice.workspace.groupNavigation.wheel.shortcutHint", "Press any key."));
	const error = el("small", "aa-group-navigation-shortcut-error");
	const sync = () => {
		const label = wheelShortcutLabel(candidate);
		input.value = label || t("aaalice.workspace.groupNavigation.wheel.disabled", "Disabled");
		badgeValue.textContent = label || "—";
		error.textContent = captureError;
		save.disabled = Boolean(captureError);
	};
	input.addEventListener("keydown", (event) => {
		event.preventDefault(); event.stopPropagation();
		if (event.key === "Escape") { captureError = ""; sync(); return; }
		if (event.key === "Backspace" || event.key === "Delete") { candidate = null; captureError = ""; sync(); return; }
		const shortcut = wheelShortcutFromKeyboardEvent(event);
		if (!shortcut) { captureError = t("aaalice.workspace.groupNavigation.wheel.invalidShortcut", "Press one key."); sync(); return; }
		candidate = shortcut; captureError = ""; sync();
	});
	const body = el("div", { className: "aa-group-navigation-wheel-settings", children: [
		field({ label: t("aaalice.workspace.groupNavigation.wheel.shortcutLabel", "Wheel activation key"), control: input }),
		el("div", { className: "aa-group-navigation-wheel-current", children: [el("span", null, t("aaalice.workspace.groupNavigation.wheel.currentKey", "Current key")), badgeValue] }),
		hint, error,
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.groupNavigation.wheel.settingsTitle", "Group navigation wheel"), body, footer, confirmOnEnter: false, className: "aa-group-navigation-dialog aa-group-navigation-wheel-dialog" });
	const save = button({ label: t("aaalice.common.save", "Save"), onClick: () => {
		try {
			updateGroupNavigation((model) => setGroupNavigationWheelShortcut(model, candidate), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
			dialog.close();
		} catch (error) {
			captureError = error instanceof Error ? error.message : String(error);
			sync();
		}
	} });
	const restore = button({ label: t("aaalice.workspace.groupNavigation.wheel.restoreDefault", "Restore default"), variant: "ghost", onClick: () => { candidate = DEFAULT_WHEEL_SHORTCUT; captureError = ""; sync(); } });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), restore, save);
	sync(); input.focus();
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

function openGroupNavigationSettings(entry) {
	const offsetX = el("input", { attrs: { type: "number", step: "50", value: entry.offset.x, "aria-label": t("aaalice.workspace.groupNavigation.offsetX", "Horizontal offset") } });
	const offsetY = el("input", { attrs: { type: "number", step: "50", value: entry.offset.y, "aria-label": t("aaalice.workspace.groupNavigation.offsetY", "Vertical offset") } });
	const zoom = el("input", { attrs: { type: "number", min: "10", max: "300", step: "5", value: Math.round(entry.zoom * 100), "aria-label": t("aaalice.workspace.groupNavigation.zoom", "Zoom") } });
	const offsetFields = el("div", { className: "aa-group-navigation-offset-fields", children: [
		field({ label: t("aaalice.workspace.groupNavigation.offsetX", "Horizontal offset"), control: offsetX }),
		field({ label: t("aaalice.workspace.groupNavigation.offsetY", "Vertical offset"), control: offsetY }),
		field({ label: t("aaalice.workspace.groupNavigation.zoom", "Zoom"), control: zoom }),
	] });
	const body = el("div", { className: "aa-group-navigation-settings", children: [
		el("div", { className: "aa-group-navigation-offset-section", children: [el("strong", null, t("aaalice.workspace.groupNavigation.viewTitle", "Target view")), el("small", null, t("aaalice.workspace.groupNavigation.viewHint", "Offsets use canvas units; zoom controls how much of the viewport the group occupies.")), offsetFields] }),
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.groupNavigation.settings", "Navigation settings"), body, footer, confirmOnEnter: false });
	const save = button({ label: t("aaalice.common.save", "Save"), onClick: () => {
		updateGroupNavigation((model) => setGroupNavigationZoom(setGroupNavigationOffset(model, entry.groupId, { x: offsetX.value, y: offsetY.value }), entry.groupId, zoom.value === "" ? null : Number(zoom.value) / 100), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
		dialog.close();
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), save);
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
	let draggingGroupId = null;
	const search = createCollapsibleSearch({
		open: viewState.searchOpen, value: viewState.query, focus: focusSearch, disabled: entries.length === 0,
		label: t("aaalice.workspace.groupNavigation.search", "Search groups"), closeLabel: t("aaalice.workspace.search.close", "Close search"), placeholder: t("aaalice.workspace.groupNavigation.searchPlaceholder", "Search workflow groups"),
		onToggle: (open) => { viewState.searchOpen = open; viewState.focusSearch = open; viewState.focusHost = open ? host : null; runtime.scheduleRender(); },
		onInput: (value) => { viewState.query = value; applySearch(value); },
	});
	const count = badge(message("aaalice.workspace.groupNavigation.count", "{count} groups", { count: entries.length }), { className: "aa-group-navigation-count" });
	const add = iconButton({ iconName: "add", label: t("aaalice.workspace.groupNavigation.add", "Add groups"), variant: "ghost", className: "aa-group-navigation-add", onClick: openAddGroupNavigation });
	const wheel = iconButton({ iconName: "scan", label: t("aaalice.workspace.groupNavigation.wheel.open", "Hold and drag to open group navigation wheel"), variant: "ghost", className: "aa-group-navigation-wheel-open", disabled: entries.length === 0 });
	wheel.addEventListener("pointerdown", (event) => {
		if (event.button !== 0 || entries.length === 0) return;
		event.preventDefault(); event.stopPropagation();
		openNavigationWheel(host, "pointer", { pointer: event });
	});
	wheel.addEventListener("keydown", (event) => {
		if (entries.length === 0 || event.repeat || !["Enter", " "].includes(event.key)) return;
		event.preventDefault(); event.stopPropagation();
		openNavigationWheel(host, "keyboard", { code: event.code, label: event.key === " " ? "Space" : "Enter" });
	});
	const wheelSettings = iconButton({ iconName: "settings", label: t("aaalice.workspace.groupNavigation.wheel.settings", "Configure wheel activation key"), variant: "ghost", className: "aa-group-navigation-wheel-settings-button", onClick: openGroupNavigationWheelSettings });
	const toolbar = createWorkspaceToolbar(viewState.searchOpen ? [search.panel] : [el("div", { className: "aa-group-navigation-heading", children: [el("strong", null, t("aaalice.workspace.groupNavigation.title", "Group navigation")), count] }), search.toggle, wheel, wheelSettings, add], { className: `aa-group-navigation-toolbar${viewState.searchOpen ? " is-searching" : ""}`, label: t("aaalice.workspace.groupNavigation.actions", "Group navigation actions") });
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
			const settings = iconButton({ iconName: "settings", label: t("aaalice.workspace.groupNavigation.settingsShort", "Navigation settings"), variant: "ghost", className: "aa-group-navigation-settings-button", onClick: () => openGroupNavigationSettings(entry) });
			const remove = iconButton({ iconName: "close", label: message("aaalice.workspace.groupNavigation.remove", "Remove {group} from navigation", { group: name }), variant: "ghost", className: "aa-group-navigation-remove", onClick: () => updateGroupNavigation((model) => removeGroupNavigationEntry(model, entry.groupId), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings.")) });
			const row = el("div", { className: `aa-group-navigation-row is-${state.status}`, attrs: { "data-group-id": entry.groupId }, children: [] });
			const drag = el("button", { className: "aa-group-navigation-drag", attrs: { type: "button", draggable: "true", title: t("aaalice.workspace.groupNavigation.reorder", "Drag to reorder groups"), "aria-label": message("aaalice.workspace.groupNavigation.reorderGroup", "Reorder {group}", { group: name }) }, children: [icon("drag")] });
			const clearDropState = () => row.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
			drag.addEventListener("dragstart", (event) => { draggingGroupId = entry.groupId; event.dataTransfer?.setData("text/plain", entry.groupId); event.dataTransfer.effectAllowed = "move"; row.classList.add("is-dragging"); });
			drag.addEventListener("dragend", () => { draggingGroupId = null; clearDropState(); });
			drag.addEventListener("keydown", (event) => {
				if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
				const currentIndex = navigation.entries.findIndex((candidate) => candidate.groupId === entry.groupId);
				const destination = currentIndex + (event.key === "ArrowUp" ? -1 : 1);
				if (currentIndex < 0 || destination < 0 || destination >= navigation.entries.length) return;
				event.preventDefault();
				updateGroupNavigation((model) => moveGroupNavigationEntry(model, entry.groupId, destination), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
			});
			row.addEventListener("dragover", (event) => {
				const sourceId = draggingGroupId || (event.dataTransfer?.types.includes("text/plain") ? event.dataTransfer.getData("text/plain") : null);
				if (!sourceId || sourceId === entry.groupId) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				const bounds = row.getBoundingClientRect();
				const before = event.clientY < bounds.top + bounds.height / 2;
				row.classList.toggle("is-drop-before", before);
				row.classList.toggle("is-drop-after", !before);
			});
			row.addEventListener("dragleave", (event) => { if (!row.contains(event.relatedTarget)) row.classList.remove("is-drop-before", "is-drop-after"); });
			row.addEventListener("drop", (event) => {
				event.preventDefault();
				const sourceId = draggingGroupId || event.dataTransfer?.getData("text/plain");
				const before = row.classList.contains("is-drop-before");
				clearDropState();
				const sourceIndex = navigation.entries.findIndex((candidate) => candidate.groupId === sourceId);
				const targetIndex = navigation.entries.findIndex((candidate) => candidate.groupId === entry.groupId);
				if (!sourceId || sourceId === entry.groupId || sourceIndex < 0 || targetIndex < 0) return;
				let destination = before ? targetIndex : targetIndex + 1;
				if (sourceIndex < destination) destination -= 1;
				updateGroupNavigation((model) => moveGroupNavigationEntry(model, sourceId, destination), t("aaalice.workspace.groupNavigation.saveWorkflowReminder", "Save the workflow to keep group navigation settings."));
			});
			row.append(drag, target, el("div", { className: "aa-group-navigation-actions", children: [settings, remove] }));
			list.append(row);
		}
		if (!visible.length) list.append(emptyState({ iconName: "fit", className: "aa-workspace-empty aa-group-navigation-empty", title: entries.length ? t("aaalice.workspace.groupNavigation.noMatchesTitle", "No matching groups") : t("aaalice.workspace.groupNavigation.emptyTitle", "No navigation groups yet"), description: entries.length ? t("aaalice.workspace.groupNavigation.noMatches", "Try another group name.") : t("aaalice.workspace.groupNavigation.empty", "Add only the workflow groups you want to navigate to.") }));
	};
	applySearch(viewState.query);
	container.append(toolbar, list);
}

export function handleGroupNavigationShortcut(event) {
	if (dispatchGroupNavigationWheelKeydown(event)) return;
	if (event.defaultPrevented || event.repeat || isEditableShortcutTarget(event.target)) return;
	const navigation = groupNavigation();
	const wheelShortcut = wheelShortcutFromKeyboardEvent(event);
	if (navigation.wheelShortcut && wheelShortcut === navigation.wheelShortcut) {
		const owner = runtime.getActiveWorkspaceRoot?.() || null;
		event.preventDefault(); event.stopPropagation();
		openNavigationWheel(owner, "keyboard");
		return;
	}
}

export function handleGroupNavigationShortcutUp(event) {
	dispatchGroupNavigationWheelKeyup(event);
}
