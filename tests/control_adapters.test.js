import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolvedControlSpec } from "../js/lib/controls/specs.js";
import { normalizeControlSpec } from "../js/lib/controls/contract.js";
import "../js/lib/aaalice_widget_control_adapters.js";
import {
	adaptWidgetControl,
	invalidateWidgetControlAdapterCache,
	listAdaptedWidgetControls,
	registeredWidgetControlAdapters,
	registerWidgetControlAdapter,
	resolveAdaptedWidgetControl,
} from "../js/lib/widget_control_adapters.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const registrySource = readFileSync(join(ROOT, "js", "lib", "controls", "registry.js"), "utf8");
const comfySource = readFileSync(join(ROOT, "js", "lib", "controls", "comfy.js"), "utf8");
const loraRendererSource = readFileSync(join(ROOT, "js", "lib", "controls", "lora_list.js"), "utf8");
const booruGalleryRendererSource = readFileSync(join(ROOT, "js", "lib", "controls", "booru_gallery.js"), "utf8");
const loraActionsSource = readFileSync(join(ROOT, "js", "lib", "lora_actions.js"), "utf8");
const loraPreviewSource = readFileSync(join(ROOT, "js", "lib", "lora_preview.js"), "utf8");
const imagePreviewSource = readFileSync(join(ROOT, "js", "lib", "image_preview.js"), "utf8");
const themeControlsSource = readFileSync(join(ROOT, "js", "lib", "theme-controls.css"), "utf8");
const publicApiSource = readFileSync(join(ROOT, "js", "api.js"), "utf8");
const providerSource = readFileSync(join(ROOT, "js", "lib", "control_providers.js"), "utf8");

test("ComfyUI control specs normalize kinds and preserve explicit families", () => {
	assert.equal(resolvedControlSpec({ family: "comfy", kind: "choice", label: "Mode", value: "a", options: {} }).family, "comfy");
	assert.equal(resolvedControlSpec({ family: "comfy", kind: "vendor-meter", controlId: "meter", label: "Meter", value: 1 }).kind, "vendor-meter");
	assert.equal(resolvedControlSpec({ value: 1 }).kind, "numeric");
	assert.equal(resolvedControlSpec({ value: false }).kind, "boolean");
});

test("built-in ComfyUI renderer families expose their supported kinds", () => {
	assert.match(registrySource, /\["comfy", new Map\(Object\.entries\(COMFY_CONTROL_RENDERERS\)\)\]/);
	for (const kind of ["numeric", "seed", "boolean", "choice", "text", "image-compare", "resolution", "prompt-selector", "lora-list", "booru-gallery"]) assert.match(comfySource, new RegExp(`${kind.includes("-") ? `"${kind}"` : `\\b${kind}`}:`));
	assert.match(booruGalleryRendererSource, /controlView\(\{/);
	assert.match(booruGalleryRendererSource, /kind: "booru-gallery"/);
	assert.match(booruGalleryRendererSource, /createSidebarControl/);
});
test("LoRA list renderer keeps active state and delegates row actions to context menus", () => {
	assert.match(loraRendererSource, /data-capture-wheel/);
	assert.match(loraRendererSource, /active/);
	assert.match(loraRendererSource, /setChecked\(active\)/);
	assert.doesNotMatch(loraRendererSource, /addEventListener\("wheel"/);
	assert.match(themeControlsSource, /\.aa-control-lora-list__row\.is-inactive/);
	assert.doesNotMatch(loraRendererSource, /__status|menuButton|setEntryExpanded|expandButton|aa-control-lora-list__meta|chevronDown/);
	assert.doesNotMatch(themeControlsSource, /\.aa-control-lora-list__status|\.aa-control-lora-list__menu|\.aa-control-lora-list__expand|\.aa-control-lora-list__clip-row/);
	assert.match(themeControlsSource, /\.aa-control-lora-list \.aa-control-lora-list__toggle \{[^}]*width: 18px[^}]*border-radius: 4px/);
	assert.match(themeControlsSource, /\.aa-control-lora-list__strength \{[^}]*min-width: max-content/);
	assert.match(themeControlsSource, /\.aa-control-lora-list__strength-input \{[^}]*min-width: 52px[^}]*flex: 0 0 52px/);
	assert.match(loraRendererSource, /previewResolver/);
	assert.match(loraRendererSource, /createContextMenu/);
	assert.match(loraRendererSource, /function clearList\(\)/);
	assert.match(loraRendererSource, /labels\.clearAll/);
	assert.match(loraRendererSource, /list\.classList\.toggle\("is-empty", current\.length === 0\)/);
	assert.match(loraRendererSource, /emptyStateMounted = current\.length > 0 \|\| Boolean\(list\.querySelector/);
	assert.match(themeControlsSource, /\.aa-control-lora-list__items\.is-empty \{[^}]*grid-template-rows: minmax\(0, 1fr\)[^}]*align-content: stretch/);
	assert.match(loraRendererSource, /input, textarea, select/);
	for (const action of ["openLoraCivitai", "copyLoraNotes", "copyLoraTriggerWords", "saveLoraRecipe", "openLoraManager"]) assert.match(loraRendererSource, new RegExp(action));
	for (const menuAction of ["moveUp", "moveDown", "moveTop", "moveBottom", "copyNotes", "copyTriggerWords", "saveRecipe"]) assert.match(loraRendererSource, new RegExp(`labels\\.${menuAction}`));
	assert.match(loraRendererSource, /aa-control-lora-list__strength-input/);
	assert.match(loraActionsSource, /lm\/loras\/civitai-url/);
	assert.match(loraActionsSource, /lm\/loras\/get-notes/);
	assert.match(loraActionsSource, /lm\/loras\/get-trigger-words/);
	assert.match(loraActionsSource, /api\/lm\/recipes\/save-from-widget/);
	assert.match(loraActionsSource, /window\.location\.origin}\/loras/);
	assert.match(imagePreviewSource, /bindAsyncImagePreview/);
	assert.match(loraPreviewSource, /lm\/loras\/preview-url/);
});

