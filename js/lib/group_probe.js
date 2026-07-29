/** Shared visual-group probing: live labels, queue-time snapshots and the prompt hook. */
import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { allGraphNodes, promptNodesForGraphNode } from "./graph_scope.js";
import { classifyGroupNodes } from "./quick_group_manager_model.js";

export function groupTitle(group) {
	return String(group?.title || t("aaalice.groupIsEnabled.untitled", "Untitled group"));
}

export function currentGroups(node) {
	const groups = [...(node.graph?._groups || [])];
	for (const group of groups) group.recomputeInsideNodes?.();
	return groups;
}

// 同名组按出现顺序加序号后缀；下拉项与队列时查找必须使用同一标签函数。
export function groupLabels(groups) {
	const seen = new Map();
	return groups.map((group) => {
		const title = groupTitle(group);
		const count = (seen.get(title) || 0) + 1;
		seen.set(title, count);
		return count > 1 ? `${title} (${count})` : title;
	});
}

/** Snapshot one group's member modes for the queue-time payload; the probe's own mode never counts. */
export function snapshotGroup(node, label) {
	const groups = currentGroups(node);
	const index = groupLabels(groups).indexOf(String(label ?? ""));
	const group = index >= 0 ? groups[index] : null;
	if (!group) return { title: String(label ?? ""), state: "missing" };
	const members = (group._nodes || []).filter((member) => member !== node);
	return { title: groupTitle(group), state: classifyGroupNodes(members) };
}

const handlers = [];

/** Each probe family registers its node predicate and payload builder once; one hook serves all. */
export function registerProbePromptInjection({ key, isProbe, payloadFor }) {
	handlers.push({ key, isProbe, payloadFor });
	if (registerProbePromptInjection.installed) return;
	registerProbePromptInjection.installed = true;
	const original = app.graphToPrompt?.bind(app);
	if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for group probes");
	app.graphToPrompt = async function (...args) {
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of allGraphNodes(app.graph)) {
			const matchingHandlers = handlers.filter((handler) => handler.isProbe(node));
			if (!matchingHandlers.length) continue;
			for (const promptNode of promptNodesForGraphNode(output, node)) {
				promptNode.inputs ||= {};
				for (const handler of matchingHandlers) {
					promptNode.inputs[handler.key] = JSON.stringify(handler.payloadFor(node));
				}
			}
		}
		return result;
	};
}
