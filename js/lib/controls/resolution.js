/** Sidebar renderer for the shared ResolutionPreset editor. */

import { controlView } from "./contract.js";

export function renderResolutionControl(spec) {
	const createSidebarControl = spec.options?.createSidebarControl;
	if (typeof createSidebarControl !== "function") throw new TypeError("Resolution control is missing its sidebar factory");
	const view = createSidebarControl();
	return controlView({
		root: view.root,
		kind: "resolution",
		update: () => view.update?.(spec),
		destroy: () => view.destroy?.(),
	});
}
