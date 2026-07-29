/** Small, dependency-free DOM component primitives for Aaalice frontend surfaces. */

import { renderSafeMarkdown } from "./safe_markdown.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_DIALOG_SIZE = "compact";
const ICON_PATHS = {
	add: "M12 5v14M5 12h14",
	arrowRight: "M5 12h14m-6-6 6 6-6 6",
	close: "M18 6 6 18M6 6l12 12",
	copy: "M8 8h11v11H8zM5 16H4V5h11v1",
	delete: "M4 7h16M9 11v5m6-5v5M8 7l1-3h6l1 3m2 0-1 13H7L6 7",
	download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
	drag: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
	edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
	favorite: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2-4.5-4.4 6.2-.9L12 3Z",
	filter: "M4 5h16l-6 7v6l-4 2v-8L4 5Z",
	layout: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
	link: "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1",
	loading: "M21 12a9 9 0 1 1-6.22-8.56",
	lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
	move: "M3 6h7l2 2h9v11H3V6Zm5 8h8m-3-3 3 3-3 3",
	more: "M5 11v2M12 11v2M19 11v2",
	pin: "M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Zm3 11v7",
	unlock: "M17 11V8a5 5 0 0 0-9.6-2M5 11h14v10H5z",
	note: "M5 4h14v13H9l-4 3V4Zm4 5h6m-6 4h4",
	moveDown: "m7 10 5 5 5-5",
	refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
	skipForward: "M5 5v14l11-7L5 5Zm14 0v14",
	fit: "M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5",
	volumeOff: "M11 5 6 9H2v6h4l5 4V5Zm11 4-6 6m0-6 6 6",
	zoomIn: "M11 8v6m-3-3h6m7 10-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
	zoomOut: "M8 11h6m7 10-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
	ratingGeneral: "M12 3 5 6v5c0 4.2 2.9 6.6 7 8 4.1-1.4 7-3.8 7-8V9l-7-6Zm-3 9 2 2 4-4",
	ratingSensitive: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
	ratingQuestionable: "M12 18h.01M9.4 9a2.7 2.7 0 1 1 4.2 2.25c-1.1.75-1.6 1.25-1.6 2.25M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
	ratingExplicit: "M13 2s1 4-2 6c-2 1.4-4 3.4-4 6a5 5 0 0 0 10 0c0-2-1-3.8-2.5-5.2.2 2.2-.8 3.2-1.7 3.8.8-3.7-1.8-5.5.2-10.6Z",
	search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
	save: "M5 3h11l3 3v15H5V3Zm3 0v6h8V3M8 21v-7h8v7",
	scan: "M7 3H5a2 2 0 0 0-2 2v2m0 10v2a2 2 0 0 0 2 2h2m10 0h2a2 2 0 0 0 2-2v-2m0-10V5a2 2 0 0 0-2-2h-2M4 12h16",
	settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.73v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.73l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
	statusCheck: "m5 12 4 4L19 6",
	statusError: "M7 7l10 10M17 7 7 17",
	statusIdle: "M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
	statusWarning: "M12 9v4m0 4h.01M10.3 4.8 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z",
	storage: "M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3Zm0 0v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6m-16 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6",
	swap: "M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3",
	tag: "M20 13 13 20 4 11V4h7l9 9ZM8.5 8.5h.01",
	upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
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

function placeTooltip(root, anchor, preferredPlacement = "auto", cursorPoint = null) {
	if (!root?.isConnected || !anchor?.isConnected) return;
	const margin = 10;
	const gap = 8;
	const anchorRect = anchor.getBoundingClientRect();
	const tooltipRect = root.getBoundingClientRect();
	if (preferredPlacement === "cursor") {
		const point = cursorPoint && Number.isFinite(cursorPoint.x) && Number.isFinite(cursorPoint.y)
			? cursorPoint
			: { x: anchorRect.left + (anchorRect.width / 2), y: anchorRect.top + (anchorRect.height / 2) };
		const offsetX = 14;
		const offsetY = 18;
		let left = point.x + offsetX;
		let top = point.y + offsetY;
		if (left + tooltipRect.width > window.innerWidth - margin) left = point.x - tooltipRect.width - offsetX;
		if (top + tooltipRect.height > window.innerHeight - margin) top = point.y - tooltipRect.height - 12;
		left = Math.max(margin, Math.min(window.innerWidth - tooltipRect.width - margin, left));
		top = Math.max(margin, Math.min(window.innerHeight - tooltipRect.height - margin, top));
		root.dataset.placement = "cursor";
		root.style.left = `${left}px`;
		root.style.top = `${top}px`;
		return;
	}
	if (preferredPlacement === "side") {
		const roomRight = window.innerWidth - anchorRect.right - margin;
		const roomLeft = anchorRect.left - margin;
		const showRight = roomRight >= tooltipRect.width + gap || roomRight >= roomLeft;
		const left = showRight
			? Math.min(window.innerWidth - tooltipRect.width - margin, anchorRect.right + gap)
			: Math.max(margin, anchorRect.left - tooltipRect.width - gap);
		const top = Math.max(margin, Math.min(window.innerHeight - tooltipRect.height - margin, anchorRect.top - 50));
		const arrowY = Math.max(14, Math.min(tooltipRect.height - 14, anchorRect.top + (anchorRect.height / 2) - top));
		root.dataset.placement = showRight ? "right" : "left";
		root.style.setProperty("--aa-ui-tooltip-arrow-y", `${arrowY}px`);
		root.style.left = `${left}px`;
		root.style.top = `${top}px`;
		return;
	}
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
	let preferredPlacement = "auto";
	let cursorPoint = null;

	const schedulePosition = () => {
		if (positionFrame) return;
		positionFrame = requestAnimationFrame(() => {
			positionFrame = 0;
			placeTooltip(root, anchor, preferredPlacement, cursorPoint);
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
		preferredPlacement = "auto";
		cursorPoint = null;
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
	const mount = (nextAnchor, content, { className = "", contentMode = "auto", interactive: nextInteractive = false, onMount = null, placement = "auto", point = null } = {}) => {
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
		preferredPlacement = placement;
		cursorPoint = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
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
		placeTooltip(root, anchor, preferredPlacement, cursorPoint);
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
		reposition: schedulePosition,
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
	defaultAction = false,
	onClick = null,
} = {}) {
	const result = el("button", {
		className: `aa-ui-button aa-ui-button--${variant} aa-ui-button--${size}${active ? " is-active" : ""}${className ? ` ${className}` : ""}`,
		attrs: { type: "button", title, disabled, "aria-label": ariaLabel || null, "data-aa-dialog-default": defaultAction ? "true" : null },
	});
	if (iconName) result.append(icon(iconName));
	if (label != null) result.append(el("span", "aa-ui-button__label", label));
	if (onClick) result.addEventListener("click", onClick);
	return result;
}

export function iconButton({ iconName, label, ...options }) {
	return button({ ...options, iconName, ariaLabel: label, title: Object.hasOwn(options, "title") ? options.title : label, size: options.size || "icon" });
}

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
		const choice = el("button", { attrs: { type: "button", role: "radio", "aria-checked": false } });
		if (option.iconName) choice.append(icon(option.iconName), el("span", "aa-ui-segmented__label", option.label));
		else choice.textContent = option.label;
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

function focusableElements(root) {
	return [...root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
		.filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function dialogAction(footer, selector) {
	return [...(footer?.querySelectorAll(selector) || [])].reverse().find((action) => (
		!action.disabled
		&& !action.hidden
		&& action.getAttribute("aria-disabled") !== "true"
		&& action.getAttribute("aria-hidden") !== "true"
	));
}

function dialogDefaultAction(footer) {
	return dialogAction(footer, '[data-aa-dialog-default="true"]')
		|| dialogAction(footer, ".aa-ui-button--primary")
		|| dialogAction(footer, ".aa-ui-button--danger");
}

function shouldIgnoreDialogEnter(event, dialog) {
	if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return true;
	if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return true;
	const target = event.target instanceof Element ? event.target : document.activeElement;
	if (!(target instanceof Element) || !dialog.contains(target)) return true;
	if (target.closest('[data-aa-dialog-enter="ignore"], textarea, select, [contenteditable]:not([contenteditable="false"]), button, a[href], [role="button"], [role="option"], [role="listbox"], [role="combobox"]')) return true;
	if (target instanceof HTMLInputElement && ["button", "checkbox", "color", "file", "radio", "range", "reset", "submit"].includes(target.type)) return true;
	return false;
}

export function createAnchoredPopover({ anchor, ariaLabel, className = "", width = 300, onClose = null, focusOnOpen = true } = {}) {
	if (!(anchor instanceof HTMLElement)) throw new Error("[Aaalice] Popover anchor is unavailable");
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
	const root = isolate(el("section", { className: `aa-ui-popover${className ? ` ${className}` : ""}`, attrs: { role: "dialog", "aria-modal": "false", "aria-label": ariaLabel, tabindex: -1 } }));
	document.body.append(root);
	root.style.width = `${width}px`;
	const reposition = () => {
		const rect = anchor.getBoundingClientRect();
		const height = Math.min(root.scrollHeight || 80, window.innerHeight - 16);
		const below = rect.bottom + 6;
		const above = rect.top - height - 6;
		const top = below + height <= window.innerHeight - 8 || above < 8 ? below : above;
		root.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))}px`;
		root.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, top))}px`;
	};
	reposition();
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		document.removeEventListener("pointerdown", outside, true);
		document.removeEventListener("keydown", keydown, true);
		root.remove();
		previousFocus?.focus?.({ preventScroll: true });
		onClose?.();
	};
	const outside = (event) => { if (!root.contains(event.target) && !anchor.contains(event.target)) close(); };
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
		reposition();
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("keydown", keydown, true);
		if (focusOnOpen) (focusableElements(root)[0] || root).focus();
	});
	return { root, close, reposition };
}

