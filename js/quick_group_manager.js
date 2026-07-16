/** QuickGroupManager canvas group controller and compact DOM surface. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { button, el, emptyState, icon, iconButton, isolate } from "./lib/ui.js";
import {
	GROUP_STATE,
	classifyGroupNodes,
	groupMatchesFilter,
	normalizeColor,
	normalizeQuickGroupState,
	orderedVisibleGroups,
	planLinkageCascade,
	planNodeModeChanges,
	reconcileGroupOrder,
	reorderVisibleGroups,
	ruleCount,
	validateLinkageRules,
} from "./lib/quick_group_manager_model.js";

const NODE = "QuickGroupManager";
const PROPERTY = "quickGroupManagerState";
const WIDGET = "aaalice_quick_group_manager";
const TOOLBAR_WIDGET = "aaalice_quick_group_manager_toolbar";
const TITLE_ACTIONS_WIDTH = 200;
const DEFAULT_HEIGHT = 190;
const MIN_BODY_HEIGHT = 82;
const mountedManagers = new Set();
let graphListenerInstalled = false;
let refreshFrame = 0;

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({ severity, summary: t("aaalice.quickGroup.title", "Quick Group Manager"), detail, life: 4200 });
}

function isManager(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function stateFor(node) {
	node.properties ||= {};
	node.properties[PROPERTY] = normalizeQuickGroupState(node.properties[PROPERTY]);
	return node.properties[PROPERTY];
}

function groupsFor(node) {
	const groups = [...(node.graph?._groups || [])];
	for (const group of groups) group.recomputeInsideNodes?.();
	return groups;
}

function groupLabel(group) {
	return String(group?.title || message("aaalice.quickGroup.untitled", "Untitled group"));
}

function commit(node, mutate) {
	const graph = node.graph;
	graph?.beforeChange?.();
	try { mutate(); }
	finally {
		graph?.afterChange?.();
		graph?.change?.();
		graph?.setDirtyCanvas?.(true, true);
	}
}

function scheduleRenderAll() {
	if (refreshFrame) return;
	refreshFrame = requestAnimationFrame(() => {
		refreshFrame = 0;
		for (const node of mountedManagers) if (node.graph) render(node);
	});
}

function installGraphListener() {
	if (graphListenerInstalled) return;
	graphListenerInstalled = true;
	api.addEventListener("graphChanged", scheduleRenderAll);
}

function closePopover(node) {
	node._aaaliceQuickPopover?.close?.();
	node._aaaliceQuickPopover = null;
}

function createPopover(node, anchor, className, ariaLabel) {
	closePopover(node);
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
	const root = isolate(el("section", { className: `aaalice-qgm-popover ${className}`, attrs: { role: "dialog", "aria-modal": "false", "aria-label": ariaLabel, tabindex: -1 } }));
	document.body.append(root);
	const rect = anchor.getBoundingClientRect();
	const width = className.includes("rules") ? 440 : 280;
	root.style.width = `${width}px`;
	root.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))}px`;
	root.style.top = `${Math.min(window.innerHeight - 80, rect.bottom + 6)}px`;
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		document.removeEventListener("pointerdown", outside, true);
		document.removeEventListener("keydown", keydown, true);
		root.remove();
		if (node._aaaliceQuickPopover?.root === root) node._aaaliceQuickPopover = null;
		previousFocus?.focus?.({ preventScroll: true });
	};
	const outside = (event) => { if (!root.contains(event.target) && event.target !== anchor) close(); };
	const keydown = (event) => {
		if (event.key === "Escape") { event.preventDefault(); close(); return; }
		if (event.key !== "Tab") return;
		const focusable = [...root.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable.at(-1);
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	};
	setTimeout(() => {
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("keydown", keydown, true);
		(root.querySelector("input, button, select") || root).focus();
	}, 0);
	node._aaaliceQuickPopover = { root, close };
	return node._aaaliceQuickPopover;
}

function filterSummary(state) {
	if (state.filter.mode === "all") return t("aaalice.quickGroup.filter.all", "All groups");
	const count = state.filter.colors.length + (state.filter.includeUncolored ? 1 : 0);
	return message("aaalice.quickGroup.filter.selected", "{count} color filters", { count });
}

function openFilter(node, anchor) {
	const popup = createPopover(node, anchor, "aaalice-qgm-filter-popover", t("aaalice.quickGroup.filter.aria", "Choose group colors"));
	const groups = groupsFor(node);
	const state = stateFor(node);
	const draft = { mode: state.filter.mode, colors: [...state.filter.colors], includeUncolored: state.filter.includeUncolored };
	const liveColors = [...new Set(groups.map((group) => normalizeColor(group.color)).filter(Boolean))].sort();
	const colors = [...new Set([...liveColors, ...draft.colors])];
	const choices = el("div", "aaalice-qgm-filter-choices");
	const redraw = () => {
		const all = el("button", { className: `aaalice-qgm-filter-all${draft.mode === "all" ? " is-active" : ""}`, attrs: { type: "button", "aria-pressed": draft.mode === "all" }, text: t("aaalice.quickGroup.filter.all", "All groups") });
		all.addEventListener("click", () => { draft.mode = "all"; redraw(); });
		const grid = el("div", "aaalice-qgm-filter-grid");
		for (const color of colors) {
			const selected = draft.mode === "selected" && draft.colors.includes(color);
			const stale = !liveColors.includes(color);
			const choice = el("button", { className: `aaalice-qgm-color-choice${selected ? " is-active" : ""}${stale ? " is-stale" : ""}`, attrs: { type: "button", "aria-pressed": selected, title: stale ? t("aaalice.quickGroup.filter.missing", "No current group uses this color") : color } });
			choice.append(el("span", { className: "aaalice-qgm-color", attrs: { style: `--group-color:${color}` } }), el("span", null, color), stale ? el("span", "aaalice-qgm-warning", "!") : null);
			choice.addEventListener("click", () => { draft.mode = "selected"; draft.colors = draft.colors.includes(color) ? draft.colors.filter((value) => value !== color) : [...draft.colors, color]; redraw(); });
			grid.append(choice);
		}
		const selected = draft.mode === "selected" && draft.includeUncolored;
		const uncolored = el("button", { className: `aaalice-qgm-color-choice${selected ? " is-active" : ""}`, attrs: { type: "button", "aria-pressed": selected } });
		uncolored.append(el("span", "aaalice-qgm-color is-uncolored"), el("span", null, t("aaalice.quickGroup.filter.uncolored", "No color")));
		uncolored.addEventListener("click", () => { draft.mode = "selected"; draft.includeUncolored = !draft.includeUncolored; redraw(); });
		grid.append(uncolored);
		choices.replaceChildren(all, grid);
	};
	const footer = el("footer", "aaalice-qgm-popover-footer");
	footer.append(
		button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: popup.close }),
		button({ label: t("aaalice.common.save", "Save"), onClick: () => {
			commit(node, () => { stateFor(node).filter = draft; });
			popup.close();
			render(node);
		} }),
	);
	popup.root.append(choices, footer);
	redraw();
}

function ruleErrorText(result) {
	const labels = {
		self: t("aaalice.quickGroup.error.self", "A group cannot link to itself."),
		cycle: t("aaalice.quickGroup.error.cycle", "The linkage contains a cycle."),
		missing: message("aaalice.quickGroup.error.missing", "Group {id} no longer exists.", { id: result.groupId }),
		conflict: message("aaalice.quickGroup.error.conflict", "Group {id} receives conflicting actions.", { id: result.groupId }),
		empty: message("aaalice.quickGroup.error.empty", "Group {id} has no nodes.", { id: result.groupId }),
		nodeConflict: t("aaalice.quickGroup.error.nodeConflict", "Overlapping groups assign different modes to the same node."),
	};
	return labels[result.code] || t("aaalice.quickGroup.error.invalid", "The linkage rule is invalid.");
}

function cloneRules(rules) {
	return JSON.parse(JSON.stringify(rules || {}));
}

function openRuleEditor(node, sourceGroup, anchor) {
	const popup = createPopover(node, anchor, "aaalice-qgm-rules-popover", message("aaalice.quickGroup.rules.aria", "Edit linkage for {group}", { group: groupLabel(sourceGroup) }));
	const state = stateFor(node);
	const groups = groupsFor(node);
	const sourceId = String(sourceGroup.id);
	const draftRules = cloneRules(state.rules);
	draftRules[sourceId] ||= { enable: {}, disable: {} };
	const search = el("input", { className: "aaalice-qgm-rule-search", attrs: { type: "search", placeholder: t("aaalice.quickGroup.rules.search", "Search groups"), "aria-label": t("aaalice.quickGroup.rules.search", "Search groups") } });
	const content = el("div", "aaalice-qgm-rule-content");
	const renderPhase = (phase, label) => {
		const section = el("section", "aaalice-qgm-rule-phase");
		section.append(el("strong", null, label));
		const entries = el("div", "aaalice-qgm-rule-entries");
		const needle = search.value.trim().toLocaleLowerCase();
		const candidates = groups.filter((group) => String(group.id) !== sourceId && (!needle || groupLabel(group).toLocaleLowerCase().includes(needle)));
		for (const group of candidates) {
			const targetId = String(group.id);
			const select = el("select", { attrs: { "aria-label": message("aaalice.quickGroup.rules.actionFor", "Action for {group}", { group: groupLabel(group) }) } });
			for (const [value, text] of [["", "—"], ["enable", t("aaalice.common.enabled", "Enabled")], ["disable", t("aaalice.common.disabled", "Disabled")]]) select.append(el("option", { attrs: { value }, text }));
			select.value = draftRules[sourceId][phase]?.[targetId] || "";
			select.addEventListener("change", () => {
				if (select.value) draftRules[sourceId][phase][targetId] = select.value;
				else delete draftRules[sourceId][phase][targetId];
			});
			const row = el("label", "aaalice-qgm-rule-entry");
			row.append(el("span", { className: "aaalice-qgm-color", attrs: { style: `--group-color:${normalizeColor(group.color) || "transparent"}` } }), el("span", "aaalice-qgm-rule-name", groupLabel(group)), select);
			entries.append(row);
		}
		for (const targetId of Object.keys(draftRules[sourceId][phase] || {})) {
			if (groups.some((group) => String(group.id) === targetId)) continue;
			const remove = iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", onClick: () => { delete draftRules[sourceId][phase][targetId]; redraw(); } });
			entries.append(el("div", { className: "aaalice-qgm-rule-entry is-missing", children: [el("span", "aaalice-qgm-warning", "!"), el("span", "aaalice-qgm-rule-name", message("aaalice.quickGroup.rules.missingTarget", "Missing group #{id}", { id: targetId })), remove] }));
		}
		if (!entries.children.length) entries.append(el("span", "aaalice-qgm-rule-empty", t("aaalice.quickGroup.rules.noMatches", "No matching groups")));
		section.append(entries);
		return section;
	};
	const redraw = () => {
		content.replaceChildren(
			renderPhase("enable", t("aaalice.quickGroup.rules.whenEnabled", "When enabled")),
			renderPhase("disable", t("aaalice.quickGroup.rules.whenDisabled", "When disabled")),
		);
	};
	search.addEventListener("input", redraw);
	const footer = el("footer", "aaalice-qgm-popover-footer");
	footer.append(
		button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: popup.close }),
		button({ label: t("aaalice.common.save", "Save"), onClick: () => {
			if (!Object.keys(draftRules[sourceId].enable).length && !Object.keys(draftRules[sourceId].disable).length) delete draftRules[sourceId];
			const scope = new Set(groups.filter((group) => groupMatchesFilter(group, state.filter)).map((group) => String(group.id)));
			const known = new Set(groups.map((group) => String(group.id)));
			const validation = validateLinkageRules(draftRules, scope, known);
			if (!validation.ok) { toast("error", ruleErrorText(validation)); return; }
			commit(node, () => { stateFor(node).rules = draftRules; });
			popup.close();
			render(node);
		} }),
	);
	popup.root.append(search, content, footer);
	redraw();
}

function applyGroupAction(node, sourceId, action) {
	const groups = groupsFor(node);
	const state = stateFor(node);
	const groupsById = new Map(groups.map((group) => [String(group.id), group]));
	const scope = new Set(groups.filter((group) => groupMatchesFilter(group, state.filter)).map((group) => String(group.id)));
	const known = new Set(groupsById.keys());
	const cascade = planLinkageCascade({ sourceId, action, rules: state.rules, scopedIds: scope, knownIds: known });
	if (!cascade.ok) { toast("error", ruleErrorText(cascade)); return; }
	const plan = planNodeModeChanges(cascade.assignments, groupsById, state.offMode);
	if (!plan.ok) { toast("error", ruleErrorText(plan)); return; }
	commit(node, () => { for (const [target, mode] of plan.nodeModes) target.mode = mode; });
	render(node);
}

function switchOffMode(node, offMode) {
	const groups = groupsFor(node);
	const state = stateFor(node);
	if (state.offMode === offMode) return;
	const scoped = groups.filter((group) => groupMatchesFilter(group, state.filter));
	const assignments = new Map(scoped.filter((group) => classifyGroupNodes(group.nodes) === GROUP_STATE.DISABLED).map((group) => [String(group.id), "disable"]));
	const plan = planNodeModeChanges(assignments, new Map(groups.map((group) => [String(group.id), group])), offMode);
	if (!plan.ok) { toast("error", ruleErrorText(plan)); return; }
	commit(node, () => {
		state.offMode = offMode;
		for (const [target, mode] of plan.nodeModes) target.mode = mode;
	});
	render(node);
}

function moveGroup(node, sourceId, targetId) {
	const groups = groupsFor(node);
	const state = stateFor(node);
	const order = reconcileGroupOrder(state.groupOrder, groups);
	const visibleIds = orderedVisibleGroups(groups, state).map((group) => String(group.id));
	const next = reorderVisibleGroups(order, visibleIds, sourceId, targetId);
	if (next.join("\u0000") === order.join("\u0000")) return;
	commit(node, () => { state.groupOrder = next; });
	render(node);
}

function modeSwitcher(node, state) {
	const segmented = el("div", { className: `aaalice-qgm-segmented is-${state.offMode}`, attrs: { role: "radiogroup", "aria-label": t("aaalice.quickGroup.mode.aria", "Disabled group mode") } });
	segmented.append(el("span", { className: "aaalice-qgm-segmented-thumb", attrs: { "aria-hidden": "true" } }));
	for (const [value, label] of [["mute", t("aaalice.quickGroup.mode.mute", "Mute")], ["bypass", t("aaalice.quickGroup.mode.bypass", "Bypass")]]) {
		const choice = el("button", { className: state.offMode === value ? "is-active" : "", attrs: { type: "button", role: "radio", "aria-checked": state.offMode === value, "data-off-mode": value }, text: label });
		choice.addEventListener("click", () => switchOffMode(node, value));
		segmented.append(choice);
	}
	return segmented;
}

function syncModeSwitcher(segmented, state) {
	segmented.classList.toggle("is-mute", state.offMode === "mute");
	segmented.classList.toggle("is-bypass", state.offMode === "bypass");
	segmented.setAttribute("aria-label", t("aaalice.quickGroup.mode.aria", "Disabled group mode"));
	for (const choice of segmented.querySelectorAll("[data-off-mode]")) {
		const value = choice.dataset.offMode;
		const active = value === state.offMode;
		choice.classList.toggle("is-active", active);
		choice.setAttribute("aria-checked", String(active));
		choice.textContent = value === "mute" ? t("aaalice.quickGroup.mode.mute", "Mute") : t("aaalice.quickGroup.mode.bypass", "Bypass");
	}
}

function syncToolbar(node, state) {
	const toolbar = node._aaaliceQuickToolbar;
	let actions = toolbar.querySelector(".aaalice-qgm-actions");
	if (!actions) {
		actions = el("div", "aaalice-qgm-actions");
		const filter = iconButton({ iconName: "filter", label: t("aaalice.quickGroup.filter.aria", "Choose group colors"), variant: "ghost", className: "aaalice-qgm-filter-button" });
		filter.addEventListener("click", () => openFilter(node, filter));
		const refresh = iconButton({ iconName: "refresh", label: t("aaalice.quickGroup.refresh", "Refresh groups"), variant: "ghost", className: "aaalice-qgm-refresh-button", onClick: () => render(node) });
		actions.append(modeSwitcher(node, state), filter, refresh);
		toolbar.replaceChildren(actions);
		node._aaaliceQuickFilterButton = filter;
	}
	const segmented = actions.querySelector(".aaalice-qgm-segmented");
	if (segmented) syncModeSwitcher(segmented, state);
	const filter = actions.querySelector(".aaalice-qgm-filter-button");
	if (filter) {
		const label = `${t("aaalice.quickGroup.filter.aria", "Choose group colors")} · ${filterSummary(state)}`;
		filter.classList.toggle("is-active", state.filter.mode === "selected");
		filter.setAttribute("aria-label", label);
		filter.title = label;
		node._aaaliceQuickFilterButton = filter;
	}
	const refresh = actions.querySelector(".aaalice-qgm-refresh-button");
	if (refresh) {
		const label = t("aaalice.quickGroup.refresh", "Refresh groups");
		refresh.setAttribute("aria-label", label);
		refresh.title = label;
	}
}

function groupRow(node, group, visibleGroups) {
	const state = stateFor(node);
	const id = String(group.id);
	const status = classifyGroupNodes(group.nodes);
	const row = el("div", { className: `aaalice-qgm-row is-${status}`, attrs: { "data-group-id": id } });
	const drag = el("button", { className: "aaalice-qgm-drag", attrs: { type: "button", draggable: true, title: t("aaalice.quickGroup.reorder", "Drag to reorder; Alt+Arrow keys also work"), "aria-label": message("aaalice.quickGroup.reorderGroup", "Reorder {group}", { group: groupLabel(group) }) }, children: [icon("drag")] });
	drag.addEventListener("dragstart", (event) => { event.dataTransfer?.setData("text/plain", id); event.dataTransfer.effectAllowed = "move"; row.classList.add("is-dragging"); });
	drag.addEventListener("dragend", () => row.classList.remove("is-dragging"));
	drag.addEventListener("keydown", (event) => {
		if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
		event.preventDefault();
		const index = visibleGroups.findIndex((candidate) => String(candidate.id) === id);
		const target = visibleGroups[index + (event.key === "ArrowUp" ? -1 : 1)];
		if (target) moveGroup(node, id, target.id);
	});
	row.addEventListener("dragover", (event) => { event.preventDefault(); row.classList.add("is-drop-target"); });
	row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
	row.addEventListener("drop", (event) => { event.preventDefault(); row.classList.remove("is-drop-target"); const source = event.dataTransfer?.getData("text/plain"); if (source) moveGroup(node, source, id); });
	const swatch = el("span", { className: `aaalice-qgm-color${normalizeColor(group.color) ? "" : " is-uncolored"}`, attrs: { style: `--group-color:${normalizeColor(group.color) || "transparent"}`, title: normalizeColor(group.color) || t("aaalice.quickGroup.filter.uncolored", "No color") } });
	const name = el("span", { className: "aaalice-qgm-name", attrs: { title: groupLabel(group) }, text: groupLabel(group) });
	const count = ruleCount(state.rules, id);
	const link = iconButton({ iconName: "link", label: message("aaalice.quickGroup.rules.edit", "Edit linkage for {group}", { group: groupLabel(group) }), variant: "ghost", className: `aaalice-qgm-link${count ? " has-rules" : ""}` });
	if (count) link.append(el("span", "aaalice-qgm-rule-count", String(count)));
	link.addEventListener("click", () => openRuleEditor(node, group, link));
	const enabled = status === GROUP_STATE.ENABLED;
	const toggle = el("button", { className: `aaalice-qgm-switch${enabled ? " is-on" : ""}${status === GROUP_STATE.MIXED ? " is-mixed" : ""}`, attrs: { type: "button", role: "switch", "aria-checked": status === GROUP_STATE.MIXED ? "mixed" : enabled, disabled: status === GROUP_STATE.EMPTY, title: status === GROUP_STATE.EMPTY ? t("aaalice.quickGroup.emptyGroup", "This group has no nodes") : null, "aria-label": message("aaalice.quickGroup.toggle", "Toggle {group}", { group: groupLabel(group) }) }, children: [el("span", "aaalice-qgm-switch-thumb")] });
	toggle.addEventListener("click", () => applyGroupAction(node, id, enabled ? "disable" : "enable"));
	row.append(drag, swatch, name, link, toggle);
	return row;
}

function render(node) {
	const root = node._aaaliceQuickRoot;
	const toolbar = node._aaaliceQuickToolbar;
	if (!root || !toolbar) return;
	closePopover(node);
	const groups = groupsFor(node);
	const state = stateFor(node);
	state.groupOrder = reconcileGroupOrder(state.groupOrder, groups);
	const visibleGroups = orderedVisibleGroups(groups, state);
	syncToolbar(node, state);
	const list = el("div", { className: "aaalice-qgm-list", attrs: { role: "list", "aria-label": t("aaalice.quickGroup.groups", "Workflow groups") } });
	if (visibleGroups.length) for (const group of visibleGroups) list.append(groupRow(node, group, visibleGroups));
	else list.append(emptyState({ description: groups.length ? t("aaalice.quickGroup.noFilteredGroups", "No groups match the selected colors.") : t("aaalice.quickGroup.noGroups", "No visual groups are available in this graph."), iconName: "filter", className: "aaalice-qgm-empty" }));
	root.replaceChildren(list);
	node.graph?.setDirtyCanvas?.(true, true);
}

function placeToolbarWidget(node) {
	const widget = node.widgets?.find((item) => item.name === TOOLBAR_WIDGET);
	if (!widget) return;
	widget.y = -(Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT) || 30);
	widget.last_y = widget.y;
	widget.computedHeight = 0;
}

function scheduleInitialSize(node) {
	if (node._aaaliceQuickInitialSizeFrame) return;
	node._aaaliceQuickInitialSizeFrame = requestAnimationFrame(() => {
		node._aaaliceQuickInitialSizeFrame = 0;
		if (!node.graph || node._aaaliceQuickConfigured) return;
		const minimum = node.computeSize?.() || [0, MIN_BODY_HEIGHT];
		node.setSize?.([
			Math.max(Number(minimum[0]) || 0, Number(node.size?.[0]) || 0),
			Math.max(DEFAULT_HEIGHT, Number(node.size?.[1]) || 0),
		]);
		node.graph?.setDirtyCanvas?.(true, true);
	});
}

function enforceMinimumWidth(node) {
	const width = Number(node.size?.[0]);
	const minimumWidth = Number(node.computeSize?.()[0]);
	if (!Number.isFinite(width) || !Number.isFinite(minimumWidth) || width >= minimumWidth) return;
	node.setSize?.([minimumWidth, Number(node.size?.[1]) || DEFAULT_HEIGHT]);
}

function beginResizePassthrough(node) {
	if (node._aaaliceQuickResizeCleanup) return;
	node._aaaliceQuickToolbar?.classList.add("is-resizing");
	node._aaaliceQuickRoot?.classList.add("is-resizing");
	const cleanup = () => {
		document.removeEventListener("pointerup", cleanup, true);
		document.removeEventListener("pointercancel", cleanup, true);
		node._aaaliceQuickToolbar?.classList.remove("is-resizing");
		node._aaaliceQuickRoot?.classList.remove("is-resizing");
		node._aaaliceQuickResizeCleanup = null;
	};
	node._aaaliceQuickResizeCleanup = cleanup;
	document.addEventListener("pointerup", cleanup, true);
	document.addEventListener("pointercancel", cleanup, true);
}

function setupManager(node, { initializeSize = false } = {}) {
	if (!isManager(node) || node._aaaliceQuickMounted) return;
	node._aaaliceQuickMounted = true;
	mountedManagers.add(node);
	installGraphListener();
	stateFor(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] QuickGroupManager requires addDOMWidget");
	const toolbar = isolate(el("div", "aaalice-qgm-toolbar aaalice-qgm"));
	node._aaaliceQuickToolbar = toolbar;
	const toolbarWidget = node.addDOMWidget(TOOLBAR_WIDGET, "custom", toolbar, {
		serialize: false,
		hideOnZoom: false,
		margin: 0,
		getMinHeight: () => 0,
		getMaxHeight: () => 0,
		getHeight: () => 0,
		getValue: () => "",
		setValue: () => {},
	});
	toolbarWidget.computedHeight = 0;
	const root = isolate(el("div", "aaalice-qgm aaalice-qgm-body aaalice-pcp"));
	node._aaaliceQuickRoot = root;
	node.addDOMWidget(WIDGET, "custom", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 0,
		getMinHeight: () => MIN_BODY_HEIGHT,
		getValue: () => "",
		setValue: () => {},
	});
	const previousComputeSize = node.computeSize;
	node.computeSize = function () {
		const computed = previousComputeSize?.apply(this, arguments) || [0, MIN_BODY_HEIGHT];
		// The native minimum already accounts for the localized title. Reserve
		// only the fixed controls sharing that same title row.
		return [Math.ceil((Number(computed[0]) || 0) + TITLE_ACTIONS_WIDTH), Number(computed[1]) || MIN_BODY_HEIGHT];
	};
	const previousGetWidgetOnPos = node.getWidgetOnPos;
	node.getWidgetOnPos = function (x, y) {
		// LiteGraph checks widgets before resize handles. Yield the native corner
		// hit area so the full-size DOM widget cannot swallow node resizing.
		if (this.findResizeDirection?.(x, y)) {
			if (app.canvas?.pointer?.isDown) beginResizePassthrough(this);
			return undefined;
		}
		return previousGetWidgetOnPos?.apply(this, arguments);
	};
	const previousResize = node.onResize;
	node.onResize = function () {
		if (app.canvas?.resizing_node === this) beginResizePassthrough(this);
		return previousResize?.apply(this, arguments);
	};
	const previousArrangeWidgets = node._arrangeWidgets;
	// The zero-height title toolbar and the scrollable body need different
	// origins; widgets_start_y would move both, so only the toolbar is corrected.
	node._arrangeWidgets = function () {
		const result = previousArrangeWidgets?.apply(this, arguments);
		placeToolbarWidget(this);
		return result;
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () {
		const result = previousConfigure?.apply(this, arguments);
		this._aaaliceQuickConfigured = true;
		this.properties[PROPERTY] = normalizeQuickGroupState(this.properties?.[PROPERTY]);
		requestAnimationFrame(() => {
			enforceMinimumWidth(this);
			placeToolbarWidget(this);
			render(this);
		});
		return result;
	};
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		mountedManagers.delete(this);
		closePopover(this);
		if (this._aaaliceQuickInitialSizeFrame) cancelAnimationFrame(this._aaaliceQuickInitialSizeFrame);
		this._aaaliceQuickResizeCleanup?.();
		this._aaaliceQuickToolbar?.remove?.();
		this._aaaliceQuickRoot?.remove?.();
		return previousRemoved?.apply(this, arguments);
	};
	if (initializeSize) scheduleInitialSize(node);
	enforceMinimumWidth(node);
	placeToolbarWidget(node);
	render(node);
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaaliceQuickGroupManager) return;
	nodeType.__aaaliceQuickGroupManager = true;
	const previous = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previous?.apply(this, arguments);
		setupManager(this, { initializeSize: true });
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.QuickGroupManager",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isManager(node)) setupManager(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isManager(node)) setupManager(node); },
	setup() { installGraphListener(); for (const node of app.graph?._nodes || []) if (isManager(node)) setupManager(node); },
});
