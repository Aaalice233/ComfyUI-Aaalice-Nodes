import { guardClipboardEvents } from "./ui/clipboard_guard.js";

let nextDomWidgetInstance = 0;

function instanceWidgetType(type) {
	nextDomWidgetInstance += 1;
	return `${type}__aa_instance_${nextDomWidgetInstance.toString(36)}`;
}

export function bindDomWidgetWidthToNode(node, widget) {
	Object.defineProperty(widget, "width", {
		configurable: true,
		enumerable: true,
		get: () => node.width,
		// ComfyUI frontend #12443 can write a stale Vue measurement here even in Classic.
		set(_width) {},
	});
	return widget;
}

export function addLifecycleDOMWidget(node, name, type, element, options = {}) {
	if (typeof node?.addDOMWidget !== "function") {
		throw new Error("[Aaalice] node requires addDOMWidget");
	}
	// 节点内搜索框等输入的粘贴/复制不得冒泡到 document 触发画布节点粘贴。
	guardClipboardEvents(element);

	// Nodes 2.0 keys WidgetDOM rows by node id, widget name and widget type.
	// Undo rebuilds the graph with the same ids in one Vue update, so a stable
	// key reuses the old component and its onMounted hook never attaches the
	// replacement element. The type is not serialized; an instance suffix only
	// invalidates that renderer key and leaves the widget protocol unchanged.
	return node.addDOMWidget(name, instanceWidgetType(type), element, options);
}
