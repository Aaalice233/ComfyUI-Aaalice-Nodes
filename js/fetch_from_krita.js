/** FetchFromKrita lifecycle, live status, and shared Krita Bridge settings. */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureI18nReady, t } from "./i18n.js";
import {
	cleanupDomWidgetResizePassthrough,
	installDomWidgetResizePassthrough,
} from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { allGraphNodes, findNodeByExecutionId } from "./lib/graph_scope.js";
import { bindNodeAccent } from "./lib/node_accent.js";
import { button, createDialog, el, icon, iconButton, isolate } from "./lib/ui.js";

const NODE = "FetchFromKrita";
const WIDGET = "aaalice_fetch_from_krita";
const API = "/aaalice/krita";
const DEFAULT_WIDTH = 328;
const MIN_WIDGET_HEIGHT = 142;

let bridgeStatus = null;
let statusRequest = null;

function isKritaNode(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function format(template, values = {}) {
	return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

async function jsonRequest(path, options = {}) {
	const response = await api.fetchApi(path, options);
	let data;
	try { data = await response.json(); }
	catch { throw new Error(`${path} returned invalid JSON`); }
	if (!response.ok) throw new Error(data?.message || `${path} HTTP ${response.status}`);
	return data;
}

function nodeById(value) {
	return findNodeByExecutionId(app.graph, value);
}

function stateFor(node) {
	if (!node._aaKritaViewState) node._aaKritaViewState = { phase: "idle", error: "", snapshot: null };
	return node._aaKritaViewState;
}

function statusView(node) {
	const local = stateFor(node);
	if (local.phase === "fetching") return { tone: "loading", iconName: "loading", text: t("aaalice.krita.status.fetching", "Reading Krita document…") };
	if (local.phase === "error") return { tone: "error", iconName: "statusError", text: t("aaalice.krita.status.fetchFailed", "Fetch failed") };
	if (!bridgeStatus) return { tone: "loading", iconName: "loading", text: t("aaalice.krita.status.checking", "Checking Krita…") };
	if (!bridgeStatus.installed) return { tone: "error", iconName: "statusError", text: t("aaalice.krita.status.notInstalled", "Krita Bridge is not installed") };
	if (!bridgeStatus.enabled) return { tone: "error", iconName: "statusError", text: t("aaalice.krita.status.notEnabled", "Krita Bridge is not enabled") };
	if (bridgeStatus.bridge_protocol != null && !bridgeStatus.protocol_compatible) return { tone: "error", iconName: "statusError", text: t("aaalice.krita.status.incompatible", "Krita Bridge protocol is incompatible") };
	if (!bridgeStatus.online) return { tone: "error", iconName: "statusError", text: t("aaalice.krita.status.offline", "Krita Bridge is offline") };
	if (!bridgeStatus.document) return { tone: "warning", iconName: "statusWarning", text: t("aaalice.krita.status.noDocument", "No active Krita document") };
	if (local.phase === "success") return { tone: "success", iconName: "statusCheck", text: t("aaalice.krita.status.fetchSucceeded", "Snapshot ready") };
	return { tone: "success", iconName: "statusCheck", text: t("aaalice.krita.status.connected", "Connected") };
}

function render(node) {
	if (!node._aaKritaRoot) return;
	const local = stateFor(node);
	const view = statusView(node);
	const document = local.snapshot || bridgeStatus?.document || null;
	node._aaKritaRoot.dataset.state = view.tone;
	node._aaKritaRoot.dataset.availability = document ? "document" : bridgeStatus?.online ? "empty" : "offline";
	node._aaKritaStatusIcon.replaceChildren(icon(view.iconName));
	node._aaKritaStatusText.textContent = view.text;
	node._aaKritaRefresh.classList.toggle("is-refreshing", view.tone === "loading");

	if (document) {
		node._aaKritaDocumentName.textContent = document.document || document.name || t("aaalice.krita.document.untitled", "Untitled");
		node._aaKritaDocumentName.title = node._aaKritaDocumentName.textContent;
		node._aaKritaDocumentMeta.textContent = format(t("aaalice.krita.document.meta", "{width} × {height} · {color}"), {
			width: document.width,
			height: document.height,
			color: document.color_model || "—",
		});
		const hasSelectionState = Object.hasOwn(document, "selection_present");
		const selectionPresent = Boolean(document.selection_present);
		const bounds = document.selection_bounds;
		node._aaKritaSelection.textContent = !hasSelectionState
			? t("aaalice.krita.document.selectionAtExecution", "Selection read on execution")
			: selectionPresent && Array.isArray(bounds)
				? format(t("aaalice.krita.document.selectionSize", "Selection {width} × {height}"), { width: bounds[2], height: bounds[3] })
				: t("aaalice.krita.document.noSelection", "No selection · empty mask output");
		node._aaKritaSelection.classList.toggle("is-present", selectionPresent);
		node._aaKritaSelection.hidden = false;
		node._aaKritaDocument.hidden = false;
	} else {
		node._aaKritaDocumentName.textContent = bridgeStatus?.online
			? t("aaalice.krita.document.none", "No active document")
			: t("aaalice.krita.document.unavailable", "Krita is unavailable");
		node._aaKritaDocumentName.title = node._aaKritaDocumentName.textContent;
		node._aaKritaDocumentMeta.textContent = bridgeStatus?.online
			? t("aaalice.krita.document.openHint", "Open or create a document in Krita")
			: t("aaalice.krita.document.setupHint", "Check Krita and Bridge setup");
		node._aaKritaSelection.textContent = "";
		node._aaKritaSelection.classList.remove("is-present");
		node._aaKritaSelection.hidden = true;
		node._aaKritaDocument.hidden = false;
	}

	if (local.phase === "error") node._aaKritaResult.textContent = local.error;
	else if (local.phase === "success" && local.snapshot) node._aaKritaResult.textContent = format(
		t("aaalice.krita.result.success", "Fetched {width} × {height}{selection}"),
		{
			width: local.snapshot.width,
			height: local.snapshot.height,
			selection: local.snapshot.selection_present ? t("aaalice.krita.result.withSelection", " · with selection") : "",
		},
	);
	else node._aaKritaResult.textContent = t("aaalice.krita.result.queueHint", "Queues read the current document at execution time");
	node._aaKritaResult.title = node._aaKritaResult.textContent;
	node._aaKritaSetup.hidden = Boolean(bridgeStatus?.online);
	node.setDirtyCanvas?.(true, true);
}

function renderAll() {
	for (const node of allGraphNodes(app.graph)) if (isKritaNode(node)) render(node);
}

async function refreshStatus({ force = false } = {}) {
	if (!force && statusRequest) return statusRequest;
	statusRequest = jsonRequest(`${API}/status`)
		.then((status) => { bridgeStatus = status; renderAll(); return status; })
		.finally(() => { statusRequest = null; });
	return statusRequest;
}

function toast(severity, detail) {
	app.extensionManager?.toast?.add?.({ severity, summary: t("aaalice.krita.settings.title", "Krita"), detail, life: 5000 });
}

function openKritaSettings() {
	void openSettingsDialog().catch((error) => {
		console.error("[Aaalice] Krita settings failed", error);
		toast("error", error.message);
	});
}

async function openSettingsDialog() {
	const status = await refreshStatus({ force: true });
	let current = status;
	const connectionIcon = el("span", { className: "aa-krita-settings__status-icon" });
	const connectionText = el("strong");
	const connectionMeta = el("span");
	const installPath = el("code", { className: "aa-krita-settings__path" });
	const feedback = el("span", { className: "aa-ui-field__hint aa-krita-settings__feedback", attrs: { role: "status" } });
	const test = button({ label: t("aaalice.krita.settings.test", "Test connection"), iconName: "refresh", variant: "ghost", size: "sm" });
	const maintenance = button({ label: "", iconName: "download", variant: "primary", size: "sm" });

	function renderSettings() {
		const incompatible = current.bridge_protocol != null && !current.protocol_compatible;
		const enableOnly = current.installed && !current.enabled && current.installed_version === current.expected_version;
		connectionIcon.replaceChildren(icon(incompatible || !current.installed ? "statusError" : current.online ? "statusCheck" : "statusWarning"));
		if (incompatible) connectionText.textContent = t("aaalice.krita.settings.incompatible", "Krita Bridge protocol is incompatible");
		else if (current.online) connectionText.textContent = t("aaalice.krita.settings.online", "Krita Bridge is connected");
		else if (current.installed && !current.enabled) connectionText.textContent = t("aaalice.krita.settings.installedDisabled", "Bridge installed · not enabled");
		else if (current.installed) connectionText.textContent = t("aaalice.krita.settings.installedOffline", "Bridge installed · Krita offline");
		else connectionText.textContent = t("aaalice.krita.settings.missing", "Krita Bridge is not installed");
		connectionMeta.textContent = format(t("aaalice.krita.settings.version", "Installed {installed} · Bridge {bridge} · protocol {observed}/{protocol}"), {
			installed: current.installed_version || "—",
			bridge: current.bridge_version || "—",
			observed: current.bridge_protocol ?? "—",
			protocol: current.protocol,
		});
		installPath.textContent = current.install_path;
		maintenance.querySelector(".aa-ui-button__label").textContent = enableOnly
			? t("aaalice.krita.settings.enable", "Enable Bridge")
			: current.installed
				? t("aaalice.krita.settings.repair", "Repair and enable Bridge")
				: t("aaalice.krita.settings.install", "Install and enable Bridge");
		maintenance.disabled = Boolean(current.krita_running || current.responding);
		test.disabled = !current.installed || !current.enabled;
		if (current.krita_running && !current.online && !feedback.textContent) {
			feedback.textContent = t("aaalice.krita.settings.closeKrita", "Close Krita before changing the Bridge.");
		}
	}

	test.onclick = async () => {
		test.disabled = true; feedback.classList.remove("is-error"); feedback.textContent = t("aaalice.krita.settings.testing", "Testing connection…");
		try {
			current = await jsonRequest(`${API}/test`, { method: "POST" });
			bridgeStatus = current; feedback.textContent = t("aaalice.krita.settings.testPassed", "Connection succeeded."); renderSettings(); renderAll();
		} catch (error) { feedback.textContent = error.message; feedback.classList.add("is-error"); test.disabled = false; }
	};
	maintenance.onclick = async () => {
		maintenance.disabled = true; feedback.classList.remove("is-error");
		const enableOnly = current.installed && !current.enabled && current.installed_version === current.expected_version;
		feedback.textContent = enableOnly
			? t("aaalice.krita.settings.enabling", "Enabling Bridge…")
			: current.installed
				? t("aaalice.krita.settings.repairing", "Repairing and enabling Bridge…")
				: t("aaalice.krita.settings.installing", "Installing and enabling Bridge…");
		try {
			current = await jsonRequest(`${API}/${current.installed && !enableOnly ? "repair" : "install"}`, { method: "POST" });
			bridgeStatus = current;
			feedback.textContent = t("aaalice.krita.settings.installed", "Bridge installed and enabled. Start Krita to connect.");
			renderSettings(); renderAll();
		} catch (error) { feedback.textContent = error.message; feedback.classList.add("is-error"); maintenance.disabled = false; }
	};

	const body = el("div", { className: "aa-krita-settings", children: [
		el("section", { className: "aa-krita-settings__connection", children: [
			connectionIcon,
			el("div", { className: "aa-krita-settings__connection-copy", children: [connectionText, connectionMeta] }),
			test,
		] }),
		el("section", { className: "aa-krita-settings__install", children: [
			el("label", { text: t("aaalice.krita.settings.installPath", "Bridge installation") }),
			installPath,
			maintenance,
		] }),
	] });
	let dialog;
	const close = button({ label: t("aaalice.krita.settings.done", "Done"), variant: "ghost", onClick: () => dialog.close() });
	dialog = createDialog({
		title: t("aaalice.krita.settings.title", "Krita"),
		body,
		footer: el("div", { className: "aa-krita-settings__footer", children: [feedback, close] }),
		size: "md",
		className: "aa-krita-settings-dialog",
		confirmOnEnter: false,
	});
	renderSettings();
}

function setupNode(node, { initializeSize = false } = {}) {
	if (!isKritaNode(node) || node._aaKritaMounted || node._aaKritaMounting) return;
	node._aaKritaMounting = true;
	try {
	stateFor(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] FetchFromKrita requires addDOMWidget");
	const statusIcon = el("span", { className: "aa-krita-status__icon", attrs: { "aria-hidden": "true" } });
	const statusText = el("span", { className: "aa-krita-status__text" });
	const refresh = iconButton({ className: "aa-krita-refresh", iconName: "refresh", label: t("aaalice.krita.actions.refresh", "Refresh Krita status"), variant: "ghost", onClick: () => {
		stateFor(node).phase = "idle"; render(node);
		void refreshStatus({ force: true }).catch((error) => { stateFor(node).phase = "error"; stateFor(node).error = error.message; render(node); });
	} });
	const settings = iconButton({ iconName: "settings", label: t("aaalice.krita.actions.settings", "Open Krita settings"), variant: "ghost", onClick: openKritaSettings });
	const name = el("strong", { className: "aa-krita-document__name" });
	const meta = el("span", { className: "aa-krita-document__meta" });
	const selection = el("span", { className: "aa-krita-document__selection" });
	const documentCard = el("div", { className: "aa-krita-document", children: [
		el("span", { className: "aa-krita-document__mark", attrs: { "aria-hidden": "true" }, children: [icon("note")] }),
		el("div", { className: "aa-krita-document__copy", children: [
			name,
			el("div", { className: "aa-krita-document__facts", children: [meta, selection] }),
		] }),
	] });
	const setup = button({ className: "aa-krita-setup", label: t("aaalice.krita.actions.openSettings", "Open Krita settings"), iconName: "settings", variant: "primary", size: "sm", onClick: openKritaSettings });
	const result = el("span", { className: "aa-krita-result", attrs: { role: "status", "aria-live": "polite" } });
	const root = isolate(el("div", { className: "aa-krita", children: [
		el("div", { className: "aa-krita-toolbar", children: [
			el("div", { className: "aa-krita-status", children: [statusIcon, statusText] }),
			el("div", { className: "aa-krita-actions", children: [refresh, settings] }),
		] }),
		documentCard,
		el("div", { className: "aa-krita-footer", children: [
			el("span", { className: "aa-krita-footer__icon", attrs: { "aria-hidden": "true" }, children: [icon("statusIdle")] }),
			result,
			setup,
		] }),
	] }));
	node._aaKritaRoot = root;
	node._aaKritaStatusIcon = statusIcon;
	node._aaKritaStatusText = statusText;
	node._aaKritaRefresh = refresh;
	node._aaKritaDocument = documentCard;
	node._aaKritaDocumentName = name;
	node._aaKritaDocumentMeta = meta;
	node._aaKritaSelection = selection;
	node._aaKritaResult = result;
	node._aaKritaSetup = setup;
	node._aaKritaAccent = bindNodeAccent(node, root);
	addLifecycleDOMWidget(node, WIDGET, "custom", root, { serialize: false, hideOnZoom: true, margin: 0, getMinHeight: () => MIN_WIDGET_HEIGHT, getValue: () => "", setValue: () => {} });
	installDomWidgetResizePassthrough(node, root);
	const previousComputeSize = node.computeSize;
	node.computeSize = function () {
		const computed = previousComputeSize?.apply(this, arguments) || [DEFAULT_WIDTH, MIN_WIDGET_HEIGHT];
		return [Math.max(DEFAULT_WIDTH, Number(computed[0]) || 0), Number(computed[1]) || MIN_WIDGET_HEIGHT];
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () {
		const response = previousConfigure?.apply(this, arguments);
		this._aaKritaAccent?.sync?.(); render(this); return response;
	};
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		cleanupDomWidgetResizePassthrough(this);
		this._aaKritaAccent?.dispose?.(); this._aaKritaRoot?.remove?.();
		return previousRemoved?.apply(this, arguments);
	};
	render(node);
	if (initializeSize) node.setSize?.(node.computeSize());
	node._aaKritaMounted = true;
	} catch (error) {
		node._aaKritaMounted = false;
		cleanupDomWidgetResizePassthrough(node);
		node._aaKritaAccent?.dispose?.();
		node._aaKritaRoot?.remove?.();
		console.error("[Aaalice] FetchFromKrita mount failed", error);
		throw error;
	} finally {
		node._aaKritaMounting = false;
	}
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaKritaFetch) return;
	nodeType.__aaKritaFetch = true;
	const previousCreated = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const response = previousCreated?.apply(this, arguments); setupNode(this, { initializeSize: true }); return response;
	};
	const previousExecuted = nodeType.prototype.onExecuted;
	nodeType.prototype.onExecuted = function (output) {
		previousExecuted?.apply(this, arguments);
		const snapshot = output?.aaalice_krita_snapshot?.[0];
		if (snapshot) { const local = stateFor(this); local.phase = "success"; local.error = ""; local.snapshot = snapshot; render(this); void refreshStatus({ force: true }); }
	};
}

