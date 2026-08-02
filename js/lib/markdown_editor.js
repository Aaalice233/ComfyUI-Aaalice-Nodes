/** Pure Markdown editing transforms used by the Dashboard component-note editor. */

const INLINE_FORMATS = {
	bold: ["**", "**", "bold text"],
	italic: ["*", "*", "italic text"],
	strike: ["~~", "~~", "strikethrough"],
	"inline-code": ["`", "`", "code"],
	link: ["[", "](https://)", "link text"],
	image: ["![", "](https://)", "image description"],
};

function clampSelection(value, start, end) {
	const length = value.length;
	const from = Math.max(0, Math.min(length, Number(start) || 0));
	const to = Math.max(from, Math.min(length, Number(end) || from));
	return [from, to];
}

function replace(value, start, end, replacement, selectionStart, selectionEnd) {
	return {
		value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
		selectionStart: start + selectionStart,
		selectionEnd: start + selectionEnd,
	};
}

function wrapInline(value, start, end, [before, after, placeholder]) {
	const selected = value.slice(start, end) || placeholder;
	const replacement = `${before}${selected}${after}`;
	return replace(value, start, end, replacement, before.length, before.length + selected.length);
}

function prefixLines(value, start, end, prefixForIndex) {
	const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	const nextBreak = value.indexOf("\n", end);
	const lineEnd = nextBreak < 0 ? value.length : nextBreak;
	const source = value.slice(lineStart, lineEnd);
	const lines = source.split("\n");
	const replacement = lines.map((line, index) => `${prefixForIndex(index)}${line}`).join("\n");
	return replace(value, lineStart, lineEnd, replacement, 0, replacement.length);
}

function block(value, start, end, before, after, placeholder) {
	const selected = value.slice(start, end) || placeholder;
	const leading = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
	const trailing = end < value.length && value[end] !== "\n" ? "\n" : "";
	const replacement = `${leading}${before}${selected}${after}${trailing}`;
	const selectedStart = leading.length + before.length;
	return replace(value, start, end, replacement, selectedStart, selectedStart + selected.length);
}

/** Return the next editor value and selection for a supported Markdown format action. */
export function applyMarkdownFormat(source, selectionStart, selectionEnd, format) {
	const value = String(source || "");
	const [start, end] = clampSelection(value, selectionStart, selectionEnd);
	if (INLINE_FORMATS[format]) return wrapInline(value, start, end, INLINE_FORMATS[format]);
	if (format === "heading") return prefixLines(value, start, end, () => "## ");
	if (format === "quote") return prefixLines(value, start, end, () => "> ");
	if (format === "unordered-list") return prefixLines(value, start, end, () => "- ");
	if (format === "ordered-list") return prefixLines(value, start, end, (index) => `${index + 1}. `);
	if (format === "task-list") return prefixLines(value, start, end, () => "- [ ] ");
	if (format === "code-block") return block(value, start, end, "```\n", "\n```", "code");
	if (format === "table") return block(value, start, end, "", "", "| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |");
	if (format === "horizontal-rule") return block(value, start, end, "", "", "---");
	throw new TypeError(`Unsupported Markdown format: ${format}`);
}
