/** GroupIsEnabled: visual group selector and queue-time state snapshot. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { currentGroups, groupLabels, registerProbePromptInjection, snapshotGroup } from "./lib/group_probe.js";
import { allGraphNodes } from "./lib/graph_scope.js";

const NODE = "GroupIsEnabled";
const PAYLOAD = "group_state_payload";
const nodeTypes = new WeakSet();

function isProbe(node) {
	return nodeTypes.has(node?.constructor)
		|| [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function ensureDefaultSelection(node) {
	const widget = node._aaGroupProbeWidget;
	if (!widget || widget.value) return;
	const labels = groupLabels(currentGroups(node));
	if (labels.length) widget.value = labels[0];
}

function setupProbe(node) {
	if (!isProbe(node) || node._aaGroupProbeWidget) return;
	const widget = node.addWidget("combo", t("aaalice.groupIsEnabled.group", "Group"), "", () => {}, {
		values: () => groupLabels(currentGroups(node)),
	});
	node._aaGroupProbeWidget = widget;
	// nodeCreated 触发时 node.graph 可能尚未挂接；默认选择推迟到微任务与后续生命周期里幂等补选。
	queueMicrotask(() => ensureDefaultSelection(node));
}

app.registerExtension({
	name: "ComfyUI.Aaalice.GroupIsEnabled",
	async init() { await ensureI18nReady(); },
	beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) nodeTypes.add(nodeType); },
	nodeCreated(node) { if (isProbe(node)) setupProbe(node); },
	loadedGraphNode(node) { if (isProbe(node)) { setupProbe(node); ensureDefaultSelection(node); } },
	setup() {
		for (const node of allGraphNodes(app.graph)) { setupProbe(node); ensureDefaultSelection(node); }
		registerProbePromptInjection({
			key: PAYLOAD,
			isProbe,
			payloadFor: (node) => ({ version: 1, ...snapshotGroup(node, node._aaGroupProbeWidget?.value) }),
		});
	},
});
