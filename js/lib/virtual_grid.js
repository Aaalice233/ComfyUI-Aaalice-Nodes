const DEFAULTS = Object.freeze({
	gap: 7,
	gridMinWidth: 88,
	gridExtraHeight: 38,
	listHeight: 48,
	overscanRows: 2,
});

function positive(value, fallback) {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function virtualGridLayout(width, mode = "grid", options = {}) {
	const gap = positive(options.gap, DEFAULTS.gap);
	if (mode === "list") {
		return {
			columns: 1,
			gap,
			itemWidth: Math.max(0, width),
			itemHeight: positive(options.listHeight, DEFAULTS.listHeight),
		};
	}
	const minWidth = positive(options.gridMinWidth, DEFAULTS.gridMinWidth);
	const columns = Math.max(1, Math.floor((Math.max(0, width) + gap) / (minWidth + gap)));
	const itemWidth = Math.max(0, (Math.max(0, width) - gap * (columns - 1)) / columns);
	return {
		columns,
		gap,
		itemWidth,
		itemHeight: itemWidth + positive(options.gridExtraHeight, DEFAULTS.gridExtraHeight),
	};
}

export function virtualGridHeight(itemCount, layout) {
	if (!itemCount) return 0;
	const rows = Math.ceil(itemCount / layout.columns);
	return rows * layout.itemHeight + Math.max(0, rows - 1) * layout.gap;
}

export function virtualGridRange({ itemCount, layout, scrollTop, viewportHeight, overscanRows = DEFAULTS.overscanRows }) {
	if (!itemCount || viewportHeight <= 0) return { start: 0, end: 0 };
	const stride = layout.itemHeight + layout.gap;
	const rowCount = Math.ceil(itemCount / layout.columns);
	const firstRow = Math.max(0, Math.floor(Math.max(0, scrollTop) / stride) - overscanRows);
	const lastRow = Math.min(rowCount, Math.ceil((Math.max(0, scrollTop) + viewportHeight) / stride) + overscanRows);
	return {
		start: firstRow * layout.columns,
		end: Math.min(itemCount, lastRow * layout.columns),
	};
}

function itemPosition(index, layout) {
	const row = Math.floor(index / layout.columns);
	const column = index % layout.columns;
	return {
		x: column * (layout.itemWidth + layout.gap),
		y: row * (layout.itemHeight + layout.gap),
	};
}

export function mountVirtualGrid(container, {
	items = [],
	mode = "grid",
	renderItem,
	keyForItem = (_item, index) => index,
	empty = null,
	options = {},
} = {}) {
	const spacer = document.createElement("div");
	spacer.className = "aa-virtual-grid__spacer";
	container.replaceChildren(spacer);
	let currentItems = items;
	let currentMode = mode;
	let layout = virtualGridLayout(container.clientWidth, currentMode, options);
	let mounted = new Map();
	let emptyElement = null;
	let frame = 0;
	let destroyed = false;

	function release(element) {
		for (const image of element.querySelectorAll("img")) image.removeAttribute("src");
		element.remove();
	}

	function clearMounted() {
		for (const element of mounted.values()) release(element);
		mounted = new Map();
	}

	function draw() {
		frame = 0;
		if (destroyed) return;
		spacer.style.height = `${virtualGridHeight(currentItems.length, layout)}px`;
		if (!currentItems.length) {
			clearMounted();
			if (!emptyElement && empty) {
				emptyElement = typeof empty === "function" ? empty() : empty;
				container.append(emptyElement);
			}
			return;
		}
		emptyElement?.remove();
		emptyElement = null;
		const range = virtualGridRange({
			itemCount: currentItems.length,
			layout,
			scrollTop: container.scrollTop,
			viewportHeight: container.clientHeight,
			overscanRows: options.overscanRows,
		});
		const wanted = new Set();
		for (let index = range.start; index < range.end; index += 1) {
			const item = currentItems[index];
			const key = keyForItem(item, index);
			wanted.add(key);
			let element = mounted.get(key);
			if (!element) {
				element = renderItem(item, index);
				element.classList.add("aa-virtual-grid__item");
				mounted.set(key, element);
				container.append(element);
			}
			const { x, y } = itemPosition(index, layout);
			element.style.width = `${layout.itemWidth}px`;
			element.style.height = `${layout.itemHeight}px`;
			element.style.transform = `translate(${x}px, ${y}px)`;
		}
		for (const [key, element] of mounted) {
			if (wanted.has(key)) continue;
			release(element);
			mounted.delete(key);
		}
	}

	function scheduleDraw() {
		if (frame || destroyed) return;
		frame = requestAnimationFrame(draw);
	}

	function relayout({ preserveAnchor = true } = {}) {
		const oldStride = layout.itemHeight + layout.gap;
		const oldIndex = Math.floor(container.scrollTop / oldStride) * layout.columns;
		layout = virtualGridLayout(container.clientWidth, currentMode, options);
		if (preserveAnchor && currentItems.length) {
			const row = Math.floor(Math.min(oldIndex, currentItems.length - 1) / layout.columns);
			container.scrollTop = row * (layout.itemHeight + layout.gap);
		}
		clearMounted();
		draw();
	}

	const resizeObserver = new ResizeObserver(() => relayout());
	resizeObserver.observe(container);
	container.addEventListener("scroll", scheduleDraw, { passive: true });
	draw();

	return {
		setItems(nextItems, { preserveScroll = false } = {}) {
			currentItems = Array.isArray(nextItems) ? nextItems : [];
			if (!preserveScroll) container.scrollTop = 0;
			clearMounted();
			draw();
		},
		setMode(nextMode) {
			if (nextMode === currentMode) return;
			currentMode = nextMode;
			relayout();
		},
		scrollToIndex(index) {
			if (index < 0 || index >= currentItems.length) return;
			const row = Math.floor(index / layout.columns);
			const top = row * (layout.itemHeight + layout.gap);
			const bottom = top + layout.itemHeight;
			if (top < container.scrollTop) container.scrollTop = top;
			else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
			draw();
		},
		refresh() { relayout({ preserveAnchor: false }); },
		destroy() {
			destroyed = true;
			if (frame) cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			container.removeEventListener("scroll", scheduleDraw);
			clearMounted();
			emptyElement?.remove();
			spacer.remove();
		},
	};
}
