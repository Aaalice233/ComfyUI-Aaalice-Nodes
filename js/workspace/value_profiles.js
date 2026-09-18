/** Value adjustment profiles: global reusable control-value overrides applied onto the current sidebar. */

import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingKey, controlItemBindings } from "../lib/dashboard_model.js";
import { captureDashboardValues } from "../lib/dashboard_preset_runtime.js";
import { stableToneIndexes } from "../lib/control_tones.js";
import { createSeedPresetPayload, decodeSeedPresetEntry, SEED_AFTER_GENERATE_MODES } from "../lib/seed_preset.js";
import { badge, button, createDialog, el, emptyState, icon, iconButton, selectControl, toggleSwitch } from "../lib/ui.js";
import { createSearchableSelect } from "../lib/searchable_select.js";
import { availableValueProfileName, createValueProfile, duplicateValueProfile, matchValueProfileRules, parseOverridePresetsForImport, removeValueProfile, removeValueProfileRule, removeValueProfileRules, renameValueProfile, reorderValueProfileRule, serializeOverridePresets, setProfilePresetName, upsertValueProfileRule } from "../lib/value_profiles.js";
import { loadValueProfiles, saveValueProfiles } from "./sidebar_preferences.js";
import { confirmAction, downloadBlob, pickFile } from "./dom_utils.js";
import { openValueProfileDiffDialog } from "./value_profile_diff_dialog.js";
import { dashboardPresetState } from "./dashboard_presets.js";
import { formatProfilePayload } from "../lib/value_profile_format.js";


let runtime = null;
export function configureValueProfiles(dependencies) { runtime = dependencies; }

function notify(severity, detail) {
	app.extensionManager?.toast?.add?.({
		severity,
		summary: t(`aaalice.common.${severity === "error" ? "error" : "notice"}`, severity === "error" ? "Error" : "Notice"),
		detail,
		life: 4500,
	});
}

function hostTitleOf(node) { return String(node?.getTitle?.() || node?.title || "").trim(); }

function linkedLabel(count) {
	return t("aaalice.workspace.valueProfiles.linkedTargets", "Linked ×{count}").replace("{count}", String(count));
}

/**
 * 候选以侧边栏卡片为单位：一张多绑一卡片只出一条，身份取主绑定，
 * 应用时再由应用管线展开整卡绑定，联动目标随主目标一起写入与回滚。
 */
function collectCandidates() {
	const model = runtime.dashboard(); const seen = new Map();
	for (const page of model?.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control" || !item.binding) continue;
		const key = bindingKey(item.binding);
		if (seen.has(key)) continue;
		let resolved = null;
		try { resolved = runtime.resolve(item.binding); } catch { resolved = null; }
		if (resolved?.status !== "ok" || resolved.presettable === false) continue;
		seen.set(key, {
			item,
			binding: item.binding,
			key,
			valueType: item.binding.valueType,
			label: runtime.controlTitle(item, resolved),
			hostLabel: hostTitleOf(resolved.node),
			pageName: String(page.name || ""),
			linkedCount: Math.max(0, controlItemBindings(item).length - 1),
			resolved,
		});
	}
	return [...seen.values()];
}

function captureRule(candidate) {
	const synthetic = { version: 4, pages: [{ id: "value-profiles", name: "", gridColumns: 12, tone: null, groups: [], items: [{ id: "rule", kind: "control", binding: candidate.binding }] }] };
	const captured = captureDashboardValues(synthetic, (binding) => runtime.resolve(binding));
	const entry = captured.values[candidate.key];
	if (!entry) throw new Error(t("aaalice.workspace.valueProfiles.captureFailed", "The control value cannot be captured right now."));
	return { key: candidate.key, valueType: candidate.valueType, payload: entry.payload, label: candidate.label, hostLabel: candidate.hostLabel };
}

function choiceOptions(resolved) {
	return (Array.isArray(resolved?.options?.values) ? resolved.options.values : []).map((entry) => {
		if (entry && typeof entry === "object") return { value: String(entry.value ?? entry.label ?? ""), label: String(entry.label ?? entry.value ?? "") };
		return { value: String(entry), label: String(entry) };
	});
}

function seedBehaviorLabel(mode) {
	const fallbacks = { fixed: "Fixed", increment: "Increment", decrement: "Decrement", randomize: "Randomize" };
	return t(`aaalice.workspace.valueProfiles.behaviors.${mode}`, fallbacks[mode] || mode);
}

function payloadSummary(rule, resolved, format = "summary") {
	return formatProfilePayload(rule.payload, { resolved, valueType: rule.valueType, t, format });
}

