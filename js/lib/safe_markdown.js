/** Small allowlisted Markdown renderer that never assigns untrusted innerHTML. */

function appendInline(parent, source) {
	const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
	let cursor = 0;
	for (const match of source.matchAll(pattern)) {
		parent.append(document.createTextNode(source.slice(cursor, match.index)));
		const token = match[0];
		let node;
		if (token.startsWith("`")) {
			node = document.createElement("code");
			node.textContent = token.slice(1, -1);
		} else if (token.startsWith("**")) {
			node = document.createElement("strong");
			node.textContent = token.slice(2, -2);
		} else if (token.startsWith("*")) {
			node = document.createElement("em");
			node.textContent = token.slice(1, -1);
		} else {
			node = document.createElement("a");
			const split = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
			node.textContent = split?.[1] || token;
			node.href = split?.[2] || "#";
			node.target = "_blank";
			node.rel = "noopener noreferrer";
		}
		parent.append(node);
		cursor = (match.index || 0) + token.length;
	}
	parent.append(document.createTextNode(source.slice(cursor)));
}

export function renderSafeMarkdown(markdown) {
	const root = document.createDocumentFragment();
	const lines = String(markdown || "").replaceAll("\r\n", "\n").split("\n");
	let list = null;
	let code = null;
	for (const line of lines) {
		if (line.startsWith("```")) {
			if (code) {
				root.append(code);
				code = null;
			} else {
				code = document.createElement("pre");
				code.append(document.createElement("code"));
			}
			continue;
		}
		if (code) {
			code.firstChild.textContent += `${code.firstChild.textContent ? "\n" : ""}${line}`;
			continue;
		}
		const bullet = line.match(/^\s*[-*]\s+(.+)$/);
		if (bullet) {
			if (!list) {
				list = document.createElement("ul");
				root.append(list);
			}
			const item = document.createElement("li");
			appendInline(item, bullet[1]);
			list.append(item);
			continue;
		}
		list = null;
		if (!line.trim()) continue;
		const heading = line.match(/^(#{1,3})\s+(.+)$/);
		const element = document.createElement(heading ? `h${heading[1].length + 2}` : "p");
		appendInline(element, heading ? heading[2] : line);
		root.append(element);
	}
	if (code) root.append(code);
	return root;
}
