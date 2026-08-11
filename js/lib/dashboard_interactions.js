/** Pointer-driven transient Dashboard V4 integer-grid editing. */

import { applyMarqueeSelection, containedIds, intersectingSelectionIds, nearestInDirection, nextClickSelection, selectionRectangle } from "./dashboard_selection.js";
import { DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, DASHBOARD_GRID_COLUMNS, DASHBOARD_MIN_CONTROL_COLUMN_SPAN, nextDashboardColumnSpan, nextDashboardRowSpan, snapDashboardColumnSpan, snapDashboardRowSpan } from "./dashboard_sizing.js";

const DRAG_THRESHOLD = 5;

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
	const group = hit?.closest?.("[data-dashboard-group-id]");
	// The composite shell is the membership target; users should not have to find an empty cell inside a dense group.
	const groupGrid = hit?.closest?.(".aa-dashboard-group-grid") || (group && root.contains(group) ? group.querySelector?.(".aa-dashboard-group-grid") : null);
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

export function marqueeAnchorAfterScroll(start, initialScroll, currentScroll) {
	return {
		x: start.x - ((currentScroll?.left || 0) - (initialScroll?.left || 0)),
		y: start.y - ((currentScroll?.top || 0) - (initialScroll?.top || 0)),
	};
}

export function nudgeSelectionTarget(layouts, direction, { columns = DASHBOARD_GRID_COLUMNS, step = 1 } = {}) {
	const footprint = selectionFootprint(layouts); const distance = Math.max(1, Number(step) || 1);
	const delta = { left: [0, -distance], right: [0, distance], up: [-distance, 0], down: [distance, 0] }[direction];
	if (!delta) return { row: footprint.row, column: footprint.column };
	return {
		row: Math.max(0, footprint.row + delta[0]),
		column: Math.max(0, Math.min(Math.max(0, columns - footprint.columnSpan), footprint.column + delta[1])),
	};
}

export function normalizeDragSelection(entries, selectedItemIds, selectedGroupIds) {
	const selectedItems = new Set(selectedItemIds); const selectedGroups = new Set(selectedGroupIds);
	const visible = entries.filter((entry) => selectedItems.has(entry.id));
	for (const entry of visible) if (entry.groupId && selectedGroups.has(entry.groupId)) selectedItems.delete(entry.id);
	const scopes = new Set(visible.filter((entry) => selectedItems.has(entry.id)).map((entry) => entry.groupId || null));
	const topLevel = selectedGroups.size > 0 || scopes.size > 1;
	if (topLevel) for (const entry of visible) if (selectedItems.has(entry.id) && entry.groupId) {
		selectedItems.delete(entry.id); selectedGroups.add(entry.groupId);
	}
	return {
		itemIds: entries.filter((entry) => selectedItems.has(entry.id)).map((entry) => entry.id),
		groupIds: [...selectedGroups],
		topLevel,
	};
}

export function isGroupMembershipDrop(targetGroupId, sourceGroupIds) {
	if (!targetGroupId) return false;
	const sources = new Set(sourceGroupIds || []);
	return sources.size !== 1 || !sources.has(targetGroupId);
}

export function shouldStartMarquee({ hasEntry = false, selected = false, additive = false, subtract = false } = {}) {
	// A plain card gesture is always a drag candidate, even when the card is not selected yet.
	// Blank space (or an explicit modifier gesture) is the unambiguous marquee surface.
	return !hasEntry || additive || subtract;
}

export function resolveMarqueeSelection(entries, { baseItemIds = [], baseGroupIds = [], itemHits = [], groupHits = [], mode = "add" } = {}) {
	const groups = applyMarqueeSelection(baseGroupIds, groupHits, mode);
	const items = applyMarqueeSelection(baseItemIds, itemHits, mode);
	const hitGroups = new Set(groupHits);
	for (const entry of entries) {
		if (!entry.groupId) continue;
		// A fully covered group is one root-level selection unit. Removing the
		// group must also remove member selections left from an earlier gesture.
		if (groups.has(entry.groupId) || (mode === "subtract" && hitGroups.has(entry.groupId))) items.delete(entry.id);
	}
	return { items, groups };
}

function horizontalOverlap(left, right) {
	return left.column < right.column + right.columnSpan && left.column + left.columnSpan > right.column;
}

export function insertionDisplacements(insertedLayouts, fixedEntries) {
	const placed = insertedLayouts.map((layout) => ({ ...layout }));
	const result = new Map();
	const ordered = [...fixedEntries].sort((left, right) => left.layout.row - right.layout.row || left.layout.column - right.layout.column || String(left.id).localeCompare(String(right.id)));
	for (const entry of ordered) {
		const layout = { ...entry.layout }; let row = layout.row;
		const blockers = placed.filter((candidate) => horizontalOverlap(layout, candidate)).sort((left, right) => left.row - right.row || left.column - right.column);
		for (const blocker of blockers) {
			if (row + layout.rowSpan <= blocker.row) break;
			if (row < blocker.row + blocker.rowSpan) row = blocker.row + blocker.rowSpan;
		}
		if (row !== layout.row) result.set(entry.id, row - layout.row);
		placed.push({ ...layout, row });
	}
	return result;
}

