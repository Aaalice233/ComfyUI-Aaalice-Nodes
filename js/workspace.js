/** Left Aaalice workspace: manual dashboard and prompt-library management. */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { controlProviders, createControlElement, repairDuplicateHostIds } from "./lib/control_providers.js";
import {
	addControls, bindingKey, createPage, createSection, emptyDashboard, exportDashboardPreset,
	findSection, moveItem, normalizeDashboard, preflightDashboardPreset, stableId,
} from "./lib/dashboard_model.js";
import { promptLibraryStore } from "./lib/library_store.js";
import { button, createDialog, el, emptyState, field, iconButton, toggleSwitch } from "./lib/ui.js";
import {
	createControlCard, createListRow, createPageTabs, createSectionCard,
	createWorkspaceShell, createWorkspaceToolbar,
} from "./lib/workspace_components.js";

const EXTRA_KEY = "aaaliceSidebar";
const TAB_ID = "aaalice-workspace";
const mounted = new Set();
let activeWorkspace = "dashboard";
let activePageId = null;
let lastSectionId = null;
let editMode = false;
let renderFrame = 0;

export function openWorkspace(view = "dashboard") {
	if (!["dashboard", "library"].includes(view)) throw new Error(`[Aaalice] Unknown workspace view: ${view}`);
	const sidebar = app.extensionManager?.sidebarTab;
	if (!sidebar || !("activeSidebarTabId" in sidebar)) throw new Error("[Aaalice] ComfyUI sidebar state is unavailable");
	activeWorkspace = view;
	sidebar.activeSidebarTabId = TAB_ID;
	scheduleRender();
}

function graphNodes() { return app.graph?._nodes || []; }
function dashboard() { app.graph.extra ||= {}; app.graph.extra[EXTRA_KEY] = normalizeDashboard(app.graph.extra[EXTRA_KEY] || emptyDashboard()); return app.graph.extra[EXTRA_KEY]; }

function updateDashboard(callback) {
	const graph = app.graph; graph?.beforeChange?.();
	try { graph.extra ||= {}; graph.extra[EXTRA_KEY] = normalizeDashboard(callback(dashboard()) || dashboard()); }
	finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender(); }
}

function scheduleRender() {
	if (renderFrame) return;
	renderFrame = requestAnimationFrame(() => { renderFrame = 0; for (const root of mounted) renderWorkspace(root); });
}

function askText(title, label, value, onSave) {
	const input = document.createElement("input"); input.value = value || "";
	const body = el("div", { children: [field({ label, control: input })] }); const footer = el("div");
	const dialog = createDialog({ title, body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: () => { if (input.value.trim()) onSave(input.value.trim()); dialog.close(); } }));
	dialog.open(); input.focus(); input.select();
}

function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

function pickFile(accept, onFile) {
	const input = document.createElement("input"); input.type = "file"; input.accept = accept;
	input.addEventListener("change", () => { if (input.files?.[0]) onFile(input.files[0]); }); input.click();
}

async function confirmAction(message) {
	if (app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({ title: t("aaalice.common.confirm", "Confirm"), message }));
	return Boolean(globalThis.confirm(message));
}

function currentPage(model = dashboard()) {
	let page = model.pages.find((item) => item.id === activePageId) || model.pages[0] || null;
	activePageId = page?.id || null; return page;
}

function addPage() {
	askText(t("aaalice.workspace.page.add", "Add page"), t("aaalice.workspace.page.name", "Page name"), "", (name) => updateDashboard((model) => {
		const page = createPage(name); page.sections.push(createSection(t("aaalice.workspace.section.default", "Controls"))); model.pages.push(page); activePageId = page.id; lastSectionId = page.sections[0].id; return model;
	}));
}

async function removePage(page) {
	if (!await confirmAction(t("aaalice.workspace.page.deleteConfirm", "Delete this dashboard page?"))) return;
	updateDashboard((model) => { model.pages = model.pages.filter((item) => item.id !== page.id); activePageId = model.pages[0]?.id || null; return model; });
}

function addSection(page) {
	askText(t("aaalice.workspace.section.add", "Add section"), t("aaalice.workspace.section.name", "Section name"), "", (title) => updateDashboard((model) => {
		const target = model.pages.find((item) => item.id === page.id); const section = createSection(title); target.sections.push(section); lastSectionId = section.id; return model;
	}));
}

function resolve(binding) { return controlProviders.resolve(binding, graphNodes()); }

function workspaceLabels() {
	return {
		pages: t("aaalice.workspace.page.pages", "Dashboard pages"), duplicatePage: t("aaalice.workspace.page.duplicate", "Duplicate page"),
		renamePage: t("aaalice.workspace.page.rename", "Rename page"), deletePage: t("aaalice.workspace.page.delete", "Delete page"), addPage: t("aaalice.workspace.page.add", "Add page"),
		toggleSection: t("aaalice.workspace.section.toggle", "Toggle section"), renameSection: t("aaalice.workspace.section.rename", "Rename section"), deleteSection: t("aaalice.workspace.section.delete", "Delete section"),
		moveControl: t("aaalice.workspace.card.move", "Move control"), toggleWidth: t("aaalice.workspace.card.width", "Toggle card width"), toggleCompact: t("aaalice.workspace.card.compact", "Toggle compact mode"),
		removeControl: t("aaalice.workspace.card.remove", "Remove control"), controlMenu: t("aaalice.workspace.card.menu", "Control card menu"),
		missing: t("aaalice.workspace.binding.missing", "Missing binding"), incompatible: t("aaalice.workspace.binding.incompatible", "Incompatible control"),
	};
}

