/** Value adjustment profiles: global reusable control-value overrides applied onto the current sidebar. */

import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingKey, controlItemBindings } from "../lib/dashboard_model.js";
import { applyDashboardPresetPlan, captureDashboardValues, planDashboardPresetApplication } from "../lib/dashboard_preset_runtime.js";
import { createSeedPresetPayload, decodeSeedPresetEntry, SEED_AFTER_GENERATE_MODES } from "../lib/seed_preset.js";
import { badge, button, createDialog, el, emptyState, field, iconButton, selectControl, toggleSwitch } from "../lib/ui.js";
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

function collectCandidates() {
	const model = runtime.dashboard(); const seen = new Map();
	for (const page of model?.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control") continue;
		for (const binding of controlItemBindings(item)) {
			const key = bindingKey(binding);
			if (seen.has(key)) continue;
			let resolved = null;
			try { resolved = runtime.resolve(binding); } catch { resolved = null; }
			if (resolved?.status !== "ok" || resolved.presettable === false) continue;
			const label = binding === item.binding ? runtime.controlTitle(item, resolved) : String(resolved.label || binding.controlId);
			seen.set(key, { binding, key, valueType: binding.valueType, label, hostLabel: hostTitleOf(resolved.node), resolved });
		}
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
		return selectControl({
			options: choiceOptions(resolved), value: String(rule.payload),
			ariaLabel: rule.label,
			onChange: (value) => onCommit(value),
		});
	}
	if (typeof rule.payload === "boolean") return toggleSwitch({ checked: rule.payload, label: payloadSummary(rule, resolved), onChange: (value) => onCommit(value) });
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
	return el("span", { className: "aa-value-profile-rule__value", text: payloadSummary(rule, resolved) });
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
	const synthetic = { version: 4, pages: [{ id: "value-profiles", name: "", gridColumns: 12, tone: null, groups: [], items: matched.map((match, index) => ({ id: `rule-${index}`, kind: "control", binding: match.candidate.binding, layout: { row: index * 13, column: 0, columnSpan: 6, rowSpan: 13 } })) }] };
	const values = {};
	for (const match of matched) values[match.candidate.key] = { valueType: match.rule.valueType, payload: structuredClone(match.rule.payload) };
	const plan = planDashboardPresetApplication({ dashboard: synthetic, values }, (binding) => runtime.resolve(binding));
	const issueLabels = new Map(matched.map((match) => [match.candidate.key, match.rule.label]));
	const issues = [
		...matches.filter((match) => match.status !== "ready").map((match) => ({ label: match.rule.label || match.rule.key, status: match.status, reason: "" })),
		...plan.issues.map((entry) => ({ label: issueLabels.get(entry.key) || entry.binding?.controlId || entry.key, status: entry.status, reason: entry.reason || "" })),
	];
	if (issues.length && !await confirmProfileIssues(profile.name, issues)) return;
	if (!plan.ready.length) { notify("info", t("aaalice.workspace.valueProfiles.nothingToApply", "No rule can be applied to the current sidebar.")); return; }
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
	notify("success", t("aaalice.workspace.valueProfiles.applied", "Applied {count} rule(s) from “{name}”.").replace("{count}", String(plan.ready.length)).replace("{name}", profile.name));
}

