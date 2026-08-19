import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/lib/image_asset_control.js", import.meta.url), "utf8");
const virtualGrid = await readFile(new URL("../js/lib/virtual_grid.js", import.meta.url), "utf8");
const imagePreview = await readFile(new URL("../js/lib/image_preview.js", import.meta.url), "utf8");
const themeControls = await readFile(new URL("../js/lib/theme-controls.css", import.meta.url), "utf8");
const themeLibrary = await readFile(new URL("../js/lib/theme-library.css", import.meta.url), "utf8");

test("image asset cards use bounded thumbnails while hover preview keeps the original", () => {
	assert.match(source, /assignImageSource\(image, reference, \{\s*thumbnail: true/);
	assert.match(source, /assignImageSource\(thumbnail, reference, \{ thumbnail: true/);
	assert.match(source, /resolveImagePreviewSource\(reference/);
	assert.match(source, /const route = imageReferenceViewPath\(normalized\)/);
});

test("transparent thumbnails use the shared checkerboard surface", () => {
	assert.match(themeControls, /\.aa-image-asset-control__thumb,\s*\.aa-image-assets__media\s*\{/);
	assert.match(themeControls, /background-image: conic-gradient\(var\(--aa-image-transparency-tile\)/);
	assert.match(themeControls, /background-size: 12px 12px/);
	assert.match(themeLibrary, /\.aa-image-preview-large \{[^}]*background-image: conic-gradient\(var\(--aa-image-transparency-tile\)/);
});

test("asset hashes use authenticated fetches with bounded Blob URL lifetime", () => {
	assert.match(source, /normalized\.filename\.startsWith\("blake3:"\)/);
	assert.match(source, /api\.fetchApi\(route, \{ signal: controller\.signal \}\)/);
	assert.match(source, /api\.fetchApi\(route, \{ signal \}\)/);
	assert.match(source, /URL\.revokeObjectURL\(state\.objectUrl\)/);
	assert.match(source, /disposeItem: \(element\) => \{/);
	assert.match(virtualGrid, /disposeItem\?\.\(element\)/);
	assert.match(imagePreview, /requestController\?\.abort\(\)/);
	assert.match(imagePreview, /resolved\?\.release\?\.\(\)/);
	assert.match(imagePreview, /media\.addEventListener\(video \? "loadeddata" : "load", \(\) => \{ releaseSource\(\)/);
});

test("image asset scrolling defers new thumbnail requests until motion settles", () => {
	assert.match(source, /results\.addEventListener\("scroll", \(\) => \{\s*scrolling = true/);
	assert.match(source, /querySelectorAll\("img\[data-src\]"\)/);
	assert.match(source, /scrollIdle = setTimeout\(\(\) => \{\s*scrolling = false;\s*loadPendingThumbnails\(\);\s*\}, 120\)/);
	assert.match(source, /onClose: \(\) => \{\s*clearTimeout\(scrollIdle\)/);
});
