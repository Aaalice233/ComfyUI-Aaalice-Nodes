let nextDomWidgetInstance = 0;

function instanceWidgetType(type) {
	nextDomWidgetInstance += 1;
	return `${type}__aa_instance_${nextDomWidgetInstance.toString(36)}`;
}

export function addLifecycleDOMWidget(node, name, type, element, options = {}) {
	if (typeof node?.addDOMWidget !== "function") {
		throw new Error("[Aaalice] node requires addDOMWidget");
	}

	// Nodes 2.0 keys WidgetDOM rows by node id, widget name and widget type.
	// Undo rebuilds the graph with the same ids in one Vue update, so a stable
	// key reuses the old component and its onMounted hook never attaches the
	// replacement element. The type is not serialized; an instance suffix only
	// invalidates that renderer key and leaves the widget protocol unchanged.
	return node.addDOMWidget(name, instanceWidgetType(type), element, options);
}
