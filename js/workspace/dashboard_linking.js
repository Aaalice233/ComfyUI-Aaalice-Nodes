/** Rebind and link-to-existing dialogs plus their shared binding-display helpers. */

import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { controlProviders } from "../lib/control_providers.js";
import { bindingKey, controlItemBindings, linkedBindingCount } from "../lib/dashboard_model.js";
import { bindingControlIdLabel, sameBindingTarget } from "../lib/dashboard_binding_identity.js";
import { addLinkedBinding, replacePrimaryBinding } from "../lib/dashboard_commands.js";
import { ControlBindingSetError, inspectControlLinkCompatibility, resolveControlBindingSet } from "../lib/control_binding_set.js";
import { button, el, emptyState, field } from "../lib/ui.js";
import { createSearchableSelect } from "../lib/searchable_select.js";
import { createWorkspaceDialog } from "./dialogs.js";
// 与 dashboard_bindings 存在函数级循环依赖（双向都只在运行期调用），不要在模块顶层求值这些导入。
import {
	commitDashboardBindingSet, controlTitle, dashboard, findDashboardControl, graphNodes, message, notifyControlBindingError, resolve,
} from "./dashboard_bindings.js";

function resolvedBindingEntry(binding) {
	let resolved;
	try { resolved = resolve(binding); }
	catch (error) { resolved = { status: "error", error }; }
	return { binding, resolved };
}

function bindingNodeTitle(node) {
	const title = String(node?.getTitle?.() || node?.title || node?.type || ""); if (!title) return "";
	const matches = graphNodes().filter((candidate) => String(candidate?.getTitle?.() || candidate?.title || candidate?.type || "") === title);
	const index = matches.indexOf(node);
	return matches.length > 1 && index >= 0 ? `${title} (${index + 1})` : title;
}

export function bindingDisplay(binding) {
	const entry = resolvedBindingEntry(binding); const node = entry.resolved.node;
	return {
		...entry,
		title: entry.resolved.label || bindingControlIdLabel(binding),
		description: bindingNodeTitle(node) || binding.provider,
	};
}

function dedupeTargetLabels(targets) {
	const totals = new Map(); const occurrences = new Map();
	for (const target of targets) totals.set(target.label, (totals.get(target.label) || 0) + 1);
	for (const target of targets) if (totals.get(target.label) > 1) {
		const occurrence = (occurrences.get(target.label) || 0) + 1; occurrences.set(target.label, occurrence);
		target.label = `${target.label} (${occurrence})`;
	}
	return targets;
}

/**
 * 可联动目标卡片。主绑定失效（missing/incompatible/error）的卡片也作为重绑目标返回
 * （broken: true）：此时只剩持久化的 valueType 可作为契约代理，选中后走 replacePrimaryBinding
 * 而不是 addLinkedBinding。主绑定可用但联动失效的卡片仍按正常联动目标处理。
 */
function compatibleCardTargets(sourceBinding, model = dashboard()) {
	const source = resolvedBindingEntry(sourceBinding); const targets = [];
	for (const page of model.pages) {
		for (const item of page.items) {
			if (item.kind !== "control" || controlItemBindings(item).some((binding) => sameBindingTarget(binding, sourceBinding, resolve))) continue;
			const resolvedSet = resolveControlBindingSet(item, resolve);
			const primaryEntry = resolvedSet.bindingSet?.entries?.[0] || null;
			if (!primaryEntry || primaryEntry.resolved?.status !== "ok") {
				if (!item.binding || item.binding.valueType !== sourceBinding.valueType) continue;
				const brokenLabel = controlTitle(item, resolvedSet);
				targets.push({ page, item, source, resolved: null, broken: true, label: `${page.name} · ${brokenLabel}`, controlLabel: brokenLabel });
				continue;
			}
			if (!inspectControlLinkCompatibility(primaryEntry, source).ok) continue;
			const label = controlTitle(item, resolvedSet);
			targets.push({ page, item, source, resolved: resolvedSet, label: `${page.name} · ${label}`, controlLabel: label });
		}
	}
	return dedupeTargetLabels(targets);
}

