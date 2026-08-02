import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");
const helperStart = workspace.indexOf("function ownDataPropertyValue");
const helperEnd = workspace.indexOf("\nfunction graphStructureSignature", helperStart);
assert.notEqual(helperStart, -1, "workspace signature helpers must exist");
assert.notEqual(helperEnd, -1, "workspace signature helper boundary must exist");
const helperSource = workspace.slice(helperStart, helperEnd);
const signatureHelpers = Function(`"use strict"; ${helperSource}; return { widgetOptionSignature, widgetStructureSignature };`)();
const { widgetOptionSignature, widgetStructureSignature } = signatureHelpers;

test("workspace signatures never evaluate accessor-backed widget options", () => {
	let widgetOptionsReads = 0;
	const accessorWidget = {};
	Object.defineProperty(accessorWidget, "options", {
		get() { widgetOptionsReads += 1; return { values: ["unexpected"] }; },
	});
	assert.equal(widgetOptionSignature(accessorWidget), null);
	assert.equal(widgetOptionsReads, 0);

	let valuesReads = 0;
	const dynamicValues = {};
	Object.defineProperty(dynamicValues, "values", {
		get() { valuesReads += 1; return ["unexpected"]; },
	});
	assert.equal(widgetOptionSignature({ options: dynamicValues }), null);
	assert.equal(valuesReads, 0);

	let optionsReads = 0;
	const dynamicOptions = {};
	Object.defineProperty(dynamicOptions, "options", {
		get() { optionsReads += 1; return ["unexpected"]; },
	});
	assert.equal(widgetOptionSignature({ options: dynamicOptions }), null);
	assert.equal(optionsReads, 0);

	let nameReads = 0; let typeReads = 0;
	const promoted = { sourceNodeId: "7", sourceWidgetName: "cfg" };
	Object.defineProperty(promoted, "name", { get() { nameReads += 1; return "cfg"; } });
	Object.defineProperty(promoted, "type", { get() { typeReads += 1; return "number"; } });
	assert.deepEqual(widgetStructureSignature(promoted), ["cfg", null, "7", "cfg", null, null]);
	assert.equal(nameReads, 0); assert.equal(typeReads, 0);
});

test("workspace signatures keep stable own data-property option arrays", () => {
	const values = ["alpha", { value: "beta" }, { label: "gamma" }, 4];
	assert.deepEqual(widgetOptionSignature({ options: { values } }), ["alpha", "beta", "gamma", "4"]);
	assert.deepEqual(widgetOptionSignature({ options: { values } }), ["alpha", "beta", "gamma", "4"]);
	assert.deepEqual(widgetOptionSignature({ options: { options: ["fallback"] } }), ["fallback"]);
});

test("dynamic options refresh by invalidation while graph restores force a sync", () => {
	assert.match(workspace, /window\.addEventListener\(CONTROL_HOST_INVALIDATED_EVENT, \(event\) => \{ invalidateWidgetControlAdapterCache\(event\.detail\?\.node \|\| null\); scheduleRender\("dashboard"\)/);
	assert.match(workspace, /function scheduleGraphSync\(forceRender = false\)/);
	assert.match(workspace, /graphSyncForceRender \|\|= forceRender/);
	assert.match(workspace, /if \(shouldForceRender \|\| signature !== previousGraphStructure\)/);
	assert.match(workspace, /afterConfigureGraph\(\) \{ invalidateWidgetControlAdapterCache\(\); scheduleGraphSync\(true\); \}/);
});