function clearGroupDropTarget(gesture) {
	gesture.groupDropElement?.classList.remove("is-drop-target");
	gesture.groupDropBadge?.remove();
	gesture.groupDropElement = null; gesture.groupDropBadge = null;
}

function showGroupDropTarget(gesture, target, label) {
	const group = target.grid.closest?.("[data-dashboard-group-id]");
	if (!group || gesture.groupDropElement === group) return;
	clearGroupDropTarget(gesture);
	const badge = document.createElement("span"); badge.className = "aa-dashboard-group-drop-label"; badge.textContent = label; badge.setAttribute("aria-hidden", "true");
	group.classList.add("is-drop-target"); group.append(badge);
	gesture.groupDropElement = group; gesture.groupDropBadge = badge;
}

function clearDisplacedEntries(gesture) {
	for (const element of gesture.displacedElements || []) {
		element.classList.remove("is-drop-displaced");
		element.style.removeProperty("--aa-dashboard-drop-shift");
	}
	gesture.displacedElements = [];
}

function elementLayout(element, canonical = false) {
	return {
		row: Number(canonical ? element.dataset.dropRow : element.dataset.projectedRow ?? element.dataset.dropRow) || 0,
		column: Number(canonical ? element.dataset.dropColumn : element.dataset.projectedColumn ?? element.dataset.dropColumn) || 0,
		rowSpan: Math.max(1, Number(canonical ? element.dataset.dropRowSpan : element.dataset.projectedRowSpan ?? element.dataset.dropRowSpan) || 1),
		columnSpan: Math.max(1, Number(canonical ? element.dataset.dropColumnSpan : element.dataset.projectedColumnSpan ?? element.dataset.dropColumnSpan) || 1),
	};
}

function directLayoutEntries(grid, excluded, canonical = false) {
	return [...grid.children].filter((element) => !excluded.has(element) && (element.dataset.dashboardItemId || element.dataset.dashboardGroupId)).map((element) => ({ id: element.dataset.dashboardItemId || element.dataset.dashboardGroupId, element, layout: elementLayout(element, canonical) }));
}

function canUsePreciseTarget(gesture, target) {
	const targetColumns = Math.max(1, Number(target.grid.dataset.dashboardColumns) || DASHBOARD_GRID_COLUMNS);
	if (targetColumns === 1) return false;
	const targetSourceColumns = Math.max(1, Number(target.grid.dataset.dashboardSourceColumns) || DASHBOARD_GRID_COLUMNS);
	return gesture.elements.every((element) => Math.max(1, Number(element.parentElement?.dataset.dashboardSourceColumns) || DASHBOARD_GRID_COLUMNS) === targetSourceColumns);
}

function showInsertionDisplacement(gesture, target) {
	clearDisplacedEntries(gesture);
	if (!target.precise) return;
	const inserted = gesture.layouts.map((layout) => ({ ...layout, row: target.row + layout.row - gesture.footprint.row, column: target.column + layout.column - gesture.footprint.column }));
	const fixed = directLayoutEntries(target.grid, new Set(gesture.elements), true);
	const shifts = insertionDisplacements(inserted, fixed);
	const style = getComputedStyle(target.grid); const rowStep = (parseFloat(style.gridAutoRows) || 4) + (parseFloat(style.rowGap) || 0);
	gesture.displacedElements = [];
	for (const entry of fixed) {
		const shift = shifts.get(entry.id);
		if (!shift) continue;
		entry.element.classList.add("is-drop-displaced");
		entry.element.style.setProperty("--aa-dashboard-drop-shift", `${shift * rowStep}px`);
		gesture.displacedElements.push(entry.element);
	}
}

