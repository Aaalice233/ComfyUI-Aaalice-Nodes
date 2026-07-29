/** CharacterFeatureSwapNode feature editor and ComfyUI settings surface. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import { characterFeatureSwapPayload, normalizeCharacterFeatureSwapState } from "./lib/character_feature_swap_model.js";
import { createTagListControl } from "./lib/controls/taglist.js";
import {
	cleanupDomWidgetResizePassthrough,
	installDomWidgetResizePassthrough,
} from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { allGraphNodes, promptNodesForGraphNode } from "./lib/graph_scope.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import { button, createDialog, el, field, iconButton, isolate } from "./lib/ui.js";

const NODE = "CharacterFeatureSwapNode";
const PROPERTY = "characterFeatureSwap";
const WIDGET = "aaalice_character_feature_swap";
const API = "/aaalice/character-feature-swap";
const DEFAULT_WIDTH = 360;
const MIN_WIDGET_HEIGHT = 164;

let publicSettings = null;
let publicSettingsRequest = null;

function isCharacterSwap(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function stateFor(node) {
	node.properties ||= {};
	node.properties[PROPERTY] = normalizeCharacterFeatureSwapState(node.properties[PROPERTY]);
	return node.properties[PROPERTY];
}

function labels() {
	return {
		placeholder: t("aaalice.characterSwap.features.placeholder", "Enter features and press Enter"),
		append: t("aaalice.characterSwap.features.append", "+ Add feature"),
		empty: t("aaalice.characterSwap.features.empty", "Add at least one replacement feature"),
		input: t("aaalice.characterSwap.features.input", "Add replacement features"),
		enable: t("aaalice.characterSwap.features.enable", "Enable {tag}"),
		disable: t("aaalice.characterSwap.features.disable", "Disable {tag}"),
		remove: t("aaalice.characterSwap.features.remove", "Remove {tag}"),
	};
}

function commitFeatures(node, features) {
	const graph = node.graph;
	graph?.beforeChange?.();
	try { stateFor(node).features = features; }
	finally {
		graph?.afterChange?.();
		graph?.change?.();
		graph?.setDirtyCanvas?.(true, true);
	}
}

function thinkingLabel(mode) {
	return ({
		disabled: t("aaalice.characterSwap.settings.thinkingDisabled", "Off"),
		high: t("aaalice.characterSwap.settings.thinkingHigh", "High"),
		max: t("aaalice.characterSwap.settings.thinkingMax", "Maximum"),
	})[mode] || "—";
}

function renderSettingsSummary(node) {
	if (!node._aaaliceCharacterSwapModelValue || !node._aaaliceCharacterSwapThinkingValue) return;
	const model = publicSettings?.model || "—";
	const thinking = thinkingLabel(publicSettings?.thinking_mode);
	node._aaaliceCharacterSwapModelValue.textContent = model;
	node._aaaliceCharacterSwapModelValue.title = model;
	node._aaaliceCharacterSwapThinkingValue.textContent = thinking;
	node._aaaliceCharacterSwapThinkingValue.title = thinking;
}

function applyPublicSettings(settings) {
	publicSettings = settings;
	for (const node of allGraphNodes(app.graph)) if (isCharacterSwap(node)) renderSettingsSummary(node);
}

async function refreshPublicSettings({ force = false } = {}) {
	if (!force && publicSettings) return publicSettings;
	if (!force && publicSettingsRequest) return publicSettingsRequest;
	publicSettingsRequest = jsonRequest(`${API}/settings`)
		.then((settings) => { applyPublicSettings(settings); return settings; })
		.finally(() => { publicSettingsRequest = null; });
	return publicSettingsRequest;
}

function openCharacterSwapSettings() {
	void openSettingsDialog().catch((error) => {
		console.error("[Aaalice] Character Feature Swap settings failed", error);
		app.extensionManager?.toast?.add?.({ severity: "error", summary: t("aaalice.characterSwap.settings.title", "Character Feature Swap"), detail: error.message });
	});
}

function render(node) {
	if (!node._aaaliceCharacterSwapControl) return;
	node._aaaliceCharacterSwapLabel.textContent = t("aaalice.characterSwap.features.label", "Replace features");
	node._aaaliceCharacterSwapModelLabel.textContent = t("aaalice.characterSwap.features.model", "Model");
	node._aaaliceCharacterSwapThinkingLabel.textContent = t("aaalice.characterSwap.features.thinking", "Thinking");
	renderSettingsSummary(node);
	node._aaaliceCharacterSwapControl.setValue(stateFor(node).features);
}

function setupNode(node, { initializeSize = false } = {}) {
	if (!isCharacterSwap(node) || node._aaaliceCharacterSwapMounted) return;
	node._aaaliceCharacterSwapMounted = true;
	stateFor(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] CharacterFeatureSwapNode requires addDOMWidget");
	const label = el("span", { className: "aaalice-character-swap-label", text: t("aaalice.characterSwap.features.label", "Replace features") });
	const modelLabel = el("span", { className: "aaalice-character-swap-summary-label", text: t("aaalice.characterSwap.features.model", "Model") });
	const modelValue = el("span", { className: "aaalice-character-swap-summary-value", text: "—" });
	const thinkingLabelElement = el("span", { className: "aaalice-character-swap-summary-label", text: t("aaalice.characterSwap.features.thinking", "Thinking") });
	const thinkingValue = el("span", { className: "aaalice-character-swap-summary-value", text: "—" });
	const settingsButton = iconButton({ className: "aaalice-character-swap-settings-trigger", iconName: "settings", label: t("aaalice.characterSwap.settings.open", "Configure LLM…"), variant: "ghost", onClick: openCharacterSwapSettings });
	const summary = el("div", { className: "aaalice-character-swap-summary", children: [
		el("div", { className: "aaalice-character-swap-summary-item", children: [modelLabel, modelValue] }),
		el("div", { className: "aaalice-character-swap-summary-item", children: [thinkingLabelElement, thinkingValue] }),
		settingsButton,
	] });
	const control = createTagListControl({
		value: stateFor(node).features,
		ariaLabel: t("aaalice.characterSwap.features.label", "Replace features"),
		labels: labels(),
		onChange: (next) => commitFeatures(node, next),
	});
	const root = isolate(el("div", { className: "aaalice-character-swap", children: [label, summary, control] }));
	node._aaaliceCharacterSwapRoot = root;
	node._aaaliceCharacterSwapLabel = label;
	node._aaaliceCharacterSwapModelLabel = modelLabel;
	node._aaaliceCharacterSwapModelValue = modelValue;
	node._aaaliceCharacterSwapThinkingLabel = thinkingLabelElement;
	node._aaaliceCharacterSwapThinkingValue = thinkingValue;
	node._aaaliceCharacterSwapControl = control;
	node._aaaliceCharacterSwapAccent = bindNodeAccent(node, root);
	addLifecycleDOMWidget(node, WIDGET, "custom", root, {
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
		this.properties[PROPERTY] = normalizeCharacterFeatureSwapState(this.properties?.[PROPERTY]);
		render(this);
		this._aaaliceCharacterSwapAccent?.sync?.();
		return result;
	};
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		cleanupDomWidgetResizePassthrough(this);
		this._aaaliceCharacterSwapAccent?.dispose?.();
		this._aaaliceCharacterSwapRoot?.remove?.();
		return previousRemoved?.apply(this, arguments);
	};
	render(node);
	void refreshPublicSettings().catch((error) => console.error("[Aaalice] Character Feature Swap settings summary failed", error));
	if (initializeSize) node.setSize?.(node.computeSize());
}

async function jsonRequest(path, options = {}) {
	const response = await api.fetchApi(path, options);
	let data = {};
	try { data = await response.json(); }
	catch { throw new Error(`${path} returned invalid JSON`); }
	if (!response.ok) throw new Error(data.message || `${path} HTTP ${response.status}`);
	return data;
}

function input(type, value = "") {
	const element = document.createElement("input");
	element.type = type;
	element.value = value;
	element.className = "aa-ui-input";
	return element;
}

async function openSettingsDialog() {
	const settings = await jsonRequest(`${API}/settings`);
	applyPublicSettings(settings);
	let clearApiKey = false;
	const apiKey = input("password");
	apiKey.placeholder = settings.has_api_key
		? t("aaalice.characterSwap.settings.keyConfigured", "Configured; leave blank to keep")
		: t("aaalice.characterSwap.settings.keyMissing", "Enter a DeepSeek API key");
	const model = input("text", settings.model);
	const models = document.createElement("datalist");
	models.id = `aaalice-character-swap-models-${Math.random().toString(36).slice(2)}`;
	model.setAttribute("list", models.id);
	const timeout = input("number", String(settings.timeout));
	timeout.min = "1"; timeout.max = "300"; timeout.step = "1";
	const thinkingMode = document.createElement("select");
	thinkingMode.className = "aa-ui-input";
	for (const [value, label] of [
		["disabled", t("aaalice.characterSwap.settings.thinkingDisabled", "Off")],
		["high", t("aaalice.characterSwap.settings.thinkingHigh", "High")],
		["max", t("aaalice.characterSwap.settings.thinkingMax", "Maximum")],
	]) thinkingMode.append(el("option", { text: label, attrs: { value } }));
	thinkingMode.value = settings.thinking_mode;
	const template = document.createElement("textarea");
	template.className = "aa-ui-input aaalice-character-swap-template";
	template.id = `aaalice-character-swap-template-${Math.random().toString(36).slice(2)}`;
	template.value = settings.prompt_template;
	const status = el("div", { className: "aa-ui-field__hint aaalice-character-swap-settings-status", attrs: { role: "status" } });
	const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle("is-error", error); };
	const requestBody = () => ({
		api_key: apiKey.value,
		model: model.value.trim(),
		timeout: Number(timeout.value),
		thinking_mode: thinkingMode.value,
	});
	const clearKey = button({ label: t("aaalice.characterSwap.settings.clearKey", "Clear saved API key"), variant: "ghost", size: "sm", onClick: () => {
		clearApiKey = true; apiKey.value = ""; apiKey.placeholder = t("aaalice.characterSwap.settings.keyWillClear", "Saved key will be cleared");
	} });
	const fetchModels = button({ label: t("aaalice.characterSwap.settings.fetchModels", "Get models"), variant: "ghost", size: "sm", onClick: async () => {
		setStatus(t("aaalice.characterSwap.settings.loadingModels", "Loading models…"));
		try {
			const result = await jsonRequest(`${API}/models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody()) });
			models.replaceChildren(...result.models.map((value) => el("option", { attrs: { value } })));
			setStatus(t("aaalice.characterSwap.settings.modelsLoaded", "Model list loaded."));
		} catch (error) { setStatus(error.message, true); }
	} });
	const test = button({ label: t("aaalice.characterSwap.settings.test", "Test connection"), variant: "ghost", size: "sm", onClick: async () => {
		setStatus(t("aaalice.characterSwap.settings.testing", "Testing connection…"));
		try {
			const result = await jsonRequest(`${API}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody()) });
			setStatus(t("aaalice.characterSwap.settings.testPassed", "Connection succeeded ({count} models).").replace("{count}", String(result.model_count)));
		} catch (error) { setStatus(error.message, true); }
	} });
	const restore = button({ label: t("aaalice.characterSwap.settings.restoreTemplate", "Restore default template"), variant: "ghost", size: "sm", onClick: () => {
		template.value = settings.default_prompt_template;
	} });
	const body = el("div", { className: "aaalice-character-swap-settings", children: [
		el("div", { className: "aaalice-character-swap-settings-row", children: [
			field({ label: t("aaalice.characterSwap.settings.apiKey", "API Key"), control: apiKey, hint: settings.has_api_key ? t("aaalice.characterSwap.settings.keyConfigured", "Configured; leave blank to keep") : null }),
			el("div", { className: "aa-ui-field-actions", children: [clearKey] }),
		] }),
		el("div", { className: "aaalice-character-swap-settings-row", children: [
			field({ label: t("aaalice.characterSwap.settings.model", "Model"), control: model }),
			models,
			el("div", { className: "aa-ui-field-actions", children: [fetchModels, test] }),
		] }),
		el("div", { className: "aaalice-character-swap-settings-grid", children: [
			field({ label: t("aaalice.characterSwap.settings.timeout", "Timeout (seconds)"), control: timeout }),
			field({ label: t("aaalice.characterSwap.settings.thinking", "Thinking"), control: thinkingMode, hint: t("aaalice.characterSwap.settings.thinkingHint", "DeepSeek supports Off, High, and Maximum. Low and Medium are not distinct levels.") }),
		] }),
		el("section", { className: "aaalice-character-swap-template-section", children: [
			el("div", { className: "aaalice-character-swap-template-header", children: [
				el("div", { className: "aa-ui-field__copy", children: [
					el("label", { className: "aa-ui-field__label", text: t("aaalice.characterSwap.settings.template", "Prompt template"), attrs: { for: template.id } }),
					el("span", { className: "aa-ui-field__hint", text: t("aaalice.characterSwap.settings.templateHint", "Must contain {original_prompt}, {character_prompt}, and {target_features}.") }),
				] }),
				restore,
			] }),
			template,
		] }),
	] });
	let dialog;
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "ghost", onClick: () => dialog.close() });
	const save = button({ label: t("aaalice.common.save", "Save"), variant: "primary", onClick: async () => {
		save.disabled = true; setStatus(t("aaalice.characterSwap.settings.saving", "Saving…"));
		try {
			const savedSettings = await jsonRequest(`${API}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...requestBody(), prompt_template: template.value, clear_api_key: clearApiKey }) });
			applyPublicSettings(savedSettings);
			dialog.close();
		} catch (error) { save.disabled = false; setStatus(error.message, true); }
	} });
	const footer = el("div", { className: "aaalice-character-swap-settings-footer", children: [
		status,
		el("div", { className: "aaalice-character-swap-settings-footer-actions", children: [cancel, save] }),
	] });
	dialog = createDialog({ title: t("aaalice.characterSwap.settings.title", "Character Feature Swap"), body, footer, size: "md", className: "aaalice-character-swap-settings-dialog", confirmOnEnter: false });
}

function registerSettingsEntry() {
	if (app._aaaliceCharacterSwapSettingRegistered) return;
	app._aaaliceCharacterSwapSettingRegistered = true;
	app.ui.settings.addSetting({
		id: "Aaalice.CharacterFeatureSwap.Configure",
		name: t("aaalice.characterSwap.settings.entry", "Character Feature Swap LLM"),
		category: ["Aaalice Nodes", "Character Feature Swap", "LLM"],
		type: () => {
			const row = document.createElement("tr");
			const cell = document.createElement("td"); cell.colSpan = 2;
			cell.append(button({ label: t("aaalice.characterSwap.settings.open", "Configure LLM…"), onClick: openCharacterSwapSettings }));
			row.append(cell); return row;
		},
	});
}

function installPromptHook() {
	if (app._aaaliceCharacterSwapPromptHook) return;
	app._aaaliceCharacterSwapPromptHook = true;
	const original = app.graphToPrompt?.bind(app);
	if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for CharacterFeatureSwapNode");
	app.graphToPrompt = async function (...args) {
		const nodes = allGraphNodes(app.graph).filter(isCharacterSwap);
		const settings = nodes.length ? await refreshPublicSettings({ force: true }) : null;
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of nodes) {
			for (const promptNode of promptNodesForGraphNode(output, node)) {
				promptNode.inputs ||= {};
				promptNode.inputs.features_json = JSON.stringify(characterFeatureSwapPayload(stateFor(node)));
				promptNode.inputs.config_revision = settings?.revision || 0;
			}
		}
		return result;
	};
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaaliceCharacterFeatureSwap) return;
	nodeType.__aaaliceCharacterFeatureSwap = true;
	const previous = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previous?.apply(this, arguments);
		setupNode(this, { initializeSize: true });
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.CharacterFeatureSwap",
	async init() {
		await ensureI18nReady();
		registerSettingsEntry();
		void refreshPublicSettings().catch((error) => console.error("[Aaalice] Character Feature Swap settings summary failed", error));
	},
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isCharacterSwap(node)) setupNode(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isCharacterSwap(node)) setupNode(node); },
	setup() {
		installPromptHook();
		for (const node of allGraphNodes(app.graph)) if (isCharacterSwap(node)) setupNode(node);
	},
});
