/** Multi-channel target selection for the Discord share dialog. */
import { button, createAnchoredPopover, el, multiSelectControl } from "./ui.js";

export function createShareTargetPicker(targets, initialValues, onChange, { label }) {
	let selected = [...initialValues];
	let popover = null;
	let choices = null;
	const trigger = button({
		label: "",
		iconName: "discord",
		variant: "secondary",
		className: "aa-discord-share-target-trigger",
	});
	trigger.setAttribute("aria-haspopup", "dialog");
	const syncTrigger = () => {
		const selectedTargets = targets.filter((target) => selected.includes(target.id));
		const text = selectedTargets.length === 0
			? label("targets.choose", "Choose channels")
			: selectedTargets.length === 1
				? selectedTargets[0].label
				: `${label("targets.multiple", "Channels")} · ${selectedTargets.length}`;
		trigger.querySelector(".aa-ui-button__label").textContent = text;
		trigger.title = selectedTargets.length
			? selectedTargets.map((target) => target.label).join("、")
			: label("targets.none", "Choose at least one channel");
		trigger.setAttribute("aria-label", `${label("targets.aria", "Discord share channels")}: ${trigger.title}`);
	};
	const setValues = (values, { emit = true } = {}) => {
		const available = new Set(targets.map((target) => target.id));
		const next = [...new Set((values || []).map(String).filter((id) => available.has(id)))];
		if (!next.length) {
			choices?.setValues(selected);
			return;
		}
		selected = next;
		choices?.setValues(selected);
		syncTrigger();
		if (emit) onChange?.([...selected]);
	};
	const close = () => popover?.close();
	const open = () => {
		if (popover) return;
		trigger.setAttribute("aria-expanded", "true");
		popover = createAnchoredPopover({
			anchor: trigger,
			ariaLabel: label("targets.aria", "Discord share channels"),
			className: "aa-discord-share-target-popover",
			width: 280,
			onClose: () => {
				popover = null;
				choices = null;
				trigger.setAttribute("aria-expanded", "false");
			},
		});
		choices = multiSelectControl({
			options: targets.map((target) => ({ value: target.id, label: target.label, iconName: "discord" })),
			values: selected,
			ariaLabel: label("targets.aria", "Discord share channels"),
			className: "aa-discord-share-target-list",
			onChange: (values) => setValues(values),
		});
		popover.root.append(
			el("strong", "aa-discord-share-target-popover__title", label("targets.title", "Send to")),
			choices,
		);
	};
	trigger.addEventListener("click", () => { if (popover) close(); else open(); });
	trigger.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown" && !popover) {
			event.preventDefault();
			open();
		}
	});
	trigger.setAttribute("aria-expanded", "false");
	syncTrigger();
	return {
		root: trigger,
		values: () => [...selected],
		setValues,
		destroy: () => close(),
	};
}
