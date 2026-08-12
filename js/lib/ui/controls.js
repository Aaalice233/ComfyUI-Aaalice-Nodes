/** Form and selection controls composed from shared UI primitives. */

import { el, icon, iconButton } from "./primitives.js";
import { createTooltip } from "./transient_surfaces.js";
import { createAnchoredPopover } from "./overlays.js";

/** Shared collapsed-search trigger with persistent-query state and an accessible query preview. */
export function searchToggleButton({ label, value = "", open = false, disabled = false, className = "", onClick = null } = {}) {
	let query = String(value || "");
	let expanded = Boolean(open);
	const tooltip = createTooltip({ delay: 140 });
	const control = iconButton({ iconName: "search", label, title: null, variant: "ghost", disabled, className: `aa-ui-search-toggle${className ? ` ${className}` : ""}`, onClick });
	const tooltipContent = () => {
		if (!query) return label;
		return el("div", { className: "aa-ui-search-summary", children: [
			el("span", { className: "aa-ui-search-summary__icon", children: [icon("search")] }),
			el("div", { children: [el("strong", null, label), el("span", { className: "aa-ui-search-summary__query", text: query })] }),
		] });
	};
	const sync = () => {
		const hasQuery = Boolean(query.trim());
		control.classList.toggle("has-query", hasQuery);
		control.classList.toggle("is-active", expanded || hasQuery);
		control.dataset.searchState = hasQuery ? "applied" : "empty";
		control.setAttribute("aria-expanded", String(expanded));
		control.setAttribute("aria-label", hasQuery ? `${label}: ${query}` : label);
		control.replaceChildren(icon("search"));
	};
	control.addEventListener("mouseenter", () => tooltip.show(control, tooltipContent, { className: "aa-ui-search-summary-tooltip" }));
	control.addEventListener("mouseleave", tooltip.hide);
	control.addEventListener("focus", () => tooltip.show(control, tooltipContent, { className: "aa-ui-search-summary-tooltip" }));
	control.addEventListener("blur", tooltip.hide);
	control.addEventListener("click", tooltip.hide);
	control.setSearchValue = (nextValue) => { query = String(nextValue || ""); sync(); };
	control.setSearchOpen = (nextOpen) => { expanded = Boolean(nextOpen); sync(); };
	control.destroySearchToggle = tooltip.destroy;
	sync();
	return control;
}

export function segmentedControl({ value, options = [], ariaLabel, onChange = null, className = "", thumbClassName = "", dataAttribute = "value", activeLabelOnly = false } = {}) {
	const root = el("div", { className: `aa-ui-segmented${activeLabelOnly ? " aa-ui-segmented--active-label" : ""}${className ? ` ${className}` : ""}`, attrs: { role: "radiogroup", "aria-label": ariaLabel } });
	root.style.setProperty("--aa-ui-segment-count", String(Math.max(1, options.length)));
	if (activeLabelOnly) root.style.setProperty("--aa-ui-segment-inactive-total", `${Math.max(0, options.length - 1) * 30}px`);
	root.append(el("span", { className: `aa-ui-segmented__thumb${thumbClassName ? ` ${thumbClassName}` : ""}`, attrs: { "aria-hidden": "true" } }));
	const choices = [];
	let disabled = false;
	const syncDisabled = () => choices.forEach((choice, index) => { choice.disabled = disabled || Boolean(options[index].disabled); choice.setAttribute("aria-disabled", String(choice.disabled)); });
	const setValue = (next, emit = false) => {
		value = options.some((option, index) => !choices[index]?.disabled && option.value === next) ? next : options.find((option, index) => !choices[index]?.disabled)?.value;
		const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
		root.dataset.value = value || "";
		root.dataset.index = String(activeIndex);
		root.style.setProperty("--aa-ui-segment-index", String(activeIndex));
		if (activeLabelOnly) root.style.gridTemplateColumns = options.map((_, index) => index === activeIndex ? "minmax(0, 1fr)" : "var(--aa-ui-segment-compact-size)").join(" ");
		for (const choice of choices) {
			const active = choice.dataset[dataAttribute] === value;
			choice.classList.toggle("is-active", active);
			choice.setAttribute("aria-checked", String(active));
		}
		if (emit) onChange?.(value);
	};
	for (const option of options) {
		const choice = el("button", { attrs: { type: "button", role: "radio", "aria-checked": false } });
		if (option.iconName) choice.append(icon(option.iconName), el("span", "aa-ui-segmented__label", option.label));
		else choice.textContent = option.label;
		choice.dataset[dataAttribute] = option.value;
		choice.addEventListener("click", () => { if (!choice.disabled) setValue(option.value, true); });
		choice.addEventListener("keydown", (event) => {
			if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
			event.preventDefault();
			const index = options.findIndex((item) => item.value === value);
			const offset = event.key === "ArrowRight" ? 1 : -1;
			let nextIndex = index;
			for (let step = 0; step < options.length; step++) {
				nextIndex = (nextIndex + offset + options.length) % options.length;
				if (!choices[nextIndex]?.disabled) break;
			}
			if (choices[nextIndex]?.disabled) return;
			setValue(options[nextIndex].value, true);
			choices[nextIndex]?.focus();
		});
		choices.push(choice);
		root.append(choice);
	}
	root.setValue = (next) => setValue(next, false);
	root.setDisabled = (next) => { disabled = Boolean(next); syncDisabled(); };
	root.setOptionDisabled = (optionValue, next) => { const option = options.find((item) => item.value === optionValue); if (!option) return; option.disabled = Boolean(next); syncDisabled(); if (option.disabled && value === optionValue) setValue(null, false); };
	root.setLabel = (label) => root.setAttribute("aria-label", label);
	syncDisabled();
	setValue(value, false);
	return root;
}

