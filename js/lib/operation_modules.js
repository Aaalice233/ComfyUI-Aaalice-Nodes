/** Operation Panel card rendering, adapter lifecycle and preset controls. */
import { app } from "../../../scripts/app.js";
import { t } from "../i18n.js";
import { cloneData, displayName, ensureParameters, isParameterPanel, notifyParameterChanged } from "./param_model.js";
import { createParameterControl, createSelectControl, createSwitchControl } from "./parameter_controls.js";
import { createOperationField, getNodeAdapter } from "./operation_registry.js";
import { renderSafeMarkdown } from "./safe_markdown.js";
import { button, el, emptyState, iconButton } from "./ui.js";

function message(key, fallback, values = {}) {
	let result = t(key, fallback);
	for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
	return result;
}

export function graphNodes() {
	return new Map((app.graph?._nodes || []).map((node) => [String(node.id), node]));
}

export function isSubgraphNode(node) {
	return Boolean(node?.isSubgraphNode?.());
}

function moduleSurface(tagName, kind, module) {
	return el(tagName, `aaalice-operation-surface aaalice-operation-${kind} aaalice-operation-style-${module.style}`);
}

export function createOperationModuleRenderer({ onRender }) {
	const adapterCleanups = new Set();
	const viewCleanups = new Set();
	const carouselPages = new Map();

	function cleanup() {
		for (const dispose of adapterCleanups) {
			try { dispose(); } catch (error) { console.error("[Aaalice] Operation adapter cleanup failed", error); }
		}
		adapterCleanups.clear();
		for (const dispose of viewCleanups) dispose();
		viewCleanups.clear();
	}

	function setWidget(widget, value, node) {
		widget.value = value;
		widget.callback?.(value, app.canvas, node, app.canvas?.graph_mouse);
		node.graph?.setDirtyCanvas?.(true, true);
	}

	function supportedWidgets(node, module) {
		const filter = module?.widgets;
		return (node.widgets || []).filter((widget) => {
			if (!widget?.name || widget.serialize === false || widget.type === "button") return false;
			if (Array.isArray(filter) && !filter.includes(widget.name)) return false;
			if (widget.computedDisabled) return false;
			return isSubgraphNode(node)
				|| ["number", "slider", "toggle", "combo", "text", "string", "converted-widget", "BOOLEAN", "INT", "FLOAT", "STRING", "COMBO"].includes(widget.type)
				|| widget.options?.values;
		});
	}

	function parameterControl(parameter, node) {
		const update = () => notifyParameterChanged(node, { structure: false });
		if (parameter.param_type === "image") {
			const input = document.createElement("input");
			input.value = parameter.value?.filename || "";
			input.addEventListener("change", () => {
				parameter.value = input.value.trim() ? { filename: input.value.trim(), subfolder: "", type: "input" } : null;
				update();
			});
			return input;
		}
		return createParameterControl({ parameter, mode: "sidebar", onChange: update, labels: { input: displayName(parameter), select: displayName(parameter), switch: displayName(parameter) } });
	}

	function renderParameterPanel(container, node) {
		const parameters = ensureParameters(node);
		for (const parameter of parameters) {
			if (parameter.param_type === "separator") {
				container.append(el("div", "aaalice-operation-section-label", displayName(parameter)));
				continue;
			}
			container.append(createOperationField({
				label: displayName(parameter),
				description: parameter.description,
				control: parameterControl(parameter, node),
			}));
		}
		if (!parameters.length) container.append(emptyState({ description: t("aaalice.operation.emptyPanel", "This parameter panel is empty."), iconName: "settings" }));
	}

	function renderNodeResults(container, node) {
		if (!node.imgs?.length) return;
		const results = el("div", "aaalice-operation-results");
		for (const source of node.imgs) {
			const image = document.createElement("img");
			image.src = source?.src || source?.url || String(source || "");
			image.alt = node.title || node.type || t("aaalice.operation.result", "Result");
			results.append(image);
		}
		container.append(results);
	}

	function renderGenericControls(container, node, module) {
		for (const widget of supportedWidgets(node, module)) {
			const options = widget.options?.values || (Array.isArray(widget.options) ? widget.options : null);
			let control;
			if (options) control = createSelectControl(options, widget.value, { ariaLabel: widget.label || widget.name, onChange: (value) => setWidget(widget, value, node) });
			else if (["toggle", "BOOLEAN"].includes(widget.type) || typeof widget.value === "boolean") control = createSwitchControl(widget.value, { ariaLabel: widget.label || widget.name, onChange: (value) => setWidget(widget, value, node) });
			else {
				control = document.createElement("input");
				control.type = typeof widget.value === "number" ? "number" : "text";
				control.value = widget.value ?? "";
				control.addEventListener("change", () => setWidget(widget, control.type === "number" ? Number(control.value) : control.value, node));
			}
			container.append(createOperationField({ label: widget.label || widget.name, control }));
		}
	}

	function renderGeneric(container, node, module) {
		renderGenericControls(container, node, module);
		renderNodeResults(container, node);
	}

	function renderAdapter(container, node, module) {
		const adapter = getNodeAdapter(node.comfyClass || node.type);
		if (!adapter || ![adapter.render, adapter.renderControls, adapter.renderResults].some((renderer) => typeof renderer === "function")) return false;
		const controller = new AbortController();
		const context = {
			container,
			node,
			module,
			components: globalThis.aaaliceOperationPanel?.v1?.components,
			signal: controller.signal,
			app,
			t,
			markDirty: () => { node.graph?.setDirtyCanvas?.(true, true); onRender?.(); },
		};
		const cleanups = [];
		try {
			if (adapter.render) cleanups.push(adapter.render(context));
			else {
				if (adapter.renderControls) cleanups.push(adapter.renderControls(context));
				else renderGenericControls(container, node, module);
				if (adapter.renderResults) cleanups.push(adapter.renderResults(context));
				else renderNodeResults(container, node);
			}
			adapterCleanups.add(() => {
				controller.abort();
				for (const dispose of cleanups) if (typeof dispose === "function") dispose();
			});
			return true;
		} catch (error) {
			controller.abort();
			for (const dispose of cleanups) {
				try { if (typeof dispose === "function") dispose(); }
				catch (cleanupError) { console.error("[Aaalice] Operation adapter cleanup failed after render error", cleanupError); }
			}
			console.error(`[Aaalice] Operation adapter render failed for ${node.type}`, error);
			container.append(el("div", "aaalice-operation-error", message("aaalice.operation.adapterError", "Adapter error: {error}", { error: error.message || error })));
			return true;
		}
	}

	function cardTitle(node, module) {
		const adapterTitle = getNodeAdapter(node.comfyClass || node.type)?.title;
		return module.label_override
			|| (typeof adapterTitle === "function" ? adapterTitle({ node, module, app, t }) : adapterTitle)
			|| (isSubgraphNode(node) ? node.subgraph?.name : null)
			|| node.getTitle?.()
			|| node.title
			|| node.type
			|| message("aaalice.operation.nodeFallback", "Node {id}", { id: node.id });
	}

	function validatePresetControls(controls, node) {
		if (!Array.isArray(controls)) throw new Error(`Operation adapter preset controls for ${node.type} must be an array`);
		const keys = new Set();
		for (const control of controls) {
			if (!control?.key || typeof control.read !== "function" || typeof control.write !== "function") throw new Error(`Operation adapter preset control for ${node.type} needs key, read and write`);
			if (keys.has(control.key)) throw new Error(`Operation adapter ${node.type} has duplicate preset key: ${control.key}`);
			keys.add(control.key);
		}
		return controls;
	}

	function presetControls(node, module) {
		const adapter = getNodeAdapter(node.comfyClass || node.type);
		const controls = adapter?.getPresetControls?.({ node, module, app, t });
		if (controls) return validatePresetControls(controls, node);
		if (isParameterPanel(node)) return validatePresetControls(ensureParameters(node)
			.filter((parameter) => parameter.param_type !== "separator")
			.map((parameter) => ({
				key: parameter.id,
				label: displayName(parameter),
				read: () => cloneData(parameter.value),
				validate: (value) => {
					if (["slider", "seed"].includes(parameter.param_type) && !Number.isFinite(Number(value))) return t("aaalice.operation.preset.invalidNumber", "Value must be numeric.");
					if (parameter.param_type === "switch" && typeof value !== "boolean") return t("aaalice.operation.preset.invalidBoolean", "Value must be boolean.");
					if (parameter.param_type === "taglist" && !Array.isArray(value)) return t("aaalice.operation.preset.invalidList", "Value must be a list.");
					if (["dropdown", "enum"].includes(parameter.param_type) && !(parameter.config?.options || []).includes(value)) return t("aaalice.operation.preset.invalidOption", "Option is unavailable.");
					return null;
				},
				write: (value) => { parameter.value = cloneData(value); },
			})), node);
		return validatePresetControls(supportedWidgets(node, module).map((widget) => ({
			key: widget.name,
			label: widget.label || widget.name,
			read: () => cloneData(widget.value),
			validate: (value) => {
				const options = widget.options?.values || (Array.isArray(widget.options) ? widget.options : null);
				if (options && !options.map(String).includes(String(value))) return t("aaalice.operation.preset.invalidOption", "Option is unavailable.");
				if (typeof widget.value === "number" && !Number.isFinite(Number(value))) return t("aaalice.operation.preset.invalidNumber", "Value must be numeric.");
				return null;
			},
			write: (value) => setWidget(widget, cloneData(value), node),
		})), node);
	}

	function renderNodeBody(container, node, module) {
		if (renderAdapter(container, node, module)) return;
		if (isParameterPanel(node)) renderParameterPanel(container, node);
		else renderGeneric(container, node, module);
	}

	function moduleName(page, module) {
		if (module.type === "node") {
			const node = graphNodes().get(module.node_id);
			return node ? cardTitle(node, module) : t("aaalice.operation.missingNode", "Missing node");
		}
		if (module.title) return module.title;
		if (module.type === "heading") return String(module.content || t("aaalice.operation.heading", "Heading")).split("\n")[0];
		if (module.type === "markdown") return t("aaalice.operation.markdown", "Markdown");
		return module.type === "group" ? t("aaalice.operation.group", "Group") : t("aaalice.operation.carousel", "Carousel");
	}

	function renderNodeModule(module) {
		const node = graphNodes().get(module.node_id);
		const body = el("div", "aaalice-operation-card-body");
		if (!node) body.append(emptyState({ description: t("aaalice.operation.missingNode", "The workflow node no longer exists."), iconName: "close" }));
		else renderNodeBody(body, node, module);
		const root = moduleSurface("article", "card", module);
		const header = el("header", "aaalice-operation-card-header");
		header.append(el("strong", null, node ? cardTitle(node, module) : t("aaalice.operation.missingNode", "Missing node")));
		if (node) header.append(el("span", "aaalice-operation-node-id", isSubgraphNode(node) ? t("aaalice.operation.subgraph", "Subgraph") : `#${node.id}`));
		root.append(header, body);
		return root;
	}

	function renderContentModule(module) {
		if (module.type === "heading") {
			const [title, ...description] = String(module.content || "").split("\n");
			const root = el("header", `aaalice-operation-heading-module aaalice-operation-style-${module.style}`);
			root.append(el("h2", null, title || t("aaalice.operation.heading", "Heading")));
			if (description.length) root.append(el("p", null, description.join("\n")));
			return root;
		}
		const root = moduleSurface("article", "markdown", module);
		root.append(renderSafeMarkdown(module.content || ""));
		return root;
	}

	function renderGroup(page, module) {
		const root = moduleSurface("section", "group", module);
		if (module.title) root.append(el("h3", "aaalice-operation-container-title", module.title));
		const body = el("div", "aaalice-operation-group-body");
		for (const childId of module.children) {
			const child = page.modules[childId];
			if (!child) continue;
			const childElement = renderModuleContent(page, child);
			childElement.classList.add("aaalice-operation-group-item");
			body.append(childElement);
		}
		root.append(body);
		return root;
	}

	function renderCarousel(page, module) {
		const root = moduleSurface("section", "carousel", module);
		const active = module.children.includes(carouselPages.get(module.id)) ? carouselPages.get(module.id) : module.default_child_id || module.children[0];
		carouselPages.set(module.id, active);
		const nav = el("div", "aaalice-operation-carousel-nav");
		const move = (delta) => {
			const index = module.children.indexOf(carouselPages.get(module.id));
			carouselPages.set(module.id, module.children[(index + delta + module.children.length) % module.children.length]);
			onRender?.();
		};
		nav.append(iconButton({ iconName: "chevronLeft", label: t("aaalice.operation.previous", "Previous"), variant: "ghost", onClick: () => move(-1) }));
		const dots = el("div", { className: "aaalice-operation-carousel-dots", attrs: { role: "tablist" } });
		for (const childId of module.children) {
			const child = page.modules[childId];
			if (!child) continue;
			const activeDot = childId === active;
			const dot = button({ label: moduleName(page, child), variant: "ghost", size: "sm", className: `aaalice-operation-carousel-dot${activeDot ? " is-active" : ""}` });
			dot.setAttribute("role", "tab");
			dot.setAttribute("aria-selected", String(activeDot));
			dot.addEventListener("click", () => { carouselPages.set(module.id, childId); onRender?.(); });
			dots.append(dot);
		}
		nav.append(dots, iconButton({ iconName: "chevronRight", label: t("aaalice.operation.next", "Next"), variant: "ghost", onClick: () => move(1) }));
		const slides = el("div", "aaalice-operation-carousel-slides");
		for (const childId of module.children) {
			const child = page.modules[childId];
			if (!child) continue;
			const slide = el("div", `aaalice-operation-carousel-slide${childId === active ? " is-active" : ""}`);
			slide.dataset.childId = childId;
			slide.append(renderModuleContent(page, child));
			slides.append(slide);
		}
		let wheelX = 0;
		slides.addEventListener("wheel", (event) => {
			if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 8) return;
			event.preventDefault();
			wheelX += event.deltaX;
			if (Math.abs(wheelX) >= 48) {
				move(wheelX > 0 ? 1 : -1);
				wheelX = 0;
			}
		}, { passive: false });
		let touchStartX = null;
		slides.addEventListener("pointerdown", (event) => { if (event.pointerType === "touch") touchStartX = event.clientX; });
		slides.addEventListener("pointerup", (event) => {
			if (touchStartX == null || event.pointerType !== "touch") return;
			const distance = event.clientX - touchStartX;
			touchStartX = null;
			if (Math.abs(distance) >= 48) move(distance < 0 ? 1 : -1);
		});
		root.addEventListener("keydown", (event) => {
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				move(event.key === "ArrowLeft" ? -1 : 1);
			}
		});
		root.tabIndex = 0;
		root.append(nav, slides);
		const frame = requestAnimationFrame(() => {
			const height = Math.max(0, ...[...slides.children].map((slide) => slide.scrollHeight));
			if (height) slides.style.height = `${height}px`;
		});
		viewCleanups.add(() => cancelAnimationFrame(frame));
		return root;
	}

	function renderModuleContent(page, module) {
		if (module.type === "node") return renderNodeModule(module);
		if (["heading", "markdown"].includes(module.type)) return renderContentModule(module);
		if (module.type === "group") return renderGroup(page, module);
		return renderCarousel(page, module);
	}

	return {
		cleanup,
		renderModuleContent,
		moduleName,
		cardTitle,
		presetControls,
		getCarouselPage: (moduleId) => carouselPages.get(moduleId) || null,
	};
}
