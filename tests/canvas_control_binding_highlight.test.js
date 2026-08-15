import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStyleEntry } from "./helpers/style_source.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const highlight = readFileSync(join(ROOT, "js", "lib", "canvas_control_binding_highlight.js"), "utf8");
const marker = readFileSync(join(ROOT, "js", "lib", "canvas_widget_marker.js"), "utf8");
const rowMapping = readFileSync(join(ROOT, "js", "lib", "canvas_widget_row_mapping.js"), "utf8");
const providers = readFileSync(join(ROOT, "js", "lib", "control_providers.js"), "utf8");
const workspace = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");
const theme = readStyleEntry(new URL("../js/lib/theme.css", import.meta.url));

test("sidebar bindings highlight the exact native or promoted canvas widget", () => {
	assert.match(providers, /node, widget: adapted\.widget, control: adapted\.control/);
	assert.match(highlight, /\["generic-widget", "subgraph-widget"\]/);
	assert.match(highlight, /resolved\.widget \|\|/);
	assert.match(marker, /getOutlineColor/);
	assert.match(highlight, /CANVAS_BINDING_COLOR = \"#a855f7\"/);
	assert.doesNotMatch(highlight, /WIDGET_PROMOTED_OUTLINE_COLOR/);
	assert.match(marker, /if \(typeof widget\.draw === \"function\"\)/);
	assert.match(marker, /Legacy\/custom widgets own their draw path and may ignore getOutlineColor/);
	assert.match(marker, /markerIntact\(widget, existing\)/);
	assert.match(marker, /drawProjectedWidgets\(args\[0\], this, state\.widgets\)/);
	assert.match(marker, /const isLayoutBacked = Number\.isFinite\(widgetMargin\)/);
	assert.match(highlight, /canvasWidgetMarkers\.sync\(allTargets\)/);
	assert.match(highlight, /node\.graph === app\.canvas\?\.graph/);
	assert.match(highlight, /lastResolution\?\.key === structureToken && lastResolution\.model === model/);
	assert.match(highlight, /export function invalidateCanvasControlBindingResolution\(\) \{\s*lastResolution = null;/);
	assert.match(highlight, /data-testid=\\?\"node-widgets/);
	assert.match(highlight, /DOM_BOUND_CLASS/);
	assert.match(highlight, /mapCanvasWidgetRows\(rows, candidates\)/);
	assert.match(highlight, /name\.startsWith\("\$\$"\)/);
	assert.match(highlight, /if \(!widget\?\.type \|\| options\.canvasOnly \|\| options\.hidden \|\| isPromotedCanvasOnlyWidget\(widget\)\) return false;/);
	assert.match(highlight, /app\.canvas\?\.setDirty\?\.\(true, true\)/);
	assert.match(highlight, /rootObserver\.observe\(root, \{ childList: true, subtree: true \}\)/);
	assert.match(highlight, /typeof liteGraphMode === "boolean"/);
	assert.doesNotMatch(highlight, /let domMode = null/);
	assert.doesNotMatch(highlight, /list\.length === rows\.length/);
	assert.match(rowMapping, /host's visibility, deduplication, and canvas-only processing/);
	assert.match(theme, /--p-purple-500, #a855f7/);
	assert.match(theme, /\.lg-node-widget\.aaalice-sidebar-bound-widget/);
});

test("canvas binding highlights reconcile on structure, host invalidation, and graph navigation", () => {
	assert.match(workspace, /if \(shouldForceRender \|\| signature !== previousGraphStructure\) \{ previousGraphStructure = signature; scheduleCanvasControlBindingSync\(\);/);
	assert.match(workspace, /CONTROL_HOST_INVALIDATED_EVENT, \(event\) => \{[\s\S]*if \(!dashboardUsesHost\(node\)\) return;[\s\S]*scheduleRender\("dashboard"\); scheduleCanvasControlBindingSync\(\{ force: true \}\);/);
	assert.match(workspace, /canvas\.addEventListener\("litegraph:set-graph", \(\) => \{[\s\S]*invalidateWidgetControlAdapterCache\(\);[\s\S]*scheduleCanvasControlBindingSync\(\);/);
	assert.match(workspace, /installCanvasBindingNavigationSync\(\)/);
	assert.match(workspace, /function installCanvasBindingModeSync\(\)/);
	assert.match(workspace, /Comfy\.VueNodes\.Enabled\.change/);
	assert.match(workspace, /installCanvasBindingModeSync\(\)/);
	assert.doesNotMatch(highlight, /setInterval\(/);
});
