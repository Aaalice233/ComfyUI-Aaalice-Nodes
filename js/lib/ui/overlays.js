/** Popover, context-menu, dialog, and inline-edit surfaces. */

import { button, el, icon, isolate } from "./primitives.js";
import { registerTransientHoverSurface } from "./transient_surfaces.js";

const DEFAULT_DIALOG_SIZE = "compact";
const anchoredPopovers = new Set();

export function closeAnchoredPopoversWithin(container) {
	for (const surface of [...anchoredPopovers]) {
		if (container?.contains?.(surface.anchor)) surface.close();
	}
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

export function createAnchoredPopover({ anchor, ariaLabel, className = "", width = 300, onClose = null, focusOnOpen = true, transientHover = false } = {}) {
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
	let unregisterTransientHover = () => {};
	let anchoredSurface = null;
	const close = () => {
		if (closed) return;
		closed = true;
		unregisterTransientHover();
		if (anchoredSurface) anchoredPopovers.delete(anchoredSurface);
		document.removeEventListener("pointerdown", outside, true);
		document.removeEventListener("keydown", keydown, true);
		root.remove();
		previousFocus?.focus?.({ preventScroll: true });
		onClose?.();
	};
	anchoredSurface = { anchor, close }; anchoredPopovers.add(anchoredSurface);
	if (transientHover) unregisterTransientHover = registerTransientHoverSurface(anchor, close);
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
		if (closed) return;
		reposition();
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("keydown", keydown, true);
		if (focusOnOpen) (focusableElements(root)[0] || root).focus();
	});
	return { root, close, reposition };
}

let activeContextMenu = null;

export function closeContextMenuWithin(container) {
	if (activeContextMenu?.isOwnedBy?.(container)) activeContextMenu.close({ restoreFocus: false });
}

export function createContextMenu({ x, y, ariaLabel = "Menu", items = [], onClose = null, ownerElement: explicitOwnerElement = null } = {}) {
	activeContextMenu?.close();
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const triggerElement = document.elementFromPoint?.(Number(x) || 0, Number(y) || 0) || null;
	const ownerElement = explicitOwnerElement instanceof Element
		? explicitOwnerElement
		: triggerElement instanceof Element && !["body", "html"].includes(triggerElement.localName) ? triggerElement : previousFocus;
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
	activeContextMenu = { root, close, isOwnedBy: (container) => Boolean(container?.contains?.(ownerElement)) };
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
	initialFocus = null,
	returnFocus = null,
	onRequestClose = null,
	onClose = null,
} = {}) {
	const previousFocus = returnFocus instanceof HTMLElement ? returnFocus : document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
	requestAnimationFrame(() => {
		const preferred = typeof initialFocus === "function" ? initialFocus({ dialog, body: bodyElement, footer: footerElement }) : initialFocus;
		(preferred?.isConnected && typeof preferred.focus === "function" ? preferred : focusableElements(dialog)[0] || dialog).focus();
	});
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
