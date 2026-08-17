import assert from "node:assert/strict";
import test from "node:test";

import { createRandomGallerySession, randomPostKey, secureShuffle } from "../js/lib/booru_gallery_random.js";

const post = (source, postId) => ({ source, postId });

test("secure shuffle uses unbiased rejection sampling and does not mutate its input", () => {
	const values = ["a", "b", "c"];
	const randomValues = [0xffffffff, 1, 0];
	const shuffled = secureShuffle(values, () => randomValues.shift());
	assert.deepEqual(shuffled, ["c", "a", "b"]);
	assert.deepEqual(values, ["a", "b", "c"]);
	assert.equal(randomValues.length, 0, "the out-of-range uint32 must be rejected");
});

test("random sessions deduplicate draw and near-end batches until mode or scope changes", () => {
	const session = createRandomGallerySession();
	const first = [post("danbooru", 1), post("danbooru", 2), post("gelbooru", 1)];
	assert.equal(session.sync(true, "scope-a"), true);
	assert.deepEqual(new Set(session.take(first).map(randomPostKey)), new Set(["danbooru:1", "danbooru:2", "gelbooru:1"]));
	assert.equal(session.seenCount, 3);
	assert.deepEqual(session.take(first), []);
	assert.deepEqual(session.take([post("danbooru", 2), post("danbooru", 3)]).map(randomPostKey), ["danbooru:3"], "near-end batches keep only unseen posts");
	assert.equal(session.sync(true, "scope-a"), false);
	assert.deepEqual(session.take([post("danbooru", 2)]), []);
	assert.equal(session.sync(true, "scope-b"), true);
	assert.deepEqual(session.take([post("danbooru", 2)]).map(randomPostKey), ["danbooru:2"]);
	assert.equal(session.sync(false, "scope-b"), true);
	const sequential = [post("danbooru", 2), post("danbooru", 2)];
	assert.equal(session.take(sequential), sequential, "sequential mode keeps the existing pagination contract");
});
