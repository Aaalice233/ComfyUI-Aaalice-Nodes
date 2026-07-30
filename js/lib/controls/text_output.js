/** Read-only plain-text or Markdown projection for ComfyUI's PreviewAny node. */

import { renderSafeMarkdown } from "../safe_markdown.js";
import { el } from "../ui.js";
import { controlView } from "./contract.js";

export function renderTextOutputControl(spec) {
	let value = String(spec.value ?? "");
	let markdown = Boolean(spec.options?.markdown);
	const root = el("div", "aa-control aa-text-output");
	const mode = el("span", "aa-text-output__mode");
	const body = el("div", { className: "aa-text-output__body", attrs: { tabindex: "0", "aria-label": spec.labels.content || "Previewed value" } });

	function render() {
		const empty = !value.trim();
		root.classList.toggle("is-empty", empty);
		root.classList.toggle("is-markdown", markdown);
		mode.textContent = markdown ? (spec.labels.markdown || "Markdown") : (spec.labels.plain || "Plain text");
		if (empty) body.replaceChildren(el("p", "aa-text-output__empty", spec.labels.empty || "Run the workflow to preview a value"));
		else if (markdown) body.replaceChildren(renderSafeMarkdown(value));
		else body.replaceChildren(el("pre", "aa-text-output__plain", value));
	}

	root.append(el("div", { className: "aa-text-output__header", children: [mode] }), body);
	render();
	return controlView({
		root,
		kind: "text-output",
		update: (nextSpec) => {
			value = String(nextSpec.value ?? "");
			markdown = Boolean(nextSpec.options?.markdown);
			render();
		},
	});
}
