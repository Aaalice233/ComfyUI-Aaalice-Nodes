/** Event-only invalidation surface shared by the workspace and third-party adapters. */

export const CONTROL_HOST_INVALIDATED_EVENT = "aaalice-control-host-invalidated";

export function invalidateControlHost(node) {
	node?.setDirtyCanvas?.(true, true);
	if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
		globalThis.dispatchEvent(new globalThis.CustomEvent(CONTROL_HOST_INVALIDATED_EVENT, { detail: { node } }));
	}
}
