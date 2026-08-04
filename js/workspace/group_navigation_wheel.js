import { t } from "../i18n.js";
import { button, el, iconButton } from "../lib/ui.js";
import { cycleWheelIndex, pageStep, wheelPage, wheelSectorAngle, wheelSectorIndex, clampWheelCenter, GROUP_NAVIGATION_WHEEL_DEAD_ZONE, GROUP_NAVIGATION_WHEEL_PAGE_SIZE } from "../lib/group_navigation_wheel_model.js";

let activeSession = null;
let lastCanvasPointer = null;

export function rememberGroupNavigationCanvasPointer(event, graph) {
	if (!event || event.pointerType === "touch" || !graph) return;
	lastCanvasPointer = { x: event.clientX, y: event.clientY, graph };
}

export function clearGroupNavigationCanvasPointer() {
	lastCanvasPointer = null;
}

export function isGroupNavigationCanvasPointerEvent(event, canvas) {
	if (!event || !canvas) return false;
	if (event.target === canvas) return true;
	const path = typeof event.composedPath === "function" ? event.composedPath() : [];
	if (path.includes(canvas)) return true;
	return path.some((target) => isGroupNavigationCanvasPointerTarget(target, canvas));
}

function isGroupNavigationCanvasPointerTarget(target, canvas) {
	return target === canvas || (target?.nodeType === 1 && target.matches?.("[data-testid='transform-pane'], [data-node-id], .dom-widget"));
}

export function groupNavigationWheelCenter(graph, trigger = "keyboard") {
	const viewport = { width: globalThis.innerWidth || 0, height: globalThis.innerHeight || 0 };
	const point = trigger === "keyboard" && lastCanvasPointer?.graph === graph ? lastCanvasPointer : null;
	const radius = Math.min(218, Math.max(150, Math.min(viewport.width, viewport.height) * 0.27));
	return clampWheelCenter(point, viewport, radius);
}

export function openGroupNavigationWheel({ owner, graph = null, canvasElement = null, entries, center, shortcutCode = null, shortcutLabel = "", activationPointer = null, trigger = "keyboard", onNavigate }) {
	if (activeSession) closeGroupNavigationWheel();
	const session = createSession({ owner, graph, canvasElement, entries, center, shortcutCode, shortcutLabel, activationPointer, trigger, onNavigate });
	activeSession = session;
	session.open();
	return session;
}

export function closeGroupNavigationWheel(owner = null, reason = "cancel") {
	if (!activeSession || (owner && activeSession.owner !== owner)) return false;
	const session = activeSession;
	activeSession = null;
	session.close(reason);
	return true;
}

export function isGroupNavigationWheelOpen(owner = null) {
	return Boolean(activeSession && (!owner || activeSession.owner === owner));
}

export function dispatchGroupNavigationWheelKeydown(event) {
	return activeSession?.handleKeydown(event) || false;
}

