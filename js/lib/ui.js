/** Small, dependency-free DOM component primitives for Aaalice frontend surfaces. */

import { renderSafeMarkdown } from "./safe_markdown.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS = {
	add: "M12 5v14M5 12h14",
	copy: "M8 8h11v11H8zM5 16H4V5h11v1",
	delete: "M4 7h16M9 11v5m6-5v5M8 7l1-3h6l1 3m2 0-1 13H7L6 7",
	drag: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
	filter: "M4 5h16l-6 7v6l-4 2v-8L4 5Z",
	link: "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1",
	lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
	unlock: "M17 11V8a5 5 0 0 0-9.6-2M5 11h14v10H5z",
	note: "M5 4h14v13H9l-4 3V4Zm4 5h6m-6 4h4",
	moveDown: "m7 10 5 5 5-5",
	refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
	settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.73v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.73l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
	statusCheck: "m5 12 4 4L19 6",
	statusError: "M7 7l10 10M17 7 7 17",
	statusIdle: "M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
	statusWarning: "M12 9v4m0 4h.01M10.3 4.8 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z",
};

export function hasIcon(name) {
	return Object.prototype.hasOwnProperty.call(ICON_PATHS, name);
}

function appendChildren(element, children) {
	for (const child of children.flat(Infinity)) {
		if (child == null || child === false) continue;
		element.append(child instanceof Node ? child : document.createTextNode(String(child)));
	}
}

/** Supports el("div", "class", "text") and an options object. */
export function el(tag, options = null, text = null) {
	const element = document.createElement(tag);
	if (typeof options === "string") {
		element.className = options;
		if (text != null) element.textContent = text;
		return element;
	}
	if (!options) {
		if (text != null) element.textContent = text;
		return element;
	}
	if (options.className) element.className = options.className;
	if (options.text != null) element.textContent = options.text;
	for (const [name, value] of Object.entries(options.attrs || {})) {
		if (value == null || value === false) continue;
		if (name in element && name !== "role" && !name.startsWith("aria-")) element[name] = value;
		else element.setAttribute(name, value === true ? "" : String(value));
	}
	appendChildren(element, options.children || []);
	return element;
}

export function isolate(element) {
	for (const eventName of ["pointerdown", "mousedown", "wheel"]) element.addEventListener(eventName, (event) => event.stopPropagation());
	return element;
}

let activeTooltip = null;
let tooltipId = 0;

function updateTokenAttribute(element, attribute, value, add) {
	const ids = new Set((element.getAttribute(attribute) || "").split(/\s+/).filter(Boolean));
	if (add) ids.add(value);
	else ids.delete(value);
	if (ids.size) element.setAttribute(attribute, [...ids].join(" "));
	else element.removeAttribute(attribute);
}

function updateDescribedBy(anchor, id, add) {
	updateTokenAttribute(anchor, "aria-describedby", id, add);
}

function placeTooltip(root, anchor) {
	if (!root?.isConnected || !anchor?.isConnected) return;
	const margin = 10;
	const gap = 8;
	const anchorRect = anchor.getBoundingClientRect();
	const tooltipRect = root.getBoundingClientRect();
	const centered = anchorRect.left + ((anchorRect.width - tooltipRect.width) / 2);
	const left = Math.max(margin, Math.min(window.innerWidth - tooltipRect.width - margin, centered));
	const arrowX = Math.max(14, Math.min(tooltipRect.width - 14, anchorRect.left + (anchorRect.width / 2) - left));
	const below = anchorRect.bottom + gap;
	const fitsBelow = below + tooltipRect.height <= window.innerHeight - margin;
	const top = fitsBelow ? below : Math.max(margin, anchorRect.top - tooltipRect.height - gap);
	root.dataset.placement = fitsBelow ? "below" : "above";
	root.style.setProperty("--aa-ui-tooltip-arrow-x", `${arrowX}px`);
	root.style.left = `${left}px`;
	root.style.top = `${top}px`;
}

