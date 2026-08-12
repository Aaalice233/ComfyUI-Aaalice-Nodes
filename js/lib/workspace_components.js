/** Reusable composite components for Aaalice sidebar workspaces. */

import { bindScrollInteractionGuard, button, checkboxControl, createAnchoredPopover, el, icon, iconButton, inlineRename, searchToggleButton, segmentedControl } from "./ui.js";
import { attachDescriptionTooltip } from "./description_tooltip.js";
import { DASHBOARD_DEFAULT_CONTROL_ROW_SPAN, DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN } from "./dashboard_sizing.js";
import { dashboardToneCssValue, normalizeDashboardTone } from "./dashboard_color_system.js";

const PAGE_RAIL_DOT_HEIGHT = 20;
const PAGE_RAIL_COLLAPSED_GAP = 4;
const PAGE_RAIL_EXPANDED_GAP = 10;
const PAGE_RAIL_HIT_PADDING = 14;

export function createComponentNoteButton({ note = "", labels = {}, className = "" } = {}) {
	const label = labels.viewNote || "View parameter note";
	const control = iconButton({
		iconName: "help", label, title: null, variant: "ghost",
		className: `aa-component-note-badge${className ? ` ${className}` : ""}`,
	});
	attachDescriptionTooltip(control, () => note || "");
	return control;
}

export function createWorkspaceShell({ title, tabs, activeTab, onTabChange, headerActions = [], footerActions = [] }) {
	const root = el("div", "aa-workspace");
	bindScrollInteractionGuard(root);
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
	const footer = el("footer", { className: "aa-workspace-footer", attrs: { "aria-label": title } });
	const footerLinks = el("div", {
		className: "aa-workspace-footer__links",
		attrs: { "data-aa-workspace-footer-actions": "" },
	});
	const footerUtilities = el("div", { className: "aa-workspace-footer__utilities", children: footerActions });
	const setActive = (value) => { root.dataset.workspace = value; tablist.setValue(value); };
	header.append(tablist, ...headerActions);
	footer.append(footerLinks, footerUtilities);
	root.append(header, content, footer);
	return { root, header, content, footer, footerLinks, footerUtilities, setActive };
}

export function createWorkspaceToolbar(actions = [], { className = "", label = null } = {}) {
	return el("div", { className: `aa-workspace-toolbar${className ? ` ${className}` : ""}`, attrs: { role: "toolbar", "aria-label": label }, children: actions });
}

export function createDashboardComponentPicker({ options = [], labels = {}, onSelect, showLabel = false } = {}) {
	let popover = null;
	const root = el("div", "aa-dashboard-component-picker");
	const trigger = (showLabel ? button : iconButton)({
		iconName: "add",
		label: labels.open || "Add component",
		variant: "ghost",
		size: showLabel ? "sm" : "icon",
		className: `aa-dashboard-add-component${showLabel ? " aa-dashboard-add-component--labeled" : ""}`,
		onClick: () => {
			if (popover) popover.close();
			else openPicker();
		},
	});
	const openPicker = () => {
		if (popover) return;
		trigger.setAttribute("aria-expanded", "true");
		root.classList.add("is-open");
		popover = createAnchoredPopover({
			anchor: trigger,
			ariaLabel: labels.title || "Dashboard components",
			className: "aa-dashboard-component-popover",
			width: 228,
			onClose: () => {
				popover = null;
				trigger.setAttribute("aria-expanded", "false");
				root.classList.remove("is-open");
			},
		});
		const heading = el("header", { className: "aa-dashboard-component-popover__header", children: [el("strong", null, labels.title || "Add component")] });
		const list = el("div", { className: "aa-dashboard-component-popover__list", attrs: { role: "list" } });
		const availableOptions = options.filter((option) => option && option.id && option.label);
		if (!availableOptions.length) {
			list.append(el("p", "aa-dashboard-component-popover__empty", labels.empty || "No components available"));
		} else {
			for (const option of availableOptions) {
				const action = button({
					label: option.label,
					iconName: option.iconName || "add",
					variant: "ghost",
					size: "sm",
					className: "aa-dashboard-component-option",
					disabled: option.disabled,
					onClick: () => {
						popover?.close();
						onSelect?.(option.id);
					},
				});
				action.dataset.componentId = option.id;
				list.append(action);
			}
		}
		popover.root.append(heading, list);
		popover.reposition();
	};
	trigger.setAttribute("aria-haspopup", "dialog");
	trigger.setAttribute("aria-expanded", "false");
	root.append(trigger);
	return { root, trigger, close: () => popover?.close() };
}

