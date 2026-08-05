import { bindingKey, bindingTargetKey } from "./dashboard_model.js";

function bindingScopeKey(binding) {
	return JSON.stringify([binding.provider, binding.hostId]);
}

function resolvedWidget(binding, resolve) {
	try {
		const resolved = resolve(binding);
		return resolved?.status === "ok" ? resolved.widget : null;
	} catch (error) {
		console.error("[Aaalice] Unable to resolve a dashboard control binding for identity comparison", { binding, error });
		return null;
	}
}

/**
 * Saved promoted-widget bindings may use the widget name from before the
 * canonical source-node identity was available; resolution is the only safe
 * way to prove that both ids still point to the same state owner.
 */
export function sameBindingTarget(left, right, resolve = null) {
	if (!left || !right) return false;
	if (bindingTargetKey(left) === bindingTargetKey(right)) return true;
	if (left.provider !== right.provider || left.hostId !== right.hostId || typeof resolve !== "function") return false;
	const leftWidget = resolvedWidget(left, resolve);
	const rightWidget = resolvedWidget(right, resolve);
	return Boolean(leftWidget && leftWidget === rightWidget);
}

export function createBindingTargetMatcher(bindings, resolve = null) {
	const groups = new Map();
	for (const binding of bindings || []) {
		if (!binding) continue;
		const scope = bindingScopeKey(binding);
		let group = groups.get(scope);
		if (!group) { group = { targetKeys: new Set(), widgets: new Set() }; groups.set(scope, group); }
		group.targetKeys.add(bindingTargetKey(binding));
		if (typeof resolve === "function") {
			const widget = resolvedWidget(binding, resolve);
			if (widget) group.widgets.add(widget);
		}
	}
	const widgetCache = new Map();
	return (candidate) => {
		if (!candidate) return false;
		const group = groups.get(bindingScopeKey(candidate));
		if (!group) return false;
		if (group.targetKeys.has(bindingTargetKey(candidate))) return true;
		if (typeof resolve !== "function") return false;
		const key = bindingKey(candidate);
		if (!widgetCache.has(key)) widgetCache.set(key, resolvedWidget(candidate, resolve));
		const widget = widgetCache.get(key);
		return Boolean(widget && group.widgets.has(widget));
	};
}
