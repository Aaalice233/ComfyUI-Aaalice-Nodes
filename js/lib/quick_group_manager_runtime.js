/** Shared QuickGroupManager discovery and mode actions for node and workspace surfaces. */

import { allGraphNodes } from "./graph_scope.js";
import {
	GROUP_STATE,
	classifyGroupNodes,
	groupMatchesFilter,
	normalizeQuickGroupState,
	orderedVisibleGroups,
	planLinkageCascade,
	planNodeModeChanges,
} from "./quick_group_manager_model.js";

const NODE_TYPE = "QuickGroupManager";
const PROPERTY = "quickGroupManagerState";

export function isQuickGroupManager(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE_TYPE);
}

export function quickGroupManagerNodes(root) {
	return allGraphNodes(root).filter(isQuickGroupManager);
}

export function quickGroupManagerState(node, { persist = true } = {}) {
	const state = normalizeQuickGroupState(node?.properties?.[PROPERTY]);
	if (persist && node) {
		node.properties ||= {};
		node.properties[PROPERTY] = state;
	}
	return state;
}

export function quickGroupManagerGroups(node) {
	const groups = [...(node?.graph?._groups || [])];
	for (const group of groups) group.recomputeInsideNodes?.();
	return groups;
}

export function quickGroupManagerSnapshot(node) {
	const groups = quickGroupManagerGroups(node);
	const state = quickGroupManagerState(node, { persist: false });
	return {
		state,
		groups,
		visibleGroups: orderedVisibleGroups(groups, state),
	};
}

function commitGraph(node, mutate) {
	const graph = node?.graph;
	graph?.beforeChange?.();
	try {
		mutate();
	} finally {
		graph?.afterChange?.();
		graph?.change?.();
		graph?.setDirtyCanvas?.(true, true);
	}
}

export function applyQuickGroupManagerAction(node, sourceId, action) {
	const state = quickGroupManagerState(node);
	const groups = quickGroupManagerGroups(node);
	const groupsById = new Map(groups.map((group) => [String(group.id), group]));
	const scope = new Set(groups.filter((group) => groupMatchesFilter(group, state.filter)).map((group) => String(group.id)));
	const cascade = planLinkageCascade({ sourceId, action, rules: state.rules, scopedIds: scope, knownIds: groupsById.keys() });
	if (!cascade.ok) return cascade;
	const plan = planNodeModeChanges(cascade.assignments, groupsById, state.offMode);
	if (!plan.ok) return plan;
	commitGraph(node, () => {
		for (const [target, mode] of plan.nodeModes) target.mode = mode;
	});
	return { ok: true, nodeModes: plan.nodeModes.size, action, sourceId: String(sourceId) };
}

export function setQuickGroupManagerOffMode(node, offMode) {
	if (offMode !== "mute" && offMode !== "bypass") return { ok: false, code: "invalidMode" };
	const state = quickGroupManagerState(node);
	if (state.offMode === offMode) return { ok: true, changed: false };
	const groups = quickGroupManagerGroups(node);
	const scoped = groups.filter((group) => groupMatchesFilter(group, state.filter));
	const assignments = new Map(scoped.filter((group) => classifyGroupNodes(group.nodes) === GROUP_STATE.DISABLED).map((group) => [String(group.id), "disable"]));
	const plan = planNodeModeChanges(assignments, new Map(groups.map((group) => [String(group.id), group])), offMode);
	if (!plan.ok) return plan;
	commitGraph(node, () => {
		state.offMode = offMode;
		for (const [target, mode] of plan.nodeModes) target.mode = mode;
	});
	return { ok: true, changed: true, nodeModes: plan.nodeModes.size, offMode };
}
