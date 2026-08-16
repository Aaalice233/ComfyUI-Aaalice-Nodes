import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { controlProviders, repairDuplicateHostIds } from "../lib/control_providers.js";
import { bindingKey, controlItemBindings, createPage, linkedBindingCount, normalizeDashboard } from "../lib/dashboard_model.js";
import { createControlBindingMatcher, bindingControlIdLabel, sameBindingTarget } from "../lib/dashboard_binding_identity.js";
import { dashboardPageMatchLabels, preferredDashboardPage } from "../lib/dashboard_page_matching.js";
import { addItems, assignToGroup, detachBinding, moveItems, removeItems, resizeItems, ungroupItems, updateItem } from "../lib/dashboard_commands.js";
import { ControlBindingSetError, resolveControlBindingSet, synchronizeLinkedBindingSets } from "../lib/control_binding_set.js";
import { installLinkedSeedQueueHook as installLinkedSeedQueueLifecycle } from "../lib/linked_seed_queue.js";
import { DASHBOARD_DEFAULT_CONTROL_COLUMN_SPAN, DASHBOARD_GRID_COLUMNS } from "../lib/dashboard_sizing.js";
import { badge, button, createContextMenu, el, emptyState, field, icon, iconButton, selectControl, toggleSwitch } from "../lib/ui.js";
import { createListRow } from "../lib/workspace_components.js";
import { openComponentNoteEditor as showComponentNoteEditor } from "./component_note.js";
import { createWorkspaceDialog } from "./dialogs.js";
import { confirmAction } from "./dom_utils.js";
import { configureNumericRange, isConfigurableNumericControl, openNumericRangeSettings } from "./numeric_range.js";
import { allGraphNodes } from "../lib/graph_scope.js";
import { boundNodeControlEntries, configureDashboardUnbinding, openUnbindControls } from "./dashboard_unbinding.js";
import { createDashboardToneControl } from "./dashboard_tone_control.js";
import { bindingDisplay, linkableControlSources, openLinkControls, openRebind } from "./dashboard_linking.js";
export { openLinkControls, openRebind } from "./dashboard_linking.js";
import { normalizeDashboardTone } from "../lib/dashboard_color_system.js";
let runtime = null;
export function configureDashboardBindings(dependencies) {
	runtime = dependencies;
	configureNumericRange({ updateDashboard: dependencies.updateDashboard });
	configureDashboardUnbinding({ dashboard: dependencies.dashboard, updateDashboard: dependencies.updateDashboard, resolve: dependencies.resolve, bindingDisplay, notifyControlBindingError, remindWorkflowSave: dependencies.remindWorkflowSave });
}
export const dashboard = () => runtime.dashboard();
export const updateDashboard = (callback) => runtime.updateDashboard(callback);
export const graphNodes = () => runtime.graphNodes();
export const resolve = (binding) => runtime.resolve(binding);
const workspaceLabels = () => runtime.workspaceLabels();
const resolveGroupTitle = (group) => runtime.resolveGroupTitle(group);
const scheduleRender = (view = null) => runtime.scheduleRender(view);
const scheduleStructuralRender = (view = null) => runtime.scheduleStructuralRender(view);
const scheduleCanvasControlBindingSync = () => runtime.scheduleCanvasControlBindingSync();
const scheduleActiveDashboardPresetAutoSave = () => runtime.scheduleActiveDashboardPresetAutoSave();
const currentPage = (model) => runtime.currentPage(model);
const sourceGroupIdentity = (group) => runtime.sourceGroupIdentity(group);
const remindWorkflowSave = (detail) => runtime.remindWorkflowSave(detail);

export function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function controlAvailabilityDescription(control) {
	const availability = control.availability;
	if (!availability || availability.state === "ready") return control.binding.valueType;
	const labels = workspaceLabels().availability;
	if (availability.reason === "no-options") return labels.noOptions;
	if (availability.state === "unset") return labels.unset;
	if (availability.state === "error") return labels.error;
	return labels.unavailable;
}

