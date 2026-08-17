import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { CategoryTree } from "../lib/category_tree.js";
import { applyCategoryColor } from "../lib/category_color.js";
import { collectionDisplayName, isDefaultCollection } from "../lib/collection.js";
import { promptLibraryStore } from "../lib/library_store.js";
import { badge, button, checkboxControl, createDialog, el, emptyState, icon, iconButton, segmentedControl } from "../lib/ui.js";
import { confirmAction } from "./dom_utils.js";

const EXPAND_DELAY = 450;

function managerError(error, summary = t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders")) {
	app.extensionManager.toast.add({ severity: "error", summary, detail: error.message });
}

function categoryDeleteDialog(category, tree, onDelete) {
	const directEntries = promptLibraryStore.categoryDirectCount(category.id);
	const children = tree.children(category.id).length;
	const branchCategories = tree.descendants(category.id).length + 1;
	const branchEntries = tree.aggregateCount.get(category.id) || 0;
	let deleteDescendants = false;
	const mode = checkboxControl({
		label: t("aaalice.workspace.libraryUi.deleteBranchMode", "Delete the entire category branch"),
		checked: false,
		onChange: (value) => { deleteDescendants = value; body.classList.toggle("is-branch-delete", value); },
	});
	const body = el("div", { className: "aa-category-delete", children: [
		el("div", { className: "aa-category-delete__stats", children: [
			el("div", { children: [el("strong", null, String(directEntries)), el("span", null, t("aaalice.workspace.libraryUi.directEntries", "Direct entries"))] }),
			el("div", { children: [el("strong", null, String(children)), el("span", null, t("aaalice.workspace.libraryUi.childCategories", "Child categories"))] }),
			el("div", { children: [el("strong", null, String(branchCategories)), el("span", null, t("aaalice.workspace.libraryUi.branchCategories", "Categories in branch"))] }),
			el("div", { children: [el("strong", null, String(branchEntries)), el("span", null, t("aaalice.workspace.libraryUi.branchEntries", "Entries in branch"))] }),
		] }),
		el("div", { className: "aa-category-delete__mode", children: [mode, el("span", null, t("aaalice.workspace.libraryUi.deleteBranchMode", "Delete the entire category branch"))] }),
		el("p", { className: "aa-category-delete__safe", text: t("aaalice.workspace.libraryUi.deleteCategorySafeHint", "By default, child categories move up one level and direct entries become uncategorized. No prompt entries are deleted.") }),
		el("p", { className: "aa-category-delete__branch", text: t("aaalice.workspace.libraryUi.deleteCategoryBranchHint", "The selected category and every category below it will be deleted. All prompt entries in the branch become uncategorized; no prompt content is deleted.") }),
	] });
	const footer = el("div");
	let dialog;
	const remove = button({ label: t("aaalice.common.delete", "Delete"), iconName: "delete", variant: "danger", onClick: async () => {
		remove.disabled = true;
		try { await onDelete(deleteDescendants); dialog.close(); }
		catch (error) { remove.disabled = false; managerError(error); }
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), remove);
	dialog = createDialog({ title: `${t("aaalice.workspace.libraryUi.deleteCategoryTitle", "Delete category")} · ${tree.path(category.id)}`, body, footer, size: "sm", className: "aa-category-delete-dialog" });
}

function collectionManager({ list, footerInput, footerAdd, setSummary, isActive }) {
	let editingId = null;
	const draw = () => {
		const items = promptLibraryStore.snapshot.collections;
		setSummary(t("aaalice.workspace.libraryUi.collections", "Favorite folders"), items.length);
		list.removeAttribute("role"); list.removeAttribute("aria-label"); list.removeAttribute("aria-description");
		list.replaceChildren();
		if (!items.length) list.append(emptyState({ iconName: "favorite", className: "aa-taxonomy-empty", title: t("aaalice.workspace.libraryUi.noCollections", "No favorite folders yet"), description: t("aaalice.workspace.libraryUi.taxonomyEmptyHint", "Create one below to start organizing your prompt entries.") }));
		items.forEach((item, index) => {
			if (editingId === item.id) {
				const input = document.createElement("input"); input.value = item.name; input.setAttribute("aria-label", t("aaalice.workspace.libraryUi.name", "Name"));
				const save = async () => { if (!input.value.trim()) return; try { await promptLibraryStore.updateCollection(item.id, { name: input.value.trim() }); editingId = null; if (isActive()) draw(); } catch (error) { managerError(error); } };
				input.addEventListener("keydown", (event) => { if (event.key === "Enter") void save(); else if (event.key === "Escape") { editingId = null; draw(); } });
				list.append(el("div", { className: "aa-taxonomy-row is-editing", children: [input, button({ label: t("aaalice.common.save", "Save"), iconName: "statusCheck", size: "sm", onClick: save }), iconButton({ iconName: "close", label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => { editingId = null; draw(); } })] }));
				queueMicrotask(() => { input.focus(); input.select(); });
				return;
			}
			const move = async (offset) => {
				const target = index + offset; if (target < 0 || target >= items.length) return;
				const orderedIds = items.map((entry) => entry.id); [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
				try { await promptLibraryStore.reorder({ kind: "collections", orderedIds }); if (isActive()) draw(); } catch (error) { managerError(error); }
			};
			const locked = isDefaultCollection(item);
			const actions = el("div", { className: "aa-taxonomy-row-actions", children: [
				iconButton({ iconName: "moveUp", label: t("aaalice.workspace.libraryUi.moveUp", "Move up"), variant: "ghost", disabled: index === 0, onClick: () => move(-1) }),
				iconButton({ iconName: "moveDown", label: t("aaalice.workspace.libraryUi.moveDown", "Move down"), variant: "ghost", disabled: index === items.length - 1, onClick: () => move(1) }),
				iconButton({ iconName: "settings", label: t("aaalice.workspace.libraryUi.rename", "Rename"), variant: "ghost", onClick: () => { editingId = item.id; draw(); } }),
				iconButton({ iconName: "delete", label: locked ? t("aaalice.workspace.libraryUi.defaultFavoriteCannotDelete", "The default favorite folder cannot be deleted") : t("aaalice.common.delete", "Delete"), variant: "ghost", disabled: locked, onClick: async () => {
					if (!await confirmAction(t("aaalice.workspace.libraryUi.deleteCollectionHint", "This favorite membership will be removed from its entries. This cannot be undone."), { title: t("aaalice.workspace.libraryUi.deleteCollectionTitle", "Delete favorite folder"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true })) return;
					try { await promptLibraryStore.deleteCollection(item.id); if (isActive()) draw(); } catch (error) { managerError(error); }
				} }),
			] });
			list.append(el("div", { className: "aa-category-tree-row is-collection", children: [el("span", { className: "aa-category-tree-row__copy", children: [el("strong", null, collectionDisplayName(item, t("aaalice.workspace.libraryUi.defaultFavorites", "Default favorites"))), el("small", null, `${promptLibraryStore.usage("collections", item.id)} ${t("aaalice.workspace.libraryUi.entriesCount", "entries")}`)] }), actions] }));
		});
	};
	const add = async () => {
		const name = footerInput.value.trim(); if (!name || footerAdd.disabled) return;
		footerAdd.disabled = true;
		try { await promptLibraryStore.createCollection({ name }); footerInput.value = ""; if (isActive()) { draw(); footerInput.focus(); } }
		catch (error) { managerError(error); }
		finally { footerAdd.disabled = false; }
	};
	return { draw, add };
}

function categoryManager({ list, tools, footerInput, footerAdd, setSummary, isActive }) {
	const collapsed = new Set();
	let query = "";
	let editingId = null;
	let draftParentId;
	let localCategories = null;
	let localTree = null;
	let activeId = null;
	let focusId = null;
	let dragId = null;
	let expandTimer = 0;
	let movePending = false;
	let search;
	let expandAll;
	let collapseAll;
	const editingActive = () => editingId !== null || draftParentId !== undefined;
	const controlsLocked = () => editingActive() || movePending;
	const syncEditingControls = () => {
		const disabled = controlsLocked();
		if (search) search.disabled = disabled;
		if (expandAll) expandAll.disabled = disabled || Boolean(query.trim());
		if (collapseAll) collapseAll.disabled = disabled || Boolean(query.trim());
		footerInput.disabled = disabled;
		footerAdd.disabled = disabled;
	};
	const categories = () => localCategories || promptLibraryStore.snapshot.categories;
	const tree = () => localTree || promptLibraryStore.index.categoryTree;
	const clearExpandTimer = () => { if (expandTimer) clearTimeout(expandTimer); expandTimer = 0; };
	const restoreFocus = () => { if (!focusId) return; const id = focusId; focusId = null; activeId = id; queueMicrotask(() => list.querySelector(`[data-category-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true })); };
	const move = async (categoryId, parentId, index) => {
		if (movePending) return;
		const optimistic = categories().map((item) => ({ ...item }));
		const source = optimistic.find((item) => item.id === categoryId); if (!source) return;
		const oldSiblings = optimistic.filter((item) => (item.parentId || null) === (source.parentId || null) && item.id !== categoryId).sort((a, b) => a.position - b.position);
		oldSiblings.forEach((item, position) => { item.position = position; });
		const targetSiblings = (source.parentId || null) === (parentId || null) ? oldSiblings : optimistic.filter((item) => (item.parentId || null) === (parentId || null) && item.id !== categoryId).sort((a, b) => a.position - b.position);
		source.parentId = parentId; targetSiblings.splice(index, 0, source); targetSiblings.forEach((item, position) => { item.position = position; });
		movePending = true; localCategories = optimistic; localTree = new CategoryTree(optimistic, promptLibraryStore.snapshot.entries); focusId = categoryId; syncEditingControls(); draw();
		try { await promptLibraryStore.moveCategory(categoryId, { parentId, index }); }
		catch (error) { managerError(error, t("aaalice.workspace.libraryUi.categoryMoveFailed", "Category move failed")); }
		finally {
			movePending = false; localCategories = null; localTree = null; focusId = categoryId; syncEditingControls(); if (isActive()) draw();
		}
	};
	const keyboardMove = (event, record, currentTree) => {
		if (!event.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
		event.preventDefault();
		const siblings = currentTree.children(record.parentId);
		const index = siblings.findIndex((item) => item.id === record.id);
		if (event.key === "ArrowUp" && index > 0) void move(record.id, record.parentId, index - 1);
		else if (event.key === "ArrowDown" && index < siblings.length - 1) void move(record.id, record.parentId, index + 1);
		else if (event.key === "ArrowRight" && index > 0) { const parent = siblings[index - 1]; collapsed.delete(parent.id); void move(record.id, parent.id, currentTree.children(parent.id).length); }
		else if (event.key === "ArrowLeft" && record.parentId) {
			const parent = currentTree.record(record.parentId); const parentSiblings = currentTree.children(parent?.parentId); const parentIndex = parentSiblings.findIndex((item) => item.id === record.parentId);
			void move(record.id, parent?.parentId || null, parentIndex + 1);
		}
	};
	const keyboardNavigate = (event, record, currentTree) => {
		if (event.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
		const rows = [...list.querySelectorAll('[role="treeitem"]:not([hidden])')]; const row = event.currentTarget; const index = rows.indexOf(row);
		if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
			event.preventDefault();
			const target = event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : rows[index + (event.key === "ArrowDown" ? 1 : -1)];
			target?.focus({ preventScroll: true });
		} else if (event.key === "ArrowRight" && record.hasChildren) {
			event.preventDefault();
			if (!query.trim() && collapsed.has(record.id)) { collapsed.delete(record.id); focusId = record.id; draw(); }
			else rows[index + 1]?.focus({ preventScroll: true });
		} else if (event.key === "ArrowLeft") {
			if (!query.trim() && record.hasChildren && !collapsed.has(record.id)) { event.preventDefault(); collapsed.add(record.id); focusId = record.id; draw(); }
			else if (record.parentId) { event.preventDefault(); list.querySelector(`[data-category-id="${CSS.escape(record.parentId)}"]`)?.focus({ preventScroll: true }); }
		}
	};
	const dropPlan = (event, targetRecord, currentTree) => {
		if (!dragId || dragId === targetRecord.id || currentTree.isInSubtree(targetRecord.id, dragId)) return null;
		const rect = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
		if (ratio < .26) {
			const siblings = currentTree.children(targetRecord.parentId).filter((item) => item.id !== dragId);
			return { parentId: targetRecord.parentId, index: siblings.findIndex((item) => item.id === targetRecord.id), zone: "before" };
		}
		if (ratio > .74) {
			const siblings = currentTree.children(targetRecord.parentId).filter((item) => item.id !== dragId);
			return { parentId: targetRecord.parentId, index: siblings.findIndex((item) => item.id === targetRecord.id) + 1, zone: "after" };
		}
		return { parentId: targetRecord.id, index: currentTree.children(targetRecord.id).filter((item) => item.id !== dragId).length, zone: "inside" };
	};
	const beginEdit = (id) => { editingId = id; draftParentId = undefined; syncEditingControls(); draw(); };
	const beginChild = (id) => { draftParentId = id; editingId = null; collapsed.delete(id); syncEditingControls(); draw(); };
	const drawEditor = (item, depth, isDraft = false) => {
		const input = document.createElement("input"); input.value = isDraft ? "" : item.name; input.setAttribute("aria-label", t("aaalice.workspace.libraryUi.name", "Name"));
		const color = document.createElement("input"); color.type = "color"; color.value = item.color || "#7C3AED"; color.setAttribute("aria-label", t("aaalice.workspace.libraryUi.categoryColor", "Category color"));
		let saving = false; let saveAction; let cancelAction;
		const cancel = () => { if (!isDraft) focusId = item.id; editingId = null; draftParentId = undefined; syncEditingControls(); draw(); };
		const save = async () => {
			const name = input.value.trim(); if (!name || saving) return;
			saving = true; input.disabled = true; color.disabled = true; saveAction.disabled = true; cancelAction.disabled = true;
			try {
				if (isDraft) { await promptLibraryStore.createCategory({ name, parentId: draftParentId }); query = ""; search.value = ""; }
				else { await promptLibraryStore.updateCategory(item.id, { name, color: color.value }); focusId = item.id; }
				editingId = null; draftParentId = undefined; syncEditingControls(); if (isActive()) draw();
			}
			catch (error) { saving = false; input.disabled = false; color.disabled = false; saveAction.disabled = false; cancelAction.disabled = false; managerError(error); }
		};
		input.addEventListener("keydown", (event) => { if (event.isComposing) return; if (event.key === "Enter") void save(); else if (event.key === "Escape") cancel(); });
		const controls = [input];
		if (!isDraft) controls.push(color);
		saveAction = button({ label: t("aaalice.common.save", "Save"), iconName: "statusCheck", size: "sm", onClick: save });
		cancelAction = iconButton({ iconName: "close", label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: cancel });
		controls.push(saveAction, cancelAction);
		const row = el("div", { className: `aa-category-tree-editor${isDraft ? " is-draft" : ""}`, attrs: { role: "treeitem", "aria-level": String(depth + 1) }, children: controls });
		row.style.setProperty("--aa-category-depth", String(Math.min(depth, 6))); list.append(row); queueMicrotask(() => input.focus());
	};
	const draw = () => {
		const currentTree = tree(); const needle = query.trim().toLocaleLowerCase(); const visible = new Set();
		if (needle) {
			for (const record of currentTree.flat) if (record.category.name.toLocaleLowerCase().includes(needle)) visible.add(record.id);
			for (let index = currentTree.flat.length - 1; index >= 0; index -= 1) {
				const record = currentTree.flat[index];
				if (visible.has(record.id) && record.parentId) visible.add(record.parentId);
			}
		}
		setSummary(t("aaalice.workspace.libraryUi.categories", "Categories"), currentTree.flat.length);
		list.setAttribute("role", "tree"); list.setAttribute("aria-label", t("aaalice.workspace.libraryUi.categories", "Categories")); list.setAttribute("aria-description", t("aaalice.workspace.libraryUi.categoryKeyboardHint", "Use Alt plus arrow keys to reorder, indent, or promote the focused category.")); list.replaceChildren();
		if (!currentTree.flat.length && draftParentId === undefined) list.append(emptyState({ iconName: "layout", className: "aa-taxonomy-empty", title: t("aaalice.workspace.libraryUi.noCategories", "No categories yet"), description: t("aaalice.workspace.libraryUi.taxonomyEmptyHint", "Create one below to start organizing your prompt entries.") }));
		const hiddenByCollapse = new Set(); const rowById = new Map(); const draftParent = currentTree.record(draftParentId); let visibleRows = 0;
		const syncCollapsedRows = () => {
			const hidden = new Set();
			for (const record of currentTree.flat) {
				if (record.parentId && (hidden.has(record.parentId) || collapsed.has(record.parentId))) hidden.add(record.id);
				const row = rowById.get(record.id); if (row) row.hidden = hidden.has(record.id);
			}
			const visibleItems = [...rowById.values()].filter((row) => !row.hidden);
			if (!visibleItems.some((row) => row.dataset.categoryId === activeId)) activeId = visibleItems[0]?.dataset.categoryId || null;
			for (const row of rowById.values()) row.tabIndex = !row.hidden && row.dataset.categoryId === activeId ? 0 : -1;
		};
		for (const record of currentTree.flat) {
			if (!needle && record.parentId && (hiddenByCollapse.has(record.parentId) || collapsed.has(record.parentId))) hiddenByCollapse.add(record.id);
			const hidden = needle ? !visible.has(record.id) : hiddenByCollapse.has(record.id);
			if (editingId === record.id) { if (!hidden) { visibleRows += 1; drawEditor(record.category, record.depth); } continue; }
			const expanded = needle ? true : !collapsed.has(record.id);
			const toggleExpanded = () => {
				if (!record.hasChildren || controlsLocked() || needle) return;
				if (expanded) collapsed.add(record.id); else collapsed.delete(record.id);
				focusId = record.id;
				draw();
			};
			const row = applyCategoryColor(el("div", {
				className: `aa-category-tree-row${record.hasChildren ? " has-children" : ""}`,
				attrs: { role: "treeitem", tabindex: "0", "aria-level": String(record.depth + 1), ...(record.hasChildren ? { "aria-expanded": String(expanded) } : {}), title: record.pathLabel },
			}), record.category);
			row.dataset.categoryId = record.id; row.hidden = hidden; row.style.setProperty("--aa-category-depth", String(Math.min(record.depth, 6))); rowById.set(record.id, row); if (!hidden) visibleRows += 1;
			const toggle = iconButton({ iconName: "moveDown", label: expanded ? t("aaalice.workspace.libraryUi.collapseCategory", "Collapse category") : t("aaalice.workspace.libraryUi.expandCategory", "Expand category"), className: `aa-category-tree-row__toggle${expanded ? " is-expanded" : ""}`, variant: "ghost", disabled: !record.hasChildren || controlsLocked() || Boolean(needle), onClick: toggleExpanded });
			const handle = iconButton({ iconName: "move", label: t("aaalice.workspace.libraryUi.dragCategory", "Drag to move category"), className: "aa-category-tree-row__handle", variant: "ghost", disabled: controlsLocked() }); handle.draggable = !controlsLocked();
			handle.addEventListener("dragstart", (event) => { dragId = record.id; activeId = record.id; row.classList.add("is-dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", record.id); });
			handle.addEventListener("dragend", () => { dragId = null; list.classList.remove("is-root-drop-target"); clearExpandTimer(); draw(); });
			const actions = el("div", { className: "aa-category-tree-row__actions", children: [
				iconButton({ iconName: "add", label: `${t("aaalice.workspace.libraryUi.addSubcategory", "Add subcategory")} · ${record.pathLabel}`, variant: "ghost", disabled: controlsLocked(), onClick: () => beginChild(record.id) }),
				iconButton({ iconName: "settings", label: `${t("aaalice.workspace.libraryUi.editCategory", "Edit category")} · ${record.pathLabel}`, variant: "ghost", disabled: controlsLocked(), onClick: () => beginEdit(record.id) }),
				iconButton({ iconName: "delete", label: `${t("aaalice.common.delete", "Delete")} · ${record.pathLabel}`, variant: "ghost", disabled: controlsLocked(), onClick: () => categoryDeleteDialog(record.category, currentTree, async (deleteDescendants) => { await promptLibraryStore.deleteCategory(record.id, { deleteDescendants }); if (isActive()) draw(); }) }),
			] });
			row.append(toggle, handle, el("span", "aa-category-tree-row__swatch"), el("span", { className: "aa-category-tree-row__copy", children: [el("strong", null, record.category.name)] }), el("em", { className: "aa-category-tree-row__count", text: String(currentTree.aggregateCount.get(record.id) || 0) }), actions);
			row.addEventListener("focus", () => { activeId = record.id; for (const item of rowById.values()) item.tabIndex = item === row ? 0 : -1; });
			row.addEventListener("click", (event) => { if (!event.target.closest("button, input, select, textarea, a, [contenteditable='true']")) toggleExpanded(); });
			row.addEventListener("keydown", (event) => {
				if (!event.altKey && (event.key === "Enter" || event.key === " ") && record.hasChildren && !needle) { event.preventDefault(); toggleExpanded(); return; }
				keyboardMove(event, record, currentTree); keyboardNavigate(event, record, currentTree);
			});
			row.addEventListener("dragover", (event) => { const plan = dropPlan(event, record, currentTree); if (!plan) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; row.dataset.dropZone = plan.zone; if (plan.zone === "inside" && !needle && collapsed.has(record.id) && !expandTimer) expandTimer = setTimeout(() => { collapsed.delete(record.id); expandTimer = 0; row.setAttribute("aria-expanded", "true"); toggle.classList.add("is-expanded"); toggle.setAttribute("aria-label", t("aaalice.workspace.libraryUi.collapseCategory", "Collapse category")); syncCollapsedRows(); }, EXPAND_DELAY); else if (plan.zone !== "inside") clearExpandTimer(); });
			row.addEventListener("dragleave", (event) => { if (!row.contains(event.relatedTarget)) { delete row.dataset.dropZone; clearExpandTimer(); } });
			row.addEventListener("drop", (event) => { const plan = dropPlan(event, record, currentTree); if (!plan) return; event.preventDefault(); clearExpandTimer(); if (plan.zone === "inside") collapsed.delete(record.id); void move(dragId, plan.parentId, plan.index); dragId = null; });
			list.append(row);
			if (draftParent && record.start === draftParent.end - 1) drawEditor(draftParent.category, draftParent.depth + 1, true);
		}
		if (needle && visibleRows === 0) list.append(emptyState({ iconName: "search", className: "aa-taxonomy-empty", title: t("aaalice.workspace.libraryUi.noMatchingCategories", "No matching categories") }));
		const visibleItems = [...rowById.values()].filter((row) => !row.hidden);
		if (!visibleItems.some((row) => row.dataset.categoryId === activeId)) activeId = visibleItems[0]?.dataset.categoryId || null;
		for (const row of visibleItems) row.tabIndex = row.dataset.categoryId === activeId ? 0 : -1;
		restoreFocus();
	};
	const isListBackground = (event) => !event.target.closest?.(".aa-category-tree-row, .aa-category-tree-editor");
	const rootDrop = (event) => { if (!dragId) return; event.preventDefault(); list.classList.remove("is-root-drop-target"); const currentTree = tree(); void move(dragId, null, currentTree.children(null).filter((item) => item.id !== dragId).length); dragId = null; };
	list.addEventListener("dragover", (event) => { if (isListBackground(event) && dragId) { event.preventDefault(); list.classList.add("is-root-drop-target"); } else list.classList.remove("is-root-drop-target"); });
	list.addEventListener("dragleave", (event) => { if (!list.contains(event.relatedTarget)) list.classList.remove("is-root-drop-target"); });
	list.addEventListener("drop", (event) => { list.classList.remove("is-root-drop-target"); if (isListBackground(event)) rootDrop(event); });
	search = document.createElement("input"); search.type = "search"; search.placeholder = t("aaalice.workspace.libraryUi.searchCategories", "Search categories"); search.setAttribute("aria-label", search.placeholder);
	let searchComposing = false;
	const updateSearch = () => { query = search.value; syncEditingControls(); draw(); };
	search.addEventListener("compositionstart", () => { searchComposing = true; });
	search.addEventListener("compositionend", () => { searchComposing = false; updateSearch(); });
	search.addEventListener("input", () => { if (!searchComposing) updateSearch(); });
	expandAll = button({ label: t("aaalice.workspace.libraryUi.expandAll", "Expand all"), variant: "ghost", size: "sm", onClick: () => { collapsed.clear(); draw(); } });
	collapseAll = button({ label: t("aaalice.workspace.libraryUi.collapseAll", "Collapse all"), variant: "ghost", size: "sm", onClick: () => { collapsed.clear(); for (const record of tree().flat) if (record.hasChildren) collapsed.add(record.id); draw(); } });
	tools.replaceChildren(el("div", { className: "aa-category-tree-tools__search", children: [icon("search"), search] }), expandAll, collapseAll);
	const add = async () => { const name = footerInput.value.trim(); if (!name || footerAdd.disabled) return; footerAdd.disabled = true; try { await promptLibraryStore.createCategory({ name }); query = ""; search.value = ""; footerInput.value = ""; if (isActive()) { syncEditingControls(); draw(); footerInput.focus(); } } catch (error) { managerError(error); } finally { footerAdd.disabled = false; } };
	const cancelEdit = () => { if (!editingActive()) return; editingId = null; draftParentId = undefined; syncEditingControls(); };
	return { draw, add, cancelEdit, destroy: clearExpandTimer };
}

export function openTaxonomyManager() {
	let kind = "categories"; let dialog; let alive = true;
	const list = el("div", "aa-taxonomy-list"); const tools = el("div", "aa-category-tree-tools"); const summary = el("div", "aa-taxonomy-summary");
	const footerInput = document.createElement("input"); footerInput.type = "text";
	const footerAdd = button({ label: t("aaalice.workspace.libraryUi.add", "Add"), iconName: "add" });
	const setSummary = (label, count) => summary.replaceChildren(el("strong", null, label), badge(String(count), { className: "aa-taxonomy-count" }));
	const categories = categoryManager({ list, tools, footerInput, footerAdd, setSummary, isActive: () => alive && kind === "categories" });
	const collections = collectionManager({ list, footerInput, footerAdd, setSummary, isActive: () => alive && kind === "collections" });
	const draw = () => {
		tools.hidden = kind !== "categories";
		footerInput.placeholder = kind === "categories" ? t("aaalice.workspace.libraryUi.newCategory", "New root category") : t("aaalice.workspace.libraryUi.newCollection", "New favorite-folder name"); footerInput.setAttribute("aria-label", footerInput.placeholder);
		(kind === "categories" ? categories : collections).draw();
	};
	const add = () => (kind === "categories" ? categories : collections).add(); footerAdd.addEventListener("click", add); footerInput.addEventListener("keydown", (event) => { if (!event.isComposing && event.key === "Enter") { event.preventDefault(); void add(); } });
	const tabs = segmentedControl({ value: kind, ariaLabel: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), className: "aa-taxonomy-tabs", options: [
		{ value: "categories", label: t("aaalice.workspace.libraryUi.categories", "Categories"), iconName: "layout" },
		{ value: "collections", label: t("aaalice.workspace.libraryUi.collections", "Favorite folders"), iconName: "favorite" },
	], onChange: (value) => { categories.cancelEdit(); kind = value; draw(); } });
	const body = el("div", { className: "aa-taxonomy-manager", children: [tabs, summary, tools, list] });
	const footer = el("div", { className: "aa-taxonomy-footer", children: [footerInput, footerAdd, button({ label: t("aaalice.workspace.done", "Done"), variant: "secondary", onClick: () => dialog.close() })] });
	dialog = createDialog({ title: t("aaalice.workspace.libraryUi.manage", "Manage categories and favorite folders"), body, footer, size: "md", className: "aa-taxonomy-dialog", onClose: () => { alive = false; categories.destroy(); } }); draw();
}
