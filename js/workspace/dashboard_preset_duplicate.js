/** Dialog for duplicating a sidebar preset with optional override profile application. */

import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingKey, controlItemBindings } from "../lib/dashboard_model.js";
import { applyDashboardSnapshotPlan, planDashboardPresetApplication } from "../lib/dashboard_preset_runtime.js";
import { availableDashboardPresetName, createDashboardPreset, duplicateDashboardPreset } from "../lib/dashboard_presets.js";
import { matchValueProfileRules } from "../lib/value_profiles.js";
import { formatProfilePayload } from "../lib/value_profile_format.js";
import { loadValueProfiles } from "./sidebar_preferences.js";
import { badge, button, createDialog, el, emptyState, icon, segmentedControl, selectControl } from "../lib/ui.js";

function formatPayload(payload, rule = null, format = "summary") {
	return formatProfilePayload(payload, { valueType: rule?.valueType, t, format });
}

export function openDuplicatePresetDialog({
	preset,
	presetState,
	candidates = [],
	resolve = null,
	onCommitSuccess = null,
	openManageProfiles = null,
} = {}) {
	const profilesState = loadValueProfiles();
	const profiles = profilesState.profiles || [];
	const candidateMap = new Map((candidates || []).map((c) => [c.key, c]));

	let mode = profiles.length > 0 ? "with-profile" : "standard";
	let selectedProfileId = profiles[0]?.id || "";
	let presetName = "";
	let nameEditedManually = false;
	let selectedRuleKeys = new Set();

	const defaultCopyName = availableDashboardPresetName(
		t("aaalice.workspace.dashboardPreset.copyName", "{name} copy").replace("{name}", preset.name),
		presetState,
	);
	presetName = defaultCopyName;

	const body = el("div", { className: "aa-duplicate-preset" });
	const footer = el("div");
	const dialog = createDialog({
		title: t("aaalice.workspace.dashboardPreset.duplicateDialogTitle", "Duplicate preset"),
		body,
		footer,
		size: "md",
		className: "aa-duplicate-preset-dialog",
	});

	let rulesScrollTop = 0;
	const render = () => {
		const prevList = body.querySelector(".aa-duplicate-preset__rules-list");
		if (prevList) rulesScrollTop = prevList.scrollTop;
		body.replaceChildren();
		footer.replaceChildren();

		const selectedProfile = profiles.find((p) => p.id === selectedProfileId) || null;

		// Update suggested name if user hasn't typed custom name
		if (!nameEditedManually) {
			if (mode === "with-profile" && selectedProfile) {
				const suggested = selectedProfile.presetName
					? availableDashboardPresetName(selectedProfile.presetName, presetState)
					: availableDashboardPresetName(`${preset.name} (${selectedProfile.name})`, presetState);
				presetName = suggested;
			} else {
				presetName = defaultCopyName;
			}
		}

		const modeSegmented = segmentedControl({
			value: mode,
			options: [
				{ value: "standard", label: t("aaalice.workspace.dashboardPreset.modeStandard", "Rename copy only") },
				{ value: "with-profile", label: t("aaalice.workspace.dashboardPreset.modeWithProfile", "Apply override profile"), disabled: profiles.length === 0 },
			],
			ariaLabel: t("aaalice.workspace.dashboardPreset.duplicateMode", "Duplicate mode"),
			onChange: (next) => {
				mode = next;
				nameEditedManually = false;
				render();
			},
		});

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.className = "aa-ui-input aa-duplicate-preset__name-input";
		nameInput.value = presetName;
		nameInput.placeholder = t("aaalice.workspace.dashboardPreset.name", "Preset name");
		nameInput.addEventListener("input", () => {
			nameEditedManually = true;
			presetName = nameInput.value;
			updateSubmitBtn();
		});

		const nameField = el("div", { className: "aa-duplicate-preset__field", children: [
			el("label", null, t("aaalice.workspace.dashboardPreset.name", "Preset name")),
			nameInput,
		] });

		const headerSection = el("div", { className: "aa-duplicate-preset__header", children: [
			modeSegmented,
			nameField,
		] });

		body.append(headerSection);

		let profileSection = null;
		if (mode === "with-profile") {
			if (!profiles.length) {
				profileSection = emptyState({
					iconName: "sliders",
					title: t("aaalice.workspace.valueProfiles.emptyTitle", "No adjustment profiles"),
					description: t("aaalice.workspace.valueProfiles.emptyHint", "Create an override profile first to quickly apply your custom parameters."),
				});
			} else {
				const profileSelect = selectControl({
					options: profiles.map((p) => ({ value: p.id, label: p.name })),
					value: selectedProfileId,
					ariaLabel: t("aaalice.workspace.valueProfiles.select", "Adjustment profile"),
					onChange: (val) => {
						selectedProfileId = val;
						nameEditedManually = false;
						selectedRuleKeys.clear();
						render();
					},
				});

				const profileBar = el("div", { className: "aa-duplicate-preset__profile-bar", children: [
					el("div", { className: "aa-duplicate-preset__profile-picker", children: [
						el("label", null, t("aaalice.workspace.valueProfiles.select", "Adjustment profile")),
						profileSelect,
					] }),
					openManageProfiles ? button({
						label: t("aaalice.workspace.valueProfiles.openManage", "Manage profiles"),
						variant: "ghost",
						size: "sm",
						onClick: () => { dialog.close(); openManageProfiles(); },
					}) : null,
				].filter(Boolean) });

				// Match rules against preset & sidebar candidates
				const matches = matchValueProfileRules(selectedProfile?.rules || [], candidates);
				if (selectedRuleKeys.size === 0 && matches.length > 0) {
					selectedRuleKeys = new Set(matches.map((m) => m.rule.key));
				}

				const matchedCount = matches.filter((m) => m.status === "ready").length;
				const selectedBadge = badge(t("aaalice.workspace.valueProfiles.diff.selectedCount", "{count} selected").replace("{count}", String(selectedRuleKeys.size)));
				const rulesHeader = el("div", { className: "aa-duplicate-preset__rules-header", children: [
					el("strong", null, t("aaalice.workspace.valueProfiles.previewTitle", "Parameters to apply")),
					selectedBadge,
				] });

				const ruleRowMap = new Map();
				const toggleRule = (key, explicitState = null) => {
					const item = ruleRowMap.get(key);
					if (!item) return;
					const next = explicitState != null ? explicitState : !selectedRuleKeys.has(key);
					if (next) selectedRuleKeys.add(key);
					else selectedRuleKeys.delete(key);
					item.checkbox.checked = next;
					item.element.classList.toggle("is-selected", next);
					selectedBadge.textContent = t("aaalice.workspace.valueProfiles.diff.selectedCount", "{count} selected").replace("{count}", String(selectedRuleKeys.size));
					updateSubmitBtn();
				};

				const rulesList = el("div", { className: "aa-duplicate-preset__rules-list" });
				if (!matches.length) {
					rulesList.append(emptyState({
						iconName: "sliders",
						description: t("aaalice.workspace.valueProfiles.noRules", "This profile has no rules yet."),
					}));
				} else {
					for (const match of matches) {
						const { rule, status, candidate } = match;
						const isChecked = selectedRuleKeys.has(rule.key);
						const baseVal = preset.values?.[rule.key]?.payload;

						const checkbox = document.createElement("input");
						checkbox.type = "checkbox";
						checkbox.className = "aa-ui-checkbox";
						checkbox.checked = isChecked;
						checkbox.addEventListener("change", () => toggleRule(rule.key, checkbox.checked));

						const statusBadge = status !== "ready" ? badge(
							status === "ambiguous" ? t("aaalice.workspace.valueProfiles.issue.ambiguous", "Ambiguous") : t("aaalice.workspace.valueProfiles.issue.missing", "Not on sidebar"),
							{ className: "is-warning" },
						) : null;

						const ruleRow = el("div", {
							className: `aa-duplicate-preset__rule-row${isChecked ? " is-selected" : ""}${status !== "ready" ? " is-warning" : ""}`,
							children: [
								checkbox,
								el("div", { className: "aa-duplicate-preset__rule-main", children: [
									el("div", { className: "aa-duplicate-preset__rule-info", children: [
										el("strong", { text: rule.label || rule.key, attrs: { title: rule.label || rule.key } }),
										rule.hostLabel ? el("small", { text: rule.hostLabel }) : null,
										statusBadge,
									].filter(Boolean) }),
									el("div", { className: "aa-duplicate-preset__rule-vals", children: [
										el("span", { className: "aa-duplicate-preset__val is-base", attrs: { title: formatPayload(baseVal, rule, "tooltip") }, text: formatPayload(baseVal, rule, "summary") }),
										icon("arrowRight", { className: "aa-duplicate-preset__val-arrow" }),
										el("span", { className: "aa-duplicate-preset__val is-target", attrs: { title: formatPayload(rule.payload, rule, "tooltip") }, text: formatPayload(rule.payload, rule, "summary") }),
									] }),
								] }),
							],
						});
						ruleRow.addEventListener("click", (e) => {
							if (e.target === checkbox) return;
							toggleRule(rule.key);
						});
						ruleRowMap.set(rule.key, { element: ruleRow, checkbox });
						rulesList.append(ruleRow);
					}
				}

				profileSection = el("div", { className: "aa-duplicate-preset__profile-section", children: [
					profileBar,
					rulesHeader,
					rulesList,
				] });
			}
			body.append(profileSection);
		} else {
			const hintText = el("p", { className: "aa-duplicate-preset__hint", text: t("aaalice.workspace.dashboardPreset.standardCopyHint", "Duplicates the entire sidebar layout, groups and current parameter values.") });
			body.append(hintText);
		}

		const submitBtn = button({
			label: mode === "with-profile"
				? t("aaalice.workspace.dashboardPreset.duplicateAndApplyBtn", "Duplicate & apply ({count})").replace("{count}", String(selectedRuleKeys.size))
				: t("aaalice.workspace.dashboardPreset.duplicate", "Duplicate"),
			variant: "primary",
			disabled: !presetName.trim() || (mode === "with-profile" && selectedRuleKeys.size === 0),
			onClick: async () => {
				const finalName = presetName.trim();
				if (!finalName) return;

				if (mode === "standard") {
					dialog.close();
					onCommitSuccess?.({ mode: "standard", name: finalName, presetId: preset.id });
					return;
				}

				// Mode with-profile
				const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
				if (!selectedProfile) return;

				const appliedRules = selectedProfile.rules.filter((r) => selectedRuleKeys.has(r.key));
				dialog.close();
				onCommitSuccess?.({
					mode: "with-profile",
					name: finalName,
					presetId: preset.id,
					rules: appliedRules,
				});
			},
		});

		function updateSubmitBtn() {
			submitBtn.disabled = !presetName.trim() || (mode === "with-profile" && selectedRuleKeys.size === 0);
		}

		footer.append(
			el("div", { className: "aa-duplicate-preset__footer-actions", children: [
				button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }),
				submitBtn,
			] }),
		);

		if (rulesScrollTop) {
			const nextList = body.querySelector(".aa-duplicate-preset__rules-list");
			if (nextList) nextList.scrollTop = rulesScrollTop;
		}
	};

	render();
	return dialog;
}
