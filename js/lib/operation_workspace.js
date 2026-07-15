/** Single-portal Operation Panel workspace and native sidebar lifecycle. */
import { commandBarInsets } from "./operation_layout.js";
import { el } from "./ui.js";

function sideToolbar() {
	return document.querySelector('[data-testid="side-toolbar"]') || document.querySelector("nav.side-tool-bar-container");
}

function nativeToolbarParts(graphPanel) {
	const verticalSplitter = graphPanel?.parentElement;
	const centerPanel = verticalSplitter?.parentElement;
	const actionbar = centerPanel?.querySelector(".actionbar-container");
	const trailing = actionbar?.parentElement?.parentElement;
	const topRow = trailing?.parentElement;
	const leading = topRow?.firstElementChild?.firstElementChild;
	return { leading, trailing };
}

function setPortalBounds(element, bounds) {
	if (!element) return;
	element.style.left = `${bounds.left}px`;
	element.style.right = `${Math.max(0, innerWidth - bounds.right)}px`;
	element.style.top = `${bounds.top}px`;
	element.style.bottom = `${Math.max(0, innerHeight - bounds.bottom)}px`;
}

function nativeLeadingRect(element) {
	if (!element) return null;
	const controls = [...element.querySelectorAll("button, a, [role='button']")]
		.filter((control) => control.getClientRects().length)
		.map((control) => control.getBoundingClientRect());
	return controls.length ? { right: Math.max(...controls.map((rect) => rect.right)) } : null;
}

