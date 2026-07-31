/** Whole-node QuickGroupManager control for the sidebar. */

import {
	applyQuickGroupManagerAction,
	quickGroupManagerSnapshot,
	setQuickGroupManagerOffMode,
} from "../quick_group_manager_runtime.js";
import { GROUP_STATE, classifyGroupNodes, normalizeColor } from "../quick_group_manager_model.js";
import { el, emptyState, iconButton, segmentedControl, toggleSwitch } from "../ui.js";
import { controlView } from "./contract.js";

const DEFAULT_LABELS = Object.freeze({
	title: "Quick Group Manager", groups: "groups", mute: "Mute", bypass: "Bypass", modeAria: "Disabled group mode",
	refresh: "Refresh groups", toggle: "Toggle {group}", untitled: "Untitled group", empty: "No visual groups are available in this graph.", emptyGroup: "This group has no nodes",
});

function normalizeLabels(labels) {
	return {
		...DEFAULT_LABELS,
		...(labels && typeof labels === "object" ? labels : {}),
	};
}

function statusClass(status) {
	return status === GROUP_STATE.ENABLED ? "is-enabled" : status === GROUP_STATE.MIXED ? "is-mixed" : status === GROUP_STATE.EMPTY ? "is-empty" : "is-disabled";
}

function createGroupRow(group, manager, labels, onRefresh, onError) {
	const nodes = Array.isArray(group.nodes) ? group.nodes : [];
	const status = classifyGroupNodes(nodes);
	const color = normalizeColor(group.color);
	const name = String(group.title || labels.untitled || "Untitled group");
	const hasNodes = nodes.length > 0;
	const toggleLabel = typeof labels.toggle === "string" ? labels.toggle : DEFAULT_LABELS.toggle;
	const toggle = toggleSwitch({
		checked: status === GROUP_STATE.ENABLED,
		disabled: !hasNodes,
		label: toggleLabel.replace("{group}", name),
		className: "aa-quick-group-control__toggle",
		onChange: () => {
			const action = classifyGroupNodes(nodes) === GROUP_STATE.ENABLED ? "disable" : "enable";
			const result = applyQuickGroupManagerAction(manager, group.id, action);
			if (!result.ok) onError?.(result);
			onRefresh();
		},
	});
	if (status === GROUP_STATE.MIXED) {
		toggle.classList.add("is-mixed");
		toggle.setAttribute("aria-checked", "mixed");
	}
	if (!hasNodes) toggle.title = labels.emptyGroup || DEFAULT_LABELS.emptyGroup;
	const row = el("div", {
		className: `aa-quick-group-control__row ${statusClass(status)}`,
		style: color ? { "--group-color": color } : {},
		attrs: { role: "group", tabindex: hasNodes ? "0" : "-1", "aria-disabled": String(!hasNodes), "aria-label": name },
		children: [
			el("span", { className: `aa-quick-group-control__marker${color ? "" : " is-uncolored"}`, attrs: { "aria-hidden": "true" } }),
			el("div", { className: "aa-quick-group-control__copy", children: [el("strong", { text: name })] }),
			toggle,
		],
	});
	const activate = () => { if (hasNodes) toggle.click(); };
	row.addEventListener("click", (event) => {
		if (event.target.closest("button")) return;
		activate();
	});
	row.addEventListener("keydown", (event) => {
		if (!hasNodes || !["Enter", " "].includes(event.key)) return;
		event.preventDefault();
		activate();
	});
	return row;
}

export function renderQuickGroupManagerControl(spec, port = {}) {
	const manager = spec.options?.manager;
	const labels = normalizeLabels(spec.labels);
	const root = el("section", { className: "aa-quick-group-control", attrs: { "aria-label": labels.title || spec.label || DEFAULT_LABELS.title } });
	let destroyed = false;
	let refresh = () => {};
	const draw = () => {
		if (destroyed) return;
		if (!manager) {
			root.replaceChildren(emptyState({ iconName: "statusError", className: "aa-quick-group-control__empty is-error", title: labels.error || "Quick Group Manager is unavailable" }));
			return;
		}
		let snapshot;
		try {
			snapshot = quickGroupManagerSnapshot(manager);
		} catch (error) {
			console.error("[Aaalice] QuickGroupManager sidebar snapshot failed", error);
			root.replaceChildren(emptyState({ iconName: "statusError", className: "aa-quick-group-control__empty is-error", title: labels.error || "Quick Group Manager is unavailable", description: error?.message || String(error) }));
			return;
		}
		const mode = segmentedControl({
			value: snapshot.state.offMode,
			options: [
				{ value: "mute", label: labels.mute, iconName: "volumeOff" },
				{ value: "bypass", label: labels.bypass, iconName: "skipForward" },
			],
			ariaLabel: labels.modeAria,
			className: "aa-quick-group-control__mode",
			onChange: (value) => {
				const result = setQuickGroupManagerOffMode(manager, value);
				if (!result.ok) port.onError?.(result);
				draw();
			},
		});
		const toolbar = el("div", { className: "aa-quick-group-control__toolbar", children: [
			el("span", { className: "aa-quick-group-control__summary", text: `${snapshot.groups.length} ${labels.groups}` }),
			mode,
			iconButton({ iconName: "refresh", label: labels.refresh, variant: "ghost", onClick: draw }),
		] });
		const list = el("div", { className: "aa-quick-group-control__list", attrs: {
			tabindex: "0", role: "list", "aria-label": labels.groups || DEFAULT_LABELS.groups, "data-capture-wheel": "true",
		} });
		list.addEventListener("pointerenter", () => {
			const active = document.activeElement;
			if (active && active !== document.body && !root.contains(active) && active.matches?.("input, textarea, select, [contenteditable='true']")) return;
			list.focus({ preventScroll: true });
		});
		if (snapshot.visibleGroups.length) {
			for (const group of snapshot.visibleGroups) list.append(createGroupRow(group, manager, labels, draw, port.onError));
		} else {
			list.append(emptyState({ iconName: "settings", className: "aa-quick-group-control__empty", title: labels.empty }));
		}
		root.replaceChildren(toolbar, list);
	};
	refresh = draw;
	draw();
	manager._aaaliceQuickGroupControlRefreshes ||= new Set();
	manager._aaaliceQuickGroupControlRefreshes.add(refresh);
	return controlView({
		root,
		kind: spec.kind,
		destroy() {
			destroyed = true;
			manager?._aaaliceQuickGroupControlRefreshes?.delete(refresh);
		},
	});
}