export function notifyWorkspaceImageUpload(error = null, reference = null) {
	let severity = "success";
	let detail = t("aaalice.pcp.image.uploaded", "Image uploaded: {filename}").replaceAll("{filename}", String(reference?.filename || ""));
	if (error) {
		severity = "error";
		if (error.code === "file-type") detail = t("aaalice.pcp.error.imageFileType", "Choose an image file.");
		else if (error.code === "response") detail = t("aaalice.pcp.error.imageUploadResponse", "The server response did not include an image filename.");
		else detail = t("aaalice.pcp.error.imageUpload", "Image upload failed: {reason}").replaceAll("{reason}", String(error?.message || error));
	}
	app.extensionManager?.toast?.add?.({ severity, summary: t(`aaalice.common.${severity === "error" ? "error" : "notice"}`, severity === "error" ? "Error" : "Notice"), detail, life: 4500 });
}

function controlBindingErrorDetail(error) {
	const raw = String(error?.message || error || ""); const code = String(error?.code || raw);
	const groups = {
		incompatible: new Set(["incompatible-binding", "incompatible-contract", "incompatible-value", "invalid-linked-value", "unsupported-control", "unsupported-codec", "unsupported-seed", "unsupported-numeric-domain"]),
		missing: new Set(["missing-binding", "unresolved-binding"]),
		duplicate: new Set(["duplicate-binding", "duplicate-linked-binding"]),
		graph: new Set(["different-graph"]),
		unavailable: new Set(["unavailable-binding"]),
		async: new Set(["async-linked-control"]),
		write: new Set(["linked-write-failed", "linked-seed-failed"]),
	};
	let detail;
	if (error instanceof AggregateError) detail = t("aaalice.workspace.binding.rollbackFailed", "The update failed and one or more values could not be restored.");
	else if (groups.incompatible.has(code)) detail = t("aaalice.workspace.binding.incompatibleDetail", "These parameters no longer share the same type, range, or options. Manage the links and try again.");
	else if (groups.missing.has(code)) detail = t("aaalice.workspace.binding.missingDetail", "At least one linked parameter is missing. Manage the links and try again.");
	else if (groups.duplicate.has(code)) detail = t("aaalice.workspace.binding.duplicateDetail", "This parameter is already linked to the sidebar control.");
	else if (groups.graph.has(code)) detail = t("aaalice.workspace.binding.graphDetail", "Only parameters in the same graph can be linked.");
	else if (groups.unavailable.has(code)) detail = t("aaalice.workspace.binding.unavailableDetail", "At least one linked parameter is temporarily unavailable. Try again when it is ready.");
	else if (groups.async.has(code)) detail = t("aaalice.workspace.binding.asyncDetail", "A third-party control attempted an asynchronous write, so the update was cancelled.");
	else detail = t("aaalice.workspace.binding.writeFailedDetail", "The parameter update failed and the previous values were restored.");
	const internalCode = [...Object.values(groups)].some((codes) => codes.has(code)) || /^[a-z]+(?:-[a-z]+)+$/.test(raw);
	const diagnostics = [];
	if (raw && !internalCode && raw !== detail) diagnostics.push(raw);
	const issueMessage = String(error?.issues?.[0]?.error?.message || "");
	if (issueMessage && issueMessage !== raw && issueMessage !== detail) diagnostics.push(issueMessage);
	if (!issueMessage && ![...Object.values(groups)].some((codes) => codes.has(code)) && code && code !== raw) diagnostics.push(code);
	return diagnostics.length ? `${detail} (${[...new Set(diagnostics)].join("; ")})` : detail;
}

export function notifyControlBindingError(error) {
	console.error("[Aaalice] Linked parameter update failed", error);
	app.extensionManager?.toast?.add?.({
		severity: "error",
		summary: t("aaalice.workspace.binding.linkError", "Linked parameter update failed"),
		detail: controlBindingErrorDetail(error),
		life: 5200,
	});
	scheduleRender("dashboard");
}

export function findDashboardControl(model, itemId) {
	for (const page of model.pages) {
		const item = page.items.find((entry) => entry.id === itemId && entry.kind === "control");
		if (item) return { page, item };
	}
	return { page: null, item: null };
}


export function controlTitle(item, resolved) {
	if (item.labelOverride != null) return item.labelOverride;
	return resolved.label || item.label || bindingControlIdLabel(item.binding);
}


