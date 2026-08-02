import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const highlight = readFileSync(join(ROOT, "js", "lib", "canvas_control_binding_highlight.js"), "utf8");
const providers = readFileSync(join(ROOT, "js", "lib", "control_providers.js"), "utf8");
const workspace = readFileSync(join(ROOT, "js", "workspace.js"), "utf8");
const theme = readFileSync(join(ROOT, "js", "lib", "theme.css"), "utf8");

test("sidebar bindings highlight the exact native or promoted canvas widget", () => {
	assert.match(providers, /node, widget: adapted\.widget, control: adapted\.control/);
	assert.match(highlight, /\["generic-widget", "subgraph-widget"\]/);
	assert.match(highlight, /resolved\.widget \|\|/);
	assert.match(highlight, /getOutlineColor/);
	assert.match(highlight, /CANVAS_BINDING_COLOR = \"#a855f7\"/);
	assert.doesNotMatch(highlight, /WIDGET_PROMOTED_OUTLINE_COLOR/);
	assert.match(highlight, /if \(!installed && typeof widget\.draw === \"function\"\)/);
	assert.match(highlight, /data-testid=\\?\"node-widgets/);
	assert.match(highlight, /DOM_BOUND_CLASS/);
	assert.match(theme, /--p-purple-500, #a855f7/);
	assert.match(theme, /\.lg-node-widget\.aaalice-sidebar-bound-widget/);
});

test("canvas binding highlights reconcile only on structural or host invalidation events", () => {
	assert.match(workspace, /if \(shouldForceRender \|\| signature !== previousGraphStructure\) \{ previousGraphStructure = signature; scheduleCanvasControlBindingSync\(\);/);
	assert.match(workspace, /CONTROL_HOST_INVALIDATED_EVENT, \(event\) => \{ invalidateWidgetControlAdapterCache\(event\.detail\?\.node \|\| null\); scheduleRender\("dashboard"\); scheduleCanvasControlBindingSync\(\);/);
	assert.doesNotMatch(highlight, /setInterval\(/);
});
