/** Shared select and compact segmented choice renderer. */

import { createTooltip, el, selectControl } from "../ui.js";
import { stableToneIndexes } from "../control_tones.js";
import { controlView } from "./contract.js";

function optionValues(spec) {
	const source = spec.options.values || spec.options.options || [];
	return source.map((item) => typeof item === "object" ? item : String(item));
}

function optionValue(item) { return String(typeof item === "object" ? item.value : item); }

function renderSegmented(spec, port, options) {
	const root = el("div", { className: "aa-control aa-control-choice aa-control-choice-segmented", attrs: { role: "radiogroup", "aria-label": spec.label } });
	const indicator = el("span", { className: "aa-control-choice-indicator", attrs: { "aria-hidden": "true" } });
	const optionTooltip = createTooltip({ delay: 140 });
	const choices = [];
	const tones = stableToneIndexes(options.map(optionValue));
	let current = String(spec.value ?? "");
	const position = (choice, animate = true) => {
		if (!choice?.isConnected) return;
		indicator.classList.toggle("is-initializing", !animate);
		indicator.style.width = `${choice.offsetWidth}px`; indicator.style.height = `${choice.offsetHeight}px`;
		indicator.style.transform = `translate3d(${choice.offsetLeft}px, ${choice.offsetTop}px, 0)`;
		indicator.classList.add("is-ready");
		if (!animate) requestAnimationFrame(() => indicator.classList.remove("is-initializing"));
	};
	const sync = (animate = true) => {
		for (const choice of choices) {
			const active = choice.dataset.value === current;
			choice.classList.toggle("is-active", active); choice.setAttribute("aria-checked", String(active));
		}
		const activeChoice = choices.find((choice) => choice.classList.contains("is-active"));
		if (activeChoice) indicator.dataset.controlTone = activeChoice.dataset.controlTone;
		position(activeChoice, animate);
	};
	root.append(indicator);
	for (const option of options) {
		const value = optionValue(option); const text = typeof option === "object" ? option.label : option;
		const fullLabel = String(text);
		const choice = el("button", { className: "aa-control-choice-option", attrs: { type: "button", role: "radio", "aria-label": fullLabel, "data-value": value, "data-control-tone": String(tones.get(value)) }, children: [fullLabel] });
		choice.addEventListener("mouseenter", () => optionTooltip.show(choice, fullLabel, { contentMode: "text" }));
		choice.addEventListener("mouseleave", optionTooltip.hide);
		choice.addEventListener("focus", () => optionTooltip.show(choice, fullLabel, { contentMode: "text", immediate: true }));
		choice.addEventListener("blur", optionTooltip.hide);
		choice.addEventListener("click", () => { if (current === value) return; current = value; sync(); port.commit(value, { redraw: false }); });
		choices.push(choice); root.append(choice);
	}
	requestAnimationFrame(() => sync(false));
	const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => sync(false)) : null;
	observer?.observe(root);
	return controlView({
		root,
		kind: "choice",
		update: (next) => { current = String(next.value ?? ""); sync(false); },
		destroy: () => { observer?.disconnect(); optionTooltip.destroy(); },
	});
}

export function renderChoiceControl(spec, port) {
	const options = optionValues(spec);
	if (spec.presentation.segmented !== false && options.length > 0 && options.length <= 4) return renderSegmented(spec, port, options);
	const current = String(spec.value ?? "");
	const unset = spec.value == null;
	const valid = options.some((option) => optionValue(option) === current);
	const renderedOptions = unset ? [{ label: spec.labels.select || "Select…", value: "", disabled: true }, ...options]
		: !valid && current ? [{ label: `${current} ⚠`, value: current }, ...options] : options;
	const root = selectControl({ options: renderedOptions, value: current, ariaLabel: spec.label, className: "aa-control aa-control-choice aa-control-choice-select", onChange: (next) => port.commit(next) });
	root.classList.toggle("is-invalid", !valid && Boolean(current));
	return controlView({ root, kind: "choice", update: (next) => root.setValue(next.value) });
}
