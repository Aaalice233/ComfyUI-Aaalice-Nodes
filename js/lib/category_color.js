/** Category color adapters shared by library and PromptSelector views. */

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export function normalizeCategoryColor(value) {
	return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : "";
}

export function applyCategoryColor(element, categoryOrColor) {
	const color = normalizeCategoryColor(typeof categoryOrColor === "string" ? categoryOrColor : categoryOrColor?.color);
	if (!color || !element) return element;
	element.classList.add("is-category-colored");
	element.style.setProperty("--aa-category-color", color);
	return element;
}
