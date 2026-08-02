/** Shared Markdown description tooltip for parameter names on nodes and sidebar cards. */

import { createTooltip } from "./ui.js";

const descriptionTooltip = createTooltip();

export function attachDescriptionTooltip(trigger, description) {
	const resolveDescription = () => typeof description === "function" ? description() : description;
	trigger.tabIndex = 0;
	const showOrKeep = (immediate) => {
		if (descriptionTooltip.isOpenFor(trigger)) {
			descriptionTooltip.cancelScheduledHide();
			return;
		}
		descriptionTooltip.show(trigger, resolveDescription, {
			className: "aa-description-tooltip",
			contentMode: "markdown",
			immediate,
			interactive: true,
		});
	};
	trigger.addEventListener("mouseenter", () => showOrKeep(false));
	trigger.addEventListener("mouseleave", descriptionTooltip.scheduleHide);
	trigger.addEventListener("focus", () => showOrKeep(true));
	trigger.addEventListener("blur", descriptionTooltip.scheduleHide);
	trigger.addEventListener("keydown", (event) => {
		if (event.key !== "Tab" || event.shiftKey || !descriptionTooltip.isOpenFor(trigger)) return;
		if (descriptionTooltip.focusFirstInteractive()) event.preventDefault();
	});
}
