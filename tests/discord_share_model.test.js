import test from "node:test";
import assert from "node:assert/strict";

import {
	collectExecutionImages,
	createShareSnapshot,
	discordPromptBlock,
	normalizeSharePrompt,
	normalizeDiscordShareWorkflowState,
	normalizeSharePlacement,
} from "../js/lib/discord_share_model.js";

test("share placement defaults to the sidebar and accepts the three stable values", () => {
	assert.equal(normalizeSharePlacement("sidebar"), "sidebar");
	assert.equal(normalizeSharePlacement("topbar"), "topbar");
	assert.equal(normalizeSharePlacement("hidden"), "hidden");
	assert.equal(normalizeSharePlacement("permanently-hidden"), "sidebar");
});

test("share prompt edits normalize line endings and surrounding whitespace", () => {
	assert.equal(normalizeSharePrompt("  one\r\ntwo  "), "one\ntwo");
	assert.equal(normalizeSharePrompt(" \n\t"), "");
});

test("workflow prompt binding is normalized without execution output data", () => {
	assert.deepEqual(normalizeDiscordShareWorkflowState({
		promptSource: { graphId: 12, nodeId: 8, label: "Positive" },
		latestImages: ["must-not-survive"],
	}), {
		version: 1,
		promptSource: { graphId: "12", nodeId: "8", label: "Positive" },
	});
});

test("execution images retain order and remove duplicate references", () => {
	const outputs = {
		"4": { images: [
			{ filename: "a.png", subfolder: "", type: "output" },
			{ filename: "a.png", subfolder: "", type: "output" },
		] },
		"9": { images: [{ filename: "b.png", subfolder: "upscale", type: "output" }] },
	};
	assert.deepEqual(collectExecutionImages(outputs), [
		{ filename: "a.png", subfolder: "", type: "output", executionId: "4" },
		{ filename: "b.png", subfolder: "upscale", type: "output", executionId: "9" },
	]);
});

test("latest-run snapshot selects prompt text from the bound Preview Any node", () => {
	const nodes = {
		"4": { id: 4, graph: { id: null } },
		"22:7": { id: 7, graph: { id: "subgraph-a" } },
	};
	const snapshot = createShareSnapshot({
		promptId: "prompt-1",
		outputs: {
			"4": { images: [{ filename: "a.png", type: "output" }] },
			"22:7": { text: ["1girl", "blue eyes"] },
		},
		promptBinding: { graphId: "subgraph-a", nodeId: "7", label: "Positive" },
		resolveNode: (executionId) => nodes[executionId],
		completedAt: 123,
	});
	assert.equal(snapshot.prompt, "1girl\n\nblue eyes");
	assert.equal(snapshot.images.length, 1);
	assert.equal(snapshot.completedAt, 123);
});

test("Discord prompt blocks preserve fencing even when the prompt contains a fence", () => {
	const block = discordPromptBlock("a ``` b");
	assert.ok(block.startsWith("```\n"));
	assert.ok(block.endsWith("\n```"));
	assert.doesNotMatch(block.slice(4, -4), /```/);
});