function editItem(pageId, sectionId, itemId, callback) {
	updateDashboard((model) => { const item = findSection(model, pageId, sectionId).section?.items.find((entry) => entry.id === itemId); if (item) callback(item); return model; });
}

function openRebind(item) {
	const candidates = graphNodes().flatMap((node) => controlProviders.list(node)).filter((candidate) => candidate.binding.valueType === item.binding.valueType);
	const body = el("div", "aa-rebind-list"); const footer = el("div");
	let selected = null;
	for (const candidate of candidates) body.append(createListRow({ title: candidate.label, description: candidate.binding.provider, onSelect: (checked) => { if (checked) selected = candidate.binding; } }));
	if (!candidates.length) body.append(emptyState({ description: t("aaalice.workspace.binding.noCompatible", "No compatible controls are available.") }));
	const dialog = createDialog({ title: t("aaalice.workspace.binding.rebind", "Rebind control"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { if (selected) updateDashboard((model) => { for (const page of model.pages) for (const section of page.sections) { const target = section.items.find((entry) => entry.id === item.id); if (target) target.binding = selected; } return model; }); dialog.close(); } }));
	dialog.open();
}

function openCardActions(pageId, sectionId, item) {
	const body = el("div", { className: "aa-workspace-toolbar", children: [
		button({ label: t("aaalice.workspace.binding.rebind", "Rebind control"), variant: "secondary", onClick: () => { dialog.close(); openRebind(item); } }),
		button({ label: t("aaalice.workspace.card.remove", "Remove control"), variant: "secondary", onClick: () => { updateDashboard((model) => { const target = findSection(model, pageId, sectionId).section; target.items = target.items.filter((entry) => entry.id !== item.id); return model; }); dialog.close(); } }),
	] });
	const dialog = createDialog({ title: t("aaalice.workspace.card.menu", "Control card menu"), body, size: "sm" }); dialog.open();
}

function openMoveControl(item) {
	const model = dashboard(); const pageSelect = document.createElement("select"); const sectionSelect = document.createElement("select");
	const rebuildSections = () => { const page = model.pages.find((entry) => entry.id === pageSelect.value); sectionSelect.replaceChildren(...(page?.sections || []).map((entry) => new Option(entry.title, entry.id))); };
	for (const page of model.pages) pageSelect.add(new Option(page.name, page.id)); pageSelect.addEventListener("change", rebuildSections); rebuildSections();
	const body = el("div", { children: [field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect }), field({ label: t("aaalice.workspace.target.section", "Section"), control: sectionSelect })] }); const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.card.move", "Move control"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => { if (sectionSelect.value) updateDashboard((current) => moveItem(current, item.id, pageSelect.value, sectionSelect.value)); dialog.close(); } })); dialog.open();
}