export function commitDashboardBindingSet(next, itemIdOrIds, { synchronize = false, resolvedBindings = null } = {}) {
	if (runtime.dashboardModelError()) throw runtime.dashboardModelError();
	// 支持单卡片或批量提交；批量时全部校验在一次 beforeChange/afterChange 事务内完成，撤销为一步。
	const itemIds = Array.isArray(itemIdOrIds) ? itemIdOrIds : [itemIdOrIds];
	const resolveForCommit = resolvedBindings
		? (binding) => resolvedBindings.has(bindingKey(binding)) ? resolvedBindings.get(bindingKey(binding)) : resolve(binding)
		: resolve;
	const resolvedSets = [];
	for (const itemId of itemIds) {
		const { item } = findDashboardControl(next, itemId);
		if (!item) throw new Error("Dashboard control is missing");
		const resolvedSet = resolveControlBindingSet(item, resolveForCommit);
		if (resolvedSet.status !== "ok") {
			const issue = resolvedSet.bindingSet?.issues?.[0];
			const error = new ControlBindingSetError("Linked controls are unavailable", issue?.reason || "unresolved-binding", issue?.binding || null, issue?.error || null);
			error.issues = resolvedSet.bindingSet?.issues || [];
			throw error;
		}
		resolvedSets.push(resolvedSet);
	}
	const graph = app.graph; if (!graph) throw new Error("Workflow graph is unavailable");
	const previousDashboard = graph.extra?.[runtime.extraKey]; const normalized = normalizeDashboard(next); graph.beforeChange?.();
	try {
		graph.extra ||= {}; graph.extra[runtime.extraKey] = normalized;
		if (synchronize) for (const resolvedSet of resolvedSets) {
			if (!resolvedSet.availability?.state || resolvedSet.availability.state === "ready") resolvedSet.synchronizeFromPrimary?.({ transaction: false });
		}
		runtime.clearDashboardModelError();
	} catch (error) {
		if (previousDashboard === undefined) delete graph.extra[runtime.extraKey];
		else graph.extra[runtime.extraKey] = previousDashboard;
		throw error;
	} finally {
		graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true);
		scheduleCanvasControlBindingSync(); scheduleStructuralRender("dashboard"); scheduleActiveDashboardPresetAutoSave();
	}
}

function synchronizeLinkedSeedsForGraph(graph, { phase = "after-queue" } = {}) {
	const model = normalizeDashboard(graph?.extra?.[runtime.extraKey] ?? null);
	const nodes = allGraphNodes(graph);
	const outcome = synchronizeLinkedBindingSets(model, (binding) => controlProviders.resolve(binding, nodes), { kind: "seed", transaction: false });
	if (outcome.issues.length) {
		const issue = outcome.issues[0];
		const error = new ControlBindingSetError("Linked Seed controls could not be synchronized", "linked-seed-sync-failed", issue.binding || null, issue.error || null);
		error.issues = outcome.issues;
		throw error;
	}
	if (phase === "after-queue" && graph === app.graph && outcome.synchronized.length) { scheduleRender("dashboard"); scheduleActiveDashboardPresetAutoSave(); }
	return outcome;
}

export function installLinkedSeedQueueHook() {
	installLinkedSeedQueueLifecycle(app, {
		synchronizeGraph: synchronizeLinkedSeedsForGraph,
		onError(error) { console.error("[Aaalice] Unable to reconcile linked seeds while queueing", error); notifyControlBindingError(error); },
	});
}

