/** Shared QuickGroupManager state and mode actions for the node and sidebar control. */

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

function commitGraph(node, mutate, { transaction = true } = {}) {
	const graph = node?.graph;
	if (!transaction) {
		mutate();
		refreshQuickGroupManagerControls(node);
		return;
	}
	graph?.beforeChange?.();
	try {
		mutate();
	} finally {
		graph?.afterChange?.();
		graph?.change?.();
		graph?.setDirtyCanvas?.(true, true);
		refreshQuickGroupManagerControls(node);
	}
}

export function refreshQuickGroupManagerControls(node) {
	for (const refresh of node?._aaaliceQuickGroupControlRefreshes || []) refresh();
}

function nodeIdentity(node) {
	return node?.id == null ? null : String(node.id);
}

export function quickGroupManagerPresetSnapshot(node) {
	const snapshot = quickGroupManagerSnapshot(node);
	return {
		version: 1,
		state: structuredClone(snapshot.state),
		groups: snapshot.groups.map((group) => ({
			id: String(group.id),
			nodes: (Array.isArray(group.nodes) ? group.nodes : []).map((member) => ({ id: nodeIdentity(member), mode: Number(member?.mode ?? 0) })).filter((member) => member.id),
		})),
	};
}

export function validateQuickGroupManagerPreset(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid-manager-state";
	if (!value.state || typeof value.state !== "object" || !Array.isArray(value.groups)) return "invalid-manager-state";
	for (const group of value.groups) {
		if (!group || group.id == null || !Array.isArray(group.nodes)) return "invalid-manager-state";
		if (group.nodes.some((member) => member?.id == null || ![0, 2, 4].includes(Number(member.mode)))) return "invalid-manager-state";
	}
	return true;
}

export function applyQuickGroupManagerPreset(node, value, { transaction = true } = {}) {
	const validation = validateQuickGroupManagerPreset(value);
	if (validation !== true) return { ok: false, code: validation };
	const groups = quickGroupManagerGroups(node);
	const groupsById = new Map(groups.map((group) => [String(group.id), group]));
	const nodeModes = new Map();
	for (const savedGroup of value.groups) {
		const group = groupsById.get(String(savedGroup.id));
		if (!group) continue;
		const membersById = new Map((Array.isArray(group.nodes) ? group.nodes : []).map((member) => [nodeIdentity(member), member]));
		for (const savedMember of savedGroup.nodes) {
			const member = membersById.get(String(savedMember.id));
			if (!member) continue;
			const mode = Number(savedMember.mode);
			const previous = nodeModes.get(member);
			if (previous != null && previous !== mode) return { ok: false, code: "nodeConflict" };
			nodeModes.set(member, mode);
		}
	}
	const nextState = normalizeQuickGroupState(value.state);
	commitGraph(node, () => {
		node.properties ||= {};
		node.properties[PROPERTY] = nextState;
		for (const [member, mode] of nodeModes) member.mode = mode;
	}, { transaction });
	return { ok: true, changedGroups: groupsById.size, changedNodes: nodeModes.size };
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
