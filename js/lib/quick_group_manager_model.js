/** Pure state, filtering, ordering and linkage planning for QuickGroupManager. */

export const QUICK_GROUP_STATE_VERSION = 1;
export const GROUP_MODE = Object.freeze({ ALWAYS: 0, NEVER: 2, BYPASS: 4 });
export const GROUP_STATE = Object.freeze({ ENABLED: "enabled", DISABLED: "disabled", MIXED: "mixed", EMPTY: "empty" });

// Keep the native group colors first so the filter matches ComfyUI's built-in palette,
// then offer a denser set for workflows that use custom group colors.
export const QUICK_GROUP_COLOR_PALETTE = Object.freeze([
	"#a88", "#b06634", "#8a8", "#88a", "#3f789e", "#8aa", "#a1309b", "#b58b2a", "#444",
	"#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981",
	"#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
	"#d946ef", "#ec4899", "#f43f5e", "#795548", "#607d8b",
]);

const ACTIONS = new Set(["enable", "disable"]);
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

export function normalizeColor(value) {
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function normalizeHexColor(value) {
	const color = normalizeColor(value);
	return color && HEX_COLOR.test(color) ? color : null;
}

function normalizeFilter(raw) {
	const colors = [...new Set((Array.isArray(raw?.colors) ? raw.colors : []).map(normalizeColor).filter(Boolean))];
	const customColors = [...new Set((Array.isArray(raw?.customColors) ? raw.customColors : []).map(normalizeHexColor).filter(Boolean))];
	return {
		mode: raw?.mode === "selected" ? "selected" : "all",
		colors,
		customColors,
		includeUncolored: Boolean(raw?.includeUncolored),
	};
}

function normalizeRulePhase(raw) {
	const phase = {};
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return phase;
	for (const [targetId, action] of Object.entries(raw)) {
		if (ACTIONS.has(action)) phase[String(targetId)] = action;
	}
	return phase;
}

function normalizeRules(raw) {
	const rules = {};
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return rules;
	for (const [sourceId, value] of Object.entries(raw)) {
		const enable = normalizeRulePhase(value?.enable);
		const disable = normalizeRulePhase(value?.disable);
		if (Object.keys(enable).length || Object.keys(disable).length) rules[String(sourceId)] = { enable, disable };
	}
	return rules;
}

export function normalizeQuickGroupState(raw) {
	return {
		version: QUICK_GROUP_STATE_VERSION,
		offMode: raw?.offMode === "bypass" ? "bypass" : "mute",
		filter: normalizeFilter(raw?.filter),
		groupOrder: [...new Set((Array.isArray(raw?.groupOrder) ? raw.groupOrder : []).map(String))],
		rules: normalizeRules(raw?.rules),
	};
}

export function groupMatchesFilter(group, filter) {
	if (filter?.mode !== "selected") return true;
	const color = normalizeColor(group?.color);
	return color ? (filter.colors || []).includes(color) : Boolean(filter.includeUncolored);
}

export function reconcileGroupOrder(order, groups) {
	const ids = groups.map((group) => String(group.id));
	const live = new Set(ids);
	const result = [];
	for (const id of Array.isArray(order) ? order.map(String) : []) {
		if (!result.includes(id)) result.push(id);
	}
	for (const id of ids) if (!result.includes(id)) result.push(id);
	// Keep missing ids at the tail so stale rules/order remain inspectable if an id returns.
	return [...result.filter((id) => live.has(id)), ...result.filter((id) => !live.has(id))];
}

export function orderedVisibleGroups(groups, state) {
	const order = reconcileGroupOrder(state.groupOrder, groups);
	const rank = new Map(order.map((id, index) => [id, index]));
	return groups
		.filter((group) => groupMatchesFilter(group, state.filter))
		.sort((a, b) => (rank.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER));
}

export function reorderVisibleGroups(order, visibleIds, sourceId, targetId) {
	const source = String(sourceId);
	const target = String(targetId);
	const visible = visibleIds.map(String);
	const from = visible.indexOf(source);
	const to = visible.indexOf(target);
	if (from < 0 || to < 0 || from === to) return [...order];
	const [moved] = visible.splice(from, 1);
	visible.splice(to, 0, moved);
	const visibleSet = new Set(visible);
	let index = 0;
	return order.map((id) => visibleSet.has(String(id)) ? visible[index++] : String(id));
}

export function classifyGroupNodes(nodes) {
	if (!Array.isArray(nodes) || nodes.length === 0) return GROUP_STATE.EMPTY;
	const modes = nodes.map((node) => Number(node?.mode ?? GROUP_MODE.ALWAYS));
	if (modes.every((mode) => mode === GROUP_MODE.ALWAYS)) return GROUP_STATE.ENABLED;
	if (modes.every((mode) => mode === GROUP_MODE.NEVER || mode === GROUP_MODE.BYPASS)) return GROUP_STATE.DISABLED;
	return GROUP_STATE.MIXED;
}

export function ruleCount(rules, sourceId) {
	const rule = rules?.[String(sourceId)];
	return Object.keys(rule?.enable || {}).length + Object.keys(rule?.disable || {}).length;
}

function vertexKey(groupId, action) {
	return `${String(groupId)}\u0000${action}`;
}

function outgoing(rules, scopedIds, groupId, action) {
	if (!scopedIds.has(String(groupId))) return [];
	return Object.entries(rules?.[String(groupId)]?.[action] || {}).map(([targetId, targetAction]) => [String(targetId), targetAction]);
}

export function validateLinkageRules(rules, scopedIds, knownIds) {
	const normalized = normalizeRules(rules);
	const scope = new Set([...scopedIds].map(String));
	const known = new Set([...knownIds].map(String));
	for (const [sourceId, phases] of Object.entries(normalized)) {
		// Stale source rules are preserved for Id restoration but cannot participate until that source returns.
		if (!known.has(sourceId)) continue;
		for (const phase of ["enable", "disable"]) {
			for (const targetId of Object.keys(phases[phase])) {
				if (sourceId === targetId) return { ok: false, code: "self", groupId: sourceId };
				if (!known.has(targetId)) return { ok: false, code: "missing", groupId: targetId };
			}
		}
	}

	const visiting = new Set();
	const visited = new Set();
	const visit = (groupId, action) => {
		const key = vertexKey(groupId, action);
		if (visiting.has(key)) return { ok: false, code: "cycle", groupId };
		if (visited.has(key)) return { ok: true };
		visiting.add(key);
		for (const [targetId, targetAction] of outgoing(normalized, scope, groupId, action)) {
			const result = visit(targetId, targetAction);
			if (!result.ok) return result;
		}
		visiting.delete(key);
		visited.add(key);
		return { ok: true };
	};
	for (const sourceId of Object.keys(normalized)) {
		if (!known.has(sourceId)) continue;
		for (const action of ["enable", "disable"]) {
			const cycle = visit(sourceId, action);
			if (!cycle.ok) return cycle;
			const plan = planLinkageCascade({ sourceId, action, rules: normalized, scopedIds: scope, knownIds: known });
			if (!plan.ok) return plan;
		}
	}
	return { ok: true };
}

export function planLinkageCascade({ sourceId, action, rules, scopedIds, knownIds }) {
	const scope = new Set([...scopedIds].map(String));
	const known = new Set([...knownIds].map(String));
	const assignments = new Map();
	const queue = [[String(sourceId), action]];
	const expanded = new Set();
	while (queue.length) {
		const [groupId, desired] = queue.shift();
		if (!known.has(groupId)) return { ok: false, code: "missing", groupId };
		const previous = assignments.get(groupId);
		if (previous && previous !== desired) return { ok: false, code: "conflict", groupId };
		assignments.set(groupId, desired);
		const key = vertexKey(groupId, desired);
		if (expanded.has(key)) continue;
		expanded.add(key);
		for (const next of outgoing(rules, scope, groupId, desired)) queue.push(next);
	}
	return { ok: true, assignments };
}

export function planNodeModeChanges(assignments, groupsById, offMode) {
	const nodeModes = new Map();
	for (const [groupId, action] of assignments) {
		const group = groupsById.get(String(groupId));
		if (!group) return { ok: false, code: "missing", groupId };
		if (!Array.isArray(group.nodes) || group.nodes.length === 0) return { ok: false, code: "empty", groupId };
		const mode = action === "enable" ? GROUP_MODE.ALWAYS : offMode === "bypass" ? GROUP_MODE.BYPASS : GROUP_MODE.NEVER;
		for (const node of group.nodes) {
			const previous = nodeModes.get(node);
			if (previous != null && previous !== mode) return { ok: false, code: "nodeConflict", groupId };
			nodeModes.set(node, mode);
		}
	}
	return { ok: true, nodeModes };
}
