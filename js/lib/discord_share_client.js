/** Browser client for the secretless Discord share relay. */

import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

const CONFIG_API = "/aaalice/discord-share/config";
const SESSION_STORAGE_KEY = "aaalice.discord-share.session.v1";
const TARGET_STORAGE_KEY = "aaalice.discord-share.targets.v1";
const PROMPT_FILE_STORAGE_KEY = "aaalice.discord-share.long-prompt-as-file.v1";
const DEFAULT_PROMPT_FILE_PREFERENCE = true;
const AUTH_MESSAGE_TYPE = "AAALICE_DISCORD_SHARE_AUTH";

export class DiscordShareClientError extends Error {
	constructor(message, { code = "unknown", status = 0, detail = null } = {}) {
		super(message);
		this.name = "DiscordShareClientError";
		this.code = code;
		this.status = status;
		this.detail = detail;
	}
}

function normalizedRelayUrl(value) {
	const raw = String(value || "").trim().replace(/\/+$/, "");
	if (!raw) return "";
	const url = new URL(raw);
	if (!["https:", "http:"].includes(url.protocol)) throw new Error("Discord share relay must use HTTP or HTTPS");
	return url.href.replace(/\/$/, "");
}

async function responsePayload(response) {
	const type = response.headers.get("content-type") || "";
	if (type.includes("application/json")) return response.json();
	return { message: await response.text() };
}

async function checkedJson(response) {
	const payload = await responsePayload(response);
	if (!response.ok) {
		throw new DiscordShareClientError(payload?.message || `HTTP ${response.status}`, {
			code: payload?.code || "request_failed",
			status: response.status,
			detail: payload,
		});
	}
	return payload;
}

export async function loadDiscordShareConfig() {
	const response = await fetch(CONFIG_API, { headers: { Accept: "application/json" } });
	const payload = await checkedJson(response);
	return {
		enabled: Boolean(payload.enabled),
		relayUrl: normalizedRelayUrl(payload.relay_url),
		communityUrl: String(payload.community_url || ""),
	};
}

export function loadDiscordShareSession() {
	try {
		const value = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
		if (!value?.token) return null;
		return {
			token: String(value.token),
			user: value.user && typeof value.user === "object" ? value.user : null,
		};
	} catch {
		return null;
	}
}

export function saveDiscordShareSession(value) {
	if (!value?.token) {
		localStorage.removeItem(SESSION_STORAGE_KEY);
		return null;
	}
	const normalized = { token: String(value.token), user: value.user || null };
	localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized));
	return normalized;
}

export function clearDiscordShareSession() {
	localStorage.removeItem(SESSION_STORAGE_KEY);
}

function normalizedTargets(value) {
	if (!Array.isArray(value)) return [];
	const ids = new Set();
	return value.flatMap((entry) => {
		const id = String(entry?.id || "").trim();
		const label = String(entry?.label || "").trim();
		if (!id || !label || ids.has(id)) return [];
		ids.add(id);
		return [{
			id,
			label,
			default: Boolean(entry.default),
			preferPromptFile: Boolean(entry.prefer_prompt_file),
		}];
	});
}

export async function loadDiscordShareTargets(config, session) {
	if (!config?.relayUrl) throw new DiscordShareClientError("Discord share relay is unavailable", { code: "not_configured" });
	if (!session?.token) throw new DiscordShareClientError("Discord authorization is required", { code: "unauthorized", status: 401 });
	const response = await fetch(`${config.relayUrl}/v1/targets`, {
		headers: authorizationHeaders(session),
	});
	try {
		const payload = await checkedJson(response);
		const targets = normalizedTargets(payload?.targets);
		if (!targets.length) throw new DiscordShareClientError("No Discord share channels are available", { code: "no_targets" });
		return targets;
	} catch (error) {
		if ([401, 403].includes(error.status)) clearDiscordShareSession();
		throw error;
	}
}