export function toggleSwitch({ checked = false, label, disabled = false, onChange = null, className = "" } = {}) {
	const root = el("button", { className: `aa-ui-toggle${className ? ` ${className}` : ""}`, attrs: { type: "button", role: "switch", "aria-label": label } });
	root.append(el("span", { className: "aa-ui-toggle__track", attrs: { "aria-hidden": "true" }, children: [el("span", "aa-ui-toggle__thumb")] }));
	const sync = () => {
		root.classList.toggle("is-on", checked);
		root.setAttribute("aria-checked", String(checked));
		root.disabled = disabled;
	};
	root.addEventListener("click", () => {
		if (disabled) return;
		checked = !checked;
		sync();
		onChange?.(checked);
	});
	root.setChecked = (next) => { checked = Boolean(next); sync(); };
	root.setDisabled = (next) => { disabled = Boolean(next); sync(); };
	root.setLabel = (next) => root.setAttribute("aria-label", next);
	sync();
	return root;
}

export function checkboxControl({ checked = false, label, disabled = false, onChange = null, className = "" } = {}) {
	const root = el("button", { className: `aa-ui-checkbox${className ? ` ${className}` : ""}`, attrs: { type: "button", role: "checkbox", "aria-label": label } });
	root.append(icon("statusCheck"));
	const sync = () => {
		root.classList.toggle("is-checked", checked);
		root.setAttribute("aria-checked", String(checked));
		root.disabled = disabled;
	};
	root.addEventListener("click", () => {
		if (disabled) return;
		checked = !checked;
		sync();
		onChange?.(checked);
	});
	root.setChecked = (next) => { checked = Boolean(next); sync(); };
	root.setDisabled = (next) => { disabled = Boolean(next); sync(); };
	root.setLabel = (next) => root.setAttribute("aria-label", next);
	sync();
	return root;
}

export function multiSelectControl({ options = [], values = [], ariaLabel = "", className = "", disabled = false, onChange = null } = {}) {
	const selected = new Set(values.map(String));
	const root = el("div", { className: `aa-ui-multiselect${className ? ` ${className}` : ""}`, attrs: { role: "group", "aria-label": ariaLabel } });
	const choices = new Map();
	const syncChoice = (choice, value) => {
		const active = selected.has(value);
		choice.classList.toggle("is-selected", active);
		choice.setAttribute("aria-pressed", String(active));
		choice.querySelector(".aa-ui-multiselect__status")?.classList.toggle("is-visible", active);
	};
	for (const option of options) {
		const value = String(option.value);
		const choice = el("button", { className: "aa-ui-multiselect__option", attrs: { ...(option.attrs || {}), type: "button", "aria-pressed": "false" }, children: [
			el("span", { className: "aa-ui-multiselect__status", attrs: { "aria-hidden": "true" }, children: [icon("statusCheck")] }),
			...(option.iconName ? [el("span", { className: "aa-ui-multiselect__leading-icon", attrs: { "aria-hidden": "true" }, children: [icon(option.iconName)] })] : []),
			el("span", "aa-ui-multiselect__label", option.label),
		] });
		choice.disabled = disabled;
		choice.addEventListener("click", () => {
			if (choice.disabled) return;
			if (selected.has(value)) selected.delete(value); else selected.add(value);
			syncChoice(choice, value);
			onChange?.([...selected]);
		});
		choices.set(value, choice); root.append(choice); syncChoice(choice, value);
	}
	root.values = () => [...selected];
	root.setValues = (nextValues) => {
		selected.clear(); for (const value of nextValues || []) selected.add(String(value));
		for (const [value, choice] of choices) syncChoice(choice, value);
	};
	root.setDisabled = (next) => { for (const choice of choices.values()) choice.disabled = Boolean(next); };
	return root;
}

