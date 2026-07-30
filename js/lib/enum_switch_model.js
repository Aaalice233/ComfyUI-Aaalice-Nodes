/** Pure workflow state and synchronization model for EnumSwitch. */
import {
	findGraphNode,
	graphAncestors,
	graphId,
} from "./graph_scope.js";

export const ENUM_SWITCH_VERSION = 1;
export const MAX_ENUM_BRANCHES = 32;

function newRouteId() {
	if (globalThis.crypto?.randomUUID) return `route_${globalThis.crypto.randomUUID()}`;
	return `route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createRoute(key) {
	return { id: newRouteId(), key: String(key || "").trim() };
}

export function defaultEnumSwitchState() {
	return {
		version: ENUM_SWITCH_VERSION,
		binding: null,
		routes: [createRoute("option_a"), createRoute("option_b")],
	};
}

export function normalizeEnumSwitchState(value) {
	const fallback = defaultEnumSwitchState();
	if (!value || typeof value !== "object") return fallback;
	const seenIds = new Set();
	const routes = Array.isArray(value.routes) ? value.routes.slice(0, MAX_ENUM_BRANCHES).map((route) => {
		let id = String(route?.id || "").trim();
		if (!id || seenIds.has(id)) id = newRouteId();
		seenIds.add(id);
		return { id, key: String(route?.key || "").trim() };
	}) : fallback.routes;
	const binding = value.binding && typeof value.binding === "object"
		&& value.binding.panelNodeId != null && String(value.binding.parameterId || "")
		? {
			panelNodeId: value.binding.panelNodeId,
			parameterId: String(value.binding.parameterId),
			...(value.binding.panelGraphId != null ? { panelGraphId: String(value.binding.panelGraphId) } : {}),
		}
		: null;
	return {
		version: ENUM_SWITCH_VERSION,
		binding,
		routes: routes.length ? routes : fallback.routes,
	};
}

export function validateEnumRoutes(routes) {
	if (!Array.isArray(routes) || routes.length < 1 || routes.length > MAX_ENUM_BRANCHES) {
		return [`EnumSwitch requires 1 to ${MAX_ENUM_BRANCHES} branches.`];
	}
	const ids = new Set();
	const keys = new Set();
	const errors = [];
	for (const route of routes) {
		const id = String(route?.id || "").trim();
		const key = String(route?.key || "").trim();
		if (!id || ids.has(id)) errors.push("Branch ids must be unique.");
		if (!key) errors.push("Branch keys cannot be empty.");
		else if (keys.has(key)) errors.push(`Duplicate branch key: ${key}`);
		ids.add(id);
		keys.add(key);
	}
	return [...new Set(errors)];
}

export function enumRouteDiff(routes, options) {
	const current = (routes || []).map((route) => String(route.key));
	const expected = (options || []).map(String);
	const added = expected.filter((key) => !current.includes(key));
	const removed = current.filter((key) => !expected.includes(key));
	const reordered = !added.length && !removed.length
		&& expected.some((key, index) => current[index] !== key);
	return { added, removed, reordered, changed: Boolean(added.length || removed.length || reordered) };
}

export function reconcileEnumRoutes(routes, options) {
	const previous = new Map((routes || []).map((route) => [String(route.key), route]));
	const ordered = (options || []).slice(0, MAX_ENUM_BRANCHES).map((option) => {
		const key = String(option);
		return previous.get(key) || createRoute(key);
	});
	const expected = new Set(ordered.map((route) => route.key));
	return {
		ordered,
		added: ordered.filter((route) => !(routes || []).some((item) => item.id === route.id)),
		removed: (routes || []).filter((route) => !expected.has(String(route.key))),
	};
}

export function enumPromptPayload(stateValue) {
	const state = normalizeEnumSwitchState(stateValue);
	const errors = validateEnumRoutes(state.routes);
	if (errors.length) throw new Error(errors.join(" "));
	return {
		version: ENUM_SWITCH_VERSION,
		routes: state.routes.map((route, index) => ({
			id: route.id,
			key: route.key,
			input: `branch_${index + 1}`,
		})),
	};
}

export function bindingFromDirectSource(source, originSlot) {
	const kinds = [source?.comfyClass, source?.type, source?.constructor?.comfyClass, source?.constructor?.nodeData?.name];
	if (kinds.includes("ParameterPanel")) {
		const parameterId = source.outputs?.[originSlot]?._aaaliceParamId
			|| source.properties?.slotMeta?.[originSlot]?.id;
		return parameterId ? {
			panelNodeId: source.id,
			parameterId: String(parameterId),
			...(source.graph ? { panelGraphId: graphId(source.graph) } : {}),
		} : null;
	}
	if (kinds.includes("ParameterReceiver")) {
		const binding = source.properties?.receiverBinding;
		const parameterId = binding?.slots?.[originSlot]?.parameterId;
		return binding?.panelNodeId != null && parameterId
			? {
				panelNodeId: binding.panelNodeId,
				parameterId: String(parameterId),
				...(binding.panelGraphId != null ? { panelGraphId: String(binding.panelGraphId) } : {}),
			}
			: null;
	}
	return null;
}

function outputSlotFromResolved(resolved, fallbackSlot) {
	const source = resolved?.outputNode;
	const resolvedSlot = source?.outputs?.indexOf?.(resolved.output);
	return resolvedSlot != null && resolvedSlot >= 0 ? resolvedSlot : fallbackSlot;
}

/**
 * Follow ComfyUI's virtual-output protocol so a KJ Get can expose the same
 * stable Parameter binding as its upstream ParameterPanel/Receiver output.
 */
export function bindingFromLogicalSource(source, originSlot, visited = new Map()) {
	if (!source) return null;
	const slot = Number(originSlot);
	const slots = visited.get(source) || new Set();
	if (slots.has(slot)) return null;
	slots.add(slot);
	visited.set(source, slots);

	const direct = bindingFromDirectSource(source, slot);
	if (direct) return direct;
	const kinds = [source?.comfyClass, source?.type, source?.constructor?.comfyClass];
	if (!source.isVirtualNode && !kinds.includes("GetNode")) return null;

	// This is the same resolution order used by ComfyUI's ExecutableNodeDTO:
	// cross-graph virtual source first, same-graph virtual input link second.
	const virtualSource = source.resolveVirtualOutput?.(slot);
	if (virtualSource?.node) {
		return bindingFromLogicalSource(virtualSource.node, virtualSource.slot, visited);
	}
	const virtualLink = source.getInputLink?.(slot);
	if (!virtualLink) return null;
	const resolved = typeof virtualLink.resolve === "function"
		? virtualLink.resolve(source.graph)
		: null;
	const upstream = resolved?.outputNode
		|| source.graph?.getNodeById?.(virtualLink.origin_id)
		|| source.graph?._nodes?.find((node) => String(node?.id) === String(virtualLink.origin_id));
	return bindingFromLogicalSource(
		upstream,
		outputSlotFromResolved(resolved, virtualLink.origin_slot),
		visited,
	);
}

export function boundPanelNode(contextGraph, binding, isPanel = () => true) {
	if (!contextGraph || !binding || binding.panelNodeId == null) return null;
	const graphs = graphAncestors(contextGraph);
	if (binding.panelGraphId != null) {
		const graph = graphs.find((candidate) => graphId(candidate) === String(binding.panelGraphId));
		const candidate = findGraphNode(graph, binding.panelNodeId);
		return isPanel(candidate) ? candidate : null;
	}
	for (const graph of graphs) {
		const candidate = findGraphNode(graph, binding.panelNodeId);
		if (isPanel(candidate)) return candidate;
	}
	return null;
}
