/** Fixed-row virtual list. Keeps DOM cost proportional to viewport size. */

export function calculateVirtualRange({ count, rowHeight, scrollTop, viewportHeight, overscan = 4 }) {
	if (!count || rowHeight <= 0) return { start: 0, end: 0 };
	const visibleStart = Math.floor(Math.max(0, scrollTop) / rowHeight);
	const visibleEnd = Math.ceil((Math.max(0, scrollTop) + Math.max(rowHeight, viewportHeight)) / rowHeight);
	return { start: Math.max(0, visibleStart - overscan), end: Math.min(count, visibleEnd + overscan) };
}

export function mountVirtualList(container, { rowHeight, gap = 0, overscan = 4, renderItem, renderEmpty, onBeforeRender }) {
	container._aaaliceVirtualList?.destroy();
	container.classList.add("aa-virtual-list");
	const spacer = document.createElement("div"); spacer.className = "aa-virtual-list__spacer"; container.replaceChildren(spacer);
	let items = [];
	let frame = 0;
	let previousStart = -1;
	let previousEnd = -1;
	let destroyed = false;

	const draw = (force = false) => {
		if (destroyed) return;
		if (!items.length) {
			previousStart = 0; previousEnd = 0; spacer.style.height = "100%"; spacer.replaceChildren(renderEmpty?.() || ""); return;
		}
		const { start, end } = calculateVirtualRange({ count: items.length, rowHeight, scrollTop: container.scrollTop, viewportHeight: container.clientHeight, overscan });
		if (!force && start === previousStart && end === previousEnd) return;
		onBeforeRender?.();
		previousStart = start; previousEnd = end; spacer.style.height = `${items.length * rowHeight}px`; spacer.replaceChildren();
		for (let index = start; index < end; index += 1) {
			const slot = document.createElement("div"); slot.className = "aa-virtual-list__item"; slot.style.top = `${index * rowHeight}px`; slot.style.height = `${Math.max(1, rowHeight - gap)}px`;
			slot.append(renderItem(items[index], index)); spacer.append(slot);
		}
	};
	const schedule = () => { if (frame || destroyed) return; frame = requestAnimationFrame(() => { frame = 0; draw(); }); };
	const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
	container.addEventListener("scroll", schedule, { passive: true }); resizeObserver?.observe(container);
	const controller = {
		setItems(nextItems, { preserveScroll = true } = {}) {
			items = Array.isArray(nextItems) ? nextItems : [];
			if (!preserveScroll) container.scrollTop = 0;
			const maximum = Math.max(0, items.length * rowHeight - container.clientHeight);
			if (container.scrollTop > maximum) container.scrollTop = maximum;
			previousStart = -1; previousEnd = -1; draw(true);
		},
		refresh() { previousStart = -1; previousEnd = -1; draw(true); },
		destroy() { if (destroyed) return; destroyed = true; if (frame) cancelAnimationFrame(frame); container.removeEventListener("scroll", schedule); resizeObserver?.disconnect(); if (container._aaaliceVirtualList === controller) delete container._aaaliceVirtualList; },
	};
	container._aaaliceVirtualList = controller;
	return controller;
}

export function destroyVirtualLists(root) {
	root?.querySelectorAll?.(".aa-virtual-list").forEach((element) => element._aaaliceVirtualList?.destroy());
}