function renderDashboard(container) {
	container.classList.toggle("is-layout-editing", editMode);
	const model = dashboard(); const page = currentPage(model);
	const toolbar = createWorkspaceToolbar([
		button({ label: editMode ? t("aaalice.workspace.done", "Done") : t("aaalice.workspace.edit", "Edit layout"), iconName: editMode ? "statusCheck" : "layout", variant: editMode ? "primary" : "secondary", size: "sm", onClick: () => { editMode = !editMode; scheduleRender(); } }),
		iconButton({ iconName: "download", label: t("aaalice.workspace.preset.export", "Export preset"), variant: "ghost", onClick: () => {
			const preset = exportDashboardPreset(model, (binding) => resolve(binding)); downloadBlob(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }), "aaalice-dashboard-preset.json");
		} }),
		iconButton({ iconName: "upload", label: t("aaalice.workspace.preset.import", "Import preset"), variant: "ghost", onClick: () => pickFile(".json,application/json", importDashboardPreset) }),
	], { className: "aa-dashboard-toolbar", label: t("aaalice.workspace.dashboardActions", "Dashboard actions") });
	container.append(toolbar, createPageTabs({
		pages: model.pages, activeId: page?.id, editMode, labels: workspaceLabels(), onSelect: (id) => { activePageId = id; scheduleRender(); }, onAdd: addPage,
		onRename: (target) => askText(t("aaalice.workspace.page.rename", "Rename page"), t("aaalice.workspace.page.name", "Page name"), target.name, (name) => updateDashboard((current) => { current.pages.find((item) => item.id === target.id).name = name; return current; })), onDelete: removePage,
		onDuplicate: (target) => updateDashboard((current) => { const source = current.pages.find((item) => item.id === target.id); const copy = structuredClone(source); copy.id = stableId("page"); copy.name = `${copy.name} copy`; for (const section of copy.sections) { section.id = stableId("section"); for (const item of section.items) item.id = stableId("item"); } current.pages.splice(current.pages.indexOf(source) + 1, 0, copy); activePageId = copy.id; return current; }),
		onReorder: (sourceId, targetId) => updateDashboard((current) => { const sourceIndex = current.pages.findIndex((item) => item.id === sourceId); const targetIndex = current.pages.findIndex((item) => item.id === targetId); if (sourceIndex >= 0 && targetIndex >= 0) { const [source] = current.pages.splice(sourceIndex, 1); current.pages.splice(targetIndex, 0, source); } return current; }),
	}));
	if (!page) { container.append(emptyState({ iconName: "layout", className: "aa-workspace-empty aa-dashboard-empty", title: t("aaalice.workspace.empty.title", "Build your control pages"), description: t("aaalice.workspace.empty.description", "Create a page, then add controls from any compatible node's context menu."), actions: [button({ label: t("aaalice.workspace.page.add", "Add page"), iconName: "add", onClick: addPage })] })); return; }
	if (editMode) container.append(createWorkspaceToolbar([
		button({ label: t("aaalice.workspace.section.add", "Add section"), variant: "ghost", size: "sm", onClick: () => addSection(page) }),
		button({ label: t("aaalice.workspace.layout.separator", "Add separator"), variant: "ghost", size: "sm", onClick: () => updateDashboard((current) => { const targetPage = current.pages.find((item) => item.id === page.id); const target = targetPage.sections.find((item) => item.id === lastSectionId) || targetPage.sections.at(-1); if (target) target.items.push({ id: stableId("item"), kind: "separator", binding: null, label: t("aaalice.workspace.layout.separatorLabel", "Separator"), span: 2, compact: false }); return current; }) }),
		button({ label: t("aaalice.workspace.layout.spacer", "Add spacer"), variant: "ghost", size: "sm", onClick: () => updateDashboard((current) => { const targetPage = current.pages.find((item) => item.id === page.id); const target = targetPage.sections.find((item) => item.id === lastSectionId) || targetPage.sections.at(-1); if (target) target.items.push({ id: stableId("item"), kind: "spacer", binding: null, label: "", span: 2, compact: false }); return current; }) }),
	]));
	const scroll = el("div", "aa-dashboard-scroll"); const rail = el("nav", { className: "aa-dashboard-dot-rail", attrs: { "aria-label": t("aaalice.workspace.section.sections", "Sections") } });
	const sectionDots = [];
	for (const section of page.sections) {
		const cards = [];
		for (const item of section.items) {
			if (item.kind !== "control") {
				const special = el("div", item.kind === "separator" ? "aa-dashboard-separator" : "aa-dashboard-spacer", item.kind === "separator" ? item.label : "");
				if (editMode) {
					special.draggable = true; special.dataset.itemId = item.id;
					special.append(iconButton({ iconName: "delete", label: t("aaalice.workspace.layout.remove", "Remove layout item"), variant: "ghost", onClick: () => updateDashboard((current) => { const target = findSection(current, page.id, section.id).section; target.items = target.items.filter((entry) => entry.id !== item.id); return current; }) }));
					special.addEventListener("dragstart", (event) => event.dataTransfer?.setData("application/x-aaalice-dashboard-item", item.id));
					special.addEventListener("dragover", (event) => event.preventDefault());
					special.addEventListener("drop", (event) => { event.preventDefault(); const source = event.dataTransfer?.getData("application/x-aaalice-dashboard-item"); if (source) updateDashboard((current) => moveItem(current, source, page.id, section.id, section.items.indexOf(item))); });
				}
				cards.push(special); continue;
			}
			const resolved = resolve(item.binding);
			const control = resolved.status === "ok" ? createControlElement(resolved, { onCommit: scheduleRender }) : button({ label: t("aaalice.workspace.binding.rebind", "Rebind"), variant: "secondary", size: "sm", onClick: () => openRebind(item) });
			const card = createControlCard({ item, title: item.label || resolved.label || item.binding.controlId, control, status: resolved.status, editMode, labels: workspaceLabels(),
				onManage: () => openCardActions(page.id, section.id, item), onMove: () => openMoveControl(item),
				onRemove: () => updateDashboard((current) => { const target = findSection(current, page.id, section.id).section; target.items = target.items.filter((entry) => entry.id !== item.id); return current; }),
				onToggleSpan: () => editItem(page.id, section.id, item.id, (target) => { target.span = target.span === 2 ? 1 : 2; }),
				onToggleCompact: () => editItem(page.id, section.id, item.id, (target) => { target.compact = !target.compact; }), draggable: editMode,
			});
			if (editMode) {
				card.addEventListener("dragstart", (event) => event.dataTransfer?.setData("application/x-aaalice-dashboard-item", item.id));
				card.addEventListener("dragover", (event) => event.preventDefault());
				card.addEventListener("drop", (event) => { event.preventDefault(); const source = event.dataTransfer?.getData("application/x-aaalice-dashboard-item"); if (source) updateDashboard((current) => moveItem(current, source, page.id, section.id, section.items.indexOf(item))); });
			}
			cards.push(card);
		}
		const sectionElement = createSectionCard({ section, editMode, labels: workspaceLabels(), children: cards,
			onToggle: () => updateDashboard((current) => { const target = findSection(current, page.id, section.id).section; target.collapsed = !target.collapsed; return current; }),
			onDropSection: (sourceId, targetId) => updateDashboard((current) => { const targetPage = current.pages.find((item) => item.id === page.id); const sourceIndex = targetPage.sections.findIndex((item) => item.id === sourceId); const targetIndex = targetPage.sections.findIndex((item) => item.id === targetId); if (sourceIndex >= 0 && targetIndex >= 0) { const [source] = targetPage.sections.splice(sourceIndex, 1); targetPage.sections.splice(targetIndex, 0, source); } return current; }),
			onRename: () => askText(t("aaalice.workspace.section.rename", "Rename section"), t("aaalice.workspace.section.name", "Section name"), section.title, (name) => updateDashboard((current) => { findSection(current, page.id, section.id).section.title = name; return current; })),
			onDelete: () => updateDashboard((current) => { const target = current.pages.find((entry) => entry.id === page.id); target.sections = target.sections.filter((entry) => entry.id !== section.id); return current; }),
		});
		sectionElement.addEventListener("dragover", (event) => { if (editMode) event.preventDefault(); });
		sectionElement.addEventListener("drop", (event) => { const source = event.dataTransfer?.getData("application/x-aaalice-dashboard-item"); if (source) updateDashboard((current) => moveItem(current, source, page.id, section.id, section.items.length)); });
		scroll.append(sectionElement);
		const dot = button({ label: "", variant: "ghost", size: "icon", ariaLabel: section.title, onClick: () => sectionElement.scrollIntoView({ behavior: "smooth", block: "start" }) }); dot.classList.add("aa-dashboard-dot"); rail.append(dot); sectionDots.push({ section: sectionElement, dot });
	}
	if (!page.sections.length) scroll.append(emptyState({ description: t("aaalice.workspace.section.empty", "Add a section to start arranging controls.") }));
	container.append(el("div", { className: "aa-dashboard-body", children: [scroll, rail] }));
	if (sectionDots.length && typeof IntersectionObserver !== "undefined") {
		const visibility = new Map();
		container._aaaliceSectionObserver = new IntersectionObserver((entries) => {
			for (const entry of entries) visibility.set(entry.target, entry.intersectionRatio);
			const active = [...visibility].sort((left, right) => right[1] - left[1])[0]?.[0];
			for (const item of sectionDots) {
				const current = item.section === active; item.dot.classList.toggle("is-active", current);
				if (current) item.dot.setAttribute("aria-current", "location"); else item.dot.removeAttribute("aria-current");
			}
		}, { root: scroll, threshold: [0, .15, .35, .6, 1] });
		for (const item of sectionDots) container._aaaliceSectionObserver.observe(item.section);
	}
}

