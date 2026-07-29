/** Pointer-driven transient Dashboard V2 layout editing. */

import { applyMarqueeSelection, marqueeSelectionIds, nearestInDirection, nextClickSelection, selectionRectangle } from "./dashboard_selection.js";
import { DASHBOARD_GRID_COLUMNS, DASHBOARD_MIN_CONTROL_COLUMN_SPAN } from "./dashboard_sizing.js";

const DRAG_THRESHOLD = 5;

export function bindDashboardBoundaryPaging(scroller, { state = {}, isEnabled = () => true, canAdvance = () => false, canRetreat = () => false, onAdvance, onRetreat, settleDelay = 220 } = {}) {
	const armNextGesture = () => {
		clearTimeout(state.resetTimer);
		state.resetTimer = setTimeout(() => { state.locked = false; }, settleDelay);
	};
	const turnPage = (direction) => {
		if (!isEnabled()) return false;
		const allowed = direction > 0 ? canAdvance() : canRetreat();
		if (state.locked || !allowed) return false;
		state.locked = true;
		if (direction > 0) onAdvance?.(); else onRetreat?.();
		return true;
	};
	const atBoundary = (direction) => {
		const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
		return maxScrollTop <= 1 || (direction > 0 ? scroller.scrollTop >= maxScrollTop - 1 : scroller.scrollTop <= 1);
	};
	const onWheel = (event) => {
		if (event.defaultPrevented || event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		const direction = Math.sign(event.deltaY);
		armNextGesture();
		if (!isEnabled() || state.locked || !(direction > 0 ? canAdvance() : canRetreat())) return;
		if (atBoundary(direction)) { if (turnPage(direction)) event.preventDefault(); return; }
		requestAnimationFrame(() => { if (scroller.isConnected && atBoundary(direction)) turnPage(direction); });
	};
	scroller.addEventListener("wheel", onWheel, { passive: false });
	return () => scroller.removeEventListener("wheel", onWheel);
}

function gridTargetAt(grid, clientX, clientY) {
	const style = getComputedStyle(grid); const columns = Math.max(1, Number(grid.dataset.dashboardColumns || style.getPropertyValue("--aa-dashboard-columns")) || DASHBOARD_GRID_COLUMNS);
	const rect = grid.getBoundingClientRect(); const paddingLeft = parseFloat(style.paddingLeft) || 0; const paddingRight = parseFloat(style.paddingRight) || 0; const paddingTop = parseFloat(style.paddingTop) || 0;
	const columnGap = parseFloat(style.columnGap) || 0; const rowGap = parseFloat(style.rowGap) || 0; const rowHeight = parseFloat(style.gridAutoRows) || 4;
	const contentWidth = Math.max(1, rect.width - paddingLeft - paddingRight); const columnWidth = (contentWidth - columnGap * (columns - 1)) / columns;
	const localX = Math.max(0, clientX - rect.left - paddingLeft); const column = columns === 1 ? 0 : Math.max(0, Math.min(columns - 1, Math.floor(localX / Math.max(1, columnWidth + columnGap))));
	const localY = Math.max(0, clientY - rect.top - paddingTop); const row = Math.max(0, Math.floor(localY / Math.max(1, rowHeight + rowGap)));
	return { grid, row, column, groupId: grid.closest("[data-dashboard-group-id]")?.dataset.dashboardGroupId || null };
}

function targetAt(root, clientX, clientY) {
	const hit = document.elementFromPoint(clientX, clientY);
	const groupGrid = hit?.closest?.(".aa-dashboard-group-grid");
	if (groupGrid && root.contains(groupGrid)) return gridTargetAt(groupGrid, clientX, clientY);
	return gridTargetAt(root, clientX, clientY);
}

export function grabSpanOffset(position, start, size, span) {
	const normalizedSpan = Math.max(1, Number(span) || 1);
	const ratio = Math.max(0, Math.min(1, (position - start) / Math.max(1, size)));
	return Math.min(normalizedSpan - 1, Math.floor(ratio * normalizedSpan));
}

export function selectionFootprint(layouts) {
	if (!layouts.length) return { row: 0, column: 0, rowSpan: 1, columnSpan: 1 };
	const row = Math.min(...layouts.map((layout) => layout.row)); const column = Math.min(...layouts.map((layout) => layout.column));
	const bottom = Math.max(...layouts.map((layout) => layout.row + layout.rowSpan)); const right = Math.max(...layouts.map((layout) => layout.column + layout.columnSpan));
	return { row, column, rowSpan: bottom - row, columnSpan: right - column };
}

function showPreview(gesture, target) {
	if (!gesture.preview) { gesture.preview = document.createElement("div"); gesture.preview.className = "aa-dashboard-drop-preview"; }
	const columns = Math.max(1, Number(target.grid.dataset.dashboardColumns || getComputedStyle(target.grid).getPropertyValue("--aa-dashboard-columns")) || DASHBOARD_GRID_COLUMNS);
	const columnSpan = Math.min(gesture.columnSpan, columns); target.column = Math.max(0, Math.min(columns - columnSpan, target.column));
	gesture.preview.style.setProperty("--aa-dashboard-row", String(target.row + 1));
	gesture.preview.style.setProperty("--aa-dashboard-column", String(target.column + 1));
	gesture.preview.style.setProperty("--aa-dashboard-column-span", String(columnSpan));
	gesture.preview.style.setProperty("--aa-dashboard-row-span", String(gesture.rowSpan));
	gesture.preview.dataset.dropRow = String(target.row); gesture.preview.dataset.dropColumn = String(target.column); gesture.preview.dataset.dropRowSpan = String(gesture.rowSpan);
	gesture.preview.setAttribute("aria-hidden", "true");
	if (gesture.preview.parentElement !== target.grid) target.grid.append(gesture.preview);
}

function showResizePreview(gesture, columnSpan, rowSpan) {
	if (!gesture.preview) {
		gesture.preview = document.createElement("div"); gesture.preview.className = "aa-dashboard-drop-preview is-resize";
		gesture.sizeLabel = document.createElement("span"); gesture.sizeLabel.className = "aa-dashboard-resize-size"; gesture.preview.append(gesture.sizeLabel);
		gesture.preview.setAttribute("aria-hidden", "true");
	}
	const visibleColumnSpan = gesture.visibleColumns === 1 ? 1 : columnSpan;
	gesture.preview.style.setProperty("--aa-dashboard-row", gesture.element.style.getPropertyValue("--aa-dashboard-row"));
	gesture.preview.style.setProperty("--aa-dashboard-column", gesture.element.style.getPropertyValue("--aa-dashboard-column"));
	gesture.preview.style.setProperty("--aa-dashboard-column-span", String(visibleColumnSpan));
	gesture.preview.style.setProperty("--aa-dashboard-row-span", String(rowSpan));
	gesture.preview.dataset.dropRow = gesture.element.dataset.dropRow;
	gesture.preview.dataset.dropColumn = gesture.element.dataset.dropColumn;
	gesture.preview.dataset.dropRowSpan = String(rowSpan);
	gesture.preview.dataset.dropColumnSpan = String(columnSpan);
	gesture.sizeLabel.textContent = `${columnSpan} × ${rowSpan}`;
	if (gesture.preview.parentElement !== gesture.grid) gesture.grid.append(gesture.preview);
}

export function bindDashboardInteractions(root, { editMode = false, selectedItemIds = new Set(), selectedGroupIds = new Set(), onSelectionChange, onDropItems, onDropGroup, onResizeItem } = {}) {
	if (!editMode) return () => {};
	let gesture = null;
	let currentItems = new Set(selectedItemIds); let currentGroups = new Set(selectedGroupIds);
	const selectable = (target) => target.closest?.("[data-dashboard-item-id], [data-dashboard-group-id]");
	const isEditableTarget = (target) => Boolean(target.closest?.("input, select, textarea, [contenteditable='true']"));
	const emitSelection = (items, groups) => {
		currentItems = new Set(items); currentGroups = new Set(groups); onSelectionChange?.(currentItems, currentGroups);
	};
	const itemElements = () => [...root.querySelectorAll("[data-dashboard-item-id]")].filter((element) => !element.hidden);
	// 点选/框选共用的选择语义；subtract 只负责移除，不会清空其余选择。
	const clickSelection = (entry, { additive = false, subtract = false } = {}) => {
		const itemId = entry?.dataset.dashboardItemId || null; const groupId = entry?.dataset.dashboardGroupId || null;
		let items = new Set(currentItems); let groups = new Set(currentGroups);
		if (!additive && !subtract && !(itemId ? items.has(itemId) : groups.has(groupId))) { items.clear(); groups.clear(); }
		if (itemId) items = nextClickSelection(items, itemId, { additive, subtract });
		if (groupId) groups = nextClickSelection(groups, groupId, { additive, subtract });
		emitSelection(items, groups); return { items: currentItems, groups: currentGroups };
	};
	const additiveFor = (event) => event.ctrlKey || event.metaKey || event.shiftKey;
	const cleanup = ({ restoreSelection = false } = {}) => {
		if (!gesture) return;
		if (restoreSelection && gesture.kind === "marquee") emitSelection(gesture.initialItems, gesture.initialGroups);
		for (const element of gesture.elements || []) { element.style.removeProperty("transform"); element.classList.remove("is-dragging", "is-resizing"); }
		gesture.preview?.remove();
		gesture.marquee?.remove();
		root.classList.remove("is-dragging"); gesture = null;
	};
	const autoScroll = (clientY) => {
		const scroller = root.closest(".aa-dashboard-scroll") || root; const rect = scroller.getBoundingClientRect();
		if (clientY < rect.top + 36) scroller.scrollBy?.({ top: -12 }); else if (clientY > rect.bottom - 36) scroller.scrollBy?.({ top: 12 });
	};
	const onPointerDown = (event) => {
		if (event.button !== 0) return;
		const resizeHandle = event.target.closest?.("[data-dashboard-resize-handle]");
		if (resizeHandle) {
			const entry = resizeHandle.closest("[data-dashboard-item-id]"); const grid = entry?.parentElement;
			if (!entry || !grid?.matches?.(".aa-dashboard-grid-v2, .aa-dashboard-group-grid")) return;
			clickSelection(entry, { additive: additiveFor(event) });
			const sourceColumnSpan = Math.max(1, Number(entry.dataset.dropColumnSpan) || 1);
			const sourceRowSpan = Math.max(1, Number(entry.dataset.dropRowSpan) || 1);
			gesture = {
				kind: "resize", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
				itemId: entry.dataset.dashboardItemId, elements: [entry], element: entry, grid,
				sourceColumn: Math.max(0, Number(entry.dataset.dropColumn) || 0), sourceColumnSpan, sourceRowSpan,
				minRowSpan: Math.max(1, Number(entry.dataset.dashboardMinRowSpan) || 1),
				sourceColumns: Math.max(1, Number(grid.dataset.dashboardSourceColumns) || DASHBOARD_GRID_COLUMNS),
				visibleColumns: Math.max(1, Number(grid.dataset.dashboardColumns) || DASHBOARD_GRID_COLUMNS),
				nextColumnSpan: sourceColumnSpan, nextRowSpan: sourceRowSpan, dragging: false, preview: null,
			};
			entry.classList.add("is-selected");
			root.setPointerCapture?.(event.pointerId); event.preventDefault(); return;
		}
		if (event.target.closest("button, input, select, textarea, [contenteditable='true']")) return;
		const entry = selectable(event.target);
		// Shift/Alt 在卡片上按下也启动框选，排满的页面里不再依赖空白网格起手；
		// 不拖动则退化为加选切换（Shift）或移除选择（Alt）。
		if (!entry || event.shiftKey || event.altKey) {
			const mode = event.altKey ? "subtract" : "add";
			const additive = event.altKey || additiveFor(event);
			const initialItems = new Set(currentItems); const initialGroups = new Set(currentGroups);
			if (!additive) emitSelection(new Set(), new Set());
			gesture = { kind: "marquee", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mode, initialItems, initialGroups, baseItems: additive ? initialItems : new Set(), baseGroups: additive ? initialGroups : new Set(), pendingToggle: entry || null, dragging: false, marquee: null, badge: null };
			root.setPointerCapture?.(event.pointerId); return;
		}
		const selection = clickSelection(entry, { additive: additiveFor(event) }); const itemId = entry.dataset.dashboardItemId; const groupId = entry.dataset.dashboardGroupId;
		const elements = itemId ? itemElements().filter((element) => selection.items.has(element.dataset.dashboardItemId)) : [entry];
		const layouts = elements.map((element) => ({ row: Number(element.dataset.dropRow) || 0, column: Number(element.dataset.dropColumn) || 0, rowSpan: Number(element.dataset.dropRowSpan) || 1, columnSpan: Number(element.dataset.dropColumnSpan) || 1 }));
		const footprint = selectionFootprint(layouts); const selectionRect = elements.map((element) => element.getBoundingClientRect()).reduce((bounds, rect) => ({ left: Math.min(bounds.left, rect.left), top: Math.min(bounds.top, rect.top), right: Math.max(bounds.right, rect.right), bottom: Math.max(bounds.bottom, rect.bottom) }));
		const columnSpan = footprint.columnSpan; const rowSpan = footprint.rowSpan;
		const grabColumnOffset = grabSpanOffset(event.clientX, selectionRect.left, selectionRect.right - selectionRect.left, columnSpan);
		const grabRowOffset = grabSpanOffset(event.clientY, selectionRect.top, selectionRect.bottom - selectionRect.top, rowSpan);
		gesture = { kind: "drag", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, itemIds: itemId ? elements.map((element) => element.dataset.dashboardItemId) : [], groupId, elements, columnSpan, rowSpan, grabColumnOffset, grabRowOffset, dragging: false, target: null, preview: null };
		root.setPointerCapture?.(event.pointerId);
	};
	const onPointerMove = (event) => {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const dx = event.clientX - gesture.startX; const dy = event.clientY - gesture.startY;
		if (!gesture.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
		gesture.dragging = true;
		if (gesture.kind === "resize") {
			const style = getComputedStyle(gesture.grid); const rect = gesture.grid.getBoundingClientRect();
			const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
			const columnGap = parseFloat(style.columnGap) || 0; const rowGap = parseFloat(style.rowGap) || 0;
			const rowHeight = parseFloat(style.gridAutoRows) || 4;
			const columnWidth = (Math.max(1, rect.width - horizontalPadding) - columnGap * (gesture.visibleColumns - 1)) / gesture.visibleColumns;
			const columnDelta = gesture.visibleColumns === 1 ? 0 : Math.round(dx / Math.max(1, columnWidth + columnGap));
			const rowDelta = Math.round(dy / Math.max(1, rowHeight + rowGap));
			gesture.nextColumnSpan = Math.max(DASHBOARD_MIN_CONTROL_COLUMN_SPAN, Math.min(gesture.sourceColumns - gesture.sourceColumn, gesture.sourceColumnSpan + columnDelta));
			gesture.nextRowSpan = Math.max(gesture.minRowSpan, gesture.sourceRowSpan + rowDelta);
			gesture.element.classList.add("is-resizing"); root.classList.add("is-dragging");
			showResizePreview(gesture, gesture.nextColumnSpan, gesture.nextRowSpan); autoScroll(event.clientY); return;
		}
		if (gesture.kind === "marquee") {
			const rootRect = root.getBoundingClientRect(); const rectangle = selectionRectangle({ x: gesture.startX, y: gesture.startY }, { x: event.clientX, y: event.clientY }, rootRect);
			if (!gesture.marquee) {
				gesture.marquee = document.createElement("div"); gesture.marquee.className = "aa-dashboard-marquee"; gesture.marquee.setAttribute("aria-hidden", "true");
				gesture.badge = document.createElement("span"); gesture.badge.className = "aa-dashboard-marquee__count";
				gesture.marquee.append(gesture.badge); root.append(gesture.marquee);
			}
			gesture.marquee.style.left = `${rectangle.left - rootRect.left}px`; gesture.marquee.style.top = `${rectangle.top - rootRect.top}px`;
			gesture.marquee.style.width = `${rectangle.width}px`; gesture.marquee.style.height = `${rectangle.height}px`;
			const entries = itemElements().map((element) => ({ id: element.dataset.dashboardItemId, rect: element.getBoundingClientRect() }));
			const { ids, containment } = marqueeSelectionIds(entries, rectangle, { x: gesture.startX, y: gesture.startY }, { x: event.clientX, y: event.clientY });
			gesture.marquee.classList.toggle("is-contain", containment);
			gesture.marquee.classList.toggle("is-subtract", gesture.mode === "subtract");
			const items = applyMarqueeSelection(gesture.baseItems, ids, gesture.mode);
			emitSelection(items, gesture.baseGroups);
			gesture.badge.textContent = String(items.size); gesture.badge.hidden = items.size === 0;
			autoScroll(event.clientY); return;
		}
		root.classList.add("is-dragging");
		for (const element of gesture.elements) { element.classList.add("is-dragging"); element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`; }
		const rawTarget = gesture.groupId ? gridTargetAt(root, event.clientX, event.clientY) : targetAt(root, event.clientX, event.clientY);
		const target = { ...rawTarget, column: Math.max(0, rawTarget.column - gesture.grabColumnOffset), row: Math.max(0, rawTarget.row - gesture.grabRowOffset) }; gesture.target = target; showPreview(gesture, target);
		autoScroll(event.clientY);
	};
	const onPointerUp = (event) => {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const current = gesture; const target = current.target;
		if (current.kind === "marquee" && !current.dragging && current.pendingToggle) clickSelection(current.pendingToggle, { additive: true, subtract: current.mode === "subtract" });
		else if (current.kind === "resize" && current.dragging) onResizeItem?.(current.itemId, { columnSpan: current.nextColumnSpan, rowSpan: current.nextRowSpan });
		else if (current.kind === "drag" && current.dragging && target) {
			if (current.groupId) onDropGroup?.(current.groupId, { row: target.row });
			else {
				// 同网格内保持精确落点；跨网格拖放改为在目标区域按空位追加，避免局部坐标错位重叠。
				const precise = current.elements.every((element) => element.parentElement === target.grid);
				onDropItems?.(current.itemIds, { groupId: target.groupId, row: target.row, column: target.column, precise });
			}
		}
		cleanup();
	};
	const onKeyDown = (event) => {
		const resizeHandle = event.target.closest?.("[data-dashboard-resize-handle]");
		if (resizeHandle && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
			const entry = resizeHandle.closest("[data-dashboard-item-id]"); const grid = entry?.parentElement;
			if (!entry || !grid) return;
			const sourceColumns = Math.max(1, Number(grid.dataset.dashboardSourceColumns) || DASHBOARD_GRID_COLUMNS);
			const visibleColumns = Math.max(1, Number(grid.dataset.dashboardColumns) || DASHBOARD_GRID_COLUMNS);
			const sourceColumn = Math.max(0, Number(entry.dataset.dropColumn) || 0);
			const columnSpan = Math.max(1, Number(entry.dataset.dropColumnSpan) || 1);
			const rowSpan = Math.max(1, Number(entry.dataset.dropRowSpan) || 1);
			const minRowSpan = Math.max(1, Number(entry.dataset.dashboardMinRowSpan) || 1);
			const step = event.shiftKey ? 2 : 1;
			const nextColumnSpan = visibleColumns === 1 ? columnSpan : event.key === "ArrowLeft" ? Math.max(DASHBOARD_MIN_CONTROL_COLUMN_SPAN, columnSpan - step) : event.key === "ArrowRight" ? Math.min(sourceColumns - sourceColumn, columnSpan + step) : columnSpan;
			const nextRowSpan = event.key === "ArrowUp" ? Math.max(minRowSpan, rowSpan - step) : event.key === "ArrowDown" ? rowSpan + step : rowSpan;
			event.preventDefault(); onResizeItem?.(entry.dataset.dashboardItemId, { columnSpan: nextColumnSpan, rowSpan: nextRowSpan }); return;
		}
		if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "a") {
			if (isEditableTarget(event.target)) return;
			event.preventDefault();
			emitSelection(itemElements().map((element) => element.dataset.dashboardItemId), currentGroups);
			return;
		}
		if (event.key === "Escape") {
			if (gesture) { event.preventDefault(); cleanup({ restoreSelection: true }); }
			else if (currentItems.size || currentGroups.size) { event.preventDefault(); emitSelection(new Set(), new Set()); }
			return;
		}
		const card = event.target.closest?.("[data-dashboard-item-id]");
		if (!card || event.target.closest("button, input, select, textarea, [contenteditable='true']")) return;
		if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
			event.preventDefault();
			const entries = itemElements().map((element) => ({ id: element.dataset.dashboardItemId, rect: element.getBoundingClientRect(), element }));
			const nextId = nearestInDirection(entries, card.dataset.dashboardItemId, event.key.slice(5).toLowerCase());
			entries.find((entry) => entry.id === nextId)?.element.focus();
			return;
		}
		if (event.key === " " && !event.repeat) { event.preventDefault(); clickSelection(card, { additive: true }); }
	};
	const onPointerCancel = () => cleanup({ restoreSelection: true });
	root.addEventListener("pointerdown", onPointerDown); root.addEventListener("pointermove", onPointerMove); root.addEventListener("pointerup", onPointerUp); root.addEventListener("pointercancel", onPointerCancel); root.addEventListener("keydown", onKeyDown);
	const unbind = () => { cleanup(); root.removeEventListener("pointerdown", onPointerDown); root.removeEventListener("pointermove", onPointerMove); root.removeEventListener("pointerup", onPointerUp); root.removeEventListener("pointercancel", onPointerCancel); root.removeEventListener("keydown", onKeyDown); };
	unbind.setSelection = (items, groups) => { currentItems = new Set(items); currentGroups = new Set(groups); };
	return unbind;
}
