import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import worker, {
	buildDiscordWebhookPayload,
	callbackResponse,
	configuredWebhookTargets,
	discordFence,
	enforceRateLimit,
	isAllowedOrigin,
} from "../deploy/discord-share-worker/worker.js";

test("relay accepts loopback origins and explicit production origins only", () => {
	const env = { ALLOWED_ORIGINS: "https://comfy.example, https://studio.example" };
	assert.equal(isAllowedOrigin("http://127.0.0.1:8188", env), true);
	assert.equal(isAllowedOrigin("http://localhost:8188", env), true);
	assert.equal(isAllowedOrigin("https://comfy.example", env), true);
	assert.equal(isAllowedOrigin("https://attacker.example", env), false);
	assert.equal(isAllowedOrigin("not-a-url", env), false);
});

test("long prompts stay in one Discord message using bounded fenced embeds", () => {
	const prompt = Array.from({ length: 620 }, (_, index) => `tag_${index}`).join(", ");
	const payload = buildDiscordWebhookPayload({
		image: new File(["image"], "result.png", { type: "image/png" }),
		filename: "result.png",
		prompt,
		authorId: "42",
		width: "1024",
		height: "1536",
	});
	assert.ok(payload.embeds.length > 1);
	assert.ok(payload.embeds.every((embed) => embed.description.length <= 4096));
	assert.ok(payload.embeds.every((embed) => embed.description.startsWith("```\n") && embed.description.endsWith("\n```")));
	assert.ok(payload.embeds.reduce((total, embed) => total + embed.description.length + (embed.footer?.text?.length || 0), 0) <= 6000);
	assert.equal(payload.content, "作者：<@42>");
	assert.deepEqual(payload.allowed_mentions, { users: ["42"] });
	assert.deepEqual(payload.attachments, [{ id: 0, filename: "result.png" }]);
	assert.deepEqual(payload.embeds[0].image, { url: "attachment://result.png" });
	assert.equal(payload.embeds.slice(1).some((embed) => embed.image), false);
});

test("prompts that cannot fit one Discord message fail explicitly", () => {
	assert.throws(
		() => buildDiscordWebhookPayload({ prompt: "x".repeat(6100), authorId: "42" }),
		(error) => error.code === "prompt_too_long" && error.status === 400,
	);
});

