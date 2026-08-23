import { defaultDiscordAvatarUrl, discordMemberAvatarUrl, loadSession, verifiedSession } from "./auth.js";
import { corsHeaders, errorResponse, json, relayConfigurationError } from "./http.js";

const RATE_LIMIT_RETRY_SECONDS = 60;
const DISCORD_EMBED_TITLE_LIMIT = 256;
const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;
const DISCORD_EMBED_TOTAL_LIMIT = 6000;
const LONG_PROMPT_FILE_THRESHOLD = 1500;
const MAX_INLINE_PROMPT_MESSAGES = 10;
const MAX_PROMPT_FILE_BYTES = 1024 * 1024;
const PROMPT_FILE_NAME = "positive-prompt.txt";

export async function enforceRateLimit(env, userId) {
	let result;
	try {
		result = await env.SHARE_RATE_LIMITER.limit({ key: `discord-user:${String(userId)}` });
	} catch (cause) {
		const error = new Error("Discord sharing is temporarily unavailable because the rate-limit service could not be reached. Try again shortly.");
		error.code = "rate_limiter_unavailable";
		error.status = 503;
		error.cause = cause;
		throw error;
	}
	if (!result?.success) {
		const error = new Error("Share limit reached for this Discord account. Wait about 60 seconds, then try again.");
		error.code = "rate_limited";
		error.status = 429;
		error.headers = { "retry-after": String(RATE_LIMIT_RETRY_SECONDS) };
		error.details = { retry_after_seconds: RATE_LIMIT_RETRY_SECONDS };
		throw error;
	}
}

export function splitDiscordPrompt(value, limit = 4000) {
	const text = String(value || "").trim();
	if (!text) return [];
	const chunks = [];
	let remaining = text;
	while (remaining.length > limit) {
		let cut = remaining.lastIndexOf("\n", limit);
		if (cut < Math.floor(limit * 0.55)) {
			const comma = remaining.lastIndexOf(", ", limit);
			cut = comma < Math.floor(limit * 0.55) ? comma : comma + 1;
		}
		if (cut < Math.floor(limit * 0.55)) cut = limit;
		chunks.push(remaining.slice(0, cut).trim());
		remaining = remaining.slice(cut).trim();
	}
	if (remaining) chunks.push(remaining);
	return chunks;
}

export function discordFence(value) {
	return `\`\`\`\n${String(value || "").replaceAll("```", "``\u200b`")}\n\`\`\``;
}


export function configuredWebhookTargets(env) {
	const fragments = Object.entries(env)
		.filter(([key, value]) => /^DISCORD_WEBHOOK_TARGETS(?:_[A-Z0-9_]+)?$/.test(key) && value)
		.sort(([left], [right]) => left === "DISCORD_WEBHOOK_TARGETS" ? -1 : right === "DISCORD_WEBHOOK_TARGETS" ? 1 : left.localeCompare(right));
	const input = [];
	for (const [key, value] of fragments) {
		let entries;
		try {
			entries = JSON.parse(String(value));
		} catch {
			throw relayConfigurationError(`${key} is not valid JSON.`);
		}
		if (!Array.isArray(entries) || !entries.length) {
			throw relayConfigurationError(`${key} must contain at least one target.`);
		}
		input.push(...entries);
	}
	if (!input.length) throw relayConfigurationError("DISCORD_WEBHOOK_TARGETS must contain at least one target.");
	const ids = new Set();
	return input.map((entry, index) => {
		const id = String(entry?.id || "").trim();
		const label = String(entry?.label || "").trim();
		let url;
		try {
			url = new URL(String(entry?.url || ""));
		} catch {
			throw relayConfigurationError(`Discord webhook target ${index + 1} has an invalid URL.`);
		}
		const validPath = /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname);
		if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || !label || label.length > 80 || ids.has(id)
			|| url.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(url.hostname) || !validPath) {
			throw relayConfigurationError(`Discord webhook target ${index + 1} is invalid or duplicated.`);
		}
		ids.add(id);
		return {
			id,
			label,
			url: url.href,
			default: Boolean(entry.default),
			prefer_prompt_file: Boolean(entry.prefer_prompt_file),
		};
	});
}

function publicWebhookTargets(targets) {
	return targets.map(({ id, label, default: selectedByDefault, prefer_prompt_file }) => ({
		id,
		label,
		default: selectedByDefault,
		prefer_prompt_file,
	}));
}

