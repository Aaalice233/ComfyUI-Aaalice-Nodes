/** Parameter-only Gallery projection: no controller, search, media, or global settings writes. */
import { t } from "../i18n.js";
import { defaultGalleryRatings, GALLERY_CATEGORIES } from "./booru_gallery_model.js";
import { el, field, listboxControl, multiSelectControl, toggleSwitch } from "./ui.js";

const label = (key, fallback) => t(`aaalice.gallery.${key}`, fallback);

export function createProfileGalleryEditor(resolved, draft, onError) {
	const root = el("div", "aa-profile-gallery-editor");
	let state = draft.getValue().state;
	const capabilities = resolved.options.getCapabilities();
	const cap = () => capabilities.find((item) => item.source === state.source);
	const commit = (mutate, resetPage = false) => {
		const payload = draft.getValue();
		try {
			if (payload.component && Object.hasOwn(payload.component, "searchOpen")) {
				payload.state.dashboard = { searchOpen: Boolean(payload.component.searchOpen) };
				delete payload.component;
			}
			mutate(payload.state);
			if (resetPage) payload.state.navigation.page = 1;
			draft.commit(payload);
		}
		catch (error) { onError(error); }
		update();
	};
	const query = el("input", { className: "aa-ui-input", attrs: { type: "text", "aria-label": label("search.placeholder", "Search tags"), "data-autocomplete-plus": "", "data-autocomplete-plus-mode": "raw-tag" } });
	query.value = state.query;
	query.addEventListener("change", (event) => { if (!event.isComposing) commit((next) => { next.query = query.value; next.filters.feed = "search"; next.filters.period = ""; }, true); });
	const source = listboxControl({ options: capabilities.map((item) => ({ value: item.source, label: item.displayName, iconName: "globe" })), value: state.source, ariaLabel: label("source", "Source"), onChange: (value) => commit((next) => {
		next.source = value; next.filters.ratings = defaultGalleryRatings(value);
		next.filters.sort = capabilities.find((item) => item.source === value)?.sortValues?.[0] || "latest";
		next.filters.feed = "search"; next.filters.period = "";
	}, true) });
	const collectionValue = () => state.filters.feed === "favorites" ? "favorites" : state.filters.feed === "ranking" ? `ranking:${state.filters.period}` : `sort:${state.filters.sort}`;
	const collection = listboxControl({ options: resolved.options.collectionOptions(state.source), value: collectionValue(), ariaLabel: label("collection.label", "Gallery collection"), onChange: (value) => commit((next) => {
		next.filters.feed = value === "favorites" ? "favorites" : value.startsWith("ranking:") ? "ranking" : "search";
		next.filters.period = value.startsWith("ranking:") ? value.slice(8) : "";
		if (value.startsWith("sort:")) next.filters.sort = value.slice(5);
	}, true) });
	const random = toggleSwitch({ checked: state.randomMode, label: label("random.off", "Random"), onChange: (value) => commit((next) => { next.randomMode = value; }, true) });
	const ratings = el("div", "aa-profile-gallery-editor__ratings");
	let ratingSource = null;
	let ratingControl = null;
	const renderRatings = () => {
		if (ratingSource === state.source) return;
		ratingSource = state.source;
		const values = cap()?.ratings || [];
		ratingControl = multiSelectControl({ options: values.map((value) => ({ value, label: label(`rating.${value}`, value) })), values: state.filters.ratings,
			ariaLabel: label("filter.title", "Filters"), onChange: (values) => commit((next) => { next.filters.ratings = values; }, true) });
		ratings.replaceChildren(ratingControl);
		ratings.hidden = !values.length;
	};
	const view = listboxControl({ options: ["browse", "selected"].map((value) => ({ value, label: label(`tab.${value}`, value) })), value: state.view, ariaLabel: label("tab.label", "Gallery view"), onChange: (value) => commit((next) => { next.view = value; }) });
	const selectionMode = listboxControl({ options: [{ value: "single", label: label("selectionMode.single", "Single") }, { value: "multi", label: label("selectionMode.multiple", "Multiple") }], value: state.selectionMode, ariaLabel: label("selectionMode.label", "Selection mode"), onChange: (value) => commit((next) => {
		next.selectionMode = value;
		if (value === "single" && next.selections.length > 1) throw new Error(t("aaalice.workspace.valueProfiles.editor.singleSelection", "Multiple saved images require multiple-selection mode."));
	}) });
	const page = el("input", { className: "aa-ui-input", attrs: { type: "number", min: "1", step: "1", "aria-label": label("page.input", "Page number") } });
	page.addEventListener("change", () => { const value = Number(page.value); if (Number.isInteger(value) && value > 0) commit((next) => { next.navigation.page = value; }); else update(); });
	const searchOpen = toggleSwitch({ checked: Boolean(state.dashboard?.searchOpen), label: t("aaalice.workspace.valueProfiles.editor.searchOpen", "Show search field"), onChange: (value) => commit((next) => { next.dashboard = { ...next.dashboard, searchOpen: value }; }) });
	const categories = multiSelectControl({ options: GALLERY_CATEGORIES.map((value) => ({ value, label: label(`category.${value}`, value), attrs: { "data-category": value } })), values: state.prompt.categories, ariaLabel: label("prompt.categories", "Categories"), onChange: (values) => commit((next) => { next.prompt.categories = values; }) });
	const underscores = toggleSwitch({ checked: state.prompt.replaceUnderscores, label: label("prompt.underscores", "Replace underscores with spaces"), onChange: (value) => commit((next) => { next.prompt.replaceUnderscores = value; }) });
	const parentheses = toggleSwitch({ checked: state.prompt.escapeParentheses, label: label("prompt.parentheses", "Escape parentheses"), onChange: (value) => commit((next) => { next.prompt.escapeParentheses = value; }) });
	const switchField = (text, control) => el("label", { className: "aa-profile-editor__switch", children: [el("span", null, text), control] });
	const advanced = el("details", { className: "aa-profile-editor__advanced", children: [el("summary", null, t("aaalice.workspace.valueProfiles.editor.more", "More parameters")),
		el("div", { className: "aa-profile-editor__fields", children: [field({ label: label("tab.label", "Gallery view"), control: view }), field({ label: label("selectionMode.label", "Selection mode"), control: selectionMode }), field({ label: label("page.input", "Page number"), control: page })] }),
		switchField(t("aaalice.workspace.valueProfiles.editor.searchOpen", "Show search field"), searchOpen), categories,
		switchField(label("prompt.underscores", "Replace underscores with spaces"), underscores), switchField(label("prompt.parentheses", "Escape parentheses"), parentheses),
	] });
	root.append(query, el("div", { className: "aa-profile-editor__fields", children: [source, collection] }), switchField(label("random.off", "Random"), random), ratings, advanced);
	function update() {
		state = draft.getValue().state;
		root.dataset.source = state.source;
		if (document.activeElement !== query) query.value = state.query;
		source.setValue(state.source); collection.setOptions(resolved.options.collectionOptions(state.source), collectionValue());
		random.setChecked(state.randomMode); view.setValue(state.view); selectionMode.setValue(state.selectionMode); page.value = String(state.navigation.page); page.disabled = state.randomMode;
		renderRatings();
		ratingControl?.setValues(state.filters.ratings); categories.setValues(state.prompt.categories);
		underscores.setChecked(state.prompt.replaceUnderscores); parentheses.setChecked(state.prompt.escapeParentheses); searchOpen.setChecked(Boolean(state.dashboard?.searchOpen));
	}
	update();
	return { root, update, destroy() {} };
}