function bindingLabelScore(sourceLabel, targetLabel) {
	const source = String(sourceLabel || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
	const target = String(targetLabel || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
	if (!source || !target) return 0;
	if (source === target) return 1000;
	const shorter = Math.min(source.length, target.length); const longer = Math.max(source.length, target.length);
	if (shorter < 2 || !(source.includes(target) || target.includes(source))) return 0;
	return 700 + Math.round((shorter / longer) * 200);
}

function preferredBindingTarget(sourceLabel, targets) {
	let best = targets[0] || null; let bestScore = 0;
	for (const target of targets) {
		const score = bindingLabelScore(sourceLabel, target.controlLabel || target.label);
		if (score > bestScore) { best = target; bestScore = score; }
	}
	return best;
}

function rebindCandidates(item, model = dashboard()) {
	const candidates = [];
	for (const candidate of graphNodes().flatMap((node) => controlProviders.list(node))) {
		if (sameBindingTarget(candidate.binding, item.binding, resolve) || candidate.binding.valueType !== item.binding.valueType) continue;
		try {
			const next = replacePrimaryBinding(model, item.id, candidate.binding); const { item: nextItem } = findDashboardControl(next, item.id);
			if (resolveControlBindingSet(nextItem, resolve).status === "ok") candidates.push(candidate);
		} catch { /* Candidate cannot satisfy the existing linked contract. */ }
	}
	return candidates;
}

function commitRebind(item, binding, dialog) {
	const next = replacePrimaryBinding(dashboard(), item.id, binding);
	commitDashboardBindingSet(next, item.id, { synchronize: linkedBindingCount(findDashboardControl(next, item.id).item) > 0 });
	app.extensionManager?.toast?.add?.({ severity: "success", summary: t("aaalice.workspace.binding.rebound", "Parameter rebound"), detail: message("aaalice.workspace.binding.reboundDetail", "The sidebar control is now driven by {name}.", { name: bindingDisplay(binding).title }), life: 3200 });
	dialog?.close();
}

export function openRebind(item, ownerElement = null) {
	const candidates = rebindCandidates(item);
	const body = el("div", "aa-rebind-list"); const footer = el("div"); let dialog;
	if (!candidates.length) {
		body.append(emptyState({ description: t("aaalice.workspace.binding.noCompatible", "No compatible controls are available.") }));
		footer.append(button({ label: t("aaalice.common.close", "Close"), variant: "primary", onClick: () => dialog.close() }));
		dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.rebind", "Rebind control"), body, footer, size: "sm" }, ownerElement);
		return;
	}
	const rawLabels = candidates.map((candidate) => { const display = bindingDisplay(candidate.binding); return { title: display.title, description: display.description }; });
	const labelTotals = new Map(); const labelOccurrences = new Map();
	for (const entry of rawLabels) {
		const key = `${entry.description} · ${entry.title}`;
		labelTotals.set(key, (labelTotals.get(key) || 0) + 1);
	}
	const options = candidates.map((candidate, index) => {
		const entry = rawLabels[index]; const key = `${entry.description} · ${entry.title}`;
		const occurrence = (labelOccurrences.get(key) || 0) + 1; labelOccurrences.set(key, occurrence);
		return {
			label: labelTotals.get(key) > 1 ? `${entry.title} (${occurrence})` : entry.title,
			description: entry.description,
			value: bindingKey(candidate.binding),
		};
	});
	// 失效绑定自带来源身份（promoted 元组的来源名）与卡片标题；按两者给候选打分并预选最高分，
	// 同名的原参数在列表中时无需手动搜索。
	const identityLabel = bindingControlIdLabel(item.binding);
	const preferredLabel = item.labelOverride || item.label || identityLabel;
	let initialValue = options[0].value;
	let bestScore = 0; let bestNodeScore = 0;
	for (const [index, candidate] of candidates.entries()) {
		const candidateIdentity = bindingControlIdLabel(candidate.binding);
		const score = Math.max(
			bindingLabelScore(preferredLabel, rawLabels[index].title),
			bindingLabelScore(identityLabel, rawLabels[index].title),
			bindingLabelScore(identityLabel, candidateIdentity),
			bindingLabelScore(preferredLabel, `${rawLabels[index].description} ${rawLabels[index].title}`),
		);
		// 主分数打平时用节点标题消歧：多个同名参数（如多个 seed）应优先落在原节点上。
		const nodeScore = Math.max(
			bindingLabelScore(preferredLabel, rawLabels[index].description),
			bindingLabelScore(identityLabel, rawLabels[index].description),
		);
		if (score > bestScore || (score === bestScore && score > 0 && nodeScore > bestNodeScore)) {
			bestScore = score; bestNodeScore = nodeScore; initialValue = options[index].value;
		}
	}
	const commitSelection = (value) => {
		const selected = candidates.find((candidate) => bindingKey(candidate.binding) === value);
		if (!selected) return;
		try { commitRebind(item, selected.binding, dialog); }
		catch (error) { notifyControlBindingError(error); }
	};
	const selection = createSearchableSelect({
		options,
		value: initialValue,
		ariaLabel: t("aaalice.workspace.binding.rebind", "Rebind control"),
		searchPlaceholder: t("aaalice.workspace.binding.searchParameter", "Search parameters…"),
		emptyLabel: t("aaalice.workspace.binding.noSearchMatches", "No parameters match the search."),
		onConfirm: commitSelection,
	});
	body.append(field({ label: t("aaalice.workspace.binding.parameter", "Node parameter"), control: selection }));
	dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.rebind", "Rebind control"), body, footer, size: "sm" }, ownerElement);
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), button({ label: t("aaalice.common.confirm", "Confirm"), onClick: () => commitSelection(selection.value) }));
	selection.focusSearch();
	// 预选项在对话框挂载后才可定位，补一帧把列表滚动到自动匹配的参数上。
	requestAnimationFrame(() => selection.revealSelected());
}