test("relay fences neutralize embedded closing fences", () => {
	const block = discordFence("hello ``` world");
	assert.ok(block.startsWith("```\n"));
	assert.ok(block.endsWith("\n```"));
	assert.doesNotMatch(block.slice(4, -4), /```/);
});

test("webhook target configuration rejects invalid entries and keeps URLs server-side", () => {
	const targets = configuredWebhookTargets({
		DISCORD_WEBHOOK_TARGETS: JSON.stringify([
			{ id: "sfw-collection", label: "SFW 串串收集", url: "https://discord.com/api/webhooks/100/token-a", default: true },
			{ id: "nsfw-collection", label: "NSFW 串串收集", url: "https://discord.com/api/webhooks/200/token-b" },
		]),
	});
	assert.deepEqual(targets.map(({ id, label, default: selectedByDefault }) => ({ id, label, default: selectedByDefault })), [
		{ id: "sfw-collection", label: "SFW 串串收集", default: true },
		{ id: "nsfw-collection", label: "NSFW 串串收集", default: false },
	]);
	assert.throws(
		() => configuredWebhookTargets({
			DISCORD_WEBHOOK_TARGETS: JSON.stringify([
				{ id: "duplicate", label: "One", url: "https://discord.com/api/webhooks/100/token-a" },
				{ id: "duplicate", label: "Two", url: "https://discord.com/api/webhooks/200/token-b" },
			]),
		}),
		(error) => error.code === "relay_misconfigured" && error.status === 503,
	);
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

test("authenticated clients receive public targets and multi-target shares use one complete message per channel", async () => {
	const originalFetch = globalThis.fetch;
	const webhookRequests = [];
	let failNsfw = false;
	globalThis.fetch = async (url, options = {}) => {
		const href = String(url);
		if (href.includes("/users/@me/guilds/")) {
			return new Response(JSON.stringify({ roles: [] }), { status: 200, headers: { "content-type": "application/json" } });
		}
		if (href.startsWith("https://discord.com/api/webhooks/")) {
			const payload = JSON.parse(options.body.get("payload_json"));
			webhookRequests.push({ href, payload, image: options.body.get("files[0]") });
			if (failNsfw && href.includes("/200/")) return new Response("channel unavailable", { status: 404 });
			const channelId = href.includes("/100/") ? "channel-100" : "channel-200";
			return new Response(JSON.stringify({ id: `message-${channelId}`, channel_id: channelId, guild_id: "guild" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		throw new Error(`Unexpected fetch: ${href}`);
	};
	const env = {
		DISCORD_CLIENT_ID: "client",
		DISCORD_CLIENT_SECRET: "secret",
		DISCORD_GUILD_ID: "guild",
		DISCORD_WEBHOOK_TARGETS: JSON.stringify([
			{ id: "sfw-collection", label: "SFW 串串收集", url: "https://discord.com/api/webhooks/100/token-a", default: true },
			{ id: "nsfw-collection", label: "NSFW 串串收集", url: "https://discord.com/api/webhooks/200/token-b" },
		]),
		STATE_SECRET: "state-secret",
		SESSIONS: {
			get: async () => ({
				access_token: "access",
				refresh_token: "refresh",
				access_expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: { id: "42", username: "alice" },
			}),
			put: async () => {},
			delete: async () => {},
		},
		SHARE_RATE_LIMITER: { limit: async () => ({ success: true }) },
	};
	try {
		const targetsResponse = await worker.fetch(new Request("https://relay.example/v1/targets", {
			headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
		}), env);
		const publicTargets = await targetsResponse.json();
		assert.equal(targetsResponse.status, 200);
		assert.deepEqual(publicTargets.targets, [
			{ id: "sfw-collection", label: "SFW 串串收集", default: true },
			{ id: "nsfw-collection", label: "NSFW 串串收集", default: false },
		]);
		assert.doesNotMatch(JSON.stringify(publicTargets), /token-a|token-b|webhooks/);

		const form = new FormData();
		form.append("image", new File(["png"], "result.png", { type: "image/png" }));
		form.append("filename", "result.png");
		form.append("prompt", "masterpiece, 1girl");
		form.append("width", "1024");
		form.append("height", "1536");
		form.append("target", "sfw-collection");
		form.append("target", "nsfw-collection");
		const response = await worker.fetch(new Request("https://relay.example/v1/share", {
			method: "POST",
			headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
			body: form,
		}), env);
		const result = await response.json();
		assert.equal(response.status, 200);
		assert.equal(result.ok, true);
		assert.equal(result.target_count, 2);
		assert.equal(result.message_count, 1);
		assert.equal(webhookRequests.length, 2);
		for (const request of webhookRequests) {
			assert.equal(request.payload.content, "作者：<@42>");
			assert.deepEqual(request.payload.allowed_mentions, { users: ["42"] });
			assert.deepEqual(request.payload.attachments, [{ id: 0, filename: "result.png" }]);
			assert.equal(request.payload.embeds.length, 1);
			assert.equal(request.payload.embeds[0].description, "```\nmasterpiece, 1girl\n```");
			assert.deepEqual(request.payload.embeds[0].image, { url: "attachment://result.png" });
			assert.equal(request.image.name, "result.png");
		}

		failNsfw = true;
		webhookRequests.length = 0;
		const retryForm = new FormData();
		retryForm.append("image", new File(["png"], "result.png", { type: "image/png" }));
		retryForm.append("filename", "result.png");
		retryForm.append("prompt", "masterpiece, 1girl");
		retryForm.append("target", "sfw-collection");
		retryForm.append("target", "nsfw-collection");
		const partialResponse = await worker.fetch(new Request("https://relay.example/v1/share", {
			method: "POST",
			headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
			body: retryForm,
		}), env);
		const partial = await partialResponse.json();
		assert.equal(partialResponse.status, 207);
		assert.equal(partial.code, "partial_delivery");
		assert.deepEqual(partial.delivered_targets.map((target) => target.id), ["sfw-collection"]);
		assert.deepEqual(partial.failed_targets, [{ id: "nsfw-collection", label: "NSFW 串串收集" }]);
		assert.equal(webhookRequests.length, 2);
	} finally {
		globalThis.fetch = originalFetch;
	}
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
					DISCORD_WEBHOOK_TARGETS: JSON.stringify([
						{ id: "target", label: "Target", url: "https://discord.com/api/webhooks/100/webhook-secret" },
					]),
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