function renderTooltipContent(content, contentMode) {
	if (contentMode === "markdown") return renderSafeMarkdown(content);
	if (contentMode === "text") return document.createTextNode(String(content));
	if (contentMode === "dom") {
		if (content instanceof Node) return content;
		throw new TypeError("[Aaalice] Tooltip DOM content must be a Node");
	}
	if (contentMode === "auto") return content instanceof Node ? content : document.createTextNode(String(content));
	throw new TypeError(`[Aaalice] Unknown tooltip content mode: ${contentMode}`);
}

/** Shared tooltip shell. Interactive mode behaves as a hover card with focusable content. */
export function createTooltip({ closeDelay = 140, delay = 180 } = {}) {
	let root = null;
	let anchor = null;
	let showTimer = null;
	let closeTimer = null;
	let positionFrame = 0;
	let interactive = false;
	let previousExpanded = null;

	const schedulePosition = () => {
		if (positionFrame) return;
		positionFrame = requestAnimationFrame(() => {
			positionFrame = 0;
			placeTooltip(root, anchor);
		});
	};
	const cancelScheduledHide = () => {
		clearTimeout(closeTimer);
		closeTimer = null;
	};
	const keydown = (event) => {
		if (event.key !== "Escape") return;
		const restoreFocus = interactive && root?.contains(document.activeElement);
		const previousAnchor = anchor;
		hide();
		if (restoreFocus) {
			event.preventDefault();
			previousAnchor?.focus?.({ preventScroll: true });
		}
	};
	const removePositionListeners = () => {
		window.removeEventListener("resize", schedulePosition);
		window.removeEventListener("scroll", schedulePosition, true);
		document.removeEventListener("keydown", keydown, true);
		if (positionFrame) cancelAnimationFrame(positionFrame);
		positionFrame = 0;
	};
	const hide = () => {
		clearTimeout(showTimer);
		showTimer = null;
		cancelScheduledHide();
		removePositionListeners();
		if (anchor && root) {
			if (interactive) {
				updateTokenAttribute(anchor, "aria-controls", root.id, false);
				if (previousExpanded == null) anchor.removeAttribute("aria-expanded");
				else anchor.setAttribute("aria-expanded", previousExpanded);
			} else updateDescribedBy(anchor, root.id, false);
		}
		root?.remove();
		root = null;
		anchor = null;
		interactive = false;
		previousExpanded = null;
		if (activeTooltip?.hide === hide) activeTooltip = null;
	};
	const scheduleHide = () => {
		if (!root) {
			hide();
			return;
		}
		cancelScheduledHide();
		closeTimer = setTimeout(hide, closeDelay);
	};
	const claimActive = () => {
		if (activeTooltip && activeTooltip !== controller) activeTooltip.hide();
		activeTooltip = controller;
	};
	const mount = (nextAnchor, content, { className = "", contentMode = "auto", interactive: nextInteractive = false, onMount = null } = {}) => {
		const resolved = typeof content === "function" ? content() : content;
		if (!nextAnchor?.isConnected || resolved == null || resolved === "") {
			if (activeTooltip === controller) activeTooltip = null;
			return;
		}
		let rendered;
		try { rendered = renderTooltipContent(resolved, contentMode); }
		catch (error) {
			hide();
			throw error;
		}
		claimActive();
		interactive = Boolean(nextInteractive);
		const accessibleLabel = nextAnchor.getAttribute("aria-label") || nextAnchor.textContent?.trim() || null;
		root = el("div", {
			className: `aa-ui-tooltip${interactive ? " is-interactive" : ""}${className ? ` ${className}` : ""}`,
			attrs: {
				role: interactive ? "dialog" : "tooltip",
				"aria-label": interactive ? accessibleLabel : null,
				"aria-modal": interactive ? "false" : null,
			},
		});
		root.id = `aa-ui-tooltip-${++tooltipId}`;
		root.append(rendered);
		anchor = nextAnchor;
		document.body.append(root);
		if (interactive) {
			const mountedRoot = root;
			previousExpanded = anchor.getAttribute("aria-expanded");
			updateTokenAttribute(anchor, "aria-controls", root.id, true);
			anchor.setAttribute("aria-expanded", "true");
			mountedRoot.addEventListener("mouseenter", cancelScheduledHide);
			mountedRoot.addEventListener("mouseleave", scheduleHide);
			mountedRoot.addEventListener("focusin", cancelScheduledHide);
			mountedRoot.addEventListener("focusout", (event) => { if (!mountedRoot.contains(event.relatedTarget)) scheduleHide(); });
		} else updateDescribedBy(anchor, root.id, true);
		onMount?.(root);
		placeTooltip(root, anchor);
		window.addEventListener("resize", schedulePosition);
		window.addEventListener("scroll", schedulePosition, true);
		document.addEventListener("keydown", keydown, true);
	};
	const show = (nextAnchor, content, options = {}) => {
		hide();
		claimActive();
		if (options.immediate) mount(nextAnchor, content, options);
		else showTimer = setTimeout(() => mount(nextAnchor, content, options), delay);
	};
	const controller = {
		show,
		hide,
		cancelScheduledHide,
		scheduleHide,
		destroy: hide,
		focusFirstInteractive: () => {
			const target = root?.querySelector('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
			if (!target) return false;
			target.focus({ preventScroll: true });
			return true;
		},
		isOpenFor: (candidate) => Boolean(root && anchor === candidate),
		get anchor() { return anchor; },
	};
	return controller;
}

export function icon(name, { label = null, className = "" } = {}) {
	if (!hasIcon(name)) throw new Error(`[Aaalice] Unknown icon: ${name}`);
	const pathData = ICON_PATHS[name];
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("class", `aa-ui-icon${className ? ` ${className}` : ""}`);
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "1.8");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	if (label) {
		svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", label);
	} else svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", pathData);
	svg.append(path);
	return svg;
}