export function linkableControlSources(controls) {
	const model = dashboard();
	return controls.map((control) => ({ control, resolved: resolvedBindingEntry(control.binding) }))
		.filter(({ control, resolved }) => resolved.resolved?.status === "ok" && resolved.resolved.linkable === true
			&& !dashboardHasBinding(model, control.binding) && compatibleCardTargets(resolved.binding).length);
}

function dashboardHasBinding(model, binding) {
	return model.pages.some((page) => page.items.some((item) => item.kind === "control" && controlItemBindings(item).some((candidate) => sameBindingTarget(candidate, binding, resolve))));
}

export function openLinkControls(node, listedControls = null, ownerElement = null) {
	const controls = listedControls || controlProviders.list(node);
	const sources = linkableControlSources(controls);
	const body = el("div", "aa-link-controls-dialog"); const footer = el("div"); let dialog; let confirmButton;
	if (!sources.length) {
		body.append(emptyState({ iconName: "link", description: t("aaalice.workspace.binding.noLinkTargets", "No compatible sidebar parameters are available for this node.") }));
		footer.append(button({ label: t("aaalice.common.close", "Close"), variant: "primary", onClick: () => dialog.close() }));
		dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.linkExisting", "Link to an existing sidebar parameter"), body, footer, size: "sm", className: "aa-link-controls-dialog-shell" }, ownerElement || app.canvas?.canvas || null);
		return;
	}
	const sourceLabelTotals = new Map(); const sourceLabelOccurrences = new Map();
	for (const { control } of sources) sourceLabelTotals.set(control.label, (sourceLabelTotals.get(control.label) || 0) + 1);
	const sourceOptions = sources.map(({ control }) => {
		const occurrence = (sourceLabelOccurrences.get(control.label) || 0) + 1; sourceLabelOccurrences.set(control.label, occurrence);
		return { label: sourceLabelTotals.get(control.label) > 1 ? `${control.label} (${occurrence})` : control.label, value: bindingKey(control.binding) };
	});
	const sourceSelect = createSearchableSelect({
		options: sourceOptions,
		value: bindingKey(sources[0].control.binding),
		ariaLabel: t("aaalice.workspace.binding.parameter", "Node parameter"),
		searchPlaceholder: t("aaalice.workspace.binding.searchParameter", "Search parameters…"),
		emptyLabel: t("aaalice.workspace.binding.noSearchMatches", "No parameters match the search."),
		onChange: () => refreshTargets(),
	});
	const targetSelect = createSearchableSelect({
		ariaLabel: t("aaalice.workspace.binding.sidebarParameter", "Sidebar parameter"),
		searchPlaceholder: t("aaalice.workspace.binding.searchComponent", "Search components…"),
		emptyLabel: t("aaalice.workspace.binding.noSearchMatches", "No parameters match the search."),
	});
	let targets = [];
	const refreshTargets = () => {
		const source = sources.find(({ control }) => bindingKey(control.binding) === sourceSelect.value);
		targets = source ? compatibleCardTargets(source.control.binding) : [];
		const preferred = preferredBindingTarget(source?.control.label, targets);
		targetSelect.setOptions(targets.map((target) => ({
			label: target.label,
			value: target.item.id,
			badge: target.broken ? t("aaalice.workspace.binding.brokenBadge", "Broken") : null,
			badgeTone: target.broken ? "warning" : null,
		})), preferred?.item.id || "");
		targetSelect.setDisabled(!targets.length); if (confirmButton) confirmButton.disabled = !targets.length;
	};
	body.append(
		field({ label: t("aaalice.workspace.binding.parameter", "Node parameter"), control: sourceSelect }),
		field({ label: t("aaalice.workspace.binding.sidebarParameter", "Sidebar parameter"), control: targetSelect }),
	);
	confirmButton = button({ label: t("aaalice.workspace.binding.link", "Link parameter"), iconName: "link", onClick: () => {
		const source = sources.find(({ control }) => bindingKey(control.binding) === sourceSelect.value);
		const target = targets.find((candidate) => candidate.item.id === targetSelect.value);
		if (!source || !target) return;
		try {
			const liveControls = controlProviders.list(node);
			const liveSource = liveControls.find((control) => sameBindingTarget(control.binding, source.control.binding, resolve));
			if (!liveSource) throw new ControlBindingSetError("The selected node parameter is no longer available", "unresolved-binding", source.control.binding);
			const liveTarget = compatibleCardTargets(liveSource.binding).find((candidate) => candidate.item.id === target.item.id);
			if (!liveTarget) throw new ControlBindingSetError("The selected sidebar parameter is no longer compatible", "incompatible-contract", liveSource.binding);
			if (liveTarget.broken) {
				commitRebind(liveTarget.item, liveSource.binding, dialog);
				return;
			}
			const next = addLinkedBinding(dashboard(), liveTarget.item.id, liveSource.binding);
			const resolvedBindings = new Map(liveTarget.resolved.bindingSet.entries.map((entry) => [entry.key, entry.resolved]));
			resolvedBindings.set(bindingKey(liveSource.binding), liveTarget.source.resolved);
			commitDashboardBindingSet(next, liveTarget.item.id, { synchronize: true, resolvedBindings });
			const count = controlItemBindings(findDashboardControl(next, liveTarget.item.id).item).length;
			app.extensionManager?.toast?.add?.({ severity: "success", summary: t("aaalice.workspace.binding.linked", "Parameter linked"), detail: message("aaalice.workspace.binding.linkedDetail", "The sidebar control now updates {count} parameters.", { count }), life: 3600 });
			dialog.close();
		} catch (error) { notifyControlBindingError(error); }
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirmButton);
	refreshTargets();
	dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.linkExisting", "Link to an existing sidebar parameter"), body, footer, size: "sm", className: "aa-link-controls-dialog-shell" }, ownerElement || app.canvas?.canvas || null);
}
