/** PromptCleaningMaid compact mode switcher, settings, and prompt payload. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import {
	DEFAULT_PROMPT_CLEANING_STATE,
	PROMPT_MODE,
	hasCustomPromptCleaningSettings,
	modeSettingsKey,
	normalizePromptCleaningState,
	promptCleaningPayload,
	resetPromptCleaningMode,
} from "./lib/prompt_cleaning_maid_model.js";
import { button, createAnchoredPopover, el, iconButton, isolate, segmentedControl, toggleSwitch } from "./lib/ui.js";

const NODE = "PromptCleaningMaid";
const PROPERTY = "promptCleaningMaidState";
const WIDGET = "aaalice_prompt_cleaning_maid";
const DEFAULT_WIDTH = 300;
const MIN_WIDGET_HEIGHT = 44;

const SETTING_DEFINITIONS = Object.freeze({
	naturalLanguage: [
		["trimOuterWhitespace", "trimOuterWhitespace", "Trim outer whitespace"],
		["trimLineEndWhitespace", "trimLineEndWhitespace", "Trim line-end whitespace"],
		["collapseBlankLines", "collapseBlankLines", "Collapse blank lines"],
	],
	tagList: [
		["trimTagWhitespace", "trimTagWhitespace", "Trim tag whitespace"],
		["removeEmptyTags", "removeEmptyTags", "Remove empty tags"],
		["deduplicateTags", "deduplicateTags", "Deduplicate tags"],
		["ignoreCase", "ignoreCase", "Ignore case", "deduplicateTags"],
		["underscoreEqualsSpace", "underscoreEqualsSpace", 'Treat "_" as space', "deduplicateTags"],
	],
});

function isCleaner(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function stateFor(node) {
	node.properties ||= {};
	node.properties[PROPERTY] = normalizePromptCleaningState(node.properties[PROPERTY]);
	return node.properties[PROPERTY];
}

function commit(node, mutate) {
	const graph = node.graph;
	graph?.beforeChange?.();
	try { mutate(); }
	finally {
		graph?.afterChange?.();
		graph?.change?.();
		graph?.setDirtyCanvas?.(true, true);
	}
}

function closeSettings(node) {
	node._aaalicePromptCleanerPopover?.close?.();
	node._aaalicePromptCleanerPopover = null;
}

function modeLabel(mode) {
	if (mode === PROMPT_MODE.OFF) return t("aaalice.promptCleaner.mode.off", "Off");
	if (mode === PROMPT_MODE.TAG_LIST) return t("aaalice.promptCleaner.mode.tagList", "Tag list");
	return t("aaalice.promptCleaner.mode.naturalLanguage", "Natural");
}

function settingsLabel(name, fallback) {
	return t(`aaalice.promptCleaner.settings.${name}`, fallback);
}

function setMode(node, mode) {
	if (stateFor(node).mode === mode) return;
	closeSettings(node);
	commit(node, () => { stateFor(node).mode = mode; });
	render(node);
}

function setSetting(node, key, value) {
	const state = stateFor(node);
	const group = modeSettingsKey(state.mode);
	commit(node, () => { stateFor(node).settings[group][key] = Boolean(value); });
	render(node);
	syncSettingsPopover(node);
}

function resetCurrentMode(node) {
	commit(node, () => { node.properties[PROPERTY] = resetPromptCleaningMode(stateFor(node), stateFor(node).mode); });
	render(node);
	syncSettingsPopover(node);
}

function syncSettingsPopover(node) {
	const popup = node._aaalicePromptCleanerPopover;
	if (!popup) return;
	const state = stateFor(node);
	const group = modeSettingsKey(state.mode);
	for (const [key, control] of popup.controls) {
		control.setChecked(state.settings[group][key]);
		const definition = SETTING_DEFINITIONS[group].find(([name]) => name === key);
		control.setDisabled(Boolean(definition?.[3]) && !state.settings[group][definition[3]]);
	}
}

function openSettings(node, anchor) {
	closeSettings(node);
	const state = stateFor(node);
	if (state.mode === PROMPT_MODE.OFF) return;
	const group = modeSettingsKey(state.mode);
	const ariaLabel = t("aaalice.promptCleaner.settings.aria", "Prompt cleaning settings");
	const popup = createAnchoredPopover({ anchor, ariaLabel, className: "aaalice-prompt-cleaner-popover", width: 300 });
	const sharedClose = popup.close;
	popup.close = () => {
		sharedClose();
		if (node._aaalicePromptCleanerPopover?.root === popup.root) node._aaalicePromptCleanerPopover = null;
	};
	popup.controls = new Map();
	popup.root.append(el("strong", "aaalice-prompt-cleaner-popover-title", modeLabel(state.mode)));
	const rows = el("div", "aaalice-prompt-cleaner-settings-list");
	for (const [key, labelKey, fallback, dependency] of SETTING_DEFINITIONS[group]) {
		const label = settingsLabel(labelKey, fallback);
		const control = toggleSwitch({
			checked: state.settings[group][key],
			label,
			disabled: Boolean(dependency) && !state.settings[group][dependency],
			onChange: (value) => setSetting(node, key, value),
		});
		popup.controls.set(key, control);
		rows.append(el("div", { className: `aaalice-prompt-cleaner-setting${dependency ? " is-dependent" : ""}`, children: [el("span", null, label), control] }));
	}
	const reset = button({ label: t("aaalice.promptCleaner.settings.reset", "Reset defaults"), variant: "ghost", size: "sm", onClick: () => resetCurrentMode(node) });
	popup.root.append(rows, el("footer", { className: "aaalice-prompt-cleaner-popover-footer", children: [reset] }));
	node._aaalicePromptCleanerPopover = popup;
}

function ensureControls(node) {
	const root = node._aaalicePromptCleanerRoot;
	if (node._aaalicePromptCleanerSegmented) return;
	const state = stateFor(node);
	const segmented = segmentedControl({
		value: state.mode,
		options: [PROMPT_MODE.OFF, PROMPT_MODE.NATURAL_LANGUAGE, PROMPT_MODE.TAG_LIST].map((value) => ({ value, label: modeLabel(value) })),
		ariaLabel: t("aaalice.promptCleaner.mode.aria", "Prompt format"),
		onChange: (value) => setMode(node, value),
		className: "aaalice-prompt-cleaner-segmented",
	});
	const settings = iconButton({ iconName: "settings", label: t("aaalice.promptCleaner.settings.aria", "Prompt cleaning settings"), variant: "ghost", className: "aaalice-prompt-cleaner-settings-button" });
	settings.addEventListener("click", () => openSettings(node, settings));
	root.append(segmented, settings);
	node._aaalicePromptCleanerSegmented = segmented;
	node._aaalicePromptCleanerSettingsButton = settings;
}

function render(node) {
	if (!node._aaalicePromptCleanerRoot) return;
	ensureControls(node);
	const state = stateFor(node);
	const segmented = node._aaalicePromptCleanerSegmented;
	segmented.setValue(state.mode);
	segmented.setLabel(t("aaalice.promptCleaner.mode.aria", "Prompt format"));
	for (const choice of segmented.querySelectorAll("button")) choice.textContent = modeLabel(choice.dataset.value);
	const settings = node._aaalicePromptCleanerSettingsButton;
	const disabled = state.mode === PROMPT_MODE.OFF;
	const label = disabled
		? t("aaalice.promptCleaner.settings.disabled", "Cleaning is disabled")
		: t("aaalice.promptCleaner.settings.aria", "Prompt cleaning settings");
	settings.setAttribute("aria-label", label);
	settings.title = label;
	settings.disabled = disabled;
	settings.classList.toggle("has-custom-settings", hasCustomPromptCleaningSettings(state));
}

function setupCleaner(node, { initializeSize = false } = {}) {
	if (!isCleaner(node) || node._aaalicePromptCleanerMounted) return;
	node._aaalicePromptCleanerMounted = true;
	stateFor(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] PromptCleaningMaid requires addDOMWidget");
	const root = isolate(el("div", "aaalice-prompt-cleaner"));
	node._aaalicePromptCleanerRoot = root;
	node.addDOMWidget(WIDGET, "custom", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 0,
		getMinHeight: () => MIN_WIDGET_HEIGHT,
		getValue: () => "",
		setValue: () => {},
	});
	installDomWidgetResizePassthrough(node, root);
	const previousComputeSize = node.computeSize;
	node.computeSize = function () {
		const computed = previousComputeSize?.apply(this, arguments) || [DEFAULT_WIDTH, MIN_WIDGET_HEIGHT];
		return [Math.max(DEFAULT_WIDTH, Number(computed[0]) || 0), Number(computed[1]) || MIN_WIDGET_HEIGHT];
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () {
		const result = previousConfigure?.apply(this, arguments);
		this.properties[PROPERTY] = normalizePromptCleaningState(this.properties?.[PROPERTY]);
		render(this);
		return result;
	};
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		closeSettings(this);
		cleanupDomWidgetResizePassthrough(this);
		this._aaalicePromptCleanerRoot?.remove?.();
		return previousRemoved?.apply(this, arguments);
	};
	render(node);
	if (initializeSize) node.setSize?.(node.computeSize());
}

function installPromptHook() {
	if (app._aaalicePromptCleaningMaidPromptHook) return;
	app._aaalicePromptCleaningMaidPromptHook = true;
	const original = app.graphToPrompt?.bind(app);
	if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for PromptCleaningMaid");
	app.graphToPrompt = async function (...args) {
		const nodes = (app.graph?._nodes || []).filter(isCleaner);
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of nodes) {
			const promptNode = output?.[String(node.id)];
			if (!promptNode) continue;
			promptNode.inputs ||= {};
			promptNode.inputs.config_json = JSON.stringify(promptCleaningPayload(stateFor(node)));
		}
		return result;
	};
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaalicePromptCleaningMaid) return;
	nodeType.__aaalicePromptCleaningMaid = true;
	const previous = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previous?.apply(this, arguments);
		setupCleaner(this, { initializeSize: true });
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.PromptCleaningMaid",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isCleaner(node)) setupCleaner(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isCleaner(node)) setupCleaner(node); },
	setup() {
		installPromptHook();
		for (const node of app.graph?._nodes || []) if (isCleaner(node)) setupCleaner(node);
	},
});