test("composite and LoRA widgets expose stable sidebar controls", () => {
	const resolutionNode = {
		comfyClass: "ResolutionPreset",
		widgets: [{ name: "aaalice_resolution_preset", type: "custom", value: "", serialize: false }],
		_aaaliceResolutionControl: {
			getValue: () => ({ version: 1, width: 1024, height: 1024, alignment: 8, canvasMax: 2048, presetId: "builtin:square-1024" }),
			getPresets: () => [], getAlignments: () => [8], getCanvasLimits: () => [2048], createSidebarControl: () => {},
			validatePresetValue: () => true, setValue: () => {},
		},
	};
	const promptNode = {
		type: "PromptSelector",
		widgets: [{ name: "aaalice_prompt_selector", type: "custom", value: "", serialize: false }],
		_aaalicePromptSelectorControl: {
			getValue: () => ({ version: 1, selections: [], separator: ", " }), createSidebarControl: () => {},
			validatePresetValue: () => true, setValue: () => {},
		},
	};
	const galleryState = { version: 1, source: "danbooru" };
	const galleryPreset = { version: 1, state: galleryState };
	let appliedGalleryPreset = null;
	const galleryNode = {
		comfyClass: "BooruGalleryNode",
		properties: { booruGalleryState: galleryState },
		widgets: [{ name: "aaalice_booru_gallery", type: "custom", value: "", serialize: false }],
		_aaGalleryRuntime: {
			createSidebarControl: () => ({}),
			getPresetValue: () => galleryPreset,
			validatePresetValue: (value) => value?.version === 1 || "invalid-gallery-preset",
			applyPresetValue: (value) => { appliedGalleryPreset = value; },
		},
	};
	const loraListWidget = { name: "loras", type: "custom", value: [{ name: "style.safetensors", strength: 0.8, clipStrength: 0.7, active: false, selected: true }], getValue() { return this.value; }, setValue(next) { this.value = next; } };
	const loraTextWidget = { name: "text", type: "AUTOCOMPLETE_TEXT_LORAS", label: "text", value: "<lora:style.safetensors:0.8>" };
	const resolution = listAdaptedWidgetControls(resolutionNode)[0];
	const prompt = listAdaptedWidgetControls(promptNode)[0];
	const gallery = listAdaptedWidgetControls(galleryNode)[0];
	const loraControls = listAdaptedWidgetControls({ title: "LoRA prompt", getTitle: () => "LoRA prompt", widgets: [loraListWidget, loraTextWidget] });
	const lora = loraControls[0];
	assert.deepEqual([resolution.adapterId, resolution.kind, resolution.columnSpan, resolution.rowSpan, resolution.minRowSpan], ["aaalice-resolution-preset", "resolution", 6, 13, 13]);
	assert.deepEqual([prompt.adapterId, prompt.kind, prompt.rowSpan], ["aaalice-prompt-selector", "prompt-selector", 64]);
	assert.deepEqual([gallery.adapterId, gallery.kind, gallery.columnSpan, gallery.rowSpan, gallery.minRowSpan, gallery.presettable, gallery.linkable], ["aaalice-booru-gallery", "booru-gallery", 12, 90, 50, true, false]);
	assert.equal(typeof gallery.options.createSidebarControl, "function");
	assert.equal(gallery.value, galleryState);
	assert.deepEqual(gallery.readPresetValue(), galleryPreset);
	assert.equal(gallery.validatePresetValue({ valueType: "booru-gallery", payload: galleryPreset }), true);
	gallery.applyPresetValue({ valueType: "booru-gallery", payload: galleryPreset });
	assert.equal(appliedGalleryPreset, galleryPreset);
	assert.deepEqual([lora.adapterId, lora.kind, lora.valueType, lora.rowSpan, lora.minRowSpan, lora.label], ["lora-manager-list", "lora-list", "lora-list", 36, 28, "LoRA prompt"]);
	assert.deepEqual(lora.value, [{ name: "style.safetensors", strength: 0.8, clipStrength: 0.7, active: false }]);
	assert.equal(loraControls.length, 1);
	const legacyLora = listAdaptedWidgetControls({ getTitle: () => "Legacy LoRA", widgets: [loraTextWidget] })[0];
	assert.deepEqual([legacyLora.adapterId, legacyLora.kind], ["lora-manager-text", "text"]);
});

test("LoraManager list writes preserve active state and notify mounted views", async () => {
	let value = [{ name: "detail.safetensors", strength: 1, clipStrength: 1, active: true }];
	const widget = {
		name: "loras", type: "LORAS", getValue: () => value,
		setValue(next) { value = next; this.value = next; },
	};
	const control = adaptWidgetControl({ widgets: [widget] }, widget);
	const received = [];
	const unsubscribe = control.subscribeValueChange((next) => received.push(next));
	control.setValue([{ name: "detail.safetensors", strength: 1, clipStrength: 1, active: false }]);
	await Promise.resolve();
	assert.equal(value[0].active, false);
	assert.equal(received.at(-1)[0].active, false);
	unsubscribe();
});

test("native generic value labels use the live node title while explicit labels remain", () => {
	const node = {
		title: "Old title",
		getTitle: () => "Batch size",
		widgets: [
			{ name: "value", type: "INT", label: "Value", value: 1 },
			{ name: "text", type: "STRING", label: "数值", value: "", options: { multiline: true } },
			{ name: "text_input", type: "STRING", label: "text", value: "" },
			{ name: "prompt", type: "STRING", label: "Prompt", value: "" },
		],
	};
	assert.deepEqual(listAdaptedWidgetControls(node).map((control) => control.label), ["Batch size", "Batch size", "Batch size", "Prompt"]);
});

test("native customtext widgets retain their multiline semantics", () => {
	const widget = { name: "prompt", type: "customtext", label: "prompt", value: "" };
	const adapted = adaptWidgetControl({ widgets: [widget] }, widget);
	assert.equal(adapted.options.multiline, true);
});