export function selectControl({ options = [], value = "", ariaLabel = "", className = "", disabled = false, onChange = null } = {}) {
	const root = el("div", `aa-ui-select${className ? ` ${className}` : ""}`);
	const control = document.createElement("select"); control.className = "aa-ui-select__native";
	if (ariaLabel) control.setAttribute("aria-label", ariaLabel);
	control.disabled = disabled;
	let open = false;
	const setOpen = (next) => {
		open = Boolean(next) && !control.disabled;
		root.classList.toggle("is-open", open); root.dataset.open = String(open);
		control.setAttribute("aria-expanded", String(open));
	};
	const syncOptionColor = () => {
		const color = control.selectedOptions[0]?.dataset.color || "";
		root.classList.toggle("has-option-color", Boolean(color));
		if (color) root.style.setProperty("--aa-ui-select-option-color", color);
		else root.style.removeProperty("--aa-ui-select-option-color");
	};
	const setOptions = (nextOptions, nextValue = control.value) => {
		control.replaceChildren();
		for (const item of nextOptions) {
			const optionValue = typeof item === "object" ? item.value : item;
			const optionLabel = typeof item === "object" ? item.label : item;
			const option = new Option(String(optionLabel), String(optionValue), false, String(optionValue) === String(nextValue));
			if (typeof item === "object") {
				option.disabled = Boolean(item.disabled);
				if (item.color) { option.dataset.color = String(item.color); option.style.color = String(item.color); }
			}
			control.add(option);
		}
		syncOptionColor();
	};
	setOptions(options, value);
	control.addEventListener("pointerdown", () => setOpen(!open));
	control.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
		}
		else if (event.key === "Enter" || event.key === " " || event.key === "F4" || (event.altKey && event.key === "ArrowDown")) setOpen(true);
	});
	control.addEventListener("blur", () => setOpen(false));
	control.addEventListener("change", () => { setOpen(false); syncOptionColor(); onChange?.(control.value); });
	root.append(control, icon("moveDown", { className: "aa-ui-select__arrow" }));
	root.control = control;
	root.setOptions = (nextOptions, nextValue = control.value) => setOptions(nextOptions, nextValue);
	root.setValue = (next) => { control.value = String(next); syncOptionColor(); };
	root.setDisabled = (next) => { control.disabled = Boolean(next); if (control.disabled) setOpen(false); };
	// 让包装元素像原生表单控件一样可读值，调用方不需要知道内部 select 的存在。
	Object.defineProperty(root, "value", {
		get: () => control.value,
		set: (next) => root.setValue(next),
	});
	return root;
}

