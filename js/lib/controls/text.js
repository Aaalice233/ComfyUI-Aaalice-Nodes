/** Shared single-line and multiline text control renderer. */

import { controlView } from "./contract.js";

export function renderTextControl(spec, port) {
	const input = spec.options.multiline ? document.createElement("textarea") : document.createElement("input");
	if (!spec.options.multiline) input.type = "text";
	input.className = `aa-control aa-control-text${spec.options.multiline ? " is-multiline" : ""}`;
	input.value = String(spec.value ?? ""); input.setAttribute("aria-label", spec.label);
	input.addEventListener("input", () => port.preview(input.value));
	input.addEventListener("change", () => port.commit(input.value));
	return controlView({ root: input, kind: "text", update: (next) => { if (document.activeElement !== input) input.value = String(next.value ?? ""); } });
}