export function createOperationWorkspace({ sidebarId, label, onViewportChange }) {
	const workspaceSelector = `[data-aaalice-operation-workspace="${sidebarId}"]`;
	const backdropSelector = `[data-aaalice-operation-backdrop="${sidebarId}"]`;
	const collapsedSidebarElements = new Set();
	let sidebarContainer = null;
	let root = null;
	let backdrop = null;
	let toolbar = null;
	let scroll = null;
	let canvas = null;
	let empty = null;
	let positionFrame = 0;
	let collapseFrame = 0;
	let viewportFrame = 0;
	let boundsObserver = null;
	let lastViewport = { width: 0, height: 0 };

	function restoreSidebarHost() {
		for (const element of collapsedSidebarElements) element.classList.remove("aaalice-operation-sidebar-collapsed");
		collapsedSidebarElements.clear();
	}

	function collapseSidebarHost() {
		restoreSidebarHost();
		const host = sidebarContainer?.closest?.(".side-bar-panel")
			|| [...document.querySelectorAll(".side-bar-panel")].find((element) => element.getClientRects().length);
		if (!host) return;
		for (const element of [host, host.previousElementSibling, host.nextElementSibling]) {
			if (!(element instanceof HTMLElement)) continue;
			if (element !== host && !element.classList.contains("p-splitter-gutter")) continue;
			element.classList.add("aaalice-operation-sidebar-collapsed");
			collapsedSidebarElements.add(element);
		}
	}

	function measureViewport() {
		viewportFrame = 0;
		if (!scroll?.isConnected) return;
		const next = { width: Math.max(0, scroll.clientWidth), height: Math.max(0, scroll.clientHeight) };
		if (next.width === lastViewport.width && next.height === lastViewport.height) return;
		lastViewport = next;
		onViewportChange?.(next);
	}

	function scheduleViewportMeasure() {
		if (viewportFrame) cancelAnimationFrame(viewportFrame);
		viewportFrame = requestAnimationFrame(measureViewport);
	}

	function position() {
		positionFrame = 0;
		if (!root?.isConnected) return;
		const side = sideToolbar();
		const graphPanel = document.querySelector(".graph-canvas-panel");
		const toolbarRect = side?.getBoundingClientRect();
		const graphRect = graphPanel?.getBoundingClientRect();
		const sidebarOnLeft = !toolbarRect || toolbarRect.left < innerWidth / 2;
		const bounds = {
			left: sidebarOnLeft ? Math.max(0, toolbarRect?.right || 0) : 0,
			right: sidebarOnLeft ? innerWidth : Math.max(0, toolbarRect?.left || innerWidth),
			top: Math.max(0, toolbarRect?.top ?? graphRect?.top ?? 0),
			bottom: Math.max(0, graphRect?.bottom || innerHeight),
		};
		setPortalBounds(backdrop, bounds);
		setPortalBounds(root, bounds);
		root.style.setProperty("--aaalice-operation-native-chrome-height", `${Math.max(0, (graphRect?.top || 0) - bounds.top)}px`);
		const { leading, trailing } = nativeToolbarParts(graphPanel);
		const leadingRect = nativeLeadingRect(leading);
		const trailingRect = trailing?.getClientRects().length ? trailing.getBoundingClientRect() : null;
		const insets = commandBarInsets(bounds, leadingRect, trailingRect);
		root.style.setProperty("--aaalice-operation-command-left", `${insets.left}px`);
		root.style.setProperty("--aaalice-operation-command-right", `${insets.right}px`);
		root.classList.toggle("is-command-compact", insets.width < 620);
		root.classList.toggle("is-command-hidden", insets.width < 180);
		scheduleViewportMeasure();
	}

	function schedulePosition() {
		if (positionFrame) cancelAnimationFrame(positionFrame);
		positionFrame = requestAnimationFrame(position);
	}

	function observeBounds() {
		const graphPanel = document.querySelector(".graph-canvas-panel");
		const native = nativeToolbarParts(graphPanel);
		const observed = [sideToolbar(), graphPanel, native.leading, native.trailing].filter(Boolean);
		boundsObserver = globalThis.ResizeObserver ? new ResizeObserver(schedulePosition) : null;
		for (const element of observed) boundsObserver?.observe(element);
		window.addEventListener("resize", schedulePosition);
	}

	function mount(container) {
		sidebarContainer = container;
		collapseSidebarHost();
		if (collapseFrame) cancelAnimationFrame(collapseFrame);
		collapseFrame = requestAnimationFrame(() => {
			collapseFrame = 0;
			collapseSidebarHost();
			schedulePosition();
		});
		if (sidebarContainer) sidebarContainer.hidden = true;
		if (root?.isConnected) return { root, toolbar, scroll, canvas };
		document.querySelectorAll(`${workspaceSelector}, ${backdropSelector}`).forEach((element) => element.remove());
		backdrop = el("div", {
			className: "aaalice-operation-backdrop aaalice-pcp",
			attrs: { "aria-hidden": "true", "data-aaalice-operation-backdrop": sidebarId },
		});
		root = el("section", {
			className: "aaalice-operation-workspace aaalice-operation aaalice-pcp",
			attrs: { role: "region", "aria-label": label, "data-aaalice-operation-workspace": sidebarId },
		});
		toolbar = el("header", "aaalice-operation-toolbar");
		scroll = el("div", "aaalice-operation-scroll");
		canvas = el("main", { className: "aaalice-operation-canvas", attrs: { "aria-label": label } });
		scroll.append(canvas);
		root.append(toolbar, scroll);
		document.body.append(backdrop, root);
		observeBounds();
		position();
		scheduleViewportMeasure();
		return { root, toolbar, scroll, canvas };
	}

	function setEmpty(element) {
		empty?.remove();
		empty = element || null;
		if (empty && root) root.append(empty);
	}

	function setEditing(editing) {
		root?.classList.toggle("is-editing", Boolean(editing));
	}

	function unmount() {
		boundsObserver?.disconnect();
		boundsObserver = null;
		window.removeEventListener("resize", schedulePosition);
		for (const frame of [positionFrame, collapseFrame, viewportFrame]) if (frame) cancelAnimationFrame(frame);
		positionFrame = 0;
		collapseFrame = 0;
		viewportFrame = 0;
		restoreSidebarHost();
		if (sidebarContainer) sidebarContainer.hidden = false;
		document.querySelectorAll(`${workspaceSelector}, ${backdropSelector}`).forEach((element) => element.remove());
		root = null;
		backdrop = null;
		toolbar = null;
		scroll = null;
		canvas = null;
		empty = null;
		sidebarContainer = null;
		lastViewport = { width: 0, height: 0 };
	}

	return { mount, unmount, setEmpty, setEditing, get elements() { return { root, toolbar, scroll, canvas }; } };
}