function selectedWebhookTargets(data, targets) {
	const requested = [...new Set(data.getAll("target").map((value) => String(value || "").trim()).filter(Boolean))];
	const ids = requested.length ? requested : targets.filter((target) => target.default).map((target) => target.id);
	if (!ids.length) ids.push(targets[0].id);
	const byId = new Map(targets.map((target) => [target.id, target]));
	const selected = ids.map((id) => byId.get(id));
	if (selected.some((target) => !target)) {
		const error = new Error("One or more selected Discord channels are no longer available. Refresh the channel list and try again.");
		error.code = "invalid_targets";
		error.status = 400;
		throw error;
	}
	return selected;
}

function safeFilename(value) {
	const normalized = String(value || "image.png").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(-180);
	return normalized || "image.png";
}

export function shouldAttachPromptFile(prompt, enabled = true) {
	if (!enabled) return false;
	const escapedPrompt = String(prompt || "").trim().replaceAll("```", "``\u200b`");
	return escapedPrompt.length > LONG_PROMPT_FILE_THRESHOLD;
}

export function buildDiscordWebhookPayloads({
	image = null,
	filename = "",
	prompt = "",
	caption = "",
	authorId = "",
	authorName = "",
	authorAvatarUrl = "",
	width = "",
	height = "",
	longPromptAsFile = true,
}) {
	const normalizedCaption = String(caption || "").trim();
	if (normalizedCaption.length > DISCORD_EMBED_TITLE_LIMIT) {
		const error = new Error(`Caption must be ${DISCORD_EMBED_TITLE_LIMIT} characters or fewer after trimming.`);
		error.code = "caption_too_long";
		error.status = 400;
		error.details = {
			caption_length: normalizedCaption.length,
			max_caption_length: DISCORD_EMBED_TITLE_LIMIT,
		};
		throw error;
	}
	if (normalizedCaption && !image) {
		const error = new Error("Caption requires an image attachment.");
		error.code = "caption_requires_image";
		error.status = 400;
		throw error;
	}
	const escapedPrompt = String(prompt || "").trim().replaceAll("```", "``\u200b`");
	const attachPromptFile = shouldAttachPromptFile(prompt, longPromptAsFile);
	const chunks = attachPromptFile ? [] : splitDiscordPrompt(escapedPrompt, DISCORD_EMBED_DESCRIPTION_LIMIT - 8);
	if (!attachPromptFile && chunks.length > MAX_INLINE_PROMPT_MESSAGES) {
		const error = new Error(`The positive prompt would require more than ${MAX_INLINE_PROMPT_MESSAGES} Discord messages. Enable long-prompt file mode or shorten it, then try again.`);
		error.code = "prompt_too_long";
		error.status = 400;
		error.details = {
			prompt_length: String(prompt || "").trim().length,
			max_inline_messages: MAX_INLINE_PROMPT_MESSAGES,
		};
		throw error;
	}
	if (attachPromptFile && new TextEncoder().encode(String(prompt || "")).byteLength > MAX_PROMPT_FILE_BYTES) {
		const error = new Error("The positive prompt is too large to attach as a text file.");
		error.code = "prompt_file_too_large";
		error.status = 413;
		error.details = { max_prompt_file_bytes: MAX_PROMPT_FILE_BYTES };
		throw error;
	}
	const footerText = image && (width || height)
		? [width && height ? `${width} × ${height}` : "", filename].filter(Boolean).join(" · ")
		: "";
	const payloads = attachPromptFile
		? [{
			content: "📄 正面提示词较长，已作为文件附加。",
			embeds: [{ color: 0x5865F2 }],
			attachments: [
				...(image ? [{ id: 0, filename }] : []),
				{ id: image ? 1 : 0, filename: PROMPT_FILE_NAME },
			],
		}]
		: chunks.map((promptChunk) => ({
			embeds: [{
				description: `\`\`\`\n${promptChunk}\n\`\`\``,
				color: 0x5865F2,
			}],
			attachments: [],
		}));
	if (!payloads.length && image) {
		payloads.push({ embeds: [{ color: 0x5865F2 }], attachments: [] });
	}
	if (!payloads.length) {
		const error = new Error("A positive prompt is required.");
		error.code = "missing_prompt";
		error.status = 400;
		throw error;
	}
	if (image) {
		const finalPayload = payloads.at(-1);
		const imageEmbed = finalPayload.embeds.at(-1) || { color: 0x5865F2 };
		if (normalizedCaption) imageEmbed.title = normalizedCaption;
		imageEmbed.image = { url: `attachment://${filename}` };
		if (footerText) imageEmbed.footer = { text: footerText };
		if (!finalPayload.embeds.length) finalPayload.embeds.push(imageEmbed);
		if (!finalPayload.attachments.some((attachment) => attachment.filename === filename)) {
			finalPayload.attachments.unshift({ id: 0, filename });
		}
	}
	const normalizedAuthorId = String(authorId || "").trim();
	if (!/^\d+$/.test(normalizedAuthorId)) throw new Error("Discord share author identity is invalid.");
	const normalizedAuthorName = String(authorName || "").trim() || "Discord 用户";
	const authorLabel = `作者：${normalizedAuthorName}`.slice(0, 256);
	let avatarUrl = "";
	try {
		const candidate = new URL(String(authorAvatarUrl || ""));
		if (candidate.protocol === "https:" && candidate.hostname === "cdn.discordapp.com") {
			avatarUrl = candidate.href;
		}
	} catch {
		avatarUrl = "";
	}
	payloads[0].embeds[0].author = {
		name: authorLabel,
		url: `https://discord.com/users/${normalizedAuthorId}`,
		...(avatarUrl ? { icon_url: avatarUrl } : {}),
	};
	for (const payload of payloads) {
		const embedCharacters = payload.embeds.reduce((total, embed) => total
			+ (embed.title?.length || 0)
			+ (embed.description?.length || 0)
			+ (embed.footer?.text?.length || 0)
			+ (embed.author?.name?.length || 0), 0);
		if (
			payload.embeds.some((embed) => (embed.description?.length || 0) > DISCORD_EMBED_DESCRIPTION_LIMIT)
			|| embedCharacters > DISCORD_EMBED_TOTAL_LIMIT
			|| payload.embeds.length > 10
		) {
			const captionExceededTotal = Boolean(normalizedCaption) && embedCharacters > DISCORD_EMBED_TOTAL_LIMIT;
			const error = new Error(captionExceededTotal
				? "The caption and positive prompt exceed Discord's Embed character limit."
				: "The positive prompt could not be split into valid Discord messages.");
			error.code = captionExceededTotal ? "embed_too_large" : "prompt_too_long";
			error.status = 400;
			error.details = {
				prompt_length: String(prompt || "").trim().length,
				...(normalizedCaption ? { caption_length: normalizedCaption.length } : {}),
				discord_embed_character_limit: DISCORD_EMBED_TOTAL_LIMIT,
			};
			throw error;
		}
	}
	return payloads;
}