function buildValueEditor(rule, match, onCommit) {
	const resolved = match.status === "ready" ? match.candidate.resolved : null;
	const summary = payloadSummary(rule, resolved, "summary");
	const tooltip = payloadSummary(rule, resolved, "tooltip");
	if (!resolved) return el("span", { className: "aa-value-profile-rule__value", attrs: { title: tooltip }, text: summary });
	if (resolved.kind === "seed") {
		const decoded = decodeSeedPresetEntry({ valueType: rule.valueType, payload: rule.payload });
		const number = document.createElement("input");
		number.type = "number"; number.step = "1"; number.className = "aa-ui-input"; number.value = String(decoded.value ?? 0);
		number.setAttribute("aria-label", t("aaalice.workspace.valueProfiles.seedValue", "Seed value"));
		number.addEventListener("change", () => { const value = Math.round(Number(number.value)); if (Number.isFinite(value)) onCommit(createSeedPresetPayload(value, decoded.behavior)); });
		const behavior = selectControl({
			options: (resolved.seedBehaviors?.length ? resolved.seedBehaviors : SEED_AFTER_GENERATE_MODES).map((mode) => ({ value: mode, label: seedBehaviorLabel(mode) })),
			value: decoded.behavior,
			ariaLabel: t("aaalice.workspace.valueProfiles.seedBehavior", "After generate"),
			onChange: (mode) => onCommit(createSeedPresetPayload(Math.round(Number(number.value)) || 0, mode)),
		});
		return el("div", { className: "aa-value-profile-rule__editor", children: [number, behavior] });
	}
	if (resolved.kind === "choice") {
		const control = selectControl({
			options: choiceOptions(resolved), value: String(rule.payload),
			ariaLabel: rule.label,
			onChange: (value) => onCommit(value),
		});
		control.title = summary;
		control.control.title = summary;
		return control;
	}
	if (typeof rule.payload === "boolean") {
		return el("div", { className: "aa-value-profile-rule__boolean", children: [
			toggleSwitch({ checked: rule.payload, label: rule.label, onChange: (value) => onCommit(value) }),
			el("span", null, summary),
		] });
	}
	if (typeof rule.payload === "number") {
		const input = document.createElement("input");
		input.type = "number"; input.className = "aa-ui-input"; input.value = String(rule.payload);
		input.setAttribute("aria-label", rule.label);
		if (resolved.numericDomain === "integer") input.step = "1";
		input.addEventListener("change", () => {
			let value = Number(input.value);
			if (!Number.isFinite(value)) return;
			if (resolved.numericDomain === "integer") value = Math.round(value);
			onCommit(value);
		});
		return input;
	}
	if (resolved.kind === "text" && typeof rule.payload === "string") {
		const input = document.createElement("input");
		input.type = "text"; input.className = "aa-ui-input"; input.value = rule.payload; input.title = rule.payload;
		input.setAttribute("aria-label", rule.label);
		input.addEventListener("change", () => { input.title = input.value; onCommit(input.value); });
		return input;
	}
	return el("span", { className: "aa-value-profile-rule__value", attrs: { title: tooltip }, text: summary });
}

