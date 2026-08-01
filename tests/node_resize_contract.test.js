import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const extension = readFileSync(new URL("../js/extension.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../js/node_resize.js", import.meta.url), "utf8");

test("package entry installs shared node resize support", () => {
	assert.match(extension, /import "\.\/node_resize\.js"/);
	assert.match(source, /name: "ComfyUI\.Aaalice\.NodeResize"/);
	assert.match(source, /nodeCreated\(node\)/);
	assert.match(source, /loadedGraphNode\(node\)/);
	assert.match(source, /allGraphNodes\(app\.graph\)/);
});

test("native-widget nodes release the complete Classic resize corner", () => {
	for (const name of ["GroupIsEnabled", "SimpleNotify", "SimpleStringSplit"]) {
		assert.match(source, new RegExp(`NATIVE_WIDGET_NODES[\\s\\S]*"${name}"`));
	}
	assert.match(source, /installDomWidgetResizePassthrough\(node\)/);
	assert.match(source, /cleanupDomWidgetResizePassthrough\(this\)/);
});

test("pinned nodes remain intentionally non-resizable", () => {
	assert.match(source, /if \(!node\.pinned && node\.resizable === false\) node\.resizable = true/);
	assert.doesNotMatch(source, /node\.pinned\s*=\s*false/);
});
