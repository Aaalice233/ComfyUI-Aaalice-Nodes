/** Dependency-free DOM and icon primitives shared by Aaalice surfaces. */

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS = {
	add: "M12 5v14M5 12h14",
		arrowRight: "M5 12h14m-6-6 6 6-6 6",
		arrowUpDown: "m7 15 3 3 3-3M10 18V6m7 3-3-3-3 3m3-3v12",
	arrowDownAZ: "M3 16l4 4 4-4M7 20V4M20 8h-5m0 2V6.5a2.5 2.5 0 0 1 5 0V10m-5 4h5l-5 6h5",
	bold: "M6 4h8a4 4 0 0 1 0 8H6V4Zm0 8h9a4 4 0 0 1 0 8H6v-8Z",
	brush: "m9 11 6-6 4 4-6 6M9 11c-4 0-5 3-5 6 2-1 4 1 7-1 2-1 2-3-2-5Z",
	close: "M18 6 6 18M6 6l12 12",
	code: "m8 9-3 3 3 3m8-6 3 3-3 3m-2-10-4 14",
	codeBlock: "M4 4h16v16H4V4Zm5 6-2 2 2 2m6-4 2 2-2 2",
	chevronDown: "m6 9 6 6 6-6",
	copy: "M8 8h11v11H8zM5 16H4V5h11v1",
	delete: "M4 7h16M9 11v5m6-5v5M8 7l1-3h6l1 3m2 0-1 13H7L6 7",
	download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
	discord: "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.25.077.077 0 0 0-.078-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.319 13.58.099 18.058a.082.082 0 0 0 .031.056c2.053 1.508 4.041 2.423 5.993 3.03a.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 12.3 12.3 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128c-.598.343-1.22.645-1.873.891a.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029c1.961-.607 3.95-1.522 6.002-3.03a.077.077 0 0 0 .031-.055c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.029ZM8.02 15.331c-1.182 0-2.157-1.086-2.157-2.419s.956-2.419 2.157-2.419c1.211 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419s.956-2.419 2.157-2.419c1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419Z",
	drag: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
	edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
	eye: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
	eyeOff: "M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61C3.27 8.2 2 12 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20",
	favorite: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2-4.5-4.4 6.2-.9L12 3Z",
	fileText: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M16 13H8m8 4H8m2-8H8",
		filter: "M4 5h16l-6 7v6l-4 2v-8L4 5Z",
		folderSearch: "M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm14.5 7.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm1.5 4-1.8-1.8",
		github: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28 0 6.72-1.61 6.72-7A5.4 5.4 0 0 0 19.22 4 5 5 0 0 0 19 1.5S17.73 1.1 15 3.02a13.38 13.38 0 0 0-6 0C6.27 1.1 5 1.5 5 1.5A5 5 0 0 0 4.78 4a5.4 5.4 0 0 0-1.5 3.5c0 5.42 3.44 7 6.72 7A4.8 4.8 0 0 0 9 18v4M9 18c-4.51 2-5-2-7-2",
	heading: "M6 4v16M18 4v16M6 12h12M3 4h6M15 4h6M3 20h6m6 0h6",
		info: "M12 16v-4m0-4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
		help: "M9.4 9a2.7 2.7 0 1 1 4.2 2.25c-1.1.75-1.6 1.25-1.6 2.25M12 17h.01",
		layout: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
		layoutGrid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
	list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
	listOrdered: "M10 6h11M10 12h11M10 18h11M4 6h1V3L3 4m0 10c0-1 2-2 2-3s-2-1-2 0m0 6h2l-2 3h2",
	listTodo: "M3 5h6v6H3V5Zm0 8h6v6H3v-6Zm10-6h8m-8 4h8m-8 4h8m-8 4h8",
	link: "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1",
	externalLink: "M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5",
	loading: "M21 12a9 9 0 1 1-6.22-8.56",
	lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
	subtract: "M5 12h14",
	shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
	move: "M3 6h7l2 2h9v11H3V6Zm5 8h8m-3-3 3 3-3 3",
	movie: "M3 5h18v14H3V5Zm0 5h18M8 5l3 5m3-5 3 5",
	more: "M5 11v2M12 11v2M19 11v2",
	pin: "M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Zm3 11v7",
	person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
	unlock: "M17 11V8a5 5 0 0 0-9.6-2M5 11h14v10H5z",
	note: "M5 4h14v13H9l-4 3V4Zm4 5h6m-6 4h4",
	quote: "M3 11h5v5H3v-5Zm13 0h5v5h-5v-5ZM8 16c0 3-2 5-5 5m18-5c0 3-2 5-5 5",
	moveDown: "m7 10 5 5 5-5",
	moveUp: "m7 14 5-5 5 5",
	moveToTop: "m17 11-5-5-5 5m10 7-5-5-5 5",
	moveToBottom: "m7 13 5 5 5-5M7 6l5 5 5-5",
	refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
	skipForward: "M5 5v14l11-7L5 5Zm14 0v14",
	sliders: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M6 10v4M10 18v4",
	fit: "M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5",
		globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-20a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10ZM2 12h20",
	image: "M3 5h18v14H3V5Zm0 10 5-5 4 4 2-2 7 7M16 9h.01",
	italic: "M19 4h-9m4 16H5m6 0 3-16",
		logOut: "M10 17l5-5-5-5m5 5H3m11-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",
		volumeOff: "M11 5 6 9H2v6h4l5 4V5Zm11 4-6 6m0-6 6 6",
	zoomIn: "M11 8v6m-3-3h6m7 10-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
	zoomOut: "M8 11h6m7 10-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
	ratingGeneral: "M12 3 5 6v5c0 4.2 2.9 6.6 7 8 4.1-1.4 7-3.8 7-8V9l-7-6Zm-3 9 2 2 4-4",
	ratingSensitive: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
	ratingQuestionable: "M12 18h.01M9.4 9a2.7 2.7 0 1 1 4.2 2.25c-1.1.75-1.6 1.25-1.6 2.25M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
	ratingExplicit: "M13 2s1 4-2 6c-2 1.4-4 3.4-4 6a5 5 0 0 0 10 0c0-2-1-3.8-2.5-5.2.2 2.2-.8 3.2-1.7 3.8.8-3.7-1.8-5.5.2-10.6Z",
		search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
		save: "M5 3h11l3 3v15H5V3Zm3 0v6h8V3M8 21v-7h8v7",
		scan: "M7 3H5a2 2 0 0 0-2 2v2m0 10v2a2 2 0 0 0 2 2h2m10 0h2a2 2 0 0 0 2-2v-2m0-10V5a2 2 0 0 0-2-2h-2M4 12h16",
		selectionMultiple: "m3 6 2 2 4-4M3 12l2 2 4-4M3 18l2 2 4-4M13 6h8M13 12h8M13 18h8",
		selectionSingle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
			settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.73v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.73l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
		send: "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13",
	statusCheck: "m5 12 4 4L19 6",
	statusError: "M7 7l10 10M17 7 7 17",
	statusIdle: "M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
	strikethrough: "M17 5H9a3 3 0 0 0-2.8 4M4 12h16m-3 3a3 3 0 0 1-3 4H6",
		statusWarning: "M12 9v4m0 4h.01M10.3 4.8 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z",
	storage: "M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3Zm0 0v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6m-16 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6",
	swap: "M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3",
	thumbUp: "M7 10v11H3V10h4Zm0 10h10.4a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.6 10H14l1-4a2.5 2.5 0 0 0-4.7-1.7L7 10v10Z",
	tag: "M20 13 13 20 4 11V4h7l9 9ZM8.5 8.5h.01",
	table: "M3 3h18v18H3V3Zm0 6h18M3 15h18M9 3v18m6-18v18",
	upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
};
// Discord has no Lucide brand glyph; keep its official silhouette as the one
// filled exception so the community action is recognizable at compact sizes.
const FILLED_ICONS = new Set(["discord"]);

