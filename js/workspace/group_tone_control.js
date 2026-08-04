import { t } from "../i18n.js";
import { DASHBOARD_GROUP_TONES, groupToneCssValue, isCustomGroupTone, normalizeGroupTone, normalizeHexColor } from "../lib/dashboard_group_tones.js";
import { button, el } from "../lib/ui.js";

const DEFAULT_CUSTOM_COLOR = "#3b82f6";

function toneLabel(tone) { return t(`aaalice.workspace.group.tones.${tone}`, tone); }

export function createGroupToneControl(initialTone) {
	let selectedTone = normalizeGroupTone(initialTone);
	let customDraft = isCustomGroupTone(selectedTone) ? selectedTone : DEFAULT_CUSTOM_COLOR;
	const root = el("div", { className: "aa-dashboard-group-tone-control", attrs: { "data-selected-tone": selectedTone } });
	const palette = el("div", { className: "aa-dashboard-group-tone-palette", attrs: { role: "group", "aria-label": t("aaalice.workspace.group.palette", "Preset group colors") } });
	const choices = new Map();
	const customSwatch = el("span", { className: "aa-dashboard-group-tone-swatch", attrs: { "aria-hidden": "true" } });
	const customPicker = el("input", { className: "aa-dashboard-group-tone-picker", attrs: { type: "color", "aria-label": t("aaalice.workspace.group.customPicker", "Choose a custom group color") } });
	const customHex = el("input", { className: "aa-ui-input aa-dashboard-group-tone-hex", attrs: { type: "text", inputmode: "text", spellcheck: "false", maxlength: "7", "aria-label": t("aaalice.workspace.group.customHex", "Custom group color hex value"), placeholder: "#3b82f6" } });
	const customError = el("span", { className: "aa-dashboard-group-tone-error", attrs: { role: "alert", hidden: "true" } });
	const applyCustom = button({ label: t("aaalice.workspace.group.useCustom", "Use custom color"), variant: "ghost", size: "sm", className: "aa-dashboard-group-tone-apply" });
	const custom = el("div", { className: "aa-dashboard-group-tone-custom", children: [
		el("div", { className: "aa-dashboard-group-tone-custom-label", children: [customSwatch, el("span", null, t("aaalice.workspace.group.custom", "Custom color"))] }),
		customPicker, customHex, applyCustom,
	] });

	function setError(message = "") {
		customError.textContent = message;
		customError.hidden = !message;
		customHex.setAttribute("aria-invalid", message ? "true" : "false");
	}

	function render() {
		root.dataset.selectedTone = selectedTone;
		for (const [tone, choice] of choices) {
			const active = selectedTone === tone;
			choice.classList.toggle("is-active", active);
			choice.setAttribute("aria-pressed", String(active));
		}
		const customActive = isCustomGroupTone(selectedTone);
		custom.classList.toggle("is-active", customActive);
		custom.style.setProperty("--aa-dashboard-tone-choice", customDraft);
		customSwatch.style.setProperty("--aa-dashboard-tone-choice", customDraft);
		customPicker.value = customDraft;
		if (document.activeElement !== customHex) customHex.value = customDraft;
		applyCustom.classList.toggle("is-active", customActive);
	}

	for (const tone of DASHBOARD_GROUP_TONES) {
		const choice = button({ label: toneLabel(tone), variant: "ghost", size: "sm", className: "aa-dashboard-group-tone-choice", ariaLabel: toneLabel(tone), onClick: () => { selectedTone = tone; setError(); render(); } });
		choice.dataset.tone = tone;
		choice.style.setProperty("--aa-dashboard-tone-choice", groupToneCssValue(tone));
		const swatch = el("span", { className: "aa-dashboard-group-tone-swatch", attrs: { "aria-hidden": "true" } });
		choice.prepend(swatch);
		choices.set(tone, choice);
		palette.append(choice);
	}

	const updateDraft = (value, select = false) => {
		const normalized = normalizeHexColor(value);
		if (!normalized) {
			setError(t("aaalice.workspace.group.customInvalid", "Enter a 3- or 6-digit hex color, for example #3b82f6."));
			return;
		}
		customDraft = normalized;
		setError();
		if (select) selectedTone = customDraft;
		render();
	};
	customPicker.addEventListener("input", () => updateDraft(customPicker.value, true));
	customHex.addEventListener("input", () => updateDraft(customHex.value, false));
	applyCustom.addEventListener("click", () => updateDraft(customHex.value, true));
	customHex.addEventListener("blur", () => { if (!customHex.value) customHex.value = customDraft; });

	root.append(palette, custom, customError);
	render();
	return { root, value: () => selectedTone };
}
