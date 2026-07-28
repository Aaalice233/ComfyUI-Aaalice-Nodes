/** GroupIsEnabled: visual group selector and queue-time state snapshot. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { classifyGroupNodes } from "./lib/quick_group_manager_model.js";

const NODE = "GroupIsEnabled";
const PAYLOAD = "group_state_payload";
const nodeTypes = new WeakSet();

function isProbe(node) {
	return nodeTypes.has(node?.constructor)
		|| [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function groupTitle(group) {
	return String(group?.title || t("aaalice.groupIsEnabled.untitled", "Untitled group"));
}

function currentGroups(node) {
	const groups = [...(node.graph?._groups || [])];
	for (const group of groups) group.recomputeInsideNodes?.();
	return groups;
}

// 同名组按出现顺序加序号后缀；下拉项与队列时查找必须使用同一标签函数。
function groupLabels(groups) {
	const seen = new Map();
	return groups.map((group) => {
		const title = groupTitle(group);
		const count = (seen.get(title) || 0) + 1;
		seen.set(title, count);
		return count > 1 ? `${title} (${count})` : title;
	});
}

function payloadFor(node) {
	const groups = currentGroups(node);
	const selected = String(node._aaGroupProbeWidget?.value ?? "");
	const index = groupLabels(groups).indexOf(selected);
	const group = index >= 0 ? groups[index] : null;
	if (!group) return { version: 1, title: selected, state: "missing" };
	// 探测器自身的 mode 不参与组状态判定；它只负责观察。
	const members = (group._nodes || []).filter((member) => member !== node);
	return { version: 1, title: groupTitle(group), state: classifyGroupNodes(members) };
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

function installPromptHook() {
	if (app._aaGroupIsEnabledHook) return;
	app._aaGroupIsEnabledHook = true;
	const original = app.graphToPrompt?.bind(app);
	if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for GroupIsEnabled");
	app.graphToPrompt = async function (...args) {
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of app.graph?._nodes || []) {
			if (!isProbe(node)) continue;
			const promptNode = output?.[String(node.id)];
			if (!promptNode) continue;
			promptNode.inputs ||= {};
			promptNode.inputs[PAYLOAD] = JSON.stringify(payloadFor(node));
		}
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.GroupIsEnabled",
	async init() { await ensureI18nReady(); },
	beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) nodeTypes.add(nodeType); },
	nodeCreated(node) { if (isProbe(node)) setupProbe(node); },
	loadedGraphNode(node) { if (isProbe(node)) { setupProbe(node); ensureDefaultSelection(node); } },
	setup() {
		for (const node of app.graph?._nodes || []) { setupProbe(node); ensureDefaultSelection(node); }
		installPromptHook();
	},
});
