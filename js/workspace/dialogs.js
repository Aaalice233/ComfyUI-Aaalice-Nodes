import { createDialog } from "../lib/ui.js";

const activeWorkspaceDialogs = new Set();

function dialogBelongsToOwner(entry, ownerElement) {
	if (!ownerElement) return true;
	if (!entry.ownerElement) return false;
	return entry.ownerElement === ownerElement || Boolean(ownerElement.contains?.(entry.ownerElement));
}

export function createWorkspaceDialog(options, ownerElement = null, dialogFactory = createDialog) {
	let entry = null;
	const onClose = options.onClose;
	const dialog = dialogFactory({
		...options,
		returnFocus: options.returnFocus ?? ownerElement,
		onClose(value) {
			if (entry) activeWorkspaceDialogs.delete(entry);
			onClose?.(value);
		},
	});
	entry = { dialog, ownerElement };
	activeWorkspaceDialogs.add(entry);
	return dialog;
}

export function closeWorkspaceDialogs(ownerElement = null) {
	for (const entry of [...activeWorkspaceDialogs]) {
		if (!dialogBelongsToOwner(entry, ownerElement)) continue;
		activeWorkspaceDialogs.delete(entry);
		entry.dialog.close();
	}
}
