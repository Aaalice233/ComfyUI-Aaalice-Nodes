/**
 * Parameter Panel — permanent sidebar full editor + multi-instance tabs.
 */
import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";
import {
	EVENT_PCP_CHANGED,
	EVENT_PCP_LIST,
	MAX_TUNABLE,
	canAddTunable,
	createParameter,
	ensureParameters,
	isTunable,
	listPcpNodes,
	loadParametersFromWidget,
	notifyPcpChanged,
	syncParametersToWidget,
	validateNameUnique,
} from "./lib/param_model.js";

let activeNodeId = null;
let sidebarRoot = null;

function el(tag, className, text) {
	const n = document.createElement(tag);
	if (className) n.className = className;
	if (text != null) n.textContent = text;
	return n;
}

function getActiveNode() {
	const nodes = listPcpNodes(app);
	if (!nodes.length) return null;
	if (activeNodeId != null) {
		const found = nodes.find((n) => String(n.id) === String(activeNodeId));
		if (found) return found;
	}
	activeNodeId = nodes[0].id;
	return nodes[0];
}

function setActive(id) {
	activeNodeId = id;
	renderSidebar();
}

function renderSidebar() {
	if (!sidebarRoot) return;
	sidebarRoot.innerHTML = "";
	sidebarRoot.className = "aaalice-pcp";

	const title = el("div", "aaalice-pcp-label");
	title.style.marginBottom = "8px";
	title.appendChild(
		el("span", null, t("aaalice.pcp.sidebar.title", "Parameter Panel")),
	);
	sidebarRoot.appendChild(title);

	const nodes = listPcpNodes(app);
	if (!nodes.length) {
		sidebarRoot.appendChild(
			el(
				"div",
				"aaalice-pcp-empty",
				t(
					"aaalice.pcp.sidebar.empty",
					"No Parameter Control Panel nodes on the graph. Add one from Aaalice → control.",
				),
			),
		);
		return;
	}

	const tabs = el("div", "aaalice-pcp-tabs");
	for (const n of nodes) {
		const label =
			n.title ||
			n.properties?.title ||
			`${t("aaalice.pcp.sidebar.instance", "Panel")} #${n.id}`;
		const tab = el("button", "aaalice-pcp-tab" + (String(n.id) === String(activeNodeId) ? " active" : ""), label);
		tab.type = "button";
		tab.addEventListener("click", () => setActive(n.id));
		tabs.appendChild(tab);
	}
	sidebarRoot.appendChild(tabs);

	const node = getActiveNode();
	if (!node) return;
	loadParametersFromWidget(node);
	const params = ensureParameters(node);

	const scroll = el("div", "aaalice-pcp-scroll");
	sidebarRoot.appendChild(scroll);

	// Toolbar
	const toolbar = el("div", "aaalice-pcp-toolbar");
	const addTypes = [
		["slider", t("aaalice.pcp.type.slider", "Slider")],
		["switch", t("aaalice.pcp.type.switch", "Switch")],
		["string", t("aaalice.pcp.type.string", "String")],
		["dropdown", t("aaalice.pcp.type.dropdown", "Dropdown")],
		["separator", t("aaalice.pcp.type.separator", "Separator")],
	];
	for (const [type, label] of addTypes) {
		const btn = el("button", "aaalice-pcp-btn secondary", `+ ${label}`);
		btn.type = "button";
		btn.addEventListener("click", () => {
			if (type !== "separator" && !canAddTunable(params)) {
				app.extensionManager?.toast?.add?.({
					severity: "warn",
					summary: t("aaalice.pcp.limit.title", "Limit"),
					detail: t(
						"aaalice.pcp.limit.detail",
						`At most ${MAX_TUNABLE} tunable parameters (separators free).`,
					),
					life: 4000,
				});
				return;
			}
			const baseName = type === "separator" ? "Section" : type;
			let name = baseName;
			let i = 1;
			while (params.some((p) => p.name === name)) {
				name = `${baseName}_${i++}`;
			}
			params.push(createParameter(type, { name }));
			notifyPcpChanged(node);
			renderSidebar();
		});
		toolbar.appendChild(btn);
	}
	scroll.appendChild(toolbar);

	const count = el(
		"div",
		"aaalice-pcp-muted",
		t("aaalice.pcp.sidebar.count", "Tunable") +
			`: ${params.filter(isTunable).length} / ${MAX_TUNABLE}`,
	);
	count.style.marginBottom = "10px";
	scroll.appendChild(count);

	if (!params.length) {
		scroll.appendChild(
			el(
				"div",
				"aaalice-pcp-empty",
				t("aaalice.pcp.sidebar.noParams", "Add a parameter to get started."),
			),
		);
		return;
	}

	params.forEach((param, index) => {
		scroll.appendChild(renderEditorBlock(node, params, param, index));
	});
}

