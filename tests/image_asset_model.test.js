import test from "node:test";
import assert from "node:assert/strict";

import { collectImageAssetCandidates, imageAssetKey } from "../js/lib/image_asset_model.js";

test("image assets merge imported and generated sources without duplicates", () => {
	const assets = collectImageAssetCandidates({
		values: ["refs/cat.png", "renders/dog.png [output]"],
		inputFiles: ["refs/cat.png", "portrait.webp"],
		history: {
			one: { preview_output: { filename: "dog.png", subfolder: "renders", type: "output" } },
			two: { outputs: { "7": { images: [{ filename: "draft.png", subfolder: "", type: "temp" }] } } },
		},
	});
	assert.deepEqual(assets.map((asset) => [asset.reference.filename, asset.source]), [
		["cat.png", "inputs"],
		["dog.png", "outputs"],
		["portrait.webp", "inputs"],
		["draft.png", "outputs"],
	]);
});

test("image assets keep a stale current selection and ignore non-images", () => {
	const assets = collectImageAssetCandidates({
		inputFiles: ["notes.txt"],
		history: { one: { preview_output: { filename: "data.json", type: "output" } } },
		current: { filename: "missing image.png", subfolder: "refs", type: "input" },
	});
	assert.equal(assets.length, 1);
	assert.equal(assets[0].label, "missing image.png");
	assert.equal(imageAssetKey(assets[0].reference), "input\0refs\0missing image.png");
});
