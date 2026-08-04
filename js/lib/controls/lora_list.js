/** Dashboard renderer for the stateful LoRA list exposed by LoraManager. */

import { el, icon, toggleSwitch } from "../ui.js";
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

function hasDifferentClipStrength(entry) {
	const strength = Number(entry?.strength);
	const clipStrength = Number(entry?.clipStrength);
	return Number.isFinite(strength) && Number.isFinite(clipStrength) && Math.abs(strength - clipStrength) > 0.001;
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
	const allToggle = toggleSwitch({ checked: false, label: "", disabled: true, className: "aa-control-lora-list__all-toggle", onChange: (next) => {
			const nextValue = current.map((entry) => ({ ...cloneEntry(entry), active: next }));
			renderList(nextValue);
			port.commit(nextValue);
		} });
	const allControl = el("div", { className: "aa-control-lora-list__all", children: [allCopy, allToggle] });
	const list = el("div", { className: "aa-control-lora-list__items", attrs: { role: "list" } });
	heading.append(title, summary);
	header.append(heading, allControl);
	root.append(header, list);

	function syncLabels() {
		labels.title = localized("title", "LoRA list");
		labels.activeSummary = localized("activeSummary", "{active}/{total} enabled");
		labels.enabled = localized("enabled", "Enabled");
		labels.disabled = localized("disabled", "Disabled");
		labels.enableAll = localized("enableAll", "Enable all");
		labels.disableAll = localized("disableAll", "Disable all");
		labels.toggle = localized("toggle", "Toggle {name}");
		labels.model = localized("model", "Model");
		labels.clip = localized("clip", "CLIP");
		labels.empty = localized("empty", "No LoRAs in this list.");
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

	function commitEntry(name, active) {
		const nextValue = current.map((entry, index) => entryName(entry, index) === name
			? { ...cloneEntry(entry), active }
			: cloneEntry(entry));
		renderList(nextValue);
		port.commit(nextValue);
	}

	function createRow(entry, index) {
		const name = entryName(entry, index);
		const row = el("div", { className: "aa-control-lora-list__row", attrs: { role: "listitem", "data-lora-name": name } });
		const copy = el("div", "aa-control-lora-list__copy");
		const nameElement = el("strong", "aa-control-lora-list__name");
		const meta = el("div", "aa-control-lora-list__meta");
		const status = el("span", "aa-control-lora-list__status");
		const toggle = toggleSwitch({ checked: false, label: "", className: "aa-control-lora-list__toggle", onChange: (next) => commitEntry(name, next) });
		copy.append(nameElement, meta);
		row.append(copy, el("div", { className: "aa-control-lora-list__actions", children: [status, toggle] }));
		row._sync = (next, nextIndex) => {
			const active = Boolean(next?.active);
			const nextName = entryName(next, nextIndex);
			const strength = formatStrength(next?.strength);
			const clip = hasDifferentClipStrength(next) ? ` · ${labels.clip || "CLIP"} ${formatStrength(next?.clipStrength)}` : "";
			nameElement.textContent = nextName;
			nameElement.title = nextName;
			meta.textContent = `${labels.model || "Model"} ${strength}${clip}`;
			status.textContent = active ? (labels.enabled || "Enabled") : (labels.disabled || "Disabled");
			status.dataset.state = active ? "enabled" : "disabled";
			toggle.setChecked(active);
			toggle.setLabel((labels.toggle || "Toggle {name}").replace("{name}", nextName));
			row.classList.toggle("is-active", active);
			row.classList.toggle("is-inactive", !active);
			row.dataset.active = String(active);
		};
		row._sync(entry, index);
		return row;
	}

	function renderList(nextValue) {
		current = cloneList(nextValue);
		const nextKeys = current.map(entryName);
		const sameShape = nextKeys.length === rowKeys.length && nextKeys.every((key, index) => key === rowKeys[index]);
		if (sameShape && rows.size === current.length) {
			for (let index = 0; index < current.length; index += 1) rows.get(nextKeys[index])?._sync(current[index], index);
		} else {
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

	renderList(current);
	ensureI18nReady().then(syncLabels);
	return controlView({
		root,
		kind: "lora-list",
		update: (next) => renderList(next?.value),
		destroy: () => { rows.clear(); list.replaceChildren(); },
	});
}
