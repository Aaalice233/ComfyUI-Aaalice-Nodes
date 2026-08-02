import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import worker, {
	DEFAULT_UPLOAD_LIMIT,
	buildDiscordWebhookPayloads,
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

test("relay defaults to a 20 MiB image limit and reports exact upload bounds", async () => {
	assert.equal(DEFAULT_UPLOAD_LIMIT, 20 * 1024 * 1024);

	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (url) => {
		if (String(url).includes("/users/@me/guilds/")) {
			return new Response(JSON.stringify({ roles: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		throw new Error(`Unexpected fetch: ${url}`);
	};
	const env = {
		DISCORD_CLIENT_ID: "client",
		DISCORD_CLIENT_SECRET: "secret",
		DISCORD_GUILD_ID: "guild",
		DISCORD_WEBHOOK_TARGETS: JSON.stringify([
			{ id: "target", label: "Target", url: "https://discord.com/api/webhooks/100/token" },
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
		MAX_UPLOAD_BYTES: "1024",
	};
	try {
		const form = new FormData();
		form.append("image", new File([new Uint8Array(1025)], "large.png", { type: "image/png" }));
		form.append("prompt", "masterpiece");
		const response = await worker.fetch(new Request("https://relay.example/v1/share", {
			method: "POST",
			headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
			body: form,
		}), env);
		const payload = await response.json();
		assert.equal(response.status, 413);
		assert.equal(payload.code, "image_too_large");
		assert.equal(payload.image_bytes, 1025);
		assert.equal(payload.max_upload_bytes, 1024);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("inline long prompts become consecutive bounded messages with the image last", () => {
	const prompt = Array.from({ length: 620 }, (_, index) => `tag_${index}`).join(", ");
	const payloads = buildDiscordWebhookPayloads({
		image: new File(["image"], "result.png", { type: "image/png" }),
		filename: "result.png",
			prompt,
			authorId: "42",
			authorName: "Alice",
			authorAvatarUrl: "https://cdn.discordapp.com/avatars/42/avatar.png?size=128",
			width: "1024",
		height: "1536",
		longPromptAsFile: false,
	});
	assert.ok(payloads.length > 1);
	assert.ok(payloads.every((payload) => payload.embeds.length === 1));
	assert.ok(payloads.every((payload) => payload.embeds[0].description.length <= 4096));
	assert.ok(payloads.every((payload) => payload.embeds[0].description.startsWith("```\n") && payload.embeds[0].description.endsWith("\n```")));
	assert.ok(payloads.every((payload) => payload.embeds[0].description.length + (payload.embeds[0].footer?.text?.length || 0) <= 6000));
	assert.equal(payloads.some((payload) => payload.content), false);
	assert.deepEqual(payloads[0].embeds[0].author, {
		name: "作者：Alice",
		url: "https://discord.com/users/42",
		icon_url: "https://cdn.discordapp.com/avatars/42/avatar.png?size=128",
	});
	assert.equal(payloads.slice(1).some((payload) => payload.embeds.some((embed) => embed.author)), false);
	assert.ok(payloads.slice(0, -1).every((payload) => payload.attachments.length === 0));
	assert.ok(payloads.slice(0, -1).every((payload) => payload.embeds.every((embed) => !embed.image)));
	assert.deepEqual(payloads.at(-1).attachments, [{ id: 0, filename: "result.png" }]);
	assert.deepEqual(payloads.at(-1).embeds[0].image, { url: "attachment://result.png" });
});

test("pathological inline prompts fail only after exceeding the safe multi-message bound", () => {
	assert.throws(
		() => buildDiscordWebhookPayloads({ prompt: "x".repeat(40_881), authorId: "42", longPromptAsFile: false }),
		(error) => error.code === "prompt_too_long"
			&& error.status === 400
			&& error.details.max_inline_messages === 10,
	);
});

test("long prompt file mode keeps regular prompts inline and moves only oversized prompts to TXT", () => {
	const [shortPayload] = buildDiscordWebhookPayloads({ prompt: "masterpiece, 1girl", authorId: "42" });
	assert.equal(shortPayload.embeds[0].description, "```\nmasterpiece, 1girl\n```");
	assert.deepEqual(shortPayload.attachments, []);

	const [readableLongPayload] = buildDiscordWebhookPayloads({
		prompt: "x".repeat(1501),
		authorId: "42",
	});
	assert.equal(readableLongPayload.content, "📄 正面提示词较长，已作为文件附加。");
	assert.deepEqual(readableLongPayload.attachments, [{ id: 0, filename: "positive-prompt.txt" }]);

	const [longPayload] = buildDiscordWebhookPayloads({
		image: new File(["image"], "result.png", { type: "image/png" }),
		filename: "result.png",
			prompt: "x".repeat(4500),
			authorId: "42",
			authorName: "Alice",
			authorAvatarUrl: "https://cdn.discordapp.com/avatars/42/avatar.png?size=128",
	});
	assert.equal(longPayload.content, "📄 正面提示词较长，已作为文件附加。");
	assert.equal(longPayload.allowed_mentions, undefined);
	assert.deepEqual(longPayload.attachments, [
		{ id: 0, filename: "result.png" },
		{ id: 1, filename: "positive-prompt.txt" },
	]);
		assert.equal(longPayload.embeds.length, 1);
		assert.equal(longPayload.embeds[0].description, undefined);
		assert.deepEqual(longPayload.embeds[0].author, {
			name: "作者：Alice",
			url: "https://discord.com/users/42",
			icon_url: "https://cdn.discordapp.com/avatars/42/avatar.png?size=128",
		});
	assert.deepEqual(longPayload.embeds[0].image, { url: "attachment://result.png" });
	assert.throws(
		() => buildDiscordWebhookPayloads({ prompt: "x".repeat((1024 * 1024) + 1), authorId: "42" }),
		(error) => error.code === "prompt_file_too_large" && error.status === 413,
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
				{ id: "generation-chat", label: "跑图交流", url: "https://discord.com/api/webhooks/300/token-c", prefer_prompt_file: true },
			]),
		});
	assert.deepEqual(targets.map(({ id, label, default: selectedByDefault, prefer_prompt_file }) => ({ id, label, default: selectedByDefault, prefer_prompt_file })), [
		{ id: "sfw-collection", label: "SFW 串串收集", default: true, prefer_prompt_file: false },
		{ id: "nsfw-collection", label: "NSFW 串串收集", default: false, prefer_prompt_file: false },
		{ id: "generation-chat", label: "跑图交流", default: false, prefer_prompt_file: true },
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

test("authenticated clients receive public targets and multi-target shares keep complete ordered sequences", async () => {
	const originalFetch = globalThis.fetch;
	const webhookRequests = [];
	const deletedMessages = [];
	let failNsfw = false;
	let sfwPostCount = 0;
	let failSfwPostAt = null;
	globalThis.fetch = async (url, options = {}) => {
		const href = String(url);
		if (href.includes("/users/@me/guilds/")) {
			return new Response(JSON.stringify({ roles: [] }), { status: 200, headers: { "content-type": "application/json" } });
		}
		if (href.startsWith("https://discord.com/api/webhooks/")) {
			if (options.method === "DELETE") {
				deletedMessages.push(href);
				return new Response(null, { status: 204 });
			}
			const multipart = options.body instanceof FormData;
			const payload = multipart
				? JSON.parse(options.body.get("payload_json"))
				: JSON.parse(options.body);
			webhookRequests.push({
				href,
				payload,
				image: multipart ? options.body.get("files[0]") : null,
				promptFile: multipart ? options.body.get("files[1]") : null,
			});
			if (failNsfw && href.includes("/200/")) return new Response("channel unavailable", { status: 404 });
			if (href.includes("/100/")) {
				sfwPostCount += 1;
				if (sfwPostCount === failSfwPostAt) return new Response("temporary webhook failure", { status: 500 });
			}
			const channelId = href.includes("/100/") ? "channel-100" : href.includes("/200/") ? "channel-200" : "channel-300";
			return new Response(JSON.stringify({ id: `message-${channelId}-${webhookRequests.length}`, channel_id: channelId, guild_id: "guild" }), {
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
			{ id: "generation-chat", label: "跑图交流", url: "https://discord.com/api/webhooks/300/token-c", prefer_prompt_file: true },
		]),
		STATE_SECRET: "state-secret",
		SESSIONS: {
			get: async () => ({
				access_token: "access",
				refresh_token: "refresh",
				access_expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: {
					id: "42",
					username: "alice",
					global_name: "Alice",
					avatar: "https://cdn.discordapp.com/avatars/42/avatar.png?size=128",
				},
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
			{ id: "sfw-collection", label: "SFW 串串收集", default: true, prefer_prompt_file: false },
			{ id: "nsfw-collection", label: "NSFW 串串收集", default: false, prefer_prompt_file: false },
			{ id: "generation-chat", label: "跑图交流", default: false, prefer_prompt_file: true },
		]);
		assert.doesNotMatch(JSON.stringify(publicTargets), /token-a|token-b|token-c|webhooks/);

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
			assert.equal(request.payload.content, undefined);
			assert.equal(request.payload.allowed_mentions, undefined);
			assert.deepEqual(request.payload.attachments, [{ id: 0, filename: "result.png" }]);
			assert.equal(request.payload.embeds.length, 1);
			assert.equal(request.payload.embeds[0].description, "```\nmasterpiece, 1girl\n```");
			assert.deepEqual(request.payload.embeds[0].author, {
				name: "作者：Alice",
				url: "https://discord.com/users/42",
				icon_url: "https://cdn.discordapp.com/avatars/42/avatar.png?size=128",
			});
			assert.deepEqual(request.payload.embeds[0].image, { url: "attachment://result.png" });
			assert.equal(request.image.name, "result.png");
			assert.equal(request.promptFile, null);
		}

		webhookRequests.length = 0;
		const longPrompt = "x".repeat(4500);
		const fileForm = new FormData();
		fileForm.append("image", new File(["png"], "result.png", { type: "image/png" }));
		fileForm.append("filename", "result.png");
		fileForm.append("prompt", longPrompt);
		fileForm.append("target", "generation-chat");
		fileForm.append("long_prompt_as_file", "true");
		const fileResponse = await worker.fetch(new Request("https://relay.example/v1/share", {
			method: "POST",
			headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
			body: fileForm,
		}), env);
		assert.equal(fileResponse.status, 200);
		assert.equal(webhookRequests.length, 1);
		assert.deepEqual(webhookRequests[0].payload.attachments, [
			{ id: 0, filename: "result.png" },
			{ id: 1, filename: "positive-prompt.txt" },
		]);
		assert.equal(await webhookRequests[0].promptFile.text(), longPrompt);

		webhookRequests.length = 0;
		const splitPrompt = "x".repeat(6100);
		const splitForm = new FormData();
		splitForm.append("image", new File(["png"], "result.png", { type: "image/png" }));
		splitForm.append("filename", "result.png");
		splitForm.append("prompt", splitPrompt);
		splitForm.append("target", "sfw-collection");
		splitForm.append("long_prompt_as_file", "false");
		const splitResponse = await worker.fetch(new Request("https://relay.example/v1/share", {
			method: "POST",
			headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
			body: splitForm,
		}), env);
		const splitResult = await splitResponse.json();
		assert.equal(splitResponse.status, 200);
		assert.equal(splitResult.message_count, 2);
		assert.equal(webhookRequests.length, 2);
		assert.equal(webhookRequests[0].image, null);
		assert.deepEqual(webhookRequests[0].payload.attachments, []);
		assert.equal(webhookRequests[0].payload.embeds[0].image, undefined);
		assert.equal(webhookRequests[1].image.name, "result.png");
		assert.deepEqual(webhookRequests[1].payload.attachments, [{ id: 0, filename: "result.png" }]);
		assert.deepEqual(webhookRequests[1].payload.embeds[0].image, { url: "attachment://result.png" });
		assert.equal(splitResult.delivered_targets[0].message_ids.length, 2);

		webhookRequests.length = 0;
		deletedMessages.length = 0;
		sfwPostCount = 0;
		failSfwPostAt = 2;
		const rollbackForm = new FormData();
		rollbackForm.append("image", new File(["png"], "result.png", { type: "image/png" }));
		rollbackForm.append("filename", "result.png");
		rollbackForm.append("prompt", splitPrompt);
		rollbackForm.append("target", "sfw-collection");
		rollbackForm.append("long_prompt_as_file", "false");
		const originalConsoleError = console.error;
		console.error = () => {};
		let rollbackResponse;
		try {
			rollbackResponse = await worker.fetch(new Request("https://relay.example/v1/share", {
				method: "POST",
				headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
				body: rollbackForm,
			}), env);
		} finally {
			console.error = originalConsoleError;
		}
		const rollbackResult = await rollbackResponse.json();
		assert.equal(rollbackResponse.status, 502);
		assert.equal(rollbackResult.code, "webhook_failed");
		assert.equal(deletedMessages.length, 1);
		assert.match(deletedMessages[0], /\/messages\/message-channel-100-1$/);
		failSfwPostAt = null;

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
