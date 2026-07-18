import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parameterControlSpec, resolvedControlSpec } from "../js/lib/controls/specs.js";
import { normalizeControlSpec } from "../js/lib/controls/contract.js";
import {
	adaptWidgetControl,
	listAdaptedWidgetControls,
	registeredWidgetControlAdapters,
	registerWidgetControlAdapter,
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
	for (const kind of ["numeric", "seed", "boolean", "choice", "text"]) assert.match(comfySource, new RegExp(`\\b${kind}:`));
	assert.equal(parameterControlSpec({ id: "steps", param_type: "slider", value: 20, config: {} }).family, "aaalice");
	assert.equal(resolvedControlSpec({ family: "comfy", kind: "choice", label: "Mode", value: "a", options: {} }).family, "comfy");
	assert.equal(resolvedControlSpec({ family: "comfy", kind: "vendor-meter", controlId: "meter", label: "Meter", value: 1 }).kind, "vendor-meter");
});

test("third-party renderers can extend a family without mutating built-ins", () => {
	assert.match(publicApiSource, /CONTROL_ADAPTER_API_VERSION = 1/);
	assert.match(publicApiSource, /registerControlRenderer/);
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
		matches: ({ widget }) => widget.type === "VENDOR_NUMBER",
		describe: ({ widget }) => ({
			controlId: `vendor:${widget.name}`,
			label: widget.displayName,
			kind: "numeric",
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
		adapted.setValue(7);
		assert.equal(widget.payload.current, 7);
		assert.equal(listAdaptedWidgetControls(node)[0].value, 7);
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
	const promoted = { name: "public", type: "number", value: 2, options: {}, sourceNodeId: 4, sourceWidgetName: "cfg" };
	assert.deepEqual(listAdaptedWidgetControls({ widgets: [ordinary, promoted] }, { promoted: true }).map((item) => item.controlId), ["public"]);
	assert.ok(registeredWidgetControlAdapters().some((adapter) => adapter.id === "comfy-native-widget"));
});

test("simple ComfyUI nodes expose only built-in primitive widget families", () => {
	let committed = null;
	const node = { widgets: [
		{ name: "steps", type: "INT", value: 20, options: { min: 1, max: 100 }, callback: (value) => { committed = value; } },
		{ name: "cfg", type: "float", value: 7.5, options: { min: 0, max: 20 } },
		{ name: "enabled", type: "BOOLEAN", value: true, options: {} },
		{ name: "prompt", type: "STRING", value: "cat", options: { multiline: true } },
		{ name: "mode", type: "COMBO", value: "fast", options: { values: ["fast", "quality"] } },
	] };
	const controls = listAdaptedWidgetControls(node);
	assert.deepEqual(controls.map(({ controlId, kind }) => [controlId, kind]), [
		["steps", "numeric"], ["cfg", "numeric"], ["enabled", "boolean"], ["prompt", "text"], ["mode", "choice"],
	]);
	controls[0].setValue(24); assert.equal(node.widgets[0].value, 24); assert.equal(committed, 24);
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
	seed.setSeedLocked(true); assert.equal(node.widgets[1].value, "fixed"); assert.equal(seedMode, "fixed");
	seed.setSeedLocked(false); assert.equal(node.widgets[1].value, "randomize"); assert.equal(seedMode, "randomize");
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