function webhookRequestOptions(payload, image, filename, promptFile) {
	if (image || promptFile) {
		const body = new FormData();
		body.append("payload_json", JSON.stringify(payload));
		if (image) body.append("files[0]", image, filename);
		if (promptFile) body.append(`files[${image ? 1 : 0}]`, promptFile, PROMPT_FILE_NAME);
		return { method: "POST", body };
	}
	return {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	};
}

async function waitForDiscordRateLimit(response) {
	if (response.status !== 429) return false;
	const detail = await response.clone().json().catch(() => ({}));
	const retrySeconds = Number(detail?.retry_after);
	if (!Number.isFinite(retrySeconds) || retrySeconds < 0) return false;
	await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, Math.max(250, retrySeconds * 1000))));
	return true;
}

async function deleteWebhookMessage(target, messageId) {
	const webhook = new URL(target.url);
	webhook.pathname = `${webhook.pathname.replace(/\/$/, "")}/messages/${encodeURIComponent(messageId)}`;
	const response = await fetch(webhook.href, { method: "DELETE" });
	if (!response.ok && response.status !== 404) {
		throw new Error(`Discord could not roll back an incomplete share for ${target.label} (HTTP ${response.status}).`);
	}
}

async function sendWebhookSequence(target, steps, filename) {
	const sent = [];
	try {
		for (const step of steps) {
			sent.push(await sendWebhook(target, step.payload, step.image, filename, step.promptFile));
		}
		return sent;
	} catch (error) {
		// A later message must not leave a visibly incomplete prompt chain behind.
		await Promise.allSettled([...sent].reverse().map((message) => deleteWebhookMessage(target, message.id)));
		throw error;
	}
}

