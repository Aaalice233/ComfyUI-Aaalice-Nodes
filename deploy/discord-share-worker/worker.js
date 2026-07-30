const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";
const AUTH_MESSAGE_TYPE = "AAALICE_DISCORD_SHARE_AUTH";
const DEFAULT_SESSION_TTL = 30 * 24 * 60 * 60;
const DEFAULT_UPLOAD_LIMIT = 10 * 1024 * 1024;
const DEFAULT_RATE_LIMIT = 5;

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

function publicUser(user, member) {
	return {
		id: String(user.id),
		username: String(user.username || ""),
		global_name: String(user.global_name || member?.nick || ""),
		avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : "",
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

async function enforceRateLimit(env, userId) {
	const limit = Math.max(1, Number(env.RATE_LIMIT_PER_MINUTE) || DEFAULT_RATE_LIMIT);
	const minute = Math.floor(Date.now() / 60000);
	const key = `rate:${userId}:${minute}`;
	const count = Number(await env.SESSIONS.get(key)) || 0;
	if (count >= limit) {
		const error = new Error("Too many shares. Try again in a minute.");
		error.code = "rate_limited";
		error.status = 429;
		throw error;
	}
	await env.SESSIONS.put(key, String(count + 1), { expirationTtl: 120 });
}

export function splitDiscordPrompt(value, limit = 4000) {
	const text = String(value || "").trim();
	if (!text) return [];
	const chunks = [];
	let remaining = text;
	while (remaining.length > limit) {
		let cut = remaining.lastIndexOf("\n", limit);
		if (cut < Math.floor(limit * 0.55)) cut = remaining.lastIndexOf(", ", limit);
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

function safeFilename(value) {
	const normalized = String(value || "image.png").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(-180);
	return normalized || "image.png";
}

async function sendWebhook(env, { image = null, filename = "", promptChunk, width = "", height = "" }) {
	const webhook = new URL(env.DISCORD_WEBHOOK_URL);
	webhook.searchParams.set("wait", "true");
	const payload = {
		embeds: [{
			description: discordFence(promptChunk),
			color: 0x5865F2,
			...(image ? { image: { url: `attachment://${filename}` } } : {}),
			...(image && (width || height) ? { footer: { text: [width && height ? `${width} × ${height}` : "", filename].filter(Boolean).join(" · ") } } : {}),
		}],
	};
	let response;
	if (image) {
		payload.attachments = [{ id: 0, filename }];
		const body = new FormData();
		body.append("payload_json", JSON.stringify(payload));
		body.append("files[0]", image, filename);
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
		const error = new Error(`Discord webhook HTTP ${response.status}: ${detail.slice(0, 300)}`);
		error.code = "webhook_failed";
		error.status = 502;
		throw error;
	}
	return response.json();
}

async function handleShare(request, env) {
	const verified = await verifiedSession(request, env);
	await enforceRateLimit(env, verified.session.user.id);
	const data = await request.formData();
	const image = data.get("image");
	const prompt = String(data.get("prompt") || "").trim();
	if (!(image instanceof File) || !image.type.startsWith("image/")) {
		return errorResponse("invalid_image", "An image file is required.", 400, corsHeaders(request, env));
	}
	const uploadLimit = Math.max(1024, Number(env.MAX_UPLOAD_BYTES) || DEFAULT_UPLOAD_LIMIT);
	if (image.size > uploadLimit) {
		return errorResponse("image_too_large", `Image exceeds the ${uploadLimit} byte upload limit.`, 413, corsHeaders(request, env));
	}
	if (!prompt) return errorResponse("missing_prompt", "A positive prompt is required.", 400, corsHeaders(request, env));
	const chunks = splitDiscordPrompt(prompt);
	const filename = safeFilename(data.get("filename") || image.name);
	const first = await sendWebhook(env, {
		image,
		filename,
		promptChunk: chunks[0],
		width: String(data.get("width") || ""),
		height: String(data.get("height") || ""),
	});
	for (const promptChunk of chunks.slice(1)) await sendWebhook(env, { promptChunk });
	return json({ ok: true, message_id: first.id || "", message_count: chunks.length }, 200, corsHeaders(request, env));
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
		"DISCORD_WEBHOOK_URL",
		"STATE_SECRET",
		"SESSIONS",
	];
	const missing = required.filter((key) => !env[key]);
	if (missing.length) throw new Error(`Missing Worker configuration: ${missing.join(", ")}`);
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
			if (request.method === "POST" && url.pathname === "/v1/share") return await handleShare(request, env);
			return errorResponse("not_found", "Not found.", 404, corsHeaders(request, env));
		} catch (error) {
			console.error("Discord share relay error", error);
			const status = Number(error.status) || 500;
			const code = error.code || (status === 500 ? "internal_error" : "request_failed");
			const message = status === 500 ? "Discord share service failed." : error.message;
			return errorResponse(code, message, status, corsHeaders(request, env));
		}
	},
};
