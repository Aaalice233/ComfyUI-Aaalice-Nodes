/** PromptAssistantBridge settings shortcut, availability warning, and failure toasts. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { button, createAnchoredPopover, el, icon, isolate } from "./lib/ui.js";

const NODE = "PromptAssistantBridge";
const WIDGET = "aaalice_prompt_assistant_bridge";
const UI_KEY = "aaalice_prompt_assistant_bridge";
const INFO_URL = "/aaalice/prompt-assistant-bridge/info";
const DEFAULT_WIDTH = 260;
const MIN_WIDGET_HEIGHT = 36;
const WARNING_WIDGET_HEIGHT = 68;

let infoPromise = null;

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({
		severity,
		summary: t(`aaalice.common.${severity === "error" ? "error" : "notice"}`, severity === "error" ? "Error" : "Notice"),
		detail,
		life: 4500,
	});
}

function isBridge(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

/** Availability is judged once per session by the backend route, the same source execute() uses. */
function assistantInfo() {
	infoPromise ||= fetch(INFO_URL)
		.then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
		.then((data) => ({ installed: Boolean(data?.installed), jsBase: data?.js_base || null }))
		.catch((error) => {
			console.warn("[Aaalice] PromptAssistantBridge availability check failed", error);
			return { installed: false, jsBase: null };
		});
	return infoPromise;
}

function closeMenu(node) {
	node._aaalicePaBridgePopover?.close?.();
	node._aaalicePaBridgePopover = null;
}

async function openAssistantModal(jsBase, kind) {
	try {
		if (kind === "rules") {
			const module = await import(`${jsBase}/modules/rulesConfigManager.js`);
			module.rulesConfigManager.showRulesConfigModal();
		} else {
			const module = await import(`${jsBase}/modules/apiConfigManager.js`);
			module.apiConfigManager.showAPIConfigModal();
		}
	} catch (error) {
		console.error("[Aaalice] PromptAssistantBridge failed to open Prompt Assistant settings", error);
		toast("error", message("aaalice.promptAssistantBridge.toast.openFailed", "Failed to open Prompt Assistant settings: {reason}", { reason: error?.message || String(error) }));
	}
}

async function openSettingsMenu(node, anchor) {
	const info = await assistantInfo();
	if (!isBridge(node) || !node._aaalicePaBridgeRoot) return;
	if (!info.installed || !info.jsBase) {
		toast("error", t("aaalice.promptAssistantBridge.toast.missing", "Prompt Assistant is not installed; install it to enable expansion and open its settings."));
		return;
	}
	closeMenu(node);
	const popup = createAnchoredPopover({
		anchor,
		ariaLabel: t("aaalice.promptAssistantBridge.settings", "Prompt Assistant settings"),
		className: "aaalice-pa-bridge-menu",
		width: 220,
	});
	const sharedClose = popup.close;
	popup.close = () => {
		sharedClose();
		if (node._aaalicePaBridgePopover?.root === popup.root) node._aaalicePaBridgePopover = null;
	};
	popup.root.append(
		button({
			label: t("aaalice.promptAssistantBridge.menu.rules", "Rule Manager"),
			iconName: "edit",
			variant: "ghost",
			size: "sm",
			onClick: () => { popup.close(); void openAssistantModal(info.jsBase, "rules"); },
		}),
		button({
			label: t("aaalice.promptAssistantBridge.menu.api", "API Manager"),
			iconName: "link",
			variant: "ghost",
			size: "sm",
			onClick: () => { popup.close(); void openAssistantModal(info.jsBase, "api"); },
		}),
	);
	node._aaalicePaBridgePopover = popup;
}

function render(node) {
	const root = node._aaalicePaBridgeRoot;
	if (!root) return;
	const warning = node._aaalicePaBridgeWarning;
	const showWarning = Boolean(node._aaalicePaBridgeUnavailable);
	warning.hidden = !showWarning;
	warning.replaceChildren(
		icon("statusWarning"),
		el("span", null, t("aaalice.promptAssistantBridge.warning", "Prompt Assistant is not installed — prompts pass through unchanged.")),
	);
	const settings = node._aaalicePaBridgeSettings;
	const label = t("aaalice.promptAssistantBridge.settings", "Prompt Assistant settings");
	settings.title = label;
	settings.setAttribute("aria-label", label);
	settings.querySelector(".aa-ui-button__label").textContent = label;
	node.graph?.setDirtyCanvas?.(true, true);
}

