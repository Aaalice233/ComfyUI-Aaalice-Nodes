import test from "node:test";
import assert from "node:assert/strict";

import {
	collectExecutionImages,
	createShareSnapshot,
	discordPromptBlock,
	normalizeSharePrompt,
	normalizeDiscordShareWorkflowState,
	normalizeSharePlacement,
	preferredShareImageIndex,
} from "../js/lib/discord_share_model.js";
import {
	LARGE_IMAGE_NOTICE_BYTES,
	compressedShareFilename,
	formatShareBytes,
	shouldOfferShareCompression,
} from "../js/lib/discord_share_image_prepare.js";

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

test("live execution order remains authoritative when numeric node ids finish out of order", () => {
	const outputs = new Map([
		["20", { images: [{ filename: "first.png", type: "output" }] }],
		["3", { images: [{ filename: "latest.png", type: "output" }] }],
	]);
	assert.deepEqual(collectExecutionImages(outputs).map((image) => image.filename), ["first.png", "latest.png"]);
});

test("default share image prefers the largest result and uses the latest result for equal sizes", () => {
	assert.equal(preferredShareImageIndex([
		{ width: 1024, height: 1024 },
		{ width: 2048, height: 2048 },
		{ width: 1536, height: 1536 },
	]), 1);
	assert.equal(preferredShareImageIndex([
		{ width: 1024, height: 1024 },
		{ width: 1024, height: 1024 },
	]), 1);
	assert.equal(preferredShareImageIndex([{ width: 0, height: 0 }, { width: 0, height: 0 }]), 1);
});

test("large image preparation offers optional compression without treating 20 MiB as a hard limit", () => {
	assert.equal(shouldOfferShareCompression(LARGE_IMAGE_NOTICE_BYTES), false);
	assert.equal(shouldOfferShareCompression(LARGE_IMAGE_NOTICE_BYTES + 1), true);
	assert.equal(formatShareBytes(21 * 1024 * 1024), "21.0 MB");
	assert.equal(compressedShareFilename("render.final.png"), "render.final-compressed.webp");
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
