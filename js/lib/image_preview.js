/** Shared lazy thumbnail and large-preview behavior for library-backed entries. */

import { createTooltip, el, icon } from "./ui.js";

const IMAGE_PREVIEW_HOVER_DELAY = 600;
const previewTooltip = createTooltip({ delay: IMAGE_PREVIEW_HOVER_DELAY, closeDelay: 90 });

export function closeImagePreview() { previewTooltip.hide(); }

export function closeImagePreviewWithin(container) {
	if (previewTooltip.isAnchoredWithin(container)) previewTooltip.hide();
}

export function bindImagePreview(trigger, source, title, { immediate = false, hint = "", resolve = null } = {}) {
	if (!source && !hint && !resolve) return;
	const show = (immediate) => {
		const resolved = resolve?.() || { source, title, hint };
		const resolvedSource = resolved.source || "";
		const resolvedHint = resolved.hint ?? hint;
		if (!resolvedSource && !resolvedHint) return;
		if (previewTooltip.isOpenFor(trigger)) { previewTooltip.cancelScheduledHide(); return; }
		let content;
		if (resolvedSource) {
			const large = document.createElement("img"); large.src = resolvedSource; large.alt = resolved.title || ""; large.decoding = "async";
			large.addEventListener("load", previewTooltip.reposition, { once: true });
			content = el("div", { className: "aa-image-preview-large", children: [large, el("div", { className: "aa-image-preview-caption", children: [el("strong", null, resolved.title || ""), ...(resolvedHint ? [el("small", null, resolvedHint)] : [])] })] });
		} else content = el("span", "aa-image-preview-quick-hint", resolvedHint);
		previewTooltip.show(trigger, content, { className: resolvedSource ? "aa-image-preview-tooltip" : "aa-image-preview-hint-tooltip", contentMode: "dom", immediate });
	};
	trigger.addEventListener("mouseenter", () => show(immediate));
	trigger.addEventListener("mouseleave", previewTooltip.scheduleHide);
	trigger.addEventListener("focusin", () => show(true));
	trigger.addEventListener("focusout", previewTooltip.scheduleHide);
}

function thumbnail(source, placeholderIcon) {
	if (!source) return el("span", { className: "aa-image-preview-media is-placeholder", attrs: { "aria-hidden": "true" }, children: [icon(placeholderIcon)] });
	const image = document.createElement("img"); image.src = source; image.alt = ""; image.loading = "lazy"; image.decoding = "async";
	return el("span", { className: "aa-image-preview-media", attrs: { "aria-hidden": "true" }, children: [image] });
}

export function createImagePreview({ source = "", title = "", label = title, className = "", placeholderIcon = "note", hint = "" } = {}) {
	const classes = `aa-image-preview${className ? ` ${className}` : ""}`;
	const trigger = el("button", { className: `${classes}${source ? "" : " is-placeholder"}`, attrs: { type: "button", "aria-label": label }, children: [thumbnail(source, placeholderIcon)] });
	bindImagePreview(trigger, source, title, { hint });
	return trigger;
}

export function createSelectableImagePreview({ source = "", title = "", label = title, className = "", placeholderIcon = "note", selected = false, inputId = "", onChange = null } = {}) {
	const input = document.createElement("input"); input.type = "checkbox"; input.checked = selected; input.id = inputId; input.setAttribute("aria-label", label);
	input.addEventListener("change", () => onChange?.(input.checked));
	const root = el("label", { className: `aa-image-preview aa-image-preview-selectable${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`, children: [
		input, thumbnail(source, placeholderIcon), el("span", { className: "aa-image-preview-selection", attrs: { "aria-hidden": "true" }, children: [icon("statusCheck")] }),
	] });
	bindImagePreview(root, source, title);
	return { root, input };
}
