/** Extensible renderer registry for native ComfyUI widget controls. */

import { COMFY_CONTROL_RENDERERS } from "./comfy.js";
import { renderControlAvailability } from "./availability.js";
import { controlPort, normalizeControlSpec } from "./contract.js";

const families = new Map([["comfy", new Map(Object.entries(COMFY_CONTROL_RENDERERS))]]);

export function registerControlRenderer(family, kind, renderer) {
	if (!families.has(family)) throw new TypeError(`Unsupported control family: ${family}`);
	if (typeof kind !== "string" || !kind) throw new TypeError("Control renderer kind must be a non-empty string");
	if (typeof renderer !== "function") throw new TypeError("Control renderer must be a function");
	const renderers = families.get(family);
	if (renderers.has(kind)) throw new Error(`Duplicate ${family} control renderer: ${kind}`);
	renderers.set(kind, renderer);
	return () => { if (renderers.get(kind) === renderer) renderers.delete(kind); };
}

export function createSharedControl(rawSpec, callbacks = {}) {
	const spec = normalizeControlSpec(rawSpec); const renderer = families.get(spec.family)?.get(spec.kind);
	if (spec.availability.state === "ready" && !renderer) throw new TypeError(`No ${spec.family} renderer registered for ${spec.kind}`);
	const view = spec.availability.state === "ready" ? renderer(spec, controlPort(callbacks)) : renderControlAvailability(spec);
	view.root.classList.add("aa-control-family", `aa-control-family-${spec.family}`);
	view.root.dataset.controlAvailability = spec.availability.state;
	view.root._aaControlDestroy = view.destroy;
	return view;
}

export function registeredControlKinds(family) { return [...(families.get(family)?.keys() || [])]; }

export function destroySharedControls(container) {
	for (const root of container?.querySelectorAll?.(".aa-control-family") || []) {
		root._aaControlDestroy?.(); root._aaControlDestroy = null;
	}
}
