/** GroupLogicProbe: multi-group condition list combined with AND/OR gates. */
import { app } from "../../scripts/app.js";
import { ensureI18nReady, t } from "./i18n.js";
import { cleanupDomWidgetResizePassthrough, installDomWidgetResizePassthrough } from "./lib/dom_widget_resize.js";
import { addLifecycleDOMWidget } from "./lib/dom_widget_lifecycle.js";
import { currentGroups, groupLabels, registerProbePromptInjection, snapshotGroup } from "./lib/group_probe.js";
import { allGraphNodes } from "./lib/graph_scope.js";
import { button, el, icon, iconButton, listboxControl, segmentedControl } from "./lib/ui.js";

const NODE = "GroupLogicProbe";
const PROPERTY = "groupLogicProbe";
const PAYLOAD = "group_logic_payload";
const WIDGET = "aaalice_group_logic_probe";
const DEFAULT_WIDTH = 320;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 36;
const FOOTER_HEIGHT = 40;
const MAX_VISIBLE_ROWS = 6;
const EXPECTS = ["enabled", "disabled"];
const nodeTypes = new WeakSet();

function isProbe(node) {
	return nodeTypes.has(node?.constructor)
		|| [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.nodeData?.name].includes(NODE);
}

function normalizeState(raw) {
	const source = raw && typeof raw === "object" ? raw : {};
	const conditions = Array.isArray(source.conditions) ? source.conditions : [];
	return {
		mode: source.mode === "or" ? "or" : "and",
		conditions: conditions.map((item) => ({
			label: String(item?.label || ""),
			expect: EXPECTS.includes(item?.expect) ? item.expect : "disabled",
		})),
	};
}

function stateFor(node) {
	node.properties ||= {};
	node.properties[PROPERTY] = normalizeState(node.properties[PROPERTY]);
	return node.properties[PROPERTY];
}

function commit(node, mutate) {
	const graph = node.graph;
	graph?.beforeChange?.();
	try { mutate(stateFor(node)); }
	finally {
		graph?.afterChange?.();
		graph?.change?.();
		graph?.setDirtyCanvas?.(true, true);
	}
	render(node);
}

function expectLabel(expect) {
	return expect === "enabled"
		? t("aaalice.groupLogic.expectEnabled", "Enabled")
		: t("aaalice.groupLogic.expectDisabled", "Disabled");
}

function render(node) {
	const root = node._aaGroupLogicRoot;
	if (!root) return;
	const state = stateFor(node);
	node._aaGroupLogicMode.setValue(state.mode);
	const labels = groupLabels(currentGroups(node));
	const list = node._aaGroupLogicRows;
	list.replaceChildren();
	for (const [index, condition] of state.conditions.entries()) {
		const missing = !labels.includes(condition.label);
		const group = listboxControl({
			className: "aa-group-logic__group",
			options: labels.map((label) => ({ value: label, label })),
			value: condition.label,
			ariaLabel: t("aaalice.groupLogic.group", "Group"),
			onChange: (value) => commit(node, (current) => { current.conditions[index].label = value; }),
		});
		if (missing) {
			group.setOptions([{ value: condition.label, label: condition.label }, ...labels.map((label) => ({ value: label, label }))], condition.label);
			group.classList.add("is-missing");
			group.title = t("aaalice.groupLogic.missing", "This group no longer exists; pick another group or remove the condition.");
		}
		// 打开前用捕获阶段刷新组列表，覆盖重命名和增删。
		group.addEventListener("pointerdown", () => {
			const fresh = groupLabels(currentGroups(node));
			const options = fresh.map((label) => ({ value: label, label }));
			group.setOptions(group.classList.contains("is-missing") ? [{ value: condition.label, label: condition.label }, ...options] : options, stateFor(node).conditions[index]?.label ?? condition.label);
		}, true);
		const expect = listboxControl({
			className: "aa-group-logic__expect",
			options: EXPECTS.map((value) => ({ value, label: expectLabel(value) })),
			value: condition.expect,
			ariaLabel: t("aaalice.groupLogic.expect", "Expected state"),
			onChange: (value) => commit(node, (current) => { current.conditions[index].expect = value; }),
		});
		const remove = iconButton({
			className: "aa-group-logic__remove",
			iconName: "delete",
			label: t("aaalice.groupLogic.remove", "Remove condition"),
			variant: "ghost",
			onClick: () => commit(node, (current) => { current.conditions.splice(index, 1); }),
		});
		list.append(el("div", { className: "aa-group-logic__row", attrs: { "data-missing": missing ? "true" : null } , children: [group, expect, remove] }));
	}
	node._aaGroupLogicEmpty.hidden = state.conditions.length > 0;
	node.graph?.setDirtyCanvas?.(true, true);
}