test("third-party renderers can extend a family without mutating built-ins", () => {
	assert.match(publicApiSource, /CONTROL_ADAPTER_API_VERSION = 1/);
	assert.match(publicApiSource, /registerControlRenderer/);
	assert.match(publicApiSource, /controlView/);
	assert.match(publicApiSource, /registerWidgetControlAdapter/);
	assert.match(publicApiSource, /invalidateControlHost/);
	assert.match(registrySource, /export function registerControlRenderer/);
	assert.match(registrySource, /Duplicate \$\{family\} control renderer/);
	assert.match(registrySource, /return \(\) => \{\s*if \(renderers\.get\(kind\) !== renderer\) return;\s*renderers\.delete\(kind\);\s*notifyControlRendererRegistryChanged\(/);
});

test("third-party widget adapters normalize custom identity, value access and writes", () => {
	const unregister = registerWidgetControlAdapter({
		id: "test-vendor-widget",
		priority: 100,
		linkable: true,
		matches: ({ widget }) => widget.type === "VENDOR_NUMBER",
		describe: ({ widget }) => ({
			controlId: `vendor:${widget.name}`,
			label: widget.displayName,
			kind: "numeric",
			numericDomain: "integer",
			getValue: () => widget.payload.current,
			options: { min: 0, max: 10, step: 1 },
			setValue: (next) => { widget.payload.current = next; },
		}),
	});
	try {
		const widget = { name: "strength", displayName: "Strength", type: "VENDOR_NUMBER", payload: { current: 3 } };
		const node = { widgets: [widget] };
		const adapted = adaptWidgetControl(node, widget);
		assert.equal(adapted.adapterId, "test-vendor-widget");
		assert.equal(adapted.controlId, "vendor:strength");
		assert.equal(adapted.valueType, "number");
		assert.equal(adapted.kind, "numeric");
		assert.equal(adapted.numericDomain, "integer");
		assert.equal(adapted.linkable, true);
		adapted.setValue(7);
		assert.equal(widget.payload.current, 7);
		assert.equal(adapted.readPresetValue(), 7);
		assert.equal(listAdaptedWidgetControls(node)[0].value, 7);
	} finally { unregister(); }
});

test("widget adapters can subscribe sidebar views to host value changes", () => {
	let subscribed = false; let stopped = false; let emit = null;
	const unregister = registerWidgetControlAdapter({
		id: "test-host-value-events", priority: 100, matches: ({ widget }) => widget.type === "VENDOR_EVENTED",
		describe: ({ widget }) => ({
			controlId: widget.name, kind: "text", value: widget.value,
			subscribeValueChange: (listener) => { subscribed = true; emit = listener; return () => { stopped = true; }; },
		}),
	});
	try {
		const widget = { name: "prompt", type: "VENDOR_EVENTED", value: "before" };
		const adapted = adaptWidgetControl({ widgets: [widget] }, widget);
		const values = []; const unsubscribe = adapted.subscribeValueChange((value, detail) => values.push([value, detail.source]));
		assert.equal(subscribed, true); emit("after", { source: "host" }); assert.deepEqual(values, [["after", "host"]]);
		unsubscribe(); assert.equal(stopped, true);
	} finally { unregister(); }
});

test("third-party widget adapters can opt out of multi-target linking", () => {
	const unregister = registerWidgetControlAdapter({
		id: "test-vendor-unlinked", priority: 100, matches: ({ widget }) => widget.type === "VENDOR_UNLINKED",
		describe: ({ widget }) => ({ controlId: widget.name, kind: "text", value: widget.value, linkable: false }),
	});
	try {
		const widget = { name: "prompt", type: "VENDOR_UNLINKED", value: "hello" };
		assert.equal(adaptWidgetControl({ widgets: [widget] }, widget).linkable, false);
	} finally { unregister(); }
});

test("third-party widget adapters can serialize and validate domain-specific preset payloads", () => {
	const events = [];
	const unregister = registerWidgetControlAdapter({
		id: "test-vendor-preset", priority: 100, matches: ({ widget }) => widget.type === "VENDOR_PRESET",
		describe: ({ widget }) => ({
			controlId: widget.name, kind: "text", valueType: "string", value: widget.value,
			readPresetValue: () => ({ token: widget.value }),
			validatePresetValue: (entry) => typeof entry.payload?.token === "string" || "invalid-token",
			applyPresetValue: (entry) => { events.push(entry.payload.token); widget.value = entry.payload.token; },
		}),
	});
	try {
		const widget = { name: "style", type: "VENDOR_PRESET", value: "soft" };
		const adapted = adaptWidgetControl({ widgets: [widget] }, widget);
		assert.equal(adapted.hasCustomPresetCodec, true);
		assert.deepEqual(adapted.readPresetValue(), { token: "soft" });
		assert.equal(adapted.validatePresetValue({ valueType: "string", payload: { token: 4 } }), "invalid-token");
		adapted.applyPresetValue({ valueType: "string", payload: { token: "hard" } });
		assert.equal(widget.value, "hard"); assert.deepEqual(events, ["hard"]);
	} finally { unregister(); }
});

test("promoted widget discovery only exposes actual public subgraph widgets", () => {
	const ordinary = { name: "ordinary", type: "number", value: 1, options: {} };
	const promoted = { name: "public", type: "number", value: 2, options: {}, serialize: false, sourceNodeId: "4", sourceWidgetName: "cfg" };
	assert.deepEqual(listAdaptedWidgetControls({ widgets: [ordinary, promoted] }, { promoted: true }).map((item) => item.controlId), ['promoted:["4","cfg",null]']);
	assert.ok(registeredWidgetControlAdapters().some((adapter) => adapter.id === "comfy-native-widget"));
});

test("store-backed promoted widgets resolve source identity through subgraph slot links", () => {
	// frontend >= 1.47（上游 ADR 0009）：宿主 widget 只有 widgetId，来源沿 _subgraphSlot 链路解析。
	const interiorWidget = { name: "cfg", type: "float", value: 7.5, options: {} };
	const interiorInput = { name: "cfg", link: 11 };
	const interiorNode = { id: 4, inputs: [interiorInput], isSubgraphNode: () => false, getWidgetFromSlot: (slot) => slot === interiorInput ? interiorWidget : undefined };
	const link = { resolve: () => ({ inputNode: interiorNode }) };
	const projected = { name: "cfg", type: "float", value: 8, options: {}, widgetId: "graph-1:1:cfg" };
	const hostInput = { name: "cfg", widgetId: "graph-1:1:cfg", _widget: projected, _subgraphSlot: { linkIds: [11] } };
	const host = {
		isSubgraphNode: () => true,
		inputs: [hostInput],
		widgets: [projected],
		subgraph: { getLink: (id) => id === 11 ? link : null, getNodeById: (id) => id === 4 ? interiorNode : null },
	};
	const controls = listAdaptedWidgetControls(host, { promoted: true });
	assert.deepEqual(controls.map((item) => item.controlId), ['promoted:["4","cfg",null]']);
	assert.equal(resolveAdaptedWidgetControl(host, 'promoted:["4","cfg",null]', { promoted: true })?.widget, projected);
	// 旧持久化的裸名绑定仍按 legacy alias 命中。
	assert.equal(resolveAdaptedWidgetControl(host, "cfg", { promoted: true })?.widget, projected);
});

test("host-owned promoted multiline widgets are listed as sidebar controls", () => {
	let value = "first line\nsecond line";
	const interiorWidget = { name: "prompt", type: "customtext", value, options: {} };
	const interiorInput = { name: "prompt", link: 11 };
	const interiorNode = { id: 4, inputs: [interiorInput], isSubgraphNode: () => false, getWidgetFromSlot: (slot) => slot === interiorInput ? interiorWidget : undefined };
	const projected = {
		name: "prompt", type: "customtext", options: { hideOnZoom: true },
		get value() { return value; },
		set value(next) { value = next; },
	};
	const hostInput = { name: "prompt", widgetId: "graph-1:1:prompt", _widget: projected, _subgraphSlot: { linkIds: [11] } };
	const host = {
		isSubgraphNode: () => true,
		inputs: [{ name: "unpromoted" }, hostInput],
		widgets: [projected],
		subgraph: {
			getLink: (id) => id === 11 ? { resolve: () => ({ inputNode: interiorNode }) } : null,
			getNodeById: (id) => id === 4 ? interiorNode : null,
		},
	};
	const [listed] = listAdaptedWidgetControls(host, { promoted: true });
	assert.equal(listed?.controlId, 'promoted:["4","prompt",null]');
	assert.equal(listed?.kind, "text");
	assert.equal(listed?.options.multiline, true);
	const resolved = resolveAdaptedWidgetControl(host, listed.controlId, { promoted: true });
	resolved.setValue("edited\ntext");
	assert.equal(value, "edited\ntext");
});

test("store-backed promoted seed widgets keep the dedicated seed control", () => {
	// 新协议宿主投影不带 linkedWidgets，种子行为控件只存在于内部真实节点上。
	const controlWidget = {
		name: "control_after_generate", type: "combo", value: "randomize",
		options: { values: ["fixed", "increment", "decrement", "randomize"], serialize: false, canvasOnly: true },
	};
	const interiorWidget = { name: "seed", type: "number", value: 1, options: {}, linkedWidgets: [controlWidget] };
	const interiorInput = { name: "seed", link: 11 };
	const interiorNode = { id: 4, inputs: [interiorInput], widgets: [interiorWidget, controlWidget], isSubgraphNode: () => false, getWidgetFromSlot: (slot) => slot === interiorInput ? interiorWidget : undefined };
	const link = { resolve: () => ({ inputNode: interiorNode }) };
	const projected = { name: "seed", type: "number", value: 1, options: {}, widgetId: "graph-1:1:seed" };
	const hostInput = { name: "seed", widgetId: "graph-1:1:seed", _widget: projected, _subgraphSlot: { linkIds: [11] } };
	const host = {
		isSubgraphNode: () => true,
		inputs: [hostInput],
		widgets: [projected],
		subgraph: { getLink: (id) => id === 11 ? link : null, getNodeById: (id) => id === 4 ? interiorNode : null },
	};
	const adapted = adaptWidgetControl(host, projected, { promoted: true });
	assert.equal(adapted?.kind, "seed");
	assert.equal(adapted?.options?.control_after_generate, "randomize");
	adapted.setSeedBehavior("fixed");
	assert.equal(controlWidget.value, "fixed");
});

test("store-backed nested promotions keep disambiguating identity and resolve the deepest owner", () => {
	const realWidget = { name: "seed", type: "number", value: 1, options: {} };
	const realInput = { name: "seed", link: 21 };
	const realNode = { id: 6, inputs: [realInput], isSubgraphNode: () => false, getWidgetFromSlot: (slot) => slot === realInput ? realWidget : undefined };
	const innerProjected = { name: "seed", type: "number", value: 1, options: {}, widgetId: "graph-1:5:seed" };
	const innerInput = { name: "seed", link: 11, widgetId: "graph-1:5:seed", _widget: innerProjected, _subgraphSlot: { linkIds: [21] } };
	const innerNode = {
		id: 5, inputs: [innerInput], widgets: [innerProjected], isSubgraphNode: () => true,
		getWidgetFromSlot: (slot) => slot === innerInput ? innerProjected : undefined,
		subgraph: { getLink: (id) => id === 21 ? { resolve: () => ({ inputNode: realNode }) } : null, getNodeById: (id) => id === 6 ? realNode : null },
	};
	const topProjected = { name: "seed", type: "number", value: 1, options: {}, widgetId: "graph-1:1:seed" };
	const topInput = { name: "seed", widgetId: "graph-1:1:seed", _widget: topProjected, _subgraphSlot: { linkIds: [11] } };
	const topHost = {
		isSubgraphNode: () => true,
		inputs: [topInput],
		widgets: [topProjected],
		subgraph: { getLink: (id) => id === 11 ? { resolve: () => ({ inputNode: innerNode }) } : null, getNodeById: (id) => id === 5 ? innerNode : null },
	};
	const controls = listAdaptedWidgetControls(topHost, { promoted: true });
	assert.deepEqual(controls.map((item) => item.controlId), ['promoted:["5","seed","6"]']);
	const adapted = adaptWidgetControl(topHost, topProjected, { promoted: true });
	assert.equal(adapted?.controlId, 'promoted:["5","seed","6"]');
});

test("promoted bindings survive subgraph interior node renumbering via unique source-name fallback", () => {
	const promoted = { name: "public", type: "float", value: 2, options: {}, serialize: false, sourceNodeId: "9", sourceWidgetName: "cfg" };
	const node = { widgets: [promoted] };
	// 子图内部重建后 sourceNodeId 从 4 变为 9：唯一来源名匹配应解析到新身份。
	const resolved = resolveAdaptedWidgetControl(node, 'promoted:["4","cfg",null]', { promoted: true });
	assert.equal(resolved?.widget, promoted);
	assert.equal(resolved?.controlId, 'promoted:["9","cfg",null]');
	// 嵌套消歧身份同时变化时，仍按唯一来源名解析。
	assert.equal(resolveAdaptedWidgetControl(node, 'promoted:["4","cfg","6"]', { promoted: true })?.widget, promoted);
});

test("ambiguous source-name fallback stays unresolved instead of guessing", () => {
	const first = { name: "sampler_name", type: "combo", value: "euler", options: { values: ["euler"] }, serialize: false, sourceNodeId: "4", sourceWidgetName: "sampler_name" };
	const second = { name: "sampler_name", type: "combo", value: "ddim", options: { values: ["ddim"] }, serialize: false, sourceNodeId: "5", sourceWidgetName: "sampler_name" };
	const node = { widgets: [first, second] };
	// 失效的第三个身份与两个现存候选同名：拒绝猜测。
	assert.equal(resolveAdaptedWidgetControl(node, 'promoted:["7","sampler_name",null]', { promoted: true }), null);
});

test("promoted widgets with the same public name keep distinct source identities", () => {
	const first = { name: "sampler_name", type: "combo", value: "euler", options: { values: ["euler"] }, serialize: false, sourceNodeId: "4", sourceWidgetName: "sampler_name" };
	const second = { name: "sampler_name", type: "combo", value: "ddim", options: { values: ["ddim"] }, serialize: false, sourceNodeId: "5", sourceWidgetName: "sampler_name" };
	const node = { widgets: [first, second] };
	const controls = listAdaptedWidgetControls(node, { promoted: true });
	assert.deepEqual(controls.map((control) => control.controlId), [
		'promoted:["4","sampler_name",null]',
		'promoted:["5","sampler_name",null]',
	]);
	assert.notEqual(controls[0].controlId, controls[1].controlId);
	assert.equal(resolveAdaptedWidgetControl(node, controls[0].controlId, { promoted: true })?.widget, first);
	assert.equal(resolveAdaptedWidgetControl(node, controls[1].controlId, { promoted: true })?.widget, second);
	assert.equal(resolveAdaptedWidgetControl(node, "sampler_name", { promoted: true }), null);
});

test("bound widget resolution reuses the structural index while keeping values live", () => {
	let matches = 0; let describes = 0;
	const unregister = registerWidgetControlAdapter({
		id: "test-indexed-promoted", priority: 2000,
		matches: ({ widget }) => { matches += 1; return widget.type === "TEST_INDEXED"; },
		describe: ({ widget }) => { describes += 1; return { controlId: widget.name, kind: "numeric", numericDomain: "integer", value: widget.value }; },
	});
	try {
		const widgets = Array.from({ length: 24 }, (_, index) => ({ name: `control-${index}`, type: "TEST_INDEXED", value: index, sourceNodeId: String(index), sourceWidgetName: `control-${index}` }));
		const node = { widgets };
		assert.equal(resolveAdaptedWidgetControl(node, "control-17", { promoted: true })?.value, 17);
		const firstMatches = matches; const firstDescriptions = describes;
		widgets[17].value = 91;
		assert.equal(resolveAdaptedWidgetControl(node, "control-17", { promoted: true })?.value, 91);
		assert.equal(matches, firstMatches + 1);
		assert.equal(describes, firstDescriptions + 1);
	} finally { unregister(); }
});

test("promoted definition-owner traversal is cached until the host is invalidated", () => {
	let lookups = 0;
	const promoted = { name: "image", type: "combo", value: "cached.png", sourceNodeId: "7", sourceWidgetName: "image" };
	const interior = {
		constructor: { nodeData: { input: { required: { image: ["COMBO", { image_upload: true, image_folder: "output" }] } } } },
		widgets: [{ name: "image", type: "combo", value: "cached.png", options: { values: ["cached.png"] } }],
	};
	const node = { isSubgraphNode: () => true, subgraph: { getNodeById: () => { lookups += 1; return interior; } } };
	assert.equal(adaptWidgetControl(node, promoted, { promoted: true, adapterId: "comfy-image-combo" })?.kind, "image-choice");
	assert.equal(adaptWidgetControl(node, promoted, { promoted: true, adapterId: "comfy-image-combo" })?.options.image_folder, "output");
	assert.equal(lookups, 1);
	invalidateWidgetControlAdapterCache(node);
	assert.equal(adaptWidgetControl(node, promoted, { promoted: true, adapterId: "comfy-image-combo" })?.kind, "image-choice");
	assert.equal(lookups, 2);
});

test("simple ComfyUI nodes expose only built-in primitive widget families", () => {
	let committed = null;
	const node = { widgets: [
		{ name: "steps", type: "INT", value: 20, options: { min: 1, max: 100 }, callback: (value) => { committed = value; } },
		{ name: "cfg", type: "float", value: 7.5, options: { min: 0, max: 20 } },
		{ name: "enabled", type: "BOOLEAN", value: true, options: {} },
		{ name: "prompt", type: "STRING", value: "cat", options: { multiline: true } },
		{ name: "note", type: "customtext", value: "multi\nline", options: {} },
		{ name: "mode", type: "COMBO", value: "fast", options: { values: ["fast", "quality"] } },
	] };
	const controls = listAdaptedWidgetControls(node);
	assert.deepEqual(controls.map(({ controlId, kind }) => [controlId, kind]), [
		["steps", "numeric"], ["cfg", "numeric"], ["enabled", "boolean"], ["prompt", "text"], ["note", "text"], ["mode", "choice"],
	]);
	controls[0].setValue(24); assert.equal(node.widgets[0].value, 24); assert.equal(committed, 24);
	controls[4].setValue("edited"); assert.equal(node.widgets[4].value, "edited");
});

test("execution-injected canvas pseudo widgets do not disable native fallback", () => {
	const node = { widgets: [
		{ name: "sampler_name", type: "COMBO", value: "euler", options: { values: ["euler", "dpmpp_2m"] } },
		{ name: "scheduler", type: "COMBO", value: "normal", options: { values: ["normal", "karras"] } },
	] };
	assert.deepEqual(listAdaptedWidgetControls(node).map((control) => control.controlId), ["sampler_name", "scheduler"]);

	const preview = {
		name: "$$canvas-image-preview", type: "custom", value: "", serialize: false,
		options: { serialize: false, canvasOnly: true },
	};
	node.widgets.push(preview);
	const controls = listAdaptedWidgetControls(node);
	assert.deepEqual(controls.map((control) => control.controlId), ["sampler_name", "scheduler"]);
	assert.equal(controls.some((control) => control.widget === preview), false);
});

test("canvas pseudo widgets require both the reserved name and an inactive marker", () => {
	for (const marker of [
		{ serialize: false, options: {} },
		{ options: { serialize: false } },
		{ options: { canvasOnly: true } },
	]) {
		const node = { widgets: [
			{ name: "steps", type: "INT", value: 20, options: {} },
			{ name: "$$preview", type: "custom", value: "", ...marker },
		] };
		assert.deepEqual(listAdaptedWidgetControls(node).map((control) => control.controlId), ["steps"]);
	}
	const serializablePseudo = { widgets: [
		{ name: "steps", type: "INT", value: 20, options: {} },
		{ name: "$$extension-state", type: "custom", value: "state", serialize: true, options: { serialize: true } },
	] };
	assert.deepEqual(listAdaptedWidgetControls(serializablePseudo), []);
});

test("markdown note widgets adapt as read-only markdown controls", () => {
	const node = { title: "Markdown Note", widgets: [{ name: "text", type: "MARKDOWN", value: "# Hello", options: {} }] };
	const [control] = listAdaptedWidgetControls(node);
	assert.equal(control.adapterId, "comfy-markdown");
	assert.equal(control.kind, "markdown");
	assert.equal(control.valueType, "string");
	assert.equal(control.label, "Markdown Note");
	assert.equal(control.value, "# Hello");
	assert.equal(control.presettable, false);
	assert.ok(control.rowSpan >= 28);
	control.setValue("edited"); assert.equal(node.widgets[0].value, "edited");
});

test("image upload combos adapt as image-choice controls with preview options", () => {
	let committed = null;
	const byOptions = { widgets: [{ name: "image", type: "combo", value: "a.png", options: { values: ["a.png", "dir/b.png"], image_upload: true }, callback: (value) => { committed = value; } }] };
	const [control] = listAdaptedWidgetControls(byOptions);
	assert.equal(control.adapterId, "comfy-image-combo");
	assert.equal(control.kind, "image-choice");
	assert.equal(control.valueType, "string");
	assert.deepEqual(control.options.values, ["a.png", "dir/b.png"]);
	control.setValue("dir/b.png"); assert.equal(byOptions.widgets[0].value, "dir/b.png"); assert.equal(committed, "dir/b.png");
	control.setValue(""); assert.equal(byOptions.widgets[0].value, ""); assert.equal(committed, "");
	const byNodeDef = {
		constructor: { nodeData: { input: { required: { image: ["COMBO", { image_upload: true }] } } } },
		widgets: [{ name: "image", type: "combo", value: "a.png", options: { values: ["a.png"] } }],
	};
	assert.equal(listAdaptedWidgetControls(byNodeDef)[0]?.kind, "image-choice");
	const outputImage = {
		constructor: { nodeData: { input: { required: { image: ["COMBO", { image_upload: true, image_folder: "output" }] } } } },
		widgets: [{ name: "image", type: "combo", value: "ComfyUI_00030_.png", options: { values: ["ComfyUI_00030_.png"] } }],
	};
	assert.equal(listAdaptedWidgetControls(outputImage)[0]?.options.image_folder, "output");
	const plain = { widgets: [{ name: "sampler", type: "combo", value: "euler", options: { values: ["euler", "dpm"] } }] };
	assert.equal(listAdaptedWidgetControls(plain)[0]?.kind, "choice");
	const empty = { widgets: [{ name: "image", type: "combo", value: undefined, options: { values: [], image_upload: true } }] };
	assert.equal(listAdaptedWidgetControls(empty)[0]?.availability.state, "empty");
});

test("promoted image upload combos retain the image-choice adapter", () => {
	const promotedImage = {
		name: "image",
		type: "combo",
		value: "ComfyUI_00031_.png",
		options: { values: ["ComfyUI_00031_.png"] },
		serialize: false,
		sourceNodeId: "170",
		sourceWidgetName: "image",
	};
	const interiorNode = {
		constructor: { nodeData: { input: { required: { image: ["COMBO", { image_upload: true, image_folder: "output" }] } } } },
		widgets: [{ name: "image", type: "combo", value: "ComfyUI_00031_.png", options: { values: ["ComfyUI_00031_.png"] } }],
	};
	const subgraphNode = {
		widgets: [promotedImage],
		isSubgraphNode: () => true,
		subgraph: { getNodeById: (id) => id === "170" ? interiorNode : null },
	};
	const [control] = listAdaptedWidgetControls(subgraphNode, { promoted: true });
	assert.equal(control?.adapterId, "comfy-image-combo");
	assert.equal(control?.kind, "image-choice");
	assert.equal(control?.options.image_folder, "output");
});

test("nested promoted widgets follow disambiguating source identity across subgraph layers", () => {
	const nativeImage = {
		constructor: { nodeData: { input: { required: { image: ["COMBO", { image_upload: true, image_folder: "output" }] } } } },
		widgets: [{ name: "image", type: "combo", value: "nested.png", options: { values: ["nested.png"] } }],
	};
	const nestedHost = {
		widgets: [
			{ name: "image", type: "combo", value: "decoy.png", serialize: false, sourceNodeId: "99", sourceWidgetName: "image" },
			{ name: "image", type: "combo", value: "nested.png", serialize: false, sourceNodeId: "20", sourceWidgetName: "image" },
		],
		isSubgraphNode: () => true,
		subgraph: { getNodeById: (id) => id === "20" ? nativeImage : null },
	};
	const outerHost = {
		widgets: [{ name: "image", type: "combo", value: "nested.png", serialize: false, sourceNodeId: "10", sourceWidgetName: "image", disambiguatingSourceNodeId: "20" }],
		isSubgraphNode: () => true,
		subgraph: { getNodeById: (id) => id === "10" ? nestedHost : null },
	};
	const [control] = listAdaptedWidgetControls(outerHost, { promoted: true });
	assert.equal(control?.controlId, 'promoted:["10","image","20"]');
	assert.equal(control?.adapterId, "comfy-image-combo");
	assert.equal(control?.options.image_folder, "output");
});

test("image-choice keeps promoted source values and stale combo options synchronized", () => {
	const promotedImage = {
		name: "image",
		type: "combo",
		value: "old.png",
		options: { values: ["old.png"] },
		serialize: false,
		sourceNodeId: "170",
		sourceWidgetName: "image",
	};
	const interiorNode = {
		constructor: { nodeData: { input: { required: { image: ["COMBO", { image_upload: true }] } } } },
		widgets: [{ name: "image", type: "combo", value: "old.png", options: { values: ["old.png"] } }],
	};
	const subgraphNode = {
		widgets: [promotedImage],
		isSubgraphNode: () => true,
		subgraph: { getNodeById: (id) => id === "170" ? interiorNode : null },
	};
	const [control] = listAdaptedWidgetControls(subgraphNode, { promoted: true });
	assert.equal(control?.adapterId, "comfy-image-combo");
	const generated = "SeedVR2/results/Aaalice_example.jpg [output]";
	control.setValue(generated);
	assert.equal(promotedImage.value, generated);
	assert.equal(interiorNode.widgets[0].value, generated);
	assert.ok(promotedImage.options.values.includes(generated));
	assert.ok(interiorNode.widgets[0].options.values.includes(generated));
	control.setValue("old.png");
	assert.equal(interiorNode.widgets[0].value, "old.png");
	assert.deepEqual(promotedImage.options.values.filter((value) => value === "old.png"), ["old.png"]);
	control.setValue("");
	assert.equal(promotedImage.value, "");
	assert.equal(interiorNode.widgets[0].value, "");
	assert.ok(promotedImage.options.values.includes(generated));
});

test("legacy native combo bindings upgrade to the image preview adapter", () => {
	assert.match(providerSource, /requestedAdapterId = binding\.adapterId \|\| null/);
	assert.match(providerSource, /resolveAdaptedWidgetControl\(node, binding\.controlId, \{ promoted, adapterId: requestedAdapterId \}\)/);
	assert.match(providerSource, /adaptWidgetControl\(node, adapted\.widget, \{ promoted, adapterId: "comfy-image-combo" \}\)/);
});

test("native numeric widgets expose real ComfyUI number slider and knob domains", () => {
	const node = { constructor: { nodeData: { input: { required: { batch: ["INT", {}], cfg: ["FLOAT", {}], strength: ["FLOAT", {}] } } } }, widgets: [
		{ name: "batch", type: "number", value: 4, options: { min: 1, max: 64, step: 10, step2: 1, precision: 0 } },
		{ name: "cfg", type: "slider", value: 7.5, options: { min: 0, max: 20, step: 5, step2: 0.5, precision: 1, round: 0.1 } },
		{ name: "strength", type: "knob", value: 1, options: { min: -1, max: 2, step: 5, step2: 0.05, precision: 2, round: 0.01 } },
	] };
	const [batch, cfg, strength] = listAdaptedWidgetControls(node);
	assert.equal(batch.options.step, 1);
	assert.equal(cfg.options.step, 0.5);
	assert.equal(strength.options.step, 0.05);
	assert.equal(batch.numericDomain, "integer");
	assert.equal(cfg.numericDomain, "float");
	assert.equal(strength.numericDomain, "float");
});

test("provider wrappers preserve adapter failure, sizing, and async return contracts", () => {
	assert.match(providerSource, /const result = adapted\.setValue\(next\);[\s\S]*?return result;/);
	assert.match(providerSource, /const result = adapted\.setSeedBehavior\(behavior\);[\s\S]*?return result;/);
	assert.match(providerSource, /columnSpan: adapted\.columnSpan, rowSpan: adapted\.rowSpan, minRowSpan: adapted\.minRowSpan/);
	assert.match(providerSource, /if \(workspaceRedraw\) node\.setDirtyCanvas/);
});

test("native widget callbacks preserve explicit failures and asynchronous results", async () => {
	const failedWidget = { name: "steps", type: "INT", value: 1, options: {}, callback: () => false };
	const failed = adaptWidgetControl({ widgets: [failedWidget] }, failedWidget);
	assert.equal(failed.setValue(2), false);
	const pending = Promise.resolve(true);
	const asyncWidget = { name: "cfg", type: "FLOAT", value: 1, options: {}, callback: () => pending };
	const asynchronous = adaptWidgetControl({ widgets: [asyncWidget] }, asyncWidget);
	assert.equal(asynchronous.setValue(2), pending);
	await pending;
});

test("native Seed codecs propagate value and behavior callback failures", () => {
	const behavior = { name: "control_after_generate", type: "combo", value: "fixed", options: { serialize: false, canvasOnly: true, values: ["fixed", "increment", "decrement", "randomize"] }, callback: () => ({ ok: false, message: "mode rejected" }) };
	const seed = { name: "seed", type: "number", value: 1, options: { min: 0, max: 100, step2: 1, precision: 0 }, linkedWidgets: [behavior], callback: () => true };
	const adapted = adaptWidgetControl({ widgets: [seed, behavior] }, seed);
	assert.equal(adapted.supportsSeedBehavior, true);
	assert.deepEqual(adapted.seedBehaviors, ["fixed", "increment", "decrement", "randomize"]);
	assert.deepEqual(adapted.setSeedBehavior("randomize"), { ok: false, message: "mode rejected" });
	assert.deepEqual(adapted.applyPresetValue({ valueType: "number", payload: { value: 2, control_after_generate: "fixed" } }), { ok: false, message: "mode rejected" });
});

test("image choice live writes allow clear and newly uploaded filenames without weakening preset validation", () => {
	const widget = { name: "image", type: "COMBO", value: "old.png", options: { values: ["old.png"], image_upload: true, image_folder: "input" } };
	const node = { constructor: { nodeData: { input: { required: { image: [["old.png"], { image_upload: true, image_folder: "input" }] } } } }, widgets: [widget] };
	const adapted = adaptWidgetControl(node, widget);
	assert.equal(adapted.validateLinkedValue(""), true);
	assert.equal(adapted.validateLinkedValue("new.png"), true);
});

test("native Compare Images exposes a layout-only execution view", () => {
	let callbacks = 0; let dirty = 0;
	const widget = { name: "compare_view", type: "imagecompare", value: { beforeImages: ["a.png"], afterImages: ["b.png"] }, callback: () => callbacks++ };
	const node = { type: "ImageCompare", title: "Compare Images", widgets: [widget], setDirtyCanvas: () => dirty++ };
	const [control] = listAdaptedWidgetControls(node);
	assert.equal(control.adapterId, "comfy-image-compare");
	assert.equal(control.kind, "image-compare");
	assert.equal(control.valueType, "image-compare-view");
	assert.equal(control.presettable, false);
	assert.equal(control.columnSpan, 12); assert.equal(control.rowSpan, 36); assert.equal(control.minRowSpan, 24);
	widget.callback(widget.value);
	assert.equal(callbacks, 1); assert.equal(dirty, 1);
});

test("empty native combos remain structurally bindable while reporting runtime availability", () => {
	const widget = { name: "ckpt_name", label: "Checkpoint name", type: "COMBO", value: undefined, options: { values: [] } };
	const node = { properties: {}, widgets: [widget] };
	const [control] = listAdaptedWidgetControls(node);
	assert.equal(control.controlId, "ckpt_name");
	assert.equal(control.kind, "choice");
	assert.equal(control.valueType, "string");
	assert.deepEqual(control.availability, { state: "empty", reason: "no-options", message: "" });
	assert.match(providerSource, /availability: adapted\.availability/);
});

test("native combos with options allow an explicit first selection without inventing a value", () => {
	const widget = { name: "model", type: "combo", value: undefined, options: { values: ["a.safetensors", "b.safetensors"] } };
	const [control] = listAdaptedWidgetControls({ widgets: [widget] });
	assert.equal(control.value, undefined);
	assert.equal(control.availability.state, "ready");
	control.setValue("a.safetensors");
	assert.equal(widget.value, "a.safetensors");
});

test("availability is independent from identity and rejects unknown states", () => {
	const spec = normalizeControlSpec({ kind: "choice", availability: { state: "empty", reason: "no-options" } });
	assert.equal(spec.availability.state, "empty");
	assert.throws(() => normalizeControlSpec({ kind: "choice", availability: { state: "offline-ish" } }), /Invalid control availability state/);
	const unregister = registerWidgetControlAdapter({
		id: "test-unavailable", priority: 100, matches: ({ widget }) => widget.type === "VENDOR_EMPTY",
		describe: ({ widget }) => ({ controlId: widget.name, kind: "choice", valueType: "string", options: { values: [] }, availability: { state: "unavailable", reason: "vendor-loading" } }),
	});
	try { assert.equal(adaptWidgetControl({}, { name: "mode", type: "VENDOR_EMPTY" }).availability.state, "unavailable"); }
	finally { unregister(); }
});

test("custom panels disable native fallback until an explicit adapter opts in", () => {
	const node = { widgets: [
		{ name: "strength", type: "number", value: 3, options: {} },
		{ name: "editor", type: "VENDOR_PANEL", value: "state", options: {} },
	] };
	assert.deepEqual(listAdaptedWidgetControls(node), []);
	const unregister = registerWidgetControlAdapter({
		id: "test-panel-adapter", priority: 100,
		matches: ({ widget }) => widget.type === "VENDOR_PANEL",
		describe: ({ widget }) => ({ controlId: widget.name, kind: "text", value: widget.value }),
	});
	try { assert.deepEqual(listAdaptedWidgetControls(node).map((item) => item.controlId), ["editor"]); }
	finally { unregister(); }
});

test("inactive and linked native widgets do not block ordinary controls", () => {
	let seedMode = null;
	const node = { widgets: [
		{ name: "seed", type: "number", value: 1, options: {} },
		{ name: "control_after_generate", type: "int:seed", value: "randomize", options: {}, callback: (value) => { seedMode = value; } },
		{ name: "converted", type: "converted-widget", value: 2, options: {} },
	] };
	const [seed] = listAdaptedWidgetControls(node);
	assert.equal(seed.controlId, "seed"); assert.equal(seed.kind, "seed"); assert.equal(seed.options.control_after_generate, "randomize");
	assert.deepEqual(seed.readPresetValue(), { value: 1, control_after_generate: "randomize" });
	assert.equal(seed.validatePresetValue({ valueType: "number", payload: { value: 9, control_after_generate: "fixed" } }), true);
	seed.applyPresetValue({ valueType: "number", payload: { value: 9, control_after_generate: "fixed" } });
	assert.equal(node.widgets[0].value, 9); assert.equal(node.widgets[1].value, "fixed");
	seed.setSeedBehavior("increment"); assert.equal(node.widgets[1].value, "increment"); assert.equal(seedMode, "increment");
	seed.setSeedBehavior("decrement"); assert.equal(node.widgets[1].value, "decrement"); assert.equal(seedMode, "decrement");
	assert.throws(() => seed.setSeedBehavior("unsupported"), /Invalid seed behavior/);
});

test("ComfyUI Primitive integer value controls are treated as seed metadata", () => {
	let modeCommit = null;
	const mode = {
		name: "control_after_generate", type: "combo", value: "fixed",
		options: { values: ["fixed", "increment", "decrement", "randomize"], serialize: false, canvasOnly: true },
		callback: (value) => { modeCommit = value; },
	};
	const value = { name: "value", type: "number", value: 7, options: { min: 0, max: 100 }, linkedWidgets: [mode] };
	const controls = listAdaptedWidgetControls({ widgets: [value, mode] });
	assert.equal(controls.length, 1);
	assert.equal(controls[0].controlId, "value");
	assert.equal(controls[0].kind, "seed");
	assert.deepEqual(controls[0].readPresetValue(), { value: 7, control_after_generate: "fixed" });
	controls[0].setSeedBehavior("increment");
	assert.equal(mode.value, "increment");
	assert.equal(modeCommit, "increment");
});

test("adapter contract rejects unstable identities and asynchronous descriptors", () => {
	const unregisterEmpty = registerWidgetControlAdapter({ id: "test-empty-id", priority: 100, matches: () => true, describe: () => ({ controlId: "", value: 1 }) });
	try { assert.throws(() => adaptWidgetControl({}, {}), /empty controlId/); }
	finally { unregisterEmpty(); }
	const unregisterAsync = registerWidgetControlAdapter({ id: "test-async", priority: 100, matches: () => true, describe: async () => ({ controlId: "x", value: 1 }) });
	try { assert.throws(() => adaptWidgetControl({}, {}), /synchronous descriptor/); }
	finally { unregisterAsync(); }
	const unregisterPartialCodec = registerWidgetControlAdapter({ id: "test-partial-codec", priority: 100, matches: () => true, describe: () => ({ controlId: "x", value: 1, readPresetValue: () => 1 }) });
	try { assert.throws(() => adaptWidgetControl({}, {}), /complete preset codec/); }
	finally { unregisterPartialCodec(); }
});