export function openManageLinkedBindings(itemId, ownerElement = null) {
	const body = el("div", "aa-linked-bindings-dialog"); const footer = el("div"); let dialog; let syncButton;
	const rebuild = (focusIndex = null) => {
		body.replaceChildren();
		const { item } = findDashboardControl(dashboard(), itemId);
		if (!item) { body.append(emptyState({ description: t("aaalice.workspace.binding.missing", "Missing binding") })); return; }
		const bindings = controlItemBindings(item); const resolvedSet = resolveControlBindingSet(item, resolve);
		const issues = new Map((resolvedSet.bindingSet?.issues || []).map((issue) => [issue.key, issue]));
		const aggregateAvailability = resolvedSet.availability?.state;
		if (syncButton) syncButton.disabled = bindings.length < 2 || resolvedSet.status !== "ok" || Boolean(aggregateAvailability && aggregateAvailability !== "ready");
		for (const [index, binding] of bindings.entries()) {
			const display = bindingDisplay(binding); const issue = issues.get(bindingKey(binding)); const availability = display.resolved?.availability;
			const role = index === 0 ? badge(t("aaalice.workspace.binding.primary", "Primary"), { className: "aa-linked-binding-role" }) : null;
			const issueLabel = issue?.status === "missing" ? t("aaalice.workspace.binding.missing", "Missing") : issue?.status === "error" ? t("aaalice.workspace.binding.error", "Control unavailable due to an error") : t("aaalice.workspace.binding.incompatible", "Incompatible");
			const issueBadge = issue ? badge(issueLabel, { className: "is-warning" }) : null;
			const availabilityBadge = !issue && availability?.state && availability.state !== "ready" ? badge(controlAvailabilityDescription(display.resolved), { className: "is-warning" }) : null;
			const unlink = iconButton({
				iconName: "close",
				label: t("aaalice.workspace.binding.unlink", "Unlink parameter"),
				variant: "ghost",
				onClick: () => {
					try {
						const next = detachBinding(dashboard(), itemId, binding);
						if (!findDashboardControl(next, itemId).item) { dialog.close(); return; }
						updateDashboard(() => next); rebuild(Math.max(0, index - 1));
					} catch (error) { notifyControlBindingError(error); }
				},
			});
			unlink.dataset.linkedBindingUnlink = "true";
			body.append(createListRow({ title: `${display.description} · ${display.title}`, actions: [role, issueBadge, availabilityBadge, unlink].filter(Boolean) }));
		}
		if (bindings.length === 1) body.append(emptyState({ description: t("aaalice.workspace.binding.noLinked", "No additional parameters are linked.") }));
		if (focusIndex != null) queueMicrotask(() => {
			const buttons = [...body.querySelectorAll("[data-linked-binding-unlink='true']")];
			(buttons[Math.min(Math.max(0, focusIndex - 1), buttons.length - 1)] || (!syncButton?.disabled && syncButton) || closeButton || dialog?.dialog)?.focus?.({ preventScroll: true });
		});
	};
	syncButton = button({ label: t("aaalice.workspace.binding.syncNow", "Synchronize now"), iconName: "refresh", variant: "secondary", onClick: () => {
		try {
			const { item } = findDashboardControl(dashboard(), itemId); const resolvedSet = resolveControlBindingSet(item, resolve);
			if (resolvedSet.status !== "ok") {
				const issue = resolvedSet.bindingSet?.issues?.[0];
				throw new ControlBindingSetError("Linked controls are unavailable", issue?.reason || "unresolved-binding", issue?.binding || null, issue?.error || null);
			}
			resolvedSet.synchronizeFromPrimary(); scheduleRender("dashboard"); scheduleActiveDashboardPresetAutoSave();
		} catch (error) { notifyControlBindingError(error); }
	} });
	const closeButton = button({ label: t("aaalice.common.close", "Close"), variant: "primary", onClick: () => dialog.close() });
	footer.append(syncButton, closeButton);
	dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.manage", "Manage linked parameters"), body, footer, size: "sm", className: "aa-linked-bindings-dialog-shell", initialFocus: () => syncButton.disabled ? closeButton : syncButton }, ownerElement);
	rebuild();
}

export function openComponentNoteEditor(item, ownerElement = null, { preview = false } = {}) {
	showComponentNoteEditor({
		item,
		ownerElement,
		preview,
		confirmAction,
		updateItem: (itemId, callback) => updateDashboard((current) => updateItem(current, itemId, callback)),
	});
}

