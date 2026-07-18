/** Shared slider and seed control renderer. */

import { el, icon, iconButton } from "../ui.js";
import { controlView } from "./contract.js";

const handledNumericWheels = new WeakSet();

function hasFiniteOption(options, key) {
	return options?.[key] !== null && options?.[key] !== "" && Number.isFinite(Number(options?.[key]));
}

function finiteOption(options, key, fallback) {
	const value = Number(options?.[key]);
	return options?.[key] !== null && options?.[key] !== "" && Number.isFinite(value) ? value : fallback;
}

function precisionForStep(step) {
	const text = String(step).toLowerCase();
	return Math.min(12, Math.max(Number(text.split("e-")[1] || 0), text.split(".")[1]?.split("e")[0]?.length || 0));
}

export function createNumericEditor(anchor, { value, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, onCommit }) {
	if (!anchor || anchor.ownerDocument?.querySelector(".aaalice-parameter-inline-editor")) return null;
	const rect = anchor.getBoundingClientRect();
	const view = anchor.ownerDocument.defaultView || window;
	const host = anchor.closest(".aaalice-pcp-node-root, .aa-workspace");
	const anchorStyle = view.getComputedStyle(anchor);
	let editorBackground = anchorStyle.backgroundColor;
	let editorColor = anchorStyle.color;
	let editorAccent = anchorStyle.borderTopColor;
	let editorAccentSoft = "transparent";
	if (host) {
		const probe = anchor.ownerDocument.createElement("span");
		Object.assign(probe.style, {
			position: "fixed", visibility: "hidden", pointerEvents: "none",
			background: "var(--aa-control-field, var(--aa-ui-control))",
			color: "var(--aa-control-text, var(--aa-ui-text))",
			border: "1px solid var(--aa-control-accent, var(--aa-ui-accent))",
			outline: "1px solid var(--aa-control-accent-soft, var(--aa-ui-accent-soft))",
		});
		host.append(probe);
		const resolved = view.getComputedStyle(probe);
		editorBackground = resolved.backgroundColor; editorColor = resolved.color;
		editorAccent = resolved.borderTopColor; editorAccentSoft = resolved.outlineColor;
		probe.remove();
	}
	const input = anchor.ownerDocument.createElement("input");
	input.className = "aaalice-parameter-inline-editor aa-control-inline-number";
	input.type = "number"; input.inputMode = "decimal";
	input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
	input.style.setProperty("--aaalice-inline-editor-bg", editorBackground);
	input.style.setProperty("--aaalice-inline-editor-color", editorColor);
	input.style.setProperty("--aaalice-inline-editor-accent", editorAccent);
	input.style.setProperty("--aaalice-inline-editor-accent-soft", editorAccentSoft);
	Object.assign(input.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: "10000" });
	anchor.classList.add("is-editing"); anchor.ownerDocument.body.append(input);
	let done = false;
	const commitOnWheel = () => commit();
	const cleanup = () => { view.removeEventListener("wheel", commitOnWheel, true); anchor.classList.remove("is-editing"); input.remove(); };
	const restoreFocus = () => {
		let target = anchor;
		if (!target.isConnected && anchor.dataset?.parameterId) {
			const candidates = [...anchor.ownerDocument.querySelectorAll("[data-parameter-id]")]
				.filter((candidate) => candidate.dataset.parameterId === anchor.dataset.parameterId
					&& candidate.matches?.("button, input, select, textarea, [tabindex]"));
			target = candidates.find((candidate) => candidate.dataset.aaaliceValueField === "true") || candidates[0];
		}
		if (!target?.isConnected) return;
		try { target.focus({ preventScroll: true }); } catch { target.focus(); }
	};
	const commit = () => {
		if (done) return; done = true;
		const raw = Number(input.value); const next = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : Number(value);
		cleanup(); onCommit?.(next); restoreFocus();
	};
	const cancel = () => { if (!done) { done = true; cleanup(); restoreFocus(); } };
	input.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Enter") commit(); else if (event.key === "Escape") cancel(); });
	input.addEventListener("blur", commit); view.addEventListener("wheel", commitOnWheel, true);
	setTimeout(() => { input.focus(); input.select(); }, 0); return input;
}

export function createSeedModeControl({ locked = false, lockedLabel = "Seed locked; click to unlock", unlockedLabel = "Seed unlocked; click to lock", ariaLabelPrefix = "", className = "", onChange = null } = {}) {
	let current = Boolean(locked);
	const control = iconButton({ iconName: current ? "lock" : "unlock", label: current ? lockedLabel : unlockedLabel, variant: "ghost", className: `aa-control-seed-mode${className ? ` ${className}` : ""}` });
	const sync = () => {
		const label = current ? lockedLabel : unlockedLabel;
		control.replaceChildren(icon(current ? "lock" : "unlock"));
		control.classList.toggle("is-locked", current); control.classList.toggle("is-unlocked", !current);
		control.setAttribute("aria-label", ariaLabelPrefix ? `${ariaLabelPrefix}: ${label}` : label);
		control.setAttribute("title", label); control.setAttribute("aria-pressed", String(current));
	};
	control.addEventListener("click", () => { current = !current; sync(); onChange?.(current); });
	control.setLocked = (next) => { current = Boolean(next); sync(); };
	control.isLocked = () => current; control.currentLabel = () => current ? lockedLabel : unlockedLabel;
	sync(); return control;
}

