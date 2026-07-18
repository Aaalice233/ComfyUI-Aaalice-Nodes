/** Sidebar host adapter for Aaalice and ComfyUI renderer families. */

import { createSharedControl } from "./controls/registry.js";
import { resolvedControlSpec } from "./controls/specs.js";

export function createControlElement(resolved, { labels = {}, onInput, onCommit, onError, onSuccess } = {}) {
	if (resolved?.status !== "ok") return null;
	const availabilityLabels = labels.availability || {};
	const spec = resolvedControlSpec(resolved, {
		labels: {
			numeric: availabilityLabels,
			seed: { ...availabilityLabels, locked: labels.seedLocked, unlocked: labels.seedUnlocked },
			boolean: { ...availabilityLabels, enabled: labels.enabled, disabled: labels.disabled },
			choice: { ...availabilityLabels, select: labels.selectOption },
			text: availabilityLabels,
			taglist: { ...availabilityLabels, ...(labels.taglist || {}) },
			image: { ...availabilityLabels, none: labels.imageNone, drop: labels.imageDrop, clear: labels.imageClear },
		},
		presentation: { compact: true, headerOnly: typeof resolved.value === "boolean" },
	});
	let gestureOpen = false;
	const view = createSharedControl(spec, {
		preview(next) {
			if (["numeric", "seed"].includes(spec.kind)) resolved.setValue(next, { transaction: false, transient: true });
			onInput?.(next);
		},
		commit(next, detail = {}) {
			resolved.setValue(next, { workspaceRedraw: detail.redraw !== false });
			onCommit?.(next, detail);
		},
		beginGesture() {
			if (gestureOpen) return;
			gestureOpen = true; resolved.node?.graph?.beforeChange?.();
		},
		endGesture(next) {
			if (!gestureOpen) return;
			gestureOpen = false; resolved.flushValue?.();
			resolved.node?.graph?.afterChange?.(); resolved.node?.graph?.setDirtyCanvas?.(true, true); onCommit?.(next);
		},
		setSeedLocked: (locked) => { resolved.setSeedLocked?.(locked); onCommit?.(resolved.value); },
		onError,
		onSuccess,
	});
	let control = view.root;
	control.classList.add("aa-workspace-control-input");
	control.dataset.controlKind = view.kind;
	control.dataset.controlFamily = spec.family;
	control.dataset.controlAvailability = spec.availability.state;
	if (view.headerOnly) {
		if (view.headerAccessories.length) {
			control.dataset.headerOnly = "true"; control.hidden = true; control.headerAccessories = view.headerAccessories;
		} else {
			const accessory = control;
			control = document.createElement("div"); control.hidden = true;
			control.className = "aa-workspace-control-input aa-control-header-only-host";
			control.dataset.controlKind = view.kind; control.dataset.controlFamily = spec.family;
			control.dataset.headerOnly = "true"; control.headerAccessories = [accessory];
		}
	} else if (view.headerAccessories.length) control.headerAccessories = view.headerAccessories;
	if (!control.getAttribute("aria-label") && !control.querySelector?.("[aria-label]")) control.setAttribute("aria-label", resolved.label);
	return control;
}