async function importDashboardPreset(file) {
	try {
		const preset = JSON.parse(await file.text()); const preflight = preflightDashboardPreset(preset, (binding) => resolve(binding));
		const missing = preflight.bindings.filter((item) => item.status !== "ok");
		if (missing.length && !await confirmAction(`${missing.length} ${t("aaalice.workspace.preset.missingConfirm", "binding(s) are missing or incompatible. Import the layout and skip incompatible values?")}`)) return;
		const graph = app.graph; graph?.beforeChange?.();
		try {
			graph.extra ||= {}; graph.extra[EXTRA_KEY] = preflight.dashboard;
			for (const item of preflight.bindings) {
				if (item.status !== "ok" || !item.saved) continue; const resolved = resolve(item.binding); const next = item.saved.value;
				if (resolved.status !== "ok") continue;
				if (typeof next === "number" && (Number.isFinite(Number(resolved.options?.min)) && next < Number(resolved.options.min) || Number.isFinite(Number(resolved.options?.max)) && next > Number(resolved.options.max))) continue;
				resolved.setValue(next, { transaction: false });
			}
		} finally { graph?.afterChange?.(); graph?.setDirtyCanvas?.(true, true); scheduleRender(); }
	} catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.preset.title", "Dashboard preset"), detail: error.message }); }
}

