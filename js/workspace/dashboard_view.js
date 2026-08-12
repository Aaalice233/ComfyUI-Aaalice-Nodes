import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingKey, controlItemBindings, DASHBOARD_TONES, emptyDashboard, linkedBindingCount } from "../lib/dashboard_model.js";
import { normalizeDashboardTone } from "../lib/dashboard_color_system.js";
import { compareDashboardPreset } from "../lib/dashboard_presets.js";
import { addSeparator, compactDashboard, createGroup, deleteGroup, duplicateItems, duplicatePage, moveGroup, moveGroups, moveItems, moveTopLevelSelection, removeItems, resizeGroup, resizeItem, resizeItems, ungroupItems, updateItem } from "../lib/dashboard_commands.js";
import { createDashboardGrid, createDashboardSearchResults } from "../lib/dashboard_components.js";
import { resolveControlBindingSet } from "../lib/control_binding_set.js";
import { bindDashboardInteractions } from "../lib/dashboard_interactions.js";
import { DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, DASHBOARD_GRID_COLUMNS } from "../lib/dashboard_sizing.js";
import { button, createContextMenu, createDialog, el, emptyState, field, iconButton, selectControl } from "../lib/ui.js";
import { bindingControlIdLabel } from "../lib/dashboard_binding_identity.js";
import { attachDescriptionTooltip } from "../lib/description_tooltip.js";
import { createComponentNoteButton, createCollapsibleSearch, createControlCard, createDashboardComponentPicker, createDashboardPageHeading, createDashboardPresetPicker, createPageRail, createSelectionActionBar, createWorkspaceToolbar } from "../lib/workspace_components.js";
import { matchesDashboardSearch, normalizeDashboardSearchText } from "../lib/dashboard_search.js";
import { createControlElement } from "../lib/workspace_controls.js";
import { confirmAction, pickFile } from "./dom_utils.js";
import { createDashboardToneControl } from "./dashboard_tone_control.js";
import { brokenDashboardBindingEntries, brokenPageControls, openBindingHealthDialog, openPageRebind } from "./dashboard_batch_rebind.js";

let runtime = null;
export function configureDashboardView(dependencies) { runtime = dependencies; }

