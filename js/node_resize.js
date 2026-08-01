/** Shared native resize support for package nodes without full-size DOM surfaces. */
import { app } from "../../scripts/app.js";
import {
	cleanupDomWidgetResizePassthrough,
	installDomWidgetResizePassthrough,
} from "./lib/dom_widget_resize.js";
import { allGraphNodes } from "./lib/graph_scope.js";

// These native widgets can occupy most of the Classic corner hit area. Full-size
// DOM nodes install the same passthrough in their owning modules.
const NATIVE_WIDGET_NODES = new Set([
	"GroupIsEnabled",
	"SimpleNotify",
	"SimpleStringSplit",
]);

const nodeNames = new WeakMap();
const wrappedTypes = new WeakSet();

function nativeWidgetNodeName(node) {
	const registeredName = nodeNames.get(node?.constructor);
	if (registeredName) return registeredName;
	for (const candidate of [
		node?.comfyClass,
		node?.type,
		node?.constructor?.comfyClass,
		node?.constructor?.nodeData?.name,
	]) {
		if (NATIVE_WIDGET_NODES.has(candidate)) return candidate;
	}
	return null;
}

function setupResize(node) {
	if (!nativeWidgetNodeName(node)) return;
	// Pinned nodes intentionally suppress resizing; unpinned package nodes must
	// not retain a stale non-resizable flag from an earlier configured state.
	if (!node.pinned && node.resizable === false) node.resizable = true;
	installDomWidgetResizePassthrough(node);
}

function registerNodeType(nodeType, name) {
	if (!NATIVE_WIDGET_NODES.has(name)) return;
	nodeNames.set(nodeType, name);
	if (wrappedTypes.has(nodeType)) return;
	wrappedTypes.add(nodeType);
	const originalOnRemoved = nodeType.prototype.onRemoved;
	nodeType.prototype.onRemoved = function () {
		cleanupDomWidgetResizePassthrough(this);
		return originalOnRemoved?.apply(this, arguments);
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.NodeResize",
	beforeRegisterNodeDef(nodeType, nodeData) {
		registerNodeType(nodeType, nodeData?.name);
	},
	nodeCreated(node) {
		setupResize(node);
	},
	loadedGraphNode(node) {
		setupResize(node);
	},
	setup() {
		for (const node of allGraphNodes(app.graph)) setupResize(node);
	},
});
