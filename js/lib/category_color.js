/** Category color adapters shared by library and PromptSelector views. */

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export function normalizeCategoryColor(value) {
	return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : "";
}

export function categorySelectOption(category) {
	return { label: category.name, value: category.id, color: normalizeCategoryColor(category.color) };
}

export function nativeCategoryOption(category, selected = false) {
	const option = new Option(category.name, category.id, false, selected);
	const color = normalizeCategoryColor(category.color);
	if (color) { option.dataset.color = color; option.style.color = color; }
	return option;
}

export function applyCategoryColor(element, categoryOrColor) {
	const color = normalizeCategoryColor(typeof categoryOrColor === "string" ? categoryOrColor : categoryOrColor?.color);
	if (!color || !element) return element;
	element.classList.add("is-category-colored");
	element.style.setProperty("--aa-category-color", color);
	return element;
}
