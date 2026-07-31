/** Whole-node QuickGroupManager control for the sidebar. */

import {
	applyQuickGroupManagerAction,
	quickGroupManagerSnapshot,
	setQuickGroupManagerOffMode,
} from "../quick_group_manager_runtime.js";
import { GROUP_STATE, classifyGroupNodes, normalizeColor } from "../quick_group_manager_model.js";
import { button, el, emptyState, icon, iconButton, segmentedControl } from "../ui.js";

function statusClass(status) {
	return status === GROUP_STATE.ENABLED ? "is-enabled" : status === GROUP_STATE.MIXED ? "is-mixed" : status === GROUP_STATE.EMPTY ? "is-empty" : "is-disabled";
}

function createGroupRow(group, labels, onRefresh) {
	const nodes = Array.isArray(group.nodes) ? group.nodes : [];
	const status = classifyGroupNodes(nodes);
	const color = normalizeColor(group.color);
	const name = String(group.title || labels.untitled || "Untitled group");
	const statusLabels = labels.status || {};
	const toggle = button({
		label: status === GROUP_STATE.ENABLED ? labels.disable : labels.enable,
		variant: "ghost",
		className: "aa-quick-group-control__toggle",
		onClick: () => {
			const action = status === GROUP_STATE.ENABLED ? "disable" : "enable";
			const result = applyQuickGroupManagerAction(group.manager, group.id, action);
			if (!result.ok) labels.onError?.(result);
			onRefresh();
		},
	});
	toggle.setAttribute("aria-label", labels.toggle.replace("{group}", name));
	return el("div", { className: `aa-quick-group-control__row ${statusClass(status)}`, style: color ? { "--group-color": color } : {}, children: [
		el("span", { className: `aa-quick-group-control__marker${color ? "" : " is-uncolored"}`, attrs: { "aria-hidden": "true" } }),
		el("div", { className: "aa-quick-group-control__copy", children: [
			el("strong", { text: name }),
			el("small", { text: `${nodes.length} ${labels.nodes || "nodes"} · ${statusLabels[status] || statusLabels.unknown || status}` }),
		] }),
		toggle,
	] });
}

export function renderQuickGroupManagerControl(spec) {
	const manager = spec.options?.manager;
	const labels = spec.labels || {};
	const root = el("section", { className: "aa-quick-group-control", attrs: { "aria-label": labels.title || spec.label || "Quick Group Manager" } });
	let destroyed = false;
	let refresh = () => {};
	const draw = () => {
		if (destroyed) return;
		if (!manager) {
			root.replaceChildren(emptyState({ iconName: "statusError", className: "aa-quick-group-control__empty is-error", title: labels.error || "Quick Group Manager is unavailable" }));
			return;
		}
		const snapshot = quickGroupManagerSnapshot(manager);
		const mode = segmentedControl({
			value: snapshot.state.offMode,
			options: [{ value: "mute", label: labels.mute }, { value: "bypass", label: labels.bypass }],
			ariaLabel: labels.modeAria,
			className: "aa-quick-group-control__mode",
			onChange: (value) => {
				const result = setQuickGroupManagerOffMode(manager, value);
				if (!result.ok) labels.onError?.(result);
				draw();
			},
		});
		const toolbar = el("div", { className: "aa-quick-group-control__toolbar", children: [
			el("span", { className: "aa-quick-group-control__summary", text: `${snapshot.groups.length} ${labels.groups}` }),
			mode,
			iconButton({ iconName: "refresh", label: labels.refresh, variant: "ghost", onClick: draw }),
		] });
		const list = el("div", { className: "aa-quick-group-control__list" });
		if (snapshot.visibleGroups.length) {
			for (const group of snapshot.visibleGroups) list.append(createGroupRow({ ...group, manager }, labels, draw));
		} else {
			list.append(emptyState({ iconName: "settings", className: "aa-quick-group-control__empty", title: labels.empty }));
		}
		root.replaceChildren(toolbar, list);
	};
	refresh = draw;
	draw();
	manager._aaaliceQuickGroupControlRefreshes ||= new Set();
	manager._aaaliceQuickGroupControlRefreshes.add(refresh);
	return {
		root,
		destroy() {
			destroyed = true;
			manager._aaaliceQuickGroupControlRefreshes?.delete(refresh);
		},
	};
}
