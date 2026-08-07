/** Page-level batch rebind dialog: reviews auto-matched candidates for every broken card before one atomic commit. */

import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { bindingKey, linkedBindingCount } from "../lib/dashboard_model.js";
import { bindingControlIdLabel } from "../lib/dashboard_binding_identity.js";
import { replacePrimaryBinding, detachBinding } from "../lib/dashboard_commands.js";
import { resolveControlBindingSet } from "../lib/control_binding_set.js";
import { badge, button, el, emptyState, icon } from "../lib/ui.js";
import { createListRow } from "../lib/workspace_components.js";
import { createSearchableSelect } from "../lib/searchable_select.js";
import { createWorkspaceDialog } from "./dialogs.js";
import { bindingDisplay, describeRebindCandidates, openRebind } from "./dashboard_linking.js";
// 与 dashboard_bindings 存在函数级循环依赖（双向都只在运行期调用），不要在模块顶层求值这些导入。
import {
	commitDashboardBindingSet, controlTitle, dashboard, message, notifyControlBindingError, openManageLinkedBindings, resolve, updateDashboard,
} from "./dashboard_bindings.js";

/** 当前页主绑定失效的控件卡片（联动失效走「管理联动」，不在批量重绑范围）。 */
export function brokenPageControls(page, model = dashboard()) {
	return page.items.filter((item) => {
		if (item.kind !== "control" || !item.binding) return false;
		const resolvedSet = resolveControlBindingSet(item, resolve);
		const primaryEntry = resolvedSet.bindingSet?.entries?.[0] || null;
		return !primaryEntry || primaryEntry.resolved?.status !== "ok";
	});
}

/** 全 Dashboard 的失效绑定明细：主绑定失效与联动失效分别列出，供预设「需要处理」诊断。 */
export function brokenDashboardBindingEntries(model = dashboard()) {
	const entries = [];
	for (const page of model?.pages || []) for (const item of page.items || []) {
		if (item.kind !== "control" || !item.binding) continue;
		const resolvedSet = resolveControlBindingSet(item, resolve);
		const [primary, ...linked] = resolvedSet.bindingSet?.entries || [];
		if (!primary || primary.resolved?.status !== "ok") entries.push({ page, item, role: "primary", binding: item.binding });
		for (const entry of linked) if (entry.resolved?.status !== "ok") entries.push({ page, item, role: "linked", binding: entry.binding });
	}
	return entries;
}

/** 「需要处理」诊断对话框：列出失效绑定并直达修复入口（重绑主参数 / 管理联动）。 */
export function openBindingHealthDialog(ownerElement = null) {
	const entries = brokenDashboardBindingEntries();
	const body = el("div", "aa-binding-health"); const footer = el("div"); let dialog;
	if (!entries.length) {
		// 预设保存了已移除组件的数值也会标记需要处理，此时没有失效绑定可列。
		body.append(emptyState({ iconName: "statusCheck", description: t("aaalice.workspace.dashboardPreset.healthEmpty", "All bindings currently resolve. The flag usually means the preset still holds values of removed components; save the preset to clear it.") }));
	} else {
		const list = el("div", { className: "aa-binding-health__list", attrs: { role: "list", "aria-label": t("aaalice.workspace.dashboardPreset.healthTitle", "Binding status") } });
		for (const entry of entries) {
			const isPrimary = entry.role === "primary";
			const roleBadge = badge(isPrimary ? t("aaalice.workspace.binding.primary", "Primary") : t("aaalice.workspace.dashboardPreset.healthLinked", "Linked"), { className: "is-warning" });
			const action = button({
				label: isPrimary ? t("aaalice.workspace.binding.rebindAction", "Rebind") : t("aaalice.workspace.binding.manage", "Manage linked parameters"),
				iconName: isPrimary ? "swap" : "link",
				variant: "ghost",
				size: "sm",
				onClick: (event) => {
					dialog.close();
					if (isPrimary) openRebind(entry.item, event.currentTarget);
					else openManageLinkedBindings(entry.item.id, event.currentTarget);
				},
			});
			list.append(createListRow({
				title: `${entry.page.name} · ${controlTitle(entry.item, resolveControlBindingSet(entry.item, resolve))}`,
				description: bindingControlIdLabel(entry.binding),
				actions: [roleBadge, action],
			}));
		}
		body.append(list);
	}
	footer.append(button({ label: t("aaalice.common.close", "Close"), variant: "primary", onClick: () => dialog.close() }));
	const deadLinked = entries.filter((entry) => entry.role === "linked");
	if (deadLinked.length) footer.prepend(button({
		label: t("aaalice.workspace.dashboardPreset.healthClearLinked", "Remove dead links · {count}").replace("{count}", String(deadLinked.length)),
		iconName: "delete",
		variant: "secondary",
		onClick: () => {
			try {
				let next = dashboard();
				for (const entry of deadLinked) next = detachBinding(next, entry.item.id, entry.binding);
				updateDashboard(() => next);
				app.extensionManager?.toast?.add?.({
					severity: "success",
					summary: t("aaalice.workspace.dashboardPreset.healthTitle", "Binding status"),
					detail: t("aaalice.workspace.dashboardPreset.healthCleared", "Removed {count} dead linked bindings.").replace("{count}", String(deadLinked.length)),
					life: 3600,
				});
				dialog.close();
			} catch (error) { notifyControlBindingError(error); }
		},
	}));
	dialog = createWorkspaceDialog({ title: t("aaalice.workspace.dashboardPreset.healthTitle", "Binding status"), body, footer, size: "sm", className: "aa-binding-health-dialog" }, ownerElement);
}