export function createDashboardPageHeading({ page, pages = [], index = 0, labels = {}, className = "", onRename, onSelectPage, onReorderStart, onReorderPage } = {}) {
	const renameHint = labels.renameHint || "Double-click to rename";
	const renameLabel = labels.renamePage || "Rename page";
	const title = el("h2", {
		className: "aa-dashboard-page-heading__title",
		attrs: { tabindex: "0", title: renameHint, "aria-current": "page", "aria-label": `${page?.name || ""}. ${renameHint}` },
		text: page?.name || "",
	});
	const startRename = () => {
		inlineRename(title, {
			value: page?.name || "",
			ariaLabel: renameLabel,
			onCommit: (name) => {
				if (name && name !== page?.name) onRename?.(name);
				else title.textContent = page?.name || "";
			},
		});
	};
	title.addEventListener("dblclick", (event) => {
		event.preventDefault();
		event.stopPropagation();
		startRename();
	});
	title.addEventListener("keydown", (event) => {
		if (!["Enter", "F2"].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		startRename();
	});
	const folioIndex = String(index + 1).padStart(2, "0");
	const folioTotal = String(Math.max(pages.length, 1)).padStart(2, "0");
	const switchLabel = labels.switchPage || "Switch page";
	const folio = el("button", {
		className: "aa-dashboard-page-heading__folio",
		attrs: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": `${switchLabel}: ${folioIndex}/${folioTotal}` },
		children: [
			el("span", "aa-dashboard-page-heading__folio-index", folioIndex),
			el("span", "aa-dashboard-page-heading__folio-total", `/${folioTotal}`),
			icon("moveDown", { className: "aa-dashboard-page-heading__folio-arrow" }),
		],
	});
	let popover = null;
	const openPageMenu = ({ focusOnOpen = true } = {}) => {
		if (popover) return;
		folio.setAttribute("aria-expanded", "true");
		const rows = [];
		const list = el("div", { className: "aa-dashboard-page-menu", attrs: { role: "listbox", "aria-label": labels.pages || "Dashboard pages" } });
		pages.forEach((entry, entryIndex) => {
			const active = entry.id === page?.id;
			const row = el("button", {
				className: `aa-dashboard-page-menu__row${active ? " is-active" : ""}`,
				attrs: { type: "button", role: "option", "aria-selected": String(active) },
				children: [
					el("span", { className: "aa-dashboard-page-menu__drag-handle", attrs: { draggable: "true", "aria-hidden": "true", title: labels.reorderPage || "Drag to reorder" }, children: [icon("drag")] }),
					el("span", "aa-dashboard-page-menu__index", String(entryIndex + 1).padStart(2, "0")),
					el("span", "aa-dashboard-page-menu__name", entry.name),
					...(active ? [icon("statusCheck", { className: "aa-dashboard-page-menu__check" })] : []),
				],
			});
			row.dataset.pageId = entry.id;
			row.addEventListener("click", (event) => { if (event.target.closest?.(".aa-dashboard-page-menu__drag-handle")) return; popover?.close(); if (!active) onSelectPage?.(entry.id); });
			row.addEventListener("keydown", (event) => {
				if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
				event.preventDefault();
				const target = pages[entryIndex + (event.key === "ArrowUp" ? -1 : 1)];
				if (target) { onReorderStart?.(); onReorderPage?.(entry.id, target.id); }
			});
			rows.push(row); list.append(row);
		});
		list.addEventListener("keydown", (event) => {
			if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
			event.preventDefault();
			const current = rows.indexOf(document.activeElement);
			const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, current) + (event.key === "ArrowDown" ? 1 : -1);
			rows[(next + rows.length) % rows.length]?.focus();
		});
		const clearDropTargets = () => rows.forEach((row) => row.classList.remove("is-drop-target"));
		list.addEventListener("dragstart", (event) => {
			const handle = event.target.closest(".aa-dashboard-page-menu__drag-handle");
			if (!handle) return;
			onReorderStart?.();
			const row = handle.closest(".aa-dashboard-page-menu__row");
			if (row) { event.dataTransfer?.setData("application/x-aaalice-page", row.dataset.pageId); event.dataTransfer.effectAllowed = "move"; row.classList.add("is-dragging"); }
		});
		list.addEventListener("dragend", (event) => { event.target.closest(".aa-dashboard-page-menu__row")?.classList.remove("is-dragging"); clearDropTargets(); });
		list.addEventListener("dragover", (event) => {
			const row = event.target.closest(".aa-dashboard-page-menu__row");
			if (!row) return;
			event.preventDefault(); clearDropTargets(); row.classList.add("is-drop-target");
		});
		list.addEventListener("drop", (event) => {
			const row = event.target.closest(".aa-dashboard-page-menu__row");
			if (!row) return;
			event.preventDefault(); clearDropTargets();
			const source = event.dataTransfer?.getData("application/x-aaalice-page");
			if (source && source !== row.dataset.pageId) { popover?.close(); onReorderPage?.(source, row.dataset.pageId); }
		});
		popover = createAnchoredPopover({
			anchor: folio, ariaLabel: labels.pages || "Dashboard pages", className: "aa-dashboard-page-popover", width: 220, focusOnOpen,
			transientHover: true,
			onClose: () => { popover = null; folio.setAttribute("aria-expanded", "false"); },
		});
		popover.root.append(list);
	};
	folio.addEventListener("click", () => { if (popover) popover.close(); else openPageMenu(); });
	return el("div", {
		className: `aa-dashboard-page-heading${className ? ` ${className}` : ""}`,
		children: [folio, title],
	});
}