function entryEditor(entry = null) {
	const title = document.createElement("input"); title.value = entry?.title || "";
	const text = document.createElement("textarea"); text.value = entry?.text || "";
	const note = document.createElement("textarea"); note.value = entry?.note || "";
	const category = document.createElement("select"); category.add(new Option(t("aaalice.workspace.libraryUi.noCategory", "No category"), "")); for (const item of promptLibraryStore.snapshot.categories) category.add(new Option(item.name, item.id, false, item.id === entry?.categoryId));
	const collections = document.createElement("select"); collections.multiple = true; for (const item of promptLibraryStore.snapshot.collections) collections.add(new Option(item.name, item.id, false, (entry?.collections || []).some((membership) => membership.collectionId === item.id)));
	const tags = document.createElement("input"); tags.value = (entry?.tagIds || []).map((id) => promptLibraryStore.snapshot.tags.find((item) => item.id === id)?.name).filter(Boolean).join(", ");
	const preview = document.createElement("input"); preview.type = "file"; preview.accept = "image/png,image/jpeg,image/gif,image/webp";
	const removePreview = document.createElement("input"); removePreview.type = "checkbox";
	const body = el("div", { className: "aa-library-entry-form", children: [field({ label: t("aaalice.workspace.libraryUi.title", "Title"), control: title }), field({ label: t("aaalice.workspace.libraryUi.prompt", "Prompt"), control: text }), field({ label: t("aaalice.workspace.libraryUi.note", "Note"), control: note }), field({ label: t("aaalice.workspace.libraryUi.category", "Category"), control: category }), field({ label: t("aaalice.workspace.libraryUi.collections", "Collections"), control: collections }), field({ label: t("aaalice.workspace.libraryUi.tags", "Tags"), control: tags }), field({ label: t("aaalice.workspace.libraryUi.preview", "Preview image"), control: preview }), ...(entry?.previewHash ? [field({ label: t("aaalice.workspace.libraryUi.removePreview", "Remove current preview"), control: removePreview, inline: true })] : [])] });
	const footer = el("div"); const dialog = createDialog({ title: entry ? t("aaalice.workspace.libraryUi.editEntry", "Edit prompt entry") : t("aaalice.workspace.libraryUi.addEntry", "Add prompt entry"), body, footer, size: "lg" });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.save", "Save"), onClick: async () => {
		const data = { title: title.value.trim(), text: text.value, note: note.value, categoryId: category.value || null, collectionIds: [...collections.selectedOptions].map((item) => item.value), tags: tags.value.split(",").map((item) => item.trim()).filter(Boolean) };
		try {
			const saved = entry ? await promptLibraryStore.updateEntry(entry.id, data) : await promptLibraryStore.createEntry(data);
			if (removePreview.checked && !preview.files?.[0]) await promptLibraryStore.deletePreview(saved.id);
			if (preview.files?.[0]) await promptLibraryStore.uploadPreview(saved.id, preview.files[0]);
			dialog.close();
		} catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message }); }
	} })); dialog.open();
}

function manageTaxonomy(kind) {
	const isCategory = kind === "categories"; const title = isCategory ? t("aaalice.workspace.libraryUi.manageCategories", "Manage categories") : t("aaalice.workspace.libraryUi.manageCollections", "Manage collections");
	const body = el("div", "aa-rebind-list"); const footer = el("div");
	const draw = () => {
		body.replaceChildren(); const items = promptLibraryStore.snapshot[kind];
		items.forEach((item, index) => {
			body.append(createListRow({ title: item.name, actions: [
				iconButton({ iconName: "moveDown", label: t("aaalice.workspace.libraryUi.moveUp", "Move up"), variant: "ghost", disabled: index === 0, onClick: async () => { const ids = items.map((value) => value.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; await promptLibraryStore.reorder({ kind, orderedIds: ids }); draw(); } }),
				iconButton({ iconName: "settings", label: t("aaalice.workspace.libraryUi.rename", "Rename"), variant: "ghost", onClick: () => askText(t("aaalice.workspace.libraryUi.rename", "Rename"), t("aaalice.workspace.libraryUi.name", "Name"), item.name, async (name) => { if (isCategory) await promptLibraryStore.updateCategory(item.id, { name }); else await promptLibraryStore.updateCollection(item.id, { name }); draw(); }) }),
				iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", onClick: async () => { if (!await confirmAction(`${t("aaalice.workspace.libraryUi.deleteConfirm", "Delete")} ${item.name}?`)) return; if (isCategory) await promptLibraryStore.deleteCategory(item.id); else await promptLibraryStore.deleteCollection(item.id); draw(); } }),
			] }));
		});
	};
	const addLabel = isCategory ? t("aaalice.workspace.libraryUi.addCategory", "Add category") : t("aaalice.workspace.libraryUi.addCollectionAction", "Add collection");
	const dialog = createDialog({ title, body, footer, size: "lg" }); footer.append(
		button({ label: addLabel, iconName: "add", variant: "secondary", onClick: () => askText(addLabel, t("aaalice.workspace.libraryUi.name", "Name"), "", async (name) => { if (isCategory) await promptLibraryStore.createCategory({ name }); else await promptLibraryStore.createCollection({ name }); draw(); }) }),
		button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => dialog.close() }),
	); draw(); dialog.open();
}

function openTaxonomyChooser() {
	const body = el("div", { className: "aa-workspace-toolbar", children: [
		button({ label: t("aaalice.workspace.libraryUi.categories", "Categories"), onClick: () => { dialog.close(); manageTaxonomy("categories"); } }),
		button({ label: t("aaalice.workspace.libraryUi.collections", "Collections"), variant: "secondary", onClick: () => { dialog.close(); manageTaxonomy("collections"); } }),
	] });
	const dialog = createDialog({ title: t("aaalice.workspace.libraryUi.manage", "Manage prompt library"), body, size: "sm" }); dialog.open();
}

