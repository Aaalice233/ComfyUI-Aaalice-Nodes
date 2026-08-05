import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { controlProviders } from "../lib/control_providers.js";
import { bindingKey, bindingTargetKey, controlItemBindings } from "../lib/dashboard_model.js";
import { sameBindingTarget } from "../lib/dashboard_binding_identity.js";
import { detachBinding } from "../lib/dashboard_commands.js";
import { badge, button, el, emptyState } from "../lib/ui.js";
import { createListRow } from "../lib/workspace_components.js";
import { createWorkspaceDialog } from "./dialogs.js";

let runtime = null;
export function configureDashboardUnbinding(dependencies) {
	runtime = dependencies;
}

const dashboard = () => runtime.dashboard();
const resolve = (binding) => runtime?.resolve?.(binding);
const updateDashboard = (callback) => runtime.updateDashboard(callback);
const bindingDisplay = (binding) => runtime.bindingDisplay(binding);
const notifyControlBindingError = (error) => runtime.notifyControlBindingError(error);
const remindWorkflowSave = (detail) => runtime.remindWorkflowSave(detail);

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function findDashboardControl(model, itemId) {
	for (const page of model.pages) {
		const item = page.items.find((entry) => entry.id === itemId && entry.kind === "control");
		if (item) return { page, item };
	}
	return { page: null, item: null };
}

function nodeBindingEntryKey(entry) {
	return `${entry.item.id}\u0000${bindingKey(entry.binding)}`;
}

export function boundNodeControlEntries(node, controls, model = dashboard()) {
	const listed = new Map(controls.map((control) => [bindingTargetKey(control.binding), control]));
	const entries = [];
	for (const page of model.pages) for (const item of page.items) {
		if (item.kind !== "control") continue;
		for (const binding of controlItemBindings(item)) {
			const control = listed.get(bindingTargetKey(binding)) || controls.find((candidate) => sameBindingTarget(binding, candidate.binding, resolve));
			if (!control) continue;
			entries.push({ page, item, binding, control, primary: bindingTargetKey(item.binding) === bindingTargetKey(binding) });
		}
	}
	return entries;
}

export function openUnbindControls(node, listedControls = null, ownerElement = null) {
	const entries = boundNodeControlEntries(node, listedControls || controlProviders.list(node));
	const body = el("div", "aa-unbind-controls-dialog aa-linked-bindings-dialog"); const footer = el("div"); let dialog;
	if (!entries.length) {
		body.append(emptyState({ iconName: "link", description: t("aaalice.workspace.binding.noBindings", "This node has no parameters bound to the sidebar.") }));
		footer.append(button({ label: t("aaalice.common.close", "Close"), variant: "primary", onClick: () => dialog.close() }));
		dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.unbindTitle", "Unbind from sidebar"), body, footer, size: "sm", className: "aa-linked-bindings-dialog-shell" }, ownerElement || app.canvas?.canvas || null);
		return;
	}
	const list = el("div", "aa-unbind-controls-list"); const selected = new Set(entries.length === 1 ? [nodeBindingEntryKey(entries[0])] : []); let confirmButton;
	const updateSelectionState = () => {
		if (!confirmButton) return;
		confirmButton.disabled = selected.size === 0;
		confirmButton.querySelector(".aa-ui-button__label").textContent = message("aaalice.workspace.binding.unbindSelected", "Unbind parameters · {count}", { count: selected.size });
	};
	for (const entry of entries) {
		const display = bindingDisplay(entry.binding); const key = nodeBindingEntryKey(entry);
		const role = entry.primary ? badge(t("aaalice.workspace.binding.primary", "Primary"), { className: "aa-linked-binding-role" }) : null;
		list.append(createListRow({
			title: `${display.description} · ${display.title}`,
			description: `${entry.page.name} · ${entry.primary ? t("aaalice.workspace.binding.primary", "Primary") : t("aaalice.workspace.binding.linkedRole", "Linked")}`,
			selected: selected.has(key),
			actions: role ? [role] : [],
			onSelect: (checked) => { if (checked) selected.add(key); else selected.delete(key); updateSelectionState(); },
		}));
	}
	body.append(list);
	confirmButton = button({ label: message("aaalice.workspace.binding.unbindSelected", "Unbind parameters · {count}", { count: selected.size }), iconName: "close", disabled: true, onClick: () => {
		const selectedEntries = entries.filter((entry) => selected.has(nodeBindingEntryKey(entry)));
		if (!selectedEntries.length) return;
		try {
			updateDashboard((current) => selectedEntries.reduce((next, entry) => {
				return findDashboardControl(next, entry.item.id).item ? detachBinding(next, entry.item.id, entry.binding) : next;
			}, current));
			app.extensionManager?.toast?.add?.({ severity: "success", summary: t("aaalice.workspace.binding.unbound", "Parameter unbound"), detail: message("aaalice.workspace.binding.unboundDetail", "Removed {count} parameter(s) from the sidebar.", { count: selectedEntries.length }), life: 3600 });
			remindWorkflowSave(t("aaalice.workspace.binding.saveWorkflowReminder", "Save the workflow to keep these sidebar controls; otherwise they will be lost."));
			dialog.close();
		} catch (error) { notifyControlBindingError(error); }
	} });
	footer.append(button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() }), confirmButton);
	updateSelectionState();
	dialog = createWorkspaceDialog({ title: t("aaalice.workspace.binding.unbindTitle", "Unbind from sidebar"), body, footer, size: "sm", className: "aa-linked-bindings-dialog-shell" }, ownerElement || app.canvas?.canvas || null);
}
