/** Reusable composite components for Aaalice sidebar workspaces. */

import { button, checkboxControl, el, icon, iconButton, segmentedControl } from "./ui.js";
import { DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN } from "./dashboard_sizing.js";

export function createWorkspaceShell({ title, tabs, activeTab, onTabChange, headerActions = [] }) {
	const root = el("div", "aa-workspace");
	root.dataset.workspace = activeTab;
	const header = el("header", "aa-workspace-header");
	const tablist = segmentedControl({
		value: activeTab,
		options: tabs,
		ariaLabel: title,
		className: "aa-workspace-tabs",
		onChange: (value) => { root.dataset.workspace = value; onTabChange?.(value); },
	});
	const content = el("main", "aa-workspace-content");
	const setActive = (value) => { root.dataset.workspace = value; tablist.setValue(value); };
	header.append(tablist, ...headerActions); root.append(header, content);
	return { root, header, content, setActive };
}

export function createWorkspaceToolbar(actions = [], { className = "", label = null } = {}) {
	return el("div", { className: `aa-workspace-toolbar${className ? ` ${className}` : ""}`, attrs: { role: "toolbar", "aria-label": label }, children: actions });
}

export function createSelectionActionBar({ ariaLabel, actions = [] }) {
	const summary = el("span", "aa-dashboard-selection-summary"); const controls = new Map();
	const root = el("div", { className: "aa-dashboard-selection-bar", attrs: { role: "toolbar", "aria-label": ariaLabel }, children: [summary] });
	for (const action of actions) {
		const control = action.showLabel
			? button({ label: action.label, iconName: action.iconName, variant: action.variant || "ghost", size: "sm", className: action.className || "", onClick: action.onSelect })
			: iconButton({ iconName: action.iconName, label: action.label, variant: action.variant || "ghost", className: action.className || "", onClick: action.onSelect });
		control.dataset.selectionAction = action.id; controls.set(action.id, control); root.append(control);
	}
	root.hidden = true;
	return {
		root,
		update({ count = 0, summary: nextSummary = "", actions: states = {} } = {}) {
			summary.textContent = nextSummary; root.hidden = count === 0;
			for (const [id, control] of controls) {
				const state = states[id] || {}; control.disabled = Boolean(state.disabled); control.hidden = Boolean(state.hidden);
			}
		},
	};
}

export function formatFileSize(bytes) {
	const size = Number(bytes) || 0;
	if (size < 1024) return `${size} B`;
	if (size < 1024 ** 2) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
	return `${(size / (1024 ** 2)).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`;
}

export function createTransferHero({ iconName, eyebrow, title, description, fileName = "", fileMeta = "", tone = "neutral" }) {
	const copy = el("div", "aa-transfer-hero__copy");
	if (eyebrow) copy.append(el("span", "aa-transfer-eyebrow", eyebrow));
	copy.append(el("strong", null, title));
	if (description) copy.append(el("p", null, description));
	const root = el("section", { className: `aa-transfer-hero is-${tone}`, children: [el("span", { className: "aa-transfer-hero__icon", children: [icon(iconName)] }), copy] });
	if (fileName) root.append(el("div", { className: "aa-transfer-file", children: [el("strong", null, fileName), el("span", null, fileMeta)] }));
	return root;
}

export function createTransferStats(items) {
	return el("div", { className: "aa-transfer-stats", children: items.map(({ label, value, tone = "neutral" }) => el("div", {
		className: `aa-transfer-stat is-${tone}`, children: [el("strong", null, String(value)), el("span", null, label)],
	})) });
}

export function createTransferSection({ title, description = "", count = null, tone = "neutral", open = false, children = [] }) {
	const summary = el("summary", { children: [el("span", "aa-transfer-section__marker"), el("div", { className: "aa-transfer-section__copy", children: [el("strong", null, title), ...(description ? [el("small", null, description)] : [])] }), ...(count == null ? [] : [el("span", "aa-transfer-section__count", String(count))]), icon("moveDown")] });
	const details = el("details", { className: `aa-transfer-section is-${tone}`, attrs: { open }, children: [summary, el("div", { className: "aa-transfer-section__body", children })] });
	return details;
}

