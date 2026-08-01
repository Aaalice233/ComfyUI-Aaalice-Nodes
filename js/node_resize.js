/** Classic resize-corner passthrough for exact native-widget node types. */
import { app } from "../../scripts/app.js";
import { installNativeWidgetResizePassthrough } from "./lib/native_widget_resize.js";

const NATIVE_WIDGET_NODES = new Set([
	"GroupIsEnabled",
	"SimpleNotify",
	"SimpleStringSplit",
]);

app.registerExtension({
	name: "ComfyUI.Aaalice.NodeResize",
	beforeRegisterNodeDef(nodeType, nodeData) {
		if (!NATIVE_WIDGET_NODES.has(nodeData?.name)) return;
		installNativeWidgetResizePassthrough(nodeType);
	},
});