export function dispatchGroupNavigationWheelKeyup(event) {
	return activeSession?.handleKeyup(event) || false;
}

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function createSession({ owner, graph, canvasElement, entries, center, shortcutCode, shortcutLabel, activationPointer, trigger, onNavigate }) {
	const source = Array.isArray(entries) ? entries.slice() : [];
	const viewport = { width: globalThis.innerWidth || 0, height: globalThis.innerHeight || 0 };
	const safeCenter = clampWheelCenter(center, viewport, Math.min(218, Math.max(150, Math.min(viewport.width, viewport.height) * 0.27)));
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	let pageIndex = 0;
	let selectedIndex = null;
	let closed = false;
	let activePointerId = null;
	let pointerStart = null;
	let pointerMoved = false;
	let lastPointerPosition = null;
	let wheelDelta = 0;
	let sectorButtons = [];
	if (activationPointer && Number.isFinite(activationPointer.clientX) && Number.isFinite(activationPointer.clientY)) lastPointerPosition = { clientX: activationPointer.clientX, clientY: activationPointer.clientY };

	const root = el("div", { className: "aa-group-navigation-wheel-root", attrs: {
		role: "dialog", "aria-modal": "true", "aria-label": t("aaalice.workspace.groupNavigation.wheel.ariaLabel", "Group navigation wheel"), tabindex: "-1",
		"data-aa-group-navigation-wheel": "true", "data-aa-owner": owner?.dataset?.workspaceRootId || "group-navigation",
	} });
	const wheel = el("div", { className: "aa-group-navigation-wheel", attrs: { style: `--wheel-x:${safeCenter.x}px;--wheel-y:${safeCenter.y}px;` } });
	const sectors = el("div", { className: "aa-group-navigation-wheel-sectors" });
	const centerPanel = el("div", { className: "aa-group-navigation-wheel-center" });
	const wheelSurface = el("div", { className: "aa-group-navigation-wheel-surface" });
	const centerStatus = el("strong", { className: "aa-group-navigation-wheel-center-status", attrs: { "aria-live": "polite" } }, t("aaalice.workspace.groupNavigation.wheel.cancelHint", "Release to cancel"));
	const centerHint = el("small", { className: "aa-group-navigation-wheel-center-hint", text: trigger === "keyboard"
		? message("aaalice.workspace.groupNavigation.wheel.releaseHint", "Release {key} to jump · scroll to change page", { key: shortcutLabel })
		: message("aaalice.workspace.groupNavigation.wheel.clickHint", "Aim at a group or scroll to change page") });
	const pageControls = el("div", { className: "aa-group-navigation-wheel-page-controls" });
	const previousPage = iconButton({ iconName: "arrowRight", label: t("aaalice.workspace.groupNavigation.wheel.previousPage", "Previous page"), variant: "ghost", className: "aa-group-navigation-wheel-page is-previous" });
	const pageLabel = el("span", { className: "aa-group-navigation-wheel-page-label" });
	const nextPage = iconButton({ iconName: "arrowRight", label: t("aaalice.workspace.groupNavigation.wheel.nextPage", "Next page"), variant: "ghost", className: "aa-group-navigation-wheel-page is-next" });
	pageControls.append(previousPage, pageLabel, nextPage);
	centerPanel.append(centerStatus, pageControls, centerHint);
	wheelSurface.append(sectors, centerPanel);
	wheel.append(wheelSurface);
	root.append(wheel);

	const page = () => wheelPage(source, pageIndex, GROUP_NAVIGATION_WHEEL_PAGE_SIZE);
	const itemName = (item) => String(item?.name || item?.entry?.label || item?.entry?.groupId || "");
	const itemMeta = (item) => {
		if (!item?.selectable) return t("aaalice.workspace.groupNavigation.wheel.missing", "Missing group");
		return message("aaalice.workspace.groupNavigation.wheel.nodes", "{count} nodes · {status}", { count: item.nodeCount || 0, status: item.statusLabel || "" });
	};

	const setSelection = (index) => {
		if (index !== null && (!Number.isInteger(index) || !sectorButtons[index])) index = null;
		selectedIndex = index;
		if (index === null) {
			wheel.style.setProperty("--wheel-tilt-x", "0deg");
			wheel.style.setProperty("--wheel-tilt-y", "0deg");
		} else {
			const angle = wheelSectorAngle(index, page().items.length);
			const tilt = 4.5;
			wheel.style.setProperty("--wheel-tilt-x", `${(-Math.sin(angle) * tilt).toFixed(2)}deg`);
			wheel.style.setProperty("--wheel-tilt-y", `${(Math.cos(angle) * tilt).toFixed(2)}deg`);
		}
		for (const [buttonElement, buttonIndex] of sectorButtons) {
			buttonElement.classList.toggle("is-selected", buttonIndex === selectedIndex);
			buttonElement.setAttribute("aria-pressed", buttonIndex === selectedIndex ? "true" : "false");
		}
		const selected = index === null ? null : page().items[index];
		if (!selected) {
			centerStatus.textContent = t("aaalice.workspace.groupNavigation.wheel.cancelHint", "Release to cancel");
			centerPanel.classList.remove("is-missing", "has-selection");
			centerPanel.style.removeProperty("--group-color");
			root.setAttribute("aria-label", t("aaalice.workspace.groupNavigation.wheel.ariaLabel", "Group navigation wheel"));
			return;
		}
		const name = itemName(selected);
		centerStatus.textContent = name;
		centerPanel.classList.toggle("is-missing", !selected.selectable);
		centerPanel.classList.add("has-selection");
		if (selected.color) centerPanel.style.setProperty("--group-color", selected.color);
		else centerPanel.style.removeProperty("--group-color");
		root.setAttribute("aria-label", message("aaalice.workspace.groupNavigation.wheel.selected", "Selected group: {group}", { group: name }));
	};

	const rememberCurrentPointer = () => {
		if (!graph || !lastPointerPosition || !Number.isFinite(lastPointerPosition.clientX) || !Number.isFinite(lastPointerPosition.clientY)) return;
		const target = typeof document.elementFromPoint === "function" ? document.elementFromPoint(lastPointerPosition.clientX, lastPointerPosition.clientY) : null;
		if (trigger === "keyboard" || isGroupNavigationCanvasPointerTarget(target, canvasElement)) {
			lastCanvasPointer = { x: lastPointerPosition.clientX, y: lastPointerPosition.clientY, graph };
		}
	};

	const commit = () => {
		if (closed) return;
		const selected = selectedIndex === null ? null : page().items[selectedIndex];
		if (!selected?.selectable) {
			closeGroupNavigationWheel(owner, "cancel");
			return;
		}
		const target = selected.entry;
		closeGroupNavigationWheel(owner, "navigate");
		onNavigate?.(target);
	};

	const renderPage = () => {
		const current = page();
		selectedIndex = null;
		sectorButtons = [];
		sectors.replaceChildren();
		pageLabel.textContent = current.totalPages > 1 ? message("aaalice.workspace.groupNavigation.wheel.page", "{current} / {total}", { current: current.index + 1, total: current.totalPages }) : "";
		previousPage.disabled = !current.hasPrevious;
		nextPage.disabled = !current.hasNext;
		pageControls.hidden = current.totalPages <= 1;
		for (const [index, item] of current.items.entries()) {
			const name = itemName(item);
			const sector = button({ label: null, variant: "ghost", className: `aa-group-navigation-wheel-sector${item.selectable ? "" : " is-missing"}`, disabled: !item.selectable, ariaLabel: item.selectable ? message("aaalice.workspace.groupNavigation.wheel.goTo", "Go to {group}", { group: name }) : message("aaalice.workspace.groupNavigation.wheel.missingGroup", "Missing group: {group}", { group: name }) });
			sector.dataset.wheelIndex = String(index);
			sector.setAttribute("aria-pressed", "false");
			sector.setAttribute("aria-disabled", item.selectable ? "false" : "true");
			const angle = (index * 360) / Math.max(1, current.items.length);
			sector.style.setProperty("--wheel-index", String(index));
			sector.style.setProperty("--wheel-angle", `${angle}deg`);
			sector.style.setProperty("--wheel-angle-reverse", `${-angle}deg`);
			if (item.color) sector.style.setProperty("--group-color", item.color);
			const marker = el("span", { className: "aa-group-navigation-wheel-sector-marker", attrs: { "aria-hidden": "true" } });
			const copy = el("span", { className: "aa-group-navigation-wheel-sector-copy", children: [el("strong", null, name), el("small", null, itemMeta(item))] });
			sector.append(marker, copy);
			sector.addEventListener("pointerenter", () => setSelection(index));
			sector.addEventListener("focus", () => setSelection(index));
			sectors.append(sector);
			sectorButtons.push([sector, index]);
		}
		setSelection(null);
	};

	const changePage = (direction, pointer = null) => {
		const next = pageStep(pageIndex, direction, page().totalPages);
		if (next === pageIndex) return;
		pageIndex = next;
		renderPage();
		if (pointer) updateFromPointer(pointer);
	};

	const updateFromPointer = (event) => {
		lastPointerPosition = { clientX: event.clientX, clientY: event.clientY };
		const rect = root.getBoundingClientRect();
		const x = event.clientX - (rect.left + safeCenter.x);
		const y = event.clientY - (rect.top + safeCenter.y);
		const index = wheelSectorIndex(x, y, page().items.length, { deadZone: GROUP_NAVIGATION_WHEEL_DEAD_ZONE });
		setSelection(index);
	};

	const onPointerDown = (event) => {
		event.preventDefault(); event.stopPropagation();
		if (event.target.closest?.("[data-wheel-page-control]")) return;
		activePointerId = event.pointerId;
		pointerStart = { clientX: event.clientX, clientY: event.clientY };
		pointerMoved = true;
		root.setPointerCapture?.(event.pointerId);
		updateFromPointer(event);
	};
	const onPointerMove = (event) => {
		event.preventDefault(); event.stopPropagation();
		if (activePointerId !== null && event.pointerId !== activePointerId) return;
		if (pointerStart && !pointerMoved && Math.hypot(event.clientX - pointerStart.clientX, event.clientY - pointerStart.clientY) < 10) return;
		pointerMoved = true;
		updateFromPointer(event);
	};
	const onPointerUp = (event) => {
		event.preventDefault(); event.stopPropagation();
		if (activePointerId === null || event.pointerId !== activePointerId) return;
		root.releasePointerCapture?.(activePointerId);
		activePointerId = null;
		const moved = pointerMoved;
		pointerStart = null;
		pointerMoved = false;
		if (event.target.closest?.("[data-wheel-page-control]")) return;
		if (trigger === "keyboard") return;
		if (!moved) {
			closeGroupNavigationWheel(owner, "cancel");
			return;
		}
		const rect = root.getBoundingClientRect();
		const centerDistance = Math.hypot(event.clientX - (rect.left + safeCenter.x), event.clientY - (rect.top + safeCenter.y));
		if (centerDistance < GROUP_NAVIGATION_WHEEL_DEAD_ZONE) {
			setSelection(null);
			closeGroupNavigationWheel(owner, "cancel");
		} else commit();
	};
	const onPointerCancel = () => closeGroupNavigationWheel(owner, "cancel");
	const onWheel = (event) => {
		event.preventDefault();
		event.stopPropagation();
		const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
		if (!delta) return;
		if (wheelDelta && Math.sign(wheelDelta) !== Math.sign(delta)) wheelDelta = 0;
		wheelDelta += delta;
		const threshold = event.deltaMode === 1 ? 3 : 40;
		if (Math.abs(wheelDelta) < threshold) return;
		const direction = wheelDelta > 0 ? 1 : -1;
		wheelDelta = 0;
		changePage(direction, Number.isFinite(event.clientX) && Number.isFinite(event.clientY) ? event : lastPointerPosition);
	};
	const onBlur = () => closeGroupNavigationWheel(owner, "cancel");
	const onVisibilityChange = () => { if (document.visibilityState !== "visible") closeGroupNavigationWheel(owner, "cancel"); };
	const onResize = () => closeGroupNavigationWheel(owner, "cancel");

	const session = {
		owner,
		open() {
			renderPage();
			previousPage.dataset.wheelPageControl = "previous";
			nextPage.dataset.wheelPageControl = "next";
			previousPage.addEventListener("click", () => changePage(-1));
			nextPage.addEventListener("click", () => changePage(1));
			root.addEventListener("pointerdown", onPointerDown);
			root.addEventListener("pointermove", onPointerMove);
			root.addEventListener("pointerup", onPointerUp);
			root.addEventListener("pointercancel", onPointerCancel);
			document.addEventListener("wheel", onWheel, { capture: true, passive: false });
			window.addEventListener("blur", onBlur);
			document.addEventListener("visibilitychange", onVisibilityChange);
			window.addEventListener("resize", onResize);
			document.body.append(root);
			if (activationPointer) {
				activePointerId = activationPointer.pointerId;
				pointerStart = { clientX: activationPointer.clientX, clientY: activationPointer.clientY };
				pointerMoved = false;
				root.setPointerCapture?.(activePointerId);
			}
			root.focus({ preventScroll: true });
		},
		handleKeydown(event) {
			if (event.isComposing) return false;
			if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeGroupNavigationWheel(owner, "cancel"); return true; }
			if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); return true; }
			if (event.key === "PageUp") { event.preventDefault(); event.stopPropagation(); changePage(-1, lastPointerPosition); return true; }
			if (event.key === "PageDown") { event.preventDefault(); event.stopPropagation(); changePage(1, lastPointerPosition); return true; }
			if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
				event.preventDefault(); event.stopPropagation();
				setSelection(cycleWheelIndex(selectedIndex, ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1, page().items));
				return true;
			}
			return false;
		},
		handleKeyup(event) {
			if (event.isComposing || !shortcutLabel || event.code !== activeShortcutCode) return false;
			event.preventDefault(); event.stopPropagation();
			commit();
			return true;
		},
		close() {
			if (closed) return;
			closed = true;
			if (activePointerId !== null) root.releasePointerCapture?.(activePointerId);
			activePointerId = null;
			pointerStart = null;
			pointerMoved = false;
			root.removeEventListener("pointerdown", onPointerDown);
			root.removeEventListener("pointermove", onPointerMove);
			root.removeEventListener("pointerup", onPointerUp);
			root.removeEventListener("pointercancel", onPointerCancel);
			document.removeEventListener("wheel", onWheel, { capture: true });
			window.removeEventListener("blur", onBlur);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("resize", onResize);
			root.remove();
			rememberCurrentPointer();
			if (previousFocus?.isConnected && !previousFocus.closest?.("[data-aa-group-navigation-wheel]")) previousFocus.focus({ preventScroll: true });
		},
	};
	const activeShortcutCode = trigger === "keyboard" ? shortcutCode : null;
	return session;
}
