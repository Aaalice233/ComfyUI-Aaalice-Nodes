import { t } from "../i18n.js";
import { applyMarkdownFormat } from "../lib/markdown_editor.js";
import { renderSafeMarkdown } from "../lib/safe_markdown.js";
import { button, el, iconButton, toggleSwitch } from "../lib/ui.js";
import { createWorkspaceDialog } from "./dialogs.js";

const COMPONENT_NOTE_FORMATS = [
	{ id: "bold", iconName: "bold", shortcut: "Ctrl/Cmd+B" },
	{ id: "italic", iconName: "italic", shortcut: "Ctrl/Cmd+I" },
	{ id: "strike", iconName: "strikethrough", shortcut: "Ctrl/Cmd+Shift+X" },
	{ id: "heading", iconName: "heading" },
	{ id: "quote", iconName: "quote" },
	{ id: "unordered-list", iconName: "list" },
	{ id: "ordered-list", iconName: "listOrdered" },
	{ id: "task-list", iconName: "listTodo" },
	{ id: "inline-code", iconName: "code" },
	{ id: "code-block", iconName: "codeBlock" },
	{ id: "link", iconName: "link", shortcut: "Ctrl/Cmd+K" },
	{ id: "image", iconName: "image" },
	{ id: "table", iconName: "table" },
	{ id: "horizontal-rule", iconName: "subtract" },
];

function componentNoteFormatLabel(format) {
	const fallbacks = {
		bold: "Bold", italic: "Italic", strike: "Strikethrough", heading: "Heading", quote: "Quote",
		"unordered-list": "Bulleted list", "ordered-list": "Numbered list", "task-list": "Task list",
		"inline-code": "Inline code", "code-block": "Code block", link: "Link", image: "Image", table: "Table", "horizontal-rule": "Horizontal rule",
	};
	return t(`aaalice.workspace.componentNote.formats.${format}`, fallbacks[format] || format);
}

export function openComponentNoteEditor({ item, ownerElement = null, preview = false, updateItem, confirmAction }) {
	const initialValue = typeof item.note === "string" ? item.note : "";
	const textarea = document.createElement("textarea");
	textarea.className = "aa-component-note-editor__input";
	textarea.value = initialValue;
	textarea.placeholder = t("aaalice.workspace.componentNote.placeholder", "Explain what this component controls. Markdown is supported.");
	textarea.setAttribute("aria-label", t("aaalice.workspace.componentNote.input", "Component note Markdown"));
	textarea.spellcheck = true;
	const previewSurface = el("div", { className: "aa-component-note-editor__preview aa-markdown-surface", attrs: { tabindex: "0" } });
	const modeName = el("strong", "aa-component-note-editor__mode-name");
	const modeHint = el("span", "aa-component-note-editor__mode-hint", t("aaalice.workspace.componentNote.markdown", "Markdown"));
	const toolbar = el("div", { className: "aa-component-note-editor__toolbar", attrs: { role: "toolbar", "aria-label": t("aaalice.workspace.componentNote.toolbar", "Markdown formatting") } });

	const applyFormat = (format) => {
		const next = applyMarkdownFormat(textarea.value, textarea.selectionStart, textarea.selectionEnd, format);
		textarea.value = next.value;
		textarea.focus({ preventScroll: true });
		textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
	};
	for (const format of COMPONENT_NOTE_FORMATS) {
		const label = componentNoteFormatLabel(format.id);
		const title = format.shortcut ? `${label} (${format.shortcut})` : label;
		const action = iconButton({ iconName: format.iconName, label, title, variant: "ghost", className: "aa-component-note-editor__format", onClick: () => applyFormat(format.id) });
		action.dataset.markdownFormat = format.id;
		toolbar.append(action);
	}

	let previewMode = Boolean(preview && initialValue.trim());
	let modeSwitch;
	const renderPreview = () => {
		previewSurface.replaceChildren();
		if (textarea.value.trim()) previewSurface.append(renderSafeMarkdown(textarea.value));
		else previewSurface.append(el("p", "aa-component-note-editor__empty", t("aaalice.workspace.componentNote.empty", "Nothing to preview yet.")));
	};
	const setMode = (next, { focus = false } = {}) => {
		previewMode = Boolean(next);
		modeSwitch?.setChecked(previewMode);
		modeName.textContent = previewMode ? t("aaalice.workspace.componentNote.preview", "Preview") : t("aaalice.workspace.componentNote.edit", "Edit");
		textarea.hidden = previewMode;
		toolbar.hidden = previewMode;
		previewSurface.hidden = !previewMode;
		if (previewMode) renderPreview();
		if (focus) queueMicrotask(() => (previewMode ? previewSurface : textarea).focus({ preventScroll: true }));
	};
	modeSwitch = toggleSwitch({
		checked: previewMode,
		label: t("aaalice.workspace.componentNote.switchMode", "Switch between Markdown editing and preview"),
		onChange: (next) => setMode(next, { focus: true }),
	});
	const modeBar = el("div", { className: "aa-component-note-editor__mode", children: [
		el("div", { className: "aa-component-note-editor__mode-copy", children: [modeName, modeHint] }),
		modeSwitch,
	] });
	const body = el("div", { className: "aa-component-note-editor", children: [modeBar, toolbar, textarea, previewSurface] });
	const footer = el("div");
	const dialog = createWorkspaceDialog({
		title: initialValue ? t("aaalice.workspace.componentNote.editTitle", "Edit component note") : t("aaalice.workspace.componentNote.addTitle", "Add component note"),
		body, footer, size: "lg", className: "aa-component-note-dialog", confirmOnEnter: false, returnFocus: ownerElement,
		initialFocus: () => previewMode ? modeSwitch : textarea,
	}, ownerElement);
	if (initialValue) footer.append(button({
		label: t("aaalice.workspace.componentNote.remove", "Remove note"), iconName: "delete", variant: "danger", className: "aa-component-note-editor__remove",
		onClick: async () => {
			const confirmed = await confirmAction(t("aaalice.workspace.componentNote.removeConfirm", "Remove this component note?"), { title: t("aaalice.workspace.componentNote.remove", "Remove note"), confirmLabel: t("aaalice.common.delete", "Delete"), danger: true, ownerElement });
			if (!confirmed) return;
			updateItem(item.id, (target) => { delete target.note; });
			dialog.close();
		},
	}));
	footer.append(
		button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }),
		button({ label: t("aaalice.common.save", "Save"), iconName: "save", onClick: () => {
			updateItem(item.id, (target) => {
				if (textarea.value.trim()) target.note = textarea.value;
				else delete target.note;
			});
			dialog.close();
		} }),
	);
	textarea.addEventListener("keydown", (event) => {
		if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
			return;
		}
		if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
		const key = event.key.toLocaleLowerCase();
		const format = key === "b" ? "bold" : key === "i" ? "italic" : key === "k" ? "link" : event.shiftKey && key === "x" ? "strike" : null;
		if (!format) return;
		event.preventDefault(); applyFormat(format);
	});
	setMode(previewMode);
	return dialog;
}
