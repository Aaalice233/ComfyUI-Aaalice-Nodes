const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";
const AUTH_MESSAGE_TYPE = "AAALICE_DISCORD_SHARE_AUTH";
const DEFAULT_SESSION_TTL = 30 * 24 * 60 * 60;
const DEFAULT_UPLOAD_LIMIT = 10 * 1024 * 1024;
const RATE_LIMIT_RETRY_SECONDS = 60;
const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;
const DISCORD_EMBED_TOTAL_LIMIT = 6000;
const MAX_PROMPT_FILE_BYTES = 1024 * 1024;
const PROMPT_FILE_NAME = "positive-prompt.txt";

function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});
}

function errorResponse(code, message, status, headers = {}) {
	return json({ code, message }, status, headers);
}

function base64Url(bytes) {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function decodeBase64Url(value) {
	const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function randomToken(byteLength = 32) {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return base64Url(bytes);
}

async function sha256Base64Url(value) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
	return base64Url(new Uint8Array(digest));
}

async function hmacKey(secret) {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

async function signState(payload, secret) {
	const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(encoded));
	return `${encoded}.${base64Url(new Uint8Array(signature))}`;
}

async function readState(value, secret) {
	const [encoded, signature] = String(value || "").split(".");
	if (!encoded || !signature) throw new Error("invalid OAuth state");
	const valid = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret),
		decodeBase64Url(signature),
		new TextEncoder().encode(encoded),
	);
	if (!valid) throw new Error("invalid OAuth state signature");
	const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
	if (!payload?.origin || Number(payload.expires_at) < Date.now()) throw new Error("expired OAuth state");
	return payload;
}

function configuredOrigins(env) {
	return new Set(String(env.ALLOWED_ORIGINS || "")
		.split(",")
		.map((value) => value.trim().replace(/\/$/, ""))
		.filter(Boolean));
}

export function isAllowedOrigin(value, env) {
	try {
		const origin = new URL(value).origin;
		const url = new URL(origin);
		const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
		return loopback || configuredOrigins(env).has(origin);
	} catch {
		return false;
	}
}

function corsHeaders(request, env) {
	const origin = request.headers.get("origin") || "";
	if (!isAllowedOrigin(origin, env)) return { vary: "Origin" };
	return {
		"access-control-allow-origin": new URL(origin).origin,
		"access-control-allow-headers": "authorization, content-type",
		"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
		vary: "Origin",
	};
}

function oauthRedirectUri(request) {
	const url = new URL(request.url);
	return `${url.origin}/v1/oauth/callback`;
}

async function discordJson(url, options = {}) {
	const response = await fetch(url, options);
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(payload?.message || `Discord API HTTP ${response.status}`);
		error.status = response.status;
		error.payload = payload;
		throw error;
	}
	return payload;
}

async function exchangeDiscordCode(request, env, code) {
	const body = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		client_secret: env.DISCORD_CLIENT_SECRET,
		grant_type: "authorization_code",
		code,
		redirect_uri: oauthRedirectUri(request),
	});
	return discordJson(`${DISCORD_API}/oauth2/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body,
	});
}

async function refreshDiscordToken(env, refreshToken) {
	const body = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		client_secret: env.DISCORD_CLIENT_SECRET,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});
	return discordJson(`${DISCORD_API}/oauth2/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body,
	});
}

async function discordUser(accessToken) {
	return discordJson(`${DISCORD_API}/users/@me`, {
		headers: { authorization: `Bearer ${accessToken}` },
	});
}

async function discordMember(accessToken, env) {
	return discordJson(`${DISCORD_API}/users/@me/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/member`, {
		headers: { authorization: `Bearer ${accessToken}` },
	});
}