let activeContextMenu = null;

export function createContextMenu({ x, y, ariaLabel = "Menu", items = [], onClose = null } = {}) {
	activeContextMenu?.close();
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const root = isolate(el("div", { className: "aa-ui-context-menu", attrs: { role: "menu", "aria-label": ariaLabel, tabindex: -1 } }));
	const menuItems = [];
	let closed = false;
	const close = ({ restoreFocus = true } = {}) => {
		if (closed) return;
		closed = true;
		document.removeEventListener("pointerdown", outside, true);
		document.removeEventListener("keydown", keydown, true);
		root.remove();
		if (activeContextMenu?.root === root) activeContextMenu = null;
		if (restoreFocus) previousFocus?.focus?.({ preventScroll: true });
		onClose?.();
	};
	const outside = (event) => { if (!root.contains(event.target)) close({ restoreFocus: false }); };
	const focusAt = (index) => menuItems[(index + menuItems.length) % menuItems.length]?.focus();
	const keydown = (event) => {
		if (event.key === "Escape") { event.preventDefault(); close(); return; }
		if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		const current = menuItems.indexOf(document.activeElement);
		if (event.key === "Home") focusAt(0);
		else if (event.key === "End") focusAt(menuItems.length - 1);
		else focusAt(Math.max(0, current) + (event.key === "ArrowDown" ? 1 : -1));
	};
		for (const item of items) {
			if (item?.separator) { root.append(el("div", { className: "aa-ui-context-menu__separator", attrs: { role: "separator" } })); continue; }
			const checkable = typeof item.checked === "boolean";
			const action = button({ label: item.label, iconName: item.iconName || null, variant: "ghost", size: "sm", className: `aa-ui-context-menu__item${item.danger ? " is-danger" : ""}${item.className ? ` ${item.className}` : ""}`, disabled: item.disabled, onClick: () => { close({ restoreFocus: false }); item.onSelect?.(); } });
			action.setAttribute("role", checkable ? "menuitemradio" : "menuitem");
			if (checkable) {
				action.setAttribute("aria-checked", String(item.checked));
				action.append(el("span", { className: "aa-ui-context-menu__check", children: item.checked ? [icon("statusCheck")] : [] }));
			}
			menuItems.push(action); root.append(action);
		}
	document.body.append(root);
	const rect = root.getBoundingClientRect();
	root.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, Number(x) || 0))}px`;
	root.style.top = `${Math.max(8, Math.min(window.innerHeight - rect.height - 8, Number(y) || 0))}px`;
	document.addEventListener("pointerdown", outside, true);
	document.addEventListener("keydown", keydown, true);
	(menuItems[0] || root).focus({ preventScroll: true });
	activeContextMenu = { root, close };
	return activeContextMenu;
}

export function createDialog({
	title,
	body = null,
	footer = null,
	size = DEFAULT_DIALOG_SIZE,
	className = "",
	closeOnBackdrop = true,
	confirmOnEnter = true,
	onRequestClose = null,
	onClose = null,
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
		try { onClose?.(value); }
		finally { previousFocus?.focus?.({ preventScroll: true }); }
	};
	const requestClose = async (value = null) => {
		if (closed) return;
		if (onRequestClose && await onRequestClose(value) === false) return;
		close(value);
	};
	const keydown = (event) => {
		if (event.key === "Enter" && confirmOnEnter && !shouldIgnoreDialogEnter(event, dialog)) {
			const action = dialogDefaultAction(footerElement);
			if (!action) return;
			event.preventDefault();
			event.stopPropagation();
			action.click();
			return;
		}
		if (event.key === "Escape") {
			if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !dialog.contains(event.target)) return;
			event.preventDefault();
			event.stopPropagation();
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

/** In-place text rename: swaps the anchor's content for an input until commit/cancel. */
export function inlineRename(anchor, { value, ariaLabel = "", onCommit } = {}) {
	if (!anchor || anchor.dataset.aaRenaming === "true") return null;
	anchor.dataset.aaRenaming = "true";
	const input = el("input", { className: "aa-ui-inline-rename", attrs: { type: "text", value, "aria-label": ariaLabel } });
	anchor.replaceChildren(input);
	input.focus(); input.select();
	let done = false;
	const finish = (commit) => {
		if (done) return; done = true;
		delete anchor.dataset.aaRenaming;
		onCommit?.(commit ? input.value.trim() : null);
	};
	input.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Enter") finish(true); else if (event.key === "Escape") finish(false); });
	input.addEventListener("blur", () => finish(true));
	for (const type of ["click", "dblclick", "pointerdown"]) input.addEventListener(type, (event) => event.stopPropagation());
	return input;
}