export function openCardActions({ x, y, ownerElement, editMode: layoutEditing, onMove, onRemove, onToggleSpan, onGroup, onUngroup }, item, resolved) {
	const items = [];
	if (layoutEditing) items.push(
		{ label: t("aaalice.workspace.card.move", "Move control"), iconName: "move", onSelect: onMove },
		{ label: t("aaalice.workspace.card.width", "Toggle card width"), iconName: "copy", onSelect: onToggleSpan },
		...(item.groupId ? [{ label: t("aaalice.workspace.group.removeItem", "Remove from group"), iconName: "close", onSelect: onUngroup }] : [{ label: t("aaalice.workspace.group.addItem", "Add to group"), iconName: "add", onSelect: onGroup }]),
		{ separator: true },
		);
	items.push(
		{ label: t("aaalice.workspace.card.colorMenu", "Set card color…"), iconName: "settings", onSelect: () => openCardToneEditor(item, ownerElement) },
		{ label: item.note ? t("aaalice.workspace.componentNote.editMenu", "Edit note…") : t("aaalice.workspace.componentNote.addMenu", "Add note…"), iconName: "note", onSelect: () => openComponentNoteEditor(item, ownerElement) },
	);
	if (isConfigurableNumericControl(resolved)) {
		items.push({ label: t("aaalice.workspace.numericRange.menu", "Set numeric range…"), iconName: "settings", onSelect: () => openNumericRangeSettings(item, resolved, ownerElement) });
	}
	if (linkedBindingCount(item)) items.push({ label: t("aaalice.workspace.binding.manage", "Manage linked parameters"), iconName: "link", onSelect: () => openManageLinkedBindings(item.id, ownerElement) });
	items.push(
		{ label: t("aaalice.workspace.binding.rebind", "Rebind primary parameter"), iconName: "swap", onSelect: () => openRebind(item, ownerElement) },
		{ label: t("aaalice.workspace.card.remove", "Remove control"), iconName: "delete", danger: true, onSelect: onRemove },
	);
	createContextMenu({ x, y, ownerElement, ariaLabel: t("aaalice.workspace.card.menu", "Control card menu"), items });
}

export function openMoveControl(item) {
	const model = dashboard(); const pageSelect = document.createElement("select");
	for (const page of model.pages) pageSelect.add(new Option(page.name, page.id));
	const body = el("div", { children: [field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect })] }); const footer = el("div");
	const dialog = createWorkspaceDialog({ title: t("aaalice.workspace.card.move", "Move control"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { if (pageSelect.value) updateDashboard((current) => moveItems(current, [item.id], pageSelect.value)); dialog.close(); } }));
}

export function openAssignGroup(page, item) {
	if (!page.groups.length) return;
	const groupSelect = selectControl({ ariaLabel: t("aaalice.workspace.group.name", "Group name"), options: page.groups.map((group) => ({ label: resolveGroupTitle(group), value: group.id })), value: page.groups[0].id });
	const body = el("div", { children: [field({ label: t("aaalice.workspace.group.name", "Group name"), control: groupSelect })] }); const footer = el("div");
	const dialog = createWorkspaceDialog({ title: t("aaalice.workspace.group.addItem", "Add to group"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { updateDashboard((current) => assignToGroup(current, page.id, [item.id], groupSelect.value)); dialog.close(); } }));
}

export function openCardToneEditor(item, ownerElement = null) {
	const tone = createDashboardToneControl(item.tone);
	const body = el("div", { children: [field({ label: t("aaalice.workspace.card.color", "Card color"), control: tone.root })] }); const footer = el("div");
	const dialog = createWorkspaceDialog({ title: t("aaalice.workspace.card.colorMenu", "Set card color"), body, footer }, ownerElement);
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), variant: "primary", onClick: () => {
		const selectedTone = normalizeDashboardTone(tone.value());
		updateDashboard((current) => updateItem(current, item.id, (target) => {
			if (selectedTone === "neutral") delete target.tone;
			else target.tone = selectedTone;
		}));
		dialog.close();
	} }));
}

export function openEditGroup(page, group) {
	const name = document.createElement("input"); name.value = resolveGroupTitle(group);
	const tone = createDashboardToneControl(group.tone);
	let showTitle = group.showTitle !== false;
	const showTitleControl = toggleSwitch({ checked: showTitle, label: t("aaalice.workspace.group.showTitle", "Show group title"), onChange: (next) => { showTitle = next; } });
	const body = el("div", { children: [field({ label: t("aaalice.workspace.group.name", "Group name"), control: name }), field({ label: t("aaalice.workspace.group.tone", "Group color"), control: tone.root }), field({ label: t("aaalice.workspace.group.showTitle", "Show group title"), control: showTitleControl })] }); const footer = el("div");
	const dialog = createWorkspaceDialog({ title: t("aaalice.workspace.group.edit", "Edit group"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { if (!name.value.trim()) return; updateDashboard((current) => { const target = current.pages.find((entry) => entry.id === page.id)?.groups.find((entry) => entry.id === group.id); if (target) { target.nameOverride = name.value.trim(); target.tone = tone.value(); target.showTitle = showTitle; } return current; }); dialog.close(); } }));
}

