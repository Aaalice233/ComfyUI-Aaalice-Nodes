/** Sidebar host adapter for Aaalice and ComfyUI renderer families. */

import { createSharedControl } from "./controls/registry.js";
import { resolvedControlSpec } from "./controls/specs.js";

let activeControlGestures = 0;

/** The sidebar must not rebuild its DOM while a drag/wheel gesture owns an element. */
export function hasActiveControlGestures() { return activeControlGestures > 0; }

export function createControlElement(resolved, { labels = {}, onInput, onCommit, onError, onSuccess, onWriteError } = {}) {
	if (resolved?.status !== "ok") return null;
	const availabilityLabels = labels.availability || {};
	const imageLabels = {
		...availabilityLabels,
		none: labels.imageNone,
		upload: labels.imageUpload,
		drop: labels.imageDrop,
		clear: labels.imageClear,
		...(labels.imageAssets || {}),
	};
	const spec = resolvedControlSpec(resolved, {
		labels: {
			numeric: availabilityLabels,
			seed: { ...availabilityLabels, ...(labels.seedMode || {}) },
			boolean: { ...availabilityLabels, enabled: labels.enabled, disabled: labels.disabled },
			choice: { ...availabilityLabels, select: labels.selectOption },
			text: availabilityLabels,
				"image-choice": imageLabels,
				markdown: { ...availabilityLabels, empty: labels.markdownEmpty },
				"image-output": { ...availabilityLabels, ...(labels.imageOutput || {}) },
				"text-output": { ...availabilityLabels, ...(labels.textOutput || {}) },
				"quick-group-manager": { ...availabilityLabels, ...(labels.quickGroupManager || {}) },
				taglist: { ...availabilityLabels, ...(labels.taglist || {}) },
				image: imageLabels,
			"image-compare": { ...availabilityLabels, ...(labels.imageCompare || {}) },
		},
		presentation: { compact: true, headerOnly: typeof resolved.value === "boolean", wheelAdjust: false },
	});
	let gestureOpen = false;
	const write = (callback, onComplete = null) => {
		try { const result = callback(); onComplete?.(); return result; }
		catch (error) { if (onWriteError) onWriteError(error); else throw error; return undefined; }
	};
	const view = createSharedControl(spec, {
		preview(next) {
			write(() => {
				if (["numeric", "seed"].includes(spec.kind)) resolved.setValue(next, { transaction: false, transient: true });
				onInput?.(next);
			});
		},
		commit(next, detail = {}) {
			write(() => resolved.setValue(next, { workspaceRedraw: detail.redraw !== false }), () => onCommit?.(next, detail));
		},
		beginGesture() {
			if (gestureOpen) return;
			write(() => {
				resolved.node?.graph?.beforeChange?.();
				gestureOpen = true; activeControlGestures += 1;
			});
		},
		endGesture(next) {
			if (!gestureOpen) return;
			gestureOpen = false; activeControlGestures = Math.max(0, activeControlGestures - 1);
			try { resolved.flushValue?.(); }
			catch (error) { if (onWriteError) onWriteError(error); else throw error; }
			finally {
				resolved.node?.graph?.afterChange?.();
				resolved.node?.graph?.setDirtyCanvas?.(true, true);
				onCommit?.(next);
			}
		},
		setSeedBehavior: (behavior) => write(() => resolved.setSeedBehavior?.(behavior), () => onCommit?.(resolved.value, { seedBehavior: behavior })),
		onError,
		onSuccess,
	});
	let control = view.root;
	control.classList.add("aa-workspace-control-input");
	control.dataset.controlKind = view.kind;
	control.dataset.controlFamily = spec.family;
	control.dataset.controlAvailability = spec.availability.state;
	if (Number.isFinite(Number(resolved.minRowSpan))) control.dataset.dashboardMinRowSpan = String(resolved.minRowSpan);
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
