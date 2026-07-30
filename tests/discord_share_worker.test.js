import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import worker, {
	callbackResponse,
	discordFence,
	enforceRateLimit,
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

test("share rate limiting uses the Discord user identity without KV writes", async () => {
	const calls = [];
	let kvTouched = false;
	const env = {
		SHARE_RATE_LIMITER: {
			limit: async (input) => {
				calls.push(input);
				return { success: true };
			},
		},
		SESSIONS: {
			get: async () => { kvTouched = true; },
			put: async () => { kvTouched = true; },
		},
	};

	await enforceRateLimit(env, "discord-user-42");

	assert.deepEqual(calls, [{ key: "discord-user:discord-user-42" }]);
	assert.equal(kvTouched, false);
});

test("share rate limit rejection gives a clear retry contract", async () => {
	const env = {
		SHARE_RATE_LIMITER: { limit: async () => ({ success: false }) },
	};

	await assert.rejects(
		enforceRateLimit(env, "42"),
		(error) => {
			assert.equal(error.code, "rate_limited");
			assert.equal(error.status, 429);
			assert.equal(error.headers["retry-after"], "60");
			assert.deepEqual(error.details, { retry_after_seconds: 60 });
			assert.match(error.message, /60 seconds/);
			return true;
		},
	);
});

test("rate limiter failures do not silently bypass abuse protection", async () => {
	const cause = new Error("binding unavailable");
	const env = {
		SHARE_RATE_LIMITER: { limit: async () => { throw cause; } },
	};

	await assert.rejects(
		enforceRateLimit(env, "42"),
		(error) => {
			assert.equal(error.code, "rate_limiter_unavailable");
			assert.equal(error.status, 503);
			assert.equal(error.cause, cause);
			assert.match(error.message, /temporarily unavailable/);
			return true;
		},
	);
});

test("Worker configuration binds native rate limiting and has no KV rate counter variable", () => {
	const config = readFileSync(
		new URL("../deploy/discord-share-worker/wrangler.toml.example", import.meta.url),
		"utf8",
	);
	assert.match(config, /\[\[ratelimits\]\][\s\S]*name = "SHARE_RATE_LIMITER"/);
	assert.match(config, /\[ratelimits\.simple\][\s\S]*limit = 5[\s\S]*period = 60/);
	assert.doesNotMatch(config, /RATE_LIMIT_PER_MINUTE/);
});

test("missing relay bindings return an actionable service error without exposing secret values", async () => {
	const originalConsoleError = console.error;
	console.error = () => {};
	try {
		const response = await worker.fetch(
			new Request("https://relay.example/v1/session", {
				headers: { Origin: "http://127.0.0.1:8188" },
			}),
			{
				DISCORD_CLIENT_ID: "client",
				DISCORD_CLIENT_SECRET: "secret-value",
				DISCORD_GUILD_ID: "guild",
				DISCORD_WEBHOOK_URL: "https://discord.example/webhook-secret",
				STATE_SECRET: "state-secret",
				SESSIONS: {},
			},
		);
		const payload = await response.json();
		assert.equal(response.status, 503);
		assert.equal(payload.code, "relay_misconfigured");
		assert.match(payload.message, /contact the server administrator/i);
		assert.doesNotMatch(JSON.stringify(payload), /secret-value|webhook-secret|state-secret/);
	} finally {
		console.error = originalConsoleError;
	}
});
