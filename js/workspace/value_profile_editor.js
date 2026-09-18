/** Shared controls with a local, validated preset port instead of a live Provider port. */
import { t } from "../i18n.js";
import { createSharedControl } from "../lib/controls/registry.js";
import { resolvedControlSpec } from "../lib/controls/specs.js";
import { createValueProfileDraft, profileValueCodec } from "../lib/value_profile_draft.js";
import { createProfileGroupEditor } from "../lib/value_profile_group_editor.js";
import { createProfileGalleryEditor } from "../lib/value_profile_gallery_editor.js";
import { validateProfileGroups } from "../lib/value_profile_groups.js";
import { createSeedPresetPayload, decodeSeedPresetEntry } from "../lib/seed_preset.js";
import { closeTooltipWithin, el } from "../lib/ui.js";
import { closeContextMenuWithin, closeAnchoredPopoversWithin } from "../lib/ui/overlays.js";
import { workspaceLabels } from "./labels.js";

export function createValueProfileEditor(rule, match, save) {
	const root = el("div", "aa-profile-editor");
	const error = el("div", { className: "aa-profile-editor__error", attrs: { role: "alert", hidden: true } });
	const resolved = match.candidate?.resolved;
	let draft; let view; let unsubscribe; let destroyed = false;
	const onError = (cause) => {
		console.error("[Aaalice] Profile editor failed", rule.key, cause);
		error.hidden = false;
		error.textContent = `${t("aaalice.workspace.valueProfiles.editor.failed", "Cannot edit this parameter")}: ${cause.message || cause}`;
	};
	try {
		if (match.status !== "ready" || resolved?.status !== "ok") throw new Error(t("aaalice.workspace.valueProfiles.editor.missing", "The parameter source is unavailable."));
		const specialized = ["quick-group-manager", "booru-gallery"].includes(resolved.kind) || resolved.presetEditor?.create;
		draft = createValueProfileDraft({ rule,
			validate: resolved.kind === "quick-group-manager" ? (entry) => validateProfileGroups(entry.payload) : (entry) => resolved.validatePresetValue?.(entry),
			save: (payload) => { const result = save(payload); if (result !== false) error.hidden = true; return result; },
			...(specialized ? {} : profileValueCodec(resolved, rule)),
		});
		if (resolved.kind === "quick-group-manager") view = createProfileGroupEditor(resolved, draft, onError);
		else if (resolved.kind === "booru-gallery") view = createProfileGalleryEditor(resolved, draft, onError);
		else if (resolved.presetEditor?.create) view = resolved.presetEditor.create(draft, onError);
		else {
			const labels = workspaceLabels();
			const options = { ...resolved.options };
			const spec = () => resolvedControlSpec({ kind: resolved.kind, label: rule.label, controlId: resolved.controlId,
				value: draft.getValue(), options: { ...options, ...(resolved.kind === "seed" ? { control_after_generate: decodeSeedPresetEntry({ ...rule, payload: draft.getPayload() }).behavior } : {}) },
				availability: resolved.availability,
			}, { labels: { numeric: labels.availability, seed: { ...labels.availability, ...labels.seedMode },
				boolean: { enabled: labels.enabled, disabled: labels.disabled }, choice: { select: labels.selectOption },
				"image-choice": { ...labels.imageAssets, none: labels.imageNone, upload: labels.imageUpload, clear: labels.imageClear, drop: labels.imageDrop },
			}, presentation: { compact: true, wheelAdjust: false, numericRange: match.candidate.item?.numericRange } });
			const write = (callback) => {
				try { callback(); }
				catch (cause) { onError(cause); view?.update(spec()); }
			};
			view = createSharedControl(spec(), {
				commit: (value) => write(() => draft.commit(value)),
				endGesture: (value) => { if (!destroyed) write(() => draft.commit(value)); },
				setSeedBehavior: (behavior) => write(() => draft.commitPayload(createSeedPresetPayload(draft.getValue(), behavior))),
				onError,
			});
			unsubscribe = draft.subscribe(() => view.update(spec()));
			if (view.headerAccessories.length) root.append(el("div", { className: "aa-profile-editor__accessories", children: view.headerAccessories }));
			if (view.headerOnly && view.headerAccessories.length) view.root.hidden = true;
		}
		if (!view?.root || typeof view.destroy !== "function") throw new TypeError("Invalid preset editor view");
		root.dataset.kind = resolved.kind;
		root.append(view.root);
	} catch (cause) { onError(cause); }
	root.append(error);
	return { root, destroy() {
		if (destroyed) return; destroyed = true;
		closeTooltipWithin(root); closeContextMenuWithin(root); closeAnchoredPopoversWithin(root);
		unsubscribe?.(); view?.destroy?.(); draft?.destroy();
	} };
}
