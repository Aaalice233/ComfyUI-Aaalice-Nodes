const patchedNodeTypes = new WeakSet();

export function installNativeWidgetResizePassthrough(nodeType) {
	if (patchedNodeTypes.has(nodeType)) return;
	patchedNodeTypes.add(nodeType);
	const previousGetWidgetOnPos = nodeType.prototype.getWidgetOnPos;
	nodeType.prototype.getWidgetOnPos = function (canvasX, canvasY) {
		if (this.resizable !== false && this.findResizeDirection?.(canvasX, canvasY)) return undefined;
		return previousGetWidgetOnPos?.apply(this, arguments);
	};
}
