/** Value adjustment profiles: global reusable control-value overrides applied onto the current sidebar. */

import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingKey, controlItemBindings } from "../lib/dashboard_model.js";
import { applyDashboardPresetPlan, captureDashboardValues, planDashboardPresetApplication } from "../lib/dashboard_preset_runtime.js";
import { stableToneIndexes } from "../lib/control_tones.js";
import { createSeedPresetPayload, decodeSeedPresetEntry, SEED_AFTER_GENERATE_MODES } from "../lib/seed_preset.js";
import { badge, button, createDialog, el, emptyState, icon, iconButton, selectControl, toggleSwitch } from "../lib/ui.js";
import { createSearchableSelect } from "../lib/searchable_select.js";
import { createValueProfile, matchValueProfileRules, removeValueProfile, removeValueProfileRule, renameValueProfile, upsertValueProfileRule } from "../lib/value_profiles.js";
import { loadValueProfiles, saveValueProfiles } from "./sidebar_preferences.js";
import { confirmAction } from "./dom_utils.js";

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

function payloadSummary(rule, resolved) {
	if (resolved?.kind === "seed" || (rule.payload && typeof rule.payload === "object" && "control_after_generate" in rule.payload)) {
		const decoded = decodeSeedPresetEntry({ valueType: rule.valueType, payload: rule.payload });
		return decoded.hasBehavior ? `${decoded.value} · ${seedBehaviorLabel(decoded.behavior)}` : String(decoded.value);
	}
	if (typeof rule.payload === "boolean") return rule.payload ? t("aaalice.workspace.valueProfiles.on", "On") : t("aaalice.workspace.valueProfiles.off", "Off");
	if (resolved?.kind === "choice") {
		const hit = choiceOptions(resolved).find((option) => option.value === String(rule.payload));
		return hit ? hit.label : String(rule.payload);
	}
	return String(rule.payload);
}