function openBatchEdit(selected) {
	const category = document.createElement("select"); category.add(new Option(t("aaalice.workspace.libraryUi.keepCategory", "Keep current categories"), "__keep__")); category.add(new Option(t("aaalice.workspace.libraryUi.noCategory", "No category"), ""));
	for (const item of promptLibraryStore.snapshot.categories) category.add(new Option(item.name, item.id));
	const addCollection = document.createElement("select"); addCollection.add(new Option(t("aaalice.workspace.libraryUi.noCollectionChange", "Do not add a collection"), ""));
	const removeCollection = document.createElement("select"); removeCollection.add(new Option(t("aaalice.workspace.libraryUi.noCollectionChange", "Do not remove a collection"), ""));
	for (const item of promptLibraryStore.snapshot.collections) { addCollection.add(new Option(item.name, item.id)); removeCollection.add(new Option(item.name, item.id)); }
	const body = el("div", { children: [field({ label: t("aaalice.workspace.libraryUi.category", "Category"), control: category }), field({ label: t("aaalice.workspace.libraryUi.addCollection", "Add to collection"), control: addCollection }), field({ label: t("aaalice.workspace.libraryUi.removeCollection", "Remove from collection"), control: removeCollection })] }); const footer = el("div");
	const dialog = createDialog({ title: t("aaalice.workspace.libraryUi.batch", "Edit selected entries"), body, footer });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: async () => {
		const payload = { entryIds: [...selected] }; if (category.value !== "__keep__") payload.categoryId = category.value || null; if (addCollection.value) payload.addCollectionId = addCollection.value; if (removeCollection.value) payload.removeCollectionId = removeCollection.value;
		await promptLibraryStore.batchEntries(payload); dialog.close();
	} })); dialog.open();
}