function showPreview(gesture, target, flowLabel) {
	if (!gesture.preview) {
		gesture.preview = document.createElement("div"); gesture.preview.className = "aa-dashboard-drop-preview";
		gesture.dropMarker = document.createElement("span"); gesture.dropMarker.className = "aa-dashboard-drop-preview__marker";
		gesture.preview.append(gesture.dropMarker); gesture.preview.setAttribute("aria-hidden", "true");
	}
	const columns = Math.max(1, Number(target.grid.dataset.dashboardColumns || getComputedStyle(target.grid).getPropertyValue("--aa-dashboard-columns")) || DASHBOARD_GRID_COLUMNS);
	target.precise = canUsePreciseTarget(gesture, target);
	let row = target.row; let column = target.column; let columnSpan = Math.min(gesture.columnSpan, columns); let rowSpan = gesture.rowSpan;
	if (target.precise) column = Math.max(0, Math.min(columns - columnSpan, column));
	else {
		const fixed = directLayoutEntries(target.grid, new Set(gesture.elements));
		row = fixed.reduce((bottom, entry) => Math.max(bottom, entry.layout.row + entry.layout.rowSpan), 0);
		column = 0; columnSpan = columns; rowSpan = 1;
	}
	target.column = column; target.row = row;
	gesture.preview.classList.toggle("is-flow", !target.precise);
	gesture.dropMarker.textContent = target.precise ? "" : flowLabel;
	gesture.preview.style.setProperty("--aa-dashboard-row", String(row + 1));
	gesture.preview.style.setProperty("--aa-dashboard-column", String(column + 1));
	gesture.preview.style.setProperty("--aa-dashboard-column-span", String(columnSpan));
	gesture.preview.style.setProperty("--aa-dashboard-row-span", String(rowSpan));
	gesture.preview.dataset.dropRow = String(row); gesture.preview.dataset.dropColumn = String(column); gesture.preview.dataset.dropRowSpan = String(rowSpan);
	if (gesture.preview.parentElement !== target.grid) target.grid.append(gesture.preview);
	showInsertionDisplacement(gesture, target);
}

function showResizePreview(gesture, columnSpan, rowSpan) {
	if (!gesture.preview) {
		gesture.preview = document.createElement("div"); gesture.preview.className = "aa-dashboard-drop-preview is-resize";
		gesture.sizeLabel = document.createElement("span"); gesture.sizeLabel.className = "aa-dashboard-resize-size"; gesture.preview.append(gesture.sizeLabel);
		gesture.preview.setAttribute("aria-hidden", "true");
	}
	const previewColumnSpan = gesture.autoColumnSpan ? gesture.projectedColumnSpan : columnSpan;
	const previewRowSpan = gesture.autoRowSpan ? gesture.projectedRowSpan : rowSpan;
	const visibleColumnSpan = gesture.visibleColumns === 1 ? 1 : previewColumnSpan;
	gesture.preview.style.setProperty("--aa-dashboard-row", gesture.element.style.getPropertyValue("--aa-dashboard-row"));
	gesture.preview.style.setProperty("--aa-dashboard-column", gesture.element.style.getPropertyValue("--aa-dashboard-column"));
	gesture.preview.style.setProperty("--aa-dashboard-column-span", String(visibleColumnSpan));
	gesture.preview.style.setProperty("--aa-dashboard-row-span", String(previewRowSpan));
	gesture.preview.dataset.dropRow = gesture.element.dataset.dropRow;
	gesture.preview.dataset.dropColumn = gesture.element.dataset.dropColumn;
	gesture.preview.dataset.dropRowSpan = String(rowSpan);
	gesture.preview.dataset.dropColumnSpan = String(columnSpan);
	gesture.sizeLabel.textContent = `${previewColumnSpan} × ${previewRowSpan}`;
	if (gesture.preview.parentElement !== gesture.grid) gesture.grid.append(gesture.preview);
}