async function refresh(node) {
	const info = await assistantInfo();
	if (!node._aaalicePaBridgeRoot) return;
	const unavailable = !info.installed;
	if (node._aaalicePaBridgeUnavailable === unavailable && node._aaalicePaBridgeRendered) return;
	node._aaalicePaBridgeUnavailable = unavailable;
	node._aaalicePaBridgeRendered = true;
	render(node);
	// The warning raises the DOM widget's minimum height; grow once, never shrink.
	if (unavailable) {
		const min = node.computeSize();
		if (node.size[1] < min[1]) node.setSize([Math.max(node.size[0], min[0]), min[1]]);
	}
}

function setupBridge(node, { initializeSize = false } = {}) {
	if (!isBridge(node)) return;
	if (!node._aaalicePaBridgeMounted) {
		node._aaalicePaBridgeMounted = true;
		if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] PromptAssistantBridge requires addDOMWidget");
		const root = isolate(el("div", "aaalice-pa-bridge"));
		const warning = el("div", { className: "aaalice-pa-bridge-warning", attrs: { role: "status" } });
		warning.hidden = true;
		const settings = button({
			label: t("aaalice.promptAssistantBridge.settings", "Prompt Assistant settings"),
			iconName: "settings",
			variant: "ghost",
			size: "sm",
			className: "aaalice-pa-bridge-settings",
		});
		settings.addEventListener("click", () => void openSettingsMenu(node, settings));
		root.append(warning, settings);
		node._aaalicePaBridgeRoot = root;
		node._aaalicePaBridgeWarning = warning;
		node._aaalicePaBridgeSettings = settings;
		node.addDOMWidget(WIDGET, "custom", root, {
			serialize: false,
			hideOnZoom: false,
			margin: 0,
			getMinHeight: () => (node._aaalicePaBridgeUnavailable ? WARNING_WIDGET_HEIGHT : MIN_WIDGET_HEIGHT),
			getValue: () => "",
			setValue: () => {},
		});
		installDomWidgetResizePassthrough(node, root);
		const previousComputeSize = node.computeSize;
		node.computeSize = function () {
			const computed = previousComputeSize?.apply(this, arguments) || [DEFAULT_WIDTH, MIN_WIDGET_HEIGHT];
			return [Math.max(DEFAULT_WIDTH, Number(computed[0]) || 0), Number(computed[1]) || MIN_WIDGET_HEIGHT];
		};
		const previousRemoved = node.onRemoved;
		node.onRemoved = function () {
			closeMenu(this);
			cleanupDomWidgetResizePassthrough(this);
			this._aaalicePaBridgeRoot?.remove?.();
			this._aaalicePaBridgeRoot = null;
			return previousRemoved?.apply(this, arguments);
		};
		if (initializeSize) node.setSize?.(node.computeSize());
	}
	render(node);
	void refresh(node);
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaalicePromptAssistantBridge) return;
	nodeType.__aaalicePromptAssistantBridge = true;
	const previousCreated = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previousCreated?.apply(this, arguments);
		setupBridge(this, { initializeSize: true });
		return result;
	};
	const previousExecuted = nodeType.prototype.onExecuted;
	nodeType.prototype.onExecuted = function (output) {
		const result = previousExecuted?.apply(this, arguments);
		const items = output?.[UI_KEY];
		if (Array.isArray(items)) {
			for (const item of items) {
				if (item?.status !== "expand_failed") continue;
				toast("warn", message(
					"aaalice.promptAssistantBridge.toast.expandFailed",
					"Prompt expansion failed; the original prompt was kept: {reason}",
					{ reason: item.message || "unknown error" },
				));
			}
		}
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.PromptAssistantBridge",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isBridge(node)) setupBridge(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isBridge(node)) setupBridge(node); },
	setup() {
		for (const node of app.graph?._nodes || []) if (isBridge(node)) setupBridge(node);
	},
});
