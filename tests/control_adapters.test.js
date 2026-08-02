import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parameterControlSpec, resolvedControlSpec } from "../js/lib/controls/specs.js";
import { normalizeControlSpec } from "../js/lib/controls/contract.js";
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
const aaaliceSource = readFileSync(join(ROOT, "js", "lib", "controls", "aaalice.js"), "utf8");
const comfySource = readFileSync(join(ROOT, "js", "lib", "controls", "comfy.js"), "utf8");
const publicApiSource = readFileSync(join(ROOT, "js", "api.js"), "utf8");
const providerSource = readFileSync(join(ROOT, "js", "lib", "control_providers.js"), "utf8");

test("shared controls keep Aaalice and ComfyUI policies in separate renderer families", () => {
	assert.match(registrySource, /\["aaalice", new Map\(Object\.entries\(AAALICE_CONTROL_RENDERERS\)\)\]/);
	assert.match(registrySource, /\["comfy", new Map\(Object\.entries\(COMFY_CONTROL_RENDERERS\)\)\]/);
	for (const kind of ["numeric", "seed", "boolean", "choice", "text", "taglist", "image"]) assert.match(aaaliceSource, new RegExp(`\\b${kind}:`));
	for (const kind of ["numeric", "seed", "boolean", "choice", "text", "image-compare"]) assert.match(comfySource, new RegExp(`${kind.includes("-") ? `"${kind}"` : `\\b${kind}`}:`));
	assert.equal(parameterControlSpec({ id: "steps", param_type: "slider", value: 20, config: {} }).family, "aaalice");
	assert.equal(resolvedControlSpec({ family: "comfy", kind: "choice", label: "Mode", value: "a", options: {} }).family, "comfy");
	assert.equal(resolvedControlSpec({ family: "comfy", kind: "vendor-meter", controlId: "meter", label: "Meter", value: 1 }).kind, "vendor-meter");
});

test("dropdown and enum parameters retain distinct choice presentations", () => {
	const dropdown = parameterControlSpec({ id: "service", param_type: "dropdown", value: "a", config: { options: ["a", "b"] } });
	const enumeration = parameterControlSpec({ id: "mode", param_type: "enum", value: "a", config: { options: ["a", "b"] } });
	const forcedDropdown = parameterControlSpec({ id: "model", param_type: "enum", value: "a", config: { options: ["a", "b"], enum_display: "dropdown" } });
	const sidebarForcedDropdown = resolvedControlSpec({
		family: "aaalice",
		controlId: "model",
		control: { id: "model", param_type: "enum", config: { enum_display: "dropdown" } },
		label: "Model",
		value: "a",
		options: { options: ["a", "b"], enum_display: "dropdown" },
	});
	assert.equal(dropdown.kind, "choice");
	assert.equal(dropdown.presentation.segmented, false);
	assert.equal(enumeration.kind, "choice");
	assert.equal(enumeration.presentation.segmented, true);
	assert.equal(forcedDropdown.presentation.segmented, false);
	assert.equal(sidebarForcedDropdown.presentation.segmented, false);
});

test("third-party renderers can extend a family without mutating built-ins", () => {
	assert.match(publicApiSource, /CONTROL_ADAPTER_API_VERSION = 1/);
	assert.match(publicApiSource, /registerControlRenderer/);
	assert.match(publicApiSource, /controlView/);
	assert.match(publicApiSource, /registerWidgetControlAdapter/);
	assert.match(publicApiSource, /invalidateControlHost/);
	assert.match(registrySource, /export function registerControlRenderer/);
	assert.match(registrySource, /Duplicate \$\{family\} control renderer/);
	assert.match(registrySource, /return \(\) => \{ if \(renderers\.get\(kind\) === renderer\) renderers\.delete\(kind\); \}/);
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

test("provider wrappers preserve adapter failure and async return contracts", () => {
	assert.match(providerSource, /const result = adapted\.setValue\(next\);[\s\S]*?return result;/);
	assert.match(providerSource, /const result = adapted\.setSeedBehavior\(behavior\);[\s\S]*?return result;/);
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