export function createDashboardPresetPicker({ presets = [], baselineId = null, comparison = null, error = null, labels = {}, attentionReview = null, onSelect, onCreate, onUpdate, onDuplicate, onRename, onDelete, onRestore, onClose } = {}) {
	const hasError = Boolean(error);
	const availablePresets = hasError ? [] : presets;
	const selected = availablePresets.find((preset) => preset.id === baselineId) || null;
	const modified = Boolean(selected && comparison?.modified);
	const unsaved = !selected;
	const dirty = modified || unsaved;
	const statusLabel = hasError || comparison?.attention ? labels.attention : "";
	const triggerTitle = !hasError && selected && modified
		? `${selected.name} · ${(labels.changeSummary || "{layout} layout · {values} values").replace("{layout}", String(comparison?.layoutChanges || 0)).replace("{values}", String(comparison?.valueChanges || 0))}`
		: "";
	const root = el("div", "aa-value-preset-picker");
	const trigger = el("button", {
		className: `aa-value-preset-trigger${modified ? " is-modified" : ""}${hasError || comparison?.attention ? " needs-attention" : ""}`,
		attrs: { type: "button", title: triggerTitle || null, "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": labels.open || "Sidebar presets" },
		children: [
			el("span", "aa-value-preset-trigger__name", hasError ? labels.dataError : selected ? `${selected.name}${modified ? "*" : ""}` : labels.placeholder || "Select preset"),
			...(statusLabel ? [el("span", "aa-value-preset-trigger__status", statusLabel)] : []),
			icon("moveDown", { className: "aa-value-preset-trigger__arrow" }),
		],
	});
	let popover = null;
	const close = () => popover?.close();
	const invoke = (callback, ...args) => { close(); callback?.(...args); };
	const open = () => {
		if (popover) return;
		trigger.setAttribute("aria-expanded", "true"); root.classList.add("is-open");
		popover = createAnchoredPopover({
			anchor: trigger, ariaLabel: labels.title || "Sidebar presets", className: "aa-value-preset-popover", width: 340,
			onClose: () => { popover = null; trigger.setAttribute("aria-expanded", "false"); root.classList.remove("is-open"); onClose?.(); },
		});
		const heading = el("header", { className: "aa-value-preset-popover__header", children: [
			el("strong", null, labels.title || "Sidebar presets"),
			...(availablePresets.length ? [el("span", "aa-value-preset-count", (labels.presetCount || "{count} presets").replace("{count}", String(availablePresets.length)))] : []),
			...(!hasError && availablePresets.length ? [button({ label: labels.add || "New", iconName: "add", variant: "ghost", size: "sm", onClick: () => invoke(onCreate) })] : []),
		] });
		// 「需要处理」诊断入口：列出具体失效绑定并直达修复，不让用户逐卡片猜测。
		const attentionRow = !hasError && comparison?.attention ? (() => {
			const count = Math.max(0, Number(attentionReview?.count) || 0);
			const text = count
				? (labels.attentionBindings || "{count} bindings need attention").replace("{count}", String(count))
				: (labels.attentionStale || "The preset holds values of removed components");
			const row = el("button", {
				className: "aa-value-preset-attention", attrs: { type: "button" },
				children: [icon("statusWarning"), el("span", null, text), icon("arrowRight", { className: "aa-value-preset-attention__arrow" })],
			});
			row.addEventListener("click", () => invoke(attentionReview?.onReview));
			return row;
		})() : null;
		const list = el("div", {
			className: `aa-value-preset-list${availablePresets.length ? "" : " is-empty"}`,
			attrs: availablePresets.length ? { role: "listbox", "aria-label": labels.title || "Sidebar presets" } : {},
		});
		if (hasError) list.append(el("div", { className: "aa-value-preset-empty is-error", children: [
			el("span", { className: "aa-value-preset-empty__icon", attrs: { "aria-hidden": "true" }, children: [icon("statusError")] }),
			el("strong", null, labels.dataError || "Preset data is unavailable"),
			el("small", null, String(error?.message || labels.dataErrorHint || "The saved preset data could not be read.")),
		] }));
		else if (!availablePresets.length) list.append(el("div", { className: "aa-value-preset-empty", children: [
			el("span", { className: "aa-value-preset-empty__icon", attrs: { "aria-hidden": "true" }, children: [icon("layout")] }),
			el("strong", null, labels.empty || "No presets yet"),
			el("small", null, labels.emptyHint || "Save the current layout and values for quick switching later."),
			button({ label: labels.emptyAction || "Save current sidebar", iconName: "add", variant: "primary", size: "sm", onClick: () => invoke(onCreate) }),
		] }));
		for (const preset of availablePresets) {
			const active = preset.id === baselineId;
			const action = el("button", {
				className: `aa-value-preset-option${active ? " is-active" : ""}`,
				attrs: { type: "button", role: "option", "aria-selected": String(active) },
				children: [el("span", { children: [el("strong", null, preset.name), el("small", null, (labels.presetSummary || "{pages} pages · {values} values").replace("{pages}", String(preset.dashboard?.pages?.length || 0)).replace("{values}", String(Object.keys(preset.values || {}).length)))] }), ...(active ? [icon("statusCheck")] : [])],
			});
			const manage = el("div", {
				className: "aa-value-preset-option-actions",
				attrs: { role: "toolbar", "aria-label": labels.manage || "Manage preset" },
				children: [
					iconButton({ iconName: "edit", label: labels.rename || "Rename", variant: "ghost", onClick: () => invoke(onRename, preset.id) }),
					iconButton({ iconName: "copy", label: labels.duplicate || "Duplicate", variant: "ghost", onClick: () => invoke(onDuplicate, preset.id) }),
					iconButton({ iconName: "delete", label: labels.delete || "Delete", variant: "ghost", className: "is-danger", onClick: () => invoke(onDelete, preset.id) }),
				],
			});
			action.addEventListener("click", () => { if (!active) invoke(onSelect, preset.id); });
			list.append(el("div", { className: "aa-value-preset-option-row", children: [action, manage] }));
		}
		const currentActions = !hasError && dirty && availablePresets.length ? el("div", { className: "aa-value-preset-current-actions", children: [
			...(selected ? [el("div", { className: "aa-value-preset-current-context", children: [
				el("span", null, labels.modified || "Unsaved changes"),
				el("small", null, (labels.changeSummary || "{layout} layout · {values} values").replace("{layout}", String(comparison?.layoutChanges || 0)).replace("{values}", String(comparison?.valueChanges || 0))),
			] })] : []),
			el("div", { className: `aa-value-preset-current-primary${selected ? "" : " is-single"}`, children: [
				...(selected ? [button({ label: labels.update || "Save changes", iconName: "statusCheck", variant: "primary", size: "sm", onClick: () => invoke(onUpdate, selected.id) })] : []),
				...(selected ? [button({ label: labels.restore || "Discard changes", iconName: "refresh", variant: "ghost", size: "sm", onClick: () => invoke(onRestore, selected.id) })] : [button({ label: labels.saveCurrent || "Save as preset", iconName: "copy", variant: "primary", size: "sm", onClick: () => invoke(onCreate) })]),
			] }),
		] }) : null;
		popover.root.append(heading, ...(attentionRow ? [attentionRow] : []), list, ...(currentActions ? [currentActions] : []));
		popover.reposition();
	};
	trigger.addEventListener("click", () => { if (popover) close(); else open(); });
	trigger.addEventListener("keydown", (event) => { if (["ArrowDown", "ArrowUp"].includes(event.key) && !popover) { event.preventDefault(); open(); } });
	root.append(trigger); return root;
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
	const root = el("section", { className: `aa-transfer-hero is-${tone}${fileName ? " has-file" : ""}`, children: [el("span", { className: "aa-transfer-hero__icon", children: [icon(iconName)] }), copy] });
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
	const toggle = searchToggleButton({ label, value, open, disabled, onClick: () => onToggle?.(!open) });
	if (!open) return { toggle, panel: null, input: null };
	const input = document.createElement("input"); input.type = "search"; input.className = "aa-ui-search-input"; input.value = value; input.placeholder = placeholder; input.setAttribute("aria-label", label);
	input.addEventListener("input", () => { toggle.setSearchValue(input.value); onInput?.(input.value); });
	input.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); onToggle?.(false); } });
	const panel = el("div", { className: "aa-workspace-search", children: [
		icon("search"), input,
		iconButton({ iconName: "arrowRight", label: closeLabel, className: "aa-ui-search-collapse", variant: "ghost", onClick: () => onToggle?.(false) }),
	] });
	if (focus) queueMicrotask(() => { if (input.isConnected) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); } });
	return { toggle, panel, input };
}