function renderEditorBlock(node, params, param, index) {
	const block = el("div", "aaalice-pcp-editor-block");
	const head = el("div", "aaalice-pcp-editor-head");
	head.appendChild(el("span", "aaalice-pcp-badge", param.param_type));
	const moves = el("div", "aaalice-pcp-actions");
	moves.style.marginTop = "0";

	const up = el("button", "aaalice-pcp-btn secondary", "↑");
	up.type = "button";
	up.disabled = index === 0;
	up.addEventListener("click", () => {
		if (index <= 0) return;
		const tmp = params[index - 1];
		params[index - 1] = params[index];
		params[index] = tmp;
		notifyPcpChanged(node);
		renderSidebar();
	});
	const down = el("button", "aaalice-pcp-btn secondary", "↓");
	down.type = "button";
	down.disabled = index >= params.length - 1;
	down.addEventListener("click", () => {
		if (index >= params.length - 1) return;
		const tmp = params[index + 1];
		params[index + 1] = params[index];
		params[index] = tmp;
		notifyPcpChanged(node);
		renderSidebar();
	});
	const del = el("button", "aaalice-pcp-btn danger", t("aaalice.common.delete", "Delete"));
	del.type = "button";
	del.addEventListener("click", () => {
		params.splice(index, 1);
		notifyPcpChanged(node);
		renderSidebar();
	});
	moves.append(up, down, del);
	head.appendChild(moves);
	block.appendChild(head);

	// Name
	const nameField = el("div", "aaalice-pcp-field");
	nameField.appendChild(el("label", null, t("aaalice.pcp.field.name", "Name")));
	const nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.value = param.name || "";
	const nameErr = el("div", "aaalice-pcp-error", "");
	nameInput.addEventListener("change", () => {
		const err = validateNameUnique(params, nameInput.value, param.id);
		if (err) {
			nameErr.textContent = err;
			nameInput.value = param.name;
			return;
		}
		nameErr.textContent = "";
		param.name = nameInput.value.trim();
		notifyPcpChanged(node);
		// refresh node surface titles
		node._aaalicePcpRedraw?.();
	});
	nameField.appendChild(nameInput);
	nameField.appendChild(nameErr);
	block.appendChild(nameField);

	if (param.param_type === "separator") {
		return block;
	}

	// Type-specific config
	if (param.param_type === "slider") {
		const grid = el("div", "aaalice-pcp-grid2");
		for (const key of ["min", "max", "step"]) {
			const f = el("div", "aaalice-pcp-field");
			f.appendChild(el("label", null, key));
			const inp = document.createElement("input");
			inp.type = "number";
			inp.value = String(param.config?.[key] ?? (key === "step" ? 1 : key === "max" ? 100 : 0));
			inp.addEventListener("change", () => {
				if (!param.config) param.config = {};
				param.config[key] = Number(inp.value);
				notifyPcpChanged(node);
				renderSidebar();
			});
			f.appendChild(inp);
			grid.appendChild(f);
		}
		block.appendChild(grid);
	}

	if (param.param_type === "dropdown") {
		const f = el("div", "aaalice-pcp-field");
		f.appendChild(
			el("label", null, t("aaalice.pcp.field.options", "Options (one per line)")),
		);
		const ta = document.createElement("textarea");
		ta.rows = 4;
		const opts = Array.isArray(param.config?.options) ? param.config.options : [];
		ta.value = opts.join("\n");
		ta.addEventListener("change", () => {
			const lines = ta.value
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
			if (!lines.length) {
				app.extensionManager?.toast?.add?.({
					severity: "error",
					summary: t("aaalice.common.error", "Error"),
					detail: t(
						"aaalice.pcp.dropdown.emptyOptions",
						"Dropdown needs at least one option.",
					),
					life: 4000,
				});
				ta.value = opts.join("\n");
				return;
			}
			if (!param.config) param.config = {};
			param.config.options = lines;
			if (!lines.includes(param.value)) {
				param.value = lines[0];
			}
			notifyPcpChanged(node);
			renderSidebar();
		});
		f.appendChild(ta);
		block.appendChild(f);
	}

	// Value
	const valField = el("div", "aaalice-pcp-field");
	valField.style.marginTop = "8px";
	valField.appendChild(el("label", null, t("aaalice.pcp.field.value", "Value")));
	valField.appendChild(buildSidebarValueControl(param, node));
	block.appendChild(valField);

	return block;
}