export function renderNumericControl(spec, port) {
	const options = spec.options || {};
	const min = finiteOption(options, "min", Number.MIN_SAFE_INTEGER);
	const max = finiteOption(options, "max", Number.MAX_SAFE_INTEGER);
	const step = Math.max(Number.EPSILON, finiteOption(options, "step", 1));
	const precision = precisionForStep(step);
	const bounded = hasFiniteOption(options, "min") && hasFiniteOption(options, "max") && max > min;
	const hasRange = spec.kind === "numeric" && bounded;
	const root = el("div", `aa-control aa-control-numeric${hasRange ? "" : " is-unbounded"}`);
	const range = document.createElement("input");
	range.type = "range"; range.className = "aa-shared-range aa-control-numeric-range";
	range.min = String(min); range.max = String(max); range.step = String(step); range.setAttribute("aria-label", spec.label);
	const valueButton = el("button", { className: "aa-control-numeric-value", attrs: { type: "button", role: "spinbutton", "aria-label": spec.label, "aria-valuemin": String(min), "aria-valuemax": String(max), "data-parameter-id": spec.id, "data-aaalice-value-field": "true" } });
	let current = 0; let gestureOpen = false; let gestureTimer = 0;
	const normalize = (value) => { const clamped = Math.min(max, Math.max(min, Number(value))); return Number.isFinite(clamped) ? Number(clamped.toFixed(precision)) : current; };
	const sync = (value) => {
		current = normalize(value); valueButton.textContent = String(current); valueButton.setAttribute("aria-valuenow", String(current)); range.value = String(current);
		if (hasRange) range.style.setProperty("--aa-shared-range-progress", `${Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100))}%`);
	};
	const begin = () => { if (!gestureOpen) { gestureOpen = true; port.beginGesture(); } };
	const finish = () => { clearTimeout(gestureTimer); gestureTimer = 0; if (!gestureOpen) return; gestureOpen = false; port.endGesture(current); };
	const preview = (value) => { const next = normalize(value); if (next === current) return false; sync(next); port.preview(next); return true; };
	if (hasRange) {
		range.addEventListener("pointerdown", begin);
		range.addEventListener("input", () => { begin(); preview(range.value); });
		range.addEventListener("change", finish); range.addEventListener("pointerup", finish); range.addEventListener("pointercancel", finish);
	} else range.hidden = true;
	const adjust = (event) => {
		if (handledNumericWheels.has(event)) return;
		handledNumericWheels.add(event);
		if (!event.deltaY) return; begin();
		const delta = step * (event.shiftKey ? 10 : 1) * (event.deltaY < 0 ? 1 : -1);
		if (preview(current + delta)) event.preventDefault();
		clearTimeout(gestureTimer); gestureTimer = setTimeout(finish, 160);
	};
	root.addEventListener("wheel", adjust, { passive: false }); valueButton.addEventListener("wheel", adjust, { passive: false });
	valueButton.addEventListener("click", () => createNumericEditor(valueButton, { value: current, min, max, step, onCommit: (next) => { sync(next); port.commit(current); } }));
	valueButton.addEventListener("keydown", (event) => {
		if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) return;
		event.preventDefault(); const direction = event.key === "ArrowUp" || event.key === "PageUp" ? 1 : -1;
		const scale = event.key.startsWith("Page") || event.shiftKey ? 10 : 1; const next = normalize(current + direction * step * scale);
		if (next !== current) { sync(next); port.commit(next); }
	});
	root.addEventListener("blur", finish, true); valueButton.addEventListener("blur", finish);
	const accessories = [valueButton];
	if (spec.kind === "seed") accessories.push(createSeedModeControl({
		locked: options.control_after_generate !== "randomize",
		lockedLabel: spec.labels.locked, unlockedLabel: spec.labels.unlocked, ariaLabelPrefix: spec.label,
		onChange: (locked) => { root.classList.toggle("is-locked", locked); port.setSeedLocked(locked); },
	}));
	root.classList.toggle("is-locked", spec.kind === "seed" && options.control_after_generate !== "randomize");
	sync(spec.value); root.append(range);
	return controlView({ root, headerAccessories: accessories, kind: spec.kind, headerOnly: !hasRange, update: (next) => sync(next.value), destroy: () => clearTimeout(gestureTimer) });
}
