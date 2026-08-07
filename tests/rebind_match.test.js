import test from "node:test";
import assert from "node:assert/strict";
import { bindingLabelScore, bestRebindMatch } from "../js/lib/rebind_match.js";

test("bindingLabelScore scores exact, containment, and unrelated labels", () => {
	assert.equal(bindingLabelScore("seed", "seed"), 1000);
	assert.equal(bindingLabelScore("Seed", "SEED"), 1000);
	assert.ok(bindingLabelScore("随机种子 seed", "seed") > 700);
	assert.ok(bindingLabelScore("cfg", "cfg scale") > 700);
	assert.ok(bindingLabelScore("cfg scale", "cfg") > 700);
	assert.equal(bindingLabelScore("a", "abc"), 0);
	assert.equal(bindingLabelScore("seed", "steps"), 0);
	assert.equal(bindingLabelScore("", "seed"), 0);
});

test("bestRebindMatch prefers the unique exact identity match", () => {
	const match = bestRebindMatch({ preferredLabel: "seed", identityLabel: "seed" }, [
		{ title: "steps", description: "KSampler", identityLabel: "steps" },
		{ title: "seed", description: "KSampler", identityLabel: "seed" },
	]);
	assert.deepEqual(match, { index: 1, score: 1000, exact: true });
});

test("bestRebindMatch marks duplicate exact matches as non-unique", () => {
	const match = bestRebindMatch({ preferredLabel: "seed", identityLabel: "seed" }, [
		{ title: "seed", description: "KSampler (1)", identityLabel: "seed" },
		{ title: "seed", description: "KSampler (2)", identityLabel: "seed" },
	]);
	assert.equal(match.score, 1000);
	assert.equal(match.exact, false);
});

test("bestRebindMatch breaks identical-title ties with the original node title", () => {
	const match = bestRebindMatch({ preferredLabel: "KSampler", identityLabel: "seed" }, [
		{ title: "seed", description: "Other Node", identityLabel: "seed" },
		{ title: "seed", description: "KSampler", identityLabel: "seed" },
	]);
	assert.equal(match.index, 1);
});

test("bestRebindMatch returns null when nothing matches", () => {
	assert.equal(bestRebindMatch({ preferredLabel: "sampler", identityLabel: "sampler" }, [
		{ title: "steps", description: "KSampler", identityLabel: "steps" },
	]), null);
	assert.equal(bestRebindMatch({ preferredLabel: "x", identityLabel: "x" }, []), null);
});
