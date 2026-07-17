import test from "node:test";
import assert from "node:assert/strict";

import { collectionDisplayName, DEFAULT_COLLECTION_ID, isDefaultCollection } from "../js/lib/collection.js";

test("default favorite folder keeps a stable protocol identity and localized display name", () => {
	const defaultFolder = { id: DEFAULT_COLLECTION_ID, name: "Favorites" };
	assert.equal(isDefaultCollection(defaultFolder), true);
	assert.equal(collectionDisplayName(defaultFolder, "默认收藏夹"), "默认收藏夹");
	assert.equal(collectionDisplayName({ id: "custom", name: "人物" }, "默认收藏夹"), "人物");
});