export function createTransferResult({ title, description, count = null, countLabel = "", tone = "success" }) {
	return el("div", { className: `aa-transfer-result is-${tone}`, children: [
		el("span", { className: "aa-transfer-result__icon", children: [icon(tone === "error" ? "statusError" : "statusCheck")] }),
		el("strong", null, title), el("p", null, description),
		...(count == null ? [] : [el("div", { className: "aa-transfer-result__count", children: [el("strong", null, String(count)), el("span", null, countLabel)] })]),
	] });
}

export function createCollapsibleSearch({ open = false, value = "", label, closeLabel = label, placeholder, disabled = false, focus = false, onToggle, onInput }) {
	const toggle = iconButton({ iconName: "search", label: value ? `${label}: ${value}` : label, active: open || Boolean(value), variant: "ghost", disabled, onClick: () => onToggle?.(!open) });
	toggle.setAttribute("aria-expanded", String(open));
	if (!open) return { toggle, panel: null, input: null };
	const input = document.createElement("input"); input.type = "search"; input.value = value; input.placeholder = placeholder; input.setAttribute("aria-label", label);
	input.addEventListener("input", () => onInput?.(input.value));
	input.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); onToggle?.(false); } });
	const panel = el("div", { className: "aa-workspace-search", children: [
		icon("search"), input,
		iconButton({ iconName: "close", label: closeLabel, variant: "ghost", onClick: () => onToggle?.(false) }),
	] });
	if (focus) queueMicrotask(() => { if (input.isConnected) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); } });
	return { toggle, panel, input };
}

