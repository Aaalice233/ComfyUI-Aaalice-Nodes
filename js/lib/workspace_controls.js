/** Sidebar host adapter for Aaalice and ComfyUI renderer families. */

import { createSharedControl } from "./controls/registry.js";
import { resolvedControlSpec } from "./controls/specs.js";
import { registerControlValueView, updateBoundControlValues } from "./control_value_channel.js";

let activeControlGestures = 0;

/** The sidebar must not rebuild its DOM while a drag/wheel gesture owns an element. */
export function hasActiveControlGestures() { return activeControlGestures > 0; }

export function createControlElement(resolved, { labels = {}, syncKeys = [], onInput, onCommit, onError, onSuccess, onWriteError } = {}) {
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
	let spec = resolvedControlSpec(resolved, {
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
	let currentValue = spec.value;
	const primarySyncKey = syncKeys[0] ? String(syncKeys[0]) : null;
	const write = (callback, onComplete = null) => {
		try { const result = callback(); onComplete?.(); return result; }
		catch (error) { if (onWriteError) onWriteError(error); else throw error; return undefined; }
	};
	let view;
	const syncValue = (next, detail = {}) => {
		const card = view.root.closest?.(".aa-control-card");
		const linkedBadge = card?.querySelector?.(".aa-control-card-binding-count");
		if (detail.sourceKey && detail.sourceKey !== primarySyncKey) {
			const mixed = !Object.is(currentValue, next);
			card?.classList.toggle("has-mixed-bindings", mixed);
			linkedBadge?.classList.toggle("is-mixed", mixed);
			const linkedLabel = mixed ? linkedBadge?.dataset.linkedMixedLabel : linkedBadge?.dataset.linkedLabel;
			if (linkedLabel) linkedBadge.setAttribute("aria-label", linkedLabel);
			return;
		}
		currentValue = next;
		spec = {
			...spec,
			value: next,
			...(detail.seedBehavior ? { options: { ...spec.options, control_after_generate: detail.seedBehavior } } : {}),
		};
		view.update(spec);
		card?.classList.remove("has-mixed-bindings");
		linkedBadge?.classList.remove("is-mixed");
		if (linkedBadge?.dataset.linkedLabel) linkedBadge.setAttribute("aria-label", linkedBadge.dataset.linkedLabel);
	};
	const complete = (next, detail = {}) => {
		currentValue = next;
		updateBoundControlValues(syncKeys, next, detail);
		onCommit?.(next, detail);
	};
	view = createSharedControl(spec, {
		preview(next) {
			write(() => {
				if (["numeric", "seed"].includes(spec.kind)) resolved.setValue(next, { transaction: false, transient: true });
				currentValue = next;
				updateBoundControlValues(syncKeys, next, { transient: true });
				onInput?.(next);
			});
		},
		commit(next, detail = {}) {
			write(() => resolved.setValue(next, { workspaceRedraw: detail.redraw !== false }), () => complete(next, detail));
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
				complete(next);
			}
		},
		setSeedBehavior: (behavior) => write(() => resolved.setSeedBehavior?.(behavior), () => complete(currentValue, { seedBehavior: behavior })),
		onError,
		onSuccess,
	});
	const unregisterValueView = registerControlValueView(syncKeys, syncValue);
	const destroyView = view.root._aaControlDestroy;
	view.root._aaControlDestroy = () => { unregisterValueView(); destroyView?.(); };
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
