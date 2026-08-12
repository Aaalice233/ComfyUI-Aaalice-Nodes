/** Mount one Booru Gallery projection while the node runtime owns shared state and requests. */
import { mountVirtualList } from "./virtual_list.js";
import { mountVirtualMasonry } from "./virtual_masonry.js";
import { installMasonryCardMotion } from "./booru_gallery_cards.js";
import { observeDOMWidgetVisibility } from "./dom_widget_visibility.js";
import { button, el, icon, isolate, listboxControl, segmentedControl } from "./ui.js";

const NODE_MODE = Object.freeze({ active: 0, mute: 2, bypass: 4 });
let nextSurfaceId = 1;

function nodeModeValue(node) {
	if (Number(node?.mode) === NODE_MODE.mute) return "mute";
	if (Number(node?.mode) === NODE_MODE.bypass) return "bypass";
	return "active";
}

export function observeGalleryNodeMode(node, onChange) {
	const events = node.graph?.events;
	if (!events?.addEventListener || !events?.removeEventListener) return { sync: onChange, dispose() {} };
	const handleChange = (event) => {
		const detail = event?.detail;
		if (detail?.property === "mode" && String(detail.nodeId) === String(node.id)) onChange();
	};
	events.addEventListener("node:property:changed", handleChange);
	return { sync: onChange, dispose: () => events.removeEventListener("node:property:changed", handleChange) };
}

