/** ConditionalSaveImage: dim save options while the enabled toggle is off. */
import { app } from "../../scripts/app.js";

const NODE = "ConditionalSaveImage";
const TOGGLE = "enabled";
const SAVE_WIDGETS = [
	"filename_prefix",
	"file_format",
	"lossless_webp",
	"quality",
	"webp_method",
	"jpeg_subsampling",
	"embed_workflow",
	"save_with_metadata",
	"add_loras_to_prompt",
	"add_counter_to_filename",
	"save_as_recipe",
];
const nodeTypes = new WeakSet();

function isNode(node) {
	return nodeTypes.has(node?.constructor)
		|| [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function applyEnabledState(node) {
	const toggle = node.widgets?.find((w) => w.name === TOGGLE);
	if (!toggle) return;
	const disabled = toggle.value === false;
	for (const widget of node.widgets || []) {
		if (!SAVE_WIDGETS.includes(widget.name)) continue;
		widget.disabled = disabled;
	}
	node.graph?.setDirtyCanvas?.(true, true);
}

function setupNode(node) {
	if (!isNode(node) || node._aaConditionalSave) return;
	node._aaConditionalSave = true;
	const toggle = node.widgets?.find((w) => w.name === TOGGLE);
	if (toggle) {
		const original = toggle.callback;
		toggle.callback = function (...args) {
			original?.apply(this, args);
			applyEnabledState(node);
		};
	}
	// 工作流载入后控件才挂接完成；微任务里再幂等刷一次，保证恢复的状态也生效。
	queueMicrotask(() => applyEnabledState(node));
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ConditionalSaveImage",
	beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) nodeTypes.add(nodeType); },
	nodeCreated(node) { setupNode(node); },
	loadedGraphNode(node) { setupNode(node); },
});
