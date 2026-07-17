/** Shared lazy thumbnail and large-preview behavior for library-backed entries. */

import { createTooltip, el, icon } from "./ui.js";

const IMAGE_PREVIEW_HOVER_DELAY = 600;
const previewTooltip = createTooltip({ delay: IMAGE_PREVIEW_HOVER_DELAY, closeDelay: 90 });

export function closeImagePreview() { previewTooltip.hide(); }

function bindLargePreview(trigger, source, title) {
	if (!source) return;
	const show = (immediate) => {
		if (previewTooltip.isOpenFor(trigger)) { previewTooltip.cancelScheduledHide(); return; }
		const large = document.createElement("img"); large.src = source; large.alt = title; large.decoding = "async";
		large.addEventListener("load", previewTooltip.reposition, { once: true });
		previewTooltip.show(trigger, el("div", { className: "aa-image-preview-large", children: [large, el("strong", null, title)] }), { className: "aa-image-preview-tooltip", contentMode: "dom", immediate });
	};
	trigger.addEventListener("mouseenter", () => show(false));
	trigger.addEventListener("mouseleave", previewTooltip.scheduleHide);
	trigger.addEventListener("focusin", () => show(true));
	trigger.addEventListener("focusout", previewTooltip.scheduleHide);
}

function thumbnail(source, placeholderIcon) {
	if (!source) return el("span", { className: "aa-image-preview-media is-placeholder", attrs: { "aria-hidden": "true" }, children: [icon(placeholderIcon)] });
	const image = document.createElement("img"); image.src = source; image.alt = ""; image.loading = "lazy"; image.decoding = "async";
	return el("span", { className: "aa-image-preview-media", attrs: { "aria-hidden": "true" }, children: [image] });
}

export function createImagePreview({ source = "", title = "", label = title, className = "", placeholderIcon = "note" } = {}) {
	const classes = `aa-image-preview${className ? ` ${className}` : ""}`;
	if (!source) return el("span", { className: `${classes} is-placeholder`, attrs: { "aria-hidden": "true" }, children: [icon(placeholderIcon)] });
	const image = document.createElement("img"); image.src = source; image.alt = ""; image.loading = "lazy"; image.decoding = "async";
	const trigger = el("button", { className: classes, attrs: { type: "button", "aria-label": label }, children: [image] });
	bindLargePreview(trigger, source, title);
	return trigger;
}

export function createSelectableImagePreview({ source = "", title = "", label = title, className = "", placeholderIcon = "note", selected = false, inputId = "", onChange = null } = {}) {
	const input = document.createElement("input"); input.type = "checkbox"; input.checked = selected; input.id = inputId; input.setAttribute("aria-label", label);
	input.addEventListener("change", () => onChange?.(input.checked));
	const root = el("label", { className: `aa-image-preview aa-image-preview-selectable${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`, children: [
		input, thumbnail(source, placeholderIcon), el("span", { className: "aa-image-preview-selection", attrs: { "aria-hidden": "true" }, children: [icon("statusCheck")] }),
	] });
	bindLargePreview(root, source, title);
	return { root, input };
}