export function createPageRail(initialState = {}) {
	const root = el("nav", { className: "aa-dashboard-page-rail", attrs: { "aria-orientation": "vertical" } });
	const hoverArea = el("span", { className: "aa-dashboard-page-rail__hover-area", attrs: { "aria-hidden": "true" } });
	const list = el("div", "aa-dashboard-page-list");
	root.append(hoverArea, list);
	const items = new Map();
	let state = { pages: [], activeId: null, expanded: false, editMode: false, labels: {}, onSelect: null, onReorder: null };
	let collapseFrame = 0;
	const updateHoverHeight = () => {
		const count = state.pages.length;
		const gap = state.expanded ? PAGE_RAIL_EXPANDED_GAP : PAGE_RAIL_COLLAPSED_GAP;
		const clusterHeight = count * PAGE_RAIL_DOT_HEIGHT + Math.max(0, count - 1) * gap + PAGE_RAIL_HIT_PADDING;
		const hitHeight = Math.max(56, clusterHeight);
		hoverArea.style.height = `${hitHeight}px`;
		list.style.height = `${hitHeight}px`;
	};
	const setExpanded = (expanded) => {
		const next = Boolean(expanded);
		if (state.expanded === next) return;
		state.expanded = next;
		root.classList.toggle("is-expanded", next);
		updateHoverHeight();
	};
	const cancelCollapse = () => {
		if (!collapseFrame) return;
		cancelAnimationFrame(collapseFrame);
		collapseFrame = 0;
	};
	const isInteractiveSurfaceHovered = () => hoverArea.matches(":hover") || list.matches(":hover") || Boolean(root.querySelector(".aa-dashboard-page-dot:hover"));
	const keepExpanded = () => { cancelCollapse(); setExpanded(true); };
	const scheduleCollapse = () => {
		cancelCollapse();
		// Reparenting the persistent rail during a page render can emit a transient pointerleave.
		collapseFrame = requestAnimationFrame(() => {
			collapseFrame = 0;
			if (isInteractiveSurfaceHovered() || root.querySelector(".aa-dashboard-page-dot:focus-visible")) return;
			setExpanded(false);
		});
	};
	const updateItem = (item, page) => {
		if (!item) return;
		const active = page.id === state.activeId;
		item.dataset.pageId = page.id;
		item.draggable = Boolean(state.editMode);
		item.classList.toggle("is-active", active);
		item.setAttribute("aria-label", page.name);
		const label = item.querySelector(".aa-ui-button__label");
		if (label) label.textContent = page.name;
		if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
	};
	const update = (nextState = {}) => {
		state = { ...state, ...nextState, pages: nextState.pages || state.pages, labels: nextState.labels || state.labels };
		root.classList.toggle("is-empty", state.pages.length === 0);
		root.classList.toggle("is-expanded", Boolean(state.expanded));
		updateHoverHeight();
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
	};
	const selectIndex = (index, { focus = false } = {}) => {
		const next = state.pages[Math.max(0, Math.min(state.pages.length - 1, index))];
		if (!next || next.id === state.activeId) return false;
		state.activeId = next.id;
		for (const page of state.pages) updateItem(items.get(page.id), page);
		if (focus) queueMicrotask(() => items.get(next.id)?.focus({ preventScroll: true }));
		state.onSelect?.(next.id);
		return true;
	};
	root.addEventListener("click", (event) => {
		const item = event.target.closest?.(".aa-dashboard-page-dot");
		if (!item) return;
		keepExpanded();
		const index = state.pages.findIndex((page) => page.id === item.dataset.pageId);
		if (index >= 0) selectIndex(index);
	});
	hoverArea.addEventListener("pointerenter", keepExpanded);
	hoverArea.addEventListener("pointerleave", scheduleCollapse);
	list.addEventListener("pointerenter", keepExpanded);
	list.addEventListener("pointerleave", scheduleCollapse);
	root.addEventListener("pointerover", (event) => {
		const item = event.target.closest?.(".aa-dashboard-page-dot");
		if (item) keepExpanded();
	});
	// Collapse after layout settles so moving the persistent rail between page render shells cannot flicker it closed.
	root.addEventListener("pointerleave", scheduleCollapse);
	root.addEventListener("focusin", (event) => {
		const item = event.target.closest?.(".aa-dashboard-page-dot");
		if (item) keepExpanded();
	});
	root.addEventListener("focusout", scheduleCollapse);
	root.addEventListener("keydown", (event) => {
		if (!event.target.closest?.(".aa-dashboard-page-dot")) return;
		const activeIndex = state.pages.findIndex((page) => page.id === state.activeId);
		let nextIndex = null;
		if (event.key === "ArrowUp" || event.key === "PageUp") nextIndex = activeIndex - 1;
		else if (event.key === "ArrowDown" || event.key === "PageDown") nextIndex = activeIndex + 1;
		else if (event.key === "Home") nextIndex = 0;
		else if (event.key === "End") nextIndex = state.pages.length - 1;
		if (nextIndex == null) return;
		event.preventDefault();
		selectIndex(nextIndex, { focus: true });
	});
	root.addEventListener("dragstart", (event) => {
		const item = event.target.closest?.(".aa-dashboard-page-dot");
		if (state.editMode && item) event.dataTransfer?.setData("application/x-aaalice-page", item.dataset.pageId);
	});
	root.addEventListener("dragover", (event) => { if (state.editMode && event.target.closest?.(".aa-dashboard-page-dot")) event.preventDefault(); });
	root.addEventListener("drop", (event) => {
		const item = event.target.closest?.(".aa-dashboard-page-dot");
		if (!state.editMode || !item) return;
		event.preventDefault();
		const source = event.dataTransfer?.getData("application/x-aaalice-page");
		if (source && source !== item.dataset.pageId) state.onReorder?.(source, item.dataset.pageId);
	});
	root.update = update;
	root.destroy = cancelCollapse;
	update(initialState);
	return root;
}

