/** Pure dialog for comparing two presets and extracting differing controls into an override profile. */

import { t } from "../i18n.js";
import { badge, button, createDialog, el, emptyState, icon, selectControl } from "../lib/ui.js";
import { diffDashboardPresets } from "../lib/value_profiles.js";
import { formatProfilePayload } from "../lib/value_profile_format.js";

function formatPayload(payload, diff = null, format = "summary") {
	return formatProfilePayload(payload, { valueType: diff?.valueType, t, format });
}

export function openValueProfileDiffDialog({
	presets = [],
	currentValues = {},
	candidates = [],
	initialBaseId = null,
	initialTargetId = null,
	onCommit = null,
} = {}) {
	const candidateMap = new Map((candidates || []).map((candidate) => [candidate.key, candidate]));
	const liveOptionValue = "__live__";
	const presetOptions = [
		...presets.map((preset) => ({ value: preset.id, label: preset.name })),
		{ value: liveOptionValue, label: t("aaalice.workspace.valueProfiles.diff.liveValues", "Current sidebar values") },
	];

	let baseId = initialBaseId || presets[0]?.id || liveOptionValue;
	let targetId = initialTargetId || (presets.length > 1 ? presets[1]?.id : liveOptionValue);
	if (baseId === targetId && presetOptions.length > 1) {
		targetId = presetOptions.find((opt) => opt.value !== baseId)?.value || baseId;
	}

	let selectedKeys = new Set();
	let currentDiffs = [];
	let profileName = "";
	let presetName = "";
	let nameUserEdited = false;
	const rowMap = new Map();

	const body = el("div", { className: "aa-value-profile-diff" });
	const footer = el("div");
	const dialog = createDialog({
		title: t("aaalice.workspace.valueProfiles.diff.dialogTitle", "Compare presets to create override profile"),
		body,
		footer,
		size: "md",
		className: "aa-value-profile-diff-dialog",
	});

	const resolvePresetValues = (id) => {
		if (id === liveOptionValue) {
			const values = {};
			for (const [key, entry] of Object.entries(currentValues || {})) {
				if (entry && typeof entry === "object") {
					values[key] = { valueType: entry.valueType || "string", payload: entry.payload };
				}
			}
			return { name: t("aaalice.workspace.valueProfiles.diff.liveValues", "Current sidebar values"), values };
		}
		return presets.find((p) => p.id === id) || { name: "", values: {} };
	};

	const baseSelect = selectControl({
		options: presetOptions,
		value: baseId,
		ariaLabel: t("aaalice.workspace.valueProfiles.diff.basePreset", "Base preset"),
		onChange: (val) => {
			baseId = val;
			selectedKeys.clear();
			updateDiffList();
		},
	});
	const targetSelect = selectControl({
		options: presetOptions,
		value: targetId,
		ariaLabel: t("aaalice.workspace.valueProfiles.diff.targetPreset", "Target preset"),
		onChange: (val) => {
			targetId = val;
			selectedKeys.clear();
			updateDiffList();
		},
	});

	const selectorsBar = el("div", { className: "aa-value-profile-diff__selectors", children: [
		el("div", { className: "aa-value-profile-diff__selector-item", children: [
			el("label", null, t("aaalice.workspace.valueProfiles.diff.baseLabel", "Base preset (Reference)")),
			baseSelect,
		] }),
		el("span", { className: "aa-value-profile-diff__arrow", children: [icon("arrowRight")] }),
		el("div", { className: "aa-value-profile-diff__selector-item", children: [
			el("label", null, t("aaalice.workspace.valueProfiles.diff.targetLabel", "Target preset (Override source)")),
			targetSelect,
		] }),
	] });

	const diffCountEl = el("strong");
	const selectedCountBadge = badge("0 selected");
	const toggleAllBtn = button({
		label: t("aaalice.workspace.valueProfiles.diff.selectAll", "Select all"),
		variant: "ghost",
		size: "sm",
		onClick: () => toggleAll(),
	});

	const headerMeta = el("div", { className: "aa-value-profile-diff__meta", children: [
		el("div", { className: "aa-value-profile-diff__stats", children: [
			diffCountEl,
			selectedCountBadge,
		] }),
		el("div", { className: "aa-value-profile-diff__toggle-all", children: [toggleAllBtn] }),
	] });

	const listContainer = el("div", { className: "aa-value-profile-diff__list" });

	const nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.className = "aa-ui-input";
	nameInput.placeholder = t("aaalice.workspace.valueProfiles.diff.profileNamePlaceholder", "Override profile name");
	nameInput.addEventListener("input", () => {
		nameUserEdited = true;
		profileName = nameInput.value;
		syncSubmitState();
	});

	const presetNameInput = document.createElement("input");
	presetNameInput.type = "text";
	presetNameInput.className = "aa-ui-input";
	presetNameInput.placeholder = t("aaalice.workspace.valueProfiles.diff.presetNamePlaceholder", "Recommended preset name when duplicating (optional)");
	presetNameInput.addEventListener("input", () => {
		presetName = presetNameInput.value;
	});

	const formSection = el("div", { className: "aa-value-profile-diff__form", children: [
		el("div", { className: "aa-value-profile-diff__field", children: [
			el("label", null, t("aaalice.workspace.valueProfiles.name", "Profile name")),
			nameInput,
		] }),
		el("div", { className: "aa-value-profile-diff__field", children: [
			el("label", null, t("aaalice.workspace.valueProfiles.diff.presetNameLabel", "Recommended preset name")),
			presetNameInput,
		] }),
	] });

	body.append(selectorsBar, headerMeta, listContainer, formSection);

	const submitBtn = button({
		label: t("aaalice.workspace.valueProfiles.diff.createBtn", "Create override profile ({count})").replace("{count}", "0"),
		variant: "primary",
		disabled: true,
		onClick: () => {
			const rules = currentDiffs
				.filter((d) => selectedKeys.has(d.key))
				.map((d) => ({
					key: d.key,
					valueType: d.valueType,
					payload: structuredClone(d.targetPayload),
					label: d.label,
					hostLabel: d.hostLabel,
				}));
			onCommit?.({
				name: profileName.trim(),
				presetName: presetName.trim(),
				rules,
			});
			dialog.close();
		},
	});

	footer.append(
		el("div", { className: "aa-value-profile-diff__footer-actions", children: [
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }),
			submitBtn,
		] }),
	);

	function syncSubmitState() {
		const count = selectedKeys.size;
		submitBtn.disabled = count === 0 || !profileName.trim();
		const labelSpan = submitBtn.querySelector(".aa-ui-button__label");
		const text = t("aaalice.workspace.valueProfiles.diff.createBtn", "Create override profile ({count})").replace("{count}", String(count));
		if (labelSpan) labelSpan.textContent = text;
		else submitBtn.textContent = text;
	}

	function updateSelectionSummary() {
		const count = selectedKeys.size;
		selectedCountBadge.textContent = t("aaalice.workspace.valueProfiles.diff.selectedCount", "{count} selected").replace("{count}", String(count));

		const allSelected = currentDiffs.length > 0 && count === currentDiffs.length;
		const toggleText = allSelected
			? t("aaalice.workspace.valueProfiles.diff.deselectAll", "Deselect all")
			: t("aaalice.workspace.valueProfiles.diff.selectAll", "Select all");
		const toggleLabel = toggleAllBtn.querySelector(".aa-ui-button__label");
		if (toggleLabel) toggleLabel.textContent = toggleText;
		else toggleAllBtn.textContent = toggleText;

		syncSubmitState();
	}

	function toggleRow(key, explicitState = null) {
		const row = rowMap.get(key);
		if (!row) return;
		const nextState = explicitState != null ? explicitState : !selectedKeys.has(key);
		if (nextState) selectedKeys.add(key);
		else selectedKeys.delete(key);
		row.checkbox.checked = nextState;
		row.element.classList.toggle("is-selected", nextState);
		updateSelectionSummary();
	}

	function toggleAll() {
		const allSelected = currentDiffs.length > 0 && selectedKeys.size === currentDiffs.length;
		const nextState = !allSelected;
		selectedKeys.clear();
		if (nextState) {
			for (const d of currentDiffs) selectedKeys.add(d.key);
		}
		for (const [, row] of rowMap) {
			row.checkbox.checked = nextState;
			row.element.classList.toggle("is-selected", nextState);
		}
		updateSelectionSummary();
	}

	function updateDiffList() {
		const basePreset = resolvePresetValues(baseId);
		const targetPreset = resolvePresetValues(targetId);
		currentDiffs = diffDashboardPresets(basePreset, targetPreset, candidateMap);
		rowMap.clear();

		if (!nameUserEdited) {
			const targetName = targetPreset.name || t("aaalice.workspace.valueProfiles.diff.targetFallback", "Target");
			profileName = t("aaalice.workspace.valueProfiles.diff.suggestedName", "{name} override").replace("{name}", targetName);
			presetName = targetId !== liveOptionValue ? targetName : "";
			nameInput.value = profileName;
			presetNameInput.value = presetName;
		}

		if (selectedKeys.size === 0 && currentDiffs.length > 0) {
			for (const d of currentDiffs) selectedKeys.add(d.key);
		}

		diffCountEl.textContent = t("aaalice.workspace.valueProfiles.diff.diffCount", "{count} differing parameter(s)").replace("{count}", String(currentDiffs.length));
		toggleAllBtn.hidden = currentDiffs.length === 0;

		listContainer.replaceChildren();
		if (!currentDiffs.length) {
			listContainer.append(emptyState({
				iconName: "statusCheck",
				title: t("aaalice.workspace.valueProfiles.diff.identicalTitle", "No differences found"),
				description: t("aaalice.workspace.valueProfiles.diff.identicalHint", "The parameters in both selected presets match completely."),
			}));
		} else {
			for (const diff of currentDiffs) {
				const isChecked = selectedKeys.has(diff.key);
				const checkbox = document.createElement("input");
				checkbox.type = "checkbox";
				checkbox.className = "aa-ui-checkbox";
				checkbox.checked = isChecked;
				checkbox.setAttribute("aria-label", diff.label);
				checkbox.addEventListener("change", () => toggleRow(diff.key, checkbox.checked));

				const row = el("div", {
					className: `aa-value-profile-diff__row${isChecked ? " is-selected" : ""}`,
					children: [
						checkbox,
						el("div", { className: "aa-value-profile-diff__row-main", children: [
							el("div", { className: "aa-value-profile-diff__row-title", children: [
								el("strong", { text: diff.label, attrs: { title: diff.label } }),
								diff.hostLabel ? el("small", { text: diff.hostLabel, attrs: { title: diff.hostLabel } }) : null,
								diff.pageName ? badge(diff.pageName) : null,
							].filter(Boolean) }),
							el("div", { className: "aa-value-profile-diff__row-values", children: [
								el("span", { className: "aa-value-profile-diff__val is-old", attrs: { title: formatPayload(diff.basePayload, diff, "tooltip") }, text: formatPayload(diff.basePayload, diff, "summary") }),
								icon("arrowRight", { className: "aa-value-profile-diff__val-arrow" }),
								el("span", { className: "aa-value-profile-diff__val is-new", attrs: { title: formatPayload(diff.targetPayload, diff, "tooltip") }, text: formatPayload(diff.targetPayload, diff, "summary") }),
							] }),
						] }),
					],
				});
				row.addEventListener("click", (e) => {
					if (e.target === checkbox) return;
					toggleRow(diff.key);
				});
				rowMap.set(diff.key, { element: row, checkbox });
				listContainer.append(row);
			}
		}

		updateSelectionSummary();
	}

	updateDiffList();
	return dialog;
}