function addCondition(node) {
	commit(node, (current) => {
		const labels = groupLabels(currentGroups(node));
		current.conditions.push({ label: labels[0] || "", expect: "disabled" });
	});
	const min = node.computeSize();
	if (node.size[1] < min[1]) node.setSize([Math.max(node.size[0], min[0]), min[1]]);
}

function minHeightFor(node) {
	const rows = Math.min(Math.max(stateFor(node).conditions.length, 1), MAX_VISIBLE_ROWS);
	return HEADER_HEIGHT + rows * ROW_HEIGHT + FOOTER_HEIGHT;
}

function setupProbe(node, { initializeSize = false } = {}) {
	if (!isProbe(node) || node._aaGroupLogicMounted) return;
	node._aaGroupLogicMounted = true;
	stateFor(node);
	if (typeof node.addDOMWidget !== "function") throw new Error("[Aaalice] GroupLogicProbe requires addDOMWidget");
	const mode = segmentedControl({
		className: "aa-group-logic__mode",
		value: stateFor(node).mode,
		options: [
			{ value: "and", label: t("aaalice.groupLogic.and", "AND") },
			{ value: "or", label: t("aaalice.groupLogic.or", "OR") },
		],
		ariaLabel: t("aaalice.groupLogic.mode", "Combination mode"),
		onChange: (value) => commit(node, (current) => { current.mode = value; }),
	});
	const rows = el("div", { className: "aa-group-logic__rows", attrs: { tabindex: 0, "data-capture-wheel": "true" } });
	// Nodes 2.0 宿主在捕获阶段先处理 wheel，滚动区必须在 pointerenter 提前拿到焦点。
	rows.addEventListener("pointerenter", () => {
		const active = document.activeElement;
		if (active && rows.contains(active)) return;
		if (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) return;
		rows.focus({ preventScroll: true });
	});
	const empty = el("div", { className: "aa-group-logic__empty", children: [
		icon("statusIdle"),
		el("span", null, t("aaalice.groupLogic.empty", "Add at least one group condition")),
	] });
	const add = button({
		className: "aa-group-logic__add",
		label: t("aaalice.groupLogic.add", "Add group condition"),
		iconName: "add",
		variant: "secondary",
		size: "sm",
		onClick: () => addCondition(node),
	});
	const root = el("div", { className: "aa-group-logic", children: [
		el("div", { className: "aa-group-logic__header", children: [mode] }),
		rows,
		empty,
		el("div", { className: "aa-group-logic__footer", children: [add] }),
	] });
	empty.hidden = true;
	node._aaGroupLogicRoot = root;
	node._aaGroupLogicMode = mode;
	node._aaGroupLogicRows = rows;
	node._aaGroupLogicEmpty = empty;
	addLifecycleDOMWidget(node, WIDGET, "custom", root, {
		serialize: false,
		hideOnZoom: false,
		margin: 0,
		getMinHeight: () => minHeightFor(node),
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
		this._aaGroupLogicRoot?.remove?.();
		this._aaGroupLogicRoot = null;
		return previousRemoved?.apply(this, arguments);
	};
	render(node);
	if (initializeSize) node.setSize?.(node.computeSize());
}

app.registerExtension({
	name: "ComfyUI.Aaalice.GroupLogicProbe",
	async init() { await ensureI18nReady(); },
	beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData?.name === NODE) nodeTypes.add(nodeType); },
	nodeCreated(node) { if (isProbe(node)) setupProbe(node, { initializeSize: true }); },
	loadedGraphNode(node) { if (isProbe(node)) setupProbe(node); },
	setup() {
		for (const node of allGraphNodes(app.graph)) setupProbe(node);
		registerProbePromptInjection({
			key: PAYLOAD,
			isProbe,
			payloadFor: (node) => ({
				version: 1,
				mode: stateFor(node).mode,
				conditions: stateFor(node).conditions.map((condition) => ({
					expect: condition.expect,
					...snapshotGroup(node, condition.label),
				})),
			}),
		});
	},
});
