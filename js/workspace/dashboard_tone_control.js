import { t } from "../i18n.js";
import { DASHBOARD_TONES, dashboardToneCssValue, isCustomDashboardTone, normalizeDashboardTone, normalizeHexColor } from "../lib/dashboard_color_system.js";
import { button, el } from "../lib/ui.js";

const DEFAULT_CUSTOM_COLOR = "#3b82f6";

function toneLabel(tone) {
	return t(`aaalice.workspace.color.tones.${tone}`, t(`aaalice.workspace.group.tones.${tone}`, tone));
}

function colorLabel(key, fallback, legacyKey) {
	return t(`aaalice.workspace.color.${key}`, legacyKey ? t(`aaalice.workspace.group.${legacyKey}`, fallback) : fallback);
}

export function createDashboardToneControl(initialTone) {
	let selectedTone = normalizeDashboardTone(initialTone);
	let customDraft = isCustomDashboardTone(selectedTone) ? selectedTone : DEFAULT_CUSTOM_COLOR;
	const root = el("div", { className: "aa-dashboard-tone-control", attrs: { "data-selected-tone": selectedTone } });
	const palette = el("div", { className: "aa-dashboard-tone-palette", attrs: { role: "group", "aria-label": colorLabel("palette", "Preset colors", "palette") } });
	const choices = new Map();
	const customSwatch = el("span", { className: "aa-dashboard-tone-swatch", attrs: { "aria-hidden": "true" } });
	const customPicker = el("input", { className: "aa-dashboard-tone-picker", attrs: { type: "color", "aria-label": colorLabel("customPicker", "Choose a custom color", "customPicker") } });
	const customHex = el("input", { className: "aa-ui-input aa-dashboard-tone-hex", attrs: { type: "text", inputmode: "text", spellcheck: "false", maxlength: "7", "aria-label": colorLabel("customHex", "Custom color hex value", "customHex"), placeholder: "#3b82f6" } });
	const customError = el("span", { className: "aa-dashboard-tone-error", attrs: { role: "alert", hidden: "true" } });
	const applyCustom = button({ label: colorLabel("useCustom", "Use custom color", "useCustom"), variant: "ghost", size: "sm", className: "aa-dashboard-tone-apply" });
	const custom = el("div", { className: "aa-dashboard-tone-custom", children: [
		el("div", { className: "aa-dashboard-tone-custom-label", children: [customSwatch, el("span", null, colorLabel("custom", "Custom color", "custom"))] }),
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
		const customActive = isCustomDashboardTone(selectedTone);
		custom.classList.toggle("is-active", customActive);
		custom.style.setProperty("--aa-dashboard-tone-choice", customDraft);
		customSwatch.style.setProperty("--aa-dashboard-tone-choice", customDraft);
		customPicker.value = customDraft;
		if (document.activeElement !== customHex) customHex.value = customDraft;
		applyCustom.classList.toggle("is-active", customActive);
	}

	for (const tone of DASHBOARD_TONES) {
		const choice = button({ label: toneLabel(tone), variant: "ghost", size: "sm", className: "aa-dashboard-tone-choice", ariaLabel: toneLabel(tone), onClick: () => { selectedTone = tone; setError(); render(); } });
		choice.dataset.tone = tone;
		choice.style.setProperty("--aa-dashboard-tone-choice", dashboardToneCssValue(tone));
		const swatch = el("span", { className: "aa-dashboard-tone-swatch", attrs: { "aria-hidden": "true" } });
		choice.prepend(swatch);
		choices.set(tone, choice);
		palette.append(choice);
	}

	const updateDraft = (value, select = false) => {
		const normalized = normalizeHexColor(value);
		if (!normalized) {
			setError(colorLabel("customInvalid", "Enter a 3- or 6-digit hex color, for example #3b82f6.", "customInvalid"));
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
