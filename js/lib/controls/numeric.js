/** Shared slider and seed control renderer. */

import { button, createAnchoredPopover, el, icon, iconButton } from "../ui.js";
import { controlView } from "./contract.js";

const handledNumericWheels = new WeakSet();
const SEED_BEHAVIORS = Object.freeze(["fixed", "increment", "decrement", "randomize"]);
const SEED_BEHAVIOR_ICONS = Object.freeze({
	fixed: "lock",
	increment: "add",
	decrement: "subtract",
	randomize: "shuffle",
});

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
	input.destroy = () => { if (!done) { done = true; cleanup(); } };
	input.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Enter") commit(); else if (event.key === "Escape") cancel(); });
	input.addEventListener("blur", commit); view.addEventListener("wheel", commitOnWheel, true);
	setTimeout(() => { input.focus(); input.select(); }, 0); return input;
}

function normalizeSeedBehavior(value) {
	return SEED_BEHAVIORS.includes(value) ? value : "randomize";
}

function seedBehaviorCopy(labels, behavior) {
	const fallback = {
		fixed: { label: "Fixed value", description: "Keep the current seed unchanged" },
		increment: { label: "Increment", description: "Add 1 after each workflow run" },
		decrement: { label: "Decrement", description: "Subtract 1 after each workflow run" },
		randomize: { label: "Randomize", description: "Choose a new random seed after each workflow run" },
	}[behavior];
	const copy = labels?.[behavior];
	return {
		label: String(copy?.label || fallback.label),
		description: String(copy?.description || fallback.description),
	};
}

function setSeedBehaviorState(element, behavior) {
	element.dataset.seedBehavior = normalizeSeedBehavior(behavior);
}

