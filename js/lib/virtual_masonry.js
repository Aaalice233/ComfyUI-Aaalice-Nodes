/** True virtual masonry: natural ratios, shortest columns, and viewport-bounded DOM. */

function lowerBound(items, target, accessor) {
	let low = 0; let high = items.length;
	while (low < high) { const middle = (low + high) >>> 1; if (accessor(items[middle]) < target) low = middle + 1; else high = middle; }
	return low;
}

export function masonryColumnCount(width, { minCardWidth = 144, gap = 6, maxColumns = 5 } = {}) {
	return Math.max(1, Math.min(maxColumns, Math.floor((Math.max(1, width) + gap) / (minCardWidth + gap))));
}

export class VirtualMasonryLayout {
	constructor({ width = 1, minCardWidth = 144, gap = 6, maxColumns = 5 } = {}) {
		this.options = { minCardWidth, gap, maxColumns }; this.items = []; this.placements = []; this.columns = []; this.keys = new Set(); this.itemsByKey = new Map(); this.revision = 0;
		this.configure(width);
	}

	configure(width) {
		const nextWidth = Math.max(1, Number(width) || 1); const nextColumns = masonryColumnCount(nextWidth, this.options);
		if (this.width === nextWidth && this.columnCount === nextColumns) return false;
		this.width = nextWidth; this.columnCount = nextColumns;
		this.cardWidth = (nextWidth - this.options.gap * (nextColumns - 1)) / nextColumns;
		this.reflow(); return true;
	}

	append(items) {
		for (const item of items || []) this._place(item, this.items.length);
		return this;
	}

	setItems(items) { this.items = []; this.placements = []; this.columns = Array.from({ length: this.columnCount }, () => []); this.heights = Array(this.columnCount).fill(0); this.keys = new Set(); this.itemsByKey = new Map(); this.append(items); this.revision += 1; return this; }

	reflow() { const items = [...(this.items || [])]; this.items = []; this.placements = []; this.columns = Array.from({ length: this.columnCount }, () => []); this.heights = Array(this.columnCount).fill(0); this.keys = new Set(); this.itemsByKey = new Map(); this.append(items); this.revision += 1; return this; }

	_place(item, index) {
		if (!this.columns.length) this.reflow();
		const key = `${item?.source}:${item?.postId}`; if (this.keys.has(key)) return; this.keys.add(key); this.itemsByKey.set(key, item);
		let column = 0;
		for (let current = 1; current < this.columnCount; current += 1) if (this.heights[current] < this.heights[column]) column = current;
		const width = Math.max(1, Number(item?.width) || 1); const height = Math.max(1, Number(item?.height) || 1);
		const displayHeight = this.cardWidth * height / width; const y = this.heights[column]; const x = column * (this.cardWidth + this.options.gap);
		const placement = { index, item, key, column, x, y, width: this.cardWidth, height: displayHeight, bottom: y + displayHeight };
		this.items.push(item); this.placements.push(placement); this.columns[column].push(placement); this.heights[column] = placement.bottom + this.options.gap;
	}

	// Applies a natural-size correction to one item; returns whether the layout
	// became stale so the caller can schedule the required reflow.
	updateItemSize(key, width, height) {
		const item = this.itemsByKey.get(key);
		if (!item || !(width > 0) || !(height > 0) || (item.width === width && item.height === height)) return false;
		item.width = width; item.height = height; return true;
	}

	get totalHeight() { return Math.max(0, ...(this.heights || [0])) - (this.items.length ? this.options.gap : 0); }

	visible(scrollTop, viewportHeight, overscanRatio = 0.75) {
		const overscan = Math.max(0, viewportHeight) * overscanRatio; const top = Math.max(0, scrollTop - overscan); const bottom = scrollTop + viewportHeight + overscan;
		const result = [];
		for (const column of this.columns) {
			let index = lowerBound(column, top, (placement) => placement.bottom);
			while (index < column.length && column[index].y <= bottom) result.push(column[index++]);
		}
		return result.sort((left, right) => left.index - right.index);
	}
}

