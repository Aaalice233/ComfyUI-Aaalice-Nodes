/** Dashboard control rendering over provider-resolved value adapters. */

import { createImageUploadControl } from "./image_upload.js";
import { createNumericEditor, createSeedModeControl } from "./parameter_controls.js";
import { el, selectControl, toggleSwitch } from "./ui.js";

function createNumericControl(resolved, { labels = {}, onInput, onCommit } = {}) {
	const options = resolved.options || {}; const initial = Number(resolved.value);
	const hasFiniteOption = (key) => options[key] !== null && options[key] !== "" && Number.isFinite(Number(options[key]));
	const min = hasFiniteOption("min") ? Number(options.min) : Number.MIN_SAFE_INTEGER;
	const max = hasFiniteOption("max") ? Number(options.max) : Number.MAX_SAFE_INTEGER;
	const step = Number.isFinite(Number(options.step)) && Number(options.step) > 0 ? Number(options.step) : 1;
	const bounded = hasFiniteOption("min") && hasFiniteOption("max") && max > min;
	const hasRange = bounded && resolved.control?.param_type !== "seed";
	const root = el("div", `aa-workspace-numeric-control${hasRange ? "" : " is-unbounded"}`);
	root.dataset.controlKind = "number";
	const range = document.createElement("input"); range.type = "range"; range.className = "aa-shared-range"; range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(initial);
	range.setAttribute("aria-label", resolved.label);
	const valueButton = el("button", { className: "aa-workspace-numeric-value", attrs: { type: "button", role: "spinbutton", "aria-label": resolved.label, "aria-valuemin": String(min), "aria-valuemax": String(max) } });
	let current = Number.isFinite(initial) ? initial : 0; let gestureOpen = false; let gestureTimer = 0;
	const stepText = String(step).toLowerCase(); const exponent = Number(stepText.split("e-")[1] || 0);
	const precision = Math.min(12, Math.max(exponent, stepText.split(".")[1]?.split("e")[0]?.length || 0));
	const normalize = (value) => {
		const clamped = Math.min(max, Math.max(min, Number(value)));
		return Number.isFinite(clamped) ? Number(clamped.toFixed(precision)) : current;
	};
	const sync = (value) => {
		current = normalize(value); valueButton.textContent = String(current); valueButton.setAttribute("aria-valuenow", String(current));
		if (hasRange) {
			range.value = String(current);
			const progress = ((current - min) / (max - min)) * 100;
			range.style.setProperty("--aa-shared-range-progress", `${Math.min(100, Math.max(0, progress))}%`);
		}
	};
	const beginGesture = () => {
		if (gestureOpen) return;
		resolved.node?.graph?.beforeChange?.(); gestureOpen = true;
	};
	const finishGesture = () => {
		clearTimeout(gestureTimer); gestureTimer = 0;
		if (!gestureOpen) return;
		gestureOpen = false; resolved.flushValue?.(); resolved.node?.graph?.afterChange?.(); resolved.node?.graph?.setDirtyCanvas?.(true, true); onCommit?.(current);
	};
	const preview = (value) => {
		const next = normalize(value); if (next === current) return false;
		sync(next); resolved.setValue(next, { transaction: false, transient: true }); onInput?.(next); return true;
	};
	if (hasRange) {
		range.addEventListener("pointerdown", beginGesture);
		range.addEventListener("input", () => { beginGesture(); preview(Number(range.value)); });
		range.addEventListener("change", finishGesture);
		range.addEventListener("pointerup", finishGesture);
		range.addEventListener("pointercancel", finishGesture);
	} else range.hidden = true;
	const adjustOnWheel = (event) => {
		if (!event.deltaY) return;
		beginGesture(); const delta = step * (event.shiftKey ? 10 : 1) * (event.deltaY < 0 ? 1 : -1);
		if (preview(current + delta)) event.preventDefault();
		clearTimeout(gestureTimer); gestureTimer = setTimeout(finishGesture, 160);
	};
	root.addEventListener("wheel", adjustOnWheel, { passive: false });
	valueButton.addEventListener("wheel", adjustOnWheel, { passive: false });
	valueButton.addEventListener("click", () => createNumericEditor(valueButton, { value: current, min, max, step, onCommit: (next) => {
		const value = normalize(next); sync(value); resolved.setValue(value); onCommit?.(value);
	} }));
	valueButton.addEventListener("keydown", (event) => {
		if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) return;
		event.preventDefault(); const direction = event.key === "ArrowUp" || event.key === "PageUp" ? 1 : -1;
		const scale = event.key.startsWith("Page") || event.shiftKey ? 10 : 1; const next = normalize(current + direction * step * scale);
		if (next === current) return; sync(next); resolved.setValue(next); onCommit?.(next);
	});
	root.addEventListener("blur", finishGesture, true); valueButton.addEventListener("blur", finishGesture);
	root.headerAccessories = [valueButton];
	if (resolved.control?.param_type === "seed" && resolved.setSeedLocked) root.headerAccessories.push(createSeedModeControl({
		locked: resolved.options?.control_after_generate !== "randomize",
		lockedLabel: labels.seedLocked || "Seed locked; click to unlock",
		unlockedLabel: labels.seedUnlocked || "Seed unlocked; click to lock",
		ariaLabelPrefix: resolved.label,
		className: "aa-workspace-seed-mode",
		onChange: (locked) => { resolved.setSeedLocked(locked); onCommit?.(current); },
	}));
	root.hidden = !hasRange;
	root.dataset.headerOnly = String(!hasRange);
	sync(current); root.append(range, valueButton); return root;
}

