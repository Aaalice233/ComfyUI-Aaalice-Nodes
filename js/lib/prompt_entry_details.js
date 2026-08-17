/** Shared delayed details tooltip for prompt-library entry rows. */

import { t } from "../i18n.js";
import { applyCategoryColor } from "./category_color.js";
import { collectionDisplayName } from "./collection.js";
import { promptLibraryStore } from "./library_store.js";
import { createTooltip, el } from "./ui.js";

const PROMPT_DETAILS_HOVER_DELAY = 600;
const promptDetailsTooltip = createTooltip({ delay: PROMPT_DETAILS_HOVER_DELAY, closeDelay: 100 });

function defaultFavoritesLabel() {
	return t("aaalice.workspace.libraryUi.defaultFavorites", "Default favorites");
}

function detailGroup(label, values) {
	if (!values.length) return null;
	return el("div", { className: "aa-prompt-entry-details-group", children: [
		el("span", null, label), el("div", { children: values.map((value) => el("em", null, value)) }),
	] });
}

function detailsContent(entry) {
	const category = promptLibraryStore.category(entry.categoryId);
	const collections = promptLibraryStore.collectionItems(entry.collections || [])
		.map((collection) => collectionDisplayName(collection, defaultFavoritesLabel()));
	const tags = promptLibraryStore.tagNames(entry.tagIds || []);
	return el("article", { className: "aa-prompt-entry-details", children: [
		el("header", { children: [el("strong", null, entry.title), ...(category ? [applyCategoryColor(el("span", null, promptLibraryStore.categoryPath(category.id)), category)] : [])] }),
		el("section", { className: "aa-prompt-entry-details-prompt", children: [
			el("span", null, t("aaalice.workspace.libraryUi.prompt", "Prompt")), el("p", null, entry.text),
		] }),
		...([detailGroup(t("aaalice.workspace.libraryUi.collections", "Favorite folders"), collections), detailGroup(t("aaalice.workspace.libraryUi.tags", "Tags"), tags)].filter(Boolean)),
		...(entry.note ? [el("section", { className: "aa-prompt-entry-details-note", children: [
			el("span", null, t("aaalice.workspace.libraryUi.note", "Note")), el("p", null, entry.note),
		] })] : []),
	] });
}

export function bindPromptEntryDetails(trigger, entry) {
	const show = (immediate) => {
		if (promptDetailsTooltip.isOpenFor(trigger)) {
			promptDetailsTooltip.cancelScheduledHide();
			return;
		}
		promptDetailsTooltip.show(trigger, () => detailsContent(entry), {
			className: "aa-prompt-entry-details-tooltip",
			contentMode: "dom",
			immediate,
		});
	};
	trigger.addEventListener("mouseenter", () => show(false));
	trigger.addEventListener("mouseleave", promptDetailsTooltip.scheduleHide);
	trigger.addEventListener("focusin", () => show(true));
	trigger.addEventListener("focusout", promptDetailsTooltip.scheduleHide);
}

export function closePromptEntryDetails() {
	promptDetailsTooltip.hide();
}

export function closePromptEntryDetailsWithin(container) {
	if (promptDetailsTooltip.isAnchoredWithin(container)) promptDetailsTooltip.hide();
}