export function button({
	label,
	variant = "primary",
	size = "md",
	iconName = null,
	title = null,
	ariaLabel = null,
	className = "",
	active = false,
	disabled = false,
	onClick = null,
} = {}) {
	const result = el("button", {
		className: `aa-ui-button aa-ui-button--${variant} aa-ui-button--${size}${active ? " is-active" : ""}${className ? ` ${className}` : ""}`,
		attrs: { type: "button", title, disabled, "aria-label": ariaLabel || null },
	});
	if (iconName) result.append(icon(iconName));
	if (label != null) result.append(el("span", "aa-ui-button__label", label));
	if (onClick) result.addEventListener("click", onClick);
	return result;
}

export function iconButton({ iconName, label, ...options }) {
	return button({ ...options, iconName, ariaLabel: label, title: options.title || label, size: options.size || "icon" });
}

export function segmentedControl({ value, options = [], ariaLabel, onChange = null, className = "", thumbClassName = "", dataAttribute = "value" } = {}) {
	const root = el("div", { className: `aa-ui-segmented${className ? ` ${className}` : ""}`, attrs: { role: "radiogroup", "aria-label": ariaLabel } });
	root.style.setProperty("--aa-ui-segment-count", String(Math.max(1, options.length)));
	root.append(el("span", { className: `aa-ui-segmented__thumb${thumbClassName ? ` ${thumbClassName}` : ""}`, attrs: { "aria-hidden": "true" } }));
	const choices = [];
	const setValue = (next, emit = false) => {
		value = options.some((option) => option.value === next) ? next : options[0]?.value;
		const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
		root.dataset.value = value || "";
		root.dataset.index = String(activeIndex);
		root.style.setProperty("--aa-ui-segment-index", String(activeIndex));
		for (const choice of choices) {
			const active = choice.dataset[dataAttribute] === value;
			choice.classList.toggle("is-active", active);
			choice.setAttribute("aria-checked", String(active));
		}
		if (emit) onChange?.(value);
	};
	for (const option of options) {
		const choice = el("button", { attrs: { type: "button", role: "radio", "aria-checked": false }, text: option.label });
		choice.dataset[dataAttribute] = option.value;
		choice.addEventListener("click", () => setValue(option.value, true));
		choice.addEventListener("keydown", (event) => {
			if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
			event.preventDefault();
			const index = options.findIndex((item) => item.value === value);
			const offset = event.key === "ArrowRight" ? 1 : -1;
			const nextIndex = (index + offset + options.length) % options.length;
			setValue(options[nextIndex].value, true);
			choices[nextIndex]?.focus();
		});
		choices.push(choice);
		root.append(choice);
	}
	root.setValue = (next) => setValue(next, false);
	root.setLabel = (label) => root.setAttribute("aria-label", label);
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

function focusableElements(root) {
	return [...root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
		.filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

export function createAnchoredPopover({ anchor, ariaLabel, className = "", width = 300 } = {}) {
	if (!(anchor instanceof HTMLElement)) throw new Error("[Aaalice] Popover anchor is unavailable");
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
	const root = isolate(el("section", { className: `aa-ui-popover${className ? ` ${className}` : ""}`, attrs: { role: "dialog", "aria-modal": "false", "aria-label": ariaLabel, tabindex: -1 } }));
	document.body.append(root);
	root.style.width = `${width}px`;
	const rect = anchor.getBoundingClientRect();
	root.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))}px`;
	root.style.top = `${Math.max(8, Math.min(window.innerHeight - 80, rect.bottom + 6))}px`;
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		document.removeEventListener("pointerdown", outside, true);
		document.removeEventListener("keydown", keydown, true);
		root.remove();
		previousFocus?.focus?.({ preventScroll: true });
	};
	const outside = (event) => { if (!root.contains(event.target) && event.target !== anchor) close(); };
	const keydown = (event) => {
		if (event.key === "Escape") { event.preventDefault(); close(); return; }
		if (event.key !== "Tab") return;
		const focusable = focusableElements(root);
		if (!focusable.length) { event.preventDefault(); root.focus(); return; }
		const first = focusable[0];
		const last = focusable.at(-1);
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	};
	setTimeout(() => {
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("keydown", keydown, true);
		(focusableElements(root)[0] || root).focus();
	});
	return { root, close };
}

export function createDialog({
	title,
	body = null,
	footer = null,
	size = "md",
	className = "",
	closeOnBackdrop = true,
	onRequestClose = null,
} = {}) {
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const titleId = `aaalice-dialog-${Math.random().toString(36).slice(2)}`;
	const overlay = el("div", "aa-ui-dialog-backdrop");
	const dialog = el("section", {
		className: `aa-ui-dialog aa-ui-dialog--${size}${className ? ` ${className}` : ""}`,
		attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: -1 },
	});
	const header = el("header", "aa-ui-dialog__header");
	const heading = el("h2", { className: "aa-ui-dialog__title", text: title, attrs: { id: titleId } });
	header.append(heading);
	const bodyElement = body || el("div");
	bodyElement.classList.add("aa-ui-dialog__body");
	dialog.append(header, bodyElement);
	let footerElement = null;
	if (footer) {
		footerElement = footer;
		footerElement.classList.add("aa-ui-dialog__footer");
		dialog.append(footerElement);
	}
	overlay.append(dialog);
	let closed = false;
	const close = (value = null) => {
		if (closed) return;
		closed = true;
		document.removeEventListener("keydown", keydown);
		overlay.remove();
		previousFocus?.focus?.({ preventScroll: true });
	};
	const requestClose = async (value = null) => {
		if (closed) return;
		if (onRequestClose && await onRequestClose(value) === false) return;
		close(value);
	};
	const keydown = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			requestClose(null);
			return;
		}
		if (event.key !== "Tab") return;
		const focusable = focusableElements(dialog);
		if (!focusable.length) {
			event.preventDefault();
			dialog.focus();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};
	document.addEventListener("keydown", keydown);
	overlay.addEventListener("pointerdown", (event) => {
		if (closeOnBackdrop && event.target === overlay) requestClose(null);
	});
	document.body.append(overlay);
	requestAnimationFrame(() => (focusableElements(dialog)[0] || dialog).focus());
	return { overlay, dialog, header, heading, body: bodyElement, footer: footerElement, close, requestClose };
}
