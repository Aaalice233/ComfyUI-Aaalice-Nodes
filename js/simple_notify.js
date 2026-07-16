/** SimpleNotify lifecycle bridge: execution payloads and explicit alert testing. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { dispatchSimpleNotify, normalizeNotifyPayload } from "./lib/simple_notify_runtime.js";

const NODE = "SimpleNotify";
const AUDIO_URL = new URL("./assets/notify.mp3", import.meta.url).href;
const reportedErrors = new Set();
const nodeTypes = new WeakSet();

const ERROR_SEVERITY = {
	notificationUnsupported: "warn",
	permissionRequired: "warn",
	permissionDenied: "warn",
	permissionRequestFailed: "error",
	notificationFailed: "error",
	soundFailed: "error",
};

const ERROR_FALLBACK = {
	notificationUnsupported: "This browser does not support desktop notifications.",
	permissionRequired: "Use “Enable and Test Alerts” from the node menu to enable desktop notifications.",
	permissionDenied: "Desktop notifications are blocked. Enable them in your browser or system settings.",
	permissionRequestFailed: "The browser notification permission request failed.",
	notificationFailed: "The desktop notification could not be shown.",
	soundFailed: "The alert sound could not be played. Use “Enable and Test Alerts” from the node menu to test it.",
};

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({
		severity,
		summary: t(`aaalice.common.${severity === "error" ? "error" : "notice"}`, severity === "error" ? "Error" : "Notice"),
		detail,
		life: 4500,
	});
}

function reportError(code, error) {
	const logger = ERROR_SEVERITY[code] === "error" ? console.error : console.warn;
	logger(`[Aaalice] SimpleNotify ${code}`, error);
	if (reportedErrors.has(code)) return;
	reportedErrors.add(code);
	toast(ERROR_SEVERITY[code] || "error", t(`aaalice.simpleNotify.error.${code}`, ERROR_FALLBACK[code] || String(error)));
}

function isSimpleNotify(node) {
	return nodeTypes.has(node?.constructor)
		|| [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function fallbackMessage() {
	return t("aaalice.simpleNotify.defaultMessage", "Execution reached Simple Notify.");
}

function widgetValue(node, name, fallback) {
	const widget = node?.widgets?.find((item) => item?.name === name);
	return widget ? widget.value : fallback;
}

function nodePayload(node) {
	return normalizeNotifyPayload({
		message: widgetValue(node, "message", ""),
		desktop_notification: widgetValue(node, "desktop_notification", true),
		sound: widgetValue(node, "sound", true),
		volume: widgetValue(node, "volume", 0.5),
	}, fallbackMessage());
}

function dispatch(payload, requestPermission) {
	return dispatchSimpleNotify(normalizeNotifyPayload(payload, fallbackMessage()), {
		audioUrl: AUDIO_URL,
		requestPermission,
		onError: reportError,
	});
}

async function handleExecution(payload) {
	await ensureI18nReady();
	await dispatch(payload, false);
}

async function testAlerts(node) {
	const payload = nodePayload(node);
	if (!payload.desktop_notification && !payload.sound) {
		toast("info", t("aaalice.simpleNotify.toast.noChannels", "No alert channel is enabled."));
		return;
	}
	// Start permission and audio work in the menu click task so browser user activation is preserved.
	await dispatch(payload, true);
}

app.registerExtension({
	name: "ComfyUI.Aaalice.SimpleNotify",

	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== NODE) return;
		nodeTypes.add(nodeType);
		const originalOnExecuted = nodeType.prototype.onExecuted;
		nodeType.prototype.onExecuted = function (output) {
			originalOnExecuted?.apply(this, arguments);
			const payload = output?.aaalice_simple_notify?.[0];
			if (payload) void handleExecution(payload);
		};
	},

	getNodeMenuItems(node) {
		if (!isSimpleNotify(node)) return [];
		return [{
			content: t("aaalice.simpleNotify.menu.test", "🔔 Enable and Test Alerts"),
			callback: () => void testAlerts(node),
		}];
	},
});
