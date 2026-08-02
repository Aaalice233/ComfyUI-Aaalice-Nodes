/** Installs a capability-driven context-menu entry on a LiteGraph node. */

const PATCH_MARKER = Symbol("aaalice.controlMenuPatched");

export function installNodeControlMenu(node, { label, entries = null, listControls, openControls = null }) {
	if (!node || node[PATCH_MARKER]) return false;
	const menuEntries = entries || [{ label, open: openControls }];
	if (typeof listControls !== "function" || !menuEntries.length || menuEntries.some((entry) => typeof entry?.label !== "string" || typeof entry?.open !== "function")) {
		throw new TypeError("Node control menu requires listControls() and menu entry callbacks");
	}

	node[PATCH_MARKER] = true;
	const previous = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (canvas, options = []) {
		const result = previous?.apply(this, arguments);
		// LiteGraph extensions may mutate the supplied `options` array and return
		// an empty array (the Group Node extension does this). Keep those native
		// entries in place, but return only our additions so LiteGraph can prepend
		// them without duplicating the already-mutated options array.
		const target = Array.isArray(result) && result.length ? result : options;
		const added = [];
		const controls = listControls(this);
		if (!controls.length) return result;
		for (const entry of menuEntries) {
			if (entry.when && !entry.when(this, controls)) continue;
			if (target.some((item) => item?.content === entry.label)) continue;
			const item = { content: entry.label, callback: () => entry.open(this, controls, canvas) };
			target.push(item); added.push(item);
		}
		if (Array.isArray(result) && result.length === 0) return added;
		return result;
	};
	return true;
}