export function createPageRail(initialState = {}) {
	const root = el("nav", { className: "aa-dashboard-page-rail", attrs: { "aria-orientation": "vertical" } });
	const list = el("div", "aa-dashboard-page-list");
	const cursor = el("span", { className: "aa-dashboard-page-cursor", attrs: { "aria-hidden": "true" } });
	list.append(cursor); root.append(list);
	const items = new Map();
	let state = { pages: [], activeId: null, expanded: false, editMode: false, labels: {} };
	let cursorFrame = 0;
	let wheelDistance = 0;
	let wheelDirection = 0;
	let wheelResetTimer = 0;
	let temporaryExpansionTimer = 0;
	let pointerHovered = false;
	let cursorInitialized = false;
	const setExpanded = (expanded) => {
		state.expanded = Boolean(expanded);
		root.classList.toggle("is-expanded", state.expanded);
		state.onExpandedChange?.(state.expanded);
	};
	const positionCursor = ({ animate = true } = {}) => {
		cancelAnimationFrame(cursorFrame);
		cursorFrame = requestAnimationFrame(() => {
			const active = items.get(state.activeId);
			cursor.hidden = !active;
			if (!active?.isConnected) return;
			const shouldAnimate = animate && cursorInitialized;
			cursor.classList.toggle("is-initializing", !shouldAnimate);
			cursor.style.transform = `translate3d(0, ${active.offsetTop}px, 0)`;
			cursorInitialized = true;
			if (!shouldAnimate) requestAnimationFrame(() => cursor.classList.remove("is-initializing"));
		});
	};
	const updateItem = (item, page) => {
		const active = page.id === state.activeId;
		item.dataset.pageId = page.id;
		item.draggable = Boolean(state.editMode);
		item.classList.toggle("is-active", active);
		item.setAttribute("aria-label", page.name);
		item.querySelector(".aa-ui-button__label").textContent = page.name;
		if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
	};
	const update = (nextState = {}, { animate = true } = {}) => {
		state = { ...state, ...nextState, pages: nextState.pages || state.pages, labels: nextState.labels || state.labels };
		root.classList.toggle("is-empty", state.pages.length === 0);
		root.classList.toggle("is-expanded", Boolean(state.expanded));
		root.setAttribute("aria-label", state.labels.pages || "Dashboard pages");
		const nextIds = new Set(state.pages.map((page) => page.id));
		for (const [id, item] of items) if (!nextIds.has(id)) { item.remove(); items.delete(id); }
		for (const page of state.pages) {
			let item = items.get(page.id);
			if (!item) {
				item = button({ label: page.name, ariaLabel: page.name, variant: "ghost", size: "sm", className: "aa-dashboard-page-dot" });
				item.prepend(el("span", { className: "aa-dashboard-page-dot__marker", attrs: { "aria-hidden": "true" } }));
				items.set(page.id, item);
			}
			updateItem(item, page);
			list.append(item);
		}
		positionCursor({ animate });
	};
	const selectIndex = (index, { focus = false, source = "navigation" } = {}) => {
		const next = state.pages[Math.max(0, Math.min(state.pages.length - 1, index))];
		if (!next || next.id === state.activeId) return;
		state.activeId = next.id;
		for (const page of state.pages) updateItem(items.get(page.id), page);
		positionCursor();
		if (focus) queueMicrotask(() => items.get(next.id)?.focus({ preventScroll: true }));
		state.onSelect?.(next.id, { focus, source });
	};
	root.addEventListener("click", (event) => {
		const item = event.target.closest(".aa-dashboard-page-dot");
		const index = state.pages.findIndex((page) => page.id === item?.dataset.pageId);
		if (index >= 0) selectIndex(index);
	});
	root.addEventListener("pointerenter", () => {
		pointerHovered = true;
		clearTimeout(temporaryExpansionTimer);
		setExpanded(true);
	});
	root.addEventListener("pointerleave", () => {
		pointerHovered = false;
		clearTimeout(temporaryExpansionTimer);
		setExpanded(false);
	});
	root.addEventListener("wheel", (event) => {
		if (event.ctrlKey || state.pages.length < 2 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		event.preventDefault();
		let delta = event.deltaY;
		if (event.deltaMode === 1) delta *= 16;
		else if (event.deltaMode === 2) delta *= Math.max(1, root.clientHeight);
		const direction = Math.sign(delta);
		if (direction && direction !== wheelDirection) wheelDistance = 0;
		wheelDirection = direction;
		wheelDistance += delta;
		clearTimeout(wheelResetTimer);
		wheelResetTimer = setTimeout(() => { wheelDistance = 0; wheelDirection = 0; }, 180);
		if (Math.abs(wheelDistance) < 36) return;
		selectIndex(state.pages.findIndex((page) => page.id === state.activeId) + Math.sign(wheelDistance));
		wheelDistance = 0;
	}, { passive: false });
	root.addEventListener("keydown", (event) => {
		if (!event.target.closest(".aa-dashboard-page-dot")) return;
		const activeIndex = state.pages.findIndex((page) => page.id === state.activeId);
		let nextIndex = null;
		if (event.key === "ArrowUp" || event.key === "PageUp") nextIndex = activeIndex - 1;
		else if (event.key === "ArrowDown" || event.key === "PageDown") nextIndex = activeIndex + 1;
		else if (event.key === "Home") nextIndex = 0;
		else if (event.key === "End") nextIndex = pages.length - 1;
		if (nextIndex == null) return;
		event.preventDefault();
		selectIndex(nextIndex, { focus: true });
	});
	root.addEventListener("dragstart", (event) => {
		const item = event.target.closest(".aa-dashboard-page-dot");
		if (state.editMode && item) event.dataTransfer?.setData("application/x-aaalice-page", item.dataset.pageId);
	});
	root.addEventListener("dragover", (event) => { if (state.editMode && event.target.closest(".aa-dashboard-page-dot")) event.preventDefault(); });
	root.addEventListener("drop", (event) => {
		const item = event.target.closest(".aa-dashboard-page-dot");
		if (!state.editMode || !item) return;
		event.preventDefault();
		const source = event.dataTransfer?.getData("application/x-aaalice-page");
		if (source) state.onReorder?.(source, item.dataset.pageId);
	});
	root.update = update;
	root.selectIndex = (index, options) => selectIndex(index, options);
	root.showTemporarily = (duration = 1100) => {
		clearTimeout(temporaryExpansionTimer);
		setExpanded(true);
		temporaryExpansionTimer = setTimeout(() => {
			if (!pointerHovered) setExpanded(false);
		}, duration);
	};
	root.destroy = () => { cancelAnimationFrame(cursorFrame); clearTimeout(wheelResetTimer); clearTimeout(temporaryExpansionTimer); };
	update(initialState, { animate: false });
	return root;
}

export function createControlCard({ item, title, control, status = "ok", editMode, labels = {}, onManage, onMove, onRemove, onToggleSpan, onToggleCompact, onGroup, onUngroup }) {
	const headerOnly = control?.dataset?.headerOnly === "true";
	const unavailable = control?.dataset?.controlAvailability && control.dataset.controlAvailability !== "ready";
	const root = el("article", { className: `aa-control-card${item.compact ? " is-compact" : ""}${status !== "ok" ? " is-missing" : ""}${unavailable ? " is-unavailable" : ""}${headerOnly ? " is-header-only" : ""}`, attrs: { "data-item-id": item.id, "data-dashboard-item-id": item.id, "data-provider": item.binding?.provider || "layout", tabindex: onManage ? 0 : null, "aria-label": title } });
	if (control?.dataset?.controlKind) root.dataset.controlKind = control.dataset.controlKind;
	if (control?.dataset?.controlFamily) root.dataset.controlFamily = control.dataset.controlFamily;
	root.dataset.dashboardMinRowSpan = String(headerOnly ? DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN : DASHBOARD_DEFAULT_CONTROL_ROW_SPAN);
	const header = el("header", "aa-control-card-header");
	header.append(el("span", "aa-control-card-title", title));
	if (control?.headerAccessories?.length) header.append(...control.headerAccessories);
	root.append(header, control || el("p", "aa-control-card-error", status === "incompatible" ? (labels.incompatible || "Incompatible control") : (labels.missing || "Missing binding")));
	if (editMode && item.kind === "control") root.append(el("button", { className: "aa-dashboard-resize-handle", attrs: { type: "button", "data-dashboard-resize-handle": "true", "aria-label": labels.resizeCard || "Resize card" } }));
	const openMenu = (x, y) => onManage?.({ x, y, editMode, onMove, onRemove, onToggleSpan, onToggleCompact, onGroup, onUngroup });
	root.addEventListener("contextmenu", (event) => {
		const input = event.target.closest?.("input, textarea, [contenteditable='true']");
		const preservesNativeEditing = input?.matches?.("textarea, [contenteditable='true'], input:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='button']):not([type='file'])");
		if (preservesNativeEditing) return;
		event.preventDefault(); event.stopPropagation(); root.focus({ preventScroll: true }); openMenu(event.clientX, event.clientY);
	});
	root.addEventListener("keydown", (event) => {
		if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
		event.preventDefault();
		const rect = root.getBoundingClientRect(); openMenu(rect.left + Math.min(rect.width, 36), rect.top + Math.min(rect.height, 28));
	});
	return root;
}

export function createListRow({ title, description = "", selected = false, onSelect, leading = null, actions = [] }) {
	const root = el("div", `aa-workspace-list-row${selected ? " is-selected" : ""}`);
	const copy = el("div", "aa-workspace-list-row-copy"); copy.append(el("strong", null, title));
	if (description) copy.append(el("small", null, description));
	if (onSelect) {
		const checkbox = checkboxControl({ checked: selected, label: title, onChange: (checked) => { root.classList.toggle("is-selected", checked); onSelect(checked); } });
		root.classList.add("is-selectable");
		root.selectionControl = checkbox;
		root.append(checkbox);
		root.addEventListener("click", (event) => { if (!event.target.closest?.("button, input, select, textarea, a")) checkbox.click(); });
	} else root.classList.add("is-static");
	if (leading) { root.classList.add("has-leading"); root.append(leading); }
	root.append(copy, ...actions); return root;
}
