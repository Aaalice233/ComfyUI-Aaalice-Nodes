/** Tooltip and scroll-gesture lifecycle helpers. */

import { renderSafeMarkdown } from "../safe_markdown.js";
import { el } from "./primitives.js";

let activeTooltip = null;
let tooltipId = 0;
const transientHoverSurfaces = new Set();
const SCROLL_INTERACTION_ATTRIBUTE = "data-aa-scroll-active";
const SCROLL_INTERACTION_SETTLE_DELAY = 180;

export function isScrollInteractionActive(element) {
	return Boolean(element?.closest?.(`[${SCROLL_INTERACTION_ATTRIBUTE}="true"]`));
}

export function registerTransientHoverSurface(anchor, close) {
	const surface = { anchor, close };
	transientHoverSurfaces.add(surface);
	return () => transientHoverSurfaces.delete(surface);
}

function closeTransientHoverSurfacesWithin(container) {
	for (const surface of [...transientHoverSurfaces]) {
		if (container.contains(surface.anchor)) surface.close();
	}
}


export function closeTooltipWithin(container) {
	if (activeTooltip?.isAnchoredWithin?.(container)) activeTooltip.hide();
}

/** Suppress transient hover surfaces while a scroll or boundary-page gesture is still moving content. */
export function bindScrollInteractionGuard(root, { settleDelay = SCROLL_INTERACTION_SETTLE_DELAY } = {}) {
	let settleTimer = 0;
	let active = false;
	const settle = () => {
		settleTimer = 0;
		active = false;
		root.removeAttribute(SCROLL_INTERACTION_ATTRIBUTE);
	};
	const begin = () => {
		clearTimeout(settleTimer);
		if (!active) {
			active = true;
			root.setAttribute(SCROLL_INTERACTION_ATTRIBUTE, "true");
			if (activeTooltip?.isAnchoredWithin?.(root)) activeTooltip.hide();
			closeTransientHoverSurfacesWithin(root);
		}
		settleTimer = setTimeout(settle, settleDelay);
	};
	const onWheel = (event) => {
		if (event.ctrlKey || event.metaKey || (!event.deltaX && !event.deltaY)) return;
		begin();
	};
	root.addEventListener("wheel", onWheel, { capture: true, passive: true });
	root.addEventListener("scroll", begin, { capture: true, passive: true });
	return () => {
		clearTimeout(settleTimer);
		root.removeEventListener("wheel", onWheel, true);
		root.removeEventListener("scroll", begin, true);
		root.removeAttribute(SCROLL_INTERACTION_ATTRIBUTE);
	};
}

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
	let pendingAnchor = null;
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
		pendingAnchor = null;
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
		pendingAnchor = null;
		if (isScrollInteractionActive(nextAnchor)) {
			hide();
			return;
		}
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
		if (isScrollInteractionActive(nextAnchor)) return;
		pendingAnchor = nextAnchor;
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
		isAnchoredWithin: (container) => Boolean((anchor || pendingAnchor) && container?.contains?.(anchor || pendingAnchor)),
		isOpenFor: (candidate) => Boolean(root && anchor === candidate),
		get anchor() { return anchor; },
	};
	return controller;
}
