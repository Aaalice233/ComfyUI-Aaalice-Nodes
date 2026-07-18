/** Shared boolean control renderer. */

import { el, toggleSwitch } from "../ui.js";
import { controlView } from "./contract.js";

export function renderBooleanControl(spec, port) {
	let current = Boolean(spec.value);
	const root = el("div", `aa-control aa-control-boolean${spec.presentation.compact ? " is-compact" : ""}`);
	const label = el("span", "aa-control-boolean-label");
	const toggle = toggleSwitch({ checked: current, label: spec.label, className: "aa-control-boolean-toggle", onChange: (next) => {
		current = next; sync(); port.commit(next);
	} });
	const sync = () => { toggle.setChecked(current); label.textContent = current ? (spec.labels.enabled || "Enabled") : (spec.labels.disabled || "Disabled"); };
	root.append(toggle, label); sync();
	return controlView({ root, kind: "boolean", headerOnly: Boolean(spec.presentation.headerOnly), update: (next) => { current = Boolean(next.value); sync(); } });
}
