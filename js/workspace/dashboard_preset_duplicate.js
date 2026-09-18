/** Preview and commit share the same override planner; a failed commit keeps the dialog open. */
import { t } from "../i18n.js";
import { availableDashboardPresetName } from "../lib/dashboard_presets.js";
import { formatProfilePayload } from "../lib/value_profile_format.js";
import { loadValueProfiles } from "./sidebar_preferences.js";
import { badge, button, createDialog, el, field, icon, segmentedControl, selectControl } from "../lib/ui.js";

export function openDuplicatePresetDialog({ preset, presetState, planRules, onCommitSuccess, openManageProfiles } = {}) {
	const profiles = loadValueProfiles().profiles;
	let mode = profiles.length ? "with-profile" : "standard";
	let profileId = profiles[0]?.id || "";
	let selection = null;
	let editedName = false;
	let busy = false;
	let preview = null;
	const body = el("div", { className: "aa-duplicate-preset" });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.dashboardPreset.duplicateDialogTitle", "Duplicate preset"), body, footer, size: "md", className: "aa-duplicate-preset-dialog", onRequestClose: () => !busy });
	const error = el("div", { attrs: { role: "alert", hidden: true } });
	const nameInput = document.createElement("input");
	nameInput.className = "aa-ui-input";
	nameInput.maxLength = 80;
	const list = el("div", { className: "aa-duplicate-preset__rules-list" });
	const summary = el("div", { attrs: { role: "status" } });
	const selectedProfile = () => profiles.find((profile) => profile.id === profileId);
	const selectedRules = () => (selectedProfile()?.rules || []).filter((rule) => selection?.has(rule.key));
	const syncSubmit = () => {
		const count = preview?.matches.filter((match) => match.status === "ready" && selection?.has(match.rule.key)).length || 0;
		submit.disabled = busy || !nameInput.value.trim() || (mode === "with-profile" && !count);
		submit.querySelector(".aa-ui-button__label").textContent = mode === "standard"
			? t("aaalice.workspace.dashboardPreset.duplicate", "Duplicate")
			: t("aaalice.workspace.dashboardPreset.duplicateAndApplyBtn", "Duplicate & apply ({count})").replace("{count}", String(count));
	};
	nameInput.addEventListener("input", () => { editedName = true; syncSubmit(); });
	const modeControl = segmentedControl({ value: mode, ariaLabel: t("aaalice.workspace.dashboardPreset.duplicateMode", "Duplicate mode"), options: [
		{ value: "standard", label: t("aaalice.workspace.dashboardPreset.modeStandard", "Rename copy only") },
		{ value: "with-profile", label: t("aaalice.workspace.dashboardPreset.modeWithProfile", "Apply override profile"), disabled: !profiles.length },
	], onChange: (next) => { mode = next; editedName = false; render(); } });
	const profileControl = selectControl({ value: profileId, options: profiles.map((profile) => ({ value: profile.id, label: profile.name })),
		ariaLabel: t("aaalice.workspace.valueProfiles.select", "Override profile"),
		onChange: (next) => { profileId = next; selection = null; editedName = false; render(); } });
	const profileBar = el("div", { className: "aa-duplicate-preset__profile-bar", children: [profileControl,
		...(openManageProfiles ? [button({ label: t("aaalice.workspace.valueProfiles.openManage", "Manage profiles"), onClick: () => { dialog.close(); openManageProfiles(); } })] : []),
	] });
	const submit = button({ label: t("aaalice.workspace.dashboardPreset.duplicate", "Duplicate"), onClick: async () => {
		if (busy) return;
		busy = true; syncSubmit(); error.hidden = true;
		modeControl.setDisabled?.(true); profileControl.setDisabled(true); nameInput.disabled = true;
		try {
			const result = await onCommitSuccess({ mode, name: nameInput.value.trim(), rules: selectedRules() });
			if (result?.applied === 0) {
				error.textContent = t("aaalice.workspace.valueProfiles.nothingToApply", "No rule can be applied to this preset."); error.hidden = false;
				render();
			} else dialog.close();
		} catch (cause) { error.textContent = String(cause?.message || cause); error.hidden = false; }
		finally { busy = false; modeControl.setDisabled?.(false); profileControl.setDisabled(false); nameInput.disabled = false; syncSubmit(); }
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => { if (!busy) dialog.close(); } }), submit);
	body.append(modeControl, field({ label: t("aaalice.workspace.dashboardPreset.name", "Preset name"), control: nameInput }), profileBar, summary, list, error);
	function render() {
		const profile = selectedProfile();
		if (!editedName) nameInput.value = availableDashboardPresetName(mode === "with-profile" && profile
			? profile.presetName || `${preset.name} (${profile.name})`
			: t("aaalice.workspace.dashboardPreset.copyName", "{name} copy").replace("{name}", preset.name), presetState);
		profileBar.hidden = mode !== "with-profile"; list.hidden = mode !== "with-profile"; summary.hidden = mode !== "with-profile";
		list.replaceChildren(); preview = null;
		if (mode === "with-profile") {
			try { preview = planRules(profile?.rules || []); }
			catch (cause) { error.textContent = String(cause?.message || cause); error.hidden = false; syncSubmit(); return; }
			if (selection === null) selection = new Set((profile?.rules || []).map((rule) => rule.key));
			summary.textContent = t("aaalice.workspace.valueProfiles.previewResult", "Available: {applied}; skipped: {skipped}.").replace("{applied}", String(preview.applied)).replace("{skipped}", String(preview.skipped));
			for (const match of preview.matches) {
				const checkbox = document.createElement("input"); checkbox.type = "checkbox";
				checkbox.checked = selection.has(match.rule.key); checkbox.disabled = match.status !== "ready";
				checkbox.setAttribute("aria-label", match.rule.label || t("aaalice.workspace.valueProfiles.rulesTitle", "Rules"));
				checkbox.addEventListener("change", () => { if (checkbox.checked) selection.add(match.rule.key); else selection.delete(match.rule.key); syncSubmit(); });
				const status = match.status === "ready" ? null : badge(t(`aaalice.workspace.valueProfiles.issue.${match.status}`, t("aaalice.workspace.valueProfiles.skipped", "Skipped")), { className: "is-warning" });
				const format = (value) => formatProfilePayload(value, { valueType: match.rule.valueType, t });
				list.append(el("div", { className: `aa-duplicate-preset__rule-row${match.status === "ready" ? "" : " is-warning"}`, children: [checkbox,
					el("div", { className: "aa-duplicate-preset__rule-main", children: [
						el("div", { className: "aa-duplicate-preset__rule-info", children: [el("strong", null, match.rule.label), el("small", null, match.rule.hostLabel), ...(status ? [status] : [])] }),
						el("div", { className: "aa-duplicate-preset__rule-vals", children: [
							el("span", { className: "aa-duplicate-preset__val is-base", text: format(preset.values?.[match.candidate?.key]?.payload) }),
							icon("arrowRight"), el("span", { className: "aa-duplicate-preset__val is-target", text: format(match.rule.payload) }),
						] }),
					] }),
				] }));
			}
		}
		syncSubmit();
	}
	render();
	return dialog;
}