function renderLibrary(container) {
	let query = container._aaaliceQuery || ""; let categoryId = container._aaaliceCategory || ""; let collectionId = container._aaaliceCollection || "";
	const selected = container._aaaliceSelected ||= new Set();
	const search = document.createElement("input"); search.type = "search"; search.placeholder = t("aaalice.promptSelector.search", "Search prompt library"); search.value = query;
	search.addEventListener("input", () => { container._aaaliceQuery = search.value; scheduleRender(); });
	const category = document.createElement("select"); category.add(new Option(t("aaalice.promptSelector.allCategories", "All categories"), "")); for (const item of promptLibraryStore.snapshot.categories) category.add(new Option(item.name, item.id, false, item.id === categoryId)); category.addEventListener("change", () => { container._aaaliceCategory = category.value; scheduleRender(); });
	const collection = document.createElement("select"); collection.add(new Option(t("aaalice.promptSelector.allCollections", "All collections"), "")); for (const item of promptLibraryStore.snapshot.collections) collection.add(new Option(item.name, item.id, false, item.id === collectionId)); collection.addEventListener("change", () => { container._aaaliceCollection = collection.value; scheduleRender(); });
	const toolbar = createWorkspaceToolbar([
		button({ label: t("aaalice.workspace.libraryUi.addEntry", "Add entry"), iconName: "add", size: "sm", onClick: () => entryEditor() }),
		...(selected.size ? [button({ label: `${t("aaalice.workspace.libraryUi.batch", "Edit selected entries")} (${selected.size})`, variant: "secondary", size: "sm", onClick: () => openBatchEdit(selected) })] : []),
		button({ label: t("aaalice.workspace.libraryUi.manageAction", "Manage"), iconName: "settings", variant: "ghost", size: "sm", onClick: openTaxonomyChooser }),
		iconButton({ iconName: "download", label: selected.size ? `${t("aaalice.workspace.libraryUi.exportSelected", "Export selected")} (${selected.size})` : t("aaalice.workspace.libraryUi.export", "Export"), variant: "ghost", onClick: async () => { const response = await promptLibraryStore.exportArchive({ ...(selected.size ? { entryIds: [...selected] } : {}), ...(!selected.size && categoryId ? { categoryId } : {}), ...(!selected.size && collectionId ? { collectionId } : {}) }); downloadBlob(await response.blob(), "aaalice-prompt-library.zip"); } }),
		iconButton({ iconName: "upload", label: t("aaalice.workspace.libraryUi.import", "Import"), variant: "ghost", onClick: () => pickFile(".zip,.json,application/zip,application/json", importLibrary) }),
	], { className: "aa-library-toolbar", label: t("aaalice.workspace.libraryUi.actions", "Library actions") });
	container.append(toolbar, el("div", { className: "aa-library-filters", children: [search, category, collection] }));
	const list = el("div", "aa-library-list"); const needle = query.trim().toLocaleLowerCase();
	const entries = promptLibraryStore.snapshot.entries.filter((entry) => (!categoryId || entry.categoryId === categoryId) && (!collectionId || entry.collections.some((item) => item.collectionId === collectionId)) && (!needle || `${entry.title}\n${entry.text}\n${entry.note}`.toLocaleLowerCase().includes(needle)));
	for (const entry of entries) {
		const row = el("article", "aa-library-entry");
		const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = selected.has(entry.id); checkbox.setAttribute("aria-label", `${t("aaalice.workspace.libraryUi.select", "Select")} ${entry.title}`); checkbox.addEventListener("change", () => { if (checkbox.checked) selected.add(entry.id); else selected.delete(entry.id); scheduleRender(); }); row.append(checkbox);
		if (entry.previewHash) { row.classList.add("has-preview"); const image = document.createElement("img"); image.src = api.apiURL(`/aaalice/prompt-library/assets/${entry.previewHash}`); image.alt = ""; row.append(image); }
		const categoryName = promptLibraryStore.snapshot.categories.find((item) => item.id === entry.categoryId)?.name;
		const tagNames = (entry.tagIds || []).map((id) => promptLibraryStore.snapshot.tags.find((item) => item.id === id)?.name).filter(Boolean).slice(0, 3);
		const meta = el("div", "aa-library-entry-meta");
		if (categoryName) meta.append(el("span", "aa-library-chip is-category", categoryName));
		for (const name of tagNames) meta.append(el("span", "aa-library-chip", name));
		const copy = el("div", { className: "aa-library-entry-copy", children: [el("strong", null, entry.title), el("p", null, entry.text), meta] });
		const actions = el("div", { className: "aa-library-entry-actions", children: [iconButton({ iconName: "settings", label: t("aaalice.workspace.libraryUi.edit", "Edit"), variant: "ghost", onClick: () => entryEditor(entry) }), iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", onClick: async () => { if (await confirmAction(t("aaalice.workspace.libraryUi.deleteEntryConfirm", "Delete this prompt entry?"))) { await promptLibraryStore.deleteEntry(entry.id); selected.delete(entry.id); } } })] });
		row.append(copy, actions); list.append(row);
	}
	if (!entries.length) {
		const isLibraryEmpty = promptLibraryStore.snapshot.entries.length === 0;
		list.append(emptyState({
			iconName: isLibraryEmpty ? "note" : "filter", className: "aa-workspace-empty aa-library-empty",
			title: isLibraryEmpty ? t("aaalice.workspace.libraryUi.emptyTitle", "Your library is empty") : t("aaalice.workspace.libraryUi.noMatchTitle", "No matching entries"),
			description: isLibraryEmpty ? t("aaalice.workspace.libraryUi.emptyDescription", "Add your first prompt entry to reuse it across selectors.") : t("aaalice.promptSelector.noResults", "No matching prompt entries."),
			actions: isLibraryEmpty ? [button({ label: t("aaalice.workspace.libraryUi.addEntry", "Add entry"), iconName: "add", onClick: () => entryEditor() })] : [],
		}));
	} container.append(list);
}

async function importLibrary(file) {
	try {
		const result = await promptLibraryStore.importPreflight(file); const groups = result.preflight; const conflicts = [...groups.conflict, ...groups.duplicate];
		const body = el("div", { children: [el("p", null, `${groups.new.length} ${t("aaalice.workspace.libraryUi.new", "new")} · ${groups.update.length} ${t("aaalice.workspace.libraryUi.existing", "existing")} · ${groups.conflict.length} ${t("aaalice.workspace.libraryUi.conflicts", "conflicts")} · ${groups.duplicate.length} ${t("aaalice.workspace.libraryUi.duplicates", "duplicates")} · ${groups.invalid.length} ${t("aaalice.workspace.libraryUi.invalid", "invalid")}`)] });
		const resolutions = {}; for (const entry of conflicts) {
			resolutions[entry.id] = "local";
			const select = document.createElement("select"); select.add(new Option(t("aaalice.workspace.libraryUi.keepLocal", "Keep local"), "local")); select.add(new Option(t("aaalice.workspace.libraryUi.useImport", "Use import"), "import")); select.add(new Option(t("aaalice.workspace.libraryUi.createDuplicate", "Create duplicate"), "duplicate")); select.addEventListener("change", () => { resolutions[entry.id] = select.value; });
			body.append(field({ label: entry.title || entry.id, control: select, inline: true }));
		}
		const footer = el("div"); const dialog = createDialog({ title: t("aaalice.workspace.libraryUi.importTitle", "Import prompt library"), body, footer, size: "lg" });
		footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.workspace.libraryUi.import", "Import"), onClick: async () => { await promptLibraryStore.importApply(file, resolutions); dialog.close(); } })); dialog.open();
	} catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.libraryUi.importTitle", "Prompt library import"), detail: error.message }); }
}

function renderWorkspace(root) {
	root.querySelector(".aa-workspace-content")?._aaaliceSectionObserver?.disconnect();
	root.replaceChildren();
	let shell;
	const renderActiveWorkspace = () => {
		shell.content._aaaliceSectionObserver?.disconnect();
		shell.content.replaceChildren();
		if (activeWorkspace === "dashboard") renderDashboard(shell.content); else renderLibrary(shell.content);
	};
	shell = createWorkspaceShell({ title: t("aaalice.workspace.title", "Aaalice Workspace"), activeTab: activeWorkspace, tabs: [{ value: "dashboard", label: t("aaalice.workspace.dashboard", "Controls"), iconName: "settings" }, { value: "library", label: t("aaalice.workspace.library", "Library"), iconName: "note" }], onTabChange: (value) => { activeWorkspace = value; renderActiveWorkspace(); } });
	root.append(shell.root); renderActiveWorkspace();
}

function openAddControls(node) {
	const controls = controlProviders.list(node); if (!controls.length) return;
	let model = dashboard(); let page = currentPage(model); let selected = new Set(); let allowDuplicate = false;
	const body = el("div", "aa-add-controls-dialog"); const list = el("div", "aa-add-controls-list");
	const pageSelect = document.createElement("select"); const sectionSelect = document.createElement("select");
	const rebuildTargets = () => {
		model = dashboard(); page = model.pages.find((item) => item.id === pageSelect.value) || model.pages[0];
		pageSelect.replaceChildren(...model.pages.map((item) => new Option(item.name, item.id, false, item.id === page?.id)));
		sectionSelect.replaceChildren(...(page?.sections || []).map((item) => new Option(item.title, item.id, false, item.id === lastSectionId)));
	};
	if (!model.pages.length) {
		const pageName = document.createElement("input"); pageName.value = t("aaalice.workspace.page.default", "Generation");
		const sectionName = document.createElement("input"); sectionName.value = t("aaalice.workspace.section.default", "Controls");
		body.append(field({ label: t("aaalice.workspace.target.newPage", "New page"), control: pageName }), field({ label: t("aaalice.workspace.target.newSection", "New section"), control: sectionName }));
		body._createTarget = () => updateDashboard((current) => { const nextPage = createPage(pageName.value.trim() || "Page"); const nextSection = createSection(sectionName.value.trim() || "Controls"); nextPage.sections.push(nextSection); current.pages.push(nextPage); activePageId = nextPage.id; lastSectionId = nextSection.id; return current; });
	} else { rebuildTargets(); pageSelect.addEventListener("change", rebuildTargets); body.append(field({ label: t("aaalice.workspace.target.page", "Page"), control: pageSelect }), field({ label: t("aaalice.workspace.target.section", "Section"), control: sectionSelect })); }
	const existing = new Set(model.pages.flatMap((candidatePage) => candidatePage.sections.flatMap((section) => section.items.filter((item) => item.kind === "control").map((item) => bindingKey(item.binding)))));
	const drawList = () => { list.replaceChildren(); for (const control of controls) { const added = existing.has(bindingKey(control.binding)); const row = createListRow({ title: control.label, description: added ? t("aaalice.workspace.binding.added", "Already added") : control.binding.valueType, selected: selected.has(bindingKey(control.binding)), onSelect: (checked) => { if (checked) selected.add(bindingKey(control.binding)); else selected.delete(bindingKey(control.binding)); } }); const checkbox = row.querySelector("input"); checkbox.disabled = added && !allowDuplicate; list.append(row); } };
	body.append(toggleSwitch({ checked: false, label: t("aaalice.workspace.binding.allowDuplicate", "Allow duplicate cards"), onChange: (value) => { allowDuplicate = value; drawList(); } }), list); drawList();
	const footer = el("div"); const dialog = createDialog({ title: t("aaalice.workspace.binding.add", "Add controls to sidebar"), body, footer, size: "lg" });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => {
		if (body._createTarget) { body._createTarget(); model = dashboard(); page = currentPage(model); }
		const sectionId = sectionSelect.value || page?.sections[0]?.id; if (!page || !sectionId) return;
		const chosen = controls.filter((control) => selected.has(bindingKey(control.binding))); updateDashboard((current) => addControls(current, page.id, sectionId, chosen)); lastSectionId = sectionId; dialog.close();
	} })); dialog.open();
}