export function mountVirtualMasonry(container, { renderItem, onNearEnd, onVisibleIndexChange, onVisibleItemsChange, nearEndDistance = 900, overscanRatio = 0.75, ...layoutOptions } = {}) {
	container._aaaliceVirtualMasonry?.destroy(); container.classList.add("aa-virtual-masonry");
	const spacer = document.createElement("div"); spacer.className = "aa-virtual-masonry__spacer"; container.replaceChildren(spacer);
	const layout = new VirtualMasonryLayout({ width: container.clientWidth || 1, ...layoutOptions });
	const mounted = new Map(); let frame = 0; let destroyed = false; let active = true; let nearEndArmed = true; let sizesDirty = false; let visibleIndex = -1; let visibleSignature = ""; let layoutRevision = layout.revision;
	const releaseImage = (element) => {
		const image = element.querySelector("img");
		if (!image) return;
		const preserved = image._aaVirtualMasonryRelease?.() === true;
		if (!preserved) image.removeAttribute("src");
	};
	const clearMounted = () => {
		for (const element of mounted.values()) { element._aaVirtualMasonryDispose?.(); releaseImage(element); element.remove(); }
		mounted.clear();
	};
	const draw = (force = false) => {
		if (destroyed) return;
		const totalHeight = Math.ceil(layout.totalHeight);
		if (spacer.style.height !== `${totalHeight}px`) spacer.style.height = `${totalHeight}px`;
		if (!active) { clearMounted(); return; }
		// 单次可见区间计算同时驱动差量挂载、首项索引与预取上报；滚动本身不改变
		// placement 几何，只有 setItems/reflow 会抬升 revision 触发全量样式重写。
		const visible = layout.visible(container.scrollTop, container.clientHeight || 1, overscanRatio);
		const layoutChanged = layoutRevision !== layout.revision;
		layoutRevision = layout.revision;
		const wanted = new Set(visible.map((placement) => placement.key));
		for (const [key, element] of mounted) if (!wanted.has(key)) { element._aaVirtualMasonryDispose?.(); releaseImage(element); element.remove(); mounted.delete(key); }
		for (const placement of visible) {
			let element = mounted.get(placement.key);
			const isNew = !element;
			if (isNew) { element = renderItem(placement.item, placement.index); element.classList.add("aa-virtual-masonry__item"); element.dataset.galleryKey = placement.key; mounted.set(placement.key, element); spacer.append(element); }
			if (isNew || layoutChanged || force) {
				element.style.width = `${placement.width}px`; element.style.height = `${placement.height}px`; element.style.transform = `translate3d(${placement.x}px, ${placement.y}px, 0)`;
				element._aaVirtualMasonryLayout?.(placement.width, placement.height);
			}
		}
		const firstVisible = visible[0]?.index ?? -1;
		if (firstVisible !== visibleIndex) { visibleIndex = firstVisible; onVisibleIndexChange?.(firstVisible); }
		const signature = visible.length ? `${visible[0].key}:${visible[visible.length - 1].key}:${visible.length}` : "";
		if (signature !== visibleSignature) { visibleSignature = signature; onVisibleItemsChange?.(visible.map((placement) => placement.item)); }
		const remaining = layout.totalHeight - (container.scrollTop + container.clientHeight);
		if (remaining <= nearEndDistance && nearEndArmed) { nearEndArmed = false; onNearEnd?.(); }
		else if (remaining > nearEndDistance * 1.5) nearEndArmed = true;
	};
	const reflowPreservingAnchor = () => {
		const anchor = layout.visible(container.scrollTop, 1, 0)[0]; const offset = anchor ? anchor.y - container.scrollTop : 0;
		layout.reflow(); if (anchor) container.scrollTop = Math.max(0, layout.placements[anchor.index].y - offset);
	};
	const schedule = () => { if (frame || destroyed) return; frame = requestAnimationFrame(() => { frame = 0; if (sizesDirty) { sizesDirty = false; reflowPreservingAnchor(); } draw(); }); };
	const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
		const anchor = layout.visible(container.scrollTop, 1, 0)[0]; const offset = anchor ? anchor.y - container.scrollTop : 0;
		if (layout.configure(container.clientWidth || 1) && anchor) { const replacement = layout.placements[anchor.index]; container.scrollTop = Math.max(0, replacement.y - offset); }
		draw(true);
	}) : null;
	container.addEventListener("scroll", schedule, { passive: true }); resizeObserver?.observe(container);
	const controller = {
		setItems(next, { preserveScroll = true } = {}) { if (!preserveScroll) container.scrollTop = 0; layout.setItems(Array.isArray(next) ? next : []); nearEndArmed = true; draw(true); if (sizesDirty) schedule(); },
		append(next) { layout.append(Array.isArray(next) ? next : []); nearEndArmed = true; draw(true); if (sizesDirty) schedule(); },
		updateItemSize(key, width, height) { if (layout.updateItemSize(key, width, height)) { sizesDirty = true; schedule(); } },
		setActive(nextActive) { const next = Boolean(nextActive); if (next === active) return; active = next; if (!active) { if (frame) cancelAnimationFrame(frame); frame = 0; clearMounted(); return; } draw(true); schedule(); },
		refresh() { draw(true); },
		recheckNearEnd() { nearEndArmed = true; draw(); },
		needsMore() { return active && layout.totalHeight - container.scrollTop - container.clientHeight <= nearEndDistance; },
		get active() { return active; }, get mountedCount() { return mounted.size; }, get layout() { return layout; },
		destroy() { if (destroyed) return; destroyed = true; if (frame) cancelAnimationFrame(frame); container.removeEventListener("scroll", schedule); resizeObserver?.disconnect(); clearMounted(); spacer.remove(); if (container._aaaliceVirtualMasonry === controller) delete container._aaaliceVirtualMasonry; },
	};
	container._aaaliceVirtualMasonry = controller; draw(true); return controller;
}
