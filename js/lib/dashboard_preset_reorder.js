const PRESET_DRAG_TYPE = "application/x-aaalice-dashboard-preset";

function format(template, values) {
	return String(template || "").replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function clampedIndex(index, length) {
	return Math.max(0, Math.min(length - 1, index));
}

export function dashboardPresetDropIndex(order, sourceId, targetId, after = false) {
	const sourceIndex = order.indexOf(sourceId);
	let insertionIndex = order.indexOf(targetId) + (after ? 1 : 0);
	if (sourceIndex < insertionIndex) insertionIndex -= 1;
	return insertionIndex;
}

export function bindDashboardPresetReorder({ list, entries = [], labels = {}, onReorder }) {
	const entryById = new Map(entries.map((entry) => [entry.id, entry]));
	const order = entries.map((entry) => entry.id);
	const status = document.createElement("span");
	status.className = "aa-value-preset-reorder-status";
	status.setAttribute("role", "status");
	status.setAttribute("aria-live", "polite");
	let draggedId = null;

	const clearDropState = () => {
		for (const entry of entries) entry.row.classList.remove("is-drop-before", "is-drop-after");
	};
	const syncOrder = () => {
		const count = order.length;
		for (const [index, id] of order.entries()) {
			const entry = entryById.get(id);
			list.append(entry.row);
			entry.option.setAttribute("aria-posinset", String(index + 1));
			entry.option.setAttribute("aria-setsize", String(count));
			entry.handle.setAttribute("aria-label", format(labels.reorderItem || "Reorder {name}, position {position} of {count}", { name: entry.name, position: index + 1, count }));
		}
		list.append(status);
	};
	const move = (id, targetIndex) => {
		const sourceIndex = order.indexOf(id);
		const nextIndex = clampedIndex(targetIndex, order.length);
		if (sourceIndex < 0 || sourceIndex === nextIndex) return false;
		if (onReorder?.(id, nextIndex) === false) return false;
		order.splice(sourceIndex, 1);
		order.splice(nextIndex, 0, id);
		syncOrder();
		status.textContent = format(labels.reordered || "{name} moved to position {position} of {count}", {
			name: entryById.get(id).name,
			position: nextIndex + 1,
			count: order.length,
		});
		return true;
	};
	for (const entry of entries) {
		entry.handle.draggable = true;
		entry.handle.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
		entry.handle.addEventListener("dragstart", (event) => {
			draggedId = entry.id;
			entry.row.classList.add("is-dragging");
			if (!event.dataTransfer) return;
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData(PRESET_DRAG_TYPE, entry.id);
		});
		entry.handle.addEventListener("dragend", () => {
			draggedId = null;
			entry.row.classList.remove("is-dragging");
			clearDropState();
		});
		entry.handle.addEventListener("keydown", (event) => {
			if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
			event.preventDefault();
			event.stopPropagation();
			const direction = event.key === "ArrowUp" ? -1 : 1;
			if (move(entry.id, order.indexOf(entry.id) + direction)) entry.handle.focus({ preventScroll: true });
		});
		entry.row.addEventListener("dragover", (event) => {
			if (!draggedId || draggedId === entry.id) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			clearDropState();
			const rect = entry.row.getBoundingClientRect();
			entry.row.classList.add(event.clientY >= rect.top + rect.height / 2 ? "is-drop-after" : "is-drop-before");
		});
		entry.row.addEventListener("drop", (event) => {
			const sourceId = draggedId || event.dataTransfer?.getData(PRESET_DRAG_TYPE);
			if (!sourceId || sourceId === entry.id || !entryById.has(sourceId)) return;
			event.preventDefault();
			const rect = entry.row.getBoundingClientRect();
			const after = event.clientY >= rect.top + rect.height / 2;
			clearDropState();
			move(sourceId, dashboardPresetDropIndex(order, sourceId, entry.id, after));
		});
	}

	syncOrder();
}
