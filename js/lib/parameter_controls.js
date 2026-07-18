/** Shared DOM controls used by ParameterPanel's node surface and editor. */
import { el, icon, iconButton, selectControl } from "./ui.js";
import { formatTagListValue, parseTagListValue } from "./taglist_value.js";

function numericInput(parameter, onChange, ariaLabel = "") {
	const input = document.createElement("input");
	input.type = "number";
	if (ariaLabel) input.setAttribute("aria-label", ariaLabel);
	input.value = String(parameter.value ?? 0);
	input.min = String(parameter.config?.min ?? 0);
	input.max = String(parameter.config?.max ?? Number.MAX_SAFE_INTEGER);
	input.step = String(parameter.config?.step ?? 1);
	input.addEventListener("change", () => {
		const value = Number(input.value);
		if (!Number.isFinite(value)) return;
		parameter.value = Math.min(Number(input.max), Math.max(Number(input.min), value));
		onChange?.(parameter.value);
	});
	return input;
}

export function createNumericEditor(anchor, { value, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, onCommit }) {
	if (!anchor || anchor.ownerDocument?.querySelector(".aaalice-parameter-inline-editor")) return null;
	const rect = anchor.getBoundingClientRect();
	const view = anchor.ownerDocument.defaultView || window;
	const root = anchor.closest(".aaalice-pcp-node-root");
	const anchorStyle = view.getComputedStyle(anchor);
	let editorBackground = anchorStyle.backgroundColor;
	let editorColor = anchorStyle.color;
	let editorAccent = anchorStyle.borderTopColor;
	let editorAccentSoft = "transparent";
	if (root) {
		const probe = anchor.ownerDocument.createElement("span");
		Object.assign(probe.style, {
			position: "fixed",
			visibility: "hidden",
			pointerEvents: "none",
			background: "var(--aaalice-node-editor)",
			color: "var(--aaalice-node-value)",
			border: "1px solid var(--aaalice-node-accent)",
			outline: "1px solid var(--aaalice-node-accent-soft)",
		});
		root.append(probe);
		const resolved = view.getComputedStyle(probe);
		editorBackground = resolved.backgroundColor;
		editorColor = resolved.color;
		editorAccent = resolved.borderTopColor;
		editorAccentSoft = resolved.outlineColor;
		probe.remove();
	}
	const input = anchor.ownerDocument.createElement("input");
	input.className = "aaalice-parameter-inline-editor aaalice-pcp-inline-input";
	input.type = "number";
	input.inputMode = "decimal";
	input.min = String(min);
	input.max = String(max);
	input.step = String(step);
	input.value = String(value);
	input.style.setProperty("--aaalice-inline-editor-bg", editorBackground);
	input.style.setProperty("--aaalice-inline-editor-color", editorColor);
	input.style.setProperty("--aaalice-inline-editor-accent", editorAccent);
	input.style.setProperty("--aaalice-inline-editor-accent-soft", editorAccentSoft);
	Object.assign(input.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: "10000" });
	anchor.classList.add("is-editing");
	anchor.ownerDocument.body.append(input);
	let done = false;
	const cleanup = () => {
		view.removeEventListener("wheel", commitOnWheel, true);
		anchor.classList.remove("is-editing");
		input.remove();
	};
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
		if (done) return;
		done = true;
		const raw = Number(input.value);
		const next = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : Number(value);
		cleanup();
		onCommit?.(next);
		restoreFocus();
	};
	const cancel = () => { if (!done) { done = true; cleanup(); restoreFocus(); } };
	const commitOnWheel = () => commit();
	input.addEventListener("keydown", (event) => {
		event.stopPropagation();
		if (event.key === "Enter") commit();
		else if (event.key === "Escape") cancel();
	});
	input.addEventListener("blur", commit);
	view.addEventListener("wheel", commitOnWheel, true);
	setTimeout(() => { input.focus(); input.select(); }, 0);
	return input;
}

export function createSeedModeControl({ locked = false, lockedLabel = "Seed locked; click to unlock", unlockedLabel = "Seed unlocked; click to lock", ariaLabelPrefix = "", className = "", onChange = null } = {}) {
	let current = Boolean(locked);
	const control = iconButton({ iconName: current ? "lock" : "unlock", label: current ? lockedLabel : unlockedLabel, variant: "ghost", className: `aa-shared-seed-mode${className ? ` ${className}` : ""}` });
	const sync = () => {
		const label = current ? lockedLabel : unlockedLabel;
		control.replaceChildren(icon(current ? "lock" : "unlock"));
		control.classList.toggle("is-locked", current); control.classList.toggle("is-unlocked", !current);
		control.setAttribute("aria-label", ariaLabelPrefix ? `${ariaLabelPrefix}: ${label}` : label); control.setAttribute("title", label); control.setAttribute("aria-pressed", String(current));
	};
	control.addEventListener("click", () => { current = !current; sync(); onChange?.(current); });
	control.setLocked = (next) => { current = Boolean(next); sync(); };
	control.isLocked = () => current;
	control.currentLabel = () => current ? lockedLabel : unlockedLabel;
	sync(); return control;
}

function createSwitchControl(value, { onChange, ariaLabel = "" } = {}) {
	const control = el("button", `aaalice-shared-switch${value ? " active" : ""}`);
	control.type = "button";
	control.setAttribute("aria-pressed", String(Boolean(value)));
	if (ariaLabel) control.setAttribute("aria-label", ariaLabel);
	control.append(el("span", { className: "aaalice-shared-switch-track", children: [el("span", "aaalice-shared-switch-thumb")] }));
	control.addEventListener("click", () => {
		const next = !control.classList.contains("active");
		control.classList.toggle("active", next);
		control.setAttribute("aria-pressed", String(next));
		onChange?.(next);
	});
	return control;
}

export function createParameterControl({ parameter, onChange, labels = {} } = {}) {
	if (!parameter) return document.createElement("span");
	const config = parameter.config || {};
	const parameterLabel = labels.input || labels.select || labels.switch || parameter.name || parameter.id || "Parameter";
	if (parameter.param_type === "seed" || parameter.param_type === "slider") return numericInput(parameter, onChange, parameterLabel);
	if (parameter.param_type === "switch") return createSwitchControl(parameter.value, { onChange: (value) => { parameter.value = value; onChange?.(value); }, ariaLabel: labels.switch || parameter.name });
	if (["dropdown", "enum"].includes(parameter.param_type)) return selectControl({ options: config.options || [], value: parameter.value, onChange: (value) => { parameter.value = value; onChange?.(value); }, ariaLabel: labels.select || parameter.name });
	const isTagList = parameter.param_type === "taglist";
	const input = isTagList || parameter.config?.multiline ? document.createElement("textarea") : document.createElement("input");
	input.value = isTagList ? formatTagListValue(parameter.value) : parameter.value ?? "";
	if (isTagList) input.placeholder = labels.taglistPlaceholder || "One tag per line, or separate tags with commas";
	input.setAttribute("aria-label", labels.input || parameter.name || "Parameter");
	input.addEventListener("change", () => {
		parameter.value = isTagList ? parseTagListValue(input.value) : input.value;
		onChange?.(parameter.value);
	});
	return input;
}
