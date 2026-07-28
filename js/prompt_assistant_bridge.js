/** PromptAssistantBridge availability warning, failure toasts and result display. */
import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { el, icon } from "./lib/ui.js";

const NODE = "PromptAssistantBridge";
const WIDGET = "aaalice_prompt_assistant_bridge";
const UI_KEY = "aaalice_prompt_assistant_bridge";
const CHUNK_EVENT = "aaalice.prompt_assistant_bridge.chunk";
const INFO_URL = "/aaalice/prompt-assistant-bridge/info";
const DEFAULT_WIDTH = 260;
const WARNING_WIDGET_HEIGHT = 68;
const OUTPUT_WIDGET_HEIGHT = 96;

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
		.then((data) => ({ installed: Boolean(data?.installed) }))
		.catch((error) => {
			console.warn("[Aaalice] PromptAssistantBridge availability check failed", error);
			return { installed: false };
		});
	return infoPromise;
}

function render(node) {
	const root = node._aaalicePaBridgeRoot;
	if (!root) return;
	const unavailable = Boolean(node._aaalicePaBridgeUnavailable);
	node._aaalicePaBridgeWarning.hidden = !unavailable;
	if (unavailable) {
		node._aaalicePaBridgeWarning.replaceChildren(
			icon("statusWarning"),
			el("span", null, t("aaalice.promptAssistantBridge.warning", "Prompt Assistant is not installed — prompts pass through unchanged.")),
		);
	}
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
	// The output box and warning raise the DOM widget's minimum height; grow once, never shrink.
	const min = node.computeSize();
	if (node.size[1] < min[1]) node.setSize([Math.max(node.size[0], min[0]), min[1]]);
}

function setupBridge(node, { initializeSize = false } = {}) {
	if (!isBridge(node)) return;
	if (!node._aaalicePaBridgeMounted) {
		node._aaalicePaBridgeMounted = true;
		if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] PromptAssistantBridge requires addDOMWidget");
		const root = el("div", "aaalice-pa-bridge");
		const warning = el("div", { className: "aaalice-pa-bridge-warning", attrs: { role: "status" } });
		warning.hidden = true;
		const output = el("textarea", {
			className: "aaalice-pa-bridge-output",
			attrs: {
				readonly: "",
				rows: "4",
				"data-capture-wheel": "true",
				"aria-label": t("aaalice.promptAssistantBridge.output.label", "Expanded prompt"),
				placeholder: t("aaalice.promptAssistantBridge.output.placeholder", "The expanded prompt appears here after the node runs."),
			},
		});
		// Nodes 2.0 宿主在捕获阶段先处理 wheel，滚动区必须在 pointerenter 提前拿到焦点；
		// 已在节点内的焦点和外部文本编辑控件的焦点都不得抢夺。
		output.addEventListener("pointerenter", () => {
			const active = document.activeElement;
			if (active && root.contains(active)) return;
			if (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) return;
			output.focus({ preventScroll: true });
		});
		root.append(warning, output);
		node._aaalicePaBridgeRoot = root;
		node._aaalicePaBridgeWarning = warning;
		node._aaalicePaBridgeOutput = output;
		node.addDOMWidget(WIDGET, "custom", root, {
			serialize: false,
			hideOnZoom: false,
			margin: 0,
			getMinHeight: () => OUTPUT_WIDGET_HEIGHT + (node._aaalicePaBridgeUnavailable ? WARNING_WIDGET_HEIGHT : 0),
			getValue: () => "",
			setValue: () => {},
		});
		installDomWidgetResizePassthrough(node, root);
		const previousComputeSize = node.computeSize;
		node.computeSize = function () {
			const computed = previousComputeSize?.apply(this, arguments) || [DEFAULT_WIDTH, 0];
			return [Math.max(DEFAULT_WIDTH, Number(computed[0]) || 0), Number(computed[1]) || 0];
		};
		const previousRemoved = node.onRemoved;
		node.onRemoved = function () {
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
				if (item?.status === "expanded" && typeof item.text === "string") {
					// ui 文本是权威结果；流式增量只是过程展示，最终以它覆盖。
					const box = this._aaalicePaBridgeOutput;
					if (box) {
						box.value = item.text;
						box.scrollTop = box.scrollHeight;
					}
				}
				if (item?.status !== "expand_failed") continue;
				if (this._aaalicePaBridgeOutput) this._aaalicePaBridgeOutput.value = "";
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

function bridgeNodeById(id) {
	if (id == null) return null;
	const node = app.graph?.getNodeById?.(Number(id));
	return node && isBridge(node) ? node : null;
}

app.registerExtension({
	name: "ComfyUI.Aaalice.PromptAssistantBridge",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isBridge(node)) setupBridge(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isBridge(node)) setupBridge(node); },
	setup() {
		for (const node of app.graph?._nodes || []) if (isBridge(node)) setupBridge(node);
		api.addEventListener(CHUNK_EVENT, (event) => {
			const box = bridgeNodeById(event.detail?.node)?._aaalicePaBridgeOutput;
			if (!box || typeof event.detail?.delta !== "string") return;
			box.value += event.detail.delta;
			box.scrollTop = box.scrollHeight;
		});
		// 每次执行开始时清空：透传与失败都不会再写入结果框，旧结果不残留。
		api.addEventListener("executing", (event) => {
			const box = bridgeNodeById(event.detail)?._aaalicePaBridgeOutput;
			if (box) box.value = "";
		});
	},
});
