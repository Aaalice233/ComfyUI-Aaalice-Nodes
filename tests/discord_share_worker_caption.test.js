import test from "node:test";
import assert from "node:assert/strict";

import worker, { buildDiscordWebhookPayloads } from "../deploy/discord-share-worker/worker.js";

function relayEnvironment() {
	return {
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
	};
}

function shareRequest(form) {
	return new Request("https://relay.example/v1/share", {
		method: "POST",
		headers: { Authorization: "Bearer session", Origin: "http://127.0.0.1:8188" },
		body: form,
	});
}

function imageForm() {
	const form = new FormData();
	form.append("image", new File(["image"], "result.png", { type: "image/png" }));
	return form;
}

test("/v1/share accepts image-only captions and returns clear caption errors", async () => {
	const originalFetch = globalThis.fetch;
	const originalConsoleError = console.error;
	const webhookPayloads = [];
	globalThis.fetch = async (url, options = {}) => {
		if (String(url).includes("/users/@me/guilds/")) return Response.json({ roles: [] });
		if (String(url).startsWith("https://discord.com/api/webhooks/")) {
			webhookPayloads.push(JSON.parse(options.body.get("payload_json")));
			return Response.json({ id: "message-1", channel_id: "channel-1", guild_id: "guild" });
		}
		throw new Error(`Unexpected fetch: ${url}`);
	};
	try {
		const form = imageForm();
		form.append("caption", "  Finished render  ");
		const response = await worker.fetch(shareRequest(form), relayEnvironment());
		assert.equal(response.status, 200);
		assert.equal((await response.json()).message_count, 1);
		assert.equal(webhookPayloads.length, 1);
		assert.equal(webhookPayloads[0].embeds[0].title, "Finished render");
		assert.equal(webhookPayloads[0].embeds[0].description, undefined);
		assert.deepEqual(webhookPayloads[0].embeds[0].image, { url: "attachment://result.png" });
		assert.equal(webhookPayloads[0].embeds[0].author.name, "作者：alice");

		console.error = () => {};
		const oversizedForm = imageForm();
		oversizedForm.append("caption", `  ${"x".repeat(257)}  `);
		const oversizedResponse = await worker.fetch(shareRequest(oversizedForm), relayEnvironment());
		const oversized = await oversizedResponse.json();
		assert.equal(oversizedResponse.status, 400);
		assert.equal(oversized.code, "caption_too_long");
		assert.equal(oversized.caption_length, 257);
		assert.equal(oversized.max_caption_length, 256);

		const invalidForm = imageForm();
		invalidForm.append("caption", new File(["caption"], "caption.txt", { type: "text/plain" }));
		const invalidResponse = await worker.fetch(shareRequest(invalidForm), relayEnvironment());
		assert.equal(invalidResponse.status, 400);
		assert.equal((await invalidResponse.json()).code, "invalid_caption");
		assert.equal(webhookPayloads.length, 1);
	} finally {
		globalThis.fetch = originalFetch;
		console.error = originalConsoleError;
	}
});

test("caption and image stay on the final embed without changing prompt delivery modes", () => {
	const image = new File(["image"], "result.png", { type: "image/png" });
	const [imageOnlyPayload] = buildDiscordWebhookPayloads({ image, filename: "result.png", authorId: "42" });
	assert.equal(imageOnlyPayload.embeds[0].title, undefined);
	assert.equal(imageOnlyPayload.embeds[0].description, undefined);
	assert.deepEqual(imageOnlyPayload.embeds[0].image, { url: "attachment://result.png" });

	const payloads = buildDiscordWebhookPayloads({
		image,
		filename: "result.png",
		prompt: "x".repeat(6100),
		caption: "  Final image  ",
		authorId: "42",
		authorName: "Alice",
		longPromptAsFile: false,
	});
	assert.equal(payloads.length, 2);
	assert.equal(payloads[0].embeds[0].title, undefined);
	assert.equal(payloads[0].embeds[0].author.name, "作者：Alice");
	assert.equal(payloads[0].embeds[0].image, undefined);
	assert.equal(payloads.at(-1).embeds[0].title, "Final image");
	assert.equal(payloads.at(-1).embeds[0].author, undefined);
	assert.deepEqual(payloads.at(-1).embeds[0].image, { url: "attachment://result.png" });

	const [filePayload] = buildDiscordWebhookPayloads({
		image,
		filename: "result.png",
		prompt: "x".repeat(1501),
		caption: "File mode image",
		authorId: "42",
	});
	assert.equal(filePayload.embeds[0].title, "File mode image");
	assert.deepEqual(filePayload.embeds[0].image, { url: "attachment://result.png" });
	assert.deepEqual(filePayload.attachments, [
		{ id: 0, filename: "result.png" },
		{ id: 1, filename: "positive-prompt.txt" },
	]);
});

test("caption validation trims to 256 characters and counts titles in the Embed total", () => {
	const image = new File(["image"], "result.png", { type: "image/png" });
	const [payload] = buildDiscordWebhookPayloads({
		image,
		filename: "result.png",
		caption: `  ${"c".repeat(256)}  `,
		authorId: "42",
	});
	assert.equal(payload.embeds[0].title.length, 256);
	assert.throws(
		() => buildDiscordWebhookPayloads({ image, filename: "result.png", caption: "c".repeat(257), authorId: "42" }),
		(error) => error.code === "caption_too_long"
			&& error.details.caption_length === 257
			&& error.details.max_caption_length === 256,
	);

	const totalLimitInput = {
		image,
		filename: "f".repeat(180),
		prompt: "x".repeat(4088),
		authorId: "42",
		authorName: "A",
		width: "1".repeat(1300),
		height: "2".repeat(200),
		longPromptAsFile: false,
	};
	assert.doesNotThrow(() => buildDiscordWebhookPayloads(totalLimitInput));
	assert.throws(
		() => buildDiscordWebhookPayloads({ ...totalLimitInput, caption: "c".repeat(256) }),
		(error) => error.code === "embed_too_large"
			&& error.details.caption_length === 256
			&& error.details.discord_embed_character_limit === 6000,
	);
});
