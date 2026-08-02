import { t } from "../i18n.js";
import { normalizeNumericRange } from "../lib/dashboard_model.js";
import { updateItem } from "../lib/dashboard_commands.js";
import { resolvedControlSpec } from "../lib/controls/specs.js";
import { button, createDialog, el, field } from "../lib/ui.js";

let runtime = null;
export function configureNumericRange(dependencies) { runtime = dependencies; }

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

const updateDashboard = (callback) => runtime.updateDashboard(callback);

function finiteNumericOption(options, key) {
	if (options?.[key] == null || options?.[key] === "") return null;
	const value = Number(options[key]); return Number.isFinite(value) ? value : null;
}

export function isConfigurableNumericControl(resolved) {
	return resolved?.status === "ok" && resolvedControlSpec(resolved).kind === "numeric" && ["integer", "float"].includes(resolved.numericDomain);
}

export function numericRangeForControl(resolved, range) {
	if (!isConfigurableNumericControl(resolved) || range == null) return null;
	let normalized;
	try { normalized = normalizeNumericRange(range); }
	catch { return null; }
	if (resolved.numericDomain === "integer" && ![normalized.min, normalized.max, normalized.step].every(Number.isInteger)) return null;
	const sourceMin = finiteNumericOption(resolved.options, "min"); const sourceMax = finiteNumericOption(resolved.options, "max");
	if ((sourceMin != null && normalized.min < sourceMin) || (sourceMax != null && normalized.max > sourceMax)) return null;
	return normalized;
}

function defaultNumericRange(resolved) {
	const integer = resolved.numericDomain === "integer"; const current = Number(resolved.value);
	const sourceMin = finiteNumericOption(resolved.options, "min"); const sourceMax = finiteNumericOption(resolved.options, "max");
	let min = sourceMin ?? Math.min(0, (Number.isFinite(current) ? current : 0) - (integer ? 10 : 1));
	let max = sourceMax ?? Math.max(1, (Number.isFinite(current) ? current : 0) + (integer ? 10 : 1));
	if (integer) { min = Math.floor(min); max = Math.ceil(max); }
	if (max <= min) max = min + (integer ? 1 : 1);
	let step = finiteNumericOption(resolved.options, "step");
	if (!(step > 0) || step > max - min) step = integer ? 1 : Math.min(0.1, max - min);
	if (integer) step = Math.max(1, Math.round(step));
	return { min, max, step };
}

function validateNumericRangeForControl(resolved, candidate) {
	let range;
	try { range = normalizeNumericRange(candidate); }
	catch { return { ok: false, reason: "invalid" }; }
	if (resolved.numericDomain === "integer" && ![range.min, range.max, range.step].every(Number.isInteger)) return { ok: false, reason: "integer" };
	const sourceMin = finiteNumericOption(resolved.options, "min"); const sourceMax = finiteNumericOption(resolved.options, "max");
	if ((sourceMin != null && range.min < sourceMin) || (sourceMax != null && range.max > sourceMax)) return { ok: false, reason: "source" };
	return { ok: true, range };
}

export function openNumericRangeSettings(item, resolved, ownerElement = null) {
	const range = numericRangeForControl(resolved, item.numericRange) || defaultNumericRange(resolved);
	const sourceMin = finiteNumericOption(resolved.options, "min"); const sourceMax = finiteNumericOption(resolved.options, "max");
	const sourceStep = finiteNumericOption(resolved.options, "step"); const integer = resolved.numericDomain === "integer";
	const makeInput = (value) => {
		const input = document.createElement("input"); input.type = "number"; input.inputMode = integer ? "numeric" : "decimal"; input.value = String(value); input.step = integer ? "1" : "any"; return input;
	};
	const minInput = makeInput(range.min); const maxInput = makeInput(range.max); const stepInput = makeInput(range.step); stepInput.min = "0";
	if (sourceMin != null) { minInput.min = String(sourceMin); maxInput.min = String(sourceMin); }
	if (sourceMax != null) { minInput.max = String(sourceMax); maxInput.max = String(sourceMax); }
	const sourceCopy = message("aaalice.workspace.numericRange.nodeDefaults", "Node defaults: {min} to {max}, step {step}", {
		min: sourceMin ?? t("aaalice.workspace.numericRange.notSet", "not set"),
		max: sourceMax ?? t("aaalice.workspace.numericRange.notSet", "not set"),
		step: sourceStep ?? t("aaalice.workspace.numericRange.notSet", "not set"),
	});
	const error = el("p", { className: "aa-numeric-range-error", attrs: { role: "alert" } }); error.hidden = true;
	const body = el("div", { className: "aa-numeric-range-dialog-body", children: [
		el("p", "aa-numeric-range-hint", t("aaalice.workspace.numericRange.hint", "Only this sidebar control changes. The node parameter definition and current value stay unchanged.")),
		el("p", "aa-numeric-range-source", sourceCopy),
		el("div", { className: "aa-numeric-range-grid", children: [
			field({ label: t("aaalice.workspace.numericRange.minimum", "Minimum"), control: minInput }),
			field({ label: t("aaalice.workspace.numericRange.maximum", "Maximum"), control: maxInput }),
			field({ label: t("aaalice.workspace.numericRange.step", "Step"), control: stepInput }),
		] }),
		error,
	] });
	const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.numericRange.title", "Numeric range"), body, footer, size: "sm", className: "aa-numeric-range-dialog", returnFocus: ownerElement, initialFocus: minInput });
	const showError = (reason) => {
		const key = reason === "integer" ? "integerError" : reason === "source" ? "sourceError" : "invalidError";
		const fallback = reason === "integer" ? "This integer parameter requires whole-number limits and step."
			: reason === "source" ? "Keep the slider limits inside the node parameter range."
				: "Enter finite limits with maximum greater than minimum and a positive step no larger than the range.";
		error.textContent = t(`aaalice.workspace.numericRange.${key}`, fallback); error.hidden = false;
	};
	if (item.numericRange) footer.append(button({ label: t("aaalice.workspace.numericRange.reset", "Use node defaults"), variant: "secondary", className: "aa-numeric-range-reset", onClick: () => {
		updateDashboard((current) => updateItem(current, item.id, (target) => { delete target.numericRange; })); dialog.close();
	} }));
	footer.append(
		button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }),
		button({ label: t("aaalice.common.save", "Save"), onClick: () => {
			const validation = validateNumericRangeForControl(resolved, { min: minInput.value, max: maxInput.value, step: stepInput.value });
			if (!validation.ok) { showError(validation.reason); return; }
			updateDashboard((current) => updateItem(current, item.id, (target) => { target.numericRange = validation.range; })); dialog.close();
		} }),
	);
}
