/** Dashboard projection for the node-owned Booru Gallery runtime. */
import { controlView } from "./contract.js";

export function renderBooruGalleryControl(spec) {
	const createSidebarControl = spec.options?.createSidebarControl;
	if (typeof createSidebarControl !== "function") throw new TypeError("Booru Gallery control is missing its sidebar factory");
	const view = createSidebarControl();
	return controlView({
		root: view.root,
		kind: "booru-gallery",
		update: () => view.update?.(),
		destroy: () => view.destroy?.(),
	});
}
