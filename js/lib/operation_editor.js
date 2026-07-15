/** Operation Panel selection, geometry editing and module context actions. */
import { t } from "../i18n.js";
import {
	OPERATION_ANCHORS,
	distributeRects,
	findNearestFreeRect,
	frameFromRect,
	inferAnchor,
	rectsOverlap,
	resolveFrame,
	snapValue,
} from "./operation_layout.js";
import { MODULE_STYLES, createContainerModule, moduleDescendants, removeModule, validateContainerDepth } from "./operation_state.js";
import { button, contextMenu, el } from "./ui.js";

const GRID = 8;
const DEFAULT_HEIGHT = 240;

export function createOperationEditor({
	getCanvas,
	getState,
	getViewport,
	commitMutation,
	render,
	promptText,
	modal,
	renderer,
	toast,
}) {
	let editing = false;
	let selection = new Set();
	let selectionAnchorId = null;
	const measuredHeights = new Map();
	const pendingCollisionPages = new Set();
	const viewCleanups = new Set();
	const gestureCleanups = new Set();

	function moduleHeight(moduleId) {
		return measuredHeights.get(moduleId) || DEFAULT_HEIGHT;
	}

	function moduleRect(page, module) {
		return resolveFrame(module.frame, getViewport(page), moduleHeight(module.id));
	}

	function layoutItems(page) {
		return page.root_ids.filter((id) => page.modules[id]).map((id) => ({ frame: page.modules[id].frame, height: moduleHeight(id) }));
	}

	function occupiedRects(page, excluded = new Set()) {
		return page.root_ids
			.filter((id) => !excluded.has(id) && page.modules[id])
			.map((id) => ({ id, ...moduleRect(page, page.modules[id]) }));
	}

	function resolveRootCollisions(page, priorityIds = []) {
		const viewport = getViewport(page);
		const priority = new Set(priorityIds);
		const ordered = [...page.root_ids.filter((id) => priority.has(id)), ...page.root_ids.filter((id) => !priority.has(id))];
		const occupied = [];
		for (const id of ordered) {
			const module = page.modules[id];
			if (!module) continue;
			const rect = moduleRect(page, module);
			const free = findNearestFreeRect(rect, occupied, viewport.width, GRID);
			if (free.x !== rect.x || free.y !== rect.y) module.frame = frameFromRect(free, inferAnchor(free, viewport), viewport);
			occupied.push({ id, ...free });
		}
	}

	function pageHasOverlap(page) {
		const rects = page.root_ids.filter((id) => page.modules[id]).map((id) => moduleRect(page, page.modules[id]));
		return rects.some((rect, index) => rects.slice(index + 1).some((other) => rectsOverlap(rect, other)));
	}

	function scheduleCollisionReflow(pageId) {
		if (pendingCollisionPages.has(pageId)) return;
		pendingCollisionPages.add(pageId);
		requestAnimationFrame(() => {
			pendingCollisionPages.delete(pageId);
			const page = getState(false)?.pages.find((candidate) => candidate.id === pageId);
			if (page && pageHasOverlap(page)) commitMutation(() => resolveRootCollisions(page, page.root_ids));
		});
	}

	function clearSelection() {
		selection.clear();
		selectionAnchorId = null;
	}

	function selectOnly(moduleId) {
		selection = new Set(moduleId ? [moduleId] : []);
		selectionAnchorId = moduleId || null;
	}

	function selectModule(page, moduleId, event) {
		const roots = page.root_ids;
		if (event.shiftKey && selectionAnchorId && roots.includes(selectionAnchorId)) {
			const start = roots.indexOf(selectionAnchorId);
			const end = roots.indexOf(moduleId);
			selection = new Set(roots.slice(Math.min(start, end), Math.max(start, end) + 1));
		} else if (event.ctrlKey || event.metaKey) {
			if (selection.has(moduleId)) selection.delete(moduleId);
			else selection.add(moduleId);
			selectionAnchorId = moduleId;
		} else selectOnly(moduleId);
	}

	function selectedRootIds(page, fallbackId = null) {
		const selected = page.root_ids.filter((id) => selection.has(id));
		if (!selected.length && fallbackId && page.root_ids.includes(fallbackId)) return [fallbackId];
		return selected;
	}

	function trackGesture(pointerMove, pointerUp) {
		const cleanup = () => {
			document.removeEventListener("pointermove", pointerMove);
			document.removeEventListener("pointerup", pointerUp);
			gestureCleanups.delete(cleanup);
		};
		gestureCleanups.add(cleanup);
		document.addEventListener("pointermove", pointerMove);
		document.addEventListener("pointerup", pointerUp, { once: true });
		return cleanup;
	}

	function beginMove(event, page, module) {
		if (!editing || event.button !== 0 || event.target.closest("button, input, select, textarea, .aaalice-operation-resize")) return;
		event.preventDefault();
		selectModule(page, module.id, event);
		const ids = selectedRootIds(page, module.id);
		const canvas = getCanvas();
		const elements = new Map(ids.map((id) => [id, canvas?.querySelector(`[data-module-id="${CSS.escape(id)}"]`)]));
		const start = { x: event.clientX, y: event.clientY };
		let moved = false;
		const pointerMove = (moveEvent) => {
			const dx = moveEvent.clientX - start.x;
			const dy = moveEvent.clientY - start.y;
			moved ||= Math.abs(dx) > 2 || Math.abs(dy) > 2;
			for (const target of elements.values()) if (target) target.style.transform = `translate(${dx}px, ${dy}px)`;
			const before = moduleRect(page, module);
			canvas?.setAttribute("data-anchor-preview", inferAnchor({ ...before, x: before.x + dx, y: before.y + dy }, getViewport(page)));
		};
		let cleanup;
		const pointerUp = (upEvent) => {
			cleanup();
			canvas?.removeAttribute("data-anchor-preview");
			for (const target of elements.values()) if (target) target.style.transform = "";
			if (!moved) return render();
			moveModules(page, ids, upEvent.clientX - start.x, upEvent.clientY - start.y, upEvent.altKey);
		};
		cleanup = trackGesture(pointerMove, pointerUp);
	}

	function moveModules(page, ids, dx, dy, disableSnap) {
		const viewport = getViewport(page);
		const idSet = new Set(ids);
		commitMutation(() => {
			const movedRects = [];
			for (const id of ids) {
				const module = page.modules[id];
				if (!module) continue;
				const before = moduleRect(page, module);
				const rect = { ...before, x: before.x + dx, y: before.y + dy };
				if (!disableSnap) {
					rect.x = snapValue(rect.x, GRID);
					rect.y = snapValue(rect.y, GRID);
				}
				module.frame = frameFromRect(rect, inferAnchor(rect, viewport), viewport);
				movedRects.push({ id, ...rect });
			}
			const occupied = [...movedRects];
			for (const id of page.root_ids) {
				if (idSet.has(id) || !page.modules[id]) continue;
				const module = page.modules[id];
				const rect = moduleRect(page, module);
				const free = findNearestFreeRect(rect, occupied, viewport.width, GRID);
				if (free.x !== rect.x || free.y !== rect.y) module.frame = frameFromRect(free, inferAnchor(free, viewport), viewport);
				occupied.push({ id, ...free });
			}
		});
	}

	function beginResize(event, page, module) {
		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;
		const startWidth = moduleRect(page, module).width;
		const target = event.currentTarget.closest("[data-module-id]");
		const pointerMove = (moveEvent) => { target.style.width = `${Math.max(240, startWidth + moveEvent.clientX - startX)}px`; };
		let cleanup;
		const pointerUp = (upEvent) => {
			cleanup();
			const width = Math.max(240, snapValue(startWidth + upEvent.clientX - startX, GRID));
			commitMutation(() => {
				const viewport = getViewport(page);
				const rect = { ...moduleRect(page, module), width };
				module.frame = frameFromRect(rect, module.frame.anchor, viewport);
				resolveRootCollisions(page, [module.id]);
			});
		};
		cleanup = trackGesture(pointerMove, pointerUp);
	}

	function setFrames(page, ids, transform) {
		const viewport = getViewport(page);
		const next = transform(ids.map((id) => moduleRect(page, page.modules[id])));
		ids.forEach((id, index) => { page.modules[id].frame = frameFromRect(next[index], inferAnchor(next[index], viewport), viewport); });
	}

	function alignSelection(page, kind) {
		const ids = selectedRootIds(page);
		if (ids.length < 2) return;
		commitMutation(() => {
			setFrames(page, ids, (rects) => {
				const reference = rects[0];
				return rects.map((rect) => {
					if (kind === "left") return { ...rect, x: reference.x };
					if (kind === "right") return { ...rect, x: reference.x + reference.width - rect.width };
					if (kind === "top") return { ...rect, y: reference.y };
					if (kind === "bottom") return { ...rect, y: reference.y + reference.height - rect.height };
					return rect;
				});
			});
			resolveRootCollisions(page, ids);
		});
	}

	function distributeSelection(page, axis) {
		const ids = selectedRootIds(page);
		if (ids.length < 3) return;
		commitMutation(() => {
			setFrames(page, ids, (rects) => distributeRects(rects, axis));
			resolveRootCollisions(page, ids);
		});
	}

	function equalWidth(page) {
		const ids = selectedRootIds(page);
		if (ids.length < 2) return;
		const width = moduleRect(page, page.modules[ids[0]]).width;
		commitMutation(() => {
			const viewport = getViewport(page);
			for (const id of ids) {
				const module = page.modules[id];
				module.frame = frameFromRect({ ...moduleRect(page, module), width }, module.frame.anchor, viewport);
			}
			resolveRootCollisions(page, ids);
		});
	}

	function groupSelection(page, type) {
		const ids = selectedRootIds(page);
		if (!validateContainerDepth(page, type, ids)) {
			toast?.("warn", type === "group"
				? t("aaalice.operation.groupInvalid", "Select at least two ungrouped cards. Groups cannot be nested.")
				: t("aaalice.operation.carouselInvalid", "Select at least two cards or groups. Carousels cannot be nested."));
			return;
		}
		const viewport = getViewport(page);
		const rects = ids.map((id) => moduleRect(page, page.modules[id]));
		const bounds = {
			x: Math.min(...rects.map((rect) => rect.x)),
			y: Math.min(...rects.map((rect) => rect.y)),
			width: Math.max(...rects.map((rect) => rect.x + rect.width)) - Math.min(...rects.map((rect) => rect.x)),
			height: Math.max(...rects.map((rect) => rect.y + rect.height)) - Math.min(...rects.map((rect) => rect.y)),
		};
		commitMutation(() => {
			const container = createContainerModule(type, ids, frameFromRect(bounds, inferAnchor(bounds, viewport), viewport));
			page.modules[container.id] = container;
			for (const id of ids) page.modules[id].parent_id = container.id;
			const firstIndex = Math.min(...ids.map((id) => page.root_ids.indexOf(id)));
			page.root_ids = page.root_ids.filter((id) => !ids.includes(id));
			page.root_ids.splice(firstIndex, 0, container.id);
			resolveRootCollisions(page, [container.id]);
			selectOnly(container.id);
		});
	}

	function ungroup(page, module) {
		if (!["group", "carousel"].includes(module.type)) return;
		const base = moduleRect(page, module);
		const viewport = getViewport(page);
		commitMutation(() => {
			const rootIndex = page.root_ids.indexOf(module.id);
			const children = [...module.children];
			page.root_ids = page.root_ids.filter((id) => id !== module.id);
			children.forEach((id, index) => {
				const child = page.modules[id];
				child.parent_id = null;
				const rect = { x: base.x + index * 24, y: base.y + index * 24, width: child.frame.width, height: moduleHeight(id) };
				child.frame = frameFromRect(rect, inferAnchor(rect, viewport), viewport);
			});
			page.root_ids.splice(Math.max(0, rootIndex), 0, ...children);
			delete page.modules[module.id];
			resolveRootCollisions(page, children);
			selection = new Set(children);
		});
	}

	function setAnchor(page, ids, anchor) {
		const viewport = getViewport(page);
		commitMutation(() => {
			for (const id of ids) {
				const module = page.modules[id];
				if (module) module.frame = frameFromRect(moduleRect(page, module), anchor, viewport);
			}
		});
	}

	function moveToPage(page, ids, targetPage) {
		if (page.id === targetPage.id) return;
		commitMutation(() => {
			for (const id of ids) {
				const descendants = moduleDescendants(page, id);
				for (const descendant of descendants) targetPage.modules[descendant] = page.modules[descendant];
				targetPage.modules[id].parent_id = null;
				targetPage.root_ids.push(id);
				for (const descendant of descendants) delete page.modules[descendant];
			}
			page.root_ids = page.root_ids.filter((id) => !ids.includes(id));
			resolveRootCollisions(targetPage, ids);
			clearSelection();
		});
	}

	function removeSelected(page, ids) {
		commitMutation(() => {
			for (const id of ids) removeModule(page, id);
			clearSelection();
		});
	}

	async function renameModule(module) {
		const property = module.type === "node" ? "label_override" : module.type === "heading" ? "content" : "title";
		const value = await promptText(t("aaalice.operation.rename", "Rename"), module[property] || "");
		if (value == null) return;
		commitMutation(() => { module[property] = String(value).trim(); });
	}

	async function editContent(module) {
		const title = module.type === "heading" ? t("aaalice.operation.editHeading", "Edit heading") : t("aaalice.operation.editMarkdown", "Edit Markdown");
		const value = await modal(title, (body, close) => {
			const input = document.createElement("textarea");
			input.className = "aaalice-operation-content-editor";
			input.value = module.content || "";
			const actions = el("div", "aaalice-modal-actions");
			actions.append(
				button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary", onClick: () => close(null) }),
				button({ label: t("aaalice.common.save", "Save"), onClick: () => close(input.value) }),
			);
			body.append(input, actions);
		});
		if (value == null) return;
		commitMutation(() => { module.content = value; });
	}

	function moduleMenu(event, page, module) {
		if (!editing) return;
		if (!selection.has(module.id)) selectOnly(module.id);
		const ids = selectedRootIds(page, module.id);
		const activeCarouselPage = renderer.getCarouselPage(module.id);
		contextMenu(event, [
			{ label: t("aaalice.operation.rename", "Rename"), action: () => renameModule(module) },
			...(["heading", "markdown"].includes(module.type) ? [{ label: t("aaalice.operation.editContent", "Edit content"), action: () => editContent(module) }] : []),
			"separator",
			{ label: t("aaalice.operation.group", "Group"), disabled: ids.length < 2, action: () => groupSelection(page, "group") },
			{ label: t("aaalice.operation.carousel", "Group as carousel"), disabled: ids.length < 2, action: () => groupSelection(page, "carousel") },
			{ label: t("aaalice.operation.ungroup", "Ungroup"), disabled: ids.length !== 1 || !["group", "carousel"].includes(module.type), action: () => ungroup(page, module) },
			...(module.type === "carousel" ? [{
				label: t("aaalice.operation.defaultCarouselPage", "Use current slide as default"),
				disabled: !activeCarouselPage || activeCarouselPage === module.default_child_id,
				action: () => commitMutation(() => { module.default_child_id = activeCarouselPage; }),
			}] : []),
			"separator",
			{ label: t("aaalice.operation.align", "Align"), children: [
				{ label: t("aaalice.operation.alignLeft", "Left"), disabled: ids.length < 2, action: () => alignSelection(page, "left") },
				{ label: t("aaalice.operation.alignRight", "Right"), disabled: ids.length < 2, action: () => alignSelection(page, "right") },
				{ label: t("aaalice.operation.alignTop", "Top"), disabled: ids.length < 2, action: () => alignSelection(page, "top") },
				{ label: t("aaalice.operation.alignBottom", "Bottom"), disabled: ids.length < 2, action: () => alignSelection(page, "bottom") },
			] },
			{ label: t("aaalice.operation.distribute", "Distribute"), children: [
				{ label: t("aaalice.operation.horizontal", "Horizontally"), disabled: ids.length < 3, action: () => distributeSelection(page, "x") },
				{ label: t("aaalice.operation.vertical", "Vertically"), disabled: ids.length < 3, action: () => distributeSelection(page, "y") },
			] },
			{ label: t("aaalice.operation.equalWidth", "Equal width"), disabled: ids.length < 2, action: () => equalWidth(page) },
			{ label: t("aaalice.operation.style", "Style"), children: MODULE_STYLES.map((style) => ({ label: t(`aaalice.operation.style_${style}`, style), action: () => commitMutation(() => { for (const id of ids) page.modules[id].style = style; }) })) },
			{ label: t("aaalice.operation.anchor", "Anchor"), children: Object.keys(OPERATION_ANCHORS).map((anchor) => ({ label: t(`aaalice.operation.anchor_${anchor}`, anchor), action: () => setAnchor(page, ids, anchor) })) },
			...(getState().pages.length > 1 ? [{ label: t("aaalice.operation.moveToPage", "Move to page"), children: getState().pages.filter((candidate) => candidate.id !== page.id).map((candidate) => ({ label: candidate.name, action: () => moveToPage(page, ids, candidate) })) }] : []),
			"separator",
			{ label: t("aaalice.operation.remove", "Remove from Operation Panel"), danger: true, action: () => removeSelected(page, ids) },
		]);
	}

	function renderRootModule(page, module) {
		const wrapper = el("div", `aaalice-operation-module${selection.has(module.id) ? " is-selected" : ""}${editing ? " is-editing" : ""}`);
		wrapper.dataset.moduleId = module.id;
		const rect = moduleRect(page, module);
		wrapper.style.left = `${rect.x}px`;
		wrapper.style.top = `${rect.y}px`;
		wrapper.style.width = `${rect.width}px`;
		wrapper.append(renderer.renderModuleContent(page, module));
		if (editing) {
			wrapper.append(el("div", "aaalice-operation-drag-surface"));
			const resize = el("button", { className: "aaalice-operation-resize", attrs: { type: "button", "aria-label": t("aaalice.operation.resize", "Resize width") } });
			resize.addEventListener("pointerdown", (event) => beginResize(event, page, module));
			wrapper.append(resize);
		}
		wrapper.addEventListener("pointerdown", (event) => beginMove(event, page, module));
		wrapper.addEventListener("contextmenu", (event) => moduleMenu(event, page, module));
		wrapper.addEventListener("dblclick", () => { if (editing && ["heading", "markdown"].includes(module.type)) editContent(module); });
		const measure = () => {
			const height = Math.ceil(wrapper.scrollHeight);
			if (height && measuredHeights.get(module.id) !== height) {
				measuredHeights.set(module.id, height);
				scheduleCollisionReflow(page.id);
				render();
			}
		};
		if (globalThis.ResizeObserver) {
			const observer = new ResizeObserver(measure);
			observer.observe(wrapper);
			viewCleanups.add(() => observer.disconnect());
		} else {
			const frame = requestAnimationFrame(measure);
			viewCleanups.add(() => cancelAnimationFrame(frame));
		}
		return wrapper;
	}

	function cleanupView() {
		for (const dispose of viewCleanups) dispose();
		viewCleanups.clear();
	}

	function destroy() {
		cleanupView();
		for (const dispose of [...gestureCleanups]) dispose();
		clearSelection();
		editing = false;
	}

	return {
		get editing() { return editing; },
		setEditing(value) { editing = Boolean(value); if (!editing) clearSelection(); },
		get selectionSize() { return selection.size; },
		clearSelection,
		selectOnly,
		selectedRootIds,
		moduleHeight,
		moduleRect,
		layoutItems,
		occupiedRects,
		resolveRootCollisions,
		renderRootModule,
		cleanupView,
		destroy,
	};
}