function allowedRoles(env) {
	return String(env.ALLOWED_ROLE_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function assertAllowedMember(member, env) {
	const required = allowedRoles(env);
	if (!required.length) return;
	const memberRoles = new Set(member?.roles || []);
	if (!required.some((roleId) => memberRoles.has(roleId))) {
		const error = new Error("Your Discord account does not have a sharing role.");
		error.code = "missing_role";
		error.status = 403;
		throw error;
	}
}

function discordAvatarExtension(hash) {
	return String(hash || "").startsWith("a_") ? "gif" : "png";
}

function defaultDiscordAvatarUrl(userId) {
	try {
		const index = Number((BigInt(String(userId)) >> 22n) % 6n);
		return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
	} catch {
		return "https://cdn.discordapp.com/embed/avatars/0.png";
	}
}

function discordUserAvatarUrl(user) {
	if (!user?.avatar) return defaultDiscordAvatarUrl(user?.id);
	return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${discordAvatarExtension(user.avatar)}?size=128`;
}

function discordMemberAvatarUrl(member, userId, guildId) {
	if (!member?.avatar || !userId || !guildId) return "";
	return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${member.avatar}.${discordAvatarExtension(member.avatar)}?size=128`;
}

function publicUser(user, member) {
	return {
		id: String(user.id),
		username: String(user.username || ""),
		global_name: String(user.global_name || member?.nick || ""),
		avatar: discordUserAvatarUrl(user),
	};
}

async function tokenStorageKey(token) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return `session:${base64Url(new Uint8Array(digest))}`;
}

async function createSession(env, tokenPayload, user, member) {
	const token = randomToken();
	const ttl = Math.max(3600, Number(env.SESSION_TTL_SECONDS) || DEFAULT_SESSION_TTL);
	const now = Math.floor(Date.now() / 1000);
	const session = {
		access_token: tokenPayload.access_token,
		refresh_token: tokenPayload.refresh_token,
		access_expires_at: now + Number(tokenPayload.expires_in || 3600),
		created_at: now,
		user: publicUser(user, member),
	};
	await env.SESSIONS.put(await tokenStorageKey(token), JSON.stringify(session), { expirationTtl: ttl });
	return { token, session };
}

async function oauthHandoffKey(nonce) {
	return `oauth-handoff:${await sha256Base64Url(nonce)}`;
}

async function saveOAuthHandoff(env, state, payload) {
	if (!state?.origin || !state?.nonce || !state?.challenge) return;
	await env.SESSIONS.put(
		await oauthHandoffKey(state.nonce),
		JSON.stringify({
			origin: new URL(state.origin).origin,
			challenge: state.challenge,
			result: { type: AUTH_MESSAGE_TYPE, nonce: state.nonce, ...payload },
		}),
		{ expirationTtl: 10 * 60 },
	);
}

function bearerToken(request) {
	const header = request.headers.get("authorization") || "";
	const match = header.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || "";
}

async function loadSession(request, env) {
	const token = bearerToken(request);
	if (!token) {
		const error = new Error("Discord verification is required.");
		error.code = "unauthorized";
		error.status = 401;
		throw error;
	}
	const key = await tokenStorageKey(token);
	const session = await env.SESSIONS.get(key, "json");
	if (!session) {
		const error = new Error("Discord verification has expired.");
		error.code = "session_expired";
		error.status = 401;
		throw error;
	}
	return { token, key, session };
}

async function refreshSessionIfNeeded(env, loaded) {
	const now = Math.floor(Date.now() / 1000);
	if (Number(loaded.session.access_expires_at) > now + 90) return loaded;
	const refreshed = await refreshDiscordToken(env, loaded.session.refresh_token);
	loaded.session.access_token = refreshed.access_token;
	loaded.session.refresh_token = refreshed.refresh_token || loaded.session.refresh_token;
	loaded.session.access_expires_at = now + Number(refreshed.expires_in || 3600);
	const ttl = Math.max(3600, Number(env.SESSION_TTL_SECONDS) || DEFAULT_SESSION_TTL);
	await env.SESSIONS.put(loaded.key, JSON.stringify(loaded.session), { expirationTtl: ttl });
	return loaded;
}

async function verifiedSession(request, env) {
	const loaded = await refreshSessionIfNeeded(env, await loadSession(request, env));
	try {
		const member = await discordMember(loaded.session.access_token, env);
		assertAllowedMember(member, env);
		return { ...loaded, member };
	} catch (error) {
		if (error.status === 401) await env.SESSIONS.delete(loaded.key);
		if (error.status === 404) {
			error.code = "not_member";
			error.status = 403;
			error.message = "Join the Discord server before sharing.";
		}
		throw error;
	}
}

function inlineJson(value) {
	return JSON.stringify(value)
		.replaceAll("<", "\\u003c")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

export function callbackResponse(origin, nonce, payload) {
	const targetOrigin = new URL(origin).origin;
	const result = { type: AUTH_MESSAGE_TYPE, nonce, ...payload };
	const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Discord verification</title>
<style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111318;color:#e8eaf0;font:15px/1.5 system-ui,sans-serif}.card{width:min(360px,calc(100vw - 40px));padding:28px;border-radius:16px;background:#1d2027;box-shadow:0 24px 70px #0008;text-align:center}.mark{display:grid;width:54px;height:54px;margin:0 auto 16px;border-radius:17px;background:#5865f233;color:#8791ff;place-items:center;font-size:25px}p{margin:8px 0 0;color:#aeb4c0}</style></head>
<body><main class="card"><div class="mark">✓</div><strong>Discord verification complete / Discord 验证已完成</strong><p>You can return to ComfyUI. / 可以返回 ComfyUI。</p></main>
<script>
const result = ${inlineJson(result)};
const targetOrigin = ${inlineJson(targetOrigin)};
if (window.opener) {
  window.opener.postMessage(result, targetOrigin);
  setTimeout(() => window.close(), 500);
}
</script></body></html>`;
	return new Response(html, {
		status: 200,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
			"referrer-policy": "no-referrer",
			"x-content-type-options": "nosniff",
		},
	});
}

async function handleOAuthStart(request, env) {
	const url = new URL(request.url);
	const origin = url.searchParams.get("origin") || "";
	const nonce = url.searchParams.get("nonce") || "";
	const challenge = url.searchParams.get("challenge") || "";
	if (!isAllowedOrigin(origin, env) || !/^[A-Za-z0-9_-]{20,128}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
		return errorResponse("invalid_oauth_request", "This Discord verification request is invalid.", 400);
	}
	const state = await signState({
		origin: new URL(origin).origin,
		nonce,
		challenge,
		expires_at: Date.now() + 10 * 60 * 1000,
	}, env.STATE_SECRET);
	const authorize = new URL(DISCORD_AUTHORIZE);
	authorize.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
	authorize.searchParams.set("response_type", "code");
	authorize.searchParams.set("redirect_uri", oauthRedirectUri(request));
	authorize.searchParams.set("scope", "identify guilds.members.read");
	authorize.searchParams.set("state", state);
	authorize.searchParams.set("prompt", "consent");
	return Response.redirect(authorize.href, 302);
}

async function handleOAuthCallback(request, env) {
	const url = new URL(request.url);
	let state;
	try {
		state = await readState(url.searchParams.get("state"), env.STATE_SECRET);
		if (!isAllowedOrigin(state.origin, env)) throw new Error("origin is no longer allowed");
			const oauthError = url.searchParams.get("error");
			if (oauthError) {
				const result = { ok: false, code: oauthError, message: "Discord authorization was cancelled." };
				await saveOAuthHandoff(env, state, result);
				return callbackResponse(state.origin, state.nonce, result);
			}
		const tokenPayload = await exchangeDiscordCode(request, env, url.searchParams.get("code") || "");
		const [user, member] = await Promise.all([
			discordUser(tokenPayload.access_token),
			discordMember(tokenPayload.access_token, env),
		]);
			assertAllowedMember(member, env);
			const created = await createSession(env, tokenPayload, user, member);
			const result = { ok: true, token: created.token, user: created.session.user };
			await saveOAuthHandoff(env, state, result);
			return callbackResponse(state.origin, state.nonce, result);
		} catch (error) {
			if (!state?.origin) return errorResponse("invalid_oauth_state", "Discord verification could not be completed.", 400);
			const notMember = error.status === 404;
			const result = {
				ok: false,
				code: notMember ? "not_member" : error.code || "authorization_failed",
				status: notMember ? 403 : Number(error.status) || 400,
				message: notMember ? "Join the Discord server before sharing." : error.message,
				community_url: env.DISCORD_INVITE_URL || "",
			};
			await saveOAuthHandoff(env, state, result);
			return callbackResponse(state.origin, state.nonce, result);
		}
	}

async function handleOAuthResult(request, env) {
	const origin = request.headers.get("origin") || "";
	const headers = corsHeaders(request, env);
	if (!isAllowedOrigin(origin, env)) return errorResponse("invalid_origin", "This ComfyUI origin is not allowed.", 403, headers);
	const payload = await request.json().catch(() => ({}));
	const nonce = String(payload?.nonce || "");
	const verifier = String(payload?.verifier || "");
	if (!/^[A-Za-z0-9_-]{20,128}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) {
		return errorResponse("invalid_oauth_result_request", "This Discord verification result request is invalid.", 400, headers);
	}
	const key = await oauthHandoffKey(nonce);
	const handoff = await env.SESSIONS.get(key, "json");
	if (!handoff) return json({ pending: true }, 202, headers);
	const expectedOrigin = new URL(origin).origin;
	const challenge = await sha256Base64Url(verifier);
	if (handoff.origin !== expectedOrigin || handoff.challenge !== challenge) {
		return errorResponse("invalid_oauth_verifier", "Discord verification could not be claimed.", 403, headers);
	}
	await env.SESSIONS.delete(key);
	return json(handoff.result, 200, headers);
}

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

function relayConfigurationError(internalDetail) {
	const error = new Error("Discord sharing is temporarily unavailable because the relay service is not fully configured. Please contact the server administrator.");
	error.code = "relay_misconfigured";
	error.status = 503;
	error.internalDetail = internalDetail;
	return error;
}

export function configuredWebhookTargets(env) {
	let input;
	try {
		input = JSON.parse(String(env.DISCORD_WEBHOOK_TARGETS || ""));
	} catch {
		throw relayConfigurationError("DISCORD_WEBHOOK_TARGETS is not valid JSON.");
	}
	if (!Array.isArray(input) || !input.length) {
		throw relayConfigurationError("DISCORD_WEBHOOK_TARGETS must contain at least one target.");
	}
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
	return escapedPrompt.length + 8 > DISCORD_EMBED_DESCRIPTION_LIMIT;
}

export function buildDiscordWebhookPayload({
	image = null,
	filename = "",
	prompt = "",
	authorId = "",
	authorName = "",
	authorAvatarUrl = "",
	width = "",
	height = "",
	longPromptAsFile = true,
}) {
	const escapedPrompt = String(prompt || "").trim().replaceAll("```", "``\u200b`");
	const attachPromptFile = shouldAttachPromptFile(prompt, longPromptAsFile);
	const chunks = attachPromptFile ? [] : splitDiscordPrompt(escapedPrompt, DISCORD_EMBED_DESCRIPTION_LIMIT - 8);
	const footerText = image && (width || height)
		? [width && height ? `${width} × ${height}` : "", filename].filter(Boolean).join(" · ")
		: "";
	const embeds = chunks.map((promptChunk) => ({
		description: `\`\`\`\n${promptChunk}\n\`\`\``,
		color: 0x5865F2,
	}));
	if (image) {
		const imageEmbed = embeds.at(-1) || { color: 0x5865F2 };
		imageEmbed.image = { url: `attachment://${filename}` };
		if (footerText) imageEmbed.footer = { text: footerText };
		if (!embeds.length) embeds.push(imageEmbed);
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
	if (embeds.length) {
		embeds[0].author = {
			name: authorLabel,
			url: `https://discord.com/users/${normalizedAuthorId}`,
			...(avatarUrl ? { icon_url: avatarUrl } : {}),
		};
	}
	const embedCharacters = embeds.reduce((total, embed) => total
		+ (embed.description?.length || 0)
		+ (embed.footer?.text?.length || 0)
		+ (embed.author?.name?.length || 0), 0);
	if (
		(!embeds.length && !attachPromptFile)
		|| embeds.some((embed) => (embed.description?.length || 0) > DISCORD_EMBED_DESCRIPTION_LIMIT)
		|| embedCharacters > DISCORD_EMBED_TOTAL_LIMIT
		|| embeds.length > 10
	) {
		const error = new Error("The positive prompt is too long to keep the image, author, and full prompt in one Discord message.");
		error.code = "prompt_too_long";
		error.status = 400;
		error.details = {
			prompt_length: String(prompt || "").trim().length,
			discord_embed_character_limit: DISCORD_EMBED_TOTAL_LIMIT,
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
	return {
		content: [
			`👤 作者：<@${normalizedAuthorId}>`,
			attachPromptFile ? "📄 正面提示词较长，已作为文件附加。" : "",
		].filter(Boolean).join("\n"),
		allowed_mentions: { users: [normalizedAuthorId] },
		embeds,
		attachments: [
			...(image ? [{ id: 0, filename }] : []),
			...(attachPromptFile ? [{ id: image ? 1 : 0, filename: PROMPT_FILE_NAME }] : []),
		],
	};
}

async function sendWebhook(target, payload, image, filename, promptFile = null) {
	const webhook = new URL(target.url);
	webhook.searchParams.set("wait", "true");
	let response;
	if (image || promptFile) {
		const body = new FormData();
		body.append("payload_json", JSON.stringify(payload));
		if (image) body.append("files[0]", image, filename);
		if (promptFile) body.append(`files[${image ? 1 : 0}]`, promptFile, PROMPT_FILE_NAME);
		response = await fetch(webhook.href, { method: "POST", body });
	} else {
		response = await fetch(webhook.href, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
	}
	if (!response.ok) {
		const detail = await response.text();
		const error = new Error(`Discord rejected the share for ${target.label} (HTTP ${response.status}): ${detail.slice(0, 300)}`);
		error.code = "webhook_failed";
		error.status = 502;
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

async function handleTargets(request, env) {
	await loadSession(request, env);
	return json({ targets: publicWebhookTargets(configuredWebhookTargets(env)) }, 200, corsHeaders(request, env));
}

async function handleShare(request, env) {
	const verified = await verifiedSession(request, env);
	await enforceRateLimit(env, verified.session.user.id);
	const data = await request.formData();
	const targets = selectedWebhookTargets(data, configuredWebhookTargets(env));
	const image = data.get("image");
	const prompt = String(data.get("prompt") || "").trim();
	const longPromptAsFileValue = data.get("long_prompt_as_file");
	const longPromptAsFile = longPromptAsFileValue == null || String(longPromptAsFileValue).toLowerCase() !== "false";
	if (!(image instanceof File) || !image.type.startsWith("image/")) {
		return errorResponse("invalid_image", "An image file is required.", 400, corsHeaders(request, env));
	}
	const uploadLimit = Math.max(1024, Number(env.MAX_UPLOAD_BYTES) || DEFAULT_UPLOAD_LIMIT);
	if (image.size > uploadLimit) {
		return errorResponse("image_too_large", `Image exceeds the ${uploadLimit} byte upload limit.`, 413, corsHeaders(request, env));
	}
	if (!prompt) return errorResponse("missing_prompt", "A positive prompt is required.", 400, corsHeaders(request, env));
	const filename = safeFilename(data.get("filename") || image.name);
	const payload = buildDiscordWebhookPayload({
		image,
		filename,
		prompt,
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
	const settled = await Promise.allSettled(targets.map(async (target) => {
		const message = await sendWebhook(target, payload, image, filename, promptFile);
		return {
			id: target.id,
			label: target.label,
			message_id: message.id,
			message_url: `https://discord.com/channels/${message.guild_id || env.DISCORD_GUILD_ID}/${message.channel_id}/${message.id}`,
		};
	}));
	const delivered = [];
	const failed = [];
	for (const [index, result] of settled.entries()) {
		if (result.status === "fulfilled") delivered.push(result.value);
		else failed.push({ id: targets[index].id, label: targets[index].label });
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
		const error = new Error("Discord rejected the share in every selected channel.");
		error.code = "webhook_failed";
		error.status = 502;
		error.details = { failed_targets: failed };
		throw error;
	}
	return json({ ok: true, delivered_targets: delivered, target_count: delivered.length, message_count: 1 }, 200, corsHeaders(request, env));
}

async function handleSession(request, env) {
	if (request.method === "DELETE") {
		const loaded = await loadSession(request, env);
		await env.SESSIONS.delete(loaded.key);
		return json({ ok: true }, 200, corsHeaders(request, env));
	}
	const verified = await verifiedSession(request, env);
	return json({ ok: true, user: verified.session.user }, 200, corsHeaders(request, env));
}

function validateEnvironment(env) {
	const required = [
		"DISCORD_CLIENT_ID",
		"DISCORD_CLIENT_SECRET",
		"DISCORD_GUILD_ID",
		"DISCORD_WEBHOOK_TARGETS",
		"STATE_SECRET",
		"SESSIONS",
		"SHARE_RATE_LIMITER",
	];
	const missing = required.filter((key) => !env[key]);
	if (missing.length) {
		throw relayConfigurationError(`Missing Worker configuration: ${missing.join(", ")}`);
	}
	configuredWebhookTargets(env);
}

export default {
	async fetch(request, env) {
			try {
				validateEnvironment(env);
				const url = new URL(request.url);
				if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
				if (request.method === "GET" && url.pathname === "/v1/oauth/start") return handleOAuthStart(request, env);
				if (request.method === "GET" && url.pathname === "/v1/oauth/callback") return handleOAuthCallback(request, env);
				if (request.method === "POST" && url.pathname === "/v1/oauth/result") return await handleOAuthResult(request, env);
				if (["GET", "DELETE"].includes(request.method) && url.pathname === "/v1/session") return await handleSession(request, env);
				if (request.method === "GET" && url.pathname === "/v1/targets") return await handleTargets(request, env);
				if (request.method === "POST" && url.pathname === "/v1/share") return await handleShare(request, env);
				return errorResponse("not_found", "Not found.", 404, corsHeaders(request, env));
		} catch (error) {
			console.error("Discord share relay error", error, error.internalDetail || "");
			const status = Number(error.status) || 500;
			const code = error.code || (status === 500 ? "internal_error" : "request_failed");
			const message = status === 500 ? "Discord share service failed." : error.message;
			return json(
				{ code, message, ...(error.details || {}) },
				status,
				{ ...corsHeaders(request, env), ...(error.headers || {}) },
			);
		}
	},
};