function openAddControls(node, ownerElement = null) {
	const controls = controlProviders.list(node); if (!controls.length) return;
	let model = dashboard(); let page = currentPage(model); const fallbackPageId = page?.id || model.pages[0]?.id || ""; const defaultPageId = preferredDashboardPage(model.pages, dashboardPageMatchLabels(node), fallbackPageId)?.id || fallbackPageId; let selected = new Set();
	const body = el("div", "aa-add-controls-dialog"); const list = el("div", "aa-add-controls-list");
	const pageSelect = selectControl({ value: defaultPageId, ariaLabel: t("aaalice.workspace.target.page", "Page"), onChange: () => rebuildTargets() });
	const targetGrid = el("div", "aa-add-controls-target-grid");
	const destinationPanel = el("section", { className: "aa-add-controls-section aa-add-controls-destination", children: [
		el("div", { className: "aa-add-controls-destination-copy", children: [icon("layout"), el("strong", null, t("aaalice.workspace.binding.destination", "Destination"))] }),
		targetGrid,
	] });
	const rebuildTargets = () => {
		model = dashboard();
		const preferredPageId = pageSelect.control.value || defaultPageId || runtime.getActivePageId();
		page = model.pages.find((item) => item.id === preferredPageId) || model.pages[0];
		pageSelect.setOptions(model.pages.map((item) => ({ label: item.name, value: item.id })), page?.id);
	};
	if (!model.pages.length) {
		const pageName = document.createElement("input"); pageName.value = t("aaalice.workspace.page.default", "Generation");
		targetGrid.append(field({ label: t("aaalice.workspace.target.newPage", "New page"), control: pageName }));
		body._createTarget = () => updateDashboard((current) => { const nextPage = createPage(pageName.value.trim() || "Page"); current.pages.push(nextPage); runtime.setActivePageId(nextPage.id); return current; });
	} else { rebuildTargets(); targetGrid.append(field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect })); }
	const existingBindings = model.pages.flatMap((candidatePage) => candidatePage.items.filter((item) => item.kind === "control").flatMap(controlItemBindings));
	const relevantBindings = existingBindings.filter((binding) => controls.some((control) => binding.provider === control.binding.provider && binding.hostId === control.binding.hostId));
	const isExisting = createControlBindingMatcher(relevantBindings, resolve);
	const controlsByKey = new Map(controls.map((control) => [bindingKey(control.binding), control]));
	selected = new Set(controls.map((control) => bindingKey(control.binding)).filter((key) => !isExisting(controlsByKey.get(key))));
	const selectionCount = el("span", "aa-add-controls-selection-count");
	let confirmButton = null; let selectAllButton = null;
	const eligibleKeys = () => controls.map((control) => bindingKey(control.binding)).filter((key) => !isExisting(controlsByKey.get(key)));
	const updateSelectionState = () => {
		const text = `${selected.size} ${t("aaalice.workspace.binding.selectedControls", "controls selected")}`;
		selectionCount.textContent = text;
		if (confirmButton) {
			confirmButton.disabled = selected.size === 0;
			confirmButton.querySelector(".aa-ui-button__label").textContent = t("aaalice.workspace.binding.addSelected", "Add controls · {count}").replace("{count}", selected.size);
		}
		if (selectAllButton) {
			const keys = eligibleKeys(); const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
			const label = allSelected ? t("aaalice.workspace.binding.clearAll", "Clear all") : t("aaalice.workspace.binding.selectAll", "Select all");
			selectAllButton.querySelector(".aa-ui-button__label").textContent = label;
			selectAllButton.setAttribute("aria-label", label); selectAllButton.disabled = keys.length === 0;
		}
	};
	let drawList = () => {};
	selectAllButton = button({ label: t("aaalice.workspace.binding.selectAll", "Select all"), variant: "ghost", size: "sm", className: "aa-add-controls-select-all", onClick: () => {
		const keys = eligibleKeys(); const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
		if (allSelected) for (const key of keys) selected.delete(key); else for (const key of keys) selected.add(key);
		drawList();
	} });
	const pickerActions = el("div", { className: "aa-add-controls-picker-actions", children: [selectionCount, selectAllButton] });
	const controlPicker = el("section", { className: "aa-add-controls-section aa-add-controls-picker", children: [
		el("header", { className: "aa-add-controls-section-header", children: [el("h3", null, t("aaalice.workspace.binding.chooseControls", "Choose controls")), pickerActions] }),
		list,
	] });
	drawList = () => {
		list.replaceChildren();
		const showSourceSections = controls.some((control) => control.sourceGroup?.forceGroup);
		let previousSourceGroup = null;
		for (const control of controls) {
			if (showSourceSections) {
				const identity = sourceGroupIdentity(control.sourceGroup);
				if (identity && identity !== previousSourceGroup) {
					list.append(el("div", {
						className: "aa-add-controls-source-group",
						attrs: { role: "heading", "aria-level": "4" },
						children: [el("span"), el("strong", null, control.sourceGroup.name), el("span")],
					}));
					previousSourceGroup = identity;
				}
			}
			const key = bindingKey(control.binding); const added = isExisting(control);
			const status = added ? badge(t("aaalice.workspace.binding.added", "Already added"), { className: "aa-add-controls-row-status" }) : control.availability?.state && control.availability.state !== "ready" ? badge(controlAvailabilityDescription(control), { className: "aa-add-controls-row-status is-warning" }) : null;
			const row = createListRow({ title: control.label, selected: selected.has(key), actions: status ? [status] : [], onSelect: (checked) => { if (checked && !added) selected.add(key); else selected.delete(key); updateSelectionState(); } });
			row.selectionControl.setDisabled(added); list.append(row);
		}
		updateSelectionState();
	};
	body.append(destinationPanel, controlPicker); drawList();
	const footer = el("div"); let dialog;
	confirmButton = button({ label: t("aaalice.workspace.binding.addSelected", "Add controls · {count}").replace("{count}", selected.size), disabled: true, onClick: () => {
		if (body._createTarget) { body._createTarget(); model = dashboard(); page = currentPage(model); }
		if (!page) return;
		const chosen = controls.filter((control) => selected.has(bindingKey(control.binding)));
		updateDashboard((current) => addItems(current, page.id, chosen));
		remindWorkflowSave(t("aaalice.workspace.binding.saveWorkflowReminder", "Save the workflow to keep these sidebar controls; otherwise they will be lost."));
		dialog.close();
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirmButton);
	updateSelectionState();
	dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.add", "Add controls to sidebar"), body, footer, size: "md", className: "aa-add-controls-dialog-shell" }, ownerElement || app.canvas?.canvas || null);
}

function listNodeMenuControls(candidate) {
	if (candidate?.graph === app.graph) repairDuplicateHostIds(graphNodes());
	return controlProviders.list(candidate);
}

function nodeMenuItems(node, ownerElement = app.canvas?.canvas || null) {
	const controls = listNodeMenuControls(node);
	if (!controls.length) return [];
	const items = [];
	if (linkableControlSources(controls).length > 0) {
		items.push({
			content: t("aaalice.workspace.binding.linkMenu", "🔗 Link to an existing sidebar parameter…"),
			callback: () => openLinkControls(node, controls, ownerElement),
		});
	}
	if (node?.graph) {
		items.push({
			content: t("aaalice.workspace.binding.menu", "📌 Add controls to sidebar…"),
			callback: () => openAddControls(node, ownerElement),
		});
	}
	if (boundNodeControlEntries(node, controls).length > 0) {
		items.push({
			content: t("aaalice.workspace.binding.unbindMenu", "🔓 Unbind from sidebar…"),
			callback: () => openUnbindControls(node, controls, ownerElement),
		});
	}
	return items;
}

export function getNodeMenuItems(node) {
	return nodeMenuItems(node);
}
