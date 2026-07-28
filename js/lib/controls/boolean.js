/** Shared boolean control renderer. */

import { el, toggleSwitch } from "../ui.js";
import { controlView } from "./contract.js";

export function renderBooleanControl(spec, port) {
	let current = Boolean(spec.value);
	const root = el("div", `aa-control aa-control-boolean${spec.presentation.compact ? " is-compact" : ""}`);
	const dot = el("span", { className: "aa-control-boolean-dot", attrs: { "aria-hidden": "true" } });
	const state = el("span", "aa-control-boolean-state");
	// 状态文案与 switch 的 aria-checked 表达同一信息，读屏只保留后者。
	const status = el("span", { className: "aa-control-boolean-status", attrs: { "aria-hidden": "true" }, children: [dot, state] });
	const toggle = toggleSwitch({ checked: current, label: spec.label, className: "aa-control-boolean-toggle", onChange: (next) => {
		current = next; sync(); port.commit(next);
	} });
	const sync = () => {
		toggle.setChecked(current);
		root.classList.toggle("is-on", current);
		state.textContent = current ? (spec.labels.enabled || "Enabled") : (spec.labels.disabled || "Disabled");
	};
	// 整行都是点击目标；toggle 自身已处理点击，避免冒泡后二次触发。
	root.addEventListener("click", (event) => { if (!(event.target instanceof Element && event.target.closest(".aa-ui-toggle"))) toggle.click(); });
	root.append(status, toggle); sync();
	return controlView({ root, kind: "boolean", headerOnly: Boolean(spec.presentation.headerOnly), update: (next) => { current = Boolean(next.value); sync(); } });
}
