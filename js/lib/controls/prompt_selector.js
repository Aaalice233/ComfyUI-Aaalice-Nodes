/** Sidebar renderer for the shared PromptSelector library surface. */

import { controlView } from "./contract.js";

export function renderPromptSelectorControl(spec) {
	const createSidebarControl = spec.options?.createSidebarControl;
	if (typeof createSidebarControl !== "function") throw new TypeError("Prompt Selector control is missing its sidebar factory");
	const view = createSidebarControl();
	return controlView({
		root: view.root,
		kind: "prompt-selector",
		update: () => view.update?.(spec),
		destroy: () => view.destroy?.(),
	});
}
