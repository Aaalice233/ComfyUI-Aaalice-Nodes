/** Installs a capability-driven context-menu entry on a LiteGraph node. */

const PATCH_MARKER = Symbol("aaalice.controlMenuPatched");

export function installNodeControlMenu(node, { label, listControls, openControls }) {
	if (!node || node[PATCH_MARKER]) return false;
	if (typeof listControls !== "function" || typeof openControls !== "function") {
		throw new TypeError("Node control menu requires listControls() and openControls()");
	}

	node[PATCH_MARKER] = true;
	const previous = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (_canvas, options = []) {
		const result = previous?.apply(this, arguments);
		const target = Array.isArray(result) ? result : options;
		if (!listControls(this).length || target.some((item) => item?.content === label)) return result;
		target.push({ content: label, callback: () => openControls(this) });
		return result;
	};
	return true;
}
