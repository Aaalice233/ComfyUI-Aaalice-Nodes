/** Shared append-only tag-list control renderer. */

import { normalizeTagListValue, parseTagListValue, tagToneIndexes } from "../taglist_value.js";
import { el, icon, iconButton } from "../ui.js";
import { controlView } from "./contract.js";

function actionLabel(template, text) { return String(template).replaceAll("{tag}", text); }

export function createTagListControl({ value = [], onChange = null, ariaLabel = "", labels = {} } = {}) {
	let entries = normalizeTagListValue(value); let draggedIndex = null;
	const root = el("div", { className: "aa-control aa-taglist-control", attrs: { role: "group", "aria-label": ariaLabel } });
	const list = el("div", { className: "aa-taglist-options", attrs: { role: "list" } });
	const input = document.createElement("input");
	input.type = "text"; input.className = "aa-taglist-input"; input.autocomplete = "off"; input.spellcheck = false;
	// Autocomplete-Plus 的外部输入 opt-in：装了补全扩展即自动接入，未安装时属性完全惰性。
	input.setAttribute("data-autocomplete-plus", "");
	input.setAttribute("aria-label", labels.input || labels.placeholder || "Add tags");
	const revealInput = () => { root.scrollLeft = root.scrollWidth; root.scrollTop = root.scrollHeight; };
	input.addEventListener("focus", revealInput);
	root.addEventListener("wheel", (event) => { if (root.scrollWidth <= root.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; event.preventDefault(); root.scrollLeft += event.deltaY; }, { passive: false });
	const emit = () => onChange?.(entries.map((entry) => ({ ...entry })));
	const render = () => {
		list.replaceChildren(); const tones = tagToneIndexes(entries);
		input.placeholder = entries.length ? (labels.append || "+ Add tag") : (labels.placeholder || labels.empty || "Enter tags and press Enter");
		entries.forEach((entry, index) => {
			const chip = el("div", { className: "aa-taglist-chip", attrs: { role: "listitem", draggable: "true", "data-index": String(index), "data-control-tone": String(tones.get(entry.text)) } });
			const status = el("span", { className: "aa-taglist-chip-status", attrs: { "aria-hidden": "true" }, children: [icon("statusCheck")] });
			const toggle = el("button", { className: "aa-taglist-chip-toggle", attrs: { type: "button" }, children: [status, el("span", "aa-taglist-chip-label", entry.text)] });
			const remove = iconButton({ iconName: "close", label: actionLabel(labels.remove || "Remove {tag}", entry.text), variant: "ghost", className: "aa-taglist-chip-remove" });
			const sync = () => {
				chip.classList.toggle("is-selected", entry.enabled); chip.classList.toggle("is-disabled", !entry.enabled);
				toggle.setAttribute("aria-pressed", String(entry.enabled));
				toggle.setAttribute("aria-label", actionLabel(entry.enabled ? (labels.disable || "Disable {tag}") : (labels.enable || "Enable {tag}"), entry.text));
			};
			toggle.addEventListener("click", () => { entry.enabled = !entry.enabled; sync(); emit(); });
			remove.addEventListener("click", (event) => { event.stopPropagation(); entries.splice(index, 1); render(); emit(); input.focus(); revealInput(); });
			chip.addEventListener("dragstart", (event) => { draggedIndex = index; chip.classList.add("is-dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); });
			chip.addEventListener("dragend", () => { draggedIndex = null; chip.classList.remove("is-dragging"); for (const target of list.querySelectorAll(".is-drop-before, .is-drop-after")) target.classList.remove("is-drop-before", "is-drop-after"); });
			chip.addEventListener("dragover", (event) => { if (draggedIndex === null || draggedIndex === index) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; const rect = chip.getBoundingClientRect(); const after = event.clientX > rect.left + rect.width / 2; chip.classList.toggle("is-drop-before", !after); chip.classList.toggle("is-drop-after", after); });
			chip.addEventListener("dragleave", () => chip.classList.remove("is-drop-before", "is-drop-after"));
			chip.addEventListener("drop", (event) => {
				event.preventDefault(); if (draggedIndex === null || draggedIndex === index) return;
				const rect = chip.getBoundingClientRect(); const after = event.clientX > rect.left + rect.width / 2;
				const [moved] = entries.splice(draggedIndex, 1); let targetIndex = index + (after ? 1 : 0); if (draggedIndex < targetIndex) targetIndex -= 1;
				entries.splice(targetIndex, 0, moved); draggedIndex = null; render(); emit();
			});
			chip.append(toggle, remove); sync(); list.append(chip);
		});
	};
	input.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		// 补全候选面板打开时，Enter 让给自动补全确认候选。
		if (input.hasAttribute("data-autocomplete-plus-open")) return;
		event.preventDefault(); const known = new Set(entries.map((entry) => entry.text)); const additions = [];
		for (const text of parseTagListValue(input.value)) { if (!known.has(text)) { known.add(text); additions.push(text); } }
		if (!additions.length) return; for (const text of additions) entries.push({ text, enabled: true }); input.value = ""; render(); emit(); revealInput();
	});
	root.value = () => entries.map((entry) => ({ ...entry })); root.setValue = (next) => { entries = normalizeTagListValue(next); render(); };
	root.addEventListener("pointerdown", (event) => { if (event.target === root) requestAnimationFrame(() => input.focus()); });
	root.append(list, input); render(); return root;
}

export function renderTagListControl(spec, port) {
	const root = createTagListControl({ value: spec.value, ariaLabel: spec.label, labels: spec.labels, onChange: (next) => port.commit(next, { redraw: false }) });
	return controlView({ root, kind: "taglist", update: (next) => root.setValue(next.value) });
}
