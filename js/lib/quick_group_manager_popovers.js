/** QuickGroupManager filter and linkage overlays. */

import { t } from "../i18n.js";
import {
	quickGroupManagerGroups,
	quickGroupManagerState,
} from "./quick_group_manager_runtime.js";
import {
	groupMatchesFilter,
	normalizeColor,
	normalizeHexColor,
	QUICK_GROUP_COLOR_PALETTE,
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
		const preferredWidth = className.includes("rules") ? 720 : className.includes("filter") ? 360 : 280;
		const width = Math.min(preferredWidth, window.innerWidth - 16);
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
		const draft = {
			mode: state.filter.mode,
			colors: [...state.filter.colors],
			customColors: [...(state.filter.customColors || [])],
			includeUncolored: state.filter.includeUncolored,
		};
		const liveColors = [...new Set(groups.map((group) => normalizeColor(group.color)).filter(Boolean))].sort();
		const palette = [...QUICK_GROUP_COLOR_PALETTE];
		const paletteSet = new Set(palette);
		const choices = el("div", "aaalice-qgm-filter-choices");
		const isSelected = (color) => draft.mode === "selected" && draft.colors.includes(color);
		const toggleColor = (color) => {
			draft.mode = "selected";
			draft.colors = draft.colors.includes(color) ? draft.colors.filter((value) => value !== color) : [...draft.colors, color];
		};
		const removeCustomColor = (color) => {
			draft.customColors = draft.customColors.filter((value) => value !== color);
			draft.colors = draft.colors.filter((value) => value !== color);
		};
		const colorChoice = (color, { custom = false, stale = false } = {}) => {
			const selected = isSelected(color);
			const choice = el("button", { className: `aaalice-qgm-color-choice${selected ? " is-active" : ""}${stale ? " is-stale" : ""}`, attrs: {
				type: "button", "aria-pressed": selected,
				"aria-label": message("aaalice.quickGroup.filter.colorChoice", "Filter groups by {color}", { color }),
				title: stale ? t("aaalice.quickGroup.filter.missing", "No current group uses this color") : color,
			} });
			choice.append(
				el("span", { className: "aaalice-qgm-color-preview", attrs: { style: `--group-color:${color}`, "aria-hidden": "true" } }),
				el("code", "aaalice-qgm-color-code", color),
				selected ? el("span", { className: "aaalice-qgm-color-check", text: "✓", attrs: { "aria-hidden": "true" } }) : null,
			);
			choice.addEventListener("click", () => { toggleColor(color); redraw(); });
			if (!custom) return choice;
			const wrapper = el("div", "aaalice-qgm-custom-choice");
			wrapper.append(choice, iconButton({ iconName: "delete", label: message("aaalice.quickGroup.filter.removeCustom", "Remove custom color {color}", { color }), variant: "ghost", className: "aaalice-qgm-custom-remove", onClick: () => { removeCustomColor(color); redraw(); } }));
			return wrapper;
		};
		const colorSection = (label, entries, { custom = false } = {}) => {
			if (!entries.length) return null;
			const section = el("section", "aaalice-qgm-filter-section");
			section.append(el("h3", "aaalice-qgm-filter-section-title", label));
			const grid = el("div", `aaalice-qgm-filter-grid${custom ? " is-custom" : ""}`);
			for (const entry of entries) grid.append(colorChoice(entry.color, entry));
			section.append(grid);
			return section;
		};
		const customEditor = () => {
			const section = el("section", "aaalice-qgm-custom-editor");
			section.append(el("h3", "aaalice-qgm-filter-section-title", t("aaalice.quickGroup.filter.customTitle", "Custom color")));
			const initial = draft.customColors.at(-1) || "#3b82f6";
			const preview = el("span", { className: "aaalice-qgm-custom-preview", attrs: { style: `--group-color:${initial}`, "aria-hidden": "true" } });
			const picker = el("input", { className: "aaalice-qgm-custom-picker", attrs: { type: "color", value: initial.length === 7 ? initial : "#3b82f6", "aria-label": t("aaalice.quickGroup.filter.customPicker", "Preview and choose a custom color") } });
			const input = el("input", { className: "aaalice-qgm-custom-input", attrs: { type: "text", value: initial, placeholder: "#RRGGBB", spellcheck: "false", autocomplete: "off", "aria-label": t("aaalice.quickGroup.filter.customInput", "Custom color hex code") } });
			const add = button({ label: t("aaalice.quickGroup.filter.addCustom", "Add color"), variant: "ghost", className: "aaalice-qgm-custom-add" });
			const validation = el("span", { className: "aaalice-qgm-custom-validation", attrs: { role: "status", "aria-live": "polite" } });
			const sync = () => {
				const value = normalizeHexColor(input.value);
				const hasValue = Boolean(input.value.trim());
				preview.style.setProperty("--group-color", value || "transparent");
				preview.classList.toggle("is-invalid", hasValue && !value);
				add.disabled = !value;
				validation.textContent = hasValue && !value ? t("aaalice.quickGroup.filter.invalidCustom", "Use a valid hex color such as #3B82F6.") : "";
				if (value?.length === 7) picker.value = value;
			};
			const addCustom = () => {
				const value = normalizeHexColor(input.value);
				if (!value) { sync(); input.focus(); return; }
				draft.customColors = [...new Set([...draft.customColors, value])];
				draft.mode = "selected";
				if (!draft.colors.includes(value)) draft.colors.push(value);
				redraw();
			};
			picker.addEventListener("input", () => { input.value = picker.value; sync(); });
			input.addEventListener("input", sync);
			input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } });
			add.addEventListener("click", addCustom);
			const row = el("div", "aaalice-qgm-custom-editor-row");
			row.append(preview, picker, input, add);
			section.append(row, validation, el("p", "aaalice-qgm-custom-hint", t("aaalice.quickGroup.filter.customHint", "Add a color to the saved palette and select it for filtering.")));
			sync();
			return section;
		};
		const redraw = () => {
			const all = el("button", { className: `aaalice-qgm-filter-all${draft.mode === "all" ? " is-active" : ""}`, attrs: { type: "button", "aria-pressed": draft.mode === "all" }, text: t("aaalice.quickGroup.filter.all", "All groups") });
			all.addEventListener("click", () => { draft.mode = "all"; redraw(); });
			const customSet = new Set(draft.customColors);
			const paletteEntries = palette.filter((color) => !customSet.has(color)).map((color) => ({ color }));
			const currentColors = [...new Set([...liveColors, ...draft.colors])].filter((color) => !paletteSet.has(color) && !customSet.has(color));
			const currentEntries = currentColors.map((color) => ({ color, stale: !liveColors.includes(color) }));
			const customEntries = draft.customColors.map((color) => ({ color, custom: true, stale: !liveColors.includes(color) }));
			const selected = draft.mode === "selected" && draft.includeUncolored;
			const uncolored = el("button", { className: `aaalice-qgm-color-choice aaalice-qgm-uncolored-choice${selected ? " is-active" : ""}`, attrs: { type: "button", "aria-pressed": selected, "aria-label": t("aaalice.quickGroup.filter.uncolored", "No color") } });
			uncolored.append(el("span", "aaalice-qgm-color-preview is-uncolored"), el("span", "aaalice-qgm-color-code", t("aaalice.quickGroup.filter.uncolored", "No color")), selected ? el("span", { className: "aaalice-qgm-color-check", text: "✓", attrs: { "aria-hidden": "true" } }) : null);
			uncolored.addEventListener("click", () => { draft.mode = "selected"; draft.includeUncolored = !draft.includeUncolored; redraw(); });
			const paletteSection = colorSection(t("aaalice.quickGroup.filter.paletteTitle", "Color palette"), paletteEntries);
			const currentSection = colorSection(t("aaalice.quickGroup.filter.currentTitle", "Current group colors"), currentEntries);
			const customSection = customEntries.length ? colorSection(t("aaalice.quickGroup.filter.savedTitle", "Saved custom colors"), customEntries, { custom: true }) : null;
			const noColorSection = el("section", "aaalice-qgm-filter-section");
			noColorSection.append(el("h3", "aaalice-qgm-filter-section-title", t("aaalice.quickGroup.filter.noColorTitle", "Uncolored groups")));
			const noColorGrid = el("div", "aaalice-qgm-filter-grid"); noColorGrid.append(uncolored); noColorSection.append(noColorGrid);
			choices.replaceChildren(...[all, paletteSection, currentSection, customSection, noColorSection, customEditor()].filter(Boolean));
		};
		const footer = el("footer", "aaalice-qgm-popover-footer");
		footer.append(
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: popup.close }),
			button({ label: t("aaalice.common.save", "Save"), onClick: () => {
				commit(node, () => { quickGroupManagerState(node).filter = { ...draft, colors: [...new Set(draft.colors)], customColors: [...new Set(draft.customColors)] }; });
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
