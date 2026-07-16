/** EnumSwitch branch authoring, ParameterPanel synchronization and prompt injection. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { button, createDialog, el, iconButton, isolate } from "./lib/ui.js";
import {
	MAX_ENUM_BRANCHES,
	bindingFromDirectSource,
	createRoute,
	enumPromptPayload,
	enumRouteDiff,
	normalizeEnumSwitchState,
	reconcileEnumRoutes,
} from "./lib/enum_switch_model.js";
import {
	EVENT_PARAMETER_CHANGED,
	displayName,
	ensureParameters,
	isParameterPanel,
} from "./lib/param_model.js";
import { getGraphLink, getGraphNode } from "./parameter_panel_kj.js";
import {
	reshapeEnumBranchInputs,
	reshapeEnumBranchInputsPreservingLinks,
	syncEnumConcreteInputs,
} from "./lib/enum_switch_layout.js";

const NODE = "EnumSwitch";

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

async function confirmAction(text) {
	if (app.extensionManager?.dialog?.confirm) return Boolean(await app.extensionManager.dialog.confirm({
		title: t("aaalice.common.confirm", "Confirm"), message: text,
	}));
	return globalThis.confirm(text);
}

function isEnumSwitch(node) {
	return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function state(node) {
	node.properties ||= {};
	node.properties.enumSwitch = normalizeEnumSwitchState(node.properties.enumSwitch);
	return node.properties.enumSwitch;
}

function inputSlot(node, name) {
	if (typeof node?.findInputSlot === "function") return node.findInputSlot(name);
	return node?.inputs?.findIndex((input) => input?.name === name || input?._aaaliceProtocolName === name) ?? -1;
}

function sourceParameter(node) {
	const binding = state(node).binding;
	if (!binding) return null;
	const panel = getGraphNode(node.graph, binding.panelNodeId);
	if (!isParameterPanel(panel)) return null;
	const parameter = ensureParameters(panel).find((item) => String(item.id) === String(binding.parameterId));
	if (!parameter || !["enum", "dropdown"].includes(parameter.param_type)) return null;
	return { panel, parameter, options: (parameter.config?.options || []).map(String) };
}

function sourceErrors(source) {
	if (!source) return [];
	const options = source.options;
	if (!options.length) return [t("aaalice.enumSwitch.error.noOptions", "The bound enum has no options.")];
	if (options.length > MAX_ENUM_BRANCHES) return [message("aaalice.enumSwitch.error.tooManyOptions", "The bound enum has more than {count} options.", { count: MAX_ENUM_BRANCHES })];
	if (options.some((option) => !option.trim())) return [t("aaalice.enumSwitch.error.emptyOption", "The bound enum contains an empty option.")];
	if (new Set(options).size !== options.length) return [t("aaalice.enumSwitch.error.duplicateOptions", "The bound enum contains duplicate options.")];
	return [];
}

function statusFor(node) {
	const current = state(node);
	if (!current.binding) return { kind: "standalone", visible: false, text: "" };
	const source = sourceParameter(node);
	if (!source) return {
		kind: "missing", visible: true,
		text: t("aaalice.enumSwitch.status.sourceMissing", "The bound enum parameter is missing. Click to bind another source."),
	};
	const errors = sourceErrors(source);
	if (errors.length) return { kind: "error", visible: true, text: errors.join(" ") };
	const diff = enumRouteDiff(current.routes, source.options);
	if (!diff.changed) return { kind: "synced", visible: false, text: "", source, diff };
	return {
		kind: "warning", visible: true, source, diff,
		text: message("aaalice.enumSwitch.status.needsSync", "Parameter options changed: {added} added, {removed} removed. Click to synchronize.", {
			added: diff.added.length,
			removed: diff.removed.length,
		}),
	};
}

function connectedBinding(node) {
	const selectorSlot = inputSlot(node, "selector");
	const selectorInput = node.inputs?.[selectorSlot];
	const link = getGraphLink(node.graph, selectorInput?.link);
	const source = link && getGraphNode(node.graph, link.origin_id);
	if (!source) return null;
	const detected = bindingFromDirectSource(source, link.origin_slot);
	if (!detected) return null;
	const panel = getGraphNode(node.graph, detected.panelNodeId);
	const parameter = isParameterPanel(panel)
		? ensureParameters(panel).find((item) => String(item.id) === detected.parameterId)
		: null;
	if (!parameter || !["enum", "dropdown"].includes(parameter.param_type)) return null;
	return detected;
}

function markGraphChange(node, before) {
	if (before) node.graph?.beforeChange?.();
	else {
		node.graph?.afterChange?.();
		node.graph?.setDirtyCanvas?.(true, true);
	}
}

function branchLink(node, index) {
	const slot = inputSlot(node, `branch_${index + 1}`);
	return slot >= 0 ? getGraphLink(node.graph, node.inputs?.[slot]?.link) : null;
}

function connectionImpact(node, routes) {
	return (routes || []).reduce((count, route) => {
		const index = state(node).routes.findIndex((item) => item.id === route.id);
		return count + (index >= 0 && branchLink(node, index) ? 1 : 0);
	}, 0);
}

function applyRoutes(node, nextRoutes) {
	const current = state(node);
	const normalized = nextRoutes.map((route) => ({ id: route.id, key: String(route.key).trim() }));
	markGraphChange(node, true);
	try {
		reshapeEnumBranchInputsPreservingLinks(
			node,
			current.routes,
			normalized,
			(linkId) => getGraphLink(node.graph, linkId),
			(nodeId) => getGraphNode(node.graph, nodeId),
		);
		current.routes = normalized;
		syncSlots(node);
	} finally {
		markGraphChange(node, false);
	}
	render(node);
	fitEnumStructure(node);
}

function syncSlots(node) {
	const routes = state(node).routes;
	reshapeEnumBranchInputs(node, routes.length);
	for (const input of node.inputs || []) input._aaaliceProtocolName ||= input.name;
	for (let index = 0; index < routes.length; index += 1) {
		const input = node.inputs?.find((slot) => (slot._aaaliceProtocolName || slot.name) === `branch_${index + 1}`);
		if (!input) continue;
		const route = routes[index];
		input.label = route?.key || "";
		input.localized_name = input.label;
		input.lazy = true;
	}
	syncEnumConcreteInputs(node);
	node.setDirtyCanvas?.(true, true);
}

function fitEnumStructure(node, initial = false) {
	const minimum = node.computeSize?.();
	if (!Array.isArray(minimum)) return;
	const current = Array.isArray(node.size) ? node.size : minimum;
	node.setSize?.([
		Math.max(220, initial ? minimum[0] : Number(current[0]) || minimum[0]),
		initial ? minimum[1] : Math.max(Number(current[1]) || 0, minimum[1]),
	]);
}

async function synchronize(node) {
	const source = sourceParameter(node);
	if (!source) {
		await openBindingDialog(node);
		return;
	}
	const errors = sourceErrors(source);
	if (errors.length) {
		toast("error", errors.join(" "));
		return;
	}
	const reconciliation = reconcileEnumRoutes(state(node).routes, source.options);
	const impact = connectionImpact(node, reconciliation.removed);
	if (impact && !(await confirmAction(message(
		"aaalice.enumSwitch.confirm.removeImpact",
		"Synchronizing removes {count} connected branch(es). Their links will be disconnected.",
		{ count: impact },
	)))) return;
	applyRoutes(node, reconciliation.ordered);
	toast("success", message("aaalice.enumSwitch.toast.synced", "Enum Switch synchronized: {count} branches.", { count: reconciliation.ordered.length }));
}

function render(node) {
	const root = node._aaaliceEnumRoot;
	if (!root) return;
	const status = statusFor(node);
	root.replaceChildren();
	root.hidden = !status.visible;
	if (status.visible) {
		const error = ["missing", "error"].includes(status.kind);
		const control = iconButton({
			iconName: error ? "statusError" : "statusWarning",
			label: status.text,
			title: status.text,
			variant: "ghost",
			className: `aaalice-enum-sync is-${status.kind}`,
			onClick: () => (error ? openBindingDialog(node) : synchronize(node)).catch((reason) => toast("error", reason.message || String(reason))),
		});
		root.append(control);
	}
	const widget = node.widgets?.find((item) => item.name === "aaalice_enum_status");
	if (widget) widget.computedHeight = 0;
	syncSlots(node);
	node.setDirtyCanvas?.(true, true);
}

async function confirmRemovedRoutes(node, draft) {
	const nextIds = new Set(draft.map((route) => route.id));
	const removed = state(node).routes.filter((route) => !nextIds.has(route.id));
	const impact = connectionImpact(node, removed);
	if (!impact) return true;
	return confirmAction(message("aaalice.enumSwitch.confirm.removeImpact", "Removing these branches disconnects {count} link(s).", { count: impact }));
}

async function openBranchEditor(node) {
	const draft = state(node).routes.map((route) => ({ ...route }));
	const list = el("div", "aaalice-enum-editor-list");
	const error = el("div", { className: "aaalice-enum-editor-error", attrs: { role: "alert" } });
	const footer = el("footer");
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary" });
	const save = button({ label: t("aaalice.common.save", "Save") });
	footer.append(cancel, save);
	const body = el("div", { className: "aaalice-modal-body", children: [list, error] });
	const dialog = createDialog({ title: t("aaalice.enumSwitch.editor.title", "Edit Enum Switch branches"), body, footer });
	const rerender = () => {
		list.replaceChildren();
		for (let index = 0; index < draft.length; index += 1) {
			const route = draft[index];
			const input = document.createElement("input");
			input.type = "text";
			input.value = route.key;
			input.setAttribute("aria-label", message("aaalice.enumSwitch.editor.branchLabel", "Branch {index}", { index: index + 1 }));
			input.addEventListener("input", () => { route.key = input.value; error.textContent = ""; });
			const up = iconButton({ iconName: "moveDown", label: t("aaalice.enumSwitch.editor.moveUp", "Move up"), variant: "ghost", className: "is-up", disabled: index === 0, onClick: () => { [draft[index - 1], draft[index]] = [draft[index], draft[index - 1]]; rerender(); } });
			const down = iconButton({ iconName: "moveDown", label: t("aaalice.enumSwitch.editor.moveDown", "Move down"), variant: "ghost", disabled: index === draft.length - 1, onClick: () => { [draft[index], draft[index + 1]] = [draft[index + 1], draft[index]]; rerender(); } });
			const remove = iconButton({ iconName: "delete", label: t("aaalice.common.delete", "Delete"), variant: "ghost", disabled: draft.length === 1, onClick: () => { draft.splice(index, 1); rerender(); } });
			list.append(el("div", { className: "aaalice-enum-editor-row", children: [input, up, down, remove] }));
		}
		if (draft.length < MAX_ENUM_BRANCHES) list.append(button({ label: t("aaalice.enumSwitch.editor.add", "Add branch"), iconName: "add", variant: "secondary", onClick: () => { draft.push(createRoute(`option_${draft.length + 1}`)); rerender(); } }));
	};
	cancel.addEventListener("click", () => dialog.close());
	save.addEventListener("click", async () => {
		const normalized = draft.map((route) => ({ ...route, key: String(route.key).trim() }));
		const errors = localizedRouteErrors(normalized);
		if (errors.length) { error.textContent = errors.join(" "); return; }
		if (!(await confirmRemovedRoutes(node, normalized))) return;
		applyRoutes(node, normalized);
		dialog.close();
	});
	rerender();
}

function localizedRouteErrors(routes) {
	if (!Array.isArray(routes) || routes.length < 1 || routes.length > MAX_ENUM_BRANCHES) {
		return [message("aaalice.enumSwitch.validation.branchCount", "Enum Switch requires 1 to {count} branches.", { count: MAX_ENUM_BRANCHES })];
	}
	const ids = new Set();
	const keys = new Set();
	const errors = [];
	for (const route of routes) {
		const id = String(route?.id || "");
		const key = String(route?.key || "").trim();
		if (!id || ids.has(id)) errors.push(t("aaalice.enumSwitch.validation.branchIds", "Branch ids must be unique."));
		if (!key) errors.push(t("aaalice.enumSwitch.validation.emptyKey", "Branch keys cannot be empty."));
		else if (keys.has(key)) errors.push(message("aaalice.enumSwitch.validation.duplicateKey", "Duplicate branch key: {key}", { key }));
		ids.add(id);
		keys.add(key);
	}
	return [...new Set(errors)];
}

function bindingChoices(node) {
	const choices = [];
	for (const panel of node.graph?._nodes || []) {
		if (!isParameterPanel(panel)) continue;
		for (const parameter of ensureParameters(panel)) {
			if (!["enum", "dropdown"].includes(parameter.param_type)) continue;
			choices.push({
				panelNodeId: panel.id,
				parameterId: String(parameter.id),
				label: `${panel.title || "ParameterPanel"} — ${displayName(parameter, parameter.id)}`,
			});
		}
	}
	return choices;
}

async function openBindingDialog(node) {
	const choices = bindingChoices(node);
	if (!choices.length) {
		toast("error", t("aaalice.enumSwitch.binding.noEnums", "No enum or dropdown parameters are available in this graph."));
		return;
	}
	const select = document.createElement("select");
	for (let index = 0; index < choices.length; index += 1) select.add(new Option(choices[index].label, String(index)));
	const current = state(node).binding;
	const currentIndex = choices.findIndex((choice) => String(choice.panelNodeId) === String(current?.panelNodeId) && choice.parameterId === current?.parameterId);
	if (currentIndex >= 0) select.value = String(currentIndex);
	const footer = el("footer");
	const cancel = button({ label: t("aaalice.common.cancel", "Cancel"), variant: "secondary" });
	const bind = button({ label: t("aaalice.enumSwitch.binding.bind", "Bind") });
	footer.append(cancel, bind);
	const body = el("div", { className: "aaalice-modal-body", children: [select] });
	const dialog = createDialog({ title: t("aaalice.enumSwitch.binding.title", "Bind enum parameter"), body, footer });
	cancel.addEventListener("click", () => dialog.close());
	bind.addEventListener("click", () => {
		const choice = choices[Number(select.value)];
		if (!choice) return;
		markGraphChange(node, true);
		state(node).binding = { panelNodeId: choice.panelNodeId, parameterId: choice.parameterId };
		markGraphChange(node, false);
		render(node);
		dialog.close();
	});
}

function detach(node) {
	markGraphChange(node, true);
	state(node).binding = null;
	markGraphChange(node, false);
	render(node);
}

function menuItems(node) {
	const items = [
		{ content: t("aaalice.enumSwitch.menu.edit", "⚙️ Edit Branches…"), callback: () => openBranchEditor(node).catch((error) => toast("error", error.message || String(error))) },
		{ content: t("aaalice.enumSwitch.menu.bind", "🔗 Bind Enum Parameter…"), callback: () => openBindingDialog(node).catch((error) => toast("error", error.message || String(error))) },
	];
	if (state(node).binding) items.push(
		{ content: t("aaalice.enumSwitch.menu.sync", "🔄 Sync from Parameter Panel"), callback: () => synchronize(node).catch((error) => toast("error", error.message || String(error))) },
		{ content: t("aaalice.enumSwitch.menu.detach", "✂️ Detach"), callback: () => detach(node) },
	);
	return items;
}

function setupEnumSwitch(node, loaded = false) {
	if (!node || node._aaaliceEnumSwitchSetup) return;
	node._aaaliceEnumSwitchSetup = true;
	state(node);
	node.widgets_up = true;
	node.widgets_start_y = -(Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT) || 30);
	const root = isolate(el("div", "aaalice-enum-status"));
	node._aaaliceEnumRoot = root;
	const widget = node.addDOMWidget("aaalice_enum_status", "enum_status", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 0,
		getMinHeight: () => 0,
		getHeight: () => 0,
		getValue: () => "",
		setValue: () => {},
	});
	widget.computedHeight = 0;
	widget.y = node.widgets_start_y;
	widget.last_y = widget.y;
	const previousMenu = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (canvas, options = []) {
		const result = previousMenu?.apply(this, arguments);
		const target = Array.isArray(result) ? result : options;
		for (const item of menuItems(this)) if (!target.some((candidate) => candidate?.content === item.content)) target.push(item);
		return result;
	};
	const previousConnections = node.onConnectionsChange;
	node.onConnectionsChange = function () {
		const result = previousConnections?.apply(this, arguments);
		setTimeout(async () => {
			const detected = connectedBinding(this);
			if (detected) {
				const current = state(this).binding;
				if (String(current?.panelNodeId) !== String(detected.panelNodeId) || current?.parameterId !== detected.parameterId) {
					markGraphChange(this, true);
					state(this).binding = detected;
					markGraphChange(this, false);
					try { await synchronize(this); }
					catch (error) { toast("error", error?.message || String(error)); }
				}
			}
			render(this);
		}, 0);
		return result;
	};
	const panelChange = (event) => {
		if (String(event.detail?.nodeId) === String(state(node).binding?.panelNodeId)) setTimeout(() => render(node), 0);
	};
	window.addEventListener(EVENT_PARAMETER_CHANGED, panelChange);
	const previousRemoved = node.onRemoved;
	node.onRemoved = function () {
		window.removeEventListener(EVENT_PARAMETER_CHANGED, panelChange);
		return previousRemoved?.apply(this, arguments);
	};
	const previousConfigure = node.onConfigure;
	node.onConfigure = function () {
		const result = previousConfigure?.apply(this, arguments);
		this.properties ||= {};
		this.properties.enumSwitch = normalizeEnumSwitchState(this.properties.enumSwitch);
		setTimeout(() => render(this), 0);
		return result;
	};
	if (!node._aaaliceEnumSlotPatch) {
		node._aaaliceEnumSlotPatch = true;
		const previousConcrete = node._setConcreteSlots;
		if (typeof previousConcrete === "function") node._setConcreteSlots = function () {
			const result = previousConcrete.apply(this, arguments);
			syncEnumConcreteInputs(this);
			return result;
		};
	}
	render(node);
	if (!loaded) fitEnumStructure(node, true);
}

function installPromptHook() {
	if (app._aaaliceEnumSwitchPromptHook) return;
	app._aaaliceEnumSwitchPromptHook = true;
	const original = app.graphToPrompt?.bind(app);
	if (!original) throw new Error("[Aaalice] graphToPrompt is unavailable for EnumSwitch");
	app.graphToPrompt = async function (...args) {
		const nodes = (app.graph?._nodes || []).filter(isEnumSwitch);
		const result = await original(...args);
		const output = result?.output ?? result;
		for (const node of nodes) {
			const promptNode = output?.[String(node.id)];
			if (!promptNode) continue;
			promptNode.inputs ||= {};
			promptNode.inputs.routes_json = JSON.stringify(enumPromptPayload(state(node)));
		}
		return result;
	};
}

function hookPrototype(nodeType) {
	if (!nodeType || nodeType.__aaaliceEnumSwitch) return;
	nodeType.__aaaliceEnumSwitch = true;
	const previous = nodeType.prototype.onNodeCreated;
	nodeType.prototype.onNodeCreated = function () {
		const result = previous?.apply(this, arguments);
		setupEnumSwitch(this);
		return result;
	};
}

app.registerExtension({
	name: "ComfyUI.Aaalice.EnumSwitch",
	async init() { await ensureI18nReady(); },
	async beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) hookPrototype(nodeType); },
	nodeCreated(node) { if (isEnumSwitch(node)) setupEnumSwitch(node, false); },
	loadedGraphNode(node) { if (isEnumSwitch(node)) setupEnumSwitch(node, true); },
	setup() {
		installPromptHook();
		for (const node of app.graph?._nodes || []) if (isEnumSwitch(node)) setupEnumSwitch(node, true);
	},
});
