import DOMPurify from "../vendor/purify.es.js";
import { marked, Renderer } from "../vendor/marked.esm.js";

const ALLOWED_TAGS = [
	"a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
	"img", "input", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
];
const ALLOWED_ATTR = [
	"align", "alt", "checked", "class", "disabled", "href", "rel", "src", "start", "target", "title", "type",
];
const HTTP_URL = /^https?:\/\//i;

function escapeAttribute(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function isHttpUrl(value) {
	return HTTP_URL.test(String(value || ""));
}

function createRenderer() {
	const renderer = new Renderer();
	renderer.link = ({ href, title, tokens, text }) => {
		const label = tokens ? renderer.parser.parseInline(tokens) : text;
		if (!isHttpUrl(href)) return label;
		const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
		return `<a href="${escapeAttribute(href)}"${titleAttribute} target="_blank" rel="noopener noreferrer">${label}</a>`;
	};
	renderer.image = ({ href, title, text }) => {
		if (!isHttpUrl(href)) return escapeAttribute(text);
		const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
		return `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(text)}"${titleAttribute}>`;
	};
	return renderer;
}

/** CommonMark/GFM rendering with an explicit tooltip-safe HTML allowlist. */
export function renderMarkdownToHtml(markdown) {
	const html = marked.parse(String(markdown || ""), {
		gfm: true,
		renderer: createRenderer(),
	});
	return DOMPurify.sanitize(html, {
		ALLOWED_ATTR,
		ALLOWED_TAGS,
		ALLOWED_URI_REGEXP: HTTP_URL,
		ALLOW_DATA_ATTR: false,
	});
}

export function renderSafeMarkdown(markdown) {
	const template = document.createElement("template");
	template.innerHTML = renderMarkdownToHtml(markdown);
	return template.content;
}
