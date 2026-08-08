/** Single-select picker with a fuzzy filter box, for long candidate lists in workspace dialogs. */

import { matchesDashboardSearch } from "./dashboard_search.js";
import { el, icon } from "./ui.js";

function optionSearchText(option) {
	return [option.label, option.description].filter(Boolean).join(" ");
}

/**
 * options: [{ value, label, description?, badge?, badgeTone?: "warning"|"danger"|null, disabled? }]
 * onChange(value) fires on selection; onConfirm(value) fires on Enter/double-click commit.
 * initialQuery 恢复上一次搜索词，onSearchChange(query) 在查询变化时回调，供宿主在重建后保持搜索状态。
 * Exposes value, setValue, setOptions, setDisabled, focusSearch.
 */
export function createSearchableSelect({ options = [], value = "", ariaLabel = "", searchPlaceholder = "", emptyLabel = "", disabled = false, initialQuery = "", onSearchChange = null, onChange = null, onConfirm = null } = {}) {
	let currentOptions = [];
	let currentValue = "";
	let query = "";
	let activeValue = null;
	let isDisabled = Boolean(disabled);

	const input = document.createElement("input");
	input.className = "aa-ui-input aa-ui-search-input";
	input.type = "search";
	input.placeholder = searchPlaceholder;
	input.setAttribute("aria-label", ariaLabel || searchPlaceholder);
	input.autocomplete = "off";
	input.spellcheck = false;

	const searchRow = el("div", { className: "aa-searchable-select__search", children: [icon("search", { className: "aa-searchable-select__search-icon" }), input] });
	const list = el("div", { className: "aa-searchable-select__list", attrs: { role: "listbox", "aria-label": ariaLabel } });
	const root = el("div", { className: "aa-searchable-select", children: [searchRow, list] });

	const filteredOptions = () => currentOptions.filter((option) => matchesDashboardSearch(optionSearchText(option), query));

	const ensureActive = (visible) => {
		if (activeValue != null && visible.some((option) => String(option.value) === activeValue && !option.disabled)) return;
		const selected = visible.find((option) => String(option.value) === currentValue && !option.disabled);
		activeValue = selected ? String(selected.value) : (visible.find((option) => !option.disabled)?.value != null ? String(visible.find((option) => !option.disabled).value) : null);
	};

	const scrollActiveIntoView = () => {
		if (activeValue == null) return;
		list.querySelector(`[data-value="${CSS.escape(activeValue)}"].is-active`)?.scrollIntoView({ block: "nearest" });
	};
	const scrollSelectedIntoView = () => {
		list.querySelector(`[data-value="${CSS.escape(currentValue)}"].is-selected`)?.scrollIntoView({ block: "nearest" });
	};

	const select = (option, { confirm = false } = {}) => {
		if (!option || option.disabled || isDisabled) return;
		currentValue = String(option.value);
		activeValue = currentValue;
		syncRows();
		if (confirm) onConfirm?.(currentValue);
		else onChange?.(currentValue);
	};

	const moveActive = (delta) => {
		const visible = filteredOptions().filter((option) => !option.disabled);
		if (!visible.length) return;
		const index = visible.findIndex((option) => String(option.value) === activeValue);
		const next = visible[(index < 0 ? 0 : index + delta + visible.length) % visible.length];
		activeValue = String(next.value);
		syncRows();
		scrollActiveIntoView();
	};

	function syncRows() {
		const visible = filteredOptions();
		for (const row of list.children) {
			if (!row.dataset || row.dataset.value === undefined) continue;
			row.classList.toggle("is-selected", row.dataset.value === currentValue);
			row.classList.toggle("is-active", row.dataset.value === activeValue);
			row.setAttribute("aria-selected", String(row.dataset.value === currentValue));
		}
		if (!visible.length && !list.querySelector(".aa-searchable-select__empty")) list.append(el("div", { className: "aa-searchable-select__empty", text: emptyLabel }));
	}

	const rebuild = () => {
		list.replaceChildren();
		const visible = filteredOptions();
		ensureActive(visible);
		for (const option of visible) {
			const valueKey = String(option.value);
			const row = el("div", {
				className: `aa-searchable-select__option${option.disabled ? " is-disabled" : ""}`,
				attrs: { role: "option", "data-value": valueKey, "aria-selected": String(valueKey === currentValue), "aria-disabled": option.disabled ? "true" : null, tabindex: "-1" },
				children: [
					el("div", { className: "aa-searchable-select__option-copy", children: [
						el("strong", null, option.label),
						option.description ? el("small", null, option.description) : null,
					].filter(Boolean) }),
					option.badge ? el("span", { className: `aa-searchable-select__option-badge${option.badgeTone ? ` is-${option.badgeTone}` : ""}`, text: option.badge }) : null,
				].filter(Boolean),
			});
			row.classList.toggle("is-selected", valueKey === currentValue);
			row.classList.toggle("is-active", valueKey === activeValue);
			row.addEventListener("click", () => select(option));
			row.addEventListener("dblclick", () => select(option, { confirm: true }));
			row.addEventListener("pointermove", () => {
				if (option.disabled || activeValue === valueKey) return;
				activeValue = valueKey;
				syncRows();
			});
			list.append(row);
		}
		if (!visible.length) list.append(el("div", { className: "aa-searchable-select__empty", text: emptyLabel }));
		scrollSelectedIntoView();
	};

	const setQuery = (next) => {
		query = String(next || "");
		if (input.value !== query) input.value = query;
		rebuild();
		onSearchChange?.(query);
	};

	input.addEventListener("input", () => setQuery(input.value));
	input.addEventListener("keydown", (event) => {
		if (event.isComposing || event.keyCode === 229) return;
		if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
		else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
		else if (event.key === "Enter") {
			event.preventDefault();
			const option = filteredOptions().find((candidate) => String(candidate.value) === activeValue);
			if (option) select(option, { confirm: true });
		}
	});
	list.addEventListener("keydown", (event) => {
		if (event.isComposing || event.keyCode === 229) return;
		if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
		else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
		else if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			const option = filteredOptions().find((candidate) => String(candidate.value) === activeValue);
			if (option) select(option, { confirm: event.key === "Enter" });
		}
	});

	const setDisabled = (next) => {
		isDisabled = Boolean(next);
		root.classList.toggle("is-disabled", isDisabled);
		input.disabled = isDisabled;
	};

	root.setOptions = (nextOptions, nextValue = currentValue) => {
		currentOptions = Array.isArray(nextOptions) ? nextOptions : [];
		currentValue = nextValue != null ? String(nextValue) : "";
		activeValue = null;
		rebuild();
	};
	root.setValue = (next) => { currentValue = String(next); activeValue = null; rebuild(); };
	// 初始重建发生在对话框挂载之前，rebuild 内的滚动是 no-op；挂载完成后由调用方显式补一次居中定位。
	root.revealSelected = () => {
		const selected = list.querySelector(`[data-value="${CSS.escape(currentValue)}"].is-selected`);
		if (selected) selected.scrollIntoView({ block: "center" });
		else scrollActiveIntoView();
	};
	root.setDisabled = setDisabled;
	root.focusSearch = () => input.focus();
	Object.defineProperty(root, "value", { get: () => currentValue });

	setDisabled(isDisabled);
	root.setOptions(options, value);
	if (initialQuery) setQuery(initialQuery);
	return root;
}