async function sendWebhook(target, payload, image, filename, promptFile = null) {
	const webhook = new URL(target.url);
	webhook.searchParams.set("wait", "true");
	let response;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		response = await fetch(webhook.href, webhookRequestOptions(payload, image, filename, promptFile));
		if (response.ok) break;
		if (attempt < 4 && await waitForDiscordRateLimit(response)) continue;
		const detail = await response.text();
		const imageRejected = response.status === 413 || /(?:request entity too large|\"code\"\s*:\s*40005)/i.test(detail);
		const error = new Error(`Discord rejected the share for ${target.label} (HTTP ${response.status}): ${detail.slice(0, 300)}`);
		error.code = imageRejected ? "image_upload_rejected" : "webhook_failed";
		error.status = imageRejected ? 413 : 502;
		throw error;
	}
	const message = await response.json().catch(() => null);
	if (!message?.id || !message?.channel_id) {
		const error = new Error(`Discord did not confirm the created message for ${target.label}.`);
		error.code = "webhook_failed";
		error.status = 502;
		throw error;
	}
	return message;
}

export async function handleTargets(request, env) {
	await loadSession(request, env);
	return json({ targets: publicWebhookTargets(configuredWebhookTargets(env)) }, 200, corsHeaders(request, env));
}

export async function handleShare(request, env) {
	const verified = await verifiedSession(request, env);
	await enforceRateLimit(env, verified.session.user.id);
	const data = await request.formData();
	const targets = selectedWebhookTargets(data, configuredWebhookTargets(env));
	const image = data.get("image");
	const prompt = String(data.get("prompt") || "").trim();
	const captionValue = data.get("caption");
	const longPromptAsFileValue = data.get("long_prompt_as_file");
	const longPromptAsFile = longPromptAsFileValue == null || String(longPromptAsFileValue).toLowerCase() !== "false";
	if (!(image instanceof File) || !image.type.startsWith("image/")) {
		return errorResponse("invalid_image", "An image file is required.", 400, corsHeaders(request, env));
	}
	if (captionValue instanceof File) {
		return errorResponse("invalid_caption", "Caption must be submitted as text.", 400, corsHeaders(request, env));
	}
	const caption = String(captionValue || "").trim();
	const filename = safeFilename(data.get("filename") || image.name);
	const payloads = buildDiscordWebhookPayloads({
		image,
		filename,
		prompt,
		caption,
		authorId: verified.session.user.id,
		authorName: verified.member?.nick || verified.session.user.global_name || verified.session.user.username,
		authorAvatarUrl: discordMemberAvatarUrl(
			verified.member,
			verified.session.user.id,
			env.DISCORD_GUILD_ID,
		) || verified.session.user.avatar || defaultDiscordAvatarUrl(verified.session.user.id),
		width: String(data.get("width") || ""),
		height: String(data.get("height") || ""),
		longPromptAsFile,
	});
	const promptFile = shouldAttachPromptFile(prompt, longPromptAsFile)
		? new Blob([prompt], { type: "text/plain;charset=utf-8" })
		: null;
	const lastPayloadIndex = payloads.length - 1;
	const steps = payloads.map((payload, index) => ({
		payload,
		image: index === lastPayloadIndex ? image : null,
		promptFile: index === lastPayloadIndex ? promptFile : null,
	}));
	const settled = await Promise.allSettled(targets.map(async (target) => {
		const messages = await sendWebhookSequence(target, steps, filename);
		const message = messages.at(-1);
		return {
			id: target.id,
			label: target.label,
			message_id: message.id,
			message_ids: messages.map((entry) => entry.id),
			message_url: `https://discord.com/channels/${message.guild_id || env.DISCORD_GUILD_ID}/${message.channel_id}/${message.id}`,
		};
	}));
	const delivered = [];
	const failed = [];
	const failureReasons = [];
	for (const [index, result] of settled.entries()) {
		if (result.status === "fulfilled") delivered.push(result.value);
		else {
			failed.push({ id: targets[index].id, label: targets[index].label });
			failureReasons.push(result.reason);
		}
	}
	if (failed.length && delivered.length) {
		return json({
			ok: false,
			code: "partial_delivery",
			message: "Discord accepted the share in some selected channels but rejected it in others.",
			delivered_targets: delivered,
			failed_targets: failed,
		}, 207, corsHeaders(request, env));
	}
	if (failed.length) {
		const imageRejected = failureReasons.every((reason) => reason?.code === "image_upload_rejected");
		if (imageRejected) {
			return json({
				code: "image_upload_rejected",
				message: "Discord rejected the image because the attachment is too large.",
				failed_targets: failed,
			}, 413, corsHeaders(request, env));
		}
		const error = new Error("Discord rejected the share in every selected channel.");
		error.code = "webhook_failed";
		error.status = 502;
		error.details = { failed_targets: failed };
		throw error;
	}
	return json({ ok: true, delivered_targets: delivered, target_count: delivered.length, message_count: payloads.length }, 200, corsHeaders(request, env));
}