export function loadDiscordShareTargetSelection(targets) {
	const available = new Set(targets.map((target) => target.id));
	try {
		const saved = JSON.parse(localStorage.getItem(TARGET_STORAGE_KEY) || "[]");
		const selected = Array.isArray(saved) ? [...new Set(saved.map(String).filter((id) => available.has(id)))] : [];
		if (selected.length) return selected;
	} catch {
		// Invalid local state falls back to relay defaults.
	}
	const defaults = targets.filter((target) => target.default).map((target) => target.id);
	return defaults.length ? defaults : targets.slice(0, 1).map((target) => target.id);
}

export function saveDiscordShareTargetSelection(values, targets) {
	const available = new Set(targets.map((target) => target.id));
	const selected = [...new Set((values || []).map(String).filter((id) => available.has(id)))];
	localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(selected));
	return selected;
}

export function loadDiscordSharePromptFilePreference() {
	const stored = localStorage.getItem(PROMPT_FILE_STORAGE_KEY);
	if (stored == null) return DEFAULT_PROMPT_FILE_PREFERENCE;
	return stored !== "false";
}

export function saveDiscordSharePromptFilePreference(value) {
	const enabled = Boolean(value);
	localStorage.setItem(PROMPT_FILE_STORAGE_KEY, String(enabled));
	return enabled;
}

