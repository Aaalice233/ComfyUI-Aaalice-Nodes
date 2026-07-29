/** Read-only Markdown note renderer that adapts to the space it is given. */

import { attachDescriptionTooltip } from "../description_tooltip.js";
import { renderSafeMarkdown } from "../safe_markdown.js";
import { el, icon } from "../ui.js";
import { controlView } from "./contract.js";

// 控件高度低于该值时完整渲染没有可读性，自动收成预览条；卡片高度由布局网格决定，不会形成反馈环。
const FULL_MIN_HEIGHT = 88;

function firstLine(markdown) {
	for (const line of String(markdown || "").split("\n")) {
		const text = line.replace(/^#+\s*/, "").replace(/[*_`>#[\]()]/g, "").trim();
		if (text) return text;
	}
	return "";
}

export function renderMarkdownControl(spec, port) {
	const root = el("div", "aa-control aa-control-markdown");
	const summary = el("span", "aa-control-markdown__summary");
	const bar = el("div", { className: "aa-control-markdown__bar", children: [icon("note", { className: "aa-control-markdown__icon" }), summary] });
	const body = el("div", { className: "aa-control-markdown__body", attrs: { tabindex: "0" } });
	let markdown = String(spec.value ?? "");
	let compact = null;
	const render = () => {
		if (compact === null) return;
		const empty = !markdown.trim();
		root.classList.toggle("is-compact", compact);
		root.classList.toggle("is-empty", empty);
		if (compact) {
			summary.textContent = firstLine(markdown) || (spec.labels.empty || "Empty note");
			if (body.isConnected) body.remove();
			if (!bar.isConnected) root.append(bar);
		} else {
			body.replaceChildren(empty ? el("p", "aa-control-markdown__empty", spec.labels.empty || "Empty note") : renderSafeMarkdown(markdown));
			if (bar.isConnected) bar.remove();
			if (!body.isConnected) root.append(body);
		}
	};
	attachDescriptionTooltip(bar, () => markdown);
	const observer = new ResizeObserver((entries) => {
		const next = (entries[0]?.contentRect?.height ?? 0) < FULL_MIN_HEIGHT;
		if (compact === null || next !== compact) { compact = next; render(); }
	});
	observer.observe(root);
	return controlView({
		root, kind: "markdown",
		update: (next) => { markdown = String(next.value ?? ""); render(); },
		destroy: () => observer.disconnect(),
	});
}