function buildSidebarValueControl(param, node) {
	const onChange = () => {
		notifyPcpChanged(node);
		node._aaalicePcpRedraw?.();
	};
	const config = param.config || {};
	if (param.param_type === "slider") {
		const wrap = el("div");
		const range = document.createElement("input");
		range.type = "range";
		range.min = String(config.min ?? 0);
		range.max = String(config.max ?? 100);
		range.step = String(config.step ?? 1);
		range.value = String(param.value ?? 0);
		const lab = el("div", "aaalice-pcp-muted", String(range.value));
		range.addEventListener("input", () => {
			const step = Number(config.step ?? 1);
			param.value = step === 1 ? parseInt(range.value, 10) : parseFloat(range.value);
			lab.textContent = String(param.value);
			onChange();
		});
		wrap.append(range, lab);
		return wrap;
	}
	if (param.param_type === "switch") {
		const wrap = el("label", "aaalice-pcp-switch");
		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = Boolean(param.value);
		input.addEventListener("change", () => {
			param.value = input.checked;
			onChange();
		});
		wrap.append(input, el("span", "aaalice-pcp-muted", "On/Off"));
		return wrap;
	}
	if (param.param_type === "dropdown") {
		const select = document.createElement("select");
		for (const opt of config.options || []) {
			const o = document.createElement("option");
			o.value = opt;
			o.textContent = opt;
			if (opt === param.value) o.selected = true;
			select.appendChild(o);
		}
		select.addEventListener("change", () => {
			param.value = select.value;
			onChange();
		});
		return select;
	}
	const input = document.createElement("input");
	input.type = "text";
	input.value = param.value != null ? String(param.value) : "";
	input.addEventListener("input", () => {
		param.value = input.value;
		onChange();
	});
	return input;
}

function registerSidebar() {
	const em = app.extensionManager;
	if (!em?.registerSidebarTab) {
		console.warn("[Aaalice] registerSidebarTab unavailable");
		return;
	}
	em.registerSidebarTab({
		id: "aaalice-parameter-panel",
		icon: "pi pi-sliders-h",
		title: t("aaalice.pcp.sidebar.title", "Parameter Panel"),
		tooltip: t("aaalice.pcp.sidebar.tooltip", "Edit Parameter Control Panel instances"),
		type: "custom",
		render: (elContainer) => {
			sidebarRoot = elContainer;
			elContainer.style.padding = "12px";
			elContainer.style.height = "100%";
			elContainer.style.overflow = "hidden";
			renderSidebar();
		},
		destroy: () => {
			sidebarRoot = null;
		},
	});
}

app.registerExtension({
	name: "ComfyUI.Aaalice.ParameterSidebar",

	async setup() {
		registerSidebar();
		window.addEventListener(EVENT_PCP_CHANGED, () => renderSidebar());
		window.addEventListener(EVENT_PCP_LIST, () => renderSidebar());

		// Graph changes: node add/remove
		const refreshList = () => {
			window.dispatchEvent(new CustomEvent(EVENT_PCP_LIST));
		};
		const g = app.graph;
		if (g) {
			const origAdd = g.add;
			if (origAdd) {
				g.add = function () {
					const r = origAdd.apply(this, arguments);
					setTimeout(refreshList, 0);
					return r;
				};
			}
			const origRemove = g.remove;
			if (origRemove) {
				g.remove = function () {
					const r = origRemove.apply(this, arguments);
					setTimeout(refreshList, 0);
					return r;
				};
			}
		}
		// Also when graph configured
		const origConfigure = app.graph?.configure;
		if (app.graph && origConfigure) {
			app.graph.configure = function () {
				const r = origConfigure.apply(this, arguments);
				setTimeout(refreshList, 50);
				return r;
			};
		}
	},
});

