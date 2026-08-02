import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { button, el, icon } from "../lib/ui.js";
import { createWorkspaceDialog } from "./dialogs.js";

export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadUrl(url, filename) {
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
}

export function pickFile(accept, onFile) {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = accept;
	input.addEventListener("change", () => { if (input.files?.[0]) onFile(input.files[0]); });
	input.click();
}

export function setDialogFooter(footer, ...controls) { footer.replaceChildren(...controls); }

export function setActionBusy(control, busy, label, busyLabel) {
	control.disabled = busy;
	control.textContent = busy ? busyLabel : label;
	control.setAttribute("aria-busy", String(busy));
}

export async function confirmAction(message, { title = t("aaalice.common.confirm", "Confirm"), confirmLabel = t("aaalice.common.confirm", "Confirm"), danger = false, ownerElement = null } = {}) {
	if (!danger && app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({ title, message }));
	if (!danger) return Boolean(globalThis.confirm(message));
	return new Promise((resolve) => {
		let settled = false;
		let dialog;
		const finish = (confirmed) => {
			if (settled) return;
			settled = true;
			dialog.close();
			resolve(confirmed);
		};
		const body = el("div", { className: "aa-confirm-danger", children: [icon("statusWarning"), el("p", null, message)] });
		const footer = el("div", { children: [
			button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => finish(false) }),
			button({ label: confirmLabel, iconName: "delete", variant: "danger", onClick: () => finish(true) }),
		] });
		dialog = createWorkspaceDialog({
			title, body, footer, size: "sm", className: "aa-danger-dialog",
			onRequestClose: () => { finish(false); return false; },
			onClose: () => finish(false),
		}, ownerElement);
	});
}