function createImageControl(resolved, { labels = {}, onCommit, onError, onSuccess } = {}) {
	const root = createImageUploadControl({
		reference: resolved.value,
		label: resolved.label,
		emptyLabel: labels.imageNone || "Choose image",
		dropLabel: labels.imageDrop || "Drop image here",
		clearLabel: labels.imageClear || "Clear selected image",
		className: "aa-workspace-image-control",
		onSelected: (next) => { resolved.setValue(next); onSuccess?.(next); onCommit?.(next); },
		onClear: () => { resolved.setValue(null); onCommit?.(null); },
		onError,
	});
	root.dataset.controlKind = "image";
	return root;
}

export function createControlElement(resolved, { labels = {}, onInput, onCommit, onError, onSuccess } = {}) {
	if (resolved?.status !== "ok") return null;
	const { value, options = {} } = resolved;
	let control;
	if (resolved.control?.param_type === "image") {
		control = createImageControl(resolved, { labels, onCommit, onError, onSuccess });
	} else if (resolved.control?.param_type === "taglist" || Array.isArray(value)) {
		control = document.createElement("input"); control.type = "text"; control.value = (value || []).join(", ");
		control.addEventListener("change", () => { const next = control.value.split(",").map((item) => item.trim()).filter(Boolean); resolved.setValue(next); onCommit?.(next); });
	} else if (Array.isArray(options.values) || Array.isArray(options.options)) {
		control = selectControl({ options: options.values || options.options, value, ariaLabel: resolved.label, className: "aa-workspace-enum-control", onChange: (next) => { resolved.setValue(next); onCommit?.(next); } });
		control.dataset.controlKind = "enum";
	} else if (typeof value === "boolean") {
		control = toggleSwitch({ checked: value, label: resolved.label, className: "aa-workspace-boolean-control", onChange: (next) => { resolved.setValue(next); onCommit?.(next); } });
		control.dataset.controlKind = "boolean";
	} else if (typeof value === "number") {
		control = createNumericControl(resolved, { labels, onInput, onCommit });
	} else {
		control = document.createElement("input"); control.type = "text"; control.value = String(value ?? "");
		control.addEventListener("input", () => onInput?.(control.value));
		control.addEventListener("change", () => { resolved.setValue(control.value); onCommit?.(control.value); });
	}
	if (!control.getAttribute("aria-label") && !control.querySelector?.("[aria-label]")) control.setAttribute("aria-label", resolved.label);
	control.classList.add("aa-workspace-control-input");
	return control;
}
