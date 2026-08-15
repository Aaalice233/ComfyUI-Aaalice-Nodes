/** Shared QuickGroupManager state and mode actions for the node and sidebar control. */

import {
	GROUP_MODE,
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

function iterableItems(value) {
	if (Array.isArray(value)) return value;
	if (value && typeof value[Symbol.iterator] === "function") return [...value];
	return [];
}

function isGroupLike(value) {
	return typeof value?.recomputeInsideNodes === "function";
}

function isNodeLike(value) {
	return value && !isGroupLike(value) && value.mode != null;
}

function collectGroupNodes(group, seenGroups = new Set(), seenNodes = new Set()) {
	if (!group || seenGroups.has(group)) return [];
	seenGroups.add(group);
	const result = [];
	const addNode = (candidate) => {
		if (!isNodeLike(candidate) || seenNodes.has(candidate)) return;
		seenNodes.add(candidate);
		result.push(candidate);
	};
	for (const candidate of Array.isArray(group.nodes) ? group.nodes : []) addNode(candidate);
	const children = [...iterableItems(group.children), ...iterableItems(group._children)];
	for (const child of children) {
		if (isGroupLike(child)) {
			for (const nested of collectGroupNodes(child, seenGroups, seenNodes)) result.push(nested);
		} else addNode(child);
	}
	return result;
}

function rectangle(value) {
	if (!value) return null;
	const result = [value[0] ?? value.x, value[1] ?? value.y, value[2] ?? value.width, value[3] ?? value.height].map(Number);
	return result.every(Number.isFinite) ? result : null;
}

function geometricGroupNodes(group, graph) {
	const bounds = rectangle(group?._bounding);
	if (!bounds) return [];
	const graphNodes = iterableItems(graph?.nodes);
	const nodes = graphNodes.length ? graphNodes : iterableItems(graph?._nodes);
	return nodes.filter((candidate) => {
		if (!isNodeLike(candidate)) return false;
		const boundsForNode = rectangle(candidate.boundingRect) || rectangle([
			candidate.pos?.[0], candidate.pos?.[1], candidate.size?.[0], candidate.size?.[1],
		]);
		if (!boundsForNode) return false;
		const centerX = boundsForNode[0] + boundsForNode[2] / 2;
		const centerY = boundsForNode[1] + boundsForNode[3] / 2;
		return centerX >= bounds[0] && centerX < bounds[0] + bounds[2]
			&& centerY >= bounds[1] && centerY < bounds[1] + bounds[3];
	});
}

function sameNodes(left, right) {
	return Array.isArray(left) && left.length === right.length && left.every((node, index) => node === right[index]);
}

function groupView(group, nodes) {
	if (sameNodes(group.nodes, nodes) || (!Array.isArray(group.nodes) && nodes.length === 0)) return group;
	return { ...group, nodes };
}

export function quickGroupManagerGroups(node) {
	const graph = node?.graph;
	const groups = Array.isArray(graph?._groups) ? graph._groups.filter(Boolean) : [];
	return groups.map((group) => {
		let refreshFailed = false;
		try {
			group.recomputeInsideNodes?.();
		} catch (error) {
			refreshFailed = true;
			// A partially restored graph can fail while rebuilding one group. Keep its cached members so one bad group cannot blank the whole sidebar.
			console.error("[Aaalice] Could not refresh QuickGroupManager group members", group, error);
		}
		let nodes = collectGroupNodes(group);
		if (!nodes.length) nodes = geometricGroupNodes(group, graph);
		if (!nodes.length && refreshFailed && Array.isArray(group.nodes)) nodes = group.nodes;
		return groupView(group, nodes);
	});
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
	const graph = node?.graph;
	const graphNodes = iterableItems(graph?.nodes);
	const managers = new Set([node, ...(graphNodes.length ? graphNodes : iterableItems(graph?._nodes)).filter(isQuickGroupManager)]);
	for (const manager of managers) {
		for (const refresh of manager?._aaaliceQuickGroupControlRefreshes || []) refresh();
	}
}

function nodeIdentity(node) {
	return node?.id == null ? null : String(node.id);
}

export function quickGroupManagerPresetSnapshot(node) {
	const snapshot = quickGroupManagerSnapshot(node);
	return {
		version: 2,
		groups: snapshot.groups.map((group) => ({
			id: String(group.id),
			nodes: (Array.isArray(group.nodes) ? group.nodes : []).map((member) => ({ id: nodeIdentity(member), enabled: Number(member?.mode ?? GROUP_MODE.ALWAYS) === GROUP_MODE.ALWAYS })).filter((member) => member.id),
		})),
	};
}

export function validateQuickGroupManagerPreset(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || ![1, 2].includes(Number(value.version)) || !Array.isArray(value.groups)) return "invalid-manager-state";
	for (const group of value.groups) {
		if (!group || group.id == null || !Array.isArray(group.nodes)) return "invalid-manager-state";
		const invalid = Number(value.version) === 1
			? group.nodes.some((member) => member?.id == null || ![GROUP_MODE.ALWAYS, GROUP_MODE.NEVER, GROUP_MODE.BYPASS].includes(Number(member.mode)))
			: group.nodes.some((member) => member?.id == null || typeof member.enabled !== "boolean");
		if (invalid) return "invalid-manager-state";
	}
	return true;
}

export function applyQuickGroupManagerPreset(node, value, { transaction = true } = {}) {
	const validation = validateQuickGroupManagerPreset(value);
	if (validation !== true) return { ok: false, code: validation };
	const groups = quickGroupManagerGroups(node);
	const groupsById = new Map(groups.map((group) => [String(group.id), group]));
	const offMode = quickGroupManagerState(node, { persist: false }).offMode;
	const nodeModes = new Map();
	for (const savedGroup of value.groups) {
		const group = groupsById.get(String(savedGroup.id));
		if (!group) continue;
		const membersById = new Map((Array.isArray(group.nodes) ? group.nodes : []).map((member) => [nodeIdentity(member), member]));
		for (const savedMember of savedGroup.nodes) {
			const member = membersById.get(String(savedMember.id));
			if (!member) continue;
			const enabled = Number(value.version) === 1 ? Number(savedMember.mode) === GROUP_MODE.ALWAYS : savedMember.enabled;
			const mode = enabled ? GROUP_MODE.ALWAYS : offMode === "bypass" ? GROUP_MODE.BYPASS : GROUP_MODE.NEVER;
			const previous = nodeModes.get(member);
			if (previous != null && previous !== mode) return { ok: false, code: "nodeConflict" };
			nodeModes.set(member, mode);
		}
	}
	commitGraph(node, () => {
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