export function createSeedModeControl({ behavior = "randomize", labels = {}, ariaLabelPrefix = "", className = "", onChange = null } = {}) {
	let current = normalizeSeedBehavior(behavior);
	let popover = null;
	const control = iconButton({ iconName: SEED_BEHAVIOR_ICONS[current], label: "", variant: "ghost", className: `aa-control-seed-mode${className ? ` ${className}` : ""}` });
	control.setAttribute("aria-haspopup", "dialog");

	const sync = () => {
		const copy = seedBehaviorCopy(labels, current);
		const label = ariaLabelPrefix ? `${ariaLabelPrefix}: ${copy.label}` : copy.label;
		control.replaceChildren(icon(SEED_BEHAVIOR_ICONS[current]));
		setSeedBehaviorState(control, current);
		control.setAttribute("aria-label", label);
		control.setAttribute("title", `${copy.label}: ${copy.description}`);
		control.setAttribute("aria-expanded", String(Boolean(popover)));
	};
	const close = () => popover?.close();
	const select = (next) => {
		const normalized = normalizeSeedBehavior(next);
		if (normalized !== current) {
			current = normalized;
			sync();
			onChange?.(current);
		}
		close();
	};
	const open = () => {
		if (popover) { close(); return; }
		popover = createAnchoredPopover({
			anchor: control,
			ariaLabel: labels?.header || "Seed behavior after each workflow run",
			className: "aa-control-seed-popover",
			width: 360,
			onClose: () => { popover = null; sync(); },
		});
		const header = el("div", "aa-control-seed-popover__header", labels?.header || "After each workflow run, update the seed using:");
		const list = el("div", { className: "aa-control-seed-options", attrs: { role: "radiogroup", "aria-label": labels?.header || "Seed behavior" } });
		const options = [];
		for (const mode of SEED_BEHAVIORS) {
			const copy = seedBehaviorCopy(labels, mode);
			const selected = mode === current;
			const option = button({
				label: copy.label,
				variant: "ghost",
				className: `aa-control-seed-option${selected ? " is-selected" : ""}`,
				onClick: () => select(mode),
			});
			option.setAttribute("role", "radio");
			option.setAttribute("aria-checked", String(selected));
			option.dataset.seedBehavior = mode;
			option.replaceChildren(
				el("span", { className: "aa-control-seed-option__icon", attrs: { "aria-hidden": "true" }, children: [icon(SEED_BEHAVIOR_ICONS[mode])] }),
				el("span", { className: "aa-control-seed-option__copy", children: [
					el("strong", null, copy.label),
					el("span", null, copy.description),
				] }),
				el("span", { className: "aa-control-seed-option__radio", attrs: { "aria-hidden": "true" }, children: selected ? [el("span", "aa-control-seed-option__radio-dot")] : [] }),
			);
			options.push(option);
			list.append(option);
		}
		list.addEventListener("keydown", (event) => {
			if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
			event.preventDefault();
			const index = options.indexOf(document.activeElement);
			const next = event.key === "Home" ? 0
				: event.key === "End" ? options.length - 1
					: (Math.max(0, index) + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
			options[next]?.focus();
		});
		popover.root.append(header, list);
		popover.reposition();
		sync();
	};
	control.addEventListener("click", open);
	control.setBehavior = (next) => {
		const normalized = normalizeSeedBehavior(next);
		if (normalized === current) return;
		current = normalized;
		close();
		sync();
	};
	control.getBehavior = () => current;
	control.currentLabel = () => seedBehaviorCopy(labels, current).label;
	control.destroy = close;
	sync();
	return control;
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
	let current = 0; let gestureOpen = false; let gestureTimer = 0; let inlineEditor = null;
	const normalize = (value) => { const clamped = Math.min(max, Math.max(min, Number(value))); return Number.isFinite(clamped) ? Number(clamped.toFixed(precision)) : current; };
	const sync = (value) => {
		current = normalize(value); valueButton.textContent = String(current); valueButton.setAttribute("aria-valuenow", String(current)); range.value = String(current);
		if (hasRange) range.style.setProperty("--aa-shared-range-progress", `${Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100))}%`);
	};
	const begin = () => { if (!gestureOpen) { gestureOpen = true; port.beginGesture(); } };
	const finish = () => { clearTimeout(gestureTimer); gestureTimer = 0; if (!gestureOpen) return; gestureOpen = false; port.endGesture(current); flash(); };
	const preview = (value) => { const next = normalize(value); if (next === current) return false; sync(next); port.preview(next); return true; };
	// 提交成功的一次性脉冲反馈；拖拽/滚轮预览不触发。
	const flash = () => {
		valueButton.classList.remove("is-committed"); void valueButton.offsetWidth; valueButton.classList.add("is-committed");
		// 提交伴随看板重建,旧元素的动画随之销毁;重建后的新元素需要补放脉冲。
		requestAnimationFrame(() => {
			if (valueButton.isConnected) return;
			const next = document.querySelector(`[data-aaalice-value-field="true"][data-parameter-id="${CSS.escape(spec.id)}"]`);
			if (next) { next.classList.remove("is-committed"); void next.offsetWidth; next.classList.add("is-committed"); }
		});
	};
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
	// 侧边栏等宿主可关闭滚轮调值，避免吞掉页面 Scroll Surface 的滚动。
	if (spec.presentation?.wheelAdjust !== false) {
		root.addEventListener("wheel", adjust, { passive: false }); valueButton.addEventListener("wheel", adjust, { passive: false });
	}
	valueButton.addEventListener("click", () => {
		inlineEditor = createNumericEditor(valueButton, { value: current, min, max, step, onCommit: (next) => { inlineEditor = null; sync(next); port.commit(current); flash(); } });
	});
	valueButton.addEventListener("keydown", (event) => {
		if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) return;
		event.preventDefault(); const direction = event.key === "ArrowUp" || event.key === "PageUp" ? 1 : -1;
		const scale = event.key.startsWith("Page") || event.shiftKey ? 10 : 1; const next = normalize(current + direction * step * scale);
		if (next !== current) { sync(next); port.commit(next); flash(); }
	});
	root.addEventListener("blur", finish, true); valueButton.addEventListener("blur", finish);
	const accessories = [valueButton];
	let seedModeControl = null;
	if (spec.kind === "seed") {
		const seedBehavior = normalizeSeedBehavior(options.control_after_generate);
		seedModeControl = createSeedModeControl({
			behavior: seedBehavior,
			labels: spec.labels,
			ariaLabelPrefix: spec.label,
			onChange: (next) => { setSeedBehaviorState(root, next); port.setSeedBehavior(next); },
		});
		accessories.push(seedModeControl);
		setSeedBehaviorState(root, seedBehavior);
	}
	sync(spec.value); root.append(range);
	return controlView({
		root,
		headerAccessories: accessories,
		kind: spec.kind,
		headerOnly: !hasRange,
		update: (next) => {
			sync(next.value);
			if (seedModeControl && next.options?.control_after_generate) {
				seedModeControl.setBehavior(next.options.control_after_generate);
				setSeedBehaviorState(root, next.options.control_after_generate);
			}
		},
		destroy: () => {
			clearTimeout(gestureTimer); gestureTimer = 0;
			inlineEditor?.destroy?.(); inlineEditor = null;
			if (gestureOpen) { gestureOpen = false; port.endGesture(current); }
			seedModeControl?.destroy?.();
		},
	});
}
