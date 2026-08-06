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

/**
 * The add-controls picker works with Provider control descriptors; unwrap the
 * binding once at that UI boundary so identity matching cannot receive the
 * descriptor itself by accident.
 */
export function createControlBindingMatcher(bindings, resolve = null) {
	const matchesBinding = createBindingTargetMatcher(bindings, resolve);
	return (control) => matchesBinding(control?.binding);
}

/**
 * controlId 面向用户的可读形式：promoted 元组还原为来源 widget 名，
 * 避免把持久化 JSON 身份直接展示在界面文案里。
 */
export function bindingControlIdLabel(binding) {
	const controlId = String(binding?.controlId ?? "");
	if (controlId.startsWith("promoted:")) {
		try {
			const tuple = JSON.parse(controlId.slice("promoted:".length));
			if (Array.isArray(tuple) && typeof tuple[1] === "string" && tuple[1]) return tuple[1];
		} catch { /* fall through to the raw id */ }
	}
	return controlId;
}