export function openValueProfiles() {
	let state = loadValueProfiles();
	let selectedId = state.profiles[0]?.id || null;
	let addPanelOpen = false;

	const body = el("div", { className: "aa-value-profiles" });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.valueProfiles.title", "Adjustment profiles"), body, footer, size: "md", className: "aa-value-profiles-dialog" });

	const selectedProfile = () => state.profiles.find((profile) => profile.id === selectedId) || null;
	const persist = (mutator) => {
		try { state = mutator(state); saveValueProfiles(state); }
		catch (error) { notify("error", error.message); }
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

	const renderRules = (profile, container) => {
		const candidates = collectCandidates();
		const matches = matchValueProfileRules(profile.rules, candidates);
		if (!matches.length) {
			container.append(emptyState({
				iconName: "sliders",
				description: t("aaalice.workspace.valueProfiles.emptyRules", "No rules yet. Add a control below and its current value becomes the target."),
			}));
			return;
		}
		for (const match of matches) {
			const { rule } = match;
			const statusBadge = match.status === "ready" ? null : badge(match.status === "ambiguous" ? t("aaalice.workspace.valueProfiles.issue.ambiguous", "Ambiguous") : t("aaalice.workspace.valueProfiles.issue.missing", "Not on sidebar"), { className: "is-warning" });
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
			container.append(el("div", {
				className: `aa-value-profile-rule${match.status === "ready" ? "" : " is-unmatched"}`,
				children: [
					el("div", { className: "aa-value-profile-rule__head", children: [
						el("div", { className: "aa-value-profile-rule__copy", children: [
							el("strong", null, rule.label || rule.key),
							rule.hostLabel ? el("small", null, rule.hostLabel) : null,
						].filter(Boolean) }),
						statusBadge,
						updateButton,
						iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", onClick: () => persist((current) => removeValueProfileRule(current, profile.id, rule.key)) }),
					].filter(Boolean) }),
					buildValueEditor(rule, match, (payload) => persist((current) => upsertValueProfileRule(current, profile.id, { ...rule, payload }))),
				],
			}));
		}
	};

	const render = () => {
		body.replaceChildren();
		footer.replaceChildren();
		const profile = selectedProfile() || state.profiles[0] || null;
		selectedId = profile?.id || null;
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
		const profileSelect = selectControl({
			options: state.profiles.map((entry) => ({ value: entry.id, label: entry.name })),
			value: profile.id,
			ariaLabel: t("aaalice.workspace.valueProfiles.select", "Adjustment profile"),
			onChange: (value) => { selectedId = value; addPanelOpen = false; render(); },
		});
		body.append(el("div", { className: "aa-value-profiles__bar", children: [
			profileSelect,
			iconButton({ iconName: "add", label: t("aaalice.workspace.valueProfiles.create", "New profile"), variant: "ghost", onClick: createProfile }),
			iconButton({ iconName: "edit", label: t("aaalice.workspace.valueProfiles.rename", "Rename profile"), variant: "ghost", onClick: () => {
				runtime.askText(t("aaalice.workspace.valueProfiles.rename", "Rename profile"), t("aaalice.workspace.valueProfiles.name", "Profile name"), profile.name, (name) => persist((current) => renameValueProfile(current, profile.id, name)));
			} }),
			iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", onClick: async () => {
				if (!await confirmAction(t("aaalice.workspace.valueProfiles.deleteConfirm", "Delete adjustment profile “{name}”?").replace("{name}", profile.name), { title: t("aaalice.common.delete", "Delete"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
				persist((current) => {
					const next = removeValueProfile(current, profile.id);
					selectedId = next.profiles[0]?.id || null;
					return next;
				});
			} }),
		] }));
		const rulesContainer = el("div", { className: "aa-value-profile-rules" });
		renderRules(profile, rulesContainer);
		body.append(rulesContainer);
		if (addPanelOpen) {
			const candidates = collectCandidates();
			const picker = createSearchableSelect({
				options: candidates.map((candidate) => ({
					value: candidate.key,
					label: candidate.label,
					description: candidate.hostLabel,
					badge: profile.rules.some((rule) => rule.key === candidate.key) ? t("aaalice.workspace.valueProfiles.ruleExists", "Added") : null,
				})),
				ariaLabel: t("aaalice.workspace.valueProfiles.addRule", "Add rule"),
				searchPlaceholder: t("aaalice.workspace.valueProfiles.searchControl", "Search components…"),
				emptyLabel: t("aaalice.workspace.valueProfiles.noControlMatches", "No components match the search."),
				onChange: (key) => addRule(candidates.find((candidate) => candidate.key === key)),
			});
			body.append(el("div", { className: "aa-value-profiles__picker", children: [
				field({ label: t("aaalice.workspace.valueProfiles.addRule", "Add rule"), control: picker }),
			] }));
			requestAnimationFrame(() => picker.focusSearch());
		}
		body.append(el("div", { className: "aa-value-profiles__actions", children: [
			button({ label: addPanelOpen ? t("aaalice.common.close", "Close") : t("aaalice.workspace.valueProfiles.addRule", "Add rule"), iconName: addPanelOpen ? "close" : "add", variant: "ghost", size: "sm", onClick: () => { addPanelOpen = !addPanelOpen; render(); } }),
		] }));
		footer.append(
			button({ label: t("aaalice.common.close", "Close"), variant: "ghost", onClick: () => dialog.close() }),
			button({ label: t("aaalice.workspace.valueProfiles.apply", "Apply to current sidebar"), onClick: () => { void applyValueProfile(profile); } }),
		);
	};

	const createProfile = () => {
		runtime.askText(t("aaalice.workspace.valueProfiles.create", "New profile"), t("aaalice.workspace.valueProfiles.name", "Profile name"), "", (name) => persist((current) => {
			const next = createValueProfile(current, name);
			selectedId = next.profiles[next.profiles.length - 1].id;
			return next;
		}));
	};

	render();
	return dialog;
}