function buildValueEditor(rule, match, onCommit) {
	const resolved = match.status === "ready" ? match.candidate.resolved : null;
	if (!resolved) return el("span", { className: "aa-value-profile-rule__value", text: payloadSummary(rule, null) });
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
		control.title = payloadSummary(rule, resolved);
		control.control.title = payloadSummary(rule, resolved);
		return control;
	}
	if (typeof rule.payload === "boolean") {
		return el("div", { className: "aa-value-profile-rule__boolean", children: [
			toggleSwitch({ checked: rule.payload, label: rule.label, onChange: (value) => onCommit(value) }),
			el("span", null, payloadSummary(rule, resolved)),
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
	return el("span", { className: "aa-value-profile-rule__value", attrs: { title: payloadSummary(rule, resolved) }, text: payloadSummary(rule, resolved) });
}

function confirmProfileIssues(profileName, issues) {
	return new Promise((resolveDecision) => {
		let settled = false; let dialog;
		const finish = (decision) => { if (settled) return; settled = true; dialog.close(); resolveDecision(decision); };
		const labels = {
			missing: t("aaalice.workspace.valueProfiles.issue.missing", "Not on sidebar"),
			ambiguous: t("aaalice.workspace.valueProfiles.issue.ambiguous", "Ambiguous"),
			incompatible: t("aaalice.workspace.valueProfiles.issue.incompatible", "Incompatible"),
			invalid: t("aaalice.workspace.valueProfiles.issue.invalid", "Invalid value"),
			unset: t("aaalice.workspace.valueProfiles.issue.unset", "No value available"),
			unavailable: t("aaalice.workspace.valueProfiles.issue.unavailable", "Temporarily unavailable"),
			empty: t("aaalice.workspace.valueProfiles.issue.empty", "No options available"),
			error: t("aaalice.common.error", "Error"),
		};
		const rows = issues.map((entry) => el("div", { className: "aa-value-preset-issue", children: [
			el("div", { children: [el("strong", null, entry.label), ...(entry.reason ? [el("small", null, entry.reason)] : [])] }),
			badge(labels[entry.status] || entry.status, { className: "is-warning" }),
		] }));
		const body = el("div", { className: "aa-value-preset-review", children: [
			el("p", null, t("aaalice.workspace.valueProfiles.partialHint", "Some rules cannot be applied safely. Review them before applying the matching rules.")),
			el("div", { className: "aa-value-preset-issues", children: rows }),
		] });
		const footer = el("div", { children: [
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(false) }),
			button({ label: t("aaalice.workspace.valueProfiles.applyMatching", "Apply matching rules"), onClick: () => finish(true) }),
		] });
		dialog = createDialog({ title: profileName, body, footer, size: "sm", className: "aa-value-preset-review-dialog", onRequestClose: () => { finish(false); return false; } });
	});
}

async function applyValueProfile(profile) {
	if (!profile.rules.length) { notify("info", t("aaalice.workspace.valueProfiles.noRules", "This profile has no rules yet.")); return; }
	const candidates = collectCandidates();
	const matches = matchValueProfileRules(profile.rules, candidates);
	const matched = matches.filter((match) => match.status === "ready");
	// 命中卡片展开为主绑定 + 全部联动绑定，复用预设管线的逐目标校验、快照与整体回滚。
	const items = []; const values = {}; const issueLabels = new Map();
	for (const match of matched) {
		const label = match.rule.label || match.rule.key;
		for (const binding of controlItemBindings(match.candidate.item)) {
			const key = bindingKey(binding);
			items.push({ id: `rule-${items.length}`, kind: "control", binding, layout: { row: items.length * 13, column: 0, columnSpan: 6, rowSpan: 13 } });
			values[key] = { valueType: match.rule.valueType, payload: structuredClone(match.rule.payload) };
			issueLabels.set(key, label);
		}
	}
	const synthetic = { version: 4, pages: [{ id: "value-profiles", name: "", gridColumns: 12, tone: null, groups: [], items }] };
	const plan = planDashboardPresetApplication({ dashboard: synthetic, values }, (binding) => runtime.resolve(binding));
	const issues = [
		...matches.filter((match) => match.status !== "ready").map((match) => ({ label: match.rule.label || match.rule.key, status: match.status, reason: "" })),
		...plan.issues.map((entry) => ({ label: issueLabels.get(entry.key) || entry.binding?.controlId || entry.key, status: entry.status, reason: entry.reason || "" })),
	];
	if (issues.length && !await confirmProfileIssues(profile.name, issues)) return;
	if (!plan.ready.length) {
		notify("info", t("aaalice.workspace.valueProfiles.nothingToApply", "No rule can be applied to the current sidebar."));
		return;
	}
	const graph = app.graph; graph?.beforeChange?.();
	try { applyDashboardPresetPlan(plan); }
	catch (error) {
		console.error("[Aaalice] Value profile application failed", error);
		notify("error", t("aaalice.workspace.valueProfiles.applyFailed", "The profile could not be applied; values were restored."));
		return;
	}
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); }
	runtime.scheduleStructuralRender("dashboard");
	runtime.scheduleActiveDashboardPresetAutoSave();
	const appliedCount = new Set(plan.ready.map((entry) => issueLabels.get(entry.key))).size;
	notify("success", t("aaalice.workspace.valueProfiles.applied", "Applied {count} rule(s) from “{name}”.").replace("{count}", String(appliedCount)).replace("{name}", profile.name));
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
				return el("div", {
					className: `aa-value-profile-rule${match.status === "ready" ? "" : " is-unmatched"}`,
					attrs: { "data-search-text": searchText },
					children: [
						el("div", { className: "aa-value-profile-rule__copy", children: [
							el("strong", { attrs: { title: label }, text: label }),
							el("div", { className: "aa-value-profile-rule__meta", children: [duplicateBadge, linkedBadge, statusBadge].filter(Boolean) }),
						] }),
						el("div", { className: "aa-value-profile-rule__control", children: [buildValueEditor(rule, match, (payload) => persist((current) => upsertValueProfileRule(current, profile.id, { ...rule, payload })))] }),
						el("div", { className: "aa-value-profile-rule__actions", children: [updateButton, removeButton].filter(Boolean) }),
					],
				});
			});
			const pageLabels = [...group.pages].map((page) => {
				const pageBadge = badge(page);
				pageBadge.title = page;
				return pageBadge;
			});
			container.append(el("section", {
				className: "aa-value-profile-group",
				attrs: { "data-control-tone": tones.get(group.key) },
				children: [
					el("header", { className: "aa-value-profile-group__header", children: [
						el("span", { className: "aa-value-profile-group__icon", children: [icon("link")] }),
						el("strong", { attrs: { title: group.title }, text: group.title }),
						el("div", { className: "aa-value-profile-group__pages", children: pageLabels }),
						badge(t("aaalice.workspace.valueProfiles.ruleCount", "{count} rules").replace("{count}", String(rows.length)), { className: "aa-value-profile-group__count" }),
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
				actions: [button({ label: t("aaalice.workspace.valueProfiles.create", "New profile"), iconName: "add", onClick: createProfile })],
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
		body.append(el("div", { className: "aa-value-profiles__bar", children: [
			el("div", { className: "aa-value-profiles__profile", children: [
				profileSelect,
				el("span", { className: "aa-value-profiles__summary", text: profileSummary }),
				issueCount ? badge(t("aaalice.workspace.valueProfiles.issueCount", "{count} need attention").replace("{count}", String(issueCount)), { className: "is-warning" }) : null,
			].filter(Boolean) }),
			el("div", { className: "aa-value-profiles__bar-actions", children: [
				iconButton({ iconName: "add", label: t("aaalice.workspace.valueProfiles.create", "New profile"), variant: "ghost", onClick: createProfile }),
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
			] }),
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
			body.append(el("section", { className: "aa-value-profiles__surface", children: [
				el("div", { className: "aa-value-profiles__surface-head", children: [
					el("div", { className: "aa-value-profiles__surface-title", children: [el("strong", null, t("aaalice.workspace.valueProfiles.rulesTitle", "Rules"))] }),
					toolbar,
				] }),
				rulesContainer,
			] }));
			filterRules?.();
		}

		const statusText = saveFeedback === "saved"
			? t("aaalice.workspace.valueProfiles.savedLocally", "Changes saved locally. Apply the profile to update the current sidebar.")
			: t("aaalice.workspace.valueProfiles.localAutoSave", "Edits save locally automatically; only applying the profile changes the current sidebar.");
		footer.append(
			el("div", { className: "aa-value-profiles__save-status", children: [icon("storage"), el("span", null, statusText)] }),
			el("div", { className: "aa-value-profiles__footer-actions", children: [
				button({ label: t("aaalice.common.close", "Close"), variant: "ghost", onClick: () => dialog.close() }),
				button({
					label: t("aaalice.workspace.valueProfiles.applyCount", "Apply {count} rules").replace("{count}", String(profile.rules.length)),
					disabled: profile.rules.length === 0,
					onClick: () => { void applyValueProfile(profile); },
				}),
			] }),
		);
		restoreRulesScroll();
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

	render();
	return dialog;
}
