import { app } from "../../../scripts/app.js";

function beginResizePassthrough(node) {
	if (node._aaaliceDomWidgetResizeCleanup) return;
	for (const element of node._aaaliceDomWidgetResizeElements || []) element?.classList?.add("is-resizing");
	const cleanup = () => {
		document.removeEventListener("pointerup", cleanup, true);
		document.removeEventListener("pointercancel", cleanup, true);
		for (const element of node._aaaliceDomWidgetResizeElements || []) element?.classList?.remove("is-resizing");
		node._aaaliceDomWidgetResizeCleanup = null;
	};
	node._aaaliceDomWidgetResizeCleanup = cleanup;
	document.addEventListener("pointerup", cleanup, true);
	document.addEventListener("pointercancel", cleanup, true);
}

export function installDomWidgetResizePassthrough(node, ...elements) {
	node._aaaliceDomWidgetResizeElements = [...new Set([
		...(node._aaaliceDomWidgetResizeElements || []),
		...elements.filter(Boolean),
	])];
	if (node._aaaliceDomWidgetResizePatched) return;
	node._aaaliceDomWidgetResizePatched = true;
	const previousGetWidgetOnPos = node.getWidgetOnPos;
	node.getWidgetOnPos = function (x, y) {
		// LiteGraph checks widgets before resize handles. Yield native corners so
		// a full-size DOM widget cannot consume the resize interaction.
		if (this.findResizeDirection?.(x, y)) {
			if (app.canvas?.pointer?.isDown) beginResizePassthrough(this);
			return undefined;
		}
		return previousGetWidgetOnPos?.apply(this, arguments);
	};
	const previousResize = node.onResize;
	node.onResize = function () {
		if (app.canvas?.resizing_node === this) beginResizePassthrough(this);
		return previousResize?.apply(this, arguments);
	};
}

export function cleanupDomWidgetResizePassthrough(node) {
	node?._aaaliceDomWidgetResizeCleanup?.();
}
