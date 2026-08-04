/** Event-only invalidation surface shared by the workspace and third-party adapters. */

export const CONTROL_HOST_INVALIDATED_EVENT = "aaalice-control-host-invalidated";
export const CONTROL_ADAPTER_REGISTRY_CHANGED_EVENT = "aaalice-control-adapter-registry-changed";
export const CONTROL_RENDERER_REGISTRY_CHANGED_EVENT = "aaalice-control-renderer-registry-changed";

function dispatchControlEvent(type, detail = {}) {
	if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
		globalThis.dispatchEvent(new globalThis.CustomEvent(type, { detail }));
	}
}

export function invalidateControlHost(node) {
	node?.setDirtyCanvas?.(true, true);
	dispatchControlEvent(CONTROL_HOST_INVALIDATED_EVENT, { node });
}

export function notifyControlAdapterRegistryChanged(revision) {
	dispatchControlEvent(CONTROL_ADAPTER_REGISTRY_CHANGED_EVENT, { revision });
}

export function notifyControlRendererRegistryChanged(detail = {}) {
	dispatchControlEvent(CONTROL_RENDERER_REGISTRY_CHANGED_EVENT, detail);
}