export function listboxControl({ options = [], value = "", ariaLabel = "", className = "", disabled = false, onChange = null } = {}) {
	const root = el("div", `aa-ui-listbox-select${className ? ` ${className}` : ""}`);
	const label = el("span", "aa-ui-listbox-select__label");
	const swatch = el("span", "aa-ui-listbox-select__swatch");
	const leadingIcon = el("span", "aa-ui-listbox-select__leading-icon");
	const trigger = el("button", {
		className: "aa-ui-listbox-select__trigger",
		attrs: { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": ariaLabel },
		children: [swatch, leadingIcon, label, icon("moveDown", { className: "aa-ui-listbox-select__arrow" })],
	});
	let choices = [...options];
	let currentValue = String(value);
	let popover = null;

	const selectedOption = () => choices.find((item) => String(typeof item === "object" ? item.value : item) === currentValue) || choices[0];
	const sync = () => {
		const selected = selectedOption();
		const selectedLabel = typeof selected === "object" ? selected?.label : selected;
		const color = typeof selected === "object" ? selected?.color : "";
		const iconName = typeof selected === "object" ? selected?.iconName : "";
		label.textContent = selectedLabel == null ? "" : String(selectedLabel);
		trigger.title = selectedLabel == null ? "" : String(selectedLabel);
		root.classList.toggle("has-option-color", Boolean(color));
		root.classList.toggle("has-option-icon", Boolean(iconName));
		leadingIcon.replaceChildren(...(iconName ? [icon(iconName)] : []));
		if (color) root.style.setProperty("--aa-ui-listbox-color", String(color));
		else root.style.removeProperty("--aa-ui-listbox-color");
	};
	const setOpen = (next) => {
		const open = Boolean(next) && !trigger.disabled;
		root.classList.toggle("is-open", open);
		trigger.setAttribute("aria-expanded", String(open));
	};
	const close = () => { popover?.close(); };
	const open = () => {
		if (popover || trigger.disabled) return;
		setOpen(true);
		popover = createAnchoredPopover({
			anchor: trigger,
			ariaLabel,
			className: "aa-ui-listbox-popover",
			width: Math.max(180, Math.round(trigger.getBoundingClientRect().width)),
			onClose: () => { popover = null; setOpen(false); },
		});
		const list = el("div", { className: "aa-ui-listbox", attrs: { role: "listbox", "aria-label": ariaLabel } });
		for (const item of choices) {
			const optionValue = String(typeof item === "object" ? item.value : item);
			const optionLabel = String(typeof item === "object" ? item.label : item);
			const optionColor = typeof item === "object" ? item.color : "";
			const optionIcon = typeof item === "object" ? item.iconName : "";
			const active = optionValue === currentValue;
			const option = el("button", {
				className: `aa-ui-listbox__option${active ? " is-selected" : ""}${optionColor ? " has-color" : ""}${optionIcon ? " has-icon" : ""}`,
				attrs: { type: "button", role: "option", "aria-selected": String(active), disabled: Boolean(typeof item === "object" && item.disabled) },
				children: [el("span", "aa-ui-listbox__swatch"), el("span", { className: "aa-ui-listbox__leading-icon", children: optionIcon ? [icon(optionIcon)] : [] }), el("span", "aa-ui-listbox__label", optionLabel), icon("statusCheck")],
			});
			if (optionColor) option.style.setProperty("--aa-ui-listbox-option-color", String(optionColor));
			option.addEventListener("click", () => {
				if (option.disabled) return;
				currentValue = optionValue;
				sync(); close(); onChange?.(currentValue);
			});
			option.addEventListener("keydown", (event) => {
				if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
				event.preventDefault();
				const enabled = [...list.querySelectorAll("button:not(:disabled)")];
				const index = enabled.indexOf(option);
				const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
				enabled[nextIndex]?.focus();
			});
			list.append(option);
		}
		popover.root.append(list);
	};
	trigger.addEventListener("click", () => { if (popover) close(); else open(); });
	trigger.addEventListener("keydown", (event) => {
		if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !popover) { event.preventDefault(); open(); }
	});
	root.append(trigger);
	root.control = trigger;
	root.setOptions = (nextOptions, nextValue = currentValue) => { choices = [...nextOptions]; currentValue = String(nextValue); sync(); };
	root.setValue = (next) => { currentValue = String(next); sync(); };
	root.setDisabled = (next) => { trigger.disabled = Boolean(next); if (trigger.disabled) close(); };
	Object.defineProperty(root, "value", { get: () => currentValue });
	trigger.disabled = disabled;
	sync();
	return root;
}

export function field({ label, control, hint = null, error = null, inline = false, className = "" }) {
	const wrapper = el("label", `aa-ui-field${inline ? " aa-ui-field--inline" : ""}${error ? " has-error" : ""}${className ? ` ${className}` : ""}`);
	control?.classList?.add("aa-ui-control");
	const copy = el("span", "aa-ui-field__copy");
	copy.append(el("span", "aa-ui-field__label", label));
	if (hint) copy.append(el("span", "aa-ui-field__hint", hint));
	wrapper.append(copy, control);
	if (error) wrapper.append(el("span", "aa-ui-field__error", error));
	return wrapper;
}

export function badge(text, { className = "" } = {}) {
	return el("span", `aa-ui-badge${className ? ` ${className}` : ""}`, text);
}

export function emptyState({ title = null, description, iconName = null, actions = [], className = "" }) {
	const root = el("div", `aa-ui-empty${className ? ` ${className}` : ""}`);
	if (iconName) root.append(el("div", { className: "aa-ui-empty__icon", children: [icon(iconName)] }));
	if (title) root.append(el("strong", null, title));
	root.append(el("p", null, description));
	if (actions.length) root.append(el("div", { className: "aa-ui-empty__actions", children: actions }));
	return root;
}
