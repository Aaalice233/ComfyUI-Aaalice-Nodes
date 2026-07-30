/** Surface-neutral contracts for shared parameter controls. */

const CONTROL_AVAILABILITY_STATES = new Set(["ready", "empty", "unset", "unavailable", "error"]);

export function normalizeControlSpec(spec = {}) {
	if (typeof spec.kind !== "string" || !spec.kind) throw new TypeError("Shared control kind must be a non-empty string");
	const availability = spec.availability && typeof spec.availability === "object" ? spec.availability : { state: "ready" };
	if (!CONTROL_AVAILABILITY_STATES.has(availability.state || "ready")) throw new TypeError(`Invalid control availability state: ${availability.state}`);
	return Object.freeze({
		id: String(spec.id || ""),
		family: spec.family === "comfy" ? "comfy" : "aaalice",
		kind: spec.kind,
		label: String(spec.label || spec.id || "Parameter"),
		value: spec.value,
		options: Object.freeze({ ...(spec.options || {}) }),
		labels: Object.freeze({ ...(spec.labels || {}) }),
		presentation: Object.freeze({ ...(spec.presentation || {}) }),
		availability: Object.freeze({ state: String(availability.state || "ready"), reason: String(availability.reason || ""), message: String(availability.message || "") }),
	});
}

export function controlPort(callbacks = {}) {
	const call = (name) => (...args) => callbacks[name]?.(...args);
	return Object.freeze({
		preview: call("preview"),
		commit: call("commit"),
		beginGesture: call("beginGesture"),
		endGesture: call("endGesture"),
		setSeedBehavior: call("setSeedBehavior"),
		onError: call("onError"),
		onSuccess: call("onSuccess"),
	});
}

export function controlView({ root, headerAccessories = [], kind, headerOnly = false, update = null, destroy = null }) {
	if (!root) throw new TypeError("Shared control renderer must return a root element");
	root.dataset.controlKind = kind;
	return {
		root,
		headerAccessories: [...headerAccessories],
		kind,
		headerOnly: Boolean(headerOnly),
		update: typeof update === "function" ? update : () => {},
		destroy: typeof destroy === "function" ? destroy : () => {},
	};
}