function base64Url(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomOAuthVerifier() {
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	return base64Url(bytes);
}

async function oauthChallenge(verifier) {
	const bytes = new TextEncoder().encode(verifier);
	const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
	return base64Url(new Uint8Array(digest));
}

function authorizationHeaders(session) {
	return {
		Accept: "application/json",
		Authorization: `Bearer ${session.token}`,
	};
}

export async function verifyDiscordShareSession(config, session = loadDiscordShareSession()) {
	if (!config?.relayUrl || !session?.token) return null;
	const response = await fetch(`${config.relayUrl}/v1/session`, {
		headers: authorizationHeaders(session),
	});
	try {
		const payload = await checkedJson(response);
		return saveDiscordShareSession({ token: session.token, user: payload.user || session.user });
	} catch (error) {
		if ([401, 403].includes(error.status)) clearDiscordShareSession();
		throw error;
	}
}

export async function beginDiscordShareAuthentication(config) {
	if (!config?.relayUrl) throw new DiscordShareClientError("Discord share relay is unavailable", { code: "not_configured" });
	const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const popup = window.open("about:blank", "aaalice-discord-share-auth", "popup,width=560,height=720,resizable=yes,scrollbars=yes");
	if (!popup) throw new DiscordShareClientError("The browser blocked the Discord sign-in window", { code: "popup_blocked" });
	let verifier;
	let challenge;
	try {
		verifier = randomOAuthVerifier();
		challenge = await oauthChallenge(verifier);
	} catch (error) {
		popup.close();
		throw new DiscordShareClientError("The browser could not secure the Discord verification request", {
			code: "oauth_crypto_unavailable",
			detail: error,
		});
	}
	const authorizeUrl = new URL(`${config.relayUrl}/v1/oauth/start`);
	authorizeUrl.searchParams.set("origin", window.location.origin);
	authorizeUrl.searchParams.set("nonce", nonce);
	authorizeUrl.searchParams.set("challenge", challenge);
	popup.location.replace(authorizeUrl.href);
	return new Promise((resolve, reject) => {
		let settled = false;
		let pollInFlight = false;
		let popupClosedAt = 0;
		const relayOrigin = new URL(config.relayUrl).origin;
		const finish = (callback, value) => {
			if (settled) return;
			settled = true;
			clearInterval(pollTimer);
			clearTimeout(timeoutTimer);
			window.removeEventListener("message", onMessage);
			try { popup.close(); } catch { /* The popup may already be closed. */ }
			callback(value);
		};
		const applyResult = (result) => {
			if (!result || result.type !== AUTH_MESSAGE_TYPE || result.nonce !== nonce) return false;
			if (result.ok && result.token) {
				finish(resolve, saveDiscordShareSession({ token: result.token, user: result.user || null }));
				return true;
			}
			finish(reject, new DiscordShareClientError(result.message || "Discord authorization failed", {
				code: result.code || "authorization_failed",
				status: Number(result.status) || 0,
				detail: result,
			}));
			return true;
		};
		const onMessage = (event) => {
			if (event.source !== popup || event.origin !== relayOrigin || event.data?.type !== AUTH_MESSAGE_TYPE || event.data?.nonce !== nonce) return;
			applyResult(event.data);
		};
		const pollResult = async () => {
			if (settled || pollInFlight) return;
			pollInFlight = true;
			try {
				const response = await fetch(`${config.relayUrl}/v1/oauth/result`, {
					method: "POST",
					headers: { Accept: "application/json", "Content-Type": "application/json" },
					body: JSON.stringify({ nonce, verifier }),
				});
				const result = await checkedJson(response);
				if (!result.pending) applyResult(result);
				if (popup.closed) {
					popupClosedAt ||= Date.now();
					if (result.pending && Date.now() - popupClosedAt > 3000) {
						finish(reject, new DiscordShareClientError("Discord authorization was cancelled", { code: "cancelled" }));
					}
				} else {
					popupClosedAt = 0;
				}
			} catch (error) {
				if (error.status >= 400 && error.status < 500) finish(reject, error);
			} finally {
				pollInFlight = false;
			}
		};
		const pollTimer = setInterval(() => void pollResult(), 700);
		const timeoutTimer = setTimeout(() => {
			finish(reject, new DiscordShareClientError("Discord authorization timed out", { code: "timeout" }));
		}, 5 * 60 * 1000);
		window.addEventListener("message", onMessage);
		void pollResult();
	});
}

function imageReferenceUrl(reference) {
	const query = new URLSearchParams({
		filename: reference.filename,
		subfolder: reference.subfolder || "",
		type: reference.type || "output",
	});
	return api.apiURL(`/view?${query}${app.getRandParam?.() || ""}`);
}

export async function sendDiscordShare(config, session, {
	image,
	prompt,
	targetIds = [],
	longPromptAsFile = true,
}) {
	if (!config?.relayUrl) throw new DiscordShareClientError("Discord share relay is unavailable", { code: "not_configured" });
	if (!session?.token) throw new DiscordShareClientError("Discord authorization is required", { code: "unauthorized", status: 401 });
	const imageResponse = await fetch(imageReferenceUrl(image));
	if (!imageResponse.ok) throw new DiscordShareClientError(`Could not read image (${imageResponse.status})`, { code: "image_unavailable" });
	const blob = await imageResponse.blob();
	const body = new FormData();
	body.append("image", blob, image.filename);
	body.append("prompt", String(prompt || ""));
	body.append("filename", image.filename);
	body.append("width", String(image.width || ""));
	body.append("height", String(image.height || ""));
	for (const targetId of [...new Set(targetIds.map(String).filter(Boolean))]) body.append("target", targetId);
	body.append("long_prompt_as_file", String(Boolean(longPromptAsFile)));
	const response = await fetch(`${config.relayUrl}/v1/share`, {
		method: "POST",
		headers: { Authorization: `Bearer ${session.token}` },
		body,
	});
	try {
		return await checkedJson(response);
	} catch (error) {
		if ([401, 403].includes(error.status)) clearDiscordShareSession();
		throw error;
	}
}

export async function disconnectDiscordShare(config, session = loadDiscordShareSession()) {
	clearDiscordShareSession();
	if (!config?.relayUrl || !session?.token) return;
	try {
		await fetch(`${config.relayUrl}/v1/session`, {
			method: "DELETE",
			headers: authorizationHeaders(session),
		});
	} catch (error) {
		console.warn("[Aaalice] Discord share session could not be revoked remotely.", error);
	}
}