export function bindDashboardInteractions(root, { editMode = false, interactionSurface = root, selectedItemIds = new Set(), selectedGroupIds = new Set(), groupDropLabel = "Add to group", flowDropLabel = "Auto place", onSelectionChange, onDropItems, onDropGroup, onDropSelection, onResizeItem, onResizeGroup } = {}) {
	if (!editMode) return () => {};
	const surface = interactionSurface || root;
	let gesture = null;
	let currentItems = new Set(selectedItemIds); let currentGroups = new Set(selectedGroupIds);
	const selectable = (target) => target.closest?.("[data-dashboard-item-id], [data-dashboard-group-id]");
	const isEditableTarget = (target) => Boolean(target.closest?.("input, select, textarea, [contenteditable='true']"));
	const emitSelection = (items, groups) => {
		currentItems = new Set(items); currentGroups = new Set(groups); onSelectionChange?.(currentItems, currentGroups);
	};
	const itemElements = () => [...root.querySelectorAll("[data-dashboard-item-id]")].filter((element) => !element.hidden);
	const groupElements = () => [...root.querySelectorAll("[data-dashboard-group-id]")].filter((element) => !element.hidden);
	const selectionEntries = () => itemElements().map((element) => ({ id: element.dataset.dashboardItemId, groupId: element.dataset.dashboardGroupMember || null, element }));
	const marqueeGeometry = (currentGesture, rootRect) => {
		const scroller = root.closest(".aa-dashboard-scroll") || root;
		const scrollLeft = scroller.scrollLeft || 0; const scrollTop = scroller.scrollTop || 0;
		const contentLeft = rootRect.left + scrollLeft; const contentTop = rootRect.top + scrollTop;
		const cached = currentGesture.marqueeGeometry;
		if (cached && cached.contentLeft === contentLeft && cached.contentTop === contentTop && cached.rootWidth === rootRect.width && cached.rootHeight === rootRect.height) {
			cached.scrollLeft = scrollLeft; cached.scrollTop = scrollTop; return cached;
		}
		const value = {
			scrollLeft, scrollTop, measuredScrollLeft: scrollLeft, measuredScrollTop: scrollTop,
			contentLeft, contentTop, rootWidth: rootRect.width, rootHeight: rootRect.height,
			entries: itemElements().map((element) => ({ id: element.dataset.dashboardItemId, groupId: element.dataset.dashboardGroupMember || null, rect: element.getBoundingClientRect() })),
			groupFrames: [...root.querySelectorAll("[data-dashboard-group-id]")].map((element) => ({ id: element.dataset.dashboardGroupId, rect: element.getBoundingClientRect() })),
		};
		currentGesture.marqueeGeometry = value; return value;
	};
	// Click and marquee gestures share one selection source; subtract only removes hits.
	const clickSelection = (entry, { additive = false, subtract = false, forceReplace = false } = {}) => {
		const itemId = entry?.dataset.dashboardItemId || null; const groupId = entry?.dataset.dashboardGroupId || null;
		let items = new Set(currentItems); let groups = new Set(currentGroups);
		if (forceReplace || (!additive && !subtract && !(itemId ? items.has(itemId) : groups.has(groupId)))) { items.clear(); groups.clear(); }
		if (itemId) items = nextClickSelection(items, itemId, { additive, subtract });
		if (groupId) groups = nextClickSelection(groups, groupId, { additive, subtract });
		emitSelection(items, groups); return { items: currentItems, groups: currentGroups };
	};
	const additiveFor = (event) => event.ctrlKey || event.metaKey || event.shiftKey;
	const updateMarqueeGesture = (current, clientX, clientY) => {
		const rootRect = root.getBoundingClientRect(); const geometry = marqueeGeometry(current, rootRect);
		const anchor = marqueeAnchorAfterScroll({ x: current.startX, y: current.startY }, current.startScroll, { left: geometry.scrollLeft, top: geometry.scrollTop });
		const rectangle = selectionRectangle(anchor, { x: clientX, y: clientY }, rootRect);
		if (!current.marquee) {
			current.marquee = document.createElement("div"); current.marquee.className = "aa-dashboard-marquee"; current.marquee.setAttribute("aria-hidden", "true");
			current.badge = document.createElement("span"); current.badge.className = "aa-dashboard-marquee__count";
			current.marquee.append(current.badge); root.append(current.marquee);
		}
		current.marquee.style.left = `${rectangle.left - rootRect.left}px`; current.marquee.style.top = `${rectangle.top - rootRect.top}px`;
		current.marquee.style.width = `${rectangle.width}px`; current.marquee.style.height = `${rectangle.height}px`;
		const { entries, groupFrames } = geometry;
		const hitRectangle = {
			left: rectangle.left + geometry.scrollLeft - geometry.measuredScrollLeft,
			right: rectangle.right + geometry.scrollLeft - geometry.measuredScrollLeft,
			top: rectangle.top + geometry.scrollTop - geometry.measuredScrollTop,
			bottom: rectangle.bottom + geometry.scrollTop - geometry.measuredScrollTop,
		};
		const selection = resolveMarqueeSelection(entries, {
			baseItemIds: current.baseItems, baseGroupIds: current.baseGroups,
			itemHits: intersectingSelectionIds(entries, hitRectangle), groupHits: containedIds(groupFrames, hitRectangle), mode: current.mode,
		});
		current.marquee.classList.toggle("is-subtract", current.mode === "subtract");
		emitSelection(selection.items, selection.groups);
		const count = selection.items.size + selection.groups.size;
		current.badge.textContent = String(count); current.badge.hidden = count === 0;
	};
	const updateDropTarget = (current, clientX, clientY) => {
		const rawTarget = current.topLevel ? gridTargetAt(root, clientX, clientY) : targetAt(root, clientX, clientY);
		const target = { ...rawTarget, column: Math.max(0, rawTarget.column - current.grabColumnOffset), row: Math.max(0, rawTarget.row - current.grabRowOffset) };
		current.target = target; current.membershipTarget = isGroupMembershipDrop(target.groupId, current.sourceGroupIds);
		showPreview(current, target, flowDropLabel);
		if (current.membershipTarget) showGroupDropTarget(current, target, groupDropLabel);
		else clearGroupDropTarget(current);
	};
	let autoScrollFrame = 0; let autoScrollVelocity = 0; let lastPointerX = 0; let lastPointerY = 0;
	const stopAutoScroll = () => { autoScrollVelocity = 0; if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame); autoScrollFrame = 0; };
	const runAutoScroll = () => {
		autoScrollFrame = 0;
		if (!gesture || !autoScrollVelocity) return;
		const scroller = root.closest(".aa-dashboard-scroll") || root; const previous = scroller.scrollTop;
		scroller.scrollTop += autoScrollVelocity;
		if (scroller.scrollTop === previous) { autoScrollVelocity = 0; return; }
		if (gesture.kind === "marquee") updateMarqueeGesture(gesture, lastPointerX, lastPointerY);
		else if (gesture.kind === "drag") updateDropTarget(gesture, lastPointerX, lastPointerY);
		autoScrollFrame = requestAnimationFrame(runAutoScroll);
	};
	const autoScroll = (clientX, clientY) => {
		lastPointerX = clientX; lastPointerY = clientY;
		const scroller = root.closest(".aa-dashboard-scroll") || root; const rect = scroller.getBoundingClientRect(); const edge = Math.min(64, Math.max(36, rect.height * .16));
		const topRatio = Math.max(0, Math.min(1, (rect.top + edge - clientY) / edge)); const bottomRatio = Math.max(0, Math.min(1, (clientY - (rect.bottom - edge)) / edge));
		autoScrollVelocity = topRatio ? -Math.ceil(3 + topRatio * 15) : bottomRatio ? Math.ceil(3 + bottomRatio * 15) : 0;
		if (!autoScrollVelocity) { stopAutoScroll(); return; }
		if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(runAutoScroll);
	};
	const cleanup = ({ restoreSelection = false } = {}) => {
		if (!gesture) return;
		stopAutoScroll();
		if (restoreSelection && gesture.kind === "marquee") emitSelection(gesture.initialItems, gesture.initialGroups);
		for (const element of gesture.elements || []) { element.style.removeProperty("transform"); element.classList.remove("is-dragging", "is-resizing"); }
		clearGroupDropTarget(gesture); clearDisplacedEntries(gesture);
		gesture.preview?.remove();
		gesture.marquee?.remove();
		root.classList.remove("is-dragging", "is-selecting"); gesture = null;
	};
	const canStartMarqueeAt = (target) => root.contains(target) || Boolean(target?.closest?.(".aa-dashboard-scroll"));
	const onPointerDown = (event) => {
		if (event.button !== 0) return;
		const resizeHandle = event.target.closest?.("[data-dashboard-resize-handle]");
		if (resizeHandle) {
			const groupEntry = resizeHandle.closest("[data-dashboard-group-id]");
			const itemEntry = resizeHandle.closest("[data-dashboard-item-id]");
			const entry = itemEntry || groupEntry; const grid = entry?.parentElement;
			if (!entry || !grid?.matches?.(".aa-dashboard-grid-v2, .aa-dashboard-group-grid")) return;
			const resizeKind = groupEntry && !itemEntry ? "group" : "item";
			clickSelection(entry, { additive: additiveFor(event) });
			const sourceColumnSpan = Math.max(1, Number(entry.dataset.dropColumnSpan) || 1);
			const sourceRowSpan = Math.max(1, Number(entry.dataset.dropRowSpan) || 1);
			gesture = {
				kind: "resize", resizeKind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
				itemId: itemEntry?.dataset.dashboardItemId || null, groupId: groupEntry?.dataset.dashboardGroupId || null,
				elements: [entry], element: entry, grid,
				sourceColumn: Math.max(0, Number(entry.dataset.dropColumn) || 0), sourceColumnSpan, sourceRowSpan,
				projectedColumnSpan: Math.max(1, Number(entry.dataset.projectedColumnSpan) || sourceColumnSpan), projectedRowSpan: Math.max(1, Number(entry.dataset.projectedRowSpan) || sourceRowSpan),
				autoColumnSpan: entry.dataset.dashboardAutoColumnSpan === "true", autoRowSpan: entry.dataset.dashboardAutoRowSpan === "true",
				minColumnSpan: Math.max(1, Number(entry.dataset.dashboardMinColumnSpan) || (resizeKind === "item" ? DASHBOARD_MIN_CONTROL_COLUMN_SPAN : 1)),
				minRowSpan: resizeKind === "item" ? Math.max(DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, Number(entry.dataset.dashboardMinRowSpan) || DASHBOARD_DEFAULT_CONTROL_ROW_SPAN) : 1,
				sourceColumns: Math.max(1, Number(grid.dataset.dashboardSourceColumns) || DASHBOARD_GRID_COLUMNS),
				visibleColumns: Math.max(1, Number(grid.dataset.dashboardColumns) || DASHBOARD_GRID_COLUMNS),
				nextColumnSpan: sourceColumnSpan, nextRowSpan: sourceRowSpan, dragging: false, preview: null,
			};
			entry.classList.add("is-selected");
			surface.setPointerCapture?.(event.pointerId); event.preventDefault(); return;
		}
		if (event.target.closest("button, input, select, textarea, [contenteditable='true']")) return;
		const closestEntry = selectable(event.target);
		const selectedAncestorGroup = closestEntry?.closest?.("[data-dashboard-group-id]");
		const entry = selectedAncestorGroup && currentGroups.has(selectedAncestorGroup.dataset.dashboardGroupId) ? selectedAncestorGroup : closestEntry;
		const entrySelected = Boolean(entry && (entry.dataset.dashboardItemId ? currentItems.has(entry.dataset.dashboardItemId) : currentGroups.has(entry.dataset.dashboardGroupId)));
		const additive = additiveFor(event); const subtract = event.altKey;
		// Plain card gestures remain drag candidates; blank space and modified gestures own marquee selection.
		if (shouldStartMarquee({ hasEntry: Boolean(entry), selected: entrySelected, additive, subtract })) {
			if (!entry && !canStartMarqueeAt(event.target)) return;
			const mode = event.altKey ? "subtract" : "add";
			const initialItems = new Set(currentItems); const initialGroups = new Set(currentGroups);
			const scroller = root.closest(".aa-dashboard-scroll") || root;
			if (!additive && !subtract) emitSelection(new Set(), new Set());
			gesture = { kind: "marquee", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startScroll: { left: scroller.scrollLeft || 0, top: scroller.scrollTop || 0 }, mode, initialItems, initialGroups, baseItems: additive || subtract ? initialItems : new Set(), baseGroups: additive || subtract ? initialGroups : new Set(), pendingToggle: entry || null, pendingAdditive: additive, dragging: false, marquee: null, badge: null, marqueeGeometry: null };
			surface.setPointerCapture?.(event.pointerId); event.preventDefault(); return;
		}
		const collapseOnClick = entrySelected && !additive && !subtract && currentItems.size + currentGroups.size > 1;
		const selection = clickSelection(entry, { additive });
		const visibleGroups = groupElements();
		const itemEntries = selectionEntries();
		const visibleGroupIds = new Set(visibleGroups.map((element) => element.dataset.dashboardGroupId));
		const normalizedSelection = normalizeDragSelection(itemEntries, selection.items, [...selection.groups].filter((id) => visibleGroupIds.has(id)));
		const elements = normalizedSelection.topLevel
			? [...itemEntries.filter((candidate) => normalizedSelection.itemIds.includes(candidate.id)).map((candidate) => candidate.element), ...visibleGroups.filter((element) => normalizedSelection.groupIds.includes(element.dataset.dashboardGroupId))]
			: itemEntries.filter((candidate) => normalizedSelection.itemIds.includes(candidate.id)).map((candidate) => candidate.element);
		const layouts = elements.map((element) => elementLayout(element, true));
		const footprint = selectionFootprint(layouts); const selectionRect = elements.map((element) => element.getBoundingClientRect()).reduce((bounds, rect) => ({ left: Math.min(bounds.left, rect.left), top: Math.min(bounds.top, rect.top), right: Math.max(bounds.right, rect.right), bottom: Math.max(bounds.bottom, rect.bottom) }));
		const columnSpan = footprint.columnSpan; const rowSpan = footprint.rowSpan;
		const grabColumnOffset = grabSpanOffset(event.clientX, selectionRect.left, selectionRect.right - selectionRect.left, columnSpan);
		const grabRowOffset = grabSpanOffset(event.clientY, selectionRect.top, selectionRect.bottom - selectionRect.top, rowSpan);
		gesture = { kind: "drag", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, itemIds: normalizedSelection.itemIds, groupIds: normalizedSelection.groupIds, sourceGroupIds: new Set(elements.map((element) => element.dataset.dashboardGroupMember || null)), topLevel: normalizedSelection.topLevel, elements, layouts, footprint, columnSpan, rowSpan, grabColumnOffset, grabRowOffset, collapseOnClick, clickEntry: entry, dragging: false, membershipTarget: false, target: null, preview: null, displacedElements: [] };
		surface.setPointerCapture?.(event.pointerId);
	};
	const onPointerMove = (event) => {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const dx = event.clientX - gesture.startX; const dy = event.clientY - gesture.startY;
		if (!gesture.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
			if (!gesture.dragging) {
				gesture.dragging = true;
				event.preventDefault();
				if (gesture.kind === "marquee") root.classList.add("is-selecting");
				else if (gesture.kind === "drag" && gesture.topLevel) emitSelection(gesture.itemIds, gesture.groupIds);
			}
		if (gesture.kind === "resize") {
			const style = getComputedStyle(gesture.grid); const rect = gesture.grid.getBoundingClientRect();
			const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
			const columnGap = parseFloat(style.columnGap) || 0; const rowGap = parseFloat(style.rowGap) || 0;
			const rowHeight = parseFloat(style.gridAutoRows) || 4;
			const columnWidth = (Math.max(1, rect.width - horizontalPadding) - columnGap * (gesture.visibleColumns - 1)) / gesture.visibleColumns;
			const columnDelta = gesture.visibleColumns === 1 ? 0 : Math.round(dx / Math.max(1, columnWidth + columnGap));
			const rowDelta = Math.round(dy / Math.max(1, rowHeight + rowGap));
			const maximumColumnSpan = gesture.sourceColumns - gesture.sourceColumn;
			gesture.nextColumnSpan = gesture.autoColumnSpan ? gesture.sourceColumnSpan : snapDashboardColumnSpan(gesture.sourceColumnSpan + columnDelta, { minimum: gesture.minColumnSpan, maximum: maximumColumnSpan, fallback: gesture.sourceColumnSpan });
			gesture.nextRowSpan = gesture.resizeKind === "group" || gesture.autoRowSpan ? gesture.sourceRowSpan : snapDashboardRowSpan(gesture.sourceRowSpan + rowDelta, { minimum: gesture.minRowSpan, fallback: gesture.sourceRowSpan });
			gesture.element.classList.add("is-resizing"); root.classList.add("is-dragging");
			showResizePreview(gesture, gesture.nextColumnSpan, gesture.nextRowSpan); autoScroll(event.clientX, event.clientY); return;
		}
		if (gesture.kind === "marquee") {
			updateMarqueeGesture(gesture, event.clientX, event.clientY);
			autoScroll(event.clientX, event.clientY); return;
		}
		root.classList.add("is-dragging");
		for (const element of gesture.elements) { element.classList.add("is-dragging"); element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`; }
		updateDropTarget(gesture, event.clientX, event.clientY);
		autoScroll(event.clientX, event.clientY);
	};
	const onPointerUp = (event) => {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const current = gesture; const target = current.target;
		if (current.kind === "marquee" && !current.dragging && current.pendingToggle) clickSelection(current.pendingToggle, { additive: current.pendingAdditive, subtract: current.mode === "subtract" });
		else if (current.kind === "drag" && !current.dragging && current.collapseOnClick) clickSelection(current.clickEntry, { forceReplace: true });
		else if (current.kind === "resize" && current.dragging) {
			if (current.resizeKind === "group") onResizeGroup?.(current.groupId, { columnSpan: current.nextColumnSpan });
			else onResizeItem?.(current.itemId, { columnSpan: current.nextColumnSpan, rowSpan: current.nextRowSpan });
		}
		else if (current.kind === "drag" && current.dragging && target) {
			// Canonical grids preserve the indicated insertion point across group boundaries.
			// A one-column projection cannot express canonical columns and stays on auto placement.
			const precise = target.precise !== false;
			if (current.topLevel) {
				if (onDropSelection) onDropSelection(current.itemIds, current.groupIds, { row: target.row, column: target.column, precise });
				else if (!current.itemIds.length && current.groupIds.length === 1) onDropGroup?.(current.groupIds[0], { row: target.row, column: target.column });
			} else onDropItems?.(current.itemIds, { groupId: target.groupId, row: target.row, column: target.column, precise });
		}
		cleanup();
	};
	const onKeyDown = (event) => {
		const resizeHandle = event.target.closest?.("[data-dashboard-resize-handle]");
		if (resizeHandle && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
			const groupEntry = resizeHandle.closest("[data-dashboard-group-id]");
			const itemEntry = resizeHandle.closest("[data-dashboard-item-id]");
			const entry = itemEntry || groupEntry; const grid = entry?.parentElement;
			if (!entry || !grid) return;
			const resizeKind = groupEntry && !itemEntry ? "group" : "item";
			if (resizeKind === "group" && !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
			if (entry.dataset.dashboardAutoColumnSpan === "true" && ["ArrowLeft", "ArrowRight"].includes(event.key)) return;
			if (entry.dataset.dashboardAutoRowSpan === "true" && ["ArrowUp", "ArrowDown"].includes(event.key)) return;
			const sourceColumns = Math.max(1, Number(grid.dataset.dashboardSourceColumns) || DASHBOARD_GRID_COLUMNS);
			const visibleColumns = Math.max(1, Number(grid.dataset.dashboardColumns) || DASHBOARD_GRID_COLUMNS);
			const sourceColumn = Math.max(0, Number(entry.dataset.dropColumn) || 0);
			const columnSpan = Math.max(1, Number(entry.dataset.dropColumnSpan) || 1);
			const rowSpan = Math.max(1, Number(entry.dataset.dropRowSpan) || 1);
			const minColumnSpan = Math.max(1, Number(entry.dataset.dashboardMinColumnSpan) || (resizeKind === "item" ? DASHBOARD_MIN_CONTROL_COLUMN_SPAN : 1));
			const minRowSpan = resizeKind === "item" ? Math.max(DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, Number(entry.dataset.dashboardMinRowSpan) || DASHBOARD_DEFAULT_CONTROL_ROW_SPAN) : 1;
			const step = event.shiftKey ? 2 : 1;
			const nextColumnSpan = visibleColumns === 1 ? columnSpan : event.key === "ArrowLeft" ? nextDashboardColumnSpan(columnSpan, -step, { minimum: minColumnSpan, maximum: sourceColumns - sourceColumn }) : event.key === "ArrowRight" ? nextDashboardColumnSpan(columnSpan, step, { minimum: minColumnSpan, maximum: sourceColumns - sourceColumn }) : columnSpan;
			const nextRowSpan = resizeKind === "group" ? rowSpan : event.key === "ArrowUp" ? nextDashboardRowSpan(rowSpan, -step, { minimum: minRowSpan }) : event.key === "ArrowDown" ? nextDashboardRowSpan(rowSpan, step, { minimum: minRowSpan }) : rowSpan;
			event.preventDefault();
			if (resizeKind === "group") onResizeGroup?.(entry.dataset.dashboardGroupId, { columnSpan: nextColumnSpan });
			else onResizeItem?.(entry.dataset.dashboardItemId, { columnSpan: nextColumnSpan, rowSpan: nextRowSpan });
			return;
		}
		if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "a") {
			// Explicit UI owns select-all; editable fields retain native text selection and the canvas receives neither path.
			event.stopPropagation();
			if (!isEditableTarget(event.target)) event.preventDefault();
			return;
		}
		if (event.key === "Escape") {
			if (gesture) { event.preventDefault(); cleanup({ restoreSelection: true }); }
			else if (currentItems.size || currentGroups.size) { event.preventDefault(); emitSelection(new Set(), new Set()); }
			return;
		}
		const entry = event.target.closest?.("[data-dashboard-item-id], [data-dashboard-group-id]");
		if (!entry || event.target.closest("button, input, select, textarea, [contenteditable='true']")) return;
		const card = entry.matches("[data-dashboard-item-id]") ? entry : null;
		if (event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
			event.preventDefault(); event.stopPropagation();
			const cardId = card?.dataset.dashboardItemId || null; const groupId = entry.dataset.dashboardGroupId || null; const memberGroupId = card?.dataset.dashboardGroupMember || null;
			if (cardId ? !currentItems.has(cardId) && !currentGroups.has(memberGroupId) : !currentGroups.has(groupId)) emitSelection(cardId ? new Set([cardId]) : new Set(), groupId ? new Set([groupId]) : new Set());
			const entries = selectionEntries(); const normalized = normalizeDragSelection(entries, currentItems, currentGroups);
			emitSelection(normalized.itemIds, normalized.groupIds);
			const elements = normalized.topLevel
				? [...normalized.groupIds.map((id) => groupElements().find((element) => element.dataset.dashboardGroupId === id)), ...normalized.itemIds.map((id) => itemElements().find((element) => element.dataset.dashboardItemId === id))].filter(Boolean)
				: normalized.itemIds.map((id) => itemElements().find((element) => element.dataset.dashboardItemId === id)).filter(Boolean);
			const layouts = elements.map((element) => elementLayout(element, true)); const footprint = selectionFootprint(layouts);
			const target = nudgeSelectionTarget(layouts, event.key.slice(5).toLowerCase(), { step: event.shiftKey ? 2 : 1 });
			if (target.row === footprint.row && target.column === footprint.column) return;
			if (normalized.topLevel) {
				if (onDropSelection) onDropSelection(normalized.itemIds, normalized.groupIds, { ...target, precise: true });
				else if (!normalized.itemIds.length && normalized.groupIds.length === 1) onDropGroup?.(normalized.groupIds[0], target);
			} else {
				const sourceGroups = new Set(entries.filter((entry) => normalized.itemIds.includes(entry.id)).map((entry) => entry.groupId || null));
				onDropItems?.(normalized.itemIds, { groupId: sourceGroups.size === 1 ? [...sourceGroups][0] : null, ...target, precise: true });
			}
			return;
		}
		if (card && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
			event.preventDefault();
			const entries = itemElements().map((element) => ({ id: element.dataset.dashboardItemId, rect: element.getBoundingClientRect(), element }));
			const nextId = nearestInDirection(entries, card.dataset.dashboardItemId, event.key.slice(5).toLowerCase());
			entries.find((entry) => entry.id === nextId)?.element.focus();
			return;
		}
		if (event.key === " " && !event.repeat) { event.preventDefault(); clickSelection(entry, { additive: true }); }
	};
	const onPointerCancel = () => cleanup({ restoreSelection: true });
	surface.addEventListener("pointerdown", onPointerDown); surface.addEventListener("pointermove", onPointerMove); surface.addEventListener("pointerup", onPointerUp); surface.addEventListener("pointercancel", onPointerCancel); surface.addEventListener("keydown", onKeyDown);
	const unbind = () => { cleanup(); surface.removeEventListener("pointerdown", onPointerDown); surface.removeEventListener("pointermove", onPointerMove); surface.removeEventListener("pointerup", onPointerUp); surface.removeEventListener("pointercancel", onPointerCancel); surface.removeEventListener("keydown", onKeyDown); };
	unbind.setSelection = (items, groups) => { currentItems = new Set(items); currentGroups = new Set(groups); };
	return unbind;
}
