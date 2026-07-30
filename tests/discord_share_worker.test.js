import test from "node:test";
import assert from "node:assert/strict";

import {
	callbackResponse,
	discordFence,
	isAllowedOrigin,
	splitDiscordPrompt,
} from "../deploy/discord-share-worker/worker.js";

test("relay accepts loopback origins and explicit production origins only", () => {
	const env = { ALLOWED_ORIGINS: "https://comfy.example, https://studio.example" };
	assert.equal(isAllowedOrigin("http://127.0.0.1:8188", env), true);
	assert.equal(isAllowedOrigin("http://localhost:8188", env), true);
	assert.equal(isAllowedOrigin("https://comfy.example", env), true);
	assert.equal(isAllowedOrigin("https://attacker.example", env), false);
	assert.equal(isAllowedOrigin("not-a-url", env), false);
});

test("long prompts split into bounded fenced Discord messages", () => {
	const prompt = Array.from({ length: 1500 }, (_, index) => `tag_${index}`).join(", ");
	const chunks = splitDiscordPrompt(prompt, 4000);
	assert.ok(chunks.length > 1);
	assert.ok(chunks.every((chunk) => chunk.length <= 4000));
	assert.ok(chunks.every((chunk) => discordFence(chunk).length <= 4096));
});

test("relay fences neutralize embedded closing fences", () => {
	const block = discordFence("hello ``` world");
	assert.ok(block.startsWith("```\n"));
	assert.ok(block.endsWith("\n```"));
	assert.doesNotMatch(block.slice(4, -4), /```/);
});

test("OAuth results stay on the relay and post only to the exact ComfyUI opener", async () => {
	const response = callbackResponse("http://127.0.0.1:8188", "nonce-1", { ok: true, token: "secret-session" });
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("location"), null);
	const html = await response.text();
	assert.ok(html.includes("window.opener.postMessage(result, targetOrigin)"));
	assert.ok(html.includes("http://127.0.0.1:8188"));
	assert.ok(html.includes("secret-session"));
	assert.ok(!html.includes("aaalice/discord-share/auth-complete"));
});
