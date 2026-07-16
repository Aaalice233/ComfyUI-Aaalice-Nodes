/** Bind a node's user-selected color to reusable, theme-aware CSS tokens. */

const NODE_COLOR_TOKEN = "--aa-ui-node-color";
const NODE_ACCENT_TOKEN = "--aa-ui-node-accent";

function targetsOf(targets) {
	const value = typeof targets === "function" ? targets() : targets;
	return (Array.isArray(value) ? value : [value]).filter((target) => target?.style);
}

export function nodeAccentColor(node) {
	const value = String(node?.color || node?.bgcolor || "").trim();
	if (!value) return null;
	if (globalThis.CSS?.supports && !globalThis.CSS.supports("color", value)) return null;
	return value;
}

export function syncNodeAccent(node, targets) {
	const color = nodeAccentColor(node);
	for (const target of targetsOf(targets)) {
		if (color) {
			target.style.setProperty(NODE_COLOR_TOKEN, color);
			// Moving the selected color toward the theme text color keeps dark node
			// palettes visible on dark controls and reverses naturally in light themes.
			target.style.setProperty(NODE_ACCENT_TOKEN, `color-mix(in srgb, ${color} 64%, var(--aa-ui-text))`);
		} else {
			target.style.removeProperty(NODE_COLOR_TOKEN);
			target.style.removeProperty(NODE_ACCENT_TOKEN);
		}
	}
	return color;
}

export function bindNodeAccent(node, targets) {
	const sync = (extraTargets) => syncNodeAccent(node, extraTargets ?? targets);
	const previousSetColorOption = node?.setColorOption;
	let wrappedSetColorOption = null;
	if (typeof previousSetColorOption === "function") {
		wrappedSetColorOption = function () {
			const result = previousSetColorOption.apply(this, arguments);
			sync();
			return result;
		};
		node.setColorOption = wrappedSetColorOption;
	}
	sync();
	return {
		sync,
		dispose() {
			if (wrappedSetColorOption && node.setColorOption === wrappedSetColorOption) node.setColorOption = previousSetColorOption;
		},
	};
}