export function hasIcon(name) {
	return Object.prototype.hasOwnProperty.call(ICON_PATHS, name);
}

function appendChildren(element, children) {
	for (const child of children.flat(Infinity)) {
		if (child == null || child === false) continue;
		element.append(child instanceof Node ? child : document.createTextNode(String(child)));
	}
}

/** Supports el("div", "class", "text") and an options object. */
export function el(tag, options = null, text = null) {
	const element = document.createElement(tag);
	if (typeof options === "string") {
		element.className = options;
		if (text != null) element.textContent = text;
		return element;
	}
	if (!options) {
		if (text != null) element.textContent = text;
		return element;
	}
	if (options.className) element.className = options.className;
	if (options.text != null) element.textContent = options.text;
	for (const [name, value] of Object.entries(options.attrs || {})) {
		if (value == null || value === false) continue;
		if (name in element && name !== "role" && !name.startsWith("aria-")) element[name] = value;
		else element.setAttribute(name, value === true ? "" : String(value));
	}
	appendChildren(element, options.children || []);
	return element;
}

export function isolate(element) {
	element.setAttribute("data-aa-isolated-events", "");
	for (const eventName of ["pointerdown", "mousedown", "wheel"]) element.addEventListener(eventName, (event) => event.stopPropagation());
	return element;
}


export function icon(name, { label = null, className = "" } = {}) {
	if (!hasIcon(name)) throw new Error(`[Aaalice] Unknown icon: ${name}`);
	const pathData = ICON_PATHS[name];
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("class", `aa-ui-icon${className ? ` ${className}` : ""}`);
	const filled = FILLED_ICONS.has(name);
	svg.setAttribute("fill", filled ? "currentColor" : "none");
	svg.setAttribute("stroke", filled ? "none" : "currentColor");
	svg.setAttribute("stroke-width", "1.8");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	if (label) {
		svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", label);
	} else svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", pathData);
	svg.append(path);
	return svg;
}

export function button({
	label,
	variant = "primary",
	size = "md",
	iconName = null,
	title = null,
	ariaLabel = null,
	className = "",
	active = false,
	disabled = false,
	defaultAction = false,
	onClick = null,
} = {}) {
	const result = el("button", {
		className: `aa-ui-button aa-ui-button--${variant} aa-ui-button--${size}${active ? " is-active" : ""}${className ? ` ${className}` : ""}`,
		attrs: { type: "button", title, disabled, "aria-label": ariaLabel || null, "data-aa-dialog-default": defaultAction ? "true" : null },
	});
	if (iconName) result.append(icon(iconName));
	if (label != null) result.append(el("span", "aa-ui-button__label", label));
	if (onClick) result.addEventListener("click", onClick);
	return result;
}

export function iconButton({ iconName, label, ...options }) {
	return button({ ...options, iconName, ariaLabel: label, title: Object.hasOwn(options, "title") ? options.title : label, size: options.size || "icon" });
}
