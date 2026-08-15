/** Dashboard renderer for the stateful LoRA list exposed by LoraManager. */

import { bindAsyncImagePreview } from "../image_preview.js";
import { copyLoraNotes, copyLoraTriggerWords, openLoraCivitai, openLoraManager, saveLoraRecipe } from "../lora_actions.js";
import { createContextMenu } from "../ui.js";
import { el, icon, iconButton, toggleSwitch } from "../ui.js";
import { ensureI18nReady, t } from "../../i18n.js";
import { controlView } from "./contract.js";

function cloneEntry(entry) {
	return entry && typeof entry === "object" ? { ...entry } : { name: String(entry ?? "") };
}

function cloneList(value) {
	return Array.isArray(value) ? value.map(cloneEntry) : [];
}

function entryName(entry, index) {
	const name = String(entry?.name || "").trim();
	return name || `LoRA ${index + 1}`;
}

function formatStrength(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value ?? "");
}

function normalizedStrength(value, fallback = 1) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.max(-10, Math.min(10, Math.round(numeric * 100) / 100));
}

function localized(key, fallback) {
	return t(`aaalice.loraList.${key}`, fallback);
}

function replaceCount(template, active, total) {
	return template.replace("{active}", String(active)).replace("{total}", String(total));
}

export function renderLoraListControl(spec, port) {
	let current = cloneList(spec.value);
	let rowKeys = [];
	let rows = new Map();
	let draggedName = "";
	const labels = {};
	const root = el("div", {
		className: "aa-control aa-control-lora-list",
		attrs: { role: "group", tabIndex: 0, "data-capture-wheel": "true" },
	});
	const header = el("div", { className: "aa-control-lora-list__header" });
	const heading = el("div", { className: "aa-control-lora-list__heading", children: [icon("list")] });
	const title = el("strong", "aa-control-lora-list__title");
	const summary = el("span", "aa-control-lora-list__summary");
	const allCopy = el("span", "aa-control-lora-list__all-copy");
	const allToggle = toggleSwitch({ checked: false, label: "", disabled: true, className: "aa-control-lora-list__all-toggle", onChange: (next) => setAllActive(next) });
	const allControl = el("div", { className: "aa-control-lora-list__all", children: [allCopy, allToggle] });
	const list = el("div", { className: "aa-control-lora-list__items", attrs: { role: "list" } });
	heading.append(title, summary);
	header.append(heading, allControl);
	root.append(header, list);

	function syncLabels() {
		labels.title = localized("title", "LoRA list");
		labels.activeSummary = localized("activeSummary", "{active}/{total} enabled");
		labels.enableAll = localized("enableAll", "Enable all");
		labels.disableAll = localized("disableAll", "Disable all");
		labels.toggle = localized("toggle", "Toggle {name}");
		labels.model = localized("model", "Model");
		labels.empty = localized("empty", "No LoRAs in this list.");
		labels.previewLoading = localized("previewLoading", "Loading preview…");
		labels.previewUnavailable = localized("previewUnavailable", "Preview unavailable");
		labels.menu = localized("menu", "LoRA actions");
		labels.add = localized("add", "Add LoRA");
		labels.viewOnCivitai = localized("viewOnCivitai", "View on Civitai");
		labels.delete = localized("delete", "Delete");
		labels.clearAll = localized("clearAll", "Clear list");
		labels.moveUp = localized("moveUp", "Move up");
		labels.moveDown = localized("moveDown", "Move down");
		labels.moveTop = localized("moveTop", "Move to top");
		labels.moveBottom = localized("moveBottom", "Move to bottom");
		labels.copyNotes = localized("copyNotes", "Copy notes");
		labels.copyTriggerWords = localized("copyTriggerWords", "Copy trigger words");
		labels.saveRecipe = localized("saveRecipe", "Save recipe");
		labels.reorder = localized("reorder", "Reorder {name}");
		labels.decrease = localized("decrease", "Decrease {kind} strength for {name}");
		labels.increase = localized("increase", "Increase {kind} strength for {name}");
		labels.modelStrength = localized("modelStrength", "Model strength for {name}");
		title.textContent = labels.title;
		root.setAttribute("aria-label", labels.title);
		list.setAttribute("aria-label", labels.title);
		list.querySelector(".aa-control-lora-list__empty")?.replaceChildren(document.createTextNode(labels.empty));
		for (let index = 0; index < current.length; index += 1) rows.get(entryName(current[index], index))?._sync(current[index], index);
		syncHeader();
	}

	function syncHeader() {
		const activeCount = current.filter((entry) => Boolean(entry?.active)).length;
		const total = current.length;
		const allActive = total > 0 && activeCount === total;
		summary.textContent = replaceCount(labels.activeSummary || "{active}/{total} enabled", activeCount, total);
		allCopy.textContent = allActive ? (labels.disableAll || "Disable all") : (labels.enableAll || "Enable all");
		allToggle.setChecked(allActive);
		allToggle.setDisabled(total === 0);
		allToggle.setLabel(allCopy.textContent);
	}

	function commitList(nextValue) {
		renderList(nextValue);
		port.commit(nextValue);
	}

	function setAllActive(active) {
		const nextValue = current.map((entry) => ({ ...cloneEntry(entry), active }));
		commitList(nextValue);
	}

	function commitEntry(name, active) {
		const nextValue = current.map((entry, index) => entryName(entry, index) === name
			? { ...cloneEntry(entry), active }
			: cloneEntry(entry));
		commitList(nextValue);
	}

	function deleteEntry(name) {
		commitList(current.filter((entry, index) => entryName(entry, index) !== name));
	}

	function clearList() {
		if (current.length) commitList([]);
	}

	function updateEntry(name, updater) {
		const index = current.findIndex((entry, entryIndex) => entryName(entry, entryIndex) === name);
		if (index < 0) return;
		const nextValue = current.map(cloneEntry);
		updater(nextValue[index]);
		commitList(nextValue);
	}

	function commitStrength(name, rawValue) {
		const numeric = Number(rawValue);
		if (!Number.isFinite(numeric)) return;
		updateEntry(name, (entry) => {
			entry.strength = normalizedStrength(numeric);
			// The compact control exposes one strength; keep legacy CLIP values in sync.
			entry.clipStrength = entry.strength;
		});
	}

	function nudgeStrength(name, delta) {
		const entry = current.find((item, index) => entryName(item, index) === name);
		if (!entry) return;
		commitStrength(name, normalizedStrength(entry.strength) + delta);
	}

	function reorderEntry(name, targetIndex) {
		const sourceIndex = current.findIndex((entry, index) => entryName(entry, index) === name);
		if (sourceIndex < 0) return;
		const boundedTarget = Math.max(0, Math.min(current.length - 1, targetIndex));
		if (sourceIndex === boundedTarget) return;
		const nextValue = current.map(cloneEntry);
		const [entry] = nextValue.splice(sourceIndex, 1);
		nextValue.splice(boundedTarget, 0, entry);
		commitList(nextValue);
	}

	function clearDragState() {
		draggedName = "";
		list.querySelectorAll(".is-drag-over").forEach((row) => row.classList.remove("is-drag-over"));
	}

	function openActions(name, x, y, ownerElement) {
		const index = current.findIndex((entry, entryIndex) => entryName(entry, entryIndex) === name);
		if (index < 0) return;
		createContextMenu({
			x, y, ownerElement, ariaLabel: `${name} · ${labels.menu || "LoRA actions"}`,
			items: [
				{ label: labels.add, iconName: "add", onSelect: openLoraManager },
				{ label: labels.clearAll, iconName: "delete", danger: true, onSelect: clearList },
				{ separator: true },
				{ label: labels.viewOnCivitai, iconName: "globe", onSelect: () => openLoraCivitai(name) },
				{ label: labels.delete, iconName: "delete", danger: true, onSelect: () => deleteEntry(name) },
				{ separator: true },
				{ label: labels.moveUp, iconName: "moveUp", disabled: index === 0, onSelect: () => reorderEntry(name, index - 1) },
				{ label: labels.moveDown, iconName: "moveDown", disabled: index === current.length - 1, onSelect: () => reorderEntry(name, index + 1) },
				{ label: labels.moveTop, iconName: "moveToTop", disabled: index === 0, onSelect: () => reorderEntry(name, 0) },
				{ label: labels.moveBottom, iconName: "moveToBottom", disabled: index === current.length - 1, onSelect: () => reorderEntry(name, current.length - 1) },
				{ separator: true },
				{ label: labels.copyNotes, iconName: "fileText", onSelect: () => copyLoraNotes(name) },
				{ label: labels.copyTriggerWords, iconName: "tag", onSelect: () => copyLoraTriggerWords(name) },
				{ separator: true },
				{ label: labels.saveRecipe, iconName: "save", onSelect: saveLoraRecipe },
			],
		});
	}

	function openListActions(x, y) {
		const allActive = current.length > 0 && current.every((entry) => Boolean(entry?.active));
		createContextMenu({
			x, y, ownerElement: root, ariaLabel: labels.menu || "LoRA actions",
			items: [
				{ label: labels.add, iconName: "add", onSelect: openLoraManager },
				{ label: allActive ? labels.disableAll : labels.enableAll, iconName: "statusCheck", disabled: current.length === 0, onSelect: () => setAllActive(!allActive) },
				{ separator: true },
				{ label: labels.clearAll, iconName: "delete", danger: true, disabled: current.length === 0, onSelect: clearList },
			],
		});
	}

	root.addEventListener("contextmenu", (event) => {
		if (event.target.closest?.("input, textarea, select, [contenteditable=\"true\"]")) return;
		event.preventDefault();
		event.stopPropagation();
		const row = event.target.closest?.(".aa-control-lora-list__row");
		if (row?.dataset.loraName) openActions(row.dataset.loraName, event.clientX, event.clientY, row);
		else openListActions(event.clientX, event.clientY);
	});
	root.addEventListener("keydown", (event) => {
		if (event.defaultPrevented || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
		if (event.target.closest?.("input, textarea, select, [contenteditable=\"true\"]")) return;
		event.preventDefault();
		const rect = root.getBoundingClientRect();
		openListActions(rect.left + 12, rect.top + 12);
	});

	function createRow(entry, index) {
		const name = entryName(entry, index);
		const row = el("div", { className: "aa-control-lora-list__row", attrs: { role: "listitem", "data-lora-name": name } });
		const previewResolver = spec.options?.previewResolver;
		let previewName = name;
		const grip = iconButton({ iconName: "drag", label: "", variant: "ghost", className: "aa-control-lora-list__grip" });
		const copy = el("div", { className: "aa-control-lora-list__copy", attrs: { tabIndex: 0, role: "button" } });
		const disposePreview = typeof previewResolver === "function" ? bindAsyncImagePreview(copy, () => previewResolver(previewName), {
			title: () => previewName,
			loadingHint: () => labels.previewLoading || "Loading preview…",
			unavailableHint: () => labels.previewUnavailable || "Preview unavailable",
			className: "aa-lora-preview-tooltip",
		}) : () => {};
		const nameElement = el("strong", "aa-control-lora-list__name");
		const modelInput = el("input", { className: "aa-control-lora-list__strength-input", attrs: { type: "text", inputMode: "decimal", spellcheck: false } });
		const modelDecrease = iconButton({ iconName: "subtract", label: "", variant: "ghost", className: "aa-control-lora-list__strength-step" });
		const modelIncrease = iconButton({ iconName: "add", label: "", variant: "ghost", className: "aa-control-lora-list__strength-step" });
		const modelStrength = el("div", { className: "aa-control-lora-list__strength", children: [modelDecrease, modelInput, modelIncrease] });
		const toggle = toggleSwitch({ checked: false, label: "", className: "aa-control-lora-list__toggle", onChange: (next) => commitEntry(name, next) });
		copy.append(nameElement);
		row.append(grip, copy, modelStrength, toggle);

		grip.draggable = true;
		grip.addEventListener("dragstart", (event) => {
			draggedName = name;
			row.classList.add("is-dragging");
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", name);
			}
		});
		grip.addEventListener("dragend", () => { row.classList.remove("is-dragging"); clearDragState(); });
		grip.addEventListener("keydown", (event) => {
			const currentIndex = current.findIndex((item, itemIndex) => entryName(item, itemIndex) === name);
			if (currentIndex < 0 || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
			event.preventDefault();
			const target = event.key === "Home" ? 0 : event.key === "End" ? current.length - 1 : currentIndex + (event.key === "ArrowUp" ? -1 : 1);
			reorderEntry(name, target);
			requestAnimationFrame(() => rows.get(name)?.querySelector(".aa-control-lora-list__grip")?.focus());
		});
		const bindStrengthInput = (input) => {
			input.addEventListener("change", () => commitStrength(name, input.value));
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter") { event.preventDefault(); input.blur(); return; }
				if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
				event.preventDefault();
				nudgeStrength(name, event.key === "ArrowUp" ? 0.01 : -0.01);
			});
		};
		bindStrengthInput(modelInput);
		modelDecrease.addEventListener("click", (event) => { nudgeStrength(name, -0.01); event.stopPropagation(); });
		modelIncrease.addEventListener("click", (event) => { nudgeStrength(name, 0.01); event.stopPropagation(); });
		copy.addEventListener("keydown", (event) => {
			if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
			event.preventDefault();
			const rect = copy.getBoundingClientRect();
			openActions(name, rect.right, rect.bottom, row);
		});

		row.addEventListener("dragover", (event) => {
			if (!draggedName || draggedName === name) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			row.classList.add("is-drag-over");
		});
		row.addEventListener("dragleave", (event) => {
			if (!row.contains(event.relatedTarget)) row.classList.remove("is-drag-over");
		});
		row.addEventListener("drop", (event) => {
			if (!draggedName || draggedName === name) return;
			event.preventDefault();
			const targetIndex = current.findIndex((item, itemIndex) => entryName(item, itemIndex) === name);
			const sourceIndex = current.findIndex((item, itemIndex) => entryName(item, itemIndex) === draggedName);
			const insertAfter = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
			const adjustedTarget = targetIndex + (insertAfter ? 1 : 0) - (sourceIndex < targetIndex ? 1 : 0);
			const sourceName = draggedName;
			clearDragState();
			reorderEntry(sourceName, adjustedTarget);
		});

		row._sync = (next, nextIndex) => {
			const active = Boolean(next?.active);
			const nextName = entryName(next, nextIndex);
			const strength = formatStrength(next?.strength);
			previewName = nextName;
			row.dataset.loraName = nextName;
			row.dataset.position = String(nextIndex + 1);
			copy.setAttribute("aria-label", nextName);
			copy.classList.toggle("has-preview", typeof previewResolver === "function");
			nameElement.textContent = nextName;
			nameElement.title = nextName;
			modelInput.value = strength;
			modelInput.setAttribute("aria-label", (labels.modelStrength || "Model strength for {name}").replace("{name}", nextName));
			modelDecrease.setAttribute("aria-label", (labels.decrease || "Decrease {kind} strength for {name}").replace("{kind}", labels.model || "Model").replace("{name}", nextName));
			modelIncrease.setAttribute("aria-label", (labels.increase || "Increase {kind} strength for {name}").replace("{kind}", labels.model || "Model").replace("{name}", nextName));
			grip.setAttribute("aria-label", (labels.reorder || "Reorder {name}").replace("{name}", nextName));
			toggle.setChecked(active);
			toggle.setLabel((labels.toggle || "Toggle {name}").replace("{name}", nextName));
			row.classList.toggle("is-active", active);
			row.classList.toggle("is-inactive", !active);
			row.dataset.active = String(active);
		};
		row._dispose = disposePreview;
		row._sync(entry, index);
		return row;
	}

	function renderList(nextValue) {
		current = cloneList(nextValue);
		list.classList.toggle("is-empty", current.length === 0);
		const nextKeys = current.map(entryName);
		const sameShape = nextKeys.length === rowKeys.length && nextKeys.every((key, index) => key === rowKeys[index]);
		const emptyStateMounted = current.length > 0 || Boolean(list.querySelector(".aa-control-lora-list__empty"));
		if (sameShape && rows.size === current.length && emptyStateMounted) {
			for (let index = 0; index < current.length; index += 1) rows.get(nextKeys[index])?._sync(current[index], index);
		} else {
			for (const row of rows.values()) row._dispose?.();
			rowKeys = nextKeys;
			rows = new Map();
			list.replaceChildren();
			if (current.length === 0) {
				list.append(el("div", { className: "aa-control-lora-list__empty", text: labels.empty || "No LoRAs in this list." }));
			} else {
				for (let index = 0; index < current.length; index += 1) {
					const row = createRow(current[index], index);
					rows.set(nextKeys[index], row);
					list.append(row);
				}
			}
		}
		syncHeader();
	}

	syncLabels();
	renderList(current);
	ensureI18nReady().then(syncLabels);
	return controlView({
		root,
		kind: "lora-list",
		update: (next) => renderList(next?.value),
		destroy: () => {
			for (const row of rows.values()) row._dispose?.();
			rows.clear();
			list.replaceChildren();
		},
	});
}
