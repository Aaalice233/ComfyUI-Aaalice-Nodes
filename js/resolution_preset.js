/** ResolutionPreset exact-size picker and draggable aligned canvas. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import {
	ALIGNMENTS, BUILTIN_PRESETS, CANVAS_LIMITS, MAX_RESOLUTION, MIN_RESOLUTION,
	allPresets, alignDimension, canvasDimensions, fitCanvasLimit, normalizePersonalPresets,
	normalizeResolutionState, resolutionPayload, resolutionSummary,
	presetMatches, selectPreset, selectionFractions, updateDimensions,
} from "./lib/resolution_preset_model.js";
import { button, createAnchoredPopover, createDialog, el, field, iconButton, isolate } from "./lib/ui.js";

const NODE = "ResolutionPreset";
const PROPERTY = "resolutionPresetState";
const WIDGET = "aaalice_resolution_preset";
const API = "/aaalice/resolution-presets";
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 270;
const MIN_WIDGET_WIDTH = 280;
const MIN_WIDGET_HEIGHT = 218;

let personalPresets = [];
let presetError = null;
let presetGeneration = 0;
let presetController = null;
let presetRequest = null;

function label(key, fallback) { return t(`aaalice.resolutionPreset.${key}`, fallback); }
function isResolutionNode(node) { return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE); }
function stateFor(node) { node.properties ||= {}; node.properties[PROPERTY] = normalizeResolutionState(node.properties[PROPERTY], personalPresets); return node.properties[PROPERTY]; }
function notify(severity, detail) { app.extensionManager?.toast?.add?.({ severity, summary: label("title", "Resolution Preset"), detail }); }

async function jsonRequest(path, options = {}) {
	const response = await api.fetchApi(path, options);
	let data;
	try { data = await response.json(); }
	catch { throw new Error(`${path} returned invalid JSON`); }
	if (!response.ok) throw new Error(data?.message || `${path} HTTP ${response.status}`);
	return data;
}

function renderAll() { for (const node of app.graph?._nodes || []) if (isResolutionNode(node)) render(node); }

async function loadPersonalPresets({ force = false } = {}) {
	if (!force && presetRequest) return presetRequest;
	presetController?.abort();
	const generation = ++presetGeneration;
	const controller = new AbortController(); presetController = controller;
	presetRequest = jsonRequest(API, { signal: controller.signal }).then((data) => {
		if (generation !== presetGeneration) return personalPresets;
		personalPresets = normalizePersonalPresets(data?.presets);
		presetError = null; renderAll(); return personalPresets;
	}).catch((error) => {
		if (error?.name === "AbortError" || generation !== presetGeneration) return personalPresets;
		presetError = error; console.error("[Aaalice] Resolution presets failed", error); renderAll(); return personalPresets;
	}).finally(() => { if (generation === presetGeneration) presetRequest = null; });
	return presetRequest;
}

function commit(node, mutate) {
	node.graph?.beforeChange?.();
	try { mutate(); }
	finally { node.graph?.afterChange?.(); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, true); }
	render(node);
}

function applyDimensions(node, changes, options) {
	commit(node, () => { node.properties[PROPERTY] = updateDimensions(stateFor(node), changes, personalPresets, options); });
}

function currentPreset(node) {
	const state = stateFor(node);
	return allPresets(personalPresets).find((preset) => preset.id === state.presetId && presetMatches(preset, state.width, state.height, state.alignment)) || null;
}

function closeTransient(node) {
	node._aaResolutionPopover?.close?.(); node._aaResolutionPopover = null;
}

function setPopover(node, popover) {
	closeTransient(node); node._aaResolutionPopover = popover;
	const close = popover.close;
	popover.close = () => { close(); if (node._aaResolutionPopover?.root === popover.root) node._aaResolutionPopover = null; };
	return popover;
}

function presetGroups() {
	return [
		["square", label("groups.square", "Square")],
		["portrait", label("groups.portrait", "Portrait")],
		["landscape", label("groups.landscape", "Landscape")],
		["personal", label("groups.personal", "My presets")],
	];
}

function openPresetPopover(node, anchor) {
	const popover = setPopover(node, createAnchoredPopover({ anchor, ariaLabel: label("preset.choose", "Choose resolution"), className: "aa-resolution-preset-popover", width: 300 }));
	const state = stateFor(node); const presets = allPresets(personalPresets);
	const list = el("div", "aa-resolution-preset-list");
	for (const [group, groupLabel] of presetGroups()) {
		const items = presets.filter((preset) => preset.group === group);
		if (!items.length && group !== "personal") continue;
		const section = el("section", "aa-resolution-preset-group");
		section.append(el("strong", "aa-resolution-preset-group__title", groupLabel));
		if (!items.length) section.append(el("span", "aa-resolution-preset-empty", presetError ? label("preset.unavailable", "Personal presets unavailable") : label("preset.empty", "No personal presets")));
		for (const preset of items) {
			const active = state.presetId === preset.id;
			const row = button({ label: preset.name, variant: "ghost", size: "sm", className: `aa-resolution-preset-option${active ? " is-active" : ""}`, onClick: () => {
				commit(node, () => { node.properties[PROPERTY] = selectPreset(stateFor(node), preset); }); popover.close();
			} });
			row.setAttribute("aria-pressed", String(active));
			row.append(el("span", "aa-resolution-preset-option__mark", active ? "✓" : ""));
			section.append(row);
		}
		list.append(section);
	}
	const save = button({ label: label("preset.saveCurrent", "Save current"), iconName: "save", variant: "ghost", size: "sm", disabled: Boolean(presetError), onClick: () => { popover.close(); openSaveDialog(node); } });
	const manage = button({ label: label("preset.manage", "Manage presets"), iconName: "settings", variant: "ghost", size: "sm", disabled: Boolean(presetError), onClick: () => { popover.close(); openManageDialog(node); } });
	popover.root.append(list, el("footer", { className: "aa-resolution-preset-popover__footer", children: [save, manage] }));
}

function openAlignmentPopover(node, anchor) {
	const popover = setPopover(node, createAnchoredPopover({ anchor, ariaLabel: label("alignment.title", "Pixel alignment"), className: "aa-resolution-choice-popover", width: 244 }));
	const state = stateFor(node);
	for (const alignment of ALIGNMENTS) {
		const width = alignDimension(state.width, alignment); const height = alignDimension(state.height, alignment);
		const detail = width === state.width && height === state.height ? "" : `${state.width}×${state.height} → ${width}×${height}`;
		const control = button({ label: `${alignment} px`, variant: "ghost", size: "sm", className: `aa-resolution-choice${alignment === state.alignment ? " is-active" : ""}`, onClick: () => {
			applyDimensions(node, { alignment, width, height }); popover.close();
		} });
		control.append(el("span", "aa-resolution-choice__detail", detail || (alignment === state.alignment ? "✓" : "")));
		popover.root.append(control);
	}
}

function openRangePopover(node, anchor) {
	const popover = setPopover(node, createAnchoredPopover({ anchor, ariaLabel: label("range.title", "Canvas range"), className: "aa-resolution-choice-popover", width: 260 }));
	const state = stateFor(node);
	for (const limit of CANVAS_LIMITS) {
		const fitted = fitCanvasLimit(state, limit, personalPresets);
		const changesSize = fitted.width !== state.width || fitted.height !== state.height;
		const detail = changesSize ? `${state.width}×${state.height} → ${fitted.width}×${fitted.height}` : (limit === state.canvasMax ? "✓" : "");
		const control = button({ label: `${limit} px`, variant: "ghost", size: "sm", className: `aa-resolution-choice${limit === state.canvasMax ? " is-active" : ""}`, onClick: () => {
			commit(node, () => { node.properties[PROPERTY] = fitCanvasLimit(stateFor(node), limit, personalPresets); }); popover.close();
		} });
		control.append(el("span", "aa-resolution-choice__detail", detail)); popover.root.append(control);
	}
}

function dialogInput(value = "") {
	const input = document.createElement("input"); input.type = "text"; input.value = value; input.maxLength = 48; input.className = "aa-ui-input aa-resolution-dialog-input"; return input;
}

async function savePersonalPreset(preset) {
	const data = await jsonRequest(`${API}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset }) });
	personalPresets = normalizePersonalPresets(data.presets); presetError = null; renderAll(); return personalPresets.find((item) => item.name.toLocaleLowerCase() === preset.name.trim().toLocaleLowerCase());
}

function openSaveDialog(node, existing = null, afterSave = null) {
	if (presetError) {
		const reason = presetError?.message ? `: ${presetError.message}` : "";
		notify("error", `${label("preset.unavailable", "Personal presets unavailable")}${reason}`);
		void loadPersonalPresets({ force: true });
		return;
	}
	const state = stateFor(node); const name = dialogInput(existing?.name || "");
	const error = el("div", { className: "aa-resolution-dialog-error", attrs: { role: "alert", hidden: true } });
	const summary = resolutionSummary(existing?.width || state.width, existing?.height || state.height);
	const body = el("div", { className: "aa-resolution-save-dialog", children: [
		field({ label: label("preset.name", "Name"), control: name }),
		el("div", { className: "aa-resolution-save-summary", children: [el("strong", null, `${existing?.width || state.width}×${existing?.height || state.height}`), el("span", null, `${summary.ratio} · ${existing?.alignment || state.alignment} px`)] }), error,
	] });
	const footer = el("div"); let dialog;
	const cancel = button({ label: label("actions.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() });
	const save = button({ label: existing ? label("actions.saveChanges", "Save changes") : label("actions.save", "Save"), defaultAction: true, onClick: async () => {
		error.hidden = true; save.disabled = true;
		try {
			const saved = await savePersonalPreset({ id: existing?.id, name: name.value, width: existing?.width || state.width, height: existing?.height || state.height, alignment: existing?.alignment || state.alignment });
			if (!existing && saved) commit(node, () => { stateFor(node).presetId = saved.id; });
			dialog.close(); afterSave?.(); notify("success", label("preset.saved", "Preset saved"));
		} catch (cause) { error.textContent = cause.message; error.hidden = false; }
		finally { save.disabled = false; }
	} });
	footer.append(cancel, save); dialog = createDialog({ title: existing ? label("preset.rename", "Edit preset") : label("preset.saveTitle", "Save resolution preset"), body, footer, size: "compact" });
	setTimeout(() => { name.focus(); name.select(); }, 0);
}

function confirmDeletePreset(preset) {
	return new Promise((resolve) => {
		const body = el("div", "aa-resolution-confirm-copy", label("preset.deleteConfirm", "Delete this personal preset?").replace("{name}", preset.name));
		const footer = el("div"); let dialog;
		const cancel = button({ label: label("actions.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close(false) });
		const remove = button({ label: label("actions.delete", "Delete"), variant: "danger", defaultAction: true, onClick: () => dialog.close(true) });
		footer.append(cancel, remove);
		dialog = createDialog({ title: label("preset.deleteTitle", "Delete preset"), body, footer, size: "compact", onClose: (value) => resolve(value === true) });
	});
}

function openManageDialog(node) {
	const body = el("div", "aa-resolution-manage-dialog"); const footer = el("div"); let dialog;
	const renderList = () => {
		body.replaceChildren();
		if (!personalPresets.length) body.append(el("div", "aa-resolution-manage-empty", label("preset.empty", "No personal presets")));
		for (const preset of personalPresets) {
			const identity = el("div", { className: "aa-resolution-manage-identity", children: [el("strong", null, preset.name), el("span", null, `${preset.width}×${preset.height} · ${preset.alignment} px`)] });
			const edit = iconButton({ iconName: "edit", label: label("preset.rename", "Edit preset"), variant: "ghost", onClick: () => openSaveDialog(node, preset, renderList) });
			const remove = iconButton({ iconName: "delete", label: label("actions.delete", "Delete"), variant: "ghost", className: "is-danger", onClick: async () => {
				if (!await confirmDeletePreset(preset)) return;
				try { const data = await jsonRequest(`${API}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: preset.id }) }); personalPresets = normalizePersonalPresets(data.presets); renderAll(); renderList(); }
				catch (error) { notify("error", error.message); }
			} });
			body.append(el("div", { className: "aa-resolution-manage-row", children: [identity, edit, remove] }));
		}
	};
	const add = button({ label: label("preset.saveCurrent", "Save current"), iconName: "save", variant: "secondary", onClick: () => openSaveDialog(node, null, renderList) });
	const done = button({ label: label("actions.done", "Done"), onClick: () => dialog.close() }); footer.append(add, done);
	dialog = createDialog({ title: label("preset.manage", "Manage presets"), body, footer, size: "sm", confirmOnEnter: false }); renderList();
}

function beginDrag(node, mode, event) {
	if (event.button !== 0 || node._aaResolutionDrag) return;
	const stage = node._aaResolutionStage; const rect = stage.getBoundingClientRect(); const snapshot = structuredClone(stateFor(node));
	node.graph?.beforeChange?.();
	const drag = { mode, pointerId: event.pointerId, snapshot, rect, target: event.currentTarget };
	node._aaResolutionDrag = drag; drag.target.setPointerCapture?.(event.pointerId); node._aaResolutionRoot.classList.add("is-dragging");
	const move = (nextEvent) => {
		if (nextEvent.pointerId !== drag.pointerId) return;
		const x = (nextEvent.clientX - rect.left) / rect.width; const y = 1 - ((nextEvent.clientY - rect.top) / rect.height);
		const next = canvasDimensions(stateFor(node), x, y, mode); const state = stateFor(node); state.width = next.width; state.height = next.height; state.presetId = null; render(node);
	};
	const finish = (cancel = false) => {
		if (node._aaResolutionDrag !== drag) return;
		if (cancel) node.properties[PROPERTY] = snapshot;
		else node.properties[PROPERTY] = updateDimensions(stateFor(node), {}, personalPresets, { expandCanvas: false });
		drag.target.releasePointerCapture?.(drag.pointerId); node._aaResolutionDrag = null; node._aaResolutionRoot?.classList.remove("is-dragging");
		window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancelEvent); window.removeEventListener("blur", blur); window.removeEventListener("keydown", key, true);
		node.graph?.afterChange?.(); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, true); render(node);
	};
	drag.cancel = () => finish(true);
	const up = (nextEvent) => { if (nextEvent.pointerId === drag.pointerId) finish(false); };
	const cancelEvent = (nextEvent) => { if (nextEvent.pointerId === drag.pointerId) finish(true); };
	const blur = () => finish(true); const key = (keyEvent) => { if (keyEvent.key === "Escape") { keyEvent.preventDefault(); finish(true); } };
	window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancelEvent); window.addEventListener("blur", blur); window.addEventListener("keydown", key, true); event.preventDefault();
}

function keyboardAdjust(node, mode, event) {
	const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight"; const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
	if ((!horizontal && !vertical) || (mode === "width" && vertical) || (mode === "height" && horizontal)) return;
	event.preventDefault(); const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1; const amount = stateFor(node).alignment * (event.shiftKey ? 4 : 1) * direction;
	const changes = horizontal ? { width: stateFor(node).width + amount } : { height: stateFor(node).height + amount };
	if (!node._aaResolutionKeyboardGesture) {
		node.graph?.beforeChange?.();
		node._aaResolutionKeyboardGesture = { timer: null };
	}
	clearTimeout(node._aaResolutionKeyboardGesture.timer);
	node.properties[PROPERTY] = updateDimensions(stateFor(node), changes, personalPresets);
	render(node);
	node._aaResolutionKeyboardGesture.timer = setTimeout(() => finishKeyboardGesture(node), 180);
}

function finishKeyboardGesture(node) {
	const gesture = node._aaResolutionKeyboardGesture;
	if (!gesture) return;
	clearTimeout(gesture.timer); node._aaResolutionKeyboardGesture = null;
	node.graph?.afterChange?.(); node.graph?.change?.(); node.graph?.setDirtyCanvas?.(true, true);
}

function inputControl(node, dimension) {
	const input = document.createElement("input"); input.type = "number"; input.inputMode = "numeric"; input.min = String(MIN_RESOLUTION); input.max = String(MAX_RESOLUTION); input.className = "aa-ui-input aa-resolution-number-input";
	input.setAttribute("aria-label", label(`input.${dimension}`, dimension));
	const marker = el("span", { className: "aa-resolution-number-marker", attrs: { "aria-hidden": "true" }, text: dimension === "width" ? "W" : "H" });
	const error = el("span", { className: "aa-resolution-number-error", attrs: { role: "alert", hidden: true } });
	const suggestion = button({ label: "", variant: "ghost", size: "sm", className: "aa-resolution-number-suggestion" }); suggestion.hidden = true;
	const feedback = el("div", { className: "aa-resolution-number-feedback", attrs: { hidden: true }, children: [error, suggestion] });
	let skipNextBlur = false;
	const clearError = () => { feedback.hidden = true; error.hidden = true; suggestion.hidden = true; };
	const commitValue = () => {
		const state = stateFor(node); const raw = Number(input.value); const aligned = alignDimension(raw, state.alignment);
		if (!Number.isInteger(raw) || raw < MIN_RESOLUTION || raw > MAX_RESOLUTION) { error.textContent = label("input.rangeError", "Enter a valid resolution"); feedback.hidden = false; error.hidden = false; suggestion.hidden = true; return; }
		if (raw !== aligned) {
			error.textContent = label("input.alignmentError", "Must be divisible by {alignment}").replace("{alignment}", state.alignment); feedback.hidden = false; error.hidden = false; suggestion.textContent = label("input.useSuggestion", "Use {value}").replace("{value}", aligned); suggestion.hidden = false;
			suggestion.onpointerdown = () => { skipNextBlur = true; };
			suggestion.onclick = () => { applyDimensions(node, { [dimension]: aligned }); clearError(); skipNextBlur = false; };
			return;
		}
		if (raw === state[dimension]) { clearError(); return; }
		applyDimensions(node, { [dimension]: raw }); clearError();
	};
	input.addEventListener("focus", clearError); input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") { event.preventDefault(); skipNextBlur = true; commitValue(); input.blur(); }
		else if (event.key === "Escape") { event.preventDefault(); skipNextBlur = true; input.value = String(stateFor(node)[dimension]); clearError(); input.blur(); }
		else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const direction = event.key === "ArrowUp" ? 1 : -1; applyDimensions(node, { [dimension]: stateFor(node)[dimension] + direction * stateFor(node).alignment * (event.shiftKey ? 4 : 1) }); }
	});
	input.addEventListener("blur", () => { if (skipNextBlur) { skipNextBlur = false; return; } commitValue(); });
	return { root: el("div", { className: "aa-resolution-number-shell", children: [marker, input, feedback] }), input, error, suggestion };
}

function createInterface(node) {
	const preset = button({ label: "", variant: "secondary", size: "sm", className: "aa-resolution-preset-trigger", onClick: (event) => openPresetPopover(node, event.currentTarget) });
	const alignment = button({ label: "", variant: "ghost", size: "sm", className: "aa-resolution-status-chip aa-resolution-status-chip--alignment", onClick: (event) => openAlignmentPopover(node, event.currentTarget) });
	const range = button({ label: "", variant: "ghost", size: "sm", className: "aa-resolution-status-chip aa-resolution-status-chip--range", onClick: (event) => openRangePopover(node, event.currentTarget) });
	const swap = iconButton({ iconName: "swap", label: label("actions.swap", "Swap width and height"), variant: "ghost", className: "aa-resolution-tool-action", onClick: () => applyDimensions(node, { width: stateFor(node).height, height: stateFor(node).width }) });
	const save = iconButton({ iconName: "save", label: label("preset.saveCurrent", "Save current"), variant: "ghost", className: "aa-resolution-tool-action", onClick: () => openSaveDialog(node) });
	const tools = el("div", { className: "aa-resolution-toolbar__tools", children: [swap, save] });
	const toolbar = el("div", { className: "aa-resolution-toolbar", children: [preset, alignment, range, tools] });
	const selection = el("div", "aa-resolution-selection");
	const widthHandle = el("button", { className: "aa-resolution-handle aa-resolution-handle--width", attrs: { type: "button", "aria-label": label("canvas.widthHandle", "Drag to adjust width") } });
	const heightHandle = el("button", { className: "aa-resolution-handle aa-resolution-handle--height", attrs: { type: "button", "aria-label": label("canvas.heightHandle", "Drag to adjust height") } });
	const bothHandle = el("button", { className: "aa-resolution-handle aa-resolution-handle--both", attrs: { type: "button", "aria-label": label("canvas.bothHandle", "Drag to adjust width and height") } });
	for (const [handle, mode] of [[widthHandle, "width"], [heightHandle, "height"], [bothHandle, "both"]]) { handle.addEventListener("pointerdown", (event) => beginDrag(node, mode, event)); handle.addEventListener("keydown", (event) => keyboardAdjust(node, mode, event)); }
	selection.append(widthHandle, heightHandle, bothHandle);
	const ratio = el("span", "aa-resolution-canvas-summary");
	const dotGrid = el("div", { className: "aa-resolution-dot-grid", attrs: { "aria-hidden": "true" } });
	for (let index = 0; index < 352; index += 1) dotGrid.append(el("span", "aa-resolution-dot"));
	const artboard = el("div", { className: "aa-resolution-artboard", children: [dotGrid, selection] });
	const width = inputControl(node, "width"); const height = inputControl(node, "height");
	width.root.classList.add("aa-resolution-stage-field", "aa-resolution-stage-field--width"); height.root.classList.add("aa-resolution-stage-field", "aa-resolution-stage-field--height");
	const editor = el("div", { className: "aa-resolution-stage-editor", children: [width.root, height.root] });
	const summary = el("div", { className: "aa-resolution-stage__summary", children: [editor, ratio] });
	const plane = el("div", { className: "aa-resolution-plane", children: [artboard, summary] });
	const stage = el("div", { className: "aa-resolution-stage", children: [plane] });
	const root = isolate(el("div", { className: "aa-resolution-preset", children: [toolbar, stage] }));
	Object.assign(node, { _aaResolutionRoot: root, _aaResolutionPresetTrigger: preset, _aaResolutionSave: save, _aaResolutionAlignment: alignment, _aaResolutionRange: range, _aaResolutionStage: artboard, _aaResolutionSelection: selection, _aaResolutionSummary: ratio, _aaResolutionWidth: width, _aaResolutionHeight: height });
	return root;
}

function render(node) {
	if (!node._aaResolutionRoot) return;
	const state = stateFor(node); const preset = currentPreset(node); const summary = resolutionSummary(state.width, state.height); const fractions = selectionFractions(state);
	node._aaResolutionPresetTrigger.querySelector(".aa-ui-button__label").textContent = preset ? `${preset.name}` : label("preset.custom", "Custom");
	node._aaResolutionPresetTrigger.title = preset ? `${preset.name} · ${state.width}×${state.height}` : `${label("preset.custom", "Custom")} · ${state.width}×${state.height}`;
	const alignmentLabel = label("alignment.chip", "{value} px aligned").replace("{value}", state.alignment);
	const rangeLabel = label("range.chip", "Max {value}").replace("{value}", state.canvasMax);
	node._aaResolutionAlignment.querySelector(".aa-ui-button__label").textContent = `${state.alignment} px`; node._aaResolutionAlignment.title = alignmentLabel; node._aaResolutionAlignment.setAttribute("aria-label", alignmentLabel);
	node._aaResolutionRange.querySelector(".aa-ui-button__label").textContent = `≤ ${state.canvasMax}`; node._aaResolutionRange.title = rangeLabel; node._aaResolutionRange.setAttribute("aria-label", rangeLabel);
	node._aaResolutionSelection.style.width = `${Math.max(3, fractions.width * 100)}%`; node._aaResolutionSelection.style.height = `${Math.max(3, fractions.height * 100)}%`;
	node._aaResolutionSummary.textContent = `${summary.ratio} · ${summary.megapixels}`;
	node._aaResolutionWidth.input.value = String(state.width); node._aaResolutionWidth.input.step = String(state.alignment);
	node._aaResolutionHeight.input.value = String(state.height); node._aaResolutionHeight.input.step = String(state.alignment);
	node._aaResolutionAccent?.sync?.();
}

function cancelDrag(node) { node._aaResolutionDrag?.cancel?.(); }

function setupNode(node, { initializeSize = false } = {}) {
	if (!isResolutionNode(node) || node._aaResolutionMounted) return;
	node._aaResolutionMounted = true; stateFor(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] ResolutionPreset requires addDOMWidget");
	const root = createInterface(node); node._aaResolutionAccent = bindNodeAccent(node, root);
	addLifecycleDOMWidget(node, WIDGET, "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getMinHeight: () => MIN_WIDGET_HEIGHT, getValue: () => "", setValue: () => {} });
	installDomWidgetResizePassthrough(node, root);
	const previousComputeSize = node.computeSize; node.computeSize = function () { const size = previousComputeSize?.apply(this, arguments) || [MIN_WIDGET_WIDTH, MIN_WIDGET_HEIGHT]; return [Math.max(MIN_WIDGET_WIDTH, Number(size[0]) || 0), Math.max(MIN_WIDGET_HEIGHT, Number(size[1]) || 0)]; };
	const previousConfigure = node.onConfigure; node.onConfigure = function () { const result = previousConfigure?.apply(this, arguments); this.properties[PROPERTY] = normalizeResolutionState(this.properties?.[PROPERTY], personalPresets); render(this); return result; };
	const previousRemoved = node.onRemoved; node.onRemoved = function () { cancelDrag(this); finishKeyboardGesture(this); closeTransient(this); cleanupDomWidgetResizePassthrough(this); this._aaResolutionAccent?.dispose?.(); this._aaResolutionRoot?.remove?.(); return previousRemoved?.apply(this, arguments); };
	render(node); void loadPersonalPresets(); if (initializeSize) node.setSize?.([DEFAULT_WIDTH, DEFAULT_HEIGHT]);
}

function installPromptHook() {
	if (app._aaaliceResolutionPresetPromptHook) return; app._aaaliceResolutionPresetPromptHook = true;
	const original = app.graphToPrompt?.bind(app); if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for ResolutionPreset");
	app.graphToPrompt = async function (...args) { const nodes = (app.graph?._nodes || []).filter(isResolutionNode); const result = await original(...args); const output = result?.output ?? result; for (const node of nodes) { const promptNode = output?.[String(node.id)]; if (!promptNode) continue; promptNode.inputs ||= {}; promptNode.inputs.resolution_json = JSON.stringify(resolutionPayload(stateFor(node))); } return result; };
}

function hookPrototype(nodeType) { if (!nodeType || nodeType.__aaaliceResolutionPreset) return; nodeType.__aaaliceResolutionPreset = true; const previous = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { const result = previous?.apply(this, arguments); setupNode(this, { initializeSize: true }); return result; }; }

app.registerExtension({
	name: "ComfyUI.Aaalice.ResolutionPreset",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isResolutionNode(node)) setupNode(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isResolutionNode(node)) { setupNode(node); node.properties[PROPERTY] = normalizeResolutionState(node.properties?.[PROPERTY], personalPresets); render(node); void loadPersonalPresets(); } },
	setup() { installPromptHook(); for (const node of app.graph?._nodes || []) if (isResolutionNode(node)) setupNode(node); },
});
