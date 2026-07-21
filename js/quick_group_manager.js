/** QuickGroupManager canvas group controller and compact DOM surface. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import { navigateToVisualGroup } from "./lib/group_navigation.js";
import { button, createAnchoredPopover, createTooltip, el, emptyState, icon, iconButton, isolate, segmentedControl } from "./lib/ui.js";
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
const MIN_WIDTH = 340;
const DEFAULT_HEIGHT = 142;
const MIN_BODY_HEIGHT = 82;
const GROUP_ROW_HEIGHT = 42;
const GROUP_ROW_GAP = 2;
const GROUP_LIST_VERTICAL_MARGIN = 10;
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

function locateGroup(group) {
	if (!navigateToVisualGroup(app.canvas, group)) toast("error", t("aaalice.quickGroup.navigateUnavailable", "This group cannot be located on the current canvas."));
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
	const width = className.includes("rules") ? 440 : 280;
	const popup = createAnchoredPopover({ anchor, ariaLabel, className: `aaalice-qgm-popover ${className}`, width });
	popup.anchor = anchor;
	const sharedClose = popup.close;
	popup.close = () => {
		sharedClose();
		if (node._aaaliceQuickPopover?.root === popup.root) node._aaaliceQuickPopover = null;
	};
	node._aaaliceQuickPopover = popup;
	node._aaaliceQuickAccent?.sync(popup.root);
	return node._aaaliceQuickPopover;
}

function minimumBodyHeight(node) {
	const count = orderedVisibleGroups(groupsFor(node), stateFor(node)).length;
	if (!count) return MIN_BODY_HEIGHT;
	return Math.max(MIN_BODY_HEIGHT, (count * GROUP_ROW_HEIGHT) + (Math.max(0, count - 1) * GROUP_ROW_GAP) + GROUP_LIST_VERTICAL_MARGIN);
}

function filterEntries(state) {
	if (state.filter.mode === "all") return [{ label: t("aaalice.quickGroup.filter.all", "All groups") }];
	const entries = state.filter.colors.map(normalizeColor).filter(Boolean).map((color) => ({ color, label: color }));
	if (state.filter.includeUncolored) entries.push({ uncolored: true, label: t("aaalice.quickGroup.filter.uncolored", "No color") });
	return entries.length ? entries : [{ label: t("aaalice.quickGroup.filter.empty", "No colors") }];
}

function filterSummary(state) {
	return filterEntries(state).map((entry) => entry.label).join(", ");
}

function closeHoverTooltip(node) {
	node._aaaliceQuickHoverTooltip?.hide();
}

function hoverTooltipFor(node) {
	if (!node._aaaliceQuickHoverTooltip) node._aaaliceQuickHoverTooltip = createTooltip();
	return node._aaaliceQuickHoverTooltip;
}

function showFilterTooltip(node, anchor, immediate = false) {
	const list = el("div", "aaalice-qgm-filter-tooltip-list");
	for (const entry of filterEntries(stateFor(node))) {
		const row = el("div", "aaalice-qgm-filter-tooltip-row");
		if (entry.color) row.append(el("span", { className: "aaalice-qgm-color", attrs: { style: `--group-color:${entry.color}`, "aria-hidden": "true" } }), el("code", null, entry.color));
		else if (entry.uncolored) row.append(el("span", { className: "aaalice-qgm-color is-uncolored", attrs: { "aria-hidden": "true" } }), el("span", null, entry.label));
		else row.append(el("span", null, entry.label));
		list.append(row);
	}
	hoverTooltipFor(node).show(anchor, list, {
		className: "aaalice-qgm-filter-tooltip",
		immediate,
		onMount: (root) => node._aaaliceQuickAccent?.sync(root),
	});
}

function openFilter(node, anchor) {
	closeHoverTooltip(node);
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
			choice.append(el("span", { className: "aaalice-qgm-color", attrs: { style: `--group-color:${color}` } }), el("span", null, color));
			if (stale) choice.append(el("span", "aaalice-qgm-warning", "!"));
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

function showRuleTooltip(node, sourceGroup, anchor, immediate = false) {
	const state = stateFor(node);
	const rule = state.rules[String(sourceGroup.id)];
	if (!ruleCount(state.rules, sourceGroup.id)) return;
	const groupsById = new Map(groupsFor(node).map((group) => [String(group.id), group]));
	const content = el("div", "aaalice-qgm-rule-tooltip-content");
	for (const [phase, phaseLabel] of [
		["enable", t("aaalice.quickGroup.rules.whenEnabled", "When enabled")],
		["disable", t("aaalice.quickGroup.rules.whenDisabled", "When disabled")],
	]) {
		const actions = Object.entries(rule?.[phase] || {});
		if (!actions.length) continue;
		const section = el("section", "aaalice-qgm-rule-tooltip-phase");
		section.append(el("strong", null, phaseLabel));
		const entries = el("div", "aaalice-qgm-rule-tooltip-entries");
		for (const [targetId, action] of actions) {
			const target = groupsById.get(String(targetId));
			const row = el("div", "aaalice-qgm-rule-tooltip-row");
			if (target) {
				const color = normalizeColor(target.color);
				row.append(
					el("span", { className: `aaalice-qgm-color${color ? "" : " is-uncolored"}`, attrs: color ? { style: `--group-color:${color}`, "aria-hidden": "true" } : { "aria-hidden": "true" } }),
					el("span", "aaalice-qgm-rule-tooltip-name", groupLabel(target)),
				);
			} else {
				row.append(
					el("span", "aaalice-qgm-warning", "!"),
					el("span", "aaalice-qgm-rule-tooltip-name", message("aaalice.quickGroup.rules.missingTarget", "Missing group #{id}", { id: targetId })),
				);
			}
			row.append(el("span", { className: `aaalice-qgm-rule-tooltip-action is-${action}`, text: action === "enable" ? t("aaalice.common.enabled", "Enabled") : t("aaalice.common.disabled", "Disabled") }));
			entries.append(row);
		}
		section.append(entries);
		content.append(section);
	}
	hoverTooltipFor(node).show(anchor, content, {
		className: "aaalice-qgm-rule-tooltip",
		immediate,
		onMount: (root) => node._aaaliceQuickAccent?.sync(root),
	});
}

function openRuleEditor(node, sourceGroup, anchor) {
	closeHoverTooltip(node);
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
	return segmentedControl({
		value: state.offMode,
		options: [["mute", t("aaalice.quickGroup.mode.mute", "Mute")], ["bypass", t("aaalice.quickGroup.mode.bypass", "Bypass")]].map(([value, label]) => ({ value, label })),
		ariaLabel: t("aaalice.quickGroup.mode.aria", "Disabled group mode"),
		onChange: (value) => switchOffMode(node, value),
		className: `aaalice-qgm-segmented is-${state.offMode}`,
		thumbClassName: "aaalice-qgm-segmented-thumb",
		dataAttribute: "offMode",
	});
}

function syncModeSwitcher(segmented, state) {
	segmented.setValue?.(state.offMode);
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
		filter.removeAttribute("title");
		filter.addEventListener("mouseenter", () => showFilterTooltip(node, filter));
		filter.addEventListener("mouseleave", () => closeHoverTooltip(node));
		filter.addEventListener("focus", () => showFilterTooltip(node, filter, true));
		filter.addEventListener("blur", () => closeHoverTooltip(node));
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
		const label = `${t("aaalice.quickGroup.filter.aria", "Choose group colors")}: ${filterSummary(state)}`;
		filter.setAttribute("aria-label", label);
		filter.removeAttribute("title");
		if (node._aaaliceQuickHoverTooltip?.isOpenFor(filter)) showFilterTooltip(node, filter, true);
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
	const name = el("span", { className: "aaalice-qgm-name", attrs: { title: groupLabel(group) }, text: groupLabel(group) });
	const locate = iconButton({ iconName: "fit", label: message("aaalice.quickGroup.navigate", "Go to {group}", { group: groupLabel(group) }), variant: "ghost", className: "aaalice-qgm-locate", onClick: () => locateGroup(group) });
	const count = ruleCount(state.rules, id);
	const link = iconButton({ iconName: "link", label: message("aaalice.quickGroup.rules.edit", "Edit linkage for {group}", { group: groupLabel(group) }), variant: "ghost", className: `aaalice-qgm-link${count ? " has-rules" : ""}` });
	link.removeAttribute("title");
	if (count) {
		link.append(el("span", "aaalice-qgm-rule-count", String(count)));
		link.addEventListener("mouseenter", () => showRuleTooltip(node, group, link));
		link.addEventListener("mouseleave", () => closeHoverTooltip(node));
		link.addEventListener("focus", () => showRuleTooltip(node, group, link, true));
		link.addEventListener("blur", () => closeHoverTooltip(node));
	}
	link.addEventListener("click", () => openRuleEditor(node, group, link));
	const enabled = status === GROUP_STATE.ENABLED;
	const toggle = el("button", { className: `aaalice-qgm-switch${enabled ? " is-on" : ""}${status === GROUP_STATE.MIXED ? " is-mixed" : ""}`, attrs: { type: "button", role: "switch", "aria-checked": status === GROUP_STATE.MIXED ? "mixed" : enabled, disabled: status === GROUP_STATE.EMPTY, title: status === GROUP_STATE.EMPTY ? t("aaalice.quickGroup.emptyGroup", "This group has no nodes") : null, "aria-label": message("aaalice.quickGroup.toggle", "Toggle {group}", { group: groupLabel(group) }) }, children: [el("span", "aaalice-qgm-switch-thumb")] });
	toggle.addEventListener("click", () => applyGroupAction(node, id, enabled ? "disable" : "enable"));
	row.append(drag, name, locate, link, toggle);
	return row;
}

function render(node) {
	const root = node._aaaliceQuickRoot;
	const toolbar = node._aaaliceQuickToolbar;
	if (!root || !toolbar) return;
	node._aaaliceQuickAccent?.sync();
	// Toolbar controls survive body redraws. Keep their popovers open so a queued
	// graphChanged render cannot cancel the user's click on the filter button.
	// Row controls are rebuilt below, so popovers anchored to them must close.
	const popoverAnchor = node._aaaliceQuickPopover?.anchor;
	if (popoverAnchor && !toolbar.contains(popoverAnchor)) closePopover(node);
	const hoverAnchor = node._aaaliceQuickHoverTooltip?.anchor;
	if (hoverAnchor && !toolbar.contains(hoverAnchor)) closeHoverTooltip(node);
	const groups = groupsFor(node);
	const state = stateFor(node);
	state.groupOrder = reconcileGroupOrder(state.groupOrder, groups);
	const visibleGroups = orderedVisibleGroups(groups, state);
	syncToolbar(node, state);
	const list = el("div", { className: "aaalice-qgm-list", attrs: { role: "list", "aria-label": t("aaalice.quickGroup.groups", "Workflow groups") } });
	if (visibleGroups.length) for (const group of visibleGroups) list.append(groupRow(node, group, visibleGroups));
	else list.append(emptyState({ description: groups.length ? t("aaalice.quickGroup.noFilteredGroups", "No groups match the selected colors.") : t("aaalice.quickGroup.noGroups", "No visual groups are available in this graph."), iconName: "filter", className: "aaalice-qgm-empty" }));
	root.replaceChildren(list);
	enforceMinimumSize(node);
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

function enforceMinimumSize(node) {
	const width = Number(node.size?.[0]);
	const height = Number(node.size?.[1]);
	const [minimumWidth, minimumHeight] = node.computeSize?.() || [MIN_WIDTH, MIN_BODY_HEIGHT];
	if (![width, height, minimumWidth, minimumHeight].every(Number.isFinite)) return;
	if (width >= minimumWidth && height >= minimumHeight) return;
	node.setSize?.([Math.max(width, minimumWidth), Math.max(height, minimumHeight)]);
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

function beginPlacementPassthrough(node) {
	if (node._aaaliceQuickPlacementCleanup) return;
	node._aaaliceQuickToolbar?.classList.add("is-placing");
	node._aaaliceQuickRoot?.classList.add("is-placing");
	const cleanup = () => {
		document.removeEventListener("pointerup", cleanup, true);
		document.removeEventListener("pointercancel", cleanup, true);
		node._aaaliceQuickToolbar?.classList.remove("is-placing");
		node._aaaliceQuickRoot?.classList.remove("is-placing");
		node._aaaliceQuickPlacementCleanup = null;
	};
	node._aaaliceQuickPlacementCleanup = cleanup;
	document.addEventListener("pointerup", cleanup, true);
	document.addEventListener("pointercancel", cleanup, true);
}

function setupManager(node, { initializeSize = false } = {}) {
	if (!isManager(node)) return;
	if (node._aaaliceQuickMounted) {
		node._aaaliceQuickAccent?.sync();
		return;
	}
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
	node._aaaliceQuickAccent = bindNodeAccent(node, () => [toolbar, root]);
	node.addDOMWidget(WIDGET, "custom", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 0,
		getMinHeight: () => minimumBodyHeight(node),
		getValue: () => "",
		setValue: () => {},
	});
	const previousComputeSize = node.computeSize;
	node.computeSize = function () {
		const computed = previousComputeSize?.apply(this, arguments) || [0, MIN_BODY_HEIGHT];
		// The fixed toolbar and localized title share one row. Use a content-sized
		// floor instead of inheriting LiteGraph's DOM-widget height calculation,
		// which already includes the body widget and leaves duplicate space below it.
		return [
			Math.max(Math.ceil(Number(computed[0]) || 0), MIN_WIDTH),
			minimumBodyHeight(this),
		];
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
		this._aaaliceQuickAccent?.sync();
		requestAnimationFrame(() => {
			enforceMinimumSize(this);
			placeToolbarWidget(this);
			render(this);
		});
		return result;
	};
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		mountedManagers.delete(this);
		closePopover(this);
		this._aaaliceQuickHoverTooltip?.destroy();
		this._aaaliceQuickHoverTooltip = null;
		this._aaaliceQuickAccent?.dispose();
		this._aaaliceQuickAccent = null;
		if (this._aaaliceQuickInitialSizeFrame) cancelAnimationFrame(this._aaaliceQuickInitialSizeFrame);
		this._aaaliceQuickResizeCleanup?.();
		this._aaaliceQuickPlacementCleanup?.();
		this._aaaliceQuickToolbar?.remove?.();
		this._aaaliceQuickRoot?.remove?.();
		return previousRemoved?.apply(this, arguments);
	};
	if (initializeSize) {
		beginPlacementPassthrough(node);
		scheduleInitialSize(node);
	}
	enforceMinimumSize(node);
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