export function openValueProfiles() {
	let state = loadValueProfiles();
	let selectedId = state.profiles[0]?.id || null;
	let addPanelOpen = false;
	let pickerSearch = "";
	let ruleSearch = "";
	let rulesScrollTop = 0;
	let saveFeedback = "automatic";
	const closeAddPanel = () => { addPanelOpen = false; pickerSearch = ""; };

	const body = el("div", { className: "aa-value-profiles" });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.valueProfiles.title", "Adjustment profiles"), body, footer, size: "md", className: "aa-value-profiles-dialog" });
	const resetRulesScroll = () => {
		rulesScrollTop = 0;
		const list = body.querySelector(".aa-value-profile-rules");
		if (list) list.scrollTop = 0;
	};

	const selectedProfile = () => state.profiles.find((profile) => profile.id === selectedId) || null;
	const persist = (mutator) => {
		const previousSelectedId = selectedId;
		try {
			const nextState = mutator(state);
			saveValueProfiles(nextState);
			state = nextState;
			saveFeedback = "saved";
		} catch (error) {
			selectedId = previousSelectedId;
			const message = t("aaalice.workspace.valueProfiles.saveFailed", "The profile could not be saved locally.");
			notify("error", `${message} ${error.message}`);
			return;
		}
		render();
	};

	const addRule = (candidate) => {
		const profile = selectedProfile();
		if (!profile || !candidate) return;
		let rule;
		try { rule = captureRule(candidate); }
		catch (error) { notify("error", error.message); return; }
		persist((current) => upsertValueProfileRule(current, profile.id, rule));
	};

	const groupMatches = (matches) => {
		const groups = new Map();
		for (const match of matches) {
			const title = match.candidate?.hostLabel || match.rule.hostLabel || t("aaalice.workspace.valueProfiles.unavailableSource", "Unavailable source");
			const hostId = match.candidate?.binding?.hostId || "";
			const key = match.status === "ready" ? `${title}\u0000${hostId}` : `unmatched\u0000${title}`;
			if (!groups.has(key)) groups.set(key, { key, title, pages: new Set(), matches: [] });
			const group = groups.get(key);
			if (match.candidate?.pageName) group.pages.add(match.candidate.pageName);
			group.matches.push(match);
		}
		return [...groups.values()];
	};

	const renderRules = (profile, container, matches) => {
		if (!matches.length) {
			container.append(emptyState({
				iconName: "sliders",
				description: t("aaalice.workspace.valueProfiles.emptyRules", "No rules yet. Use Add rule to capture a sidebar control's current value."),
			}));
			return;
		}
		const groups = groupMatches(matches);
		const tones = stableToneIndexes(groups.map((group) => group.key));
		let draggedRuleKey = null;

		for (const group of groups) {
			const labelTotals = new Map();
			for (const match of group.matches) {
				const label = match.candidate?.label || match.rule.label || match.rule.key;
				labelTotals.set(label, (labelTotals.get(label) || 0) + 1);
			}
			const labelIndexes = new Map();
			const rows = group.matches.map((match) => {
				const { rule } = match;
				const label = match.candidate?.label || rule.label || rule.key;
				const labelIndex = (labelIndexes.get(label) || 0) + 1;
				labelIndexes.set(label, labelIndex);
				const duplicateBadge = labelTotals.get(label) > 1 ? badge(
					t("aaalice.workspace.valueProfiles.duplicateOrdinal", "#{index} of {count}").replace("{index}", String(labelIndex)).replace("{count}", String(labelTotals.get(label))),
					{ className: "aa-value-profile-rule__identity" },
				) : null;
				const statusBadge = match.status === "ready" ? null : badge(
					match.status === "ambiguous" ? t("aaalice.workspace.valueProfiles.issue.ambiguous", "Ambiguous") : t("aaalice.workspace.valueProfiles.issue.missing", "Not on sidebar"),
					{ className: "is-warning" },
				);
				const linkedBadge = match.candidate?.linkedCount ? badge(linkedLabel(match.candidate.linkedCount), { className: "aa-value-profile-rule__linked" }) : null;
				const updateButton = match.status === "ready" ? iconButton({
					iconName: "refresh",
					label: t("aaalice.workspace.valueProfiles.captureCurrent", "Update to current value"),
					variant: "ghost",
					onClick: () => {
						let next;
						try { next = captureRule(match.candidate); }
						catch (error) { notify("error", error.message); return; }
						persist((current) => upsertValueProfileRule(current, profile.id, { ...rule, payload: next.payload, label: next.label, hostLabel: next.hostLabel }));
					},
				}) : null;
				const removeButton = iconButton({
					iconName: "delete",
					label: t("aaalice.workspace.valueProfiles.removeRule", "Remove rule"),
					variant: "ghost",
					className: "aa-value-profile-rule__remove",
					onClick: () => { void (async () => {
						const message = t("aaalice.workspace.valueProfiles.removeRuleConfirm", "Remove the rule “{name}”?").replace("{name}", label);
						if (!await confirmAction(message, { title: t("aaalice.workspace.valueProfiles.removeRule", "Remove rule"), confirmLabel: t("aaalice.workspace.valueProfiles.removeRule", "Remove rule"), danger: true })) return;
						persist((current) => removeValueProfileRule(current, profile.id, rule.key));
					})(); },
				});
				const searchText = [label, rule.label, group.title, ...group.pages, match.status].filter(Boolean).join(" ").toLocaleLowerCase();

				const handle = iconButton({
					iconName: "drag",
					label: t("aaalice.workspace.valueProfiles.dragToReorder", "Drag to reorder"),
					title: t("aaalice.workspace.valueProfiles.dragToReorder", "Drag to reorder; Alt+Arrow keys also work"),
					variant: "ghost",
					className: "aa-value-profile-rule__drag-handle",
				});
				handle.draggable = true;
				handle.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");

				const card = el("div", {
					className: `aa-value-profile-rule${match.status === "ready" ? "" : " is-unmatched"}`,
					attrs: { "data-search-text": searchText, "data-rule-key": rule.key },
					children: [
						el("div", { className: "aa-value-profile-rule__head", children: [
							handle,
							el("div", { className: "aa-value-profile-rule__copy", children: [
								el("strong", { attrs: { title: label }, text: label }),
								el("div", { className: "aa-value-profile-rule__meta", children: [duplicateBadge, linkedBadge, statusBadge].filter(Boolean) }),
							] }),
							el("div", { className: "aa-value-profile-rule__actions", children: [updateButton, removeButton].filter(Boolean) }),
						] }),
						el("div", { className: "aa-value-profile-rule__control", children: [buildValueEditor(rule, match, (payload) => persist((current) => upsertValueProfileRule(current, profile.id, { ...rule, payload })))] }),
					],
				});

				handle.addEventListener("dragstart", (e) => {
					draggedRuleKey = rule.key;
					card.classList.add("is-dragging");
					e.dataTransfer?.setData("text/plain", rule.key);
				});
				handle.addEventListener("dragend", () => {
					draggedRuleKey = null;
					card.classList.remove("is-dragging");
					container.querySelectorAll(".aa-value-profile-rule").forEach((c) => c.classList.remove("is-drop-before", "is-drop-after"));
				});
				card.addEventListener("dragover", (e) => {
					if (!draggedRuleKey || draggedRuleKey === rule.key) return;
					e.preventDefault();
					container.querySelectorAll(".aa-value-profile-rule").forEach((c) => c.classList.remove("is-drop-before", "is-drop-after"));
					const rect = card.getBoundingClientRect();
					card.classList.add(e.clientX >= rect.left + rect.width / 2 ? "is-drop-after" : "is-drop-before");
				});
				card.addEventListener("drop", (e) => {
					const sourceKey = draggedRuleKey || e.dataTransfer?.getData("text/plain");
					if (!sourceKey || sourceKey === rule.key) return;
					e.preventDefault();
					const rect = card.getBoundingClientRect();
					const after = e.clientX >= rect.left + rect.width / 2;
					container.querySelectorAll(".aa-value-profile-rule").forEach((c) => c.classList.remove("is-drop-before", "is-drop-after"));

					const allRules = profile.rules;
					const sourceIndex = allRules.findIndex((r) => r.key === sourceKey);
					let targetIndex = allRules.findIndex((r) => r.key === rule.key) + (after ? 1 : 0);
					if (sourceIndex < targetIndex) targetIndex -= 1;
					persist((current) => reorderValueProfileRule(current, profile.id, sourceKey, targetIndex));
				});
				handle.addEventListener("keydown", (e) => {
					if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
					e.preventDefault();
					e.stopPropagation();
					const allRules = profile.rules;
					const currIdx = allRules.findIndex((r) => r.key === rule.key);
					const delta = (e.key === "ArrowUp" || e.key === "ArrowLeft") ? -1 : 1;
					const nextIdx = Math.max(0, Math.min(allRules.length - 1, currIdx + delta));
					if (currIdx !== nextIdx) {
						persist((current) => reorderValueProfileRule(current, profile.id, rule.key, nextIdx));
					}
				});

				return card;
			});
			const pageLabels = [...group.pages].map((page) => {
				const pageBadge = badge(page);
				pageBadge.title = page;
				return pageBadge;
			});
			const groupInvalid = group.matches.filter((m) => m.status !== "ready");
			const groupCleanBtn = groupInvalid.length > 0 ? iconButton({
				iconName: "delete",
				label: t("aaalice.workspace.valueProfiles.cleanGroupIssues", "Remove invalid rules in this group"),
				title: t("aaalice.workspace.valueProfiles.cleanGroupIssues", "Remove invalid rules in this group"),
				variant: "ghost",
				className: "aa-value-profile-group__clean",
				onClick: async () => {
					const count = groupInvalid.length;
					const confirmMsg = t("aaalice.workspace.valueProfiles.cleanGroupConfirm", "Remove {count} invalid rule(s) in group “{name}”?")
						.replace("{count}", String(count))
						.replace("{name}", group.title);
					if (!await confirmAction(confirmMsg, {
						title: t("aaalice.workspace.valueProfiles.cleanIssues", "Clean invalid rules"),
						confirmLabel: t("aaalice.common.delete", "Delete"),
						danger: true,
					})) return;
					const removeKeys = groupInvalid.map((m) => m.rule.key);
					persist((current) => removeValueProfileRules(current, profile.id, removeKeys));
					notify("success", t("aaalice.workspace.valueProfiles.cleanedIssues", "Removed {count} invalid rule(s).").replace("{count}", String(count)));
				},
			}) : null;
			container.append(el("section", {
				className: "aa-value-profile-group",
				attrs: { "data-control-tone": tones.get(group.key) },
				children: [
					el("header", { className: "aa-value-profile-group__header", children: [
						el("span", { className: "aa-value-profile-group__icon", children: [icon("link")] }),
						el("strong", { attrs: { title: group.title }, text: group.title }),
						el("div", { className: "aa-value-profile-group__pages", children: pageLabels }),
						el("div", { className: "aa-value-profile-group__header-actions", children: [
							badge(t("aaalice.workspace.valueProfiles.ruleCount", "{count} rules").replace("{count}", String(rows.length)), { className: "aa-value-profile-group__count" }),
							groupCleanBtn,
						].filter(Boolean) }),
					] }),
					el("div", { className: "aa-value-profile-group__rows", children: rows }),
				],
			}));
		}
	};


	const render = () => {
		const currentRules = body.querySelector(".aa-value-profile-rules");
		if (currentRules) rulesScrollTop = currentRules.scrollTop;
		body.replaceChildren();
		footer.replaceChildren();
		const profile = selectedProfile() || state.profiles[0] || null;
		selectedId = profile?.id || null;
		const restoreRulesScroll = () => {
			const list = body.querySelector(".aa-value-profile-rules");
			if (list) list.scrollTop = rulesScrollTop;
		};
		if (!profile) {
			body.append(emptyState({
				iconName: "sliders",
				title: t("aaalice.workspace.valueProfiles.emptyTitle", "No adjustment profiles"),
				description: t("aaalice.workspace.valueProfiles.emptyHint", "Create a profile, add rules for the controls you adjust every time, then apply them in one click."),
				actions: [button({ label: t("aaalice.workspace.valueProfiles.create", "New profile"), iconName: "add", onClick: createProfile }),
					button({ label: t("aaalice.workspace.valueProfiles.importBtn", "Import profile"), iconName: "download", onClick: importProfiles })],
			}));
			footer.append(button({ label: t("aaalice.common.close", "Close"), variant: "ghost", onClick: () => dialog.close() }));
			return;
		}

		const candidates = collectCandidates();
		const matches = matchValueProfileRules(profile.rules, candidates);
		const groups = groupMatches(matches);
		const issueCount = matches.filter((match) => match.status !== "ready").length;
		const profileSummary = t("aaalice.workspace.valueProfiles.profileSummary", "{rules} rules · {sources} sources")
			.replace("{rules}", String(profile.rules.length))
			.replace("{sources}", String(groups.length));
		const profileSelect = selectControl({
			options: state.profiles.map((entry) => ({ value: entry.id, label: entry.name })),
			value: profile.id,
			ariaLabel: t("aaalice.workspace.valueProfiles.select", "Adjustment profile"),
			onChange: (value) => {
				selectedId = value;
				resetRulesScroll();
				ruleSearch = "";
				saveFeedback = "automatic";
				closeAddPanel();
				render();
			},
		});
		profileSelect.control.title = profile.name;
		const profileOps = el("div", { className: "aa-value-profiles__profile-ops", children: [
			iconButton({ iconName: "add", label: t("aaalice.workspace.valueProfiles.create", "New profile"), variant: "ghost", onClick: createProfile }),
			iconButton({ iconName: "copy", label: t("aaalice.workspace.valueProfiles.duplicate", "Copy as new profile"), variant: "ghost", onClick: () => duplicateProfile(profile) }),
			iconButton({ iconName: "edit", label: t("aaalice.workspace.valueProfiles.rename", "Rename profile"), variant: "ghost", onClick: () => {
				runtime.askText(t("aaalice.workspace.valueProfiles.rename", "Rename profile"), t("aaalice.workspace.valueProfiles.name", "Profile name"), profile.name, (name) => persist((current) => renameValueProfile(current, profile.id, name)));
			} }),
			iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", className: "aa-value-profiles__delete-profile", onClick: async () => {
				if (!await confirmAction(t("aaalice.workspace.valueProfiles.deleteConfirm", "Delete adjustment profile “{name}”?").replace("{name}", profile.name), { title: t("aaalice.common.delete", "Delete"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
				resetRulesScroll();
				ruleSearch = "";
				persist((current) => {
					const next = removeValueProfile(current, profile.id);
					selectedId = next.profiles[0]?.id || null;
					return next;
				});
			} }),
			issueCount ? badge(t("aaalice.workspace.valueProfiles.issueCount", "{count} need attention").replace("{count}", String(issueCount)), {
				className: "is-warning",
				attrs: { title: t("aaalice.workspace.valueProfiles.cleanIssuesHint", "Remove {count} invalid rule(s) not on sidebar").replace("{count}", String(issueCount)) },
			}) : null,
			issueCount ? iconButton({
				iconName: "delete",
				label: t("aaalice.workspace.valueProfiles.cleanIssues", "Clean invalid rules"),
				title: t("aaalice.workspace.valueProfiles.cleanIssuesHint", "Remove {count} invalid rule(s) not on sidebar").replace("{count}", String(issueCount)),
				variant: "ghost",
				className: "aa-value-profiles__clean-issues",
				onClick: async () => {
					const count = issueCount;
					const confirmMsg = t("aaalice.workspace.valueProfiles.cleanIssuesConfirm", "Remove all {count} invalid or unresolvable rule(s) from this profile?").replace("{count}", String(count));
					if (!await confirmAction(confirmMsg, {
						title: t("aaalice.workspace.valueProfiles.cleanIssues", "Clean invalid rules"),
						confirmLabel: t("aaalice.common.delete", "Delete"),
						danger: true,
					})) return;
					const invalidKeys = matches.filter((m) => m.status !== "ready").map((m) => m.rule.key);
					persist((current) => removeValueProfileRules(current, profile.id, invalidKeys));
					notify("success", t("aaalice.workspace.valueProfiles.cleanedIssues", "Removed {count} invalid rule(s).").replace("{count}", String(count)));
				},
			}) : null,
		].filter(Boolean) });

		const toolActions = el("div", { className: "aa-value-profiles__bar-actions", children: [
			button({ iconName: "swap", label: t("aaalice.workspace.valueProfiles.diffBtn", "Diff presets"), variant: "ghost", size: "sm", className: "aa-value-profiles__diff-btn", onClick: openDiff }),
			iconButton({ iconName: "upload", label: t("aaalice.workspace.valueProfiles.exportBtn", "Export profile"), variant: "ghost", onClick: exportCurrentProfile }),
			iconButton({ iconName: "download", label: t("aaalice.workspace.valueProfiles.importBtn", "Import profile"), variant: "ghost", onClick: importProfiles }),
		] });

		body.append(el("div", { className: "aa-value-profiles__bar", children: [
			el("div", { className: "aa-value-profiles__profile", children: [
				profileSelect,
				profileOps,
			] }),
			toolActions,
		] }));

		if (addPanelOpen) {
			const taken = new Set(profile.rules.map((rule) => rule.key));
			const available = candidates.filter((candidate) => !taken.has(candidate.key));
			let pickerControl;
			if (available.length) {
				const picker = createSearchableSelect({
					options: available.map((candidate) => ({
						value: candidate.key,
						label: candidate.label,
						description: candidate.linkedCount ? `${candidate.hostLabel} · ${linkedLabel(candidate.linkedCount)}` : candidate.hostLabel,
						badge: candidate.pageName || null,
					})),
					ariaLabel: t("aaalice.workspace.valueProfiles.addRule", "Add rule"),
					searchPlaceholder: t("aaalice.workspace.valueProfiles.searchControl", "Search components…"),
					emptyLabel: t("aaalice.workspace.valueProfiles.noControlMatches", "No components match the search."),
					initialQuery: pickerSearch,
					onSearchChange: (query) => { pickerSearch = query; },
					onChange: (key) => addRule(candidates.find((candidate) => candidate.key === key)),
				});
				requestAnimationFrame(() => picker.focusSearch());
				pickerControl = picker;
			} else {
				pickerControl = el("p", { className: "aa-value-profiles__picker-empty", text: candidates.length
					? t("aaalice.workspace.valueProfiles.allAdded", "Every sidebar component already has a rule.")
					: t("aaalice.workspace.valueProfiles.noComponents", "No bindable components on the sidebar yet.") });
			}
			body.append(el("section", { className: "aa-value-profiles__surface aa-value-profiles__picker", children: [
				el("div", { className: "aa-value-profiles__surface-head", children: [
					el("div", { className: "aa-value-profiles__surface-title", children: [
						el("strong", null, t("aaalice.workspace.valueProfiles.addRule", "Add rule")),
						badge(t("aaalice.workspace.valueProfiles.availableCount", "{count} available").replace("{count}", String(available.length))),
					] }),
					iconButton({ iconName: "close", label: t("aaalice.common.close", "Close"), variant: "ghost", onClick: () => { closeAddPanel(); render(); } }),
				] }),
				pickerControl,
			] }));
		} else {
			const rulesContainer = el("div", { className: "aa-value-profile-rules" });
			renderRules(profile, rulesContainer, matches);
			const toolbar = el("div", { className: "aa-value-profiles__rule-tools" });
			let filterRules = null;
			if (profile.rules.length) {
				const queryInput = document.createElement("input");
				queryInput.type = "search";
				queryInput.className = "aa-ui-input aa-value-profiles__search-input";
				queryInput.value = ruleSearch;
				queryInput.placeholder = t("aaalice.workspace.valueProfiles.searchRules", "Search rules…");
				queryInput.setAttribute("aria-label", t("aaalice.workspace.valueProfiles.searchRules", "Search rules…"));
				const queryField = el("div", { className: "aa-value-profiles__search", children: [icon("search"), queryInput] });
				const noResults = emptyState({ iconName: "search", description: t("aaalice.workspace.valueProfiles.noRuleMatches", "No rules match this search."), className: "aa-value-profiles__no-results" });
				noResults.hidden = true;
				rulesContainer.append(noResults);
				filterRules = () => {
					ruleSearch = queryInput.value;
					const query = ruleSearch.trim().toLocaleLowerCase();
					let visibleGroups = 0;
					for (const group of rulesContainer.querySelectorAll(".aa-value-profile-group")) {
						let visibleRows = 0;
						for (const row of group.querySelectorAll(".aa-value-profile-rule")) {
							const visible = !query || row.dataset.searchText.includes(query);
							row.hidden = !visible;
							if (visible) visibleRows += 1;
						}
						group.hidden = visibleRows === 0;
						if (visibleRows) visibleGroups += 1;
					}
					noResults.hidden = !query || visibleGroups > 0;
				};
				queryInput.addEventListener("input", filterRules);
				toolbar.append(queryField);
			}
			toolbar.append(button({
				label: t("aaalice.workspace.valueProfiles.addRule", "Add rule"),
				iconName: "add",
				variant: "secondary",
				className: "aa-value-profiles__add",
				onClick: () => { addPanelOpen = true; render(); },
			}));
			const targetPresetBadge = profile.presetName
				? button({
					iconName: "edit",
					label: t("aaalice.workspace.valueProfiles.presetTargetBadge", "Target: {name}").replace("{name}", profile.presetName),
					title: t("aaalice.workspace.valueProfiles.editPresetName", "Click to edit recommended preset name"),
					variant: "ghost",
					size: "sm",
					className: "aa-value-profile-target-badge",
					onClick: editPresetTargetName,
				})
				: button({
					iconName: "add",
					label: t("aaalice.workspace.valueProfiles.setPresetName", "+ Target preset name"),
					title: t("aaalice.workspace.valueProfiles.editPresetName", "Click to edit recommended preset name"),
					variant: "ghost",
					size: "sm",
					className: "aa-value-profile-target-badge aa-value-profile-target-badge--empty",
					onClick: editPresetTargetName,
				});

			body.append(el("section", { className: "aa-value-profiles__surface", children: [
				el("div", { className: "aa-value-profiles__surface-head", children: [
					el("div", { className: "aa-value-profiles__surface-title", children: [
						el("strong", null, t("aaalice.workspace.valueProfiles.rulesTitle", "Rules")),
						el("span", { className: "aa-value-profiles__summary", text: profileSummary }),
						targetPresetBadge,
					].filter(Boolean) }),
					toolbar,
				] }),
				rulesContainer,
			] }));
			filterRules?.();
		}

		const statusText = saveFeedback === "saved"
			? t("aaalice.workspace.valueProfiles.savedLocally", "Changes saved locally; select this profile when duplicating a preset to apply it.")
			: t("aaalice.workspace.valueProfiles.localAutoSave", "Edits save locally automatically; select this profile when duplicating a preset to apply it.");
		footer.append(
			el("div", { className: "aa-value-profiles__save-status", children: [icon("storage"), el("span", null, statusText)] }),
			el("div", { className: "aa-value-profiles__footer-actions", children: [
				button({ label: t("aaalice.common.close", "Close"), variant: "ghost", onClick: () => dialog.close() }),
			] }),
		);
		restoreRulesScroll();
	};

	const duplicateProfile = (profile) => {
		const suffix = t("aaalice.workspace.valueProfiles.copySuffix", "Copy");
		const proposedName = availableValueProfileName(`${profile.name} ${suffix}`, state);
		runtime.askText(t("aaalice.workspace.valueProfiles.duplicate", "Copy as new profile"), t("aaalice.workspace.valueProfiles.name", "Profile name"), proposedName, (name) => {
			resetRulesScroll();
			ruleSearch = "";
			closeAddPanel();
			persist((current) => {
				const next = duplicateValueProfile(current, profile.id, name);
				selectedId = next.profiles[next.profiles.length - 1].id;
				return next;
			});
		});
	};

	const createProfile = () => {
		runtime.askText(t("aaalice.workspace.valueProfiles.create", "New profile"), t("aaalice.workspace.valueProfiles.name", "Profile name"), "", (name) => {
			resetRulesScroll();
			ruleSearch = "";
			persist((current) => {
				const next = createValueProfile(current, name);
				selectedId = next.profiles[next.profiles.length - 1].id;
				return next;
			});
		});
	};

	const editPresetTargetName = () => {
		const profile = selectedProfile();
		if (!profile) return;
		const input = document.createElement("input");
		input.type = "text";
		input.className = "aa-ui-input";
		input.value = profile.presetName || "";
		input.placeholder = t("aaalice.workspace.valueProfiles.diff.presetNamePlaceholder", "Recommended preset name when duplicating (optional)");
		const body = el("div", { className: "aa-value-profiles__prompt-body", children: [
			el("p", { className: "aa-value-profiles__prompt-hint", text: t("aaalice.workspace.valueProfiles.presetTargetHint", "When duplicating a sidebar preset with this profile, this preset name will be suggested automatically. Leave blank to clear.") }),
			input,
		] });
		const footer = el("div", { className: "aa-value-profiles__prompt-footer" });
		const dialog = createDialog({
			title: t("aaalice.workspace.valueProfiles.diff.presetNameLabel", "Recommended preset name"),
			body,
			footer,
			size: "sm",
		});
		const save = (val) => {
			persist((current) => setProfilePresetName(current, profile.id, val.trim()));
			dialog.close();
		};
		footer.append(
			el("div", { children: [
				profile.presetName ? button({
					label: t("aaalice.workspace.valueProfiles.clearPresetName", "Clear"),
					variant: "ghost",
					onClick: () => save(""),
				}) : null,
			].filter(Boolean) }),
			el("div", { className: "aa-value-profiles__footer-actions", children: [
				button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }),
				button({ label: t("aaalice.common.save", "Save"), variant: "primary", onClick: () => save(input.value) }),
			] }),
		);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") { e.preventDefault(); save(input.value); }
		});
		requestAnimationFrame(() => { input.focus(); input.select(); });
	};

	const exportCurrentProfile = () => {
		const profile = selectedProfile();
		if (!profile) return;
		const exported = serializeOverridePresets(state, profile.id);
		const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
		const safeName = profile.name.replace(/[\\/:*?"<>|]/g, "_");
		downloadBlob(blob, `${safeName}.override-preset.json`);
		notify("success", t("aaalice.workspace.valueProfiles.exportSuccess", "Override profile exported."));
	};

	const importProfiles = () => {
		pickFile(".json,application/json", async (file) => {
			try {
				const text = await file.text();
				const parsed = JSON.parse(text);
				const { state: nextState, importedIds } = parseOverridePresetsForImport(parsed, state);
				saveValueProfiles(nextState);
				state = nextState;
				if (importedIds[0]) selectedId = importedIds[0];
				notify("success", t("aaalice.workspace.valueProfiles.importSuccess", "Imported {count} override profile(s).").replace("{count}", String(importedIds.length)));
				render();
			} catch (error) {
				notify("error", `${t("aaalice.workspace.valueProfiles.importFailed", "Import failed:")} ${error.message}`);
			}
		});
	};

	const openDiff = () => {
		const pState = dashboardPresetState();
		const presets = pState?.presets || [];
		const candidates = collectCandidates();
		let currentVals = {};
		try {
			const synthetic = { version: 4, pages: [{ id: "temp", name: "", gridColumns: 12, tone: null, groups: [], items: candidates.map((c, i) => ({ id: `c-${i}`, kind: "control", binding: c.binding })) }] };
			const captured = captureDashboardValues(synthetic, (binding) => runtime.resolve(binding));
			currentVals = captured?.values || {};
		} catch {
			currentVals = {};
		}

		openValueProfileDiffDialog({
			presets,
			currentValues: currentVals,
			candidates,
			onCommit: ({ name, presetName, rules }) => {
				persist((current) => {
					const next = createValueProfile(current, name, presetName);
					const created = next.profiles[next.profiles.length - 1];
					created.rules = rules;
					selectedId = created.id;
					return next;
				});
				notify("success", t("aaalice.workspace.valueProfiles.diffSuccess", "Created override profile “{name}” with {count} rules.").replace("{name}", name).replace("{count}", String(rules.length)));
			},
		});
	};


	render();
	return dialog;
}
