/** Small, dependency-free DOM component primitives for Aaalice frontend surfaces. */

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS = {
	add: "M12 5v14M5 12h14",
	copy: "M8 8h11v11H8zM5 16H4V5h11v1",
	delete: "M4 7h16M9 11v5m6-5v5M8 7l1-3h6l1 3m2 0-1 13H7L6 7",
	lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
	unlock: "M17 11V8a5 5 0 0 0-9.6-2M5 11h14v10H5z",
	note: "M5 4h14v13H9l-4 3V4Zm4 5h6m-6 4h4",
	moveDown: "m7 10 5 5 5-5",
	settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",
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
