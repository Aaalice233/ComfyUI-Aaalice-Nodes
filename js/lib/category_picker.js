/** Searchable tree picker for every prompt-library category surface. */

import { applyCategoryColor } from "./category_color.js";
import { UNCATEGORIZED_CATEGORY_ID } from "./category_tree.js";
import { createAnchoredPopover, el, icon } from "./ui.js";

function normalized(value) { return String(value || "").trim().toLocaleLowerCase(); }

export function categoryPicker({
	tree,
	value = "",
	ariaLabel = "Category",
	emptyLabel = "No category",
	placeholderLabel = emptyLabel,
	uncategorizedLabel = "",
	searchPlaceholder = "Search categories",
	showCounts = true,
	counts = null,
	className = "",
	onChange = null,
} = {}) {
	let categoryTree = tree;
	let countValues = counts;
	let currentValue = String(value || "");
	let popover = null;
	let redrawPopover = null;
	let collapseInitialized = false;
	const collapsed = new Set();
	const revealCurrentAncestors = () => {
		for (const category of categoryTree?.ancestors(currentValue) || []) collapsed.delete(category.id);
	};
	const initializeCollapsed = () => {
		if (collapseInitialized) return;
		for (const record of categoryTree?.flat || []) if (record.hasChildren) collapsed.add(record.id);
		revealCurrentAncestors();
		collapseInitialized = true;
	};
	const root = el("div", `aa-category-picker${className ? ` ${className}` : ""}`);
	const swatch = el("span", { className: "aa-category-picker__swatch", attrs: { "aria-hidden": "true" } });
	const label = el("span", "aa-category-picker__label");
	const trigger = el("button", {
		className: "aa-category-picker__trigger",
		attrs: { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": ariaLabel },
		children: [swatch, label, icon("moveDown", { className: "aa-category-picker__arrow" })],
	});

	const currentRecord = () => categoryTree?.record(currentValue) || null;
	const sync = () => {
		const record = currentRecord();
		const displayLabel = currentValue === UNCATEGORIZED_CATEGORY_ID ? uncategorizedLabel : record?.pathLabel || (currentValue ? placeholderLabel : emptyLabel);
		label.textContent = displayLabel;
		trigger.title = displayLabel;
		root.classList.toggle("has-category", Boolean(record));
		root.classList.remove("is-category-colored");
		root.style.removeProperty("--aa-category-color");
		if (record) applyCategoryColor(root, record.category);
	};
	const close = () => popover?.close();
	const choose = (nextValue) => {
		currentValue = String(nextValue || "");
		sync();
		close();
		onChange?.(currentValue);
	};
	const open = () => {
		if (popover || trigger.disabled) return;
		initializeCollapsed();
		trigger.setAttribute("aria-expanded", "true");
		root.classList.add("is-open");
		popover = createAnchoredPopover({
			anchor: trigger,
			ariaLabel,
			className: "aa-category-picker-popover",
			width: Math.max(280, Math.round(trigger.getBoundingClientRect().width)),
			onClose: () => {
				popover = null;
				redrawPopover = null;
				trigger.setAttribute("aria-expanded", "false");
				root.classList.remove("is-open");
			},
		});
		const search = document.createElement("input");
		search.type = "search";
		search.className = "aa-ui-search-input aa-category-picker__search";
		search.placeholder = searchPlaceholder;
		search.setAttribute("aria-label", searchPlaceholder);
		const list = el("div", { className: "aa-category-picker__list", attrs: { role: "listbox", "aria-label": ariaLabel } });
		const focusRows = (offset) => {
			const rows = [...list.querySelectorAll('[role="option"]:not(:disabled)')];
			rows[Math.max(0, Math.min(rows.length - 1, offset))]?.focus();
		};
		const redrawAndFocus = (categoryId) => {
			draw();
			list.querySelector(`[data-category-id="${CSS.escape(categoryId)}"]`)?.focus({ preventScroll: true });
		};
		const draw = () => {
			const needle = normalized(search.value);
			const visibleIds = new Set();
			if (needle) {
				const records = categoryTree?.flat || [];
				for (const record of records) if (normalized(record.pathLabel).includes(needle)) visibleIds.add(record.id);
				for (let index = records.length - 1; index >= 0; index -= 1) {
					const record = records[index];
					if (visibleIds.has(record.id) && record.parentId) visibleIds.add(record.parentId);
				}
			}
			const hiddenByCollapse = new Set();
			const rows = [];
			const emptyActive = !currentValue;
			const empty = el("button", {
				className: `aa-category-picker__option is-empty${emptyActive ? " is-selected" : ""}`,
				attrs: { type: "button", role: "option", "aria-selected": String(emptyActive) },
				children: [el("span", "aa-category-picker__option-expander"), el("span", "aa-category-picker__option-marker"), el("span", "aa-category-picker__option-copy", emptyLabel), icon("statusCheck")],
			});
			empty.addEventListener("click", () => choose(""));
			rows.push(empty);
			if (uncategorizedLabel && (!needle || normalized(uncategorizedLabel).includes(needle))) {
				const active = currentValue === UNCATEGORIZED_CATEGORY_ID;
				const count = countValues?.get(UNCATEGORIZED_CATEGORY_ID) ?? countValues?.get(null) ?? categoryTree?.uncategorizedCount ?? 0;
				const uncategorized = el("button", {
					className: `aa-category-picker__option is-uncategorized${showCounts ? " has-count" : ""}${active ? " is-selected" : ""}`,
					attrs: { type: "button", role: "option", "aria-selected": String(active) },
					children: [el("span", "aa-category-picker__option-expander"), el("span", "aa-category-picker__option-marker"), el("span", "aa-category-picker__option-copy", uncategorizedLabel), ...(showCounts ? [el("em", null, String(count))] : []), icon("statusCheck")],
				});
				uncategorized.addEventListener("click", () => choose(UNCATEGORIZED_CATEGORY_ID));
				rows.push(uncategorized);
			}
			for (const record of categoryTree?.flat || []) {
				if (!needle && record.parentId && (hiddenByCollapse.has(record.parentId) || collapsed.has(record.parentId))) hiddenByCollapse.add(record.id);
				if ((needle && !visibleIds.has(record.id)) || (!needle && hiddenByCollapse.has(record.id))) continue;
				const active = record.id === currentValue;
				const expanded = needle ? true : !collapsed.has(record.id);
				const expander = el("span", {
					className: `aa-category-picker__option-expander${record.hasChildren ? " has-children" : ""}${expanded ? " is-expanded" : ""}`,
					attrs: { "aria-hidden": "true" },
					children: record.hasChildren ? [icon("moveDown")] : [],
				});
				const option = applyCategoryColor(el("button", {
					className: `aa-category-picker__option${showCounts ? " has-count" : ""}${active ? " is-selected" : ""}`,
					attrs: { type: "button", role: "option", "aria-selected": String(active), ...(record.hasChildren ? { "aria-expanded": String(expanded) } : {}), title: record.pathLabel },
					children: [
						expander,
						el("span", "aa-category-picker__option-marker"),
						el("span", { className: "aa-category-picker__option-copy", children: [el("strong", null, record.pathLabel)] }),
						...(showCounts ? [el("em", null, String((countValues || categoryTree.aggregateCount).get(record.id) || 0))] : []),
						icon("statusCheck"),
					],
				}), record.category);
				option.dataset.categoryId = record.id;
				option.style.setProperty("--aa-category-depth", String(Math.min(record.depth, 6)));
				option.addEventListener("click", (event) => {
					if (record.hasChildren && event.target.closest(".aa-category-picker__option-expander")) {
						event.preventDefault();
						if (expanded) collapsed.add(record.id); else collapsed.delete(record.id);
						redrawAndFocus(record.id);
						return;
					}
					choose(record.id);
				});
				rows.push(option);
			}
			list.replaceChildren(...rows);
			for (const option of rows) option.addEventListener("keydown", (event) => {
				if (event.isComposing) return;
				const enabled = [...list.querySelectorAll('[role="option"]:not(:disabled)')];
				const index = enabled.indexOf(option);
				const record = categoryTree?.record(option.dataset.categoryId);
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					enabled[(index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length]?.focus();
				} else if (event.key === "Home" || event.key === "End") {
					event.preventDefault();
					enabled[event.key === "Home" ? 0 : enabled.length - 1]?.focus();
				} else if (!needle && event.key === "ArrowRight" && record?.hasChildren) {
					event.preventDefault();
					if (collapsed.delete(record.id)) redrawAndFocus(record.id);
					else list.querySelector(`[data-category-id="${CSS.escape(categoryTree.children(record.id)[0]?.id || "")}"]`)?.focus({ preventScroll: true });
				} else if (!needle && event.key === "ArrowLeft" && record) {
					event.preventDefault();
					if (record.hasChildren && !collapsed.has(record.id)) { collapsed.add(record.id); redrawAndFocus(record.id); }
					else if (record.parentId) list.querySelector(`[data-category-id="${CSS.escape(record.parentId)}"]`)?.focus({ preventScroll: true });
				} else if (event.key === "Escape") {
					event.preventDefault(); close(); trigger.focus();
				}
			});
		};
		let composing = false;
		redrawPopover = draw;
		search.addEventListener("compositionstart", () => { composing = true; });
		search.addEventListener("compositionend", () => { composing = false; draw(); });
		search.addEventListener("input", () => { if (!composing) draw(); });
		search.addEventListener("keydown", (event) => {
			if (event.isComposing) return;
			if (event.key === "ArrowDown") { event.preventDefault(); focusRows(0); }
			else if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); }
		});
		popover.root.append(el("div", { className: "aa-category-picker__search-wrap", children: [icon("search"), search] }), list);
		draw();
		queueMicrotask(() => search.focus({ preventScroll: true }));
	};

	trigger.addEventListener("click", () => { if (popover) close(); else open(); });
	trigger.addEventListener("keydown", (event) => {
		if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !popover) { event.preventDefault(); open(); }
	});
	root.append(trigger);
	root.control = trigger;
	root.setTree = (nextTree, nextValue = currentValue) => {
		const structureChanged = categoryTree !== nextTree;
		const previousIds = new Set(categoryTree?.flat?.map((record) => record.id) || []);
		categoryTree = nextTree; currentValue = String(nextValue || "");
		if (collapseInitialized) {
			for (const categoryId of collapsed) if (!categoryTree?.record(categoryId)?.hasChildren) collapsed.delete(categoryId);
			for (const record of categoryTree?.flat || []) if (record.hasChildren && !previousIds.has(record.id)) collapsed.add(record.id);
			revealCurrentAncestors();
		}
		sync();
		if (structureChanged) close(); else redrawPopover?.();
	};
	root.setCounts = (nextCounts) => { countValues = nextCounts; redrawPopover?.(); };
	root.setValue = (next) => { currentValue = String(next || ""); revealCurrentAncestors(); sync(); redrawPopover?.(); };
	root.setDisabled = (next) => { trigger.disabled = Boolean(next); if (trigger.disabled) close(); };
	root.destroy = close;
	Object.defineProperty(root, "value", { get: () => currentValue, set: (next) => root.setValue(next) });
	sync();
	return root;
}