export function createControlCard({ item, title, control, status = "ok", description = "", linkedCount = 0, mixed = false, editMode, labels = {}, onManage, onMove, onRemove, onToggleSpan, onGroup, onUngroup, onRenameTitle }) {
	const headerOnly = control?.dataset?.headerOnly === "true";
	const hasMultilineControl = control?.classList?.contains("is-multiline");
	const unavailable = control?.dataset?.controlAvailability && control.dataset.controlAvailability !== "ready";
	const cardTone = normalizeDashboardTone(item.tone);
	const hasCardTone = cardTone !== "neutral";
	const root = el("article", { className: `aa-control-card${status !== "ok" ? " is-missing" : ""}${unavailable ? " is-unavailable" : ""}${headerOnly ? " is-header-only" : ""}${hasMultilineControl ? " has-multiline-control" : ""}${linkedCount ? " has-linked-bindings" : ""}${mixed ? " has-mixed-bindings" : ""}${item.note ? " has-component-note" : ""}${hasCardTone ? " has-dashboard-tone" : ""}`, attrs: { "data-item-id": item.id, "data-dashboard-item-id": item.id, "data-dashboard-item-tone": hasCardTone ? cardTone : null, "data-provider": item.binding?.provider || "layout", tabindex: onManage ? 0 : null, "aria-label": title } });
	if (hasCardTone) root.style.setProperty("--aa-dashboard-control-tone", dashboardToneCssValue(cardTone));
	if (control?.dataset?.controlKind) root.dataset.controlKind = control.dataset.controlKind;
	if (control?.dataset?.controlFamily) root.dataset.controlFamily = control.dataset.controlFamily;
	root.dataset.dashboardMinRowSpan = String(control?.dataset?.dashboardMinRowSpan || (headerOnly ? DASHBOARD_MIN_HEADER_CONTROL_ROW_SPAN : DASHBOARD_DEFAULT_CONTROL_ROW_SPAN));
	const header = el("header", "aa-control-card-header");
	const titleElement = el("span", "aa-control-card-title", title);
	if (onRenameTitle) {
		titleElement.title = labels.renameHint || "Double-click to rename";
		titleElement.addEventListener("dblclick", (event) => {
			event.preventDefault(); event.stopPropagation();
			inlineRename(titleElement, { value: title, ariaLabel: labels.renameHint || "Rename", onCommit: (name) => { if (name) onRenameTitle(name); else titleElement.textContent = title; } });
		});
	}
	header.append(titleElement);
	if (description) attachDescriptionTooltip(titleElement, description);
	if (item.note) header.append(createComponentNoteButton({ note: item.note, labels }));
	if (linkedCount) {
		const total = linkedCount + 1;
		const linkedLabel = String(labels.linkedParameters || "Controls {count} parameters").replace("{count}", String(total));
		const linkedStatus = mixed ? `${linkedLabel} · ${labels.mixedValues || "Values differ"}` : linkedLabel;
		const linkedBadge = el("span", { className: `aa-control-card-binding-count${mixed ? " is-mixed" : ""}`, attrs: { "aria-label": linkedStatus }, children: [icon("link"), el("span", null, String(total))] });
		linkedBadge.dataset.linkedLabel = linkedLabel;
		linkedBadge.dataset.linkedMixedLabel = `${linkedLabel} · ${labels.mixedValues || "Values differ"}`;
		attachDescriptionTooltip(linkedBadge, () => linkedBadge.getAttribute("aria-label") || linkedLabel);
		header.append(linkedBadge);
	}
	if (control?.headerAccessories?.length) header.append(...control.headerAccessories);
	root.append(header, control || el("p", "aa-control-card-error", status === "incompatible" ? (labels.incompatible || "Incompatible control") : (labels.missing || "Missing binding")));
	if (editMode && item.kind === "control") root.append(el("button", { className: "aa-dashboard-resize-handle", attrs: { type: "button", "data-dashboard-resize-handle": "true", "aria-label": labels.resizeCard || "Resize card" } }));
	const openMenu = (x, y) => onManage?.({ x, y, ownerElement: root, editMode, onMove, onRemove, onToggleSpan, onGroup, onUngroup });
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