export function renderDashboard(container, host) {
	const {
		dashboard, currentPage, sourceGroupViewState, resolveGroupTitle, resolvePageControls, dashboardModelError,
		isWorkspaceRootInteractive, scheduleRender, scheduleStructuralRender, askText, updateDashboard, removePage, syncCurrentPageSourceGroups,
		dashboardPresetState, currentDashboardPresetSnapshot, dashboardPresetLabels,
		applyDashboardPreset, createCurrentDashboardPreset, updateCurrentDashboardPreset, duplicateCurrentDashboardPreset,
		openValueProfiles,
		renameCurrentDashboardPreset, deleteCurrentDashboardPreset, addPage, mounted, captureDashboardPageSnapshots,
		dashboardPageRails, registerDashboardPresetView, workspaceLabels, openDashboardExport, importDashboardPreset, openEditGroup,
		openComponentNoteEditor, numericRangeForControl, flushDeferredWorkspaceRender, notifyWorkspaceImageUpload,
		notifyControlBindingError, openManageLinkedBindings, openRebind, controlTitle, openCardActions, openMoveControl,
		openAssignGroup, resolve, syncDashboardSourceGroup, dashboardColumnsForWorkspaceWidth, dashboardScrollState,
		setScrollTopImmediately, dashboardScrollTop, observeDashboardViewport,
	} = runtime;
	let editMode = runtime.getEditMode();
	const viewState = runtime.viewState;
	container.classList.toggle("is-layout-editing", editMode);
	const model = dashboard(); const page = currentPage(model);
	let activePageId = page?.id || null;
	const resolvedPage = page ? { ...page, groups: page.groups.map((group) => {
		const sync = group.source ? sourceGroupViewState(page, group) : null;
		return { ...group, name: resolveGroupTitle(group), syncStatus: sync?.status || null, syncSummary: sync?.summary || null, syncReason: sync?.reason || "" };
	}) } : null;
	const { controls: resolvedControls, sizeProjections } = resolvePageControls(resolvedPage);
	if (dashboardModelError) {
		container.append(emptyState({ iconName: "statusWarning", className: "aa-workspace-empty aa-dashboard-unsupported", title: t("aaalice.workspace.unsupported.title", "Old dashboard layout is unsupported"), description: t("aaalice.workspace.unsupported.description", "This dashboard uses an unsupported layout model. Reset it to continue."), actions: [button({ label: t("aaalice.workspace.unsupported.reset", "Reset dashboard"), iconName: "delete", variant: "danger", onClick: () => {
			const graph = app.graph; graph?.beforeChange?.(); try { runtime.resetDashboardModel(emptyDashboard()); runtime.setActivePageId(activePageId = null); } finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleStructuralRender(); }
		} })] })); return;
	}
	const query = viewState.query;
	const pageTransition = viewState.pageTransition?.pageId === page?.id ? viewState.pageTransition : null;
	const pageTransitionClass = pageTransition ? ` is-page-entering is-page-entering-${pageTransition.direction}` : "";
	const pageSnapshot = pageTransition?.snapshots?.get(host) || null;
	const searchOpen = Boolean(page && !editMode && viewState.searchOpen);
	const focusSearch = viewState.focusSearch && viewState.focusHost === host && isWorkspaceRootInteractive(host);
	if (focusSearch) { viewState.focusSearch = false; viewState.focusHost = null; }
	let applyDashboardSearch = () => {};
	const search = createCollapsibleSearch({
		open: searchOpen, value: query, disabled: !page || editMode, focus: focusSearch,
		label: t("aaalice.workspace.search.parameters", "Search components"), closeLabel: t("aaalice.workspace.search.close", "Close search"), placeholder: t("aaalice.workspace.search.parametersPlaceholder", "Search all components"),
		onToggle: (open) => { viewState.searchOpen = open; viewState.focusSearch = open; viewState.focusHost = open ? host : null; scheduleRender(); },
		onInput: (value) => { viewState.query = value; applyDashboardSearch(value); },
	});
	const addSeparatorToPage = () => {
		if (!page) return;
		askText(t("aaalice.workspace.layout.separator", "Add separator"), t("aaalice.workspace.layout.separatorLabel", "Separator"), "", (label) => updateDashboard((current) => addSeparator(current, page.id, label)));
	};
	const renamePage = (name) => updateDashboard((current) => {
		const target = current.pages.find((item) => item.id === page?.id);
		if (target) target.name = name;
		return current;
	});
	const setPageTone = (nextTone) => updateDashboard((current) => {
		const target = current.pages.find((entry) => entry.id === page?.id);
		if (target) {
			const normalizedTone = normalizeDashboardTone(nextTone);
			target.tone = normalizedTone === "neutral" ? null : normalizedTone;
		}
		return current;
	});
	const duplicateCurrentPage = () => { updateDashboard((current) => {
		const next = duplicatePage(current, page.id);
				runtime.setActivePageId(activePageId = next.pages[next.pages.findIndex((entry) => entry.id === page.id) + 1]?.id || page.id);
		return next;
	}); };
	const openPageToneEditor = () => {
		const tone = createDashboardToneControl(page.tone);
		const body = el("div", { children: [field({ label: t("aaalice.workspace.page.tone", "Page color"), control: tone.root })] });
		const footer = el("div");
		const dialog = createDialog({ title: t("aaalice.workspace.page.toneMenu", "Set page color"), body, footer });
		footer.append(
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }),
			button({ label: t("aaalice.common.save", "Save"), variant: "primary", onClick: () => { setPageTone(tone.value()); dialog.close(); } }),
		);
	};
	const openPageToneMenu = (x, y) => createContextMenu({
		x, y, ownerElement: host, ariaLabel: t("aaalice.workspace.page.tone", "Page color"),
		items: [null, ...DASHBOARD_TONES.filter((tone) => tone !== "neutral")].map((tone) => ({
			label: tone ? t(`aaalice.workspace.group.tones.${tone}`, tone) : t("aaalice.workspace.page.toneDefault", "Default"),
			className: `aa-dashboard-page-tone-menu-item is-${tone || "default"}`,
			checked: (page.tone || null) === tone,
			onSelect: () => { if ((page.tone || null) !== tone) setPageTone(tone); },
		})).concat([
			{ separator: true },
			{ label: t("aaalice.workspace.page.customTone", "Custom color…"), iconName: "settings", onSelect: openPageToneEditor },
		]),
	});
	const openPageMenu = (x, y) => {
		if (!page) return;
		const sourceGroupCount = page.groups.filter((group) => group.source).length;
		const brokenCount = brokenPageControls(page).length;
		createContextMenu({ x, y, ownerElement: host, ariaLabel: t("aaalice.workspace.page.menu", "Page actions"), items: [
			{ label: t("aaalice.workspace.page.rename", "Rename page"), iconName: "edit", onSelect: () => askText(t("aaalice.workspace.page.rename", "Rename page"), t("aaalice.workspace.page.name", "Page name"), page.name, renamePage) },
			{ label: t("aaalice.workspace.page.duplicate", "Duplicate page"), iconName: "copy", onSelect: duplicateCurrentPage },
			{ label: t("aaalice.workspace.group.sync.currentPage", "Synchronize source groups on this page"), iconName: "refresh", disabled: !sourceGroupCount, onSelect: () => syncCurrentPageSourceGroups(page.id) },
			{ label: brokenCount ? `${t("aaalice.workspace.rebindAll.menu", "Rebind broken parameters…")} (${brokenCount})` : t("aaalice.workspace.rebindAll.menu", "Rebind broken parameters…"), iconName: "swap", disabled: !brokenCount, onSelect: () => openPageRebind(page.id, host) },
			{ label: t("aaalice.workspace.page.tone", "Page color"), iconName: "settings", onSelect: () => openPageToneMenu(x + 12, y + 12) },
			...(editMode ? [
				{ separator: true },
				{ label: t("aaalice.workspace.layout.separator", "Add separator"), iconName: "add", onSelect: addSeparatorToPage },
				{ label: t("aaalice.workspace.layout.compact", "Tidy layout"), iconName: "layout", onSelect: () => updateDashboard((current) => compactDashboard(current, page.id)) },
			] : []),
			{ separator: true },
			{ label: t("aaalice.workspace.page.delete", "Delete page"), iconName: "delete", danger: true, onSelect: () => removePage(page) },
		] });
	};
	const readPresetPickerState = () => {
		const currentModel = dashboard();
		const presetState = dashboardPresetState();
		const baselinePreset = presetState.presets.find((item) => item.id === presetState.baselinePresetId) || null;
		let currentPresetSnapshot = null;
		let comparison = null;
		let snapshotError = null;
		try {
			currentPresetSnapshot = currentDashboardPresetSnapshot(currentModel);
			comparison = baselinePreset ? compareDashboardPreset(baselinePreset, currentPresetSnapshot) : null;
		} catch (error) {
			snapshotError = error;
		}
		const error = runtime.dashboardPresetModelError || snapshotError;
		const attentionCount = comparison?.attention ? brokenDashboardBindingEntries(currentModel).length : 0;
		const signature = JSON.stringify([
			presetState.baselinePresetId,
			presetState.presets.map((preset) => [preset.id, preset.name, preset.dashboard?.pages?.length || 0, Object.keys(preset.values || {}).length]),
			comparison ? [comparison.modified, comparison.layoutChanges, comparison.valueChanges, comparison.attention] : null,
			attentionCount,
			String(error?.message || error || ""),
		]);
		return { presetState, baselinePreset, comparison, error, attentionCount, signature };
	};
	let presetSlot = null;
	let mountedPresetSignature = "";
	let pendingPresetState = null;
	const mountPresetPicker = (state) => {
		mountedPresetSignature = state.signature;
		pendingPresetState = null;
		presetSlot.replaceChildren(createDashboardPresetPicker({
			presets: state.presetState.presets, baselineId: state.baselinePreset?.id || null, comparison: state.comparison, error: state.error, labels: dashboardPresetLabels(),
			attentionReview: state.comparison?.attention ? { count: state.attentionCount, onReview: () => openBindingHealthDialog(null) } : null,
			onSelect: (presetId) => applyDashboardPreset(presetId), onCreate: () => createCurrentDashboardPreset(), onUpdate: (presetId) => updateCurrentDashboardPreset(presetId),
			onRestore: (presetId) => applyDashboardPreset(presetId, { restore: true }), onDuplicate: duplicateCurrentDashboardPreset, onRename: renameCurrentDashboardPreset, onDelete: deleteCurrentDashboardPreset,
			onClose: () => {
				if (!pendingPresetState) return;
				const pending = pendingPresetState;
				queueMicrotask(() => { if (presetSlot?.isConnected && pendingPresetState === pending) mountPresetPicker(pending); });
			},
		}));
	};
	const dashboardComponentOptions = [
		{ id: "separator", iconName: "subtract", label: t("aaalice.workspace.layout.separatorItem", "Separator") },
	];
	const dashboardComponentHandlers = { separator: addSeparatorToPage };
	const dashboardComponentPicker = createDashboardComponentPicker({
		options: dashboardComponentOptions,
		labels: {
			open: t("aaalice.workspace.layout.addComponent", "Add component"),
			title: t("aaalice.workspace.layout.components", "Dashboard components"),
			empty: t("aaalice.workspace.layout.noComponents", "No components available"),
		},
		showLabel: false,
		onSelect: (id) => dashboardComponentHandlers[id]?.(),
	});
	const activePageIndex = model.pages.findIndex((entry) => entry.id === page?.id);
	const selectPage = (id) => {
		if (!id || id === activePageId) return false;
		if (searchOpen) {
			viewState.searchOpen = false;
			viewState.query = "";
			viewState.focusSearch = false;
			viewState.focusHost = null;
		}
		const currentModel = dashboard(); const previousTransition = viewState.pageTransition;
		const fromPageId = previousTransition?.fromPageId || activePageId;
		const previousIndex = currentModel.pages.findIndex((entry) => entry.id === fromPageId);
		const nextIndex = currentModel.pages.findIndex((entry) => entry.id === id);
		if (previousIndex < 0 || nextIndex < 0) return false;
		if (previousTransition && id === fromPageId) {
			for (const root of mounted) previousTransition.snapshots?.get(root)?.remove?.();
				runtime.setActivePageId(activePageId = id); viewState.selectedItemIds = new Set(previousTransition.selectedItemIds); viewState.selectedGroupIds = new Set(previousTransition.selectedGroupIds); viewState.pageTransition = null; scheduleStructuralRender();
			return true;
		}
		const direction = nextIndex < previousIndex ? "backward" : "forward";
		viewState.pageTransition = {
			pageId: id, fromPageId, direction,
			snapshots: previousTransition?.snapshots || (searchOpen ? new WeakMap() : captureDashboardPageSnapshots()),
			selectedItemIds: previousTransition?.selectedItemIds || new Set(viewState.selectedItemIds),
			selectedGroupIds: previousTransition?.selectedGroupIds || new Set(viewState.selectedGroupIds),
		};
		runtime.setActivePageId(activePageId = id); viewState.selectedItemIds = new Set(); viewState.selectedGroupIds = new Set(); scheduleStructuralRender();
		return true;
	};
	const reorderPage = (sourceId, targetId) => { updateDashboard((current) => {
		const sourceIndex = current.pages.findIndex((item) => item.id === sourceId); const targetIndex = current.pages.findIndex((item) => item.id === targetId);
		if (sourceIndex >= 0 && targetIndex >= 0) { const [source] = current.pages.splice(sourceIndex, 1); current.pages.splice(targetIndex, 0, source); } return current;
	}); };
	let pageRail = dashboardPageRails.get(host);
	if (!pageRail) { pageRail = createPageRail(); dashboardPageRails.set(host, pageRail); }
	pageRail.update({
		pages: model.pages, activeId: page?.id, editMode, labels: workspaceLabels(), onSelect: selectPage,
		onReorder: reorderPage,
	});
	let selectAllLayoutItems = () => {};
	const selectAllLayoutButton = page && editMode ? iconButton({ iconName: "selectionMultiple", label: t("aaalice.workspace.selection.selectAll", "Select all layout items"), variant: "ghost", className: "aa-dashboard-select-all", onClick: () => selectAllLayoutItems() }) : null;
	const pageHeading = page ? createDashboardPageHeading({
		page,
		pages: model.pages,
		index: activePageIndex,
		labels: workspaceLabels(),
		className: pageTransitionClass.trim(),
		onRename: renamePage,
		onSelectPage: selectPage,
		onReorderPage: reorderPage,
	}) : null;
	const primaryActions = [
		button({ label: editMode ? t("aaalice.workspace.done", "Done") : t("aaalice.workspace.edit", "Layout"), iconName: editMode ? "statusCheck" : "layout", variant: "ghost", size: "sm", active: editMode, className: "aa-dashboard-edit-toggle", onClick: () => { runtime.setEditMode(editMode = !editMode); viewState.selectedItemIds = new Set(); viewState.selectedGroupIds = new Set(); if (editMode) { viewState.searchOpen = false; viewState.query = ""; } scheduleStructuralRender(); } }),
		...(editMode ? [
			button({ label: t("aaalice.workspace.page.add", "Add page"), iconName: "add", variant: "primary", size: "sm", className: "aa-dashboard-add-page", onClick: addPage }),
		] : []),
	];
	const layoutActions = editMode && page ? [
		dashboardComponentPicker.root,
		selectAllLayoutButton,
		iconButton({ iconName: "layout", label: t("aaalice.workspace.layout.compact", "Tidy layout"), variant: "ghost", className: "aa-dashboard-tidy-layout", onClick: () => updateDashboard((current) => compactDashboard(current, page.id)) }),
	].filter(Boolean) : [];
	const utilityActions = editMode ? [] : [
		iconButton({ iconName: "sliders", label: t("aaalice.workspace.valueProfiles.open", "Adjustment profiles"), variant: "ghost", size: "sm", className: "aa-dashboard-toolbar-action aa-dashboard-value-profiles", onClick: () => openValueProfiles() }),
		button({ iconName: "upload", label: t("aaalice.workspace.preset.export", "Export preset"), variant: "ghost", size: "sm", className: "aa-dashboard-toolbar-action", onClick: () => openDashboardExport(model) }),
		button({ iconName: "download", label: t("aaalice.workspace.preset.import", "Import preset"), variant: "ghost", size: "sm", className: "aa-dashboard-toolbar-action", onClick: () => pickFile(".json,application/json", importDashboardPreset) }),
		search.toggle,
	];
	const pageSettingsButton = page ? iconButton({
		iconName: "settings", label: t("aaalice.workspace.page.settings", "Page settings"), variant: "ghost", className: "aa-dashboard-page-settings",
		onClick: (event) => { const rect = event.currentTarget.getBoundingClientRect(); openPageMenu(rect.right, rect.bottom); },
	}) : null;
	presetSlot = el("div", { className: "aa-dashboard-toolbar__preset-slot" });
	mountPresetPicker(readPresetPickerState());
	registerDashboardPresetView(host, () => {
		if (!presetSlot.isConnected) return;
		const next = readPresetPickerState();
		if (next.signature === mountedPresetSignature) return;
		if (presetSlot.querySelector('.aa-value-preset-trigger[aria-expanded="true"]')) pendingPresetState = next;
		else mountPresetPicker(next);
	});
	const toolbarContext = el("div", { className: "aa-dashboard-toolbar__row aa-dashboard-toolbar__row--context", children: [pageHeading, presetSlot, pageSettingsButton].filter(Boolean) });
	const toolbarActions = el("div", {
		className: "aa-dashboard-toolbar__row aa-dashboard-toolbar__row--actions",
		children: searchOpen ? [search.panel] : [
			el("div", { className: "aa-dashboard-toolbar__action-group aa-dashboard-toolbar__action-group--primary", children: primaryActions }),
			...(editMode ? [el("div", { className: "aa-dashboard-toolbar__action-group aa-dashboard-toolbar__action-group--layout", children: layoutActions })] : [el("div", { className: "aa-dashboard-toolbar__action-group aa-dashboard-toolbar__action-group--utility", children: utilityActions })]),
		],
	});
	const toolbar = createWorkspaceToolbar([], { className: `aa-dashboard-toolbar${searchOpen ? " is-searching" : ""}`, label: t("aaalice.workspace.dashboardActions", "Dashboard actions") });
	toolbar.append(toolbarContext, toolbarActions);
	container.append(toolbar);
	if (!page) { container.append(emptyState({ iconName: "layout", className: "aa-workspace-empty aa-dashboard-empty", title: t("aaalice.workspace.empty.title", "Build your control pages"), description: t("aaalice.workspace.empty.description", "Create a page, then add controls from any compatible node's context menu."), actions: [button({ label: t("aaalice.workspace.page.add", "Add page"), iconName: "add", onClick: addPage })] })); return; }
	const scroll = el("div", { className: `aa-dashboard-scroll${pageTransitionClass}`, attrs: { "data-dashboard-page-id": page.id, "data-dashboard-search-open": searchOpen ? "true" : "false" } });
	const openGroupMenu = (event, group) => {
		const rect = event.currentTarget.getBoundingClientRect(); createContextMenu({ x: event.clientX || rect.right, y: event.clientY || rect.bottom, ownerElement: event.currentTarget, ariaLabel: t("aaalice.workspace.group.menu", "Layout group menu"), items: [
			{ label: t("aaalice.workspace.group.edit", "Edit group"), iconName: "settings", onSelect: () => openEditGroup(page, group) },
			{ label: t("aaalice.workspace.group.delete", "Ungroup controls"), iconName: "close", onSelect: () => updateDashboard((current) => deleteGroup(current, page.id, group.id)) },
		] });
	};
	const renderControlCard = (item, sourcePage, sourceControls, { search = false } = {}) => {
		let resolved = sourceControls.get(item.id);
		if (!resolved) {
			try { resolved = resolveControlBindingSet(item, resolve); }
			catch (error) { resolved = { status: "error", error, binding: item.binding, bindingSet: { entries: [], linkedCount: linkedBindingCount(item), mixed: false, issues: [] } }; }
		}
		let control;
		if (resolved.status === "ok") {
			try {
				control = createControlElement(resolved, { labels: workspaceLabels(), syncKeys: controlItemBindings(item).map(bindingKey), numericRange: numericRangeForControl(resolved, item.numericRange), onCommit: flushDeferredWorkspaceRender, onError: (error) => notifyWorkspaceImageUpload(error), onSuccess: (reference) => notifyWorkspaceImageUpload(null, reference), onWriteError: notifyControlBindingError });
			} catch (error) {
				resolved = { ...resolved, status: "error", error };
			}
		}
		if (!control) {
			const linkedError = resolved.status === "linked-error";
			const statusTitle = linkedError
				? t("aaalice.workspace.binding.brokenLinkedTitle", "Some linked parameters are unavailable")
				: resolved.status === "incompatible"
					? t("aaalice.workspace.binding.brokenTypeTitle", "The bound parameter type has changed")
					: resolved.status === "error"
						? t("aaalice.workspace.binding.brokenErrorTitle", "The control failed to load")
						: t("aaalice.workspace.binding.brokenMissingTitle", "The bound parameter is no longer available");
			const statusHint = linkedError
				? t("aaalice.workspace.binding.brokenLinkedHint", "Open linked-parameter management to repair or unlink the affected entries.")
				: t("aaalice.workspace.binding.brokenMissingHint", "Previously bound to {name}. Rebind to an available parameter to restore this component.").replaceAll("{name}", bindingControlIdLabel(item.binding));
			const action = button({
				label: linkedError ? t("aaalice.workspace.binding.manage", "Manage linked parameters") : t("aaalice.workspace.binding.rebindAction", "Rebind"),
				iconName: linkedError ? "link" : "statusWarning",
				variant: "secondary",
				size: "sm",
				className: "aa-control-card-broken__action",
				onClick: (event) => { const owner = event.currentTarget.closest?.("[data-dashboard-item-id]"); return linkedError ? openManageLinkedBindings(item.id, owner) : openRebind(item, owner); },
			});
			control = el("div", { className: `aa-control-card-broken${linkedError ? " is-linked-error" : ""}`, attrs: { role: "alert" }, children: [action] });
			attachDescriptionTooltip(control, `${statusTitle} · ${statusHint}`);
		}
		const cardTitle = controlTitle(item, resolved);
		const card = createControlCard({ item, title: cardTitle, control, status: resolved.status, description: resolved.status === "ok" ? String(resolved.control?.description || "") : "", linkedCount: resolved.bindingSet?.linkedCount || 0, mixed: Boolean(resolved.bindingSet?.mixed), editMode: search ? false : editMode, labels: workspaceLabels(), onManage: (context) => openCardActions(context, item, resolved), onMove: () => openMoveControl(item),
			onRemove: () => updateDashboard((current) => removeItems(current, [item.id])), onToggleSpan: () => updateDashboard((current) => resizeItems(current, [item.id], item.layout.columnSpan === DASHBOARD_GRID_COLUMNS ? DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN : DASHBOARD_GRID_COLUMNS)),
			onRenameTitle: (name) => updateDashboard((current) => updateItem(current, item.id, (target) => { target.labelOverride = name; })),

			onGroup: () => openAssignGroup(sourcePage, item), onUngroup: () => updateDashboard((current) => ungroupItems(current, sourcePage.id, [item.id])),
		});
		card.dataset.dashboardItemId = item.id; card.dataset.searchText = normalizeDashboardSearchText(cardTitle); return card;
	};
	const renderItem = (item) => {
		if (item.kind === "separator") {
			const separator = el("div", {
				className: `aa-dashboard-separator${item.note ? " has-component-note" : ""}`,
				attrs: { "data-dashboard-item-id": item.id, tabindex: 0, role: "separator", "aria-label": item.label },
				children: [
					el("span", { className: "aa-section-rule aa-section-rule--start", attrs: { "aria-hidden": "true" } }),
					el("span", "aa-dashboard-separator-label", item.label),
					el("span", { className: "aa-section-rule aa-section-rule--end", attrs: { "aria-hidden": "true" } }),
					...(item.note ? [createComponentNoteButton({ note: item.note, labels: workspaceLabels(), className: "aa-dashboard-separator-note" })] : []),
					...(editMode ? [iconButton({ iconName: "delete", label: t("aaalice.workspace.layout.remove", "Remove layout item"), variant: "ghost", className: "aa-dashboard-separator-remove", onClick: () => updateDashboard((current) => removeItems(current, [item.id])) })] : []),
				],
			});
			const openSeparatorMenu = (x, y) => createContextMenu({
				x, y, ownerElement: separator, ariaLabel: t("aaalice.workspace.layout.separatorMenu", "Separator menu"), items: [
					{ label: item.note ? t("aaalice.workspace.componentNote.editMenu", "Edit note…") : t("aaalice.workspace.componentNote.addMenu", "Add note…"), iconName: "note", onSelect: () => openComponentNoteEditor(item, separator) },
					...(editMode ? [{ separator: true }, { label: t("aaalice.workspace.layout.remove", "Remove layout item"), iconName: "delete", danger: true, onSelect: () => updateDashboard((current) => removeItems(current, [item.id])) }] : []),
				],
			});
			separator.addEventListener("contextmenu", (event) => { event.preventDefault(); event.stopPropagation(); separator.focus({ preventScroll: true }); openSeparatorMenu(event.clientX, event.clientY); });
			separator.addEventListener("keydown", (event) => {
				if (event.target !== separator || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
				event.preventDefault(); const rect = separator.getBoundingClientRect(); openSeparatorMenu(rect.left + Math.min(36, rect.width), rect.top + Math.min(24, rect.height));
			});
			separator.dataset.searchText = normalizeDashboardSearchText(item.label); return separator;
		}
		return renderControlCard(item, page, resolvedControls);
	};
	const searchResultPages = searchOpen ? model.pages.map((targetPage) => {
		const targetControls = targetPage.id === page.id ? resolvedControls : resolvePageControls(targetPage).controls;
		return {
			id: targetPage.id,
			title: targetPage.name,
			entries: targetPage.items.filter((item) => item.kind === "control").map((item) => {
				const title = String(controlTitle(item, targetControls.get(item.id)) || item.label || item.binding?.controlId || "");
				return { page: targetPage, controls: targetControls, item, itemId: item.id, title, searchText: normalizeDashboardSearchText(title) };
			}),
		};
	}).filter((entry) => entry.entries.length) : [];
	const searchResults = createDashboardSearchResults({
		pages: searchResultPages,
		labels: {
			ariaLabel: t("aaalice.workspace.search.results", "Component search results"),
			summary: t("aaalice.workspace.search.summary", "{count} matching components"),
			all: t("aaalice.workspace.search.all", "All {count} components"),
		},
		renderItem: (entry) => renderControlCard(entry.item, entry.page, entry.controls, { search: true }),
	});
	const columns = dashboardColumnsForWorkspaceWidth(container.clientWidth);
	const grid = createDashboardGrid({ page: resolvedPage, sizeProjections, columns, editMode, selectedItemIds: viewState.selectedItemIds, selectedGroupIds: viewState.selectedGroupIds, labels: workspaceLabels(), renderItem, onGroupMenu: openGroupMenu, onSyncGroup: (group) => syncDashboardSourceGroup(page.id, group.id),
		onRenameGroup: (group, name) => updateDashboard((current) => {
			const target = current.pages.find((entry) => entry.id === page.id)?.groups.find((entry) => entry.id === group.id);
			if (target) target.nameOverride = name;
			return current;
		}),
	});
	const openBlankPageMenu = (event) => {
		if (event.target.closest?.("[data-dashboard-item-id], [data-dashboard-group-id], input, textarea, select, button, [contenteditable='true']")) return;
		event.preventDefault();
		event.stopPropagation();
		grid.focus({ preventScroll: true });
		openPageMenu(event.clientX, event.clientY);
	};
	grid.addEventListener("contextmenu", openBlankPageMenu);
	grid.addEventListener("keydown", (event) => {
		if (event.target !== grid || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
		event.preventDefault();
		const rect = grid.getBoundingClientRect();
		openPageMenu(rect.left + Math.min(28, rect.width / 2), rect.top + Math.min(28, rect.height / 2));
	});
	let updateSelectionUi = () => {}; let dashboardInteraction = null;
	const clearSelection = () => { viewState.selectedItemIds = new Set(); viewState.selectedGroupIds = new Set(); dashboardInteraction?.setSelection(viewState.selectedItemIds, viewState.selectedGroupIds); updateSelectionUi(); };
	const selectionBar = createSelectionActionBar({ ariaLabel: t("aaalice.workspace.selection.toolbar", "Selected layout actions"), actions: [
		{ id: "group", label: t("aaalice.workspace.selection.group", "Quick group"), iconName: "layout", showLabel: true, className: "aa-dashboard-selection-group", onSelect: () => {
			const ids = [...viewState.selectedItemIds]; if (ids.length < 2 || viewState.selectedGroupIds.size) return;
			askText(t("aaalice.workspace.group.create", "Create group"), t("aaalice.workspace.group.name", "Group name"), t("aaalice.workspace.group.default", "New group"), (name) => { clearSelection(); updateDashboard((current) => createGroup(current, page.id, ids, { name, tone: "blue" })); });
		} },
		{ id: "ungroup", label: t("aaalice.workspace.selection.ungroup", "Remove from group"), iconName: "close", onSelect: () => {
			const itemIds = [...viewState.selectedItemIds]; const groupIds = [...viewState.selectedGroupIds]; clearSelection();
			updateDashboard((current) => { let next = current; for (const groupId of groupIds) next = deleteGroup(next, page.id, groupId); const targetPage = next.pages.find((candidate) => candidate.id === page.id); const groupedIds = itemIds.filter((id) => targetPage?.items.find((item) => item.id === id)?.groupId); return groupedIds.length ? ungroupItems(next, page.id, groupedIds) : next; });
		} },
		{ id: "width", label: t("aaalice.workspace.selection.width", "Toggle selected widths"), iconName: "fit", onSelect: () => {
			const controls = page.items.filter((item) => viewState.selectedItemIds.has(item.id) && item.kind === "control"); if (!controls.length) return;
			const width = controls.every((item) => item.layout.columnSpan === DASHBOARD_GRID_COLUMNS) ? DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN : DASHBOARD_GRID_COLUMNS; updateDashboard((current) => resizeItems(current, controls.map((item) => item.id), width));
		} },
		{ id: "duplicate", label: t("aaalice.workspace.selection.duplicate", "Duplicate selected"), iconName: "copy", onSelect: () => {
			const ids = [...viewState.selectedItemIds]; if (!ids.length || viewState.selectedGroupIds.size) return;
			updateDashboard((current) => duplicateItems(current, page.id, ids));
		} },
		{ id: "move", label: t("aaalice.workspace.selection.move", "Move to page"), iconName: "move", onSelect: () => {
			const ids = [...viewState.selectedItemIds]; const groupIds = [...viewState.selectedGroupIds]; if (!ids.length && !groupIds.length) return;
			const targets = model.pages.filter((entry) => entry.id !== page?.id); if (!targets.length) return;
			const pageSelect = selectControl({ ariaLabel: t("aaalice.workspace.target.page", "Page"), options: targets.map((entry) => ({ label: entry.name, value: entry.id })), value: targets[0].id });
			const body = el("div", { children: [field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect })] }); const footer = el("div");
			const dialog = createDialog({ title: t("aaalice.workspace.selection.move", "Move to page"), body, footer });
			footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => {
				clearSelection();
				updateDashboard((current) => {
					let next = current;
					if (groupIds.length) next = moveGroups(next, groupIds, pageSelect.value);
					if (ids.length) next = moveItems(next, ids, pageSelect.value);
					return next;
				});
				dialog.close();
			} }));
		} },
		{ id: "remove", label: t("aaalice.workspace.selection.remove", "Remove selected"), iconName: "delete", className: "aa-dashboard-selection-remove", onSelect: async () => {
			const ids = [...viewState.selectedItemIds]; const groupIds = [...viewState.selectedGroupIds]; if ((!ids.length && !groupIds.length)) return;
			const message = t("aaalice.workspace.selection.removeConfirm", "Remove {count} selected layout items?").replace("{count}", ids.length + groupIds.length);
			if (!await confirmAction(message, { title: t("aaalice.workspace.selection.remove", "Remove selected"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
			clearSelection();
			updateDashboard((current) => {
				let next = current;
				for (const groupId of groupIds) next = deleteGroup(next, page.id, groupId);
				if (ids.length) next = removeItems(next, ids);
				return next;
			});
		} },
		{ id: "clear", label: t("aaalice.workspace.selection.clear", "Clear selection"), iconName: "close", className: "aa-dashboard-selection-clear", onSelect: clearSelection },
	] });
	selectAllLayoutItems = () => {
		const topLevelItems = [...grid.children].filter((element) => !element.hidden && element.matches?.("[data-dashboard-item-id]"));
		const topLevelGroups = [...grid.children].filter((element) => !element.hidden && element.matches?.("[data-dashboard-group-id]"));
		viewState.selectedItemIds = new Set(topLevelItems.map((element) => element.dataset.dashboardItemId));
		viewState.selectedGroupIds = new Set(topLevelGroups.map((element) => element.dataset.dashboardGroupId));
		dashboardInteraction?.setSelection(viewState.selectedItemIds, viewState.selectedGroupIds); updateSelectionUi(); grid.focus({ preventScroll: true });
	};
	if (selectAllLayoutButton) selectAllLayoutButton.disabled = ![...grid.children].some((element) => !element.hidden && element.matches?.("[data-dashboard-item-id], [data-dashboard-group-id]"));
	if (!page.items.length) grid.append(emptyState({ className: "aa-dashboard-page-empty", description: t("aaalice.workspace.empty.page", "Add controls from a compatible node's context menu.") }));
	searchResults.hidden = true;
	scroll.append(grid, searchResults);
	const searchEmpty = emptyState({ iconName: "search", className: "aa-workspace-empty aa-dashboard-search-empty", description: t("aaalice.workspace.search.noParameters", "No matching components.") }); searchEmpty.hidden = true; scroll.append(searchEmpty);
	if (pageSnapshot) {
		pageSnapshot.classList.add("is-page-leaving", `is-page-leaving-${pageTransition.direction}`);
		pageSnapshot.addEventListener("animationend", () => pageSnapshot.remove(), { once: true });
		setTimeout(() => pageSnapshot.remove(), 260);
	}
	const pageStage = el("div", { className: "aa-dashboard-page-stage", children: [...(pageSnapshot ? [pageSnapshot] : []), scroll] });
	const body = el("div", { className: "aa-dashboard-body", children: [pageStage, pageRail, selectionBar.root] }); container.append(body);
	observeDashboardViewport(host, body, grid, resolvedPage, resolvedControls);
	scroll.addEventListener("scroll", () => {
		const scrollState = dashboardScrollState(host);
		if (searchOpen) scrollState.searchTop = scroll.scrollTop;
		else scrollState.pages.set(page.id, scroll.scrollTop);
	}, { passive: true });
	if (pageSnapshot) setScrollTopImmediately(pageSnapshot, pageSnapshot._aaaliceSnapshotScrollTop);
	updateSelectionUi = () => {
		const selectedItems = page.items.filter((item) => viewState.selectedItemIds.has(item.id)); const selectedGroups = page.groups.filter((group) => viewState.selectedGroupIds.has(group.id));
		viewState.selectedItemIds = new Set(selectedItems.map((item) => item.id)); viewState.selectedGroupIds = new Set(selectedGroups.map((group) => group.id));
		for (const card of grid.querySelectorAll("[data-dashboard-item-id]")) {
			const selected = viewState.selectedItemIds.has(card.dataset.dashboardItemId);
			const inherited = Boolean(card.dataset.dashboardGroupMember && viewState.selectedGroupIds.has(card.dataset.dashboardGroupMember));
			card.classList.toggle("is-selected", selected); card.classList.toggle("is-selection-member", inherited);
		}
		for (const group of grid.querySelectorAll("[data-dashboard-group-id]")) {
			const selected = viewState.selectedGroupIds.has(group.dataset.dashboardGroupId);
			group.classList.toggle("is-selected", selected);
		}
		const count = selectedItems.length + selectedGroups.length; const canUngroup = selectedGroups.length > 0 || selectedItems.some((item) => item.groupId); const selectedControls = selectedItems.filter((item) => item.kind === "control");
		body.classList.toggle("has-selection-actions", count > 0);
		selectionBar.update({ count, summary: t("aaalice.workspace.selection.summary", "{count} selected").replace("{count}", count), actions: {
				group: { disabled: selectedItems.length < 2 || selectedGroups.length > 0 }, ungroup: { disabled: !canUngroup }, width: { disabled: !selectedControls.length || selectedGroups.length > 0 }, remove: { disabled: count === 0 }, clear: { disabled: count === 0 },
		} });
	};
	dashboardInteraction = bindDashboardInteractions(grid, { editMode, interactionSurface: container, selectedItemIds: viewState.selectedItemIds, selectedGroupIds: viewState.selectedGroupIds, groupDropLabel: t("aaalice.workspace.group.addItem", "Add to group"), flowDropLabel: t("aaalice.workspace.layout.autoPlace", "Auto place"),
		onSelectionChange: (items, groups) => { viewState.selectedItemIds = items; viewState.selectedGroupIds = groups; updateSelectionUi(); },
		onDropItems: (ids, target) => updateDashboard((current) => target.precise === false ? moveItems(current, ids, page.id, { groupId: target.groupId }) : moveItems(current, ids, page.id, target)), onDropGroup: (groupId, target) => updateDashboard((current) => moveGroup(current, page.id, groupId, target.row, target.column)),
		onDropSelection: (itemIds, groupIds, target) => updateDashboard((current) => moveTopLevelSelection(current, page.id, itemIds, groupIds, target.precise === false ? {} : target)),
		onResizeItem: (itemId, size) => updateDashboard((current) => resizeItem(current, itemId, size)),
		onResizeGroup: (groupId, size) => updateDashboard((current) => resizeGroup(current, groupId, size)),
	});
	updateSelectionUi();
	applyDashboardSearch = (value) => {
		const needle = String(value || "").normalize("NFKC").trim(); let visibleItems = 0;
		const searching = searchOpen;
		body.classList.toggle("is-searching", searching);
		grid.hidden = searching;
		searchResults.hidden = !searching;
		for (const item of searchResults.querySelectorAll("[data-dashboard-search-item-id]")) {
			const visible = searching && matchesDashboardSearch(item.dataset.searchText || "", needle);
			item.hidden = !visible;
			if (visible) visibleItems++;
		}
		for (const section of searchResults.querySelectorAll("[data-dashboard-search-page-id]")) section.hidden = !searching || !section.querySelector("[data-dashboard-search-item-id]:not([hidden])");
		searchResults.updateSummary?.({ count: visibleItems, query: needle });
		searchEmpty.hidden = !searching || visibleItems > 0;
	};
	applyDashboardSearch(searchOpen ? query : "");
	const scrollState = dashboardScrollState(host);
	setScrollTopImmediately(scroll, searchOpen ? scrollState.searchTop : dashboardScrollTop(host, page.id));
}
