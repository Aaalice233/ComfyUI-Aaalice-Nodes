/** QuickGroupManager filter and linkage overlays. */

import { t } from "../i18n.js";
import {
	quickGroupManagerGroups,
	quickGroupManagerState,
} from "./quick_group_manager_runtime.js";
import {
	groupMatchesFilter,
	normalizeColor,
	ruleCount,
	validateLinkageRules,
} from "./quick_group_manager_model.js";
import { button, createAnchoredPopover, createTooltip, el, iconButton } from "./ui.js";

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function groupLabel(group) {
	return String(group?.title || message("aaalice.quickGroup.untitled", "Untitled group"));
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

export function createQuickGroupManagerPopoverController({ commit, render, toast }) {
	function closePopover(node) {
		node._aaaliceQuickPopover?.close?.();
		node._aaaliceQuickPopover = null;
	}

	function createPopover(node, anchor, className, ariaLabel) {
		closePopover(node);
		const width = className.includes("rules") ? 440 : 280;
		let popup = null;
		popup = createAnchoredPopover({
			anchor,
			ariaLabel,
			className: `aaalice-qgm-popover ${className}`,
			width,
			onClose: () => {
				if (node._aaaliceQuickPopover?.root === popup?.root) node._aaaliceQuickPopover = null;
			},
		});
		popup.anchor = anchor;
		node._aaaliceQuickPopover = popup;
		node._aaaliceQuickAccent?.sync(popup.root);
		return popup;
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
		for (const entry of filterEntries(quickGroupManagerState(node))) {
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
		const groups = quickGroupManagerGroups(node);
		const state = quickGroupManagerState(node);
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
				commit(node, () => { quickGroupManagerState(node).filter = draft; });
				popup.close();
				render(node);
			} }),
		);
		popup.root.append(choices, footer);
		redraw();
	}

	function showRuleTooltip(node, sourceGroup, anchor, immediate = false) {
		const state = quickGroupManagerState(node);
		const rule = state.rules[String(sourceGroup.id)];
		if (!ruleCount(state.rules, sourceGroup.id)) return;
		const groupsById = new Map(quickGroupManagerGroups(node).map((group) => [String(group.id), group]));
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
		const state = quickGroupManagerState(node);
		const groups = quickGroupManagerGroups(node);
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
				commit(node, () => { quickGroupManagerState(node).rules = draftRules; });
				popup.close();
				render(node);
			} }),
		);
		popup.root.append(search, content, footer);
		redraw();
	}

	return {
		closeHoverTooltip,
		closePopover,
		filterSummary,
		openFilter,
		openRuleEditor,
		ruleErrorText,
		showFilterTooltip,
		showRuleTooltip,
	};
}