function registerSettingsEntry() {
	if (app._aaKritaSettingRegistered) return;
	app._aaKritaSettingRegistered = true;
	app.ui.settings.addSetting({
		id: "Aaalice.Krita.Configure",
		name: t("aaalice.krita.settings.entry", "Krita Bridge"),
		category: ["Aaalice Nodes", "Krita"],
		type: () => {
			const row = document.createElement("tr");
			const cell = document.createElement("td"); cell.colSpan = 2;
			cell.append(button({ label: t("aaalice.krita.actions.openSettings", "Open Krita settings"), iconName: "settings", onClick: openKritaSettings }));
			row.append(cell); return row;
		},
	});
}

function registerExecutionEvents() {
	if (app._aaKritaExecutionEvents) return;
	app._aaKritaExecutionEvents = true;
	api.addEventListener("executing", (event) => {
		const id = event.detail?.node ?? event.detail;
		const node = nodeById(id);
		if (!isKritaNode(node)) return;
		const local = stateFor(node); local.phase = "fetching"; local.error = ""; render(node);
	});
	api.addEventListener("execution_error", (event) => {
		const detail = event.detail || {};
		const node = nodeById(detail.node_id);
		if (!isKritaNode(node)) return;
		const local = stateFor(node); local.phase = "error"; local.error = detail.exception_message || t("aaalice.krita.status.fetchFailed", "Fetch failed"); render(node);
	});
}

app.registerExtension({
	name: "ComfyUI.Aaalice.FetchFromKrita",
	async init() {
		await ensureI18nReady();
		registerSettingsEntry(); registerExecutionEvents();
		void refreshStatus({ force: true }).catch((error) => console.error("[Aaalice] Krita status failed", error));
	},
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isKritaNode(node)) setupNode(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isKritaNode(node)) { setupNode(node); render(node); } },
	setup() { for (const node of allGraphNodes(app.graph)) if (isKritaNode(node)) setupNode(node); },
});