function patchNodeMenu(node) {
	if (!node || node._aaaliceWorkspaceMenuPatched || !controlProviders.providerForNode(node)) return;
	node._aaaliceWorkspaceMenuPatched = true;
	const previous = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (_canvas, options = []) {
		const result = previous?.apply(this, arguments); const target = Array.isArray(result) ? result : options;
		const label = t("aaalice.workspace.binding.menu", "📌 Add controls to sidebar…");
		if (!target.some((item) => item?.content === label)) target.push({ content: label, callback: () => openAddControls(this) }); return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.Workspace",
	async init() {
		await ensureI18nReady();
		try { await promptLibraryStore.refresh(); }
		catch (error) { app.extensionManager.toast.add({ severity: "error", summary: t("aaalice.workspace.library", "Prompt library"), detail: error.message }); }
	},
	beforeRegisterNodeDef(nodeType) { const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); patchNodeMenu(this); return result; }; },
	nodeCreated(node) { patchNodeMenu(node); }, loadedGraphNode(node) { patchNodeMenu(node); },
	setup() {
		app.extensionManager.registerSidebarTab({ id: TAB_ID, icon: "aaalice-workspace-sidebar-icon", title: t("aaalice.workspace.title", "Aaalice Workspace"), tooltip: t("aaalice.workspace.title", "Aaalice Workspace"), type: "custom", render: (element) => { mounted.add(element); renderWorkspace(element); return () => { element.querySelector(".aa-workspace-content")?._aaaliceSectionObserver?.disconnect(); mounted.delete(element); }; } });
		repairDuplicateHostIds(graphNodes()); for (const node of graphNodes()) patchNodeMenu(node);
		api.addEventListener("graphChanged", () => { repairDuplicateHostIds(graphNodes()); for (const node of graphNodes()) patchNodeMenu(node); scheduleRender(); });
		window.addEventListener("aaalice-parameter-panel-changed", scheduleRender); promptLibraryStore.addEventListener("change", scheduleRender);
	},
});