function setButtonLabel(target, label) {
	target.querySelector(".aa-ui-button__label").textContent = label;
}

function matchDisplayText(row) {
	const candidate = row.candidates.find((entry) => bindingKey(entry.binding) === row.selectedValue);
	if (!candidate) return null;
	const display = bindingDisplay(candidate.binding);
	return `${display.description} · ${display.title}`;
}

export function openPageRebind(pageId, ownerElement = null) {
	const model = dashboard();
	const page = model.pages.find((entry) => entry.id === pageId);
	if (!page) return;
	const broken = brokenPageControls(page, model);
	if (!broken.length) return;

	const rows = broken.map((item) => {
		const { candidates, options, match } = describeRebindCandidates(item);
		return {
			item,
			candidates,
			options,
			exact: Boolean(match?.exact),
			selectedValue: match ? options[match.index].value : null,
			skipped: !match,
			manual: false,
			expanded: false,
			elements: {},
		};
	});

	const body = el("div", "aa-rebind-all");
	const footer = el("div"); let dialog; let confirmButton;

	const included = () => rows.filter((row) => !row.skipped && row.selectedValue != null);
	const refreshConfirm = () => {
		// 行构建早于主按钮创建，此期间无需刷新。
		if (!confirmButton) return;
		const count = included().length;
		confirmButton.disabled = count === 0;
		setButtonLabel(confirmButton, t("aaalice.workspace.rebindAll.confirm", "Rebind {count}").replace("{count}", String(count)));
	};

	const setRowPresentation = (row) => {
		const { elements } = row;
		elements.root.classList.toggle("is-skipped", row.skipped);
		const text = matchDisplayText(row);
		const tone = row.selectedValue == null ? "unmatched" : row.manual ? "manual" : row.exact ? "exact" : "suggested";
		elements.root.dataset.tone = tone;
		elements.match.textContent = text || t("aaalice.workspace.rebindAll.noMatch", "No confident match found");
		elements.match.classList.toggle("is-empty", !text);
		elements.badge.replaceChildren();
		if (tone === "manual") elements.badge.append(badge(t("aaalice.workspace.rebindAll.manualBadge", "Manual")));
		else if (tone === "exact") elements.badge.append(badge(t("aaalice.workspace.rebindAll.exactBadge", "Exact"), { className: "is-success" }));
		else if (tone === "suggested") elements.badge.append(badge(t("aaalice.workspace.rebindAll.suggestedBadge", "Suggested"), { className: "is-warning" }));
		else elements.badge.append(badge(t("aaalice.workspace.rebindAll.unmatchedBadge", "Unmatched"), { className: "is-danger" }));
		setButtonLabel(elements.change, row.expanded ? t("aaalice.workspace.rebindAll.collapse", "Collapse") : t("aaalice.workspace.rebindAll.change", "Change…"));
		setButtonLabel(elements.skip, row.skipped ? t("aaalice.workspace.rebindAll.include", "Include") : t("aaalice.workspace.rebindAll.skip", "Skip"));
		refreshConfirm();
	};

	const collapseRows = (except = null) => {
		for (const row of rows) {
			if (row === except || !row.expanded) continue;
			row.expanded = false;
			row.elements.picker.replaceChildren();
			setRowPresentation(row);
		}
	};

	const buildRow = (row) => {
		const title = controlTitle(row.item, resolveControlBindingSet(row.item, resolve));
		const badgeSlot = el("div", "aa-rebind-all__badge-slot");
		const matchLine = el("div", "aa-rebind-all__match");
		const pickerSlot = el("div", "aa-rebind-all__picker");
		const change = button({ label: "change", variant: "ghost", size: "sm", onClick: () => {
			if (row.expanded) { row.expanded = false; pickerSlot.replaceChildren(); setRowPresentation(row); return; }
			collapseRows(row);
			row.expanded = true;
			const selection = createSearchableSelect({
				options: row.options,
				value: row.selectedValue || "",
				ariaLabel: t("aaalice.workspace.binding.parameter", "Node parameter"),
				searchPlaceholder: t("aaalice.workspace.binding.searchParameter", "Search parameters…"),
				emptyLabel: t("aaalice.workspace.binding.noSearchMatches", "No parameters match the search."),
				onChange: (value) => {
					row.selectedValue = value; row.manual = true; row.skipped = false;
					setRowPresentation(row);
				},
			});
			pickerSlot.replaceChildren(selection);
			selection.focusSearch();
			requestAnimationFrame(() => selection.revealSelected());
			setRowPresentation(row);
		} });
		const skip = button({ label: "skip", variant: "ghost", size: "sm", onClick: () => {
			row.skipped = !row.skipped;
			setRowPresentation(row);
		} });
		const root = el("div", { className: "aa-rebind-all__row", attrs: { role: "listitem" }, children: [
			el("div", { className: "aa-rebind-all__row-head", children: [
				el("strong", "aa-rebind-all__row-title", title),
				badgeSlot,
			] }),
			el("div", { className: "aa-rebind-all__mapping", children: [
				el("span", { className: "aa-rebind-all__origin", text: bindingControlIdLabel(row.item.binding), attrs: { title: t("aaalice.workspace.rebindAll.origin", "Previously bound to {name}").replace("{name}", bindingControlIdLabel(row.item.binding)) } }),
				icon("arrowRight", { className: "aa-rebind-all__mapping-arrow" }),
				matchLine,
			] }),
			el("div", { className: "aa-rebind-all__row-actions", children: [change, skip] }),
			pickerSlot,
		] });
		row.elements = { root, badge: badgeSlot, match: matchLine, picker: pickerSlot, change, skip };
		setRowPresentation(row);
		return root;
	};

	body.append(
		el("p", { className: "aa-rebind-all__intro", text: message("aaalice.workspace.rebindAll.intro", "{count} controls on this page lost their bindings. Review the suggested matches before applying.", { count: broken.length }) }),
		el("div", { className: "aa-rebind-all__list", attrs: { role: "list", "aria-label": t("aaalice.workspace.rebindAll.title", "Rebind broken parameters") }, children: rows.map(buildRow) }),
	);

	confirmButton = button({ label: "confirm", iconName: "swap", onClick: () => {
		const applied = included();
		if (!applied.length) return;
		try {
			let next = dashboard();
			for (const row of applied) {
				const candidate = row.candidates.find((entry) => bindingKey(entry.binding) === row.selectedValue);
				if (!candidate) throw new Error("Selected rebind candidate is no longer available");
				next = replacePrimaryBinding(next, row.item.id, candidate.binding);
			}
			const synchronize = applied.some((row) => linkedBindingCount(row.item) > 0);
			commitDashboardBindingSet(next, applied.map((row) => row.item.id), { synchronize });
			app.extensionManager?.toast?.add?.({
				severity: "success",
				summary: t("aaalice.workspace.rebindAll.done", "Parameters rebound"),
				detail: message("aaalice.workspace.rebindAll.doneDetail", "Rebound {count} controls on page “{page}”.", { count: applied.length, page: page.name }),
				life: 3600,
			});
			dialog.close();
		} catch (error) { notifyControlBindingError(error); }
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirmButton);
	dialog = createWorkspaceDialog({ title: t("aaalice.workspace.rebindAll.title", "Rebind broken parameters"), body, footer, size: "lg", className: "aa-rebind-all-dialog" }, ownerElement);
	refreshConfirm();
}
