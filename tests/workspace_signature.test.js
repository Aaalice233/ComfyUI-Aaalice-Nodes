import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { graphSyncSignature, widgetOptionSignature, widgetStructureSignature } from "../js/workspace/graph_signature.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");

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
	assert.deepEqual(widgetStructureSignature(promoted), ["cfg", null, "7", "cfg", null, null, null]);
	assert.equal(nameReads, 0); assert.equal(typeReads, 0);

	// 新协议宿主投影：name/type 是 store 访问器，身份只能读自有的 widgetId。
	let projectedNameReads = 0;
	const projected = {};
	Object.defineProperty(projected, "name", { get() { projectedNameReads += 1; return "seed"; } });
	Object.defineProperty(projected, "widgetId", { value: "graph-1:3:seed", enumerable: false });
	assert.deepEqual(widgetStructureSignature(projected), [null, null, null, null, null, "graph-1:3:seed", null]);
	assert.equal(projectedNameReads, 0);
});

test("workspace signatures keep stable own data-property option arrays", () => {
	const values = ["alpha", { value: "beta" }, { label: "gamma" }, 4];
	assert.deepEqual(widgetOptionSignature({ options: { values } }), ["alpha", "beta", "gamma", "4"]);
	assert.deepEqual(widgetOptionSignature({ options: { values } }), ["alpha", "beta", "gamma", "4"]);
	assert.deepEqual(widgetOptionSignature({ options: { options: ["fallback"] } }), ["fallback"]);
});

test("preset snapshot writes do not masquerade as dashboard structure changes", () => {
	const nodes = [{ id: 1, type: "Example", properties: { host: "host-1" }, widgets: [] }];
	const options = { hostIdProperty: "host", dashboardKey: "dashboard" };
	const initial = graphSyncSignature(nodes, { dashboard: { version: 4 }, presets: { revision: 1 } }, options);
	const presetOnly = graphSyncSignature(nodes, { dashboard: { version: 4 }, presets: { revision: 2 } }, options);
	const layoutChange = graphSyncSignature(nodes, { dashboard: { version: 4, pages: [{}] }, presets: { revision: 2 } }, options);
	assert.equal(presetOnly, initial);
	assert.notEqual(layoutChange, initial);
});

test("dynamic options refresh by invalidation while graph restores force a sync", () => {
	assert.match(workspace, /window\.addEventListener\(CONTROL_HOST_INVALIDATED_EVENT, \(event\) => \{[\s\S]*invalidateWidgetControlAdapterCache\(node\);[\s\S]*if \(!dashboardUsesHost\(node\)\) return;[\s\S]*scheduleRender\("dashboard"\)/);
	assert.match(workspace, /function scheduleGraphSync\(forceRender = false\)/);
	assert.match(workspace, /signature !== previousGraphStructure[\s\S]*else scheduleDashboardPresetViewSync\(\)/);
	assert.match(workspace, /graphSyncForceRender \|\|= forceRender/);
	assert.match(workspace, /if \(shouldForceRender \|\| signature !== previousGraphStructure\)/);
	assert.match(workspace, /afterConfigureGraph\(\) \{ invalidateWidgetControlAdapterCache\(\); scheduleGraphSync\(true\); \}/);
});