export function createGallerySurfaceFactory(dependencies) {
	const {
		capability, collectionOptions, collectionValue, createGalleryCard, createPageControl,
		createSearchControl, createSelectedRow, defaultGalleryRatings, getCapabilities,
		hasSourceCredentials, icon, label, openClearSelectionDialog, openFilter,
		openGalleryErrorDialog, openGallerySettings, openPromptOptions, stateFor, transact,
	} = dependencies;

	return function createGallerySurface(node, controller, { placement = "node" } = {}) {
		const surfaceId = `aa-gallery-surface-${nextSurfaceId++}`;
		const root = isolate(el("div", { className: `aa-gallery aa-gallery--${placement}`, attrs: { "data-mode": stateFor(node).view, "data-capture-wheel": "true", "data-gallery-surface": surfaceId } }));
		root.dataset.source = stateFor(node).source;
		const focusScrollableOnPointerEnter = (target) => target.addEventListener("pointerenter", () => {
			const active = document.activeElement;
			if (active && root.contains(active)) return;
			if (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) return;
			target.focus({ preventScroll: true });
		});
		let collection = null;
		const source = listboxControl({ className: "aa-gallery-source-select", options: getCapabilities().map((item) => ({ value: item.source, label: item.displayName, iconName: "globe" })), value: stateFor(node).source, ariaLabel: label("source", "Source"), onChange: (value) => {
			transact(node, (state) => { state.source = value; state.filters.ratings = defaultGalleryRatings(value); state.filters.sort = capability(value)?.sortValues?.[0] || "latest"; state.filters.feed = "search"; state.filters.period = ""; state.navigation.page = 1; });
			controller.syncState(); void controller.search({ reset: true, page: 1 });
		} });
		collection = listboxControl({ className: "aa-gallery-collection-select", options: collectionOptions(stateFor(node).source), value: collectionValue(stateFor(node)), ariaLabel: label("collection.label", "Gallery collection"), onChange: (value) => {
			transact(node, (state) => { if (value === "favorites") { state.filters.feed = "favorites"; state.filters.period = ""; } else if (value.startsWith("ranking:")) { state.filters.feed = "ranking"; state.filters.period = value.slice("ranking:".length); } else { state.filters.feed = "search"; state.filters.period = ""; state.filters.sort = value.slice("sort:".length); } state.navigation.page = 1; });
			controller.syncState(); void controller.search({ reset: true, page: 1 });
		} });
		const dashboardSwitcherOptions = placement === "dashboard" ? { activeLabelOnly: true } : {};
		const tabs = segmentedControl({ className: "aa-gallery-view-switcher", value: stateFor(node).view, options: [{ value: "browse", label: label("tab.browse", "Browse"), iconName: "layout" }, { value: "selected", label: label("tab.selected", "Selected"), iconName: "statusCheck" }], ariaLabel: label("tab.label", "Gallery view"), onChange: (value) => controller.setMode(value), ...dashboardSwitcherOptions });
		const selectedCount = el("span", { className: "aa-gallery-view-switcher__count", attrs: { "aria-label": label("selected.outputHint", "{count} outputs").replace("{count}", "0") }, text: "0" });
		tabs.querySelector('[data-value="selected"]')?.append(selectedCount);
		const selectionMode = segmentedControl({ className: "aa-gallery-selection-switcher", value: stateFor(node).selectionMode, options: [
			{ value: "single", label: label("selectionMode.single", "Single"), iconName: "selectionSingle" },
			{ value: "multi", label: label("selectionMode.multiple", "Multiple"), iconName: "selectionMultiple" },
		], ariaLabel: label("selectionMode.label", "Selection mode"), onChange: (value) => controller.setSelectionMode(value), ...dashboardSwitcherOptions });
		const clear = button({ className: "aa-gallery-toolbar-text-action aa-gallery-selected__clear", label: label("selected.clear", "Clear"), iconName: "delete", title: label("selected.clear", "Clear"), variant: "ghost", size: "sm", onClick: () => openClearSelectionDialog(node, controller) });
		const filter = button({ className: "aa-gallery-toolbar-action is-filter", iconName: "filter", label: label("filter.title", "Filters"), title: label("filter.title", "Filters"), variant: "ghost", size: "sm", onClick: () => openFilter(node, filter) });
		const prompt = button({ className: "aa-gallery-toolbar-action is-prompt", iconName: "tag", label: label("prompt.short", "Prompt"), title: label("prompt.title", "Prompt processing"), variant: "ghost", size: "sm", onClick: () => openPromptOptions(node, prompt) });
		const pageControl = createPageControl(node);
		const searchControl = createSearchControl(node, {
			defaultOpen: placement === "dashboard" ? stateFor(node).dashboard.searchOpen : true,
			onOpenChange: placement === "dashboard" ? (open) => node._aaGalleryRuntime?.setDashboardSearchOpen(open) : null,
		});
		let refreshing = false;
		const randomMode = button({ className: "aa-gallery-toolbar-text-action aa-gallery-random-mode", iconName: "shuffle", label: label("random.off", "Random"), title: label("random.enable", "Enable random mode"), variant: "ghost", size: "sm", onClick: async () => {
			const active = !stateFor(node).randomMode;
			transact(node, (state) => { state.randomMode = active; }); controller.syncState();
			await controller.search({ reset: true, page: 1 });
		} });
		randomMode.setAttribute("role", "switch");
		randomMode.append(el("span", { className: "aa-gallery-random-mode__switch", attrs: { "aria-hidden": "true" }, children: [el("span", "aa-gallery-random-mode__thumb")] }));
		const refresh = button({ className: "aa-gallery-toolbar-text-action aa-gallery-refresh", iconName: "refresh", label: label("refresh", "Refresh"), ariaLabel: label("reload", "Reload search"), title: label("reload", "Reload search"), variant: "ghost", size: "sm", onClick: async () => {
			if (refreshing) return;
			refreshing = true; refresh.disabled = true; refresh.classList.add("is-refreshing");
			updateRefreshPresentation(stateFor(node).randomMode ? label("random.drawing", "Drawing…") : label("refreshing", "Refreshing…"), undefined, "loading");
			try { await controller.search({ reset: true, page: 1 }); }
			finally { refreshing = false; refresh.disabled = false; refresh.classList.remove("is-refreshing"); updateRefreshIdlePresentation(); }
		} });
		let refreshIcon = refresh.querySelector(".aa-ui-icon");
		function updateRefreshPresentation(visibleText, accessibleText = visibleText, iconName = "refresh") {
			refresh.querySelector(".aa-ui-button__label").textContent = visibleText;
			const nextIcon = icon(iconName); refreshIcon.replaceWith(nextIcon); refreshIcon = nextIcon;
			refresh.setAttribute("aria-label", accessibleText); refresh.title = accessibleText;
		}
		function updateRefreshIdlePresentation() {
			if (stateFor(node).randomMode) updateRefreshPresentation(label("random.draw", "Draw again"), label("random.drawHint", "Draw another unseen batch"), "shuffle");
			else updateRefreshPresentation(label("refresh", "Refresh"), label("reload", "Reload search"), "refresh");
		}
		function syncRandomModePresentation(active) {
			active = Boolean(active); root.dataset.randomMode = active ? "active" : "off";
			randomMode.setAttribute("aria-checked", String(active)); randomMode.classList.toggle("is-active", active);
			randomMode.querySelector(".aa-ui-button__label").textContent = active ? label("random.on", "Random on") : label("random.off", "Random");
			const accessibleLabel = active ? label("random.disable", "Disable random mode") : label("random.enable", "Enable random mode");
			randomMode.setAttribute("aria-label", accessibleLabel); randomMode.title = accessibleLabel; pageControl.hidden = active;
			if (!refreshing) updateRefreshIdlePresentation();
		}
		const openSettings = button({ className: "aa-gallery-toolbar-text-action aa-gallery-open-settings", iconName: "settings", label: label("settings.short", "Settings"), title: label("settings.open", "Configure Gallery…"), variant: "ghost", size: "sm", onClick: openGallerySettings });
		const nodeModeIcon = placement === "dashboard" ? el("span", { className: "aa-gallery-node-mode__icon", attrs: { "aria-hidden": "true" } }) : null;
		const nodeModeLabel = placement === "dashboard" ? el("span", "aa-gallery-node-mode__label") : null;
		const nodeMode = placement === "dashboard" ? el("span", { className: "aa-gallery-node-mode", attrs: { role: "status", "aria-live": "polite" }, children: [nodeModeIcon, nodeModeLabel] }) : null;
		let currentNodeModeIcon = null;
		function syncNodeModePresentation() {
			if (!nodeMode) return;
			const value = nodeModeValue(node);
			const presentation = {
				active: { label: label("nodeMode.active", "Active"), iconName: "statusCheck" },
				mute: { label: label("nodeMode.mute", "Mute"), iconName: "volumeOff" },
				bypass: { label: label("nodeMode.bypass", "Bypass"), iconName: "skipForward" },
			}[value];
			const nextIcon = icon(presentation.iconName);
			if (currentNodeModeIcon) currentNodeModeIcon.replaceWith(nextIcon);
			else nodeModeIcon.append(nextIcon);
			currentNodeModeIcon = nextIcon;
			nodeModeLabel.textContent = presentation.label;
			nodeMode.dataset.value = value;
			nodeMode.setAttribute("aria-label", `${label("nodeMode.label", "Gallery node execution mode")}: ${presentation.label}`);
			nodeMode.title = presentation.label;
		}
		const browseNavigation = el("div", { className: "aa-gallery-toolbar__navigation", children: [collection, pageControl] });
		const browseTools = el("div", { className: "aa-gallery-toolbar__tools", children: [filter, prompt] });
		const pageActions = el("div", { className: "aa-gallery-toolbar__page-actions", attrs: { role: "group", "aria-label": label("toolbarActions", "Browse tools") }, children: [browseNavigation, browseTools] });
		const selectedSummaryText = el("span", null, "");
		const selectedSummary = el("div", { className: "aa-gallery-toolbar__selected-summary", attrs: { role: "status" }, children: [icon("statusCheck"), selectedSummaryText] });
		const searchActions = el("div", { className: "aa-gallery-toolbar__search", children: [searchControl.root, searchControl.toggle] });
		const utilityActions = el("div", { className: "aa-gallery-toolbar__utilities", children: [nodeMode, randomMode, refresh, clear, openSettings] });
		const primaryRow = el("div", { className: "aa-gallery-toolbar__row aa-gallery-toolbar__primary", children: [source, tabs, selectionMode, el("span", "aa-gallery-toolbar__spacer"), searchActions] });
		const contextRow = el("div", { className: "aa-gallery-toolbar__row aa-gallery-toolbar__context", children: [pageActions, selectedSummary, el("span", "aa-gallery-toolbar__spacer"), utilityActions] });
		const toolbar = el("header", { className: "aa-gallery-toolbar", attrs: { role: "toolbar", "aria-label": label("toolbar", "Booru Gallery") }, children: [primaryRow, contextRow] });
		const masonry = el("div", { className: "aa-gallery-masonry", attrs: { tabindex: 0 } }); focusScrollableOnPointerEnter(masonry);
		const loading = el("div", { className: "aa-gallery-status is-loading", attrs: { role: "status", "aria-live": "polite" }, children: [icon("refresh"), el("span", null, label("loading", "Loading…"))] }); loading.hidden = true;
		const errorLabel = el("span"); const error = el("button", { className: "aa-gallery-status is-error", attrs: { type: "button", "aria-live": "assertive" }, children: [icon("statusWarning"), errorLabel] }); error.hidden = true;
		const endLabel = el("span", null, label("end", "End of results")); const end = el("div", { className: "aa-gallery-status is-end", attrs: { role: "status" }, children: [icon("statusCheck"), endLabel] }); end.hidden = true;
		const continueResults = el("button", { className: "aa-gallery-status is-filtered", attrs: { type: "button" }, children: [icon("search"), el("span", null, label("continueFiltered", "Blocked posts were skipped. Continue searching"))] }); continueResults.hidden = true;
		const emptyResults = el("div", { className: "aa-gallery-status is-empty", attrs: { role: "status" }, children: [icon("search"), el("span", null, label("emptyResults", "No posts match this search. Try widening the rating filter or reducing blocked tags."))] }); emptyResults.hidden = true;
		const selected = el("div", "aa-gallery-selected"); const selectedListRoot = el("div", { className: "aa-gallery-selected__list", attrs: { tabindex: 0 } }); focusScrollableOnPointerEnter(selectedListRoot);
		const selectedDropIndicator = el("div", { className: "aa-gallery-selected-drop-indicator", attrs: { hidden: true, "aria-hidden": "true", "data-gallery-surface": surfaceId }, children: [el("span", "aa-gallery-selected-drop-indicator__cap"), el("span", "aa-gallery-selected-drop-indicator__line"), el("span", "aa-gallery-selected-drop-indicator__cap")] });
		const emptySelected = el("div", { className: "aa-gallery-selected__empty", children: [el("span", { className: "aa-gallery-selected__empty-icon", children: [icon("statusCheck")] }), el("strong", null, label("selected.emptyTitle", "Build your output set")), el("p", null, label("selected.empty", "Select posts from the waterfall to build an ordered output."))] });
		selected.append(selectedListRoot, emptySelected); document.body.append(selectedDropIndicator);
		root.append(toolbar, el("main", { className: "aa-gallery-browser", children: [masonry, loading, error, end, continueResults, emptyResults] }), selected);
		const surface = { root, source, collection, masonry, loading, error, errorLabel, end, endLabel, randomMode, continueResults, emptyResults, tabs, selectionMode, selectedCount, selectedSummary: selectedSummaryText, selectedClear: clear, selectedList: null, selectedListRoot, selectedDropIndicator, emptySelected, mode: stateFor(node).view, pageControl, searchControl, masonryController: null, active: true };
		surface.masonryController = mountVirtualMasonry(masonry, { renderItem: (post, index) => createGalleryCard(node, controller, post, index, masonry.classList.contains("is-scrolling")), onNearEnd: () => controller.search(), onVisibleIndexChange: (index) => controller.visibleIndexChanged(index), onVisibleItemsChange: (items) => controller.prefetchVisible(items), minCardWidth: placement === "dashboard" ? 108 : 144, gap: placement === "dashboard" ? 5 : 6, maxColumns: placement === "dashboard" ? 6 : 5 });
		surface.selectedList = mountVirtualList(selectedListRoot, { rowHeight: 96, gap: 7, overscan: 5, onBeforeRender: () => controller.tooltip.hide(), renderItem: (item, index) => createSelectedRow(node, controller, item, index) });
		selectedListRoot.addEventListener("scroll", () => { controller.tooltip.hide(); if (controller.selectedDragFrom != null) controller.handleSelectedDragLeave({ currentTarget: selectedListRoot, relatedTarget: null }); }, { passive: true });
		selectedListRoot.addEventListener("dragover", (event) => controller.handleSelectedDragOver(event)); selectedListRoot.addEventListener("drop", (event) => controller.handleSelectedDrop(event)); selectedListRoot.addEventListener("dragleave", (event) => controller.handleSelectedDragLeave(event));
		let scrollSettleTimer = 0;
		const settleScroll = () => { scrollSettleTimer = 0; masonry.classList.remove("is-scrolling"); masonry.querySelectorAll('img[data-deferred="1"]').forEach((image) => { image.removeAttribute("data-deferred"); image.src = image.dataset.src; image.removeAttribute("data-src"); }); };
		masonry.addEventListener("scroll", () => { masonry.classList.add("is-scrolling"); clearTimeout(scrollSettleTimer); scrollSettleTimer = setTimeout(settleScroll, 150); }, { passive: true });
		const removeCardMotion = installMasonryCardMotion(masonry);
		const visibility = observeDOMWidgetVisibility(root, { onChange: (active) => { surface.active = active; surface.masonryController.setActive(active); surface.selectedList.setActive(active); } });
		error.addEventListener("click", () => { const state = stateFor(node); const cap = capability(state.source); if ((cap?.authRequired || (state.filters.feed === "favorites" && cap?.favoriteRead)) && !hasSourceCredentials(state.source)) openGallerySettings(); else { const currentError = controller.getLastError(); if (currentError) openGalleryErrorDialog(currentError, () => controller.search()); else controller.search(); } });
		continueResults.addEventListener("click", () => { continueResults.hidden = true; void controller.search(); });
		let destroyed = false;
		surface.syncNodeMode = syncNodeModePresentation;
		surface.syncState = () => {
			const state = stateFor(node); root.dataset.source = state.source; source.setValue(state.source); searchControl.sync();
			if (placement === "dashboard") searchControl.setOpen(state.dashboard.searchOpen, { focus: false, submitChanges: false, notifyChange: false });
			collection.setOptions(collectionOptions(state.source), collectionValue(state)); pageControl.setPage(state.navigation.page); syncRandomModePresentation(state.randomMode); surface.mode = state.view; root.dataset.mode = state.view; tabs.setValue(state.view); selectionMode.setValue(state.selectionMode); surface.syncNodeMode();
		};
		surface.destroy = () => { if (destroyed) return; destroyed = true; clearTimeout(scrollSettleTimer); removeCardMotion?.(); visibility.destroy(); selectedDropIndicator.remove(); surface.masonryController.destroy(); surface.selectedList.destroy(); root.remove(); };
		surface.syncState();
		return surface;
	};
}
